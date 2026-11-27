// Lança a folha na planilha Google da Contabilidade ("Nova Folha 2026").
//
// Escreve direto na aba do mês (NOVEMBRO, OUTUBRO…), a partir da linha 4, nas
// colunas que a Contabilidade já usa — ver linhasDaPlanilha() em
// folha-lancamento.js. A chamada sai do navegador para a API do Google com o
// token da conta que edita a planilha; o SISDIFI não guarda esse token.
import { COLUNAS_DINHEIRO_PLANILHA, INICIO_ITENS_PLANILHA, ROTULOS_ITENS_PLANILHA } from './folha-lancamento.js';

const API = 'https://sheets.googleapis.com/v4/spreadsheets/';
export const MESES_ABA = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO',
  'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
export const PRIMEIRA_LINHA = 4;

/** ID da planilha a partir do link colado (ou o próprio ID). */
export function idDaPlanilha(texto = '') {
  const t = String(texto).trim();
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(t) ? t : '';
}

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
/** Aba do mês da competência ('2026-11' → a aba chamada "NOVEMBRO" ou "Novembro"). */
export function abaDoMes(titulos = [], competencia = '') {
  const mes = MESES_ABA[Number(String(competencia).slice(5, 7)) - 1];
  if (!mes) return '';
  return titulos.find(t => semAcento(t) === semAcento(mes)) || '';
}

/** Coluna em letra (0 → A). */
export const letraColuna = i => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };

/** Valores para a API: dinheiro em reais (número), o resto como texto. */
export function valoresParaAPI(linhas = []) {
  return linhas.map(l => l.map((v, i) => {
    if (v == null) return '';
    if (COLUNAS_DINHEIRO_PLANILHA.has(i) && typeof v === 'number') return v / 100;
    return v;
  }));
}

async function chamar(url, token, opcoes = {}) {
  const r = await fetch(url, { ...opcoes, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(opcoes.headers || {}) } });
  if (!r.ok) {
    let msg = '';
    try { msg = (await r.json())?.error?.message || ''; } catch (e) { /* sem corpo */ }
    if (r.status === 403) throw Error('Sem permissão para editar esta planilha com a conta escolhida. ' + msg);
    if (r.status === 404) throw Error('Planilha não encontrada. Confira o link.');
    throw Error('Google Planilhas respondeu ' + r.status + (msg ? ': ' + msg : ''));
  }
  return r.json();
}

