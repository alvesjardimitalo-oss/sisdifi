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
  consulta: 'Somente consulta'
};

// Etapas da solicitação (tramitação). "legado" = importada do sistema antigo, sem tramitação registrada.
export const ETAPAS = {
  analise:    { nome: 'Aguardando Controle Interno', curto: 'Em análise', ordem: 1 },
  reprovada:  { nome: 'Reprovada pelo Controle Interno', curto: 'Reprovada', ordem: 0 },
  aprovada:   { nome: 'Aprovada — aguardando assinatura do Prefeito', curto: 'Aguard. Prefeito', ordem: 2 },
  autorizada: { nome: 'Autorizada pelo Prefeito — aguardando empenho', curto: 'Aguard. empenho', ordem: 3 },
  empenhada:  { nome: 'Empenhada — aguardando liquidação', curto: 'Empenhada', ordem: 4 },
  liquidada:  { nome: 'Liquidada — aguardando pagamento', curto: 'Liquidada', ordem: 5 },
  paga:       { nome: 'Paga', curto: 'Paga', ordem: 6 },
  legado:     { nome: 'Registro do sistema antigo', curto: 'Histórico', ordem: 7 }
};
export const etapaDe = sol => sol.etapa || 'legado';

export const estado = {
  sessao: null,          // { uid, email, nome, perfil }
  servidores: [],
  secretarias: [],
  solicitacoes: [],
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
export const pode = {
  // cadastros (servidores, secretarias) — Controle Interno NÃO altera tabelas do sistema
  editar: () => ['admin', 'operador'].includes(perfilAtual()),
  // criar/editar solicitações (antes da aprovação)
  solicitar: () => ['admin', 'operador', 'controle_interno'].includes(perfilAtual()),
  // aprovar/reprovar, conta de pagamento e fonte, registrar assinatura do Prefeito
  analisar: () => ['admin', 'controle_interno'].includes(perfilAtual()),
  // ficha, empenho, liquidação, pagamento e reembolsos
  contabil: () => ['admin', 'operador'].includes(perfilAtual()),
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
