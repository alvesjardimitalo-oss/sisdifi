// Lança a folha na planilha Google da Contabilidade ("Nova Folha 2026").
//
// Escreve direto na aba do mês (NOVEMBRO, OUTUBRO…), a partir da linha 4, nas
// colunas que a Contabilidade já usa — ver linhasDaPlanilha() em
// folha-lancamento.js. A chamada sai do navegador para a API do Google com o
// token da conta que edita a planilha; o SISDIFI não guarda esse token.
import { COLUNAS_DINHEIRO_PLANILHA } from './folha-lancamento.js';

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

/** Abas da planilha e quantas linhas a aba do mês já tem preenchidas (coluna B, empenho). */
export async function situacaoDaPlanilha(token, planilhaId, competencia) {
  const info = await chamar(API + planilhaId + '?fields=properties.title,sheets.properties.title', token);
  const titulos = (info.sheets || []).map(s => s.properties.title);
  const aba = abaDoMes(titulos, competencia);
  if (!aba) return { titulo: info.properties?.title || '', titulos, aba: '', preenchidas: 0 };
  const faixa = encodeURIComponent("'" + aba.replace(/'/g, "''") + "'!B" + PRIMEIRA_LINHA + ':B1000');
  const v = await chamar(API + planilhaId + '/values/' + faixa, token);
  const preenchidas = (v.values || []).filter(r => String(r[0] || '').trim()).length;
  return { titulo: info.properties?.title || '', titulos, aba, preenchidas };
}

/** Escreve as linhas a partir de A4. Não apaga nada abaixo delas. */
export async function escreverNaPlanilha(token, planilhaId, aba, linhas) {
  if (!linhas.length) throw Error('Nenhum empenho para lançar.');
  const ultima = PRIMEIRA_LINHA + linhas.length - 1;
  const largura = Math.max(...linhas.map(l => l.length));
  const faixa = "'" + aba.replace(/'/g, "''") + "'!A" + PRIMEIRA_LINHA + ':' + letraColuna(largura - 1) + ultima;
  const r = await chamar(API + planilhaId + '/values/' + encodeURIComponent(faixa) + '?valueInputOption=USER_ENTERED', token,
    { method: 'PUT', body: JSON.stringify({ range: faixa, majorDimension: 'ROWS', values: valoresParaAPI(linhas) }) });
  return { faixa, celulas: r.updatedCells || 0, linhas: linhas.length };
}
