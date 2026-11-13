// SISDIFI — Leitura do extrato do BB em PDF ou imagem.
// 1) PDF com texto (extrato salvo pelo navegador): usa o texto do próprio PDF.
// 2) PDF escaneado ou foto: reconhece o texto (OCR em português, Tesseract.js carregado do CDN só quando preciso).
// Nada sai do navegador: o OCR roda no computador do usuário.
import { extrairLinhas } from './orcamento-pdf.js';
import { extratoLegivel } from './retencoes.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/';
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';
let pdfjs = null, tesseract = null;
const carregarPdfjs = () => (pdfjs ||= import(PDFJS + 'pdf.min.mjs').then(l => { l.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs'; return l; }).catch(e => { pdfjs = null; throw e; }));
const carregarTesseract = () => (tesseract ||= import(TESSERACT).then(m => m.default || m).catch(e => { tesseract = null; throw e; }));

async function ocr(imagens, progresso) {
  const T = await carregarTesseract();
  progresso?.('Preparando o reconhecimento de texto (primeira vez pode demorar)…');
  const worker = await T.createWorker('por', 1, {
    logger: m => { if (m.status === 'recognizing text') progresso?.(`Lendo página ${atual} de ${imagens.length}… ${Math.round(m.progress * 100)}%`); }
  });
  let atual = 0;
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    const linhas = [];
    for (const img of imagens) {
      atual++;
      const { data } = await worker.recognize(img);
      linhas.push(...String(data.text || '').split(/\r?\n/));
    }
    return linhas;
  } finally { await worker.terminate(); }
}

/** Arquivo (PDF, imagem ou texto) → linhas de texto do extrato. */
export async function linhasDoExtrato(arquivo, progresso) {
  const nome = (arquivo.name || '').toLowerCase();
  if (/^image\//.test(arquivo.type) || /\.(png|jpe?g|webp|bmp|tiff?)$/.test(nome)) return ocr([arquivo], progresso);
  if (arquivo.type !== 'application/pdf' && !nome.endsWith('.pdf')) return (await arquivo.text()).split(/\r?\n/);
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  progresso?.('Lendo o PDF…');
  const texto = await extrairLinhas(dados.slice());
  if (extratoLegivel(texto)) return texto;
  // PDF escaneado: desenha cada página em alta resolução e reconhece o texto
  const lib = await carregarPdfjs();
  const doc = await lib.getDocument({ data: dados, isEvalSupported: false }).promise;
  const imagens = [];
  for (let p = 1; p <= Math.min(doc.numPages, 15); p++) {
    progresso?.(`Preparando página ${p} de ${doc.numPages}…`);
    const pag = await doc.getPage(p);
    const vp = pag.getViewport({ scale: 3 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await pag.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    imagens.push(canvas);
    pag.cleanup();
  }
  await doc.destroy();
  return ocr(imagens, progresso);
}
