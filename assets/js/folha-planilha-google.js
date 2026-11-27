// Lança a folha na planilha Google da Contabilidade ("Nova Folha 2026").
//
// Escreve direto na aba do mês (NOVEMBRO, OUTUBRO…), a partir da linha 4, nas
// colunas que a Contabilidade já usa — ver linhasDaPlanilha() em
// folha-lancamento.js. A chamada sai do navegador para a API do Google com o
// token da conta que edita a planilha; o SISDIFI não guarda esse token.
import { COLUNAS_DINHEIRO_PLANILHA, INICIO_ITENS_PLANILHA, ROTULOS_ITENS_PLANILHA, COLUNA_HISTORICO_PLANILHA,
  COLUNA_DESCONTO_PLANILHA, COLUNA_OP_PLANILHA, ROTULOS_OP_PLANILHA, COLUNA_LIQUIDO_PLANILHA } from './folha-lancamento.js';

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
const H = COLUNA_HISTORICO_PLANILHA, I = COLUNA_DESCONTO_PLANILHA, J = INICIO_ITENS_PLANILHA;
const FIM_ITENS = J + ROTULOS_ITENS_PLANILHA.length;           // Q, nº da OP
const V = COLUNA_LIQUIDO_PLANILHA, W = V + 1, X = V + 2;
const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

/**
 * Em que modelo está o cabeçalho da aba (linha 3):
 *  'atual'  — H histórico, I desconto, J–P itens (o que o SISDIFI escreve);
 *  'itens'  — I–O itens e o histórico no fim (V), como saiu até nov/2026;
 *  'manual' — o modelo da Contabilidade, sem itens nem histórico (H desconto).
 */
export function modeloDaAba(cabecalho = []) {
  const c = cabecalho.map(normal);
  const itensEm = i => ROTULOS_ITENS_PLANILHA.every((r, k) => c[i + k] === normal(r));
  if (c[H] === 'HISTORICO' && itensEm(J)) return 'atual';
  if (itensEm(J - 1) && c[V] === 'HISTORICO') return 'itens';
  return 'manual';
}
/** Compatível com quem perguntava só se a aba já tinha os itens. */
export const itensNoCabecalho = (itens = []) => ROTULOS_ITENS_PLANILHA.every((r, k) => normal(itens[k]) === normal(r));

/** Abas da planilha, a do mês, quantos empenhos ela já tem e em que modelo está. */
export async function situacaoDaPlanilha(token, planilhaId, competencia) {
  const info = await chamar(API + planilhaId + '?fields=properties.title,sheets.properties(sheetId,title)', token);
  const abas = (info.sheets || []).map(s => s.properties);
  const aba = abaDoMes(abas.map(a => a.title), competencia);
  const base = { titulo: info.properties?.title || '', titulos: abas.map(a => a.title), aba, sheetId: null, preenchidas: 0, modelo: '' };
  if (!aba) return base;
  const sheetId = abas.find(a => a.title === aba).sheetId;
  const q = ['B' + PRIMEIRA_LINHA + ':B1000', 'A' + LINHA_CABECALHO + ':' + letraColuna(X + 2) + LINHA_CABECALHO]
    .map(r => 'ranges=' + encodeURIComponent(citar(aba) + '!' + r)).join('&');
  const v = await chamar(API + planilhaId + '/values:batchGet?' + q, token);
  const [empenhos, cab] = (v.valueRanges || []).map(x => x.values || []);
  const preenchidas = (empenhos || []).filter(r => String(r[0] || '').trim()).length;
  return { ...base, sheetId, preenchidas, modelo: modeloDaAba(cab?.[0] || []) };
}

const larguras = (sheetId, colunas) => colunas.map(([c0, c1, px]) => ({ updateDimensionProperties: {
  range: { sheetId, dimension: 'COLUMNS', startIndex: c0, endIndex: c1 }, properties: { pixelSize: px }, fields: 'pixelSize' } }));
const titulos = (sheetId, coluna, textos) => ({ updateCells: { start: { sheetId, rowIndex: LINHA_CABECALHO - 1, columnIndex: coluna },
  rows: [{ values: textos.map(t => ({ userEnteredValue: { stringValue: t } })) }], fields: 'userEnteredValue' } });

