// SISDIFI — Leitor mínimo de planilhas .xlsx (sem bibliotecas externas).
// Abre o ZIP, descompacta com DecompressionStream e devolve as linhas da 1ª aba como matriz de valores.
// Usado para a planilha de repasse decendial do IPI da SEF/MG.

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** Lista e extrai os arquivos de um ZIP. Retorna Map nome → Uint8Array. */
export async function abrirZip(dados) {
  const b = dados instanceof Uint8Array ? dados : new Uint8Array(dados);
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (u32(b, i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw Error('Arquivo não é uma planilha .xlsx válida.');
  const total = u16(b, fim + 10);
  let p = u32(b, fim + 16);
  const arquivos = new Map();
  for (let n = 0; n < total; n++) {
    if (u32(b, p) !== 0x02014b50) throw Error('Planilha corrompida (diretório do ZIP).');
    const metodo = u16(b, p + 10), tamanho = u32(b, p + 20), lenNome = u16(b, p + 28), lenExtra = u16(b, p + 30), lenCom = u16(b, p + 32), local = u32(b, p + 42);
    const nome = new TextDecoder().decode(b.subarray(p + 46, p + 46 + lenNome));
    const inicio = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    const bruto = b.subarray(inicio, inicio + tamanho);
    arquivos.set(nome, { metodo, bruto });
    p += 46 + lenNome + lenExtra + lenCom;
  }
  const ler = async nome => {
    const a = arquivos.get(nome); if (!a) return null;
    if (a.metodo === 0) return a.bruto;
    if (a.metodo !== 8) throw Error('Compressão da planilha não suportada.');
    const fluxo = new Blob([a.bruto]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(fluxo).arrayBuffer());
  };
  return { nomes: [...arquivos.keys()], ler };
}

const desescapar = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, '&');
const coluna = ref => { let n = 0; for (const c of ref.replace(/\d+/g, '')) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };

/** .xlsx → linhas da primeira aba ([[valor, ...], ...]); números como Number, textos como String. */
export async function lerXlsx(dados) {
  const zip = await abrirZip(dados);
  const txt = async n => { const b = await zip.ler(n); return b ? new TextDecoder().decode(b) : ''; };
  const compartilhadas = [];
  const ss = await txt('xl/sharedStrings.xml');
  for (const si of ss.match(/<si>[\s\S]*?<\/si>/g) || []) compartilhadas.push(desescapar((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')));
  const abas = zip.nomes.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!abas.length) throw Error('A planilha não tem abas.');
  const xml = await txt(abas[0]);
  const linhas = [];
  for (const row of xml.match(/<row\b[\s\S]*?<\/row>/g) || []) {
    const r = Number((/\br="(\d+)"/.exec(row) || [])[1]) - 1;
    const linha = [];
    for (const c of row.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const ref = (/\br="([A-Z]+\d+)"/.exec(c) || [])[1]; if (!ref) continue;
      const tipo = (/\bt="(\w+)"/.exec(c) || [])[1] || 'n';
      const v = (/<v>([\s\S]*?)<\/v>/.exec(c) || [])[1];
      let valor = null;
      if (tipo === 's') valor = compartilhadas[Number(v)] ?? '';
      else if (tipo === 'inlineStr') valor = desescapar(((/<t[^>]*>([\s\S]*?)<\/t>/.exec(c) || [])[1]) || '');
      else if (tipo === 'str') valor = desescapar(v ?? '');
      else if (tipo === 'b') valor = v === '1';
      else if (v !== undefined) valor = Number(v);
      linha[coluna(ref)] = valor;
    }
    linhas[r >= 0 ? r : linhas.length] = linha;
  }
  return Array.from(linhas, l => l || []);
}