const citar = aba => "'" + String(aba).replace(/'/g, "''") + "'";
const LINHA_CABECALHO = PRIMEIRA_LINHA - 1;
/** Coluna do histórico (0 = A): V, logo depois do líquido. */
const COLUNA_HISTORICO = INICIO_ITENS_PLANILHA + ROTULOS_ITENS_PLANILHA.length + 6;

/** Abas da planilha, a do mês, quantos empenhos ela já tem e se já tem as colunas dos itens. */
export async function situacaoDaPlanilha(token, planilhaId, competencia) {
  const info = await chamar(API + planilhaId + '?fields=properties.title,sheets.properties(sheetId,title)', token);
  const abas = (info.sheets || []).map(s => s.properties);
  const aba = abaDoMes(abas.map(a => a.title), competencia);
  const base = { titulo: info.properties?.title || '', titulos: abas.map(a => a.title), aba, sheetId: null, preenchidas: 0, temItens: false };
  if (!aba) return base;
  const sheetId = abas.find(a => a.title === aba).sheetId;
  const fim = letraColuna(INICIO_ITENS_PLANILHA + ROTULOS_ITENS_PLANILHA.length - 1);
  const q = ['B' + PRIMEIRA_LINHA + ':B1000', letraColuna(INICIO_ITENS_PLANILHA) + LINHA_CABECALHO + ':' + fim + LINHA_CABECALHO]
    .map(r => 'ranges=' + encodeURIComponent(citar(aba) + '!' + r)).join('&');
  const v = await chamar(API + planilhaId + '/values:batchGet?' + q, token);
  const [empenhos, cab] = (v.valueRanges || []).map(x => x.values || []);
  const preenchidas = (empenhos || []).filter(r => String(r[0] || '').trim()).length;
  return { ...base, sheetId, preenchidas, temItens: itensNoCabecalho(cab?.[0]) };
}

/** O cabeçalho já tem INSS, Caixa… logo depois do desconto da liquidação? */
export function itensNoCabecalho(linha = []) {
  const n = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  return ROTULOS_ITENS_PLANILHA.every((r, i) => n(linha[i]) === n(r));
}

/**
 * Pedidos para preparar a aba: abre as colunas dos itens do desconto logo
 * depois do H, escreve o cabeçalho delas e as agrupa, fechadas, com o "+"
 * antes do grupo — ao lado do desconto da liquidação. Inserir colunas empurra
 * o resto para a direita, e as fórmulas da aba (totais, "valor bateu") se
 * ajustam sozinhas.
 */
export function pedidosParaItens(sheetId) {
  const range = { sheetId, dimension: 'COLUMNS', startIndex: INICIO_ITENS_PLANILHA,
    endIndex: INICIO_ITENS_PLANILHA + ROTULOS_ITENS_PLANILHA.length };
  return [
    { insertDimension: { range, inheritFromBefore: true } },
    { updateCells: { start: { sheetId, rowIndex: LINHA_CABECALHO - 1, columnIndex: INICIO_ITENS_PLANILHA },
      rows: [{ values: ROTULOS_ITENS_PLANILHA.map(r => ({ userEnteredValue: { stringValue: r } })) }],
      fields: 'userEnteredValue' } },
    { addDimensionGroup: { range } },
    { updateDimensionGroup: { dimensionGroup: { range, depth: 1, collapsed: true }, fields: 'collapsed' } },
    { updateSheetProperties: { properties: { sheetId, gridProperties: { columnGroupControlAfter: false } },
      fields: 'gridProperties.columnGroupControlAfter' } },
    // Depois do líquido: histórico, total líquido do Resumo de Verbas (em R$) e conferência.
    { updateCells: { start: { sheetId, rowIndex: LINHA_CABECALHO - 1, columnIndex: COLUNA_HISTORICO },
      rows: [{ values: ['Histórico', 'Resumo RH', 'Conferência'].map(r => ({ userEnteredValue: { stringValue: r },
        userEnteredFormat: { textFormat: { bold: true } } })) }],
      fields: 'userEnteredValue,userEnteredFormat.textFormat.bold' } },
    { repeatCell: { range: { sheetId, startRowIndex: PRIMEIRA_LINHA - 1, endRowIndex: 1000,
      startColumnIndex: COLUNA_HISTORICO + 1, endColumnIndex: COLUNA_HISTORICO + 2 },
      cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"R$" #,##0.00' } } },
      fields: 'userEnteredFormat.numberFormat' } }
  ];
}

/** Prepara a aba do mês, se ainda não tiver as colunas dos itens. */
export async function prepararAba(token, planilhaId, sit) {
  if (sit.temItens) return false;
  await chamar(API + planilhaId + ':batchUpdate', token,
    { method: 'POST', body: JSON.stringify({ requests: pedidosParaItens(sit.sheetId) }) });
  return true;
}

/** Escreve as linhas a partir de A4. Não apaga nada abaixo delas. */
export async function escreverNaPlanilha(token, planilhaId, aba, linhas, sheetId = null) {
  if (!linhas.length) throw Error('Nenhum empenho para lançar.');
  const ultima = PRIMEIRA_LINHA + linhas.length - 1;
  const largura = Math.max(...linhas.map(l => l.length));
  const faixa = citar(aba) + '!A' + PRIMEIRA_LINHA + ':' + letraColuna(largura - 1) + ultima;
  const r = await chamar(API + planilhaId + '/values/' + encodeURIComponent(faixa) + '?valueInputOption=USER_ENTERED', token,
    { method: 'PUT', body: JSON.stringify({ range: faixa, majorDimension: 'ROWS', values: valoresParaAPI(linhas) }) });
  if (sheetId != null)
    await chamar(API + planilhaId + ':batchUpdate', token,
      { method: 'POST', body: JSON.stringify({ requests: pedidosDeFormato(sheetId, linhas.length) }) });
  return { faixa, celulas: r.updatedCells || 0, linhas: linhas.length };
}

/**
 * Formato das linhas lançadas: dinheiro em R$ (as linhas que vinham da
 * planilha antiga como texto ficavam "2875,23"), fonte e ficha como texto
 * simples, e o histórico cortado na largura da coluna em vez de quebrar a
 * linha em várias alturas.
 */
export function pedidosDeFormato(sheetId, quantidade) {
  const linhas = { sheetId, startRowIndex: PRIMEIRA_LINHA - 1, endRowIndex: PRIMEIRA_LINHA - 1 + quantidade };
  const faixa = (a, b) => ({ ...linhas, startColumnIndex: a, endColumnIndex: b });
  const moeda = { numberFormat: { type: 'CURRENCY', pattern: '"R$" #,##0.00' } };
  const pedidos = [];
  for (const [a, b] of blocosDeDinheiro())
    pedidos.push({ repeatCell: { range: faixa(a, b), cell: { userEnteredFormat: moeda }, fields: 'userEnteredFormat.numberFormat' } });
  pedidos.push({ repeatCell: { range: faixa(1, 5), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
    fields: 'userEnteredFormat.numberFormat' } });
  /* Histórico à esquerda (centralizado e cortado, o começo do texto sumia),
     conferência ao centro, e as três colunas do fim numa largura que caiba
     o texto e o valor — conferido na aba NOVEMBRO/2026. */
  pedidos.push({ repeatCell: { range: faixa(COLUNA_HISTORICO, COLUNA_HISTORICO + 1),
    cell: { userEnteredFormat: { wrapStrategy: 'CLIP', horizontalAlignment: 'LEFT', textFormat: { fontSize: 9 } } },
    fields: 'userEnteredFormat.wrapStrategy,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat.fontSize' } });
  pedidos.push({ repeatCell: { range: faixa(COLUNA_HISTORICO + 2, COLUNA_HISTORICO + 3),
    cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.horizontalAlignment' } });
  [560, 115, 105].forEach((px, i) => pedidos.push({ updateDimensionProperties: {
    range: { sheetId, dimension: 'COLUMNS', startIndex: COLUNA_HISTORICO + i, endIndex: COLUNA_HISTORICO + i + 1 },
    properties: { pixelSize: px }, fields: 'pixelSize' } }));
  return pedidos;
}
/** Colunas de dinheiro em blocos contíguos [início, fim). */
function blocosDeDinheiro() {
  const cols = [...COLUNAS_DINHEIRO_PLANILHA].sort((a, b) => a - b), blocos = [];
  for (const c of cols) {
    const u = blocos[blocos.length - 1];
    if (u && u[1] === c) u[1] = c + 1; else blocos.push([c, c + 1]);
  }
  return blocos;
}
