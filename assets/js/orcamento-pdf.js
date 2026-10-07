// SISDIFI — Leitura automática do "Demonstrativo da Despesa Fixada" (orçamento em PDF)
// Extrai as fichas (ficha × fonte de recurso) com unidade, ação, elemento e valor autorizado.
// A leitura do PDF usa o pdf.js (carregado do cdnjs só quando necessário); a análise do texto é pura e testável.

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/';
let pdfjsPromessa = null;
function carregarPdfjs() {
  if (!pdfjsPromessa) {
    pdfjsPromessa = import(PDFJS + 'pdf.min.mjs').then(lib => {
      lib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
      return lib;
    }).catch(err => { pdfjsPromessa = null; throw err; });
  }
  return pdfjsPromessa;
}

/** Converte o PDF em linhas de texto (agrupa os pedaços pela altura na página e ordena da esquerda p/ direita). */
export async function extrairLinhas(dados, pdfjsLib = null) {
  const lib = pdfjsLib || await carregarPdfjs();
  const tarefa = lib.getDocument({ data: dados instanceof Uint8Array ? dados : new Uint8Array(dados), isEvalSupported: false });
  const doc = await tarefa.promise;
  const linhas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pag = await doc.getPage(p);
    const { items } = await pag.getTextContent();
    const grupos = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5];
      let g = grupos.find(gr => Math.abs(gr.y - y) <= 2.5);
      if (!g) grupos.push(g = { y, itens: [] });
      g.itens.push({ x, fim: x + (it.width || 0), str: it.str });
    }
    grupos.sort((a, b) => b.y - a.y);
    for (const g of grupos) {
      g.itens.sort((a, b) => a.x - b.x);
      let txt = '', fim = null;
      for (const it of g.itens) {
        if (fim !== null && it.x - fim > 1) txt += '  ';
        txt += it.str; fim = it.fim;
      }
      linhas.push(txt.replace(/\s+$/, ''));
    }
    pag.cleanup();
  }
  await tarefa.destroy();
  return linhas;
}

const VALOR = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2})';
const RE = {
  orgao: new RegExp(`^(02\\.\\d{2})\\s+(.+?)\\s+${VALOR}$`),
  unidade: new RegExp(`^(\\d{2}\\.\\d{2}\\.\\d{2})\\s+(.+?)\\s+${VALOR}$`),
  acao: new RegExp(`^(\\d{2}\\.\\d{3}\\.\\d{4}\\.\\d{4})\\s+(.+?)\\s+${VALOR}$`),
  elemento: new RegExp(`^(\\d\\.\\d\\.\\d{2}\\.\\d{2}\\.\\d{2})\\s+(\\d{1,5})\\s+(.+?)\\s+${VALOR}$`),
  fonte: new RegExp(`^(\\d\\.\\d{3}\\.\\d{3}\\.\\d{4})\\s+(.+?)\\s+${VALOR}$`),
  ano: /OR[ÇC]AMENTO\s*(\d{4})|^\s*(20\d{2})\s*$/
};
const numero = v => Number(String(v).replace(/\./g, '').replace(',', '.'));
const limpar = s => String(s).replace(/\s{2,}/g, ' ').trim();

/**
 * Analisa as linhas do demonstrativo. Devolve
 * { ano, orgao: {codigo,nome}, unidades: [{codigo,nome}], fichas: [{ficha, unidade, unidade_nome, acao_codigo, acao_nome,
 *   elemento_codigo, elemento_nome, fonte_codigo, fonte_nome, autorizado, autorizado_ficha}], avisos: [] }
 */
export function analisarOrcamento(linhas) {
  const r = { ano: null, orgao: null, unidades: [], fichas: [], avisos: [] };
  let unidade = null, acao = null, elem = null;
  const fecharElemento = () => {
    if (!elem) return;
    if (!elem.fontes.length) r.avisos.push(`Ficha ${elem.ficha} sem fonte de recurso identificada.`);
    const soma = elem.fontes.reduce((t, f) => t + f.valor, 0);
    if (elem.fontes.length && Math.abs(soma - elem.valor) > 0.009) r.avisos.push(`Ficha ${elem.ficha}: soma das fontes difere do total da ficha.`);
    for (const f of elem.fontes) r.fichas.push({
      ficha: elem.ficha, unidade: unidade?.codigo || '', unidade_nome: unidade?.nome || '',
      acao_codigo: acao?.codigo || '', acao_nome: acao?.nome || '',
      elemento_codigo: elem.codigo, elemento_nome: elem.nome,
      fonte_codigo: f.codigo, fonte_nome: f.nome, autorizado: f.valor, autorizado_ficha: elem.valor
    });
    elem = null;
  };
  for (const bruta of linhas) {
    const l = limpar(bruta);
    if (!l) continue;
    let m;
    if (!r.ano && (m = l.match(RE.ano))) { r.ano = Number(m[1] || m[2]); continue; }
    if ((m = l.match(RE.elemento))) {
      fecharElemento();
      elem = { codigo: m[1], ficha: m[2], nome: limpar(m[3]), valor: numero(m[4]), fontes: [] };
    } else if ((m = l.match(RE.fonte))) {
      if (elem) elem.fontes.push({ codigo: m[1], nome: limpar(m[2]), valor: numero(m[3]) });
    } else if ((m = l.match(RE.acao))) {
      fecharElemento(); acao = { codigo: m[1], nome: limpar(m[2]) };
    } else if ((m = l.match(RE.unidade))) {
      fecharElemento(); unidade = { codigo: m[1], nome: limpar(m[2]) }; acao = null;
      if (!r.unidades.some(u => u.codigo === unidade.codigo)) r.unidades.push(unidade);
    } else if ((m = l.match(RE.orgao))) {
      fecharElemento(); r.orgao = r.orgao || { codigo: m[1], nome: limpar(m[2]) };
    }
    // Demais linhas (cabeçalho de página, função, subfunção, programa) são ignoradas;
    // a ficha continua aberta através das quebras de página.
  }
  fecharElemento();
  return r;
}

/** Elemento 3.3.90.14 = Diárias – Pessoal Civil (o que interessa às solicitações). */
export const ehDiaria = f => /^3\.3\.90\.14/.test(f.elemento_codigo || f.elemento || '');

export function rotuloFonte(f) { return `${f.fonte_codigo} — ${f.fonte_nome}`; }
