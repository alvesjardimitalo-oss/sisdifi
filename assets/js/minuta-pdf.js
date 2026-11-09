// Leitura local: nenhuma minuta é enviada ao servidor.
export const DESTINOS = ['Caixa Econômica Federal', 'Sicoob', 'Bradesco', 'Pensão alimentícia'];
const normal = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
export function identificarDestino(s) {
  const t = normal(s);
  if (/PENSAO\s+ALIMENT/.test(t)) return DESTINOS[3];
  // Em minutas de Frei Inocêncio, a receita 2.1.3.01.00.00
  // com especificação 21 corresponde à Caixa Econômica Federal.
  // Exigir a sequência completa impede confundir ficha "00021" e outros números.
  if (/\b2\.1\.3\.01\.00\.00\s+21(?=\s|$)/.test(t)) return DESTINOS[0];
  if (!/CONSIG|EMPRESTIMO/.test(t)) return '';
  if (/SICOOB/.test(t)) return DESTINOS[1];
  if (/BRADESCO/.test(t)) return DESTINOS[2];
  if (/CAIXA|\bCEF\b/.test(t)) return DESTINOS[0];
  return '';
}
export function centavos(s) {
  if (!/^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(s)) throw new Error('Valor monetário inválido');
  const n = Number(s.replace(/[.,]/g, ''));
  if (!Number.isSafeInteger(n)) throw new Error('Valor fora do limite');
  return n;
}
const dinheiro = /-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g;
export function analisarMinuta(linhas) {
  const registros = [], avisos = [], documentos = [];
  let atual = null, data = '', tipo = 'Documento', pagina = 1, totalInformado = null, noCabecalho = false;
  function fechar() {
    if (!atual) return;
    const soma = atual.fontes.reduce((s, f) => s + f.centavos, 0);
    if (!atual.fontes.length) avisos.push(`${atual.numero}: fonte/valor não identificado; não incluído no total.`);
    if (atual.total !== null && soma !== atual.total) avisos.push(`${atual.numero}: soma das fontes difere do valor do documento.`);
    if (!atual.destino) avisos.push(`${atual.numero}: receita não classificada; confira antes de usar o resultado.`);
    for (const f of atual.fontes) registros.push({ ...f, numero: atual.numero, tipo: atual.tipo, data: atual.data, destino: atual.destino, descricao: atual.descricao, pagina: atual.pagina });
    documentos.push(atual); atual = null;
  }
  for (const entrada of linhas) {
    const l = String(typeof entrada === 'string' ? entrada : entrada.texto).replace(/\s+/g, ' ').trim();
    if (typeof entrada === 'object') pagina = entrada.pagina;
    const n = normal(l);
    if (/^UF:|^MUNICIPIO:|^ENTIDADE:/.test(n)) noCabecalho = true;
    if (/DATA.*(?:GUIA|EMPENHO).*VALOR/.test(n)) { tipo = /GUIA/.test(n) ? 'Guia' : 'Empenho'; noCabecalho = false; continue; }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(l)) { if (!noCabecalho) data = l; continue; }
    if (/TOTAL GERAL|TOTAL DA RECEITA NO PERIODO/.test(n)) {
      const v = l.match(dinheiro); if (v) totalInformado = centavos(v.at(-1));
      fechar(); continue;
    }
    if (/^TOTAL|^RESUMO GERAL/.test(n)) { if (!/^TOTAL DA GUIA/.test(n)) fechar(); continue; }
    const doc = l.match(/^(\d{4}\/\d+(?:-\d+)?)\s+(.+)$/);
    if (doc) {
      fechar();
      const vals = doc[2].match(dinheiro);
      atual = { numero: doc[1], tipo, data, pagina, descricao: doc[2], destino: identificarDestino(doc[2]), total: vals?.length === 1 ? centavos(vals[0]) : null, fontes: [] };
      if (vals?.length !== 1) avisos.push(`${doc[1]}: valor do documento ambíguo; confira as fontes.`);
      continue;
    }
    const fonte = l.match(/^(\d\.\d{3}\.\d{3}\.\d{4}|\d{4})\s+(.+?)\s+(-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})$/);
    if (fonte) {
      if (!atual) { avisos.push(`Página ${pagina}: fonte sem documento associado.`); continue; }
      atual.fontes.push({ fonte: fonte[1].replace(/\D/g, '').slice(0, 4), fonteCompleta: fonte[1], fonteNome: fonte[2], centavos: centavos(fonte[3]) });
    } else if (/^\d\.\d{3}\.\d{3}\.\d{4}/.test(l)) avisos.push(`Página ${pagina}: linha de fonte ilegível; não incluída.`);
  }
  fechar();
  const totalLido = registros.reduce((s, r) => s + r.centavos, 0);
  if (totalInformado !== null && totalInformado !== totalLido) avisos.push('Total das fontes extraídas difere do total geral do PDF. Resultado requer revisão.');
  if (!registros.length) avisos.push('Nenhum lançamento reconhecido. Use PDF com texto e layout de minuta analítica (documento, receita e fonte).');
  const vistos = new Set();
  for (const r of registros) {
    const chave = [r.data, r.numero, r.fonteCompleta, r.centavos, r.destino].join('|');
    if (vistos.has(chave)) avisos.push(`${r.numero}: lançamento repetido no PDF; mantido para conferência.`);
    vistos.add(chave);
  }
  return { registros, avisos, totalInformado, totalLido, quantidadeDocumentos: documentos.length };
}
export function agruparMinuta(registros) {
  const grupos = new Map();
  for (const r of registros) {
    const destino = r.destino || 'Não classificado', chave = destino + '|' + r.fonte;
    if (!grupos.has(chave)) grupos.set(chave, { destino, fonte: r.fonte, registros: [], total: 0 });
    const g = grupos.get(chave); g.registros.push(r); g.total += r.centavos;
  }
  return [...grupos.values()].sort((a, b) => a.destino.localeCompare(b.destino, 'pt-BR') || a.fonte.localeCompare(b.fonte));
}
let biblioteca;
export async function extrairMinuta(dados, lib = null) {
  if (!lib) {
    biblioteca ||= import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs').catch(e => { biblioteca = null; throw e; });
    lib = await biblioteca;
    lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
  }
  const tarefa = lib.getDocument({ data: new Uint8Array(dados), isEvalSupported: false });
  try {
    const doc = await tarefa.promise, linhas = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pag = await doc.getPage(p), { items } = await pag.getTextContent();
      const [a,b,c,d,e,f] = pag.getViewport({ scale: 1 }).transform, grupos = [];
      // Tolerância menor: este relatório contém totais ocultos a ~2 px da linha seguinte.
      for (const item of items) {
        if (!item.str?.trim()) continue;
        const x = a*item.transform[4]+c*item.transform[5]+e, y = b*item.transform[4]+d*item.transform[5]+f;
        let g = grupos.find(g => Math.abs(g.y-y) < 0.9);
        if (!g) grupos.push(g = { y, itens: [] });
        g.itens.push({ x, texto: item.str });
      }
      for (const g of grupos.sort((a,b) => a.y-b.y)) linhas.push({ pagina: p, texto: g.itens.sort((a,b) => a.x-b.x).map(i => i.texto).join(' ') });
      pag.cleanup();
    }
    return analisarMinuta(linhas);
  } finally { await tarefa.destroy(); }
}
