// SISDIFI — Folha de pagamentos: regras do fluxo em etapas.
//
// Arquivos do RH → nº do primeiro empenho → saldo das contas → ficha, fonte e
// conta de cada empenho (descontando do saldo) → confirmar a folha → descontos
// de consignados e pensões por fonte, levados para Consignações por mês.
//
// Tudo aqui é cálculo puro (sem tela e sem banco), em centavos inteiros.

import { DESTINOS } from './minuta-pdf.js';

/** Categoria do desconto na folha → nome do destino na tela de consignações. */
export const CATEGORIA_PARA_DESTINO = {
  Caixa: DESTINOS[0], Sicoob: DESTINOS[1], Bradesco: DESTINOS[2], Pensao: DESTINOS[3]
};
const CATEGORIAS = Object.keys(CATEGORIA_PARA_DESTINO);

const texto = v => String(v ?? '').trim();
/** Fonte no padrão do orçamento: 1.500.000.0000. Aceita 1500, 15000000000 etc. */
export function normalizarFonte(f) {
  const s = texto(f);
  if (!s) return '';
  const d = s.replace(/\D/g, '');
  if (/^\d\.\d{3}\.\d{3}\.\d{4}$/.test(s)) return s;
  if (d.length === 4) return d[0] + '.' + d.slice(1) + '.000.0000';
  if (d.length === 11) return d[0] + '.' + d.slice(1, 4) + '.' + d.slice(4, 7) + '.' + d.slice(7);
  return s;
}
const mesmaFonte = (a, b) => !!a && !!b && normalizarFonte(a) === normalizarFonte(b);

/** Cria o identificador estável de uma conta cadastrada. */
export function novaContaId(contas = []) {
  let n = contas.length + 1;
  const usados = new Set(contas.map(c => c.id));
  while (usados.has('c' + n)) n++;
  return 'c' + n;
}

export function rotuloConta(c) {
  if (!c) return '';
  return [texto(c.nome), texto(c.numero)].filter(Boolean).join(' · ');
}

/**
 * Deduz o BRUTO de cada empenho do saldo da conta escolhida, na ordem dos
 * empenhos. Devolve a situação de cada conta e o saldo depois de cada empenho.
 * Saldo não informado (campo vazio) é diferente de zero: a conta fica pendente.
 */
export function saldosDasContas(contas = [], saldos = {}, empenhos = []) {
  const porId = new Map(contas.map(c => [c.id, {
    ...c, saldo: Number.isSafeInteger(saldos[c.id]) ? saldos[c.id] : null,
    utilizado: 0, empenhos: []
  }]));
  const apos = {}, semConta = [], contaInexistente = [];
  for (const e of empenhos) {
    const id = texto(e.contaId);
    if (!id) { semConta.push(e); continue; }
    const c = porId.get(id);
    if (!c) { contaInexistente.push(e); continue; }
    c.utilizado += e.bruto || 0;
    c.empenhos.push(e.empenho);
    apos[e.id] = c.saldo == null ? null : c.saldo - c.utilizado;
  }
  const lista = [...porId.values()].map(c => ({
    ...c, restante: c.saldo == null ? null : c.saldo - c.utilizado,
    insuficiente: c.saldo != null && c.saldo - c.utilizado < 0,
    semSaldo: c.saldo == null
  }));
  return {
    contas: lista, apos, semConta, contaInexistente,
    totalSaldo: lista.reduce((s, c) => s + (c.saldo || 0), 0),
    totalUtilizado: lista.reduce((s, c) => s + c.utilizado, 0),
    insuficientes: lista.filter(c => c.insuficiente),
    semSaldo: lista.filter(c => c.semSaldo && c.utilizado > 0)
  };
}

/** Avisos da conta escolhida para um empenho (não altera nada). */
/* Uma conta pode pagar mais de uma fonte: o Custeio SUS paga a 1600 e a dos
   agentes, 1604 ("1600, 1604"). */
export const fontesDaContaTexto = f => String(f || '').split(/[,;/]|\s+e\s+/).map(x => x.trim()).filter(Boolean);
export const contaTemFonte = (conta, fonte) => fontesDaContaTexto(conta?.fonte).some(f => mesmaFonte(f, fonte));

