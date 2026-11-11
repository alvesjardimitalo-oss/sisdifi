// =============================================================
// SISDIFI — Leitura do DANFSe (PDF da NFS-e padrão nacional, v1 e v2)
// Lê os rótulos impressos ("Alíquota Aplicada", "Retenção do ISSQN", "IRRF"…) e pega o valor logo abaixo de cada um.
// O pdf.js é carregado do cdnjs só quando necessário; a análise (lerDanfse) é pura e testável.
// =============================================================
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

/** Extrai os pedaços de texto com posição (x da esquerda, y de cima para baixo) da 1ª página. */
export async function extrairItens(dados, pdfjsLib = null) {
  const lib = pdfjsLib || await carregarPdfjs();
  const doc = await lib.getDocument({ data: dados instanceof Uint8Array ? dados : new Uint8Array(dados), isEvalSupported: false }).promise;
  const itens = [];
  for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
    const pag = await doc.getPage(p);
    const vp = pag.getViewport({ scale: 1 });
    const [a, b, c, d, e, f] = vp.transform;
    const { items } = await pag.getTextContent();
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const px = it.transform[4], py = it.transform[5];
      itens.push({ x: a * px + c * py + e, y: b * px + d * py + f + (p - 1) * 2000, w: it.width || 0, str: it.str });
    }
  }
  return itens;
}

const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Junta pedaços vizinhos da mesma linha em "segmentos" (o pdf.js às vezes quebra palavras). */
export function segmentar(itens) {
  const ord = [...itens].sort((p, q) => p.y - q.y || p.x - q.x);
  const seg = [];
  for (const it of ord) {
    const ult = seg[seg.length - 1];
    if (ult && Math.abs(ult.y - it.y) <= 2 && it.x - ult.fim <= 6 && it.x - ult.fim >= -2) { ult.str += (it.x - ult.fim > 1.5 ? ' ' : '') + it.str; ult.fim = Math.max(ult.fim, it.x + it.w); }
    else seg.push({ x: it.x, y: it.y, fim: it.x + it.w, str: it.str });
  }
  for (const s of seg) { s.str = s.str.replace(/\s+/g, ' ').trim(); s.n = norm(s.str); }
  return seg.filter(s => s.str);
}

/** Valor logo abaixo do rótulo, na mesma coluna. */
function abaixo(seg, rot, { linhas = 1 } = {}) {
  const cands = seg.filter(s => s !== rot && s.y > rot.y + 1.5 && s.y <= rot.y + 22 && s.x >= rot.x - 8 && s.x <= rot.x + 40)
    .sort((p, q) => p.y - q.y || Math.abs(p.x - rot.x) - Math.abs(q.x - rot.x));
  if (!cands.length) return '';
  const primeiro = cands[0];
  if (linhas === 1) return primeiro.str;
  // várias linhas (descrição): continua enquanto as linhas seguem coladas, na mesma margem
  const out = [primeiro.str];
  let y = primeiro.y;
  for (const s of seg.filter(z => z.y > primeiro.y && Math.abs(z.x - primeiro.x) <= 8).sort((p, q) => p.y - q.y)) {
    if (s.y - y > 13 || ROTULOS_CONHECIDOS.some(r => s.n.startsWith(r))) break;
    out.push(s.str); y = s.y;
  }
  return out.join(' ');
}

const ROTULOS_CONHECIDOS = ['tributacao municipal', 'tributacao federal', 'tributacao ibs', 'valor total', 'informacoes complementares'];

function achar(seg, padrao, { depoisDe = null, antesDe = null, ordem = 0 } = {}) {
  const lista = seg.filter(s => (padrao instanceof RegExp ? padrao.test(s.n) : s.n.startsWith(padrao))
    && (!depoisDe || s.y > depoisDe.y - 1) && (!antesDe || s.y < antesDe.y + 1));
  return lista[ordem] || null;
}

