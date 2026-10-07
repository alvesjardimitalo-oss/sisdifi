// SISDIFI — estado compartilhado entre as telas (preenchido em tempo real pelo Firestore)
import { PARAMETROS_PADRAO, GRUPOS } from './calculo.js';

export const TIPOS_DESPESA_PADRAO = [
  'Combustível', 'Táxi', 'Uber', 'Mototáxi', 'Pedágio', 'Estacionamento',
  'Passagem de Ônibus', 'Passagem de Trem', 'Alimentação', 'Hospedagem', 'Outros'
];

export const CONFIG_PADRAO = {
  ...PARAMETROS_PADRAO,
  orgao: 'PREFEITURA MUNICIPAL DE FREI INOCÊNCIO',
  lei: 'Lei Ordinária nº 994, de 14 de abril de 2025',
  origem: { cidade: 'Frei Inocêncio', uf: 'MG' },
  tipos_despesa: TIPOS_DESPESA_PADRAO,
  contas_pagamento: [],
  fontes_recursos: []
};

export const PERFIS = {
  admin: 'Administrador',
  operador: 'Contabilidade',
  controle_interno: 'Controle Interno',
  secretaria: 'Secretaria (solicitante)',
  consulta: 'Somente consulta'
};

// Etapas da solicitação (tramitação). "legado" = importada do sistema antigo, sem tramitação registrada.
export const ETAPAS = {
  analise:    { nome: 'Aguardando Controle Interno', curto: 'Em análise', ordem: 1 },
  reprovada:  { nome: 'Reprovada pelo Controle Interno', curto: 'Reprovada', ordem: 0 },
  aprovada:   { nome: 'Aprovada pelo Controle Interno — aguardando cálculo e ficha da Contabilidade', curto: 'Aguard. cálculo', ordem: 2 },
  calculada:  { nome: 'Calculada — aguardando assinatura do Prefeito', curto: 'Aguard. Prefeito', ordem: 3 },
  autorizada: { nome: 'Autorizada pelo Prefeito — aguardando empenho', curto: 'Aguard. empenho', ordem: 4 },
  empenhada:  { nome: 'Empenhada — aguardando liquidação', curto: 'Empenhada', ordem: 5 },
  liquidada:  { nome: 'Liquidada — aguardando pagamento', curto: 'Liquidada', ordem: 6 },
  paga:       { nome: 'Paga', curto: 'Paga', ordem: 7 },
  legado:     { nome: 'Registro do sistema antigo', curto: 'Histórico', ordem: 8 }
};
export const etapaDe = sol => sol.etapa || 'legado';

export const estado = {
  sessao: null,          // { uid, email, nome, perfil }
  servidores: [],
  secretarias: [],
  solicitacoes: [],
  solicitacoesBrutas: [],
  fichas: [],
  orcamentos: [],
  distancias: {},        // chave → { cidade, uf, km }
  config: structuredClone(CONFIG_PADRAO),
  usuarios: [],
  prontos: new Set()     // coleções já carregadas
};

export function mesclarConfig(doc) {
  const c = structuredClone(CONFIG_PADRAO);
  if (!doc) return c;
  for (const k of ['alimentacao', 'orgao', 'lei', 'origem', 'tipos_despesa', 'contas_pagamento', 'fontes_recursos']) if (doc[k] !== undefined) c[k] = doc[k];
  if (doc.valores) {
    for (const g of Object.keys(GRUPOS)) for (const t of ['SIMPLES', 'PERNOITE']) for (const f of ['0_149', '150_300', 'ACIMA_300']) {
      const v = doc.valores?.[g]?.[t]?.[f];
      if (typeof v === 'number') c.valores[g][t][f] = v;
    }
  }
  return c;
}

const perfilAtual = () => estado.sessao?.perfil;
export const ehSecretaria = () => perfilAtual() === 'secretaria';
// Secretaria e Controle Interno só trabalham com as solicitações (sem cadastros, sem valores)
export const acessoRestrito = () => ['secretaria', 'controle_interno'].includes(perfilAtual());
export const pode = {
  // cadastros (servidores, secretarias) — Controle Interno NÃO altera tabelas do sistema
  editar: () => ['admin', 'operador'].includes(perfilAtual()),
  // criar/editar solicitações (antes da aprovação)
  solicitar: () => ['admin', 'operador', 'secretaria'].includes(perfilAtual()),
  // valores de diária: Secretaria e Controle Interno não veem (o valor só é calculado na Contabilidade)
  verValores: () => !['secretaria', 'controle_interno'].includes(perfilAtual()),
  // Controle Interno: apenas aprova ou reprova (confere servidor, período, conta e fonte)
  analisar: () => ['admin', 'controle_interno'].includes(perfilAtual()),
  // ficha, empenho, liquidação, pagamento e reembolsos
  contabil: () => ['admin', 'operador'].includes(perfilAtual()),
  // relatório mensal com valores: quem vê valores + Controle Interno (só das solicitações já empenhadas)
  relatorio: () => ['admin', 'operador', 'consulta', 'controle_interno'].includes(perfilAtual()),
  // orçamento (PDFs e fichas): Contabilidade gerencia; Secretaria consulta o da própria pasta
  orcamento: () => ['admin', 'operador', 'consulta', 'secretaria'].includes(perfilAtual()),
  admin: () => perfilAtual() === 'admin'
};

export const porId = (lista, id) => estado[lista].find(x => x.id === id) || null;

export function secretariaNome(id) {
  return porId('secretarias', id)?.nome || '';
}

/** Total de reembolsos de uma solicitação. */
export function totalReembolsos(sol) {
  return (sol.reembolsos || []).reduce((s, r) => s + Number(r.valor || 0), 0);
}

/** Solicitações válidas (não canceladas). */
export const ativas = lista => lista.filter(s => s.status !== 'cancelada');

/**
 * Campos com valores da diária. Ficam na coleção protegida "valores" (mesmo id da solicitação),
 * que Secretaria e Controle Interno não conseguem ler. O app junta os dois ao exibir.
 */
export const CAMPOS_VALOR = ['valor_total', 'valor_pernoite', 'valor_simples', 'valor_alimentacao', 'quantidade_pernoite',
  'quantidade_simples', 'quantidade_alimentacao', 'horas_total', 'faixa_codigo', 'faixa_texto', 'descricao_calculo',
  'justificativa_legal', 'reembolsos', 'total_reembolsos', 'liberado_ci'];

/** Etapas a partir do empenho: os valores ficam liberados para o relatório do Controle Interno. */
export const ETAPAS_EMPENHADAS = ['empenhada', 'liquidada', 'paga'];

export function separarValores(dados) {
  const base = {}, val = {};
  for (const [k, v] of Object.entries(dados)) (CAMPOS_VALOR.includes(k) ? val : base)[k] = v;
  return { base, val };
}