export function avisosDaConta(empenho, conta) {
  if (!empenho.contaId) return ['Escolher a conta bancária'];
  if (!conta) return ['A conta escolhida não está mais cadastrada'];
  const avisos = [];
  if (conta.fonte && empenho.fonte && !contaTemFonte(conta, empenho.fonte))
    avisos.push('A fonte do empenho (' + empenho.fonte + ') é diferente da fonte da conta (' + conta.fonte + ')');
  return avisos;
}

/** Conta sugerida para uma fonte: só quando existe exatamente uma conta com ela. */
export function contaParaFonte(contas = [], fonte) {
  const achadas = contas.filter(c => contaTemFonte(c, fonte));
  return achadas.length === 1 ? achadas[0] : null;
}

/**
 * Descontos de consignados e pensões por banco e fonte de recurso do empenho.
 * Uma linha por combinação banco + fonte completa: é a OP extraorçamentária.
 */
export function consignadosPorFonte(empenhos = []) {
  const mapa = new Map(), pendentes = [];
  for (const e of empenhos) {
    for (const cat of CATEGORIAS) {
      const valor = e.bancos?.[cat] || 0;
      if (!valor) continue;
      const destino = CATEGORIA_PARA_DESTINO[cat];
      const fonteCompleta = normalizarFonte(e.fonte);
      const item = { empenho: e.empenho, tipo: e.tipo, lotacao: e.lotacao, secretaria: e.secretaria || '',
        ficha: e.ficha || '', valor };
      if (!fonteCompleta) { pendentes.push({ ...item, destino }); continue; }
      const chave = destino + '|' + fonteCompleta;
      if (!mapa.has(chave)) mapa.set(chave, { destino, categoria: cat, fonteCompleta,
        fonte: fonteCompleta.replace(/\D/g, '').slice(0, 4), total: 0, empenhos: [] });
      const g = mapa.get(chave);
      g.total += valor;
      g.empenhos.push(item);
    }
  }
  const itens = [...mapa.values()].sort((a, b) =>
    DESTINOS.indexOf(a.destino) - DESTINOS.indexOf(b.destino)
    || a.fonteCompleta.localeCompare(b.fonteCompleta, 'pt-BR', { numeric: true }));
  const totais = Object.fromEntries(DESTINOS.map(d => [d, 0]));
  for (const g of itens) totais[g.destino] += g.total;
  for (const p of pendentes) totais[p.destino] += p.valor;
  return { itens, pendentes, totais, total: Object.values(totais).reduce((s, v) => s + v, 0) };
}

/**
 * Situação de cada etapa. `pronta` libera a próxima; `pendencias` explica o que
 * falta, em português, para a tela mostrar sem interpretar.
 */