/**
 * Pedidos para pôr a aba no modelo atual. Inserir colunas empurra o resto
 * para a direita e alarga os títulos mesclados das linhas 1–2; as fórmulas
 * da aba (totais, "valor bateu") se ajustam sozinhas. Mover coluna não
 * serve: o Google recusa mover para dentro de célula mesclada — por isso o
 * histórico antigo (V) é copiado para a coluna nova e a velha é apagada.
 * Testado nas abas NOVEMBRO/2026 nos dois modelos.
 */
export function pedidosParaModelo(sheetId, modelo) {
  if (modelo === 'atual') return [];
  const col = (c0, c1) => ({ sheetId, dimension: 'COLUMNS', startIndex: c0, endIndex: c1 });
  const grade = (c0, c1) => ({ sheetId, startRowIndex: LINHA_CABECALHO - 1, endRowIndex: 1000, startColumnIndex: c0, endColumnIndex: c1 });
  const titulo = (c0, c1) => ({ ...grade(c0, c1), endRowIndex: LINHA_CABECALHO });
  const pedidos = [{ insertDimension: { range: col(H, H + 1), inheritFromBefore: true } }];
  if (modelo === 'itens') {
    // O histórico estava em V; com a coluna nova em H, ele passou para W.
    pedidos.push({ copyPaste: { source: grade(W, W + 1), destination: grade(H, H + 1), pasteType: 'PASTE_VALUES' } },
      { deleteDimension: { range: col(W, W + 1) } });
  } else {
    const itens = col(J, FIM_ITENS);
    pedidos.push({ insertDimension: { range: itens, inheritFromBefore: true } },
      titulos(sheetId, H, ['Histórico']), titulos(sheetId, J, ROTULOS_ITENS_PLANILHA),
      { addDimensionGroup: { range: itens } },
      { updateDimensionGroup: { dimensionGroup: { range: itens, depth: 1, collapsed: true }, fields: 'collapsed' } });
  }
  const verde = { red: 0.85, green: 0.94, blue: 0.83 }, vermelho = { red: 0.96, green: 0.8, blue: 0.8 };
  const conferencia = [{ sheetId, startRowIndex: PRIMEIRA_LINHA - 1, endRowIndex: 1000, startColumnIndex: X, endColumnIndex: X + 1 }];
  const regra = (cond, valor, fundo, letra) => ({ addConditionalFormatRule: { index: 0, rule: { ranges: conferencia,
    booleanRule: { condition: { type: cond, values: [{ userEnteredValue: valor }] },
      format: { backgroundColor: fundo, textFormat: { foregroundColor: letra } } } } } });
  pedidos.push(
    // OPs: o desconto delas é o INSS da maternidade, e o título diz isso.
    titulos(sheetId, FIM_ITENS, ROTULOS_OP_PLANILHA), titulos(sheetId, W, ['Resumo RH', 'Conferência']),
    // "+" antes do grupo, ao lado do desconto da liquidação.
    { updateSheetProperties: { properties: { sheetId, gridProperties: { columnGroupControlAfter: false } },
      fields: 'gridProperties.columnGroupControlAfter' } },
    // Títulos novos no estilo do título "Valor Bruto".
    ...[[H, H + 1], [J, FIM_ITENS], [W, X + 1]].map(([a, b]) => ({ copyPaste: { source: titulo(6, 7), destination: titulo(a, b), pasteType: 'PASTE_FORMAT' } })),
    regra('TEXT_EQ', 'BATEU', verde, { red: 0.1, green: 0.4, blue: 0.1 }),
    regra('TEXT_CONTAINS', 'NÃO', vermelho, { red: 0.6, green: 0, blue: 0 }),
    ...larguras(sheetId, [[H, H + 1, 430], [J, FIM_ITENS, 95], [W, W + 1, 115], [X, X + 1, 110]]));
  return pedidos;
}
/** Nome antigo: preparar a aba é pô-la no modelo atual. */
export const pedidosParaItens = sheetId => pedidosParaModelo(sheetId, 'manual');

/** Põe a aba do mês no modelo atual, se ainda não estiver. */
export async function prepararAba(token, planilhaId, sit) {
  const pedidos = pedidosParaModelo(sit.sheetId, sit.modelo);
  if (!pedidos.length) return false;
  await chamar(API + planilhaId + ':batchUpdate', token, { method: 'POST', body: JSON.stringify({ requests: pedidos }) });
  return true;
}

