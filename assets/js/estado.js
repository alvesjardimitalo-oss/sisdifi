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
  tipos_despesa: TIPOS_DESPESA_PADRAO
};

export const PERFIS = {
  admin: 'Administrador',
  operador: 'Operador',
  consulta: 'Somente consulta'
};

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
  for (const k of ['alimentacao', 'orgao', 'lei', 'origem', 'tipos_despesa']) if (doc[k] !== undefined) c[k] = doc[k];
  if (doc.valores) {
    for (const g of Object.keys(GRUPOS)) for (const t of ['SIMPLES', 'PERNOITE']) for (const f of ['0_149', '150_300', 'ACIMA_300']) {
      const v = doc.valores?.[g]?.[t]?.[f];
      if (typeof v === 'number') c.valores[g][t][f] = v;
    }
  }
  return c;
}

export const pode = {
  editar: () => ['admin', 'operador'].includes(estado.sessao?.perfil),
  admin: () => estado.sessao?.perfil === 'admin'
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