const dinheiro = t => {
  const m = String(t || '').match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d+\.\d{2}\b/);
  if (!m) return null;
  const v = m[0].includes(',') ? Number(m[0].replace(/\./g, '').replace(',', '.')) : Number(m[0]);
  return Number.isFinite(v) ? v : null;
};
const percentual = t => { const m = String(t || '').match(/(\d+(?:[.,]\d+)?)\s*%/); return m ? Number(m[1].replace(',', '.')) : null; };
const dataISO = t => { const m = String(t || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const vazio = t => !t || /^[-–\s/]*$/.test(t);

/**
 * Lê os campos do DANFSe a partir dos pedaços de texto com posição.
 * Devolve os dados no mesmo formato da conferência (doc), com os nomes de município para converter em código IBGE.
 */
export function lerDanfse(itens) {
  const seg = segmentar(itens);
  const texto = seg.map(s => s.str).join('\n');
  if (!/danfs|nfs-?e/i.test(texto)) throw new Error('Este PDF não parece ser um DANFSe (documento auxiliar da NFS-e).');
  const blocoPrest = achar(seg, /^prestador/), blocoTom = achar(seg, /^tomador/), blocoServ = achar(seg, /^servico prestado/);
  const v = (padrao, op = {}) => { const r = achar(seg, padrao, op); return r ? abaixo(seg, r, op) : ''; };

  const chave = ((texto.replace(/[ .]/g, '').match(/\d{50}/) || [])[0]) || '';
  const cnpj = v('cnpj / cpf / nif', { depoisDe: blocoPrest, antesDe: blocoTom }) || v(/^cnpj/, { depoisDe: blocoPrest });
  const simplesTxt = v('simples nacional na data');
  const codTrib = v(/^codigo de tributacao nacional/);
  const local = v(/^local da prestacao/);
  const incid = v(/pais de incidencia do issqn|municipio.*incidencia do issqn/);
  const retencao = v(/^retencao do issqn/);
  const cstTxt = v(/^cst \/ cclasstrib|^cst/);
  const [cst, classTrib] = cstTxt.split('/').map(x => x.trim());
  const ibsAliq = v(/^aliquota - ibs uf/);
  const [pIBSUF, pIBSMun] = (ibsAliq.match(/\d+(?:[.,]\d+)?\s*%/g) || []).map(percentual);
  const emissaoTxt = v('competencia da nfs') || v(/^data e hora da emissao da nfs/);
  const simplesN = norm(simplesTxt);
  const regimeNota = !simplesTxt || vazio(simplesTxt) ? '' : /nao optante/.test(simplesN) ? 'normal' : /mei|microempreendedor/.test(simplesN) ? 'mei' : /optante/.test(simplesN) ? 'simples' : '';
  const retN = norm(retencao);
  const valor = dinheiro(v(/^valor da operacao/) || v(/^valor do servico/) || v(/^valor dos servicos/));
  const vCBS = dinheiro(v(/^valor total apurado - cbs/)), vIBS = dinheiro(v(/^valor total apurado - ibs/));
  const pCBS = percentual(v(/^aliquota - cbs/));
  const descricao = v(/^descricao do servico/, { linhas: 6 });

  const doc = {
    origem: 'danfse', documento: 'NFS-e Nacional', modelo: 'nfse', servico: true, chave,
    numero: (v(/^numero da nfs/) || '').replace(/\D/g, '') || '',
    emissao: dataISO(emissaoTxt),
    cnpj: cnpj.replace(/[^0-9A-Za-z]/g, ''), nome: v('nome / nome empresarial', { depoisDe: blocoPrest, antesDe: blocoTom }),
    tomadorCnpj: (v('cnpj / cpf / nif', { depoisDe: blocoTom, antesDe: blocoServ }) || '').replace(/[^0-9A-Za-z]/g, ''),
    tomadorNome: v('nome / nome empresarial', { depoisDe: blocoTom, antesDe: blocoServ }),
    email: v(/^e-mail/, { depoisDe: blocoPrest, antesDe: blocoTom }),
    municipioEmissorTexto: v('municipio / sigla uf', { depoisDe: blocoPrest, antesDe: blocoTom }),
    municipioEmissorIbge: (v(/^codigo ibge/, { depoisDe: blocoPrest, antesDe: blocoTom }).match(/\d{7}/) || [])[0] || '',
    regimeNota, regimeNotaTexto: vazio(simplesTxt) ? '' : 'Na nota: ' + simplesTxt,
    codigoServico: vazio(codTrib) ? '' : codTrib.split('/')[0].trim(),
    descricaoServico: descricao,
    localPrestacaoTexto: vazio(local) ? '' : local,
    incidenciaTexto: vazio(incid) ? '' : incid,
    incidenciaIbge: (v(/codigo ibge incidencia/).match(/\b\d{7}\b/) || [])[0] || '',
    issAliquota: percentual(v(/^aliquota aplicada/)),
    issValor: dinheiro(v(/^issqn apurado/)),
    issBase: dinheiro(v(/^bc issqn/)),
    issRetidoNota: !retencao || vazio(retencao) ? null : /nao retido/.test(retN) ? false : /retido/.test(retN) ? true : null,
    irrfDestacado: dinheiro(v(/^irrf/)) ?? 0,
    inssRetido: dinheiro(v(/^contribuicao previdenciaria - retida/)),
    csrfRetido: dinheiro(v(/^contribuicoes sociais - retidas/)),
    valor,
    totalRetencoesNota: dinheiro(v(/^total das retencoes/)),
    liquidoNota: dinheiro(v(/^valor liquido da nfs-e$/) || v(/^valor liquido da nfs/)),
    ibscbs: (cst || vCBS != null || vIBS != null) ? {
      cst: (cst || '').replace(/\D/g, ''), classTrib: (classTrib || '').replace(/\D/g, ''),
      base: dinheiro(v(/^base de calculo apos exclusoes/)), pCBS, pIBSUF: pIBSUF ?? null, pIBSMun: pIBSMun ?? null, vCBS, vIBS
    } : null
  };
  if (!doc.valor && !doc.cnpj) throw new Error('Não encontrei os campos do DANFSe neste PDF. Se for uma nota escaneada (imagem), preencha à mão.');
  return doc;
}

/** Lê o arquivo PDF do DANFSe. */
export async function lerDanfsePDF(arquivo) {
  const dados = await arquivo.arrayBuffer();
  const itens = await extrairItens(dados);
  if (!itens.length) throw new Error('O PDF não tem texto (parece uma imagem escaneada). Leia o QR Code e preencha os campos à mão.');
  return lerDanfse(itens);
}