/* Cor de cada secretaria: uma só, suave, a mesma em todas as colunas da linha
   e em todos os meses. A planilha manual tinha destaques soltos (amarelo,
   verde-limão, vermelho) e a mesma secretaria em cores diferentes. */
const rgb = h => ({ red: parseInt(h.slice(0, 2), 16) / 255, green: parseInt(h.slice(2, 4), 16) / 255, blue: parseInt(h.slice(4, 6), 16) / 255 });
export const CORES_SECRETARIA = {
  'GABINETE DO PREFEITO': 'dbe7f5', 'ADMINISTRAÇÃO': 'fde6d2', 'CULTURA': 'ece2f6', 'FAZENDA': 'd9efd9',
  'ESPORTE E LAZER': 'fbe0ec', 'TRANSPORTES': 'fff4cc', 'AGRICULTURA': 'e6eedc', 'OBRAS PUBLICAS': 'f2e8d8',
  'MEIO AMBIENTE': 'd6f1e4', 'LIMPEZA URBANA': 'd8eef6', 'SEC. EDUCAÇÃO': 'fde2de', 'FUNDEB': 'e4e2fa',
  'SECRETARIA DE SAÚDE': 'd8f0ee', 'HOSPITAL MUNICIPAL': 'f8dcdc', 'SEC. AÇÃO SOCIAL': 'ffe9cf'
};
const COR_OUTRA = 'eef0f3';
const corDa = secretaria => rgb(CORES_SECRETARIA[String(secretaria || '').trim().toUpperCase()] || COR_OUTRA);

/**
 * Pinta cada linha com a cor da secretaria (coluna C), de B até X, e deixa o
 * texto preto — sobrescreve as cores soltas. Linhas seguidas da mesma
 * secretaria vão num pedido só. A conferência (X) continua verde/vermelha
 * pela formatação condicional, que fica por cima.
 */
export function pedidosDeCores(sheetId, secretarias = []) {
  const pedidos = [];
  for (let k = 0; k < secretarias.length;) {
    let fim = k + 1;
    while (fim < secretarias.length && String(secretarias[fim] || '').trim().toUpperCase() === String(secretarias[k] || '').trim().toUpperCase()) fim++;
    pedidos.push({ repeatCell: { range: { sheetId, startRowIndex: PRIMEIRA_LINHA - 1 + k, endRowIndex: PRIMEIRA_LINHA - 1 + fim, startColumnIndex: 1, endColumnIndex: X + 1 },
      cell: { userEnteredFormat: { backgroundColor: corDa(secretarias[k]), textFormat: { foregroundColor: { red: 0.1, green: 0.1, blue: 0.12 } } } },
      fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor' } });
    k = fim;
  }
  return pedidos;
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
      { method: 'POST', body: JSON.stringify({ requests: [...pedidosDeFormato(sheetId, linhas.length),
        ...pedidosDeCores(sheetId, linhas.map(l => l[2]))] }) });
  return { faixa, celulas: r.updatedCells || 0, linhas: linhas.length };
}

/**
 * Visual das linhas lançadas. Cada linha da planilha tem a cor da secretaria
 * no bruto, no desconto e no líquido; o histórico pega a cor do bruto, os
 * itens a do desconto, e o resumo e a conferência a do líquido. Depois vêm
 * o formato de cada coluna: dinheiro em R$, empenho/ficha/fonte como texto,
 * histórico à esquerda sem quebrar a linha, conferência em negrito ao centro.
 */
export function pedidosDeFormato(sheetId, quantidade) {
  const linhas = { sheetId, startRowIndex: PRIMEIRA_LINHA - 1, endRowIndex: PRIMEIRA_LINHA - 1 + quantidade };
  const faixa = (a, b) => ({ ...linhas, startColumnIndex: a, endColumnIndex: b });
  const cor = (de, a, b) => ({ copyPaste: { source: faixa(de, de + 1), destination: faixa(a, b), pasteType: 'PASTE_FORMAT' } });
  const moeda = { numberFormat: { type: 'CURRENCY', pattern: '"R$" #,##0.00' } };
  const pedidos = [cor(6, H, H + 1), cor(I, J, FIM_ITENS), cor(V, W, X + 1)];
  for (const [a, b] of blocosDeDinheiro())
    pedidos.push({ repeatCell: { range: faixa(a, b), cell: { userEnteredFormat: moeda }, fields: 'userEnteredFormat.numberFormat' } });
  pedidos.push({ repeatCell: { range: faixa(1, 5), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } },
    fields: 'userEnteredFormat.numberFormat' } });
  pedidos.push({ repeatCell: { range: faixa(H, H + 1),
    cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, wrapStrategy: 'CLIP', horizontalAlignment: 'LEFT', textFormat: { fontSize: 9 } } },
    fields: 'userEnteredFormat.numberFormat,userEnteredFormat.wrapStrategy,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat.fontSize' } });
  pedidos.push({ repeatCell: { range: faixa(X, X + 1),
    cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true } } },
    fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat.bold' } });
  return [...pedidos, ...pedidosDeVisual(sheetId, quantidade)];
}