export function etapasDaFolha({ arquivos = {}, primeiro, contas = [], saldos = {}, previsao, maternidade, alertas = [], avisosArquivos = [], conferiuFichas = false }) {
  const temFolha = Object.values(arquivos).some(a => a?.registros?.length);
  const e1 = [];
  if (!temFolha) e1.push('Envie o Resumo de Verbas da folha mensal');
  if (temFolha && !arquivos.principal) e1.push('Falta o Resumo de Verbas da folha mensal');
  if (maternidade?.avisos?.length) e1.push('Confirme as servidoras com salário-maternidade (' + maternidade.avisos.length + ' aviso(s))');
  if (alertas.length || avisosArquivos.length) e1.push('Revise os ' + (alertas.length + avisosArquivos.length) + ' aviso(s) da leitura dos PDFs');

  const e2 = [];
  if (!Number.isSafeInteger(Number(primeiro)) || Number(primeiro) < 1) e2.push('Informe o número do primeiro empenho');

  const e3 = [];
  if (!contas.length) e3.push('Cadastre ao menos uma conta bancária');
  const semSaldo = contas.filter(c => !Number.isSafeInteger(saldos[c.id]));
  if (semSaldo.length) e3.push('Informe o saldo de ' + semSaldo.map(rotuloConta).join(', '));
  const semFonte = contas.filter(c => !texto(c.fonte));
  if (semFonte.length) e3.push('Informe a fonte de ' + semFonte.map(rotuloConta).join(', '));

  const e4 = [];
  const empenhos = previsao?.empenhos || [];
  const situacao = saldosDasContas(contas, saldos, empenhos);
  const semFicha = empenhos.filter(e => !e.ficha || !e.fonte).length;
  if (semFicha) e4.push(semFicha + ' empenho(s) sem ficha ou fonte');
  if (situacao.semConta.length) e4.push(situacao.semConta.length + ' empenho(s) sem conta bancária');
  if (situacao.contaInexistente.length) e4.push(situacao.contaInexistente.length + ' empenho(s) com conta que não está cadastrada');
  const fonteDiferente = empenhos.filter(e => {
    const c = contas.find(x => x.id === e.contaId);
    return c && avisosDaConta(e, c).length;
  }).length;
  if (fonteDiferente) e4.push(fonteDiferente + ' empenho(s) com fonte diferente da conta');
  const outros = empenhos.filter(e => (e.problemas || []).some(p => !/^Informar ficha e fonte/.test(p))).length;
  if (outros) e4.push(outros + ' empenho(s) com outras pendências da folha');
  if (!conferiuFichas && empenhos.length) e4.push('Marque que conferiu fichas e fontes na LOA');

  const etapas = [
    { id: 'arquivos', titulo: 'Arquivos do RH', pendencias: e1 },
    { id: 'numero', titulo: 'Primeiro empenho', pendencias: e2 },
    { id: 'saldos', titulo: 'Saldo das contas', pendencias: e3 },
    { id: 'fichas', titulo: 'Ficha, fonte e conta', pendencias: e4 }
  ].map(x => ({ ...x, pronta: !x.pendencias.length }));
  return { etapas, situacao, podeConfirmar: temFolha && etapas.every(x => x.pronta) };
}

/** Assinatura dos valores confirmados: muda se qualquer empenho mudar. */
export function assinaturaDaFolha(empenhos = [], contas = [], saldos = {}) {
  const base = JSON.stringify([
    empenhos.map(e => [e.empenho, e.id, e.ficha, e.fonte, e.contaId, e.bruto, e.descontoAjustado, e.liquido,
      CATEGORIAS.map(k => e.bancos?.[k] || 0)]),
    contas.map(c => [c.id, c.fonte, saldos[c.id] ?? null])
  ]);
  let h = 2166136261;
  for (let i = 0; i < base.length; i++) { h ^= base.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

/** Pacote gravado em Consignações por mês quando a folha é confirmada. */
export function previstoParaConsignacoes(previsao, { competencia, confirmadaEm = new Date().toISOString(), assinatura = '' } = {}) {
  const c = consignadosPorFonte(previsao?.empenhos || []);
  return {
    competencia, confirmadaEm, assinatura,
    primeiro: previsao?.primeiro ?? null, ultimo: previsao?.ultimo ?? null,
    itens: c.itens, pendentes: c.pendentes, totais: c.totais, total: c.total
  };
}

/**
 * Compara o previsto pela folha com as minutas, por banco e fonte completa.
 * `minutas` é o resultado de agruparOPsPorBancoFonte(arquivos).itens.
 */
export function compararPrevistoComMinutas(previsto, minutas = []) {
  if (!previsto) return [];
  const linhas = new Map();
  const chave = (d, f) => d + '|' + normalizarFonte(f);
  for (const g of previsto.itens || [])
    linhas.set(chave(g.destino, g.fonteCompleta), { destino: g.destino, fonteCompleta: g.fonteCompleta,
      folha: g.total, minuta: 0, empenhos: g.empenhos.length, guias: 0 });
  for (const g of minutas) {
    const k = chave(g.destino, g.fonteCompleta);
    if (!linhas.has(k)) linhas.set(k, { destino: g.destino, fonteCompleta: g.fonteCompleta, folha: 0, minuta: 0, empenhos: 0, guias: 0 });
    const l = linhas.get(k);
    l.minuta += g.total; l.guias += g.guias || 0;
  }
  return [...linhas.values()].map(l => ({ ...l, diferenca: l.minuta - l.folha }))
    .sort((a, b) => DESTINOS.indexOf(a.destino) - DESTINOS.indexOf(b.destino)
      || a.fonteCompleta.localeCompare(b.fonteCompleta, 'pt-BR', { numeric: true }));
}

function dinheiro(c) {
  return (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