/**
 * Acabamento da aba: cabeçalho escuro com letra branca, a mesma fonte em todas
 * as linhas (vinham misturadas Arial e Times), valores à direita, empenho,
 * ficha, fonte e nº da OP ao centro, tudo no meio da altura, bordas finas
 * cinza e a mesma altura e largura em todas as linhas e colunas. As cores
 * de cada secretaria ficam como estão: só fonte e alinhamento são tocados.
 */
export function pedidosDeVisual(sheetId, quantidade) {
  const L0 = PRIMEIRA_LINHA - 1, L1 = L0 + quantidade;
  const g = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 });
  const azul = { red: 0.12, green: 0.23, blue: 0.37 }, branco = { red: 1, green: 1, blue: 1 };
  const cinza = { red: 0.78, green: 0.8, blue: 0.83 }, escuro = { red: 0.35, green: 0.38, blue: 0.42 };
  const fino = { style: 'SOLID', width: 1, color: cinza }, grosso = { style: 'SOLID_MEDIUM', width: 2, color: escuro };
  const alinhar = (c0, c1, h) => ({ repeatCell: { range: g(L0, L1, c0, c1), cell: { userEnteredFormat: { horizontalAlignment: h } },
    fields: 'userEnteredFormat.horizontalAlignment' } });
  const altura = (r0, r1, px) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: r0, endIndex: r1 },
    properties: { pixelSize: px }, fields: 'pixelSize' } });
  const pedidos = [
    // Cabeçalho (linha 3)
    { repeatCell: { range: g(L0 - 1, L0, 1, X + 1), cell: { userEnteredFormat: { backgroundColor: azul,
      textFormat: { foregroundColor: branco, bold: true, fontSize: 9, fontFamily: 'Arial' },
      horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' } },
      fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy' } },
    altura(L0 - 1, L0, 44),
    // Linhas: mesma fonte, no meio da altura
    { repeatCell: { range: g(L0, L1, 1, X + 1), cell: { userEnteredFormat: { verticalAlignment: 'MIDDLE',
      textFormat: { fontFamily: 'Arial', fontSize: 9 } } },
      fields: 'userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat.fontFamily,userEnteredFormat.textFormat.fontSize' } },
    altura(L0, L1, 22),
    ...[...blocosDeDinheiro()].map(([a, b]) => alinhar(a, b, 'RIGHT')),
    alinhar(1, 2, 'CENTER'), alinhar(3, 5, 'CENTER'), alinhar(FIM_ITENS, FIM_ITENS + 1, 'CENTER'), alinhar(X, X + 1, 'CENTER'),
    alinhar(H, H + 1, 'LEFT'),
    // Bordas: finas por dentro, mais grossa em volta
    { updateBorders: { range: g(L0 - 1, L1, 1, X + 1), top: grosso, bottom: grosso, left: grosso, right: grosso,
      innerHorizontal: fino, innerVertical: fino } },
    // Larguras: B empenho … X conferência
    ...larguras(sheetId, [[1, 2, 70], [2, 3, 175], [3, 4, 55], [4, 5, 62], [5, 6, 105], [6, 7, 110], [H, H + 1, 430], [I, I + 1, 115],
      [J, FIM_ITENS, 95], [FIM_ITENS, FIM_ITENS + 1, 75], [FIM_ITENS + 1, V, 108], [V, V + 1, 118], [W, W + 1, 118], [X, X + 1, 105]])
  ];
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
