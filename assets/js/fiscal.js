// =============================================================
// SISDIFI — Conferência fiscal de notas de fornecedores (motor de regras, sem tela)
// Lê o código de barras / chave / CNPJ / XML, consulta o CNPJ e confere, para a liquidação:
//   • Simples Nacional (opção na data da nota)          • IRRF — IN RFB 1.234/2012 (redação da IN RFB 2.145/2023)
//   • ISSQN — Frei Inocêncio/MG, 3% ou 5% por subitem    • CBS e IBS — LC 214/2025 (ano-teste 2026 e transição)
// Aponta cada divergência da nota com o que fazer para resolver.
// =============================================================

/** Município do órgão (tomador). Código IBGE de Frei Inocêncio/MG. */
import { issDevidoAqui, ONDE as ISS_ONDE, admiteDeducaoTerceiros, DEDUCAO_TERCEIROS } from './iss-local.js';
import { aliquotaAnexo, ANEXO_II, FUNDAMENTO_ANEXO_II, ANEXO_II_CURTO } from './iss-anexo2.js';

export const MUNICIPIO = { nome: 'Frei Inocêncio', uf: 'MG', ibge: '3126901' };

/** ISSQN das notas emitidas no município. */
export const ISS = {
  aliquota: 5,             // alíquota de Frei Inocêncio para os serviços prestados no Município (informada pela Contabilidade)
  retemOrgao: true,        // o Município, como tomador, retém o ISS das notas emitidas no município
  minimoSimples: 2,        // LC 123/2006: alíquota do ISS no Simples fica entre 2% e 5%
  maximoSimples: 5
};

/**
 * Alíquota do ISS para o código de tributação, em três degraus:
 *   1. exceção cadastrada em config/fiscal (mais específica primeiro: 16.01.01 > 16.01 > 16).
 *      Fica acima da lei de propósito: se uma lei posterior mudar uma alíquota,
 *      Tributos cadastra ali sem esperar atualização do sistema.
 *   2. tabela do Município, na data da emissão: o Anexo II da Lei 883/2017,
 *      conferido contra o cadastro do Município no Emissor Nacional da NFS-e.
 *      As duas fontes batem em 197 dos 199 subitens, e é essa alíquota que o
 *      Emissor Nacional imprime na nota — por isso ela vale, e não um padrão fixo.
 *   3. padrão, só para código fora da lista (ou nota sem código de serviço).
 * parametros = { issPadrao, issPorCodigo: { '16.01': 2.5, … } }.
 */
export function aliquotaIss(codigo, parametros = null, emissao = '') {
  const padrao = Number(parametros?.issPadrao) > 0 ? Number(parametros.issPadrao) : ISS.aliquota;
  const tabela = parametros?.issPorCodigo || {};
  const lei = aliquotaAnexo(codigo, emissao);
  const anexo = lei && !lei.vetado ? lei.aliquota : null;
  const vetado = lei && lei.vetado ? lei.subitem : null;
  const sub = lei ? lei.subitem : null;
  const c = String(codigo || '').replace(/\D/g, '');
  for (const tam of [6, 4, 2]) {
    if (c.length < tam) continue;
    const chave = Object.keys(tabela).find(k => k.replace(/\D/g, '') === c.slice(0, tam));
    if (chave && Number(tabela[chave]) > 0) {
      return { aliquota: Number(tabela[chave]), excecao: chave, fonte: 'cadastro', anexo, subitem: sub, vetado };
    }
  }
  /* Alíquota única: a Contabilidade informou que a legislação municipal vigente
     aplica 5% a todos os serviços prestados em Frei Inocêncio. A tabela por
     subitem do Anexo II (3% ou 5%) só vale se o administrador ligar
     "issPorSubitem" em "Alíquotas do ISS". */
  if (parametros?.issPorSubitem !== true) return { aliquota: padrao, excecao: null, fonte: 'unica', anexo, subitem: sub, vetado };
  if (anexo) return { aliquota: anexo, excecao: null, fonte: 'lei', anexo, subitem: sub, vetado, anterior: !!lei.anterior, ate: lei.ate };
  return { aliquota: padrao, excecao: null, fonte: 'padrao', anexo, subitem: sub, vetado };
}

/** Dispensa de retenção de valor inferior a R$ 10,00 (IN RFB 1.234/2012, art. 3º, § 6º). */
export const MINIMO_RETENCAO_IR = 10;

/**
 * Natureza do bem ou serviço → alíquota do IR (coluna "IR" do Anexo I da IN RFB 1.234/2012).
 * Estados, DF e municípios retêm só o IR (IN RFB 2.145/2023); CSLL, Cofins e PIS não são retidos pelo Município.
 */
export const NATUREZAS = [
  { id: 'mercadorias', grupo: 'Bens', texto: 'Mercadorias e bens em geral', ir: 1.2, codigo: '6147' },
  { id: 'alimentacao', grupo: 'Bens', texto: 'Alimentação', ir: 1.2, codigo: '6147' },
  { id: 'energia', grupo: 'Bens', texto: 'Energia elétrica', ir: 1.2, codigo: '6147' },
  { id: 'farmaceuticos', grupo: 'Bens', texto: 'Produtos farmacêuticos, de perfumaria, toucador e higiene pessoal', ir: 1.2, codigo: '6147' },
  { id: 'combustiveis', grupo: 'Bens', texto: 'Combustíveis (gasolina, diesel, GLP, querosene de aviação, etanol, biodiesel)', ir: 0.24, codigo: '9060' },
  { id: 'servicos_materiais', grupo: 'Serviços', texto: 'Serviços prestados com emprego de materiais', ir: 1.2, codigo: '6147', servico: true },
  { id: 'construcao_materiais', grupo: 'Serviços', texto: 'Construção civil por empreitada com emprego de materiais', ir: 1.2, codigo: '6147', servico: true, inss: true },
  { id: 'hospitalares', grupo: 'Serviços', texto: 'Serviços hospitalares (art. 30)', ir: 1.2, codigo: '6147', servico: true },
  { id: 'diagnostico', grupo: 'Serviços', texto: 'Auxílio diagnóstico e terapia, patologia clínica, imagem, análises clínicas (art. 31)', ir: 1.2, codigo: '6147', servico: true },
  { id: 'transporte_cargas', grupo: 'Serviços', texto: 'Transporte de cargas', ir: 1.2, codigo: '6147', servico: true },
  { id: 'transporte_passageiros', grupo: 'Serviços', texto: 'Passagens e transporte de passageiros (aéreo, rodoviário etc.)', ir: 2.4, codigo: '6175', servico: true },
  { id: 'bancos', grupo: 'Serviços', texto: 'Serviços de bancos, financeiras, seguradoras e seguro-saúde', ir: 2.4, codigo: '6188', servico: true },
  { id: 'cooperativas', grupo: 'Serviços', texto: 'Cooperativa de trabalho/transporte ou associação profissional — serviços pessoais dos cooperados', ir: 1.5, codigo: '3280', servico: true, cooperativa: true },
  { id: 'limpeza', grupo: 'Serviços', texto: 'Limpeza, conservação, manutenção, vigilância e segurança', ir: 4.8, codigo: '6190', servico: true, inss: true },
  { id: 'mao_de_obra', grupo: 'Serviços', texto: 'Locação ou cessão de mão de obra', ir: 4.8, codigo: '6190', servico: true, inss: true },
  { id: 'locacao', grupo: 'Serviços', texto: 'Locação ou administração de bens móveis e imóveis', ir: 4.8, codigo: '6190', servico: true },
  { id: 'agua_telefone', grupo: 'Serviços', texto: 'Água, telefone, correios', ir: 4.8, codigo: '6190', servico: true },
  { id: 'demais_servicos', grupo: 'Serviços', texto: 'Demais serviços (consultoria, assessoria, software, publicidade, cursos, profissionais etc.)', ir: 4.8, codigo: '6190', servico: true }
];
export const natureza = id => NATUREZAS.find(n => n.id === id) || null;

/**
 * CBS e IBS por ano (LC 214/2025). 2026: alíquotas de teste, informativas (não somam ao total, não há retenção).
 * 2027: CBS = alíquota de referência − 0,1 p.p. e IBS 0,05% + 0,05%, com o redutor das compras governamentais (art. 472).
 * Os números de 2027 são a proposta do TCU de 28/10/2026 e dependem de Resolução do Senado — revise quando sair.
 */
export const CBS_IBS = {
  2026: { cbs: 0.9, ibsUF: 0.1, ibsMun: 0, redutor: 0, teste: true, obrigatorioNFe: '2026-08-03' },
  2027: { cbs: 11.2, ibsUF: 0.05, ibsMun: 0.05, redutor: 44.16, provisorio: true }
};
export function parametrosCbsIbs(ano) {
  const anos = Object.keys(CBS_IBS).map(Number).sort((a, b) => a - b);
  if (ano < anos[0]) return null;
  const usar = anos.filter(a => a <= ano).pop();
  return { ano: usar, ...CBS_IBS[usar], repetido: usar !== ano };
}

// ---------------- CNPJ ----------------
const valorChar = ch => ch.charCodeAt(0) - 48; // CNPJ alfanumérico (IN RFB 2.229/2024): letra vale código ASCII − 48
export function limparCnpj(v) { return String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); }
export function cnpjValido(v) {
  const c = limparCnpj(v);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const dv = n => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + valorChar(c[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}
export function formatarCnpj(v) {
  const c = limparCnpj(v);
  return c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c;
}

// ---------------- Código de barras / chave ----------------
function dvModulo11(corpo) {
  let soma = 0, peso = 2;
  for (let i = corpo.length - 1; i >= 0; i--) { soma += valorChar(corpo[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}
const MODELOS = { '55': 'NF-e', '65': 'NFC-e', '57': 'CT-e', '67': 'CT-e OS', '59': 'CF-e SAT', '66': 'NF3-e (energia elétrica)', '62': 'NFCom (telecomunicação)', '63': 'BP-e (passagem)' };

/**
 * Interpreta o que foi lido pelo leitor/câmera ou digitado: chave de NF-e/NFC-e/CT-e (44), chave de NFS-e Nacional (50),
 * QR Code (endereço com a chave), CNPJ (14) ou linha de boleto (47/48, sem CNPJ).
 */
export function lerCodigo(texto, tipo = '') {
  const bruto = String(texto || '').trim();
  if (tipo) {
    const r = lerCodigo(texto);
    const esperado = { nfe: 44, nfse: 50, cnpj: 14 }[tipo];
    const so = bruto.toUpperCase().replace(/[^0-9A-Z]/g, '');
    const okTipo = tipo === 'cnpj' ? r.tipo === 'cnpj' : r.tipo === 'chave' && r.chave.length === esperado;
    if (okTipo) return r;
    if (tipo !== 'cnpj' && r.tipo === 'chave') return { tipo: 'outroTipo', documento: r.documento, esperado };
    return { tipo: 'incompleto', esperado, tamanho: so.length };
  }
  if (!bruto) return { tipo: 'vazio' };
  const so = bruto.toUpperCase().replace(/[^0-9A-Z]/g, '');
  // QR Code da NFC-e / NFS-e: endereço com a chave dentro
  const candidatos = [so, ...(bruto.toUpperCase().match(/[0-9A-Z]{44,53}/g) || [])];
  for (const c0 of candidatos) {
    const c = c0.startsWith('NFS') && c0.length === 53 ? c0.slice(3) : c0.startsWith('NFE') && c0.length === 47 ? c0.slice(3) : c0;
    if (c.length === 44 && /^\d{6}[0-9A-Z]{12}\d{26}$/.test(c) && Number(c.slice(4, 6)) >= 1 && Number(c.slice(4, 6)) <= 12) {
      const modelo = c.slice(20, 22);
      return { tipo: 'chave', documento: MODELOS[modelo] || 'Documento modelo ' + modelo, modelo, chave: c,
        valida: dvModulo11(c.slice(0, 43)) === Number(c[43]), cnpj: c.slice(6, 20),
        anoMes: `20${c.slice(2, 4)}-${c.slice(4, 6)}`, serie: String(Number(c.slice(22, 25))), numero: String(Number(c.slice(25, 34))), ufIbge: c.slice(0, 2) };
    }
    if (c.length === 50 && /^\d{9}[0-9A-Z]{14}\d{27}$/.test(c) && Number(c.slice(38, 40)) >= 1 && Number(c.slice(38, 40)) <= 12) {
      const tipoInsc = c[8];
      return { tipo: 'chave', documento: 'NFS-e Nacional', modelo: 'nfse', chave: c,
        valida: dvModulo11(c.slice(0, 49)) === Number(c[49]), municipio: c.slice(0, 7),
        cnpj: tipoInsc === '2' ? c.slice(9, 23) : '', cpf: tipoInsc === '1' ? c.slice(12, 23) : '',
        numero: String(Number(c.slice(23, 36))), anoMes: `20${c.slice(36, 38)}-${c.slice(38, 40)}` };
    }
  }
  if (so.length === 14 && /^[0-9A-Z]{12}\d{2}$/.test(so)) return { tipo: 'cnpj', cnpj: so, valida: cnpjValido(so) };
  if (/^\d{47,48}$/.test(so)) return { tipo: 'boleto' };
  return { tipo: 'desconhecido', tamanho: so.length };
}

// ---------------- XML da nota ----------------
const sem = s => s == null ? '' : String(s);
function bloco(xml, nome) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`));
  return m ? m[1] : '';
}
function tag(xml, nome) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${nome}>`));
  return m ? decodificar(m[1].trim()) : '';
}
function tags(xml, nome) {
  return [...xml.matchAll(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${nome}>`, 'g'))].map(m => decodificar(m[1].trim()));
}
function decodificar(t) { return t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
const num = v => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const numOuNulo = v => (v === '' || v == null ? null : num(v));
const dataDe = v => sem(v).slice(0, 10);

/** Lê o XML de NF-e/NFC-e, NFS-e Nacional ou NFS-e ABRASF e devolve os dados para a conferência. */
export function lerXML(xml) {
  const x = String(xml || '');
  if (/<(?:\w+:)?infNFe[\s>]/.test(x)) return lerNFe(x);
  if (/<(?:\w+:)?infNFSe[\s>]/.test(x) || /<(?:\w+:)?infDPS[\s>]/.test(x)) return lerNFSeNacional(x);
  if (/<(?:\w+:)?(?:InfNfse|CompNfse|Nfse|InfDeclaracaoPrestacaoServico)[\s>]/i.test(x)) return lerNFSeAbrasf(x);
  throw new Error('XML não reconhecido. Use o XML da NF-e, NFC-e ou NFS-e (padrão nacional ou municipal).');
}

function lerIbsCbs(x) {
  const g = bloco(x, 'IBSCBSTot') || bloco(x, 'totCIBS') || bloco(x, 'IBSCBS');
  if (!g) return null;
  const pCBS = numOuNulo(tag(x, 'pCBS')), pIBSUF = numOuNulo(tag(x, 'pIBSUF')), pIBSMun = numOuNulo(tag(x, 'pIBSMun'));
  const vCBS = numOuNulo(tag(g, 'vCBS')) ?? numOuNulo(tag(x, 'vCBS'));
  const vIBS = numOuNulo(tag(g, 'vIBS')) ?? numOuNulo(tag(g, 'vIBSTot')) ?? numOuNulo(tag(x, 'vIBSTot')) ?? numOuNulo(tag(x, 'vIBS'));
  const base = numOuNulo(tag(g, 'vBCIBSCBS')) ?? numOuNulo(tag(x, 'vBC'));
  return { cst: tags(x, 'CST').find(c => /^\d{3}$/.test(c)) || '', classTrib: tag(x, 'cClassTrib'), pCBS, pIBSUF, pIBSMun, vCBS, vIBS, base };
}

function lerNFe(x) {
  const ide = bloco(x, 'ide'), emit = bloco(x, 'emit'), tot = bloco(x, 'ICMSTot'), ret = bloco(x, 'retTrib');
  const infCpl = tag(bloco(x, 'infAdic'), 'infCpl');
  const crt = tag(emit, 'CRT');
  const ncms = tags(x, 'NCM');
  const irTexto = irNoTexto(infCpl);
  return {
    origem: 'xml', documento: ({ 55: 'NF-e', 65: 'NFC-e' })[tag(ide, 'mod')] || 'NF-e', modelo: tag(ide, 'mod'),
    chave: (x.match(/Id="NFe(\d{44})"/) || [])[1] || tag(x, 'chNFe'),
    numero: tag(ide, 'nNF'), serie: tag(ide, 'serie'), emissao: dataDe(tag(ide, 'dhEmi') || tag(ide, 'dEmi')),
    cnpj: tag(emit, 'CNPJ'), nome: tag(emit, 'xNome'), municipioEmissor: tag(bloco(emit, 'enderEmit'), 'cMun'),
    tomadorCnpj: tag(bloco(x,'dest'),'CNPJ'), tomadorNome: tag(bloco(x,'dest'),'xNome'),
    valor: num(tag(tot, 'vNF')), regimeNota: crt === '3' ? 'normal' : crt === '4' ? 'mei' : crt ? 'simples' : '',
    regimeNotaTexto: ({ 1: 'CRT 1 — Simples Nacional', 2: 'CRT 2 — Simples Nacional, excesso de sublimite', 3: 'CRT 3 — Regime normal', 4: 'CRT 4 — MEI' })[crt] || '',
    irrfDestacado: numOuNulo(tag(ret, 'vIRRF')) ?? irTexto,
    issValor: numOuNulo(tag(bloco(x, 'ISSQNtot'), 'vISS')), issAliquota: numOuNulo(tag(x, 'vAliq')), issRetido: numOuNulo(tag(bloco(x, 'retTrib'), 'vRetISS')) ?? null,
    servico: !!bloco(x, 'ISSQNtot'), combustivel: ncms.length > 0 && ncms.every(n => /^(2710|2711|2207|3826)/.test(n)),
    ibscbs: lerIbsCbs(x), informacoes: infCpl
  };
}

function lerNFSeNacional(x) {
  const inf = bloco(x, 'infNFSe') || x, dps = bloco(x, 'infDPS') || x;
  const prest = bloco(dps, 'prest'), emit = bloco(inf, 'emit');
  const tribMun = bloco(dps, 'tribMun'), tribFed = bloco(dps, 'tribFed'), vals = bloco(inf, 'valores');
  const op = tag(bloco(prest, 'regTrib'), 'opSimpNac');
  const tpRet = tag(tribMun, 'tpRetISSQN');
  return {
    origem: 'xml', documento: 'NFS-e Nacional', modelo: 'nfse',
    chave: (x.match(/Id="NFS(\w{50})"/i) || [])[1] || '',
    numero: tag(inf, 'nNFSe'), emissao: dataDe(tag(dps, 'dhEmi') || tag(inf, 'dhProc')),
    cnpj: tag(emit, 'CNPJ') || tag(prest, 'CNPJ'), nome: tag(emit, 'xNome') || tag(prest, 'xNome'),
    tomadorCnpj: tag(bloco(dps,'toma'),'CNPJ') || tag(bloco(inf,'toma'),'CNPJ'),
    tomadorNome: tag(bloco(dps,'toma'),'xNome') || tag(bloco(inf,'toma'),'xNome'),
    municipioEmissor: tag(dps, 'cLocEmi') || tag(bloco(emit, 'enderNac'), 'cMun') || tag(inf, 'cLocIncid'),
    municipioIncidencia: tag(inf, 'cLocIncid'), incidencia: tag(inf, 'cLocIncid'),
    localPrestacao: tag(bloco(dps, 'locPrest'), 'cLocPrestacao') || tag(dps, 'cLocPrestacao') || tag(inf, 'cLocIncid'),
    valor: num(tag(bloco(dps, 'vServPrest'), 'vServ') || tag(dps, 'vServ')),
    regimeNota: op === '1' ? 'normal' : op === '2' ? 'mei' : op === '3' ? 'simples' : '',
    regimeNotaTexto: ({ 1: 'Não optante pelo Simples Nacional', 2: 'MEI', 3: 'ME/EPP do Simples Nacional' })[op] || '',
    servico: true, codigoServico: tag(bloco(dps, 'cServ'), 'cTribNac'), descricaoServico: tag(bloco(dps, 'cServ'), 'xDescServ'),
    irrfDestacado: numOuNulo(tag(tribFed, 'vRetIRRF')),
    inssRetido: numOuNulo(tag(tribFed, 'vRetCP')),
    csrfRetido: numOuNulo(tag(tribFed, 'vRetCSLL')),
    liquidoNota: numOuNulo(tag(vals, 'vLiq')),
    totalRetencoesNota: numOuNulo(tag(vals, 'vTotalRet')),
    issAliquota: numOuNulo(tag(vals, 'pAliqAplic')) ?? numOuNulo(tag(tribMun, 'pAliq')),
    issValor: numOuNulo(tag(vals, 'vISSQN')),
    issRetidoNota: tpRet ? tpRet !== '1' : null,
    ibscbs: lerIbsCbs(x)
  };
}

function lerNFSeAbrasf(x) {
  const v = bloco(x, 'Valores') || bloco(x, 'ValoresServico') || x;
  const prest = bloco(x, 'PrestadorServico') || bloco(x, 'Prestador') || bloco(x, 'IdentificacaoPrestador');
  const op = tag(x, 'OptanteSimplesNacional');
  const ret = tag(x, 'IssRetido');
  let aliq = numOuNulo(tag(v, 'Aliquota'));
  if (aliq != null && aliq > 0 && aliq < 1) aliq = Math.round(aliq * 10000) / 100; // alguns provedores usam 0,05
  return {
    origem: 'xml', documento: 'NFS-e', modelo: 'nfse',
    numero: tag(x, 'Numero'), emissao: dataDe(tag(x, 'DataEmissao') || tag(x, 'Competencia')),
    cnpj: tag(prest, 'Cnpj') || tag(x, 'Cnpj'), nome: tag(prest, 'RazaoSocial') || tag(x, 'RazaoSocial'),
    tomadorCnpj: tag(bloco(x,'TomadorServico'),'Cnpj'),
    tomadorNome: tag(bloco(x,'TomadorServico'),'RazaoSocial'),
    municipioEmissor: tag(bloco(x, 'Endereco'), 'CodigoMunicipio') || tag(x, 'CodigoMunicipio'),
    localPrestacao: tag(x, 'MunicipioPrestacaoServico') || tag(bloco(x, 'Servico'), 'CodigoMunicipio') || tag(x, 'MunicipioIncidencia'),
    valor: num(tag(v, 'ValorServicos')),
    regimeNota: op === '1' ? 'simples' : op === '2' ? 'normal' : '',
    regimeNotaTexto: op === '1' ? 'Optante pelo Simples Nacional' : op === '2' ? 'Não optante pelo Simples Nacional' : '',
    servico: true, codigoServico: tag(x, 'ItemListaServico') || tag(x, 'CodigoTributacaoMunicipio'), descricaoServico: tag(x, 'Discriminacao'),
    inssRetido: numOuNulo(tag(v, 'ValorInss')),
    liquidoNota: numOuNulo(tag(x, 'ValorLiquidoNfse')),
    csrfRetido: ['ValorPis', 'ValorCofins', 'ValorCsll'].reduce((soma, campo) => soma + num(tag(v, campo)), 0),
    irrfDestacado: numOuNulo(tag(v, 'ValorIr')), issAliquota: aliq, issValor: numOuNulo(tag(v, 'ValorIss')),
    issRetidoNota: ret ? ret === '1' : null, ibscbs: lerIbsCbs(x)
  };
}

/** Procura "IR … R$ 12,34" nas informações complementares (forma comum de destacar a retenção na NF-e). */
export function irNoTexto(texto) {
  const t = sem(texto).toUpperCase();
  const k = t.match(/IRRF|I\.R\.R\.F|IMPOSTO\s+(?:SOBRE\s+A|DE)\s+RENDA|\bIR\b/);
  if (!k) return null;
  const trecho = t.slice(k.index + k[0].length, k.index + k[0].length + 70);
  // o primeiro valor em reais depois da palavra (ignora o percentual, ex.: "4,80%")
  for (const m of trecho.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2})(\s*%)?/g)) {
    if (m[2]) continue;
    const v = m[1].includes(',') ? Number(m[1].replace(/\./g, '').replace(',', '.')) : Number(m[1]);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

// ---------------- Código de tributação (lista da LC 116/2003 / código de tributação nacional da NFS-e) ----------------
const ITENS_LC116 = {
  '01': 'Informática', '02': 'Pesquisa e desenvolvimento', '03': 'Cessão de direito de uso e locação de espaços', '04': 'Saúde e assistência médica',
  '05': 'Medicina veterinária', '06': 'Cuidados pessoais, estética e atividades físicas', '07': 'Engenharia, construção civil, obras e limpeza urbana',
  '08': 'Educação, ensino e treinamento', '09': 'Hospedagem, turismo e viagens', '10': 'Intermediação e agenciamento', '11': 'Guarda, estacionamento e vigilância',
  '12': 'Diversões, lazer e entretenimento', '13': 'Fonografia, fotografia, cinematografia e reprografia', '14': 'Manutenção e conserto de bens',
  '15': 'Serviços bancários e financeiros', '16': 'Transporte de natureza municipal', '17': 'Apoio técnico, administrativo, jurídico, contábil e comercial',
  '18': 'Regulação de sinistros e seguros', '19': 'Loterias e apostas', '20': 'Portos, aeroportos e terminais', '21': 'Registros públicos e cartórios',
  '22': 'Exploração de rodovia', '23': 'Programação e comunicação visual', '24': 'Chaveiros, carimbos e placas', '25': 'Serviços funerários',
  '26': 'Coleta e entrega de correspondências (courier)', '27': 'Assistência social', '28': 'Avaliação de bens', '29': 'Biblioteconomia',
  '30': 'Biologia, biotecnologia e química', '31': 'Serviços técnicos em edificações, eletrônica e telecomunicações', '32': 'Desenhos técnicos',
  '33': 'Desembaraço aduaneiro', '34': 'Investigações particulares', '35': 'Reportagem, jornalismo e relações públicas', '36': 'Meteorologia',
  '37': 'Artistas, atletas e modelos', '38': 'Museologia', '39': 'Ourivesaria e lapidação', '40': 'Obras de arte sob encomenda'
};
// Subitens com natureza própria no Anexo I da IN 1.234 ou ISS devido no local da prestação (LC 116/2003, art. 3º)
const SUBITENS = {
  '0402': { texto: 'Análises clínicas, patologia, imagem, radiologia e diagnóstico', natureza: 'diagnostico' },
  '0403': { texto: 'Hospitais, clínicas, laboratórios e prontos-socorros', natureza: 'hospitalares' },
  '0702': { texto: 'Execução de obras de construção civil', natureza: 'construcao_materiais', local: true, dica: 'Se a obra for só mão de obra, sem materiais, escolha "Demais serviços" (4,8%).' },
  '0704': { texto: 'Demolição', local: true },
  '0705': { texto: 'Reparação, conservação e reforma de edifícios, estradas e pontes', natureza: 'construcao_materiais', local: true, dica: 'Sem fornecimento de materiais, escolha "Demais serviços" (4,8%).' },
  '0709': { texto: 'Varrição, coleta, remoção e destinação de lixo', natureza: 'limpeza', local: true },
  '0710': { texto: 'Limpeza, manutenção e conservação de vias, imóveis e piscinas', natureza: 'limpeza', local: true },
  '0711': { texto: 'Decoração, jardinagem, corte e poda de árvores', local: true },
  '0712': { texto: 'Controle e tratamento de efluentes', local: true },
  '0716': { texto: 'Florestamento e reflorestamento', local: true },
  '0717': { texto: 'Escoramento e contenção de encostas', local: true },
  '0719': { texto: 'Acompanhamento e fiscalização de obras', local: true },
  '1102': { texto: 'Vigilância, segurança ou monitoramento', natureza: 'limpeza', local: true },
  '1104': { texto: 'Armazenamento, depósito, carga e descarga', local: true },
  '1401': { texto: 'Lubrificação, limpeza, conserto e manutenção de máquinas e veículos', dica: 'Se a nota incluir peças/materiais discriminados, escolha "Serviços prestados com emprego de materiais" (1,2%).' },
  '1601': { texto: 'Transporte coletivo municipal de passageiros (rodoviário, metroviário, ferroviário, aquaviário)', natureza: 'transporte_passageiros', local: true,
    dica: 'ISS devido no município onde o transporte é executado (LC 116/2003, art. 3º, XIX).' },
  '1602': { texto: 'Outros serviços de transporte de natureza municipal', natureza: 'transporte_cargas', local: true,
    dica: 'Transporte de pessoas (ex.: transporte escolar) é "Passagens e transporte de passageiros" (2,4%); de cargas, 1,2%.' },
  '1705': { texto: 'Fornecimento de mão de obra', natureza: 'mao_de_obra', local: true },
  '1710': { texto: 'Planejamento e organização de eventos', local: true }
};

/** Descreve o código de tributação (16.01.01, 1601, 160101…) e sugere a natureza do IRRF. */
export function descreverTributacao(codigo) {
  const c = sem(codigo).replace(/\D/g, '');
  if (c.length < 2) return null;
  const item = c.slice(0, 2), sub = c.slice(0, 4);
  const nomeItem = ITENS_LC116[item];
  if (!nomeItem) return { codigo: c, valido: false, texto: 'Código não encontrado na lista da LC 116/2003' };
  const s = c.length >= 4 ? SUBITENS[sub] : null;
  const fmt = [c.slice(0, 2), c.slice(2, 4), c.slice(4, 6)].filter(Boolean).join('.');
  const porItem = { '15': 'bancos', '03': 'locacao' }[item];
  return { codigo: fmt, valido: true, item, subitem: sub, texto: s?.texto || nomeItem, grupo: nomeItem, natureza: s?.natureza || porItem || 'demais_servicos', dica: s?.dica || '', issNoLocal: !!s?.local };
}

/** Sugere a natureza (Anexo I) a partir da nota. A Contabilidade confirma. */
export function sugerirNatureza(doc) {
  if (!doc) return 'mercadorias';
  if (doc.combustivel) return 'combustiveis';
  const porModelo = { '66': 'energia', '62': 'agua_telefone', '57': 'transporte_cargas', '67': 'transporte_passageiros', '63': 'transporte_passageiros' }[String(doc.modelo)];
  if (porModelo) return porModelo;
  const trib = descreverTributacao(doc.codigoServico);
  if (!doc.servico && !trib?.valido) return 'mercadorias';
  if (!trib?.valido) return 'demais_servicos';
  const desc = sem(doc.descricaoServico);
  if (trib.subitem === '1602' && /passag|passageir|escolar|pessoas|alunos/i.test(desc)) return 'transporte_passageiros';
  if (trib.subitem === '1401' && /pe[cç]as|materia/i.test(desc)) return 'servicos_materiais';
  return trib.natureza;
}

// ---------------- Verificação da natureza do serviço ----------------
// CNAE (classe/divisão) → itens da lista da LC 116 compatíveis. Aproximação para apontar divergências, não para enquadrar.
const CNAE_ITENS = [
  [/^49(21|22|23|24|29)/, ['16'], 'transporte de passageiros'], [/^4930/, ['16'], 'transporte de cargas'], [/^50|^51/, ['16', '20'], 'transporte aquaviário/aéreo'],
  [/^52/, ['11', '20', '16'], 'armazenagem e apoio ao transporte'], [/^53/, ['26'], 'correio e entregas'],
  [/^77/, [], 'locação de bens móveis (veículos, máquinas, equipamentos)'],
  [/^4[123]/, ['07'], 'construção'], [/^711/, ['07', '17', '28', '30', '32'], 'arquitetura e engenharia'], [/^712/, ['17', '28', '30'], 'ensaios e análises técnicas'],
  [/^81/, ['07', '11'], 'limpeza, conservação e paisagismo'], [/^38|^39/, ['07'], 'coleta e tratamento de resíduos'], [/^37/, ['07'], 'esgoto'],
  [/^6[23]/, ['01'], 'tecnologia da informação'], [/^85/, ['08'], 'educação'], [/^8[678]/, ['04', '27'], 'saúde e assistência social'], [/^75/, ['05'], 'veterinária'],
  [/^69|^70/, ['17'], 'contabilidade, jurídico e consultoria'], [/^73/, ['17', '23', '10'], 'publicidade e pesquisa de mercado'], [/^74/, ['17', '13', '23', '39'], 'design, fotografia e serviços técnicos'],
  [/^78/, ['17'], 'agenciamento e locação de mão de obra'], [/^80/, ['11'], 'vigilância e segurança'], [/^82/, ['17', '11', '10'], 'serviços administrativos e de escritório'],
  [/^33|^452|^4543|^95/, ['14'], 'manutenção e reparação'], [/^55/, ['09'], 'hospedagem'], [/^56/, ['17', '09'], 'alimentação'], [/^79/, ['09', '10'], 'agências de viagens'],
  [/^59|^60/, ['13', '12', '17'], 'audiovisual e rádio'], [/^18/, ['13', '24'], 'impressão e reprodução'], [/^90|^91|^93/, ['12', '37', '38', '06'], 'cultura, esporte e lazer'],
  [/^6[456]/, ['15', '18', '10'], 'serviços financeiros e seguros'], [/^68/, ['10', '03'], 'atividades imobiliárias'], [/^72/, ['02'], 'pesquisa e desenvolvimento'],
  [/^96/, ['06', '25', '14'], 'serviços pessoais'], [/^4[5-7]/, [], 'comércio (venda de mercadorias)']
];
export function itensDoCnae(cnae) {
  const c = sem(cnae).replace(/\D/g, '');
  const r = CNAE_ITENS.find(([re]) => re.test(c));
  return r ? { itens: r[1], grupo: r[2] } : null;
}
const formatarCnae = c => { const d = sem(c).replace(/\D/g, '').padStart(7, '0'); return `${d.slice(0, 4)}-${d[4]}/${d.slice(5)}`; };

// Palavras da descrição → subitem/itens esperados
const PALAVRAS_SERVICO = [
  { re: /transporte escolar|fretamento|frete de (?:onibus|van|veiculo)|veiculo com (?:motorista|condutor)|com motorista|locacao de (?:onibus|van|micro-?onibus|veiculo)s? com/, esperado: ['1602'], texto: 'transporte escolar, fretamento ou veículo com motorista à disposição',
    nota: 'O 16.01 é o transporte coletivo municipal (linhas regulares, concessão/permissão). Transporte escolar, fretamento e veículo com motorista são 16.02 — "outros serviços de transporte de natureza municipal". A alíquota cadastrada pelo Município pode ser diferente entre os dois códigos.' },
  { re: /locacao de (?:veiculo|automovel|carro|maquina|equipamento|caminhao)(?![^.]*\bcom (?:motorista|condutor|operador))/, esperado: [], texto: 'locação de bem móvel sem motorista/operador',
    nota: 'Locação de bem móvel pura não é serviço sujeito ao ISS (Súmula Vinculante 31 do STF); para o IRRF, use a natureza "Locação de bens móveis" (4,8%). Se houver motorista ou operador, é serviço (transporte 16.02 ou outro).' },
  { re: /\b(?:obra|construcao|pavimentacao|reforma|edificacao|drenagem)\b/, esperado: ['07'], texto: 'obra ou reforma' },
  { re: /\b(?:limpeza|higienizacao|conservacao predial|jardinagem|rocada|capina|poda)\b/, esperado: ['07', '11'], texto: 'limpeza, conservação ou jardinagem' },
  { re: /\b(?:manutencao|conserto|reparo|revisao) (?:de |do |da |dos |das |em )?(?:veiculo|maquina|equipamento|ar condicionado|impressora|computador|motor)/, esperado: ['14'], texto: 'manutenção ou conserto de bens' },
  { re: /\b(?:software|sistema de gestao|licenca de uso|hospedagem de site|suporte tecnico em (?:sistema|software|informatica))/, esperado: ['01'], texto: 'informática / software' },
  { re: /\b(?:curso|treinamento|capacitacao|palestra|oficina pedagogica)\b/, esperado: ['08', '17', '12'], texto: 'curso, treinamento ou palestra' },
  { re: /\b(?:consulta medica|exame|plantao medico|atendimento medico|fisioterapia|odontolog|psicolog|laboratorio)/, esperado: ['04'], texto: 'saúde' },
  { re: /\b(?:vigilancia|seguranca patrimonial|monitoramento de alarme)/, esperado: ['11'], texto: 'vigilância ou segurança' },
  { re: /\b(?:consultoria|assessoria|auditoria|contabil)/, esperado: ['17'], texto: 'consultoria ou assessoria' },
  { re: /\b(?:publicidade|propaganda|divulgacao|marketing)/, esperado: ['17', '23', '10'], texto: 'publicidade e divulgação' },
  { re: /\b(?:hospedagem|diaria de hotel|hotel|pousada)\b/, esperado: ['09'], texto: 'hospedagem' },
  { re: /\b(?:show|apresentacao artistica|banda|cantor)\b/, esperado: ['12', '37'], texto: 'apresentação artística' }
];
const semAcentos = t => sem(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Confere se o código de tributação, a descrição do serviço, as atividades (CNAE) do CNPJ e a natureza do IRRF combinam.
 * Devolve { linhas: [{ ok, titulo, detalhe }], problemas: [{ nivel, titulo, solucao }] }.
 */
export function verificarNatureza({ doc = {}, cadastro = null, natureza: nat = null } = {}) {
  const linhas = [], problemas = [];
  const trib = descreverTributacao(doc.codigoServico);
  const desc = semAcentos(doc.descricaoServico);
  const sub = trib?.valido ? trib.subitem : '', item = trib?.valido ? trib.item : '';
  if (doc.codigoServico && trib && !trib.valido) problemas.push({ nivel: 'erro', titulo: `Código de tributação ${doc.codigoServico} não existe na lista da LC 116/2003`, solucao: 'Peça ao fornecedor a nota substituta com o código correto do serviço.' });

  // 1) descrição × código
  if (desc && item) {
    const achou = PALAVRAS_SERVICO.find(p => p.re.test(desc));
    if (achou) {
      const casa = achou.esperado.length === 0 ? false : achou.esperado.some(e => (e.length === 4 ? sub === e : item === e));
      linhas.push({ ok: casa, titulo: `Descrição × código: ${casa ? 'compatíveis' : 'divergentes'}`, detalhe: `A descrição indica ${achou.texto}; o código informado é ${trib.codigo} (${trib.texto}).` });
      if (!casa) problemas.push({ nivel: 'alerta', titulo: `Código ${trib.codigo} não corresponde à descrição do serviço (${achou.texto})`,
        solucao: `${achou.nota || `O código esperado é do item ${achou.esperado.join(' ou ')}.`} Peça ao fornecedor a nota substituta com o código correto${achou.esperado.length ? ` (${achou.esperado.map(e => e.length === 4 ? e.slice(0, 2) + '.' + e.slice(2) : 'item ' + e).join(' ou ')})` : ''}.` });
    } else linhas.push({ ok: null, titulo: 'Descrição × código', detalhe: `Código ${trib.codigo} — ${trib.texto}. Confira com a descrição do serviço.` });
  } else if (item && !desc) linhas.push({ ok: null, titulo: 'Descrição do serviço não informada', detalhe: 'Digite ou cole a descrição da nota para conferir com o código.' });

  // 2) código × atividades do CNPJ
  if (cadastro?.cnae && item) {
    const cnaes = [{ codigo: cadastro.cnae, texto: cadastro.cnaeTexto, principal: true }, ...(cadastro.cnaesSecundarios || [])];
    const comp = cnaes.filter(c => itensDoCnae(c.codigo)?.itens.includes(item));
    const conhecidos = cnaes.filter(c => itensDoCnae(c.codigo));
    if (comp.length) linhas.push({ ok: true, titulo: 'Atividade do CNPJ compatível', detalhe: comp.slice(0, 3).map(c => `${formatarCnae(c.codigo)} ${c.texto}${c.principal ? ' (principal)' : ''}`).join('; ') });
    else if (conhecidos.length) {
      linhas.push({ ok: false, titulo: 'Serviço fora das atividades do CNPJ', detalhe: `Atividades: ${conhecidos.slice(0, 4).map(c => `${formatarCnae(c.codigo)} ${c.texto}`).join('; ')}${cnaes.length > 4 ? '…' : ''}` });
      const locadora = itensDoCnae(cadastro.cnae)?.grupo.startsWith('locação');
      problemas.push({ nivel: 'alerta', titulo: `O serviço (${trib.codigo} — item ${trib.grupo}) não aparece entre as atividades (CNAE) do fornecedor`,
        solucao: `${locadora ? 'A atividade principal é locação de bens. Se a prefeitura contratou veículo com motorista, é serviço de transporte (16.02) e a empresa deveria ter CNAE de transporte (ex.: 4924-8/00 transporte escolar, 4929-9 fretamento). ' : ''}Confira o objeto do contrato com o cadastro do fornecedor (CNAE na Receita) e se a nota está com o código correto. Atividade não cadastrada pode indicar nota com código errado ou empresa sem habilitação para o serviço contratado.` });
    } else linhas.push({ ok: null, titulo: 'Atividades do CNPJ', detalhe: `${formatarCnae(cadastro.cnae)} ${cadastro.cnaeTexto || ''} — sem correspondência automática; confira manualmente.` });
  }

  // 3) natureza do IRRF × descrição
  if (nat && desc) {
    if (/transporte escolar|passageir|alunos|fretamento/.test(desc) && nat.id === 'transporte_cargas') problemas.push({ nivel: 'erro', titulo: 'Natureza do IRRF é transporte de cargas, mas o serviço é de passageiros', solucao: 'Escolha "Passagens e transporte de passageiros" (2,4%).' });
    if (/\b(?:com fornecimento de materia|materiais|pecas)\b/.test(desc) && nat.id === 'demais_servicos') problemas.push({ nivel: 'info', titulo: 'A descrição menciona materiais/peças', solucao: 'Se a nota discriminar os materiais aplicados, a natureza do IRRF é "Serviços prestados com emprego de materiais" (1,2%); sem discriminação, mantenha 4,8%.' });
    if (/locacao de (?:veiculo|automovel|carro|maquina|equipamento)/.test(desc) && !/\bcom (?:motorista|condutor|operador)/.test(desc) && nat.id !== 'locacao') problemas.push({ nivel: 'alerta', titulo: 'Descrição de locação de bem, natureza do IRRF diferente de locação', solucao: 'Para locação de bens móveis, a natureza é "Locação ou administração de bens" (4,8%).' });
    linhas.push({ ok: !problemas.some(p => p.titulo.startsWith('Natureza do IRRF')), titulo: 'Natureza do IRRF', detalhe: `${nat.texto} — ${String(nat.ir).replace('.', ',')}%` });
  }
  return { linhas, problemas, tributacao: trib };
}

// ---------------- Consulta do CNPJ (Receita Federal, dados abertos) ----------------
const NATUREZAS_DISPENSA = {
  '3220': 'organização religiosa (art. 4º, I)', '2143': 'cooperativa',
  '3999': 'associação privada — pode ser instituição de educação/assistência social ou filantrópica (art. 4º, III e IV)',
  '3069': 'fundação privada (art. 4º, VIII)', '3131': 'serviço social autônomo (art. 4º, VI)',
  '3077': 'serviço notarial e registral', '3301': 'organização social (OS)', '3328': 'condomínio (art. 4º, IX)',
  '3085': 'condomínio edilício (art. 4º, IX)', '3204': 'sindicato (art. 4º, V)', '3247': 'partido político (art. 4º, II)'
};

/** Normaliza a resposta da BrasilAPI / Minha Receita (mesmo formato) ou da CNPJ.ws. */
export function normalizarCadastro(j, fonte) {
  if (!j) return null;
  if (j.estabelecimento) { // CNPJ.ws
    const e = j.estabelecimento, s = j.simples || {};
    return {
      fonte, cnpj: limparCnpj(e.cnpj), nome: j.razao_social, fantasia: e.nome_fantasia || '',
      situacao: sem(e.situacao_cadastral).toUpperCase(), naturezaCodigo: sem(j.natureza_juridica?.id).replace(/\D/g, ''), naturezaTexto: j.natureza_juridica?.descricao || '',
      cnae: sem(e.atividade_principal?.id), cnaeTexto: e.atividade_principal?.descricao || '',
      cnaesSecundarios: (e.atividades_secundarias || []).map(a => ({ codigo: sem(a.id).replace(/\D/g, ''), texto: a.descricao || '' })),
      municipio: e.cidade?.nome || '', uf: e.estado?.sigla || '', municipioIbge: sem(e.cidade?.ibge_id),
      simples: s.simples == null ? null : /^sim$/i.test(s.simples), simplesInicio: s.data_opcao_simples || '', simplesFim: s.data_exclusao_simples || '',
      mei: /sim/i.test(sem(s.mei)), meiInicio: s.data_opcao_mei || '', meiFim: s.data_exclusao_mei || ''
    };
  }
  return {
    fonte, cnpj: limparCnpj(j.cnpj), nome: j.razao_social, fantasia: j.nome_fantasia || '',
    situacao: sem(j.descricao_situacao_cadastral).toUpperCase(), naturezaCodigo: sem(j.codigo_natureza_juridica).replace(/\D/g, ''), naturezaTexto: j.natureza_juridica || '',
    cnae: sem(j.cnae_fiscal), cnaeTexto: j.cnae_fiscal_descricao || '',
    cnaesSecundarios: (j.cnaes_secundarios || []).filter(a => a && a.codigo).map(a => ({ codigo: sem(a.codigo).replace(/\D/g, ''), texto: a.descricao || '' })),
    municipio: j.municipio || '', uf: j.uf || '', municipioIbge: sem(j.codigo_municipio_ibge),
    simples: typeof j.opcao_pelo_simples === 'boolean' ? j.opcao_pelo_simples : null, simplesInicio: j.data_opcao_pelo_simples || '', simplesFim: j.data_exclusao_do_simples || '',
    mei: j.opcao_pelo_mei === true, meiInicio: j.data_opcao_pelo_mei || '', meiFim: j.data_exclusao_do_mei || ''
  };
}

const FONTES_CNPJ = [
  ['BrasilAPI', c => `https://brasilapi.com.br/api/cnpj/v1/${c}`],
  ['Minha Receita', c => `https://minhareceita.org/${c}`],
  ['CNPJ.ws', c => `https://publica.cnpj.ws/cnpj/${c}`]
];

/** Consulta o CNPJ nas bases públicas (dados abertos da Receita Federal), tentando uma após a outra. */
export async function consultarCnpj(cnpj, { fetchFn = globalThis.fetch, tempo = 12000 } = {}) {
  const c = limparCnpj(cnpj);
  const erros = [];
  for (const [fonte, url] of FONTES_CNPJ) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), tempo) : null;
    try {
      const r = await fetchFn(url(c), { signal: ctl?.signal, headers: { Accept: 'application/json' } });
      if (r.status === 404) { erros.push(`${fonte}: CNPJ não encontrado`); if (fonte === 'BrasilAPI') return { naoEncontrado: true, erros }; continue; }
      if (!r.ok) { erros.push(`${fonte}: HTTP ${r.status}`); continue; }
      const cad = normalizarCadastro(await r.json(), fonte);
      if (cad?.nome) return { cadastro: cad, erros };
      erros.push(`${fonte}: resposta vazia`);
    } catch (e) {
      erros.push(`${fonte}: ${e.name === 'AbortError' ? 'sem resposta' : 'indisponível'}`);
    } finally { if (t) clearTimeout(t); }
  }
  return { cadastro: null, erros };
}

/** Optante na data? (opção até a data e sem exclusão até a data) */
export function optanteNaData(inicio, fim, marcado, data) {
  if (!data || !inicio) return marcado == null ? null : !!marcado;
  if (inicio > data) return false;
  if (fim && fim <= data) return false;
  return true;
}

// ---------------- Conferência ----------------
const r2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
export const moeda = v => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const pct = v => `${String(r2(v)).replace('.', ',')}%`;
const pctTxtF = pct;
const difere = (a, b, tol = 0.05) => a != null && b != null && Math.abs(Number(a) - Number(b)) > tol;

/**
 * Confere a nota para a liquidação.
 * @param {object} p
 *   doc        — dados da nota (lerXML / lerCodigo / digitados): emissao, valor, regimeNota, irrfDestacado, issAliquota, issValor, issRetidoNota, ibscbs, municipioEmissor, documento, modelo, chave, servico
 *   cadastro   — resultado de consultarCnpj (ou null se a consulta falhou)
 *   naturezaId — natureza do Anexo I escolhida
 *   simplesManual — 'sim' | 'nao' | 'mei' | '' (quando a consulta automática não respondeu)
 *   hoje       — 'AAAA-MM-DD' (para testes)
 */
/**
 * O que ainda falta para o diagnóstico da nota ficar completo.
 *
 * A chave de acesso é um identificador: traz município, CNPJ, número e mês,
 * e nada de valores. Depois de escanear sobra o formulário inteiro, e sem
 * uma lista do que falta a conferência parece nunca terminar.
 *
 * Devolve só o que bloqueia, na ordem em que compensa preencher.
 */
export function faltaParaDiagnostico(doc = {}) {
  const falta = [];
  const vazio = v => v == null || v === '' || !Number.isFinite(Number(v)) || Number(v) <= 0;
  if (vazio(doc.valor)) falta.push({ campo: 'valor', rotulo: 'Valor bruto da nota', porque: 'é a base de todas as retenções' });
  if (!doc.emissao || doc.emissaoPresumida) {
    falta.push({ campo: 'emissao', rotulo: 'Data de emissão',
      porque: doc.emissaoPresumida ? 'a chave só informa o mês; confirme o dia na nota' : 'define o regime do fornecedor e os parâmetros do ano' });
  }
  const servico = doc.servico || doc.modelo === 'nfse';
  if (servico && !String(doc.codigoServico || '').trim()) {
    falta.push({ campo: 'codigoServico', rotulo: 'Código de tributação', porque: 'define a alíquota do ISS e a natureza do IRRF' });
  }
  /* Lida só a chave (leitor ou câmera), a nota não traz as retenções: o
     código de barras identifica o documento, não os valores. Pergunta o que
     está impresso, uma coisa de cada vez, para o comparativo ter com o que comparar. */
  if (doc.origem === 'leitura') {
    if (servico && doc.issRetidoNota == null) falta.push({ campo: 'issRetidoNota', rotulo: 'A nota diz que o ISS foi retido?', porque: 'campo "Retenção do ISSQN" da nota' });
    if (servico && doc.issAliquota == null) falta.push({ campo: 'issAliquota', rotulo: 'Alíquota do ISS impressa na nota (%)', porque: 'campo "Alíquota aplicada"; use 0 se a nota não informar' });
    if (doc.irrfDestacado == null) falta.push({ campo: 'irrfDestacado', rotulo: 'IRRF retido impresso na nota (R$)', porque: 'use 0 se a nota não destacar o IRRF' });
  }
  return falta;
}

/** Data de hoje no horário de Brasília ('AAAA-MM-DD'), independente do fuso do computador. */
export const hojeBrasilia = (agora = Date.now()) => new Date(agora - 3 * 3600e3).toISOString().slice(0, 10);

/** Retenção previdenciária (INSS) do contratante: Lei 8.212/1991, art. 31. */
export const INSS = {
  aliquota: 11,
  fundamento: 'Lei 8.212/1991, art. 31',
  destaque: 'Lei 8.212/1991, art. 31, § 1º'
};

export function conferir({ doc = {}, cadastro = null, naturezaId, simplesManual = '', hoje = hojeBrasilia(), chave = null, parametros = null } = {}) {
  const issMun = aliquotaIss(doc.codigoServico, parametros, doc.emissao);
  const ISS_ALIQ = issMun.aliquota;
  const nat = natureza(naturezaId) || natureza(sugerirNatureza(doc));
  const problemas = [];
  /* O que decide a gravidade e o IMPACTO NA LIQUIDACAO.
     'pagamento' muda o valor que o Municipio paga ou retem: IRRF, ISSQN
     devido aqui, IBS/CBS retido. Isso e alerta ou erro, porque sai dinheiro
     errado.
     'declaracao' e o que a empresa declara na nota e o Municipio nao retem:
     nao muda o pagamento, entao nao bloqueia nada - vira notificacao ao
     emitente sobre o provavel erro dele. */
  const add = (nivel, titulo, solucao, detalhe = '', impacto = 'pagamento', aoEmitente = '') =>
    problemas.push({ nivel, titulo, solucao, detalhe, impacto, aoEmitente });
  const valor = r2(doc.valor || 0);
  const emissao = doc.emissao || '';
  const ano = Number(emissao.slice(0, 4)) || Number(hoje.slice(0, 4));

  // 1. Documento
  if (chave && chave.tipo === 'chave' && !chave.valida) add('erro', 'Chave de acesso com dígito verificador inválido', 'Confira a digitação ou leia de novo o código de barras. Se persistir, peça ao fornecedor a chave correta: a nota pode não existir.');
  if (!valor) add('erro', 'Valor da nota não informado', 'Informe o valor bruto da nota (valor total dos serviços ou da NF-e).');
  if (emissao && emissao > hoje) add('erro', 'Data de emissão no futuro', 'Confira a data de emissão na nota.');
  if (chave?.anoMes && emissao && emissao.slice(0, 7) !== chave.anoMes) add('alerta', 'Mês da chave diferente da data de emissão informada', `A chave indica ${chave.anoMes.split('-').reverse().join('/')}. Confira a data da nota.`);
  if (doc.cnpj && cadastro?.cnpj && limparCnpj(doc.cnpj) !== cadastro.cnpj) add('erro', 'CNPJ da nota diferente do consultado', 'Confira se a nota é mesmo deste fornecedor.');

  // 1b. Natureza do serviço (código × descrição × CNAE × natureza do IRRF)
  const verificacao = verificarNatureza({ doc, cadastro, natureza: nat });
  for (const p of verificacao.problemas) add(p.nivel, p.titulo, p.solucao);

  // 2. Cadastro na Receita
  if (cadastro) {
    if (cadastro.situacao && cadastro.situacao !== 'ATIVA') add('erro', `CNPJ com situação cadastral ${cadastro.situacao}`, 'Não liquide antes de esclarecer: peça ao fornecedor a regularização do CNPJ (comprovante de situação cadastral ATIVA) e confira as certidões de regularidade.');
  } else {
    add('alerta', 'Não foi possível consultar o CNPJ automaticamente', 'Consulte o Portal do Simples Nacional (botão abaixo), marque o resultado em "Simples Nacional na data da nota" e anexe a consulta ao processo.');
  }

  // 3. Simples Nacional na data da nota
  let simples = null, mei = false, fonteSimples = '';
  if (simplesManual) { simples = simplesManual !== 'nao'; mei = simplesManual === 'mei'; fonteSimples = 'informado pela Contabilidade'; }
  else if (cadastro) {
    mei = optanteNaData(cadastro.meiInicio, cadastro.meiFim, cadastro.mei, emissao);
    simples = mei || optanteNaData(cadastro.simplesInicio, cadastro.simplesFim, cadastro.simples, emissao);
    fonteSimples = `consulta ${cadastro.fonte} (dados abertos da Receita Federal)`;
  }
  const regimeNota = doc.regimeNota || '';
  if (simples != null && regimeNota) {
    if (!simples && (regimeNota === 'simples' || regimeNota === 'mei')) {
      add('erro', 'A nota se declara do Simples Nacional, mas o fornecedor não é optante na data da emissão', `Trate como NÃO optante: retenha o IRRF de ${pct(nat.ir)}${nat.servico ? ' e o ISS de ' + pct(ISS_ALIQ) : ''}. Peça ao fornecedor a correção do regime na nota (NFS-e: nota substituta; NF-e: cancelamento e nova emissão, se ainda no prazo) ou uma consulta do Portal do Simples que prove a opção na data.`, doc.regimeNotaTexto);
    } else if (simples && regimeNota === 'normal') {
      add('alerta', 'A Receita indica optante pelo Simples, mas a nota foi emitida como regime normal', 'Confirme no Portal do Simples Nacional. Se for optante, não retenha o IRRF e exija a declaração do Anexo IV da IN RFB 1.234/2012; peça ao fornecedor que corrija o regime nas próximas notas.', doc.regimeNotaTexto);
    } else if (mei && regimeNota === 'simples') {
      add('info', 'Fornecedor é MEI e a nota indica ME/EPP do Simples', 'Não altera a retenção do IRRF (dispensado), mas o MEI não destaca ISS: confira o ISS.');
    }
  }
  if (simples && cadastro && !simplesManual) add('info', 'Comprove a opção pelo Simples no processo', 'Exija a declaração do Anexo IV da IN RFB 1.234/2012 assinada pelo fornecedor, ou anexe a consulta ao Portal do Simples Nacional na data do pagamento (art. 6º, § 4º). A base consultada é atualizada mensalmente pela Receita.');

  // 4. IRRF
  const ir = { natureza: nat, aliquota: nat.ir, base: valor, valor: 0, reter: false, motivo: '', codigo: nat.codigo };
  const dispensaNatureza = cadastro?.naturezaCodigo && NATUREZAS_DISPENSA[cadastro.naturezaCodigo];
  if (simples) ir.motivo = mei ? 'MEI — optante pelo Simples Nacional (IN RFB 1.234/2012, art. 4º, XI)' : 'Optante pelo Simples Nacional (IN RFB 1.234/2012, art. 4º, XI)';
  else if (simples == null) ir.motivo = 'Situação no Simples não confirmada — cálculo considerando NÃO optante';
  // Cooperativa (IN RFB 1.234/2012, art. 26; Lei 8.541/1992, art. 45): 1,5% sobre os serviços pessoais dos cooperados.
  // Transporte rodoviário: só a parcela tributável — 60% (passageiros) ou 10% (cargas) — Lei 7.713/1988, art. 9º; ADN Cosit 1/1993.
  if (nat.cooperativa) {
    const pessoais = doc.coopServicosPessoais != null && doc.coopServicosPessoais > 0 ? Math.min(doc.coopServicosPessoais, valor) : valor;
    const fator = { passageiros: 0.6, cargas: 0.1 }[doc.coopTransporte] ?? 1;
    ir.base = r2(pessoais * fator);
    ir.baseTexto = `${fator < 1 ? `${fator * 100}% de ` : ''}${moeda(pessoais)} de serviços pessoais${fator < 1 ? ` (${doc.coopTransporte === 'passageiros' ? 'transporte de passageiros' : 'transporte de cargas'})` : ''}`;
    if (doc.coopServicosPessoais == null || doc.coopServicosPessoais <= 0) add('alerta', 'Nota da cooperativa sem a parcela de serviços pessoais dos cooperados', `Informe o valor dos serviços pessoais dos cooperados, se a nota discriminar. Sem a discriminação, o IR de 1,5% foi calculado sobre o valor total. Peça à cooperativa que separe na nota os serviços pessoais dos demais custos (IN RFB 1.234/2012, art. 26; ADN Cosit 1/1993).`);
    if (!doc.coopTransporte) add('info', 'Cooperativa de transporte?', 'Se for transporte rodoviário de passageiros, a base do IR é 60% dos serviços pessoais; de cargas, 10%. Marque o tipo no formulário.');
  }
  if (!simples) {
    const calc = r2(ir.base * nat.ir / 100);
    if (nat.ir === 0) ir.motivo = 'Natureza sem retenção de IR no Anexo I';
    else if (calc < MINIMO_RETENCAO_IR) { ir.valor = calc; ir.motivo = 'IR inferior a R$ 10,00: confirmar o tratamento municipal.'; if (calc > 0) add('alerta', 'Confirmar o tratamento municipal do IRRF inferior a R$ 10,00', 'Registre a norma municipal aplicável e confira o recolhimento antes de aplicar a dispensa ao pagamento.'); }
    else { ir.valor = calc; ir.reter = true; ir.motivo = ir.motivo || (nat.cooperativa ? `Cooperativa: ${pct(nat.ir)} sobre ${ir.baseTexto} (IN RFB 1.234/2012, art. 26; código 3280)` : `${nat.texto}: ${pct(nat.ir)} sobre o valor bruto (Anexo I da IN RFB 1.234/2012; IN RFB 2.145/2023)`); }
  }
  if (cadastro?.naturezaCodigo === '2143' && !nat.cooperativa) add('erro', 'O fornecedor é uma COOPERATIVA', 'Escolha a natureza "Cooperativa de trabalho/transporte" (IR 1,5% sobre os serviços pessoais dos cooperados, código 3280), e não a do serviço em si.');
  if (dispensaNatureza && !simples && cadastro?.naturezaCodigo !== '2143') add('alerta', `Natureza jurídica: ${cadastro.naturezaTexto}`, `Pode haver dispensa de retenção (${dispensaNatureza}). Só deixe de reter com a declaração do Anexo II/III da IN RFB 1.234/2012 (e o Cebas, quando exigido). Sem ela, retenha normalmente.`);
  const irNota = doc.irrfDestacado;
  if (ir.reter) {
    if (irNota == null || irNota === 0) add('alerta', 'IRRF não destacado na nota', `Retenha mesmo assim ${moeda(ir.valor)} (${pct(ir.aliquota)}): a responsabilidade pela retenção é do Município. Oriente o fornecedor a informar a retenção nas próximas notas (NF-e: carta de correção nas informações complementares; NFS-e: campo de retenção do IRRF).`);
    else if (difere(irNota, ir.valor)) add('erro', `IRRF destacado na nota (${moeda(irNota)}) diferente do devido (${moeda(ir.valor)})`, `Retenha ${moeda(ir.valor)} — ${pct(ir.aliquota)} para "${nat.texto}". Se a natureza escolhida estiver certa, peça ao fornecedor a correção da nota${doc.modelo === 'nfse' ? ' (nota substituta)' : ' (carta de correção, se só nas informações complementares)'}. Confira se a natureza do bem/serviço está correta.`);
  } else if (simples && irNota > 0) {
    add('alerta', `Nota com IRRF destacado (${moeda(irNota)}), mas o fornecedor é do Simples`, 'Não retenha. Avise o fornecedor para retirar o destaque nas próximas notas; se ele quiser a nota corrigida agora, NFS-e por nota substituta.');
  }
  /* INSS (Lei 8.212/1991, art. 31). O contratante de cessão de mão de obra ou
     empreitada - inclusive o Municipio - retem 11% do valor bruto e recolhe em
     nome do prestador. Antes, a ferramenta so avisava e o liquido nao descontava
     o INSS: com a nota "ok", pagava-se ao fornecedor um valor que o Municipio
     deveria ter retido. Agora a Contabilidade decide (reter ou nao, com motivo);
     sem decisao, a nota nao fica "ok". As hipoteses de deducao e dispensa ficam
     com a Contabilidade, que informa o valor e o motivo: o sistema calcula e
     registra, sem presumir percentuais. */
  const inssNotaDecl = r2(doc.inssRetido || 0);
  const nomeInssNota = doc.inssRotulo || 'Contribuição Previdenciária Retida';
  const inss = { aplica: !!(nat.inss || inssNotaDecl > 0), decidido: false, reter: false, base: valor, deducao: 0, aliquota: INSS.aliquota, valor: 0,
    sugerido: r2(valor * INSS.aliquota / 100), motivo: '', fundamento: INSS.fundamento };
  if (inss.aplica) {
    const decisao = doc.inssDecisao || '';
    if (decisao === 'reter') {
      inss.decidido = true; inss.reter = true;
      inss.aliquota = Number(doc.inssAliquota) > 0 ? Number(doc.inssAliquota) : INSS.aliquota;
      inss.deducao = Math.min(Math.max(r2(doc.inssDeducao || 0), 0), valor);
      inss.base = r2(valor - inss.deducao);
      inss.valor = r2(inss.base * inss.aliquota / 100);
      inss.motivo = `Retenção de ${pct(inss.aliquota)} sobre ${moeda(inss.base)} — valor bruto${inss.deducao ? ` menos ${moeda(inss.deducao)} de materiais/equipamentos discriminados` : ''} (${INSS.fundamento})`;
      if (inssNotaDecl > 0 && difere(inssNotaDecl, inss.valor)) add('erro', `INSS destacado na nota (${moeda(inssNotaDecl)}) diferente do conferido (${moeda(inss.valor)})`,
        `Retenha ${moeda(inss.valor)} (${pct(inss.aliquota)} sobre ${moeda(inss.base)}). Confira a base (materiais e equipamentos discriminados) e a alíquota; se a nota estiver errada, peça a correção ao fornecedor.`, INSS.fundamento);
      if (!(inssNotaDecl > 0)) add('info', 'Nota sem o destaque da retenção previdenciária',
        `O INSS de ${moeda(inss.valor)} será retido mesmo assim. O fornecedor deve destacar a retenção na nota (${INSS.destaque}).`, '', 'declaracao',
        `A nota não destaca a retenção para a Previdência Social. Pedimos que as próximas notas tragam o destaque (${INSS.destaque}).`);
      if (mei) add('alerta', 'Retenção de INSS para MEI', 'Confira se cabe a retenção: o MEI tem tratamento próprio na contribuição previdenciária. Na dúvida, consulte o setor de Tributos antes de liquidar.');
    } else if (decisao === 'nao_reter') {
      inss.decidido = true;
      inss.motivo = String(doc.inssMotivo || '').trim();
      if (!inss.motivo) add('alerta', 'Informe por que o INSS não será retido', 'Registre o motivo (ex.: empreitada global com fornecimento de materiais, optante do Simples fora do Anexo IV, serviço sem cessão de mão de obra). O motivo vai para a ficha da liquidação.');
      if (inssNotaDecl > 0) add('alerta', `A nota destaca ${nomeInssNota} de ${moeda(inssNotaDecl)}, mas a Contabilidade decidiu não reter`,
        `O líquido a pagar fica ${moeda(inssNotaDecl)} maior que o impresso na nota. Confirme a decisão e oriente o fornecedor a emitir a nota sem o destaque, se for o caso.`);
    } else {
      add('alerta', 'Defina a retenção do INSS antes de liquidar',
        `${nat.inss ? `A natureza escolhida (${nat.texto}) costuma envolver cessão de mão de obra ou empreitada.` : `A nota declara ${nomeInssNota} de ${moeda(inssNotaDecl)}.`} O contratante — inclusive o Município — retém ${pct(INSS.aliquota)} do valor bruto da nota e recolhe em nome do prestador (${INSS.fundamento}); optantes do Simples tributados pelo Anexo IV da LC 123/2006 também sofrem a retenção. No formulário, em "INSS", escolha "Reter" (sugestão: ${moeda(inss.sugerido)}; informe materiais e equipamentos discriminados, se houver) ou "Não reter" com o motivo.`,
        INSS.fundamento);
    }
  }

  // 5. ISSQN
  const iss = { aplica: false, aliquota: null, valor: 0, reter: false, motivo: '' };
  const servico = !!(nat.servico || doc.servico);
  const local = String(doc.localPrestacao || MUNICIPIO.ibge);
  const retidoPelaNota = doc.issRetidoNota === true;
  const emitidaFora = doc.municipioEmissor && String(doc.municipioEmissor) !== MUNICIPIO.ibge;

  /* Onde o ISS e devido: LC 116/2003, art. 3º. A regra geral manda o imposto
     para o municipio do ESTABELECIMENTO DO PRESTADOR - executar o servico
     aqui nao basta. So as excecoes dos incisos I a XXV mudam o destino.
     Antes disto, qualquer nota com local de prestacao em Frei Inocencio
     gerava retencao, inclusive consultoria de empresa de outra cidade: ISS
     que nao e do Municipio, e que o fornecedor recolhe no municipio dele. */
  const localIss = servico ? issDevidoAqui({
    codigoServico: doc.codigoServico, ibgeMunicipio: MUNICIPIO.ibge,
    ibgePrestador: doc.municipioEmissor || '', ibgePrestacao: doc.localPrestacao || ''
  }) : null;

  /* Sem codigo de tributacao a lei nao da resposta: cai no criterio antigo,
     que ao menos reflete o que a nota declara. */
  const indefinido = !localIss || localIss.indefinido || localIss.aqui == null;
  const prestadoAqui = indefinido ? (local === MUNICIPIO.ibge || retidoPelaNota) : localIss.aqui;

  if (servico && indefinido && emitidaFora) {
    add('alerta', 'Não dá para saber em que município este ISS é devido',
      `Informe o código de tributação da nota. Sem ele não é possível dizer se o serviço está nas exceções do art. 3º da LC 116/2003, e a nota foi emitida em ${doc.municipioEmissorNome || 'outro município'}.`);
  }
  if (servico && !indefinido && localIss.aqui === false) {
    const onde = doc.municipioEmissorNome || 'o município do prestador';
    add(retidoPelaNota ? 'erro' : 'info',
      retidoPelaNota
        ? `A nota manda reter o ISS aqui, mas ele é devido em ${onde}`
        : `ISS devido em ${onde}, não em ${MUNICIPIO.nome}`,
      retidoPelaNota
        ? `${localIss.fundamento} Não retenha: se o Município retiver e o fornecedor recolher no município dele, o mesmo ISS é pago duas vezes. Peça a nota substituta sem a retenção pelo tomador.`
        : `${localIss.fundamento} O fornecedor recolhe no município dele; o Município não retém.`,
      localIss.inciso ? `Exceção do inciso ${localIss.inciso}` : 'Regra geral do caput');
  }
  if (servico && !indefinido && localIss.aqui === true && emitidaFora) {
    add('info', `ISS devido em ${MUNICIPIO.nome} mesmo com a nota emitida fora`,
      `${localIss.fundamento} A retenção cabe ao Município: a Lei 883/2017, art. 98, XI, põe a Administração Direta e Indireta como responsável pelo ISS dos serviços prestados a ela.`,
      localIss.inciso ? `Art. 101, II, "${localIss.inciso}"` : '');
  }
  /* Deducao de valores pagos a terceiros (Lei 966/2023). Muda a base e a
     aliquota, entao muda o que o Municipio retem: e questao de pagamento,
     nao observacao. So aparece quando o Municipio e o destinatario do ISS. */
  let dedTerceiros = 0;
  if (servico && !indefinido && localIss.aqui === true && admiteDeducaoTerceiros(doc.codigoServico)) {
    const deduzido = doc.deducaoTerceiros != null && doc.deducaoTerceiros !== '' ? r2(doc.deducaoTerceiros) : null;
    const teto = r2(valor * (DEDUCAO_TERCEIROS.limitePercentual / 100));
    if (deduzido == null && !doc.semDeducaoTerceiros) {
      add('alerta', 'Este serviço admite dedução de valores pagos a terceiros',
        `${DEDUCAO_TERCEIROS.fundamento}: o que foi pago a terceiros, com documento fiscal ou comprovante eficaz, sai da base do ISS, até ${DEDUCAO_TERCEIROS.limitePercentual}% dela — e nessa hipótese vale a alíquota mínima de ${pct(ISS.minimoSimples)}, não a de ${pct(ISS_ALIQ)}. Informe em "Valores pagos a terceiros" o total comprovado, ou marque "Sem dedução" para usar o valor cheio.`,
        'Pode reduzir a base e a alíquota');
    } else if (deduzido > teto) {
      add('erro', `Dedução de terceiros acima do limite de ${DEDUCAO_TERCEIROS.limitePercentual}% da base`,
        `${DEDUCAO_TERCEIROS.fundamento} limita a dedução a ${moeda(teto)} nesta nota. O cálculo usou o limite; reduza a dedução ou confira os comprovantes.`);
    }
    if (deduzido > 0) dedTerceiros = Math.min(deduzido, teto);
  }

  /* A lei municipal cita um subitem e descreve outro. Enquadrar nao muda,
     mas quem for conferir com a lei na mao precisa saber disso. */
  if (servico && localIss?.observacao) {
    add('info', 'A lei municipal tem erro de redação neste enquadramento',
      `Lei 883/2017, art. 101, II, "${localIss.inciso}": ${localIss.observacao}. O destino do imposto é o mesmo nas duas leituras, então o cálculo não muda. Vale comunicar ao setor de Tributos.`,
      '', 'declaracao');
  }
  if (servico && retidoPelaNota && local !== MUNICIPIO.ibge && indefinido) {
    add('info', 'A nota indica ISS retido pelo tomador', `O ISS será retido pelo Município. Confira se o local da prestação/incidência na nota é ${MUNICIPIO.nome}; se não for, peça a correção ao fornecedor.`);
  }
  if (servico) {
    if (!prestadoAqui) {
      iss.motivo = localIss && !localIss.indefinido ? localIss.fundamento
        : 'Serviço prestado fora de Frei Inocêncio: em regra o ISS é devido no município do prestador (LC 116/2003, art. 3º)';
      if (indefinido) add('info', 'Serviço prestado em outro município — ISS não retido por Frei Inocêncio', 'Confirme o local da prestação. Se o serviço foi executado em Frei Inocêncio, mude "Local da prestação" para Frei Inocêncio e o ISS de 5% passa a ser retido.');
    } else if (mei) {
      iss.aplica = true; iss.motivo = 'MEI recolhe o ISS em valor fixo no DAS — não há retenção';
      if (doc.issValor > 0 || doc.issRetidoNota) add('alerta', 'MEI com ISS destacado/retido na nota', 'Não retenha ISS de MEI (LC 123/2006, art. 18-A). Peça ao fornecedor a correção da nota.');
    } else {
      iss.aplica = true;
      if (simples) {
        const informada = doc.issAliquota;
        if (informada == null || informada === 0) { iss.aliquota = ISS_ALIQ; add('alerta', 'ME/EPP do Simples sem alíquota de ISS na nota', `Retenha pela alíquota de ${pct(ISS_ALIQ)} (LC 123/2006, art. 21, § 4º, IV) e oriente o fornecedor a informar a alíquota do Simples nas próximas notas.`); }
        else if (informada < ISS.minimoSimples || informada > ISS.maximoSimples) { iss.aliquota = ISS_ALIQ; add('erro', `Alíquota de ISS do Simples fora da faixa (${pct(informada)})`, `No Simples a alíquota do ISS fica entre ${pct(ISS.minimoSimples)} e ${pct(ISS.maximoSimples)}. Retenha ${pct(ISS_ALIQ)} e peça nota substituta com a alíquota correta.`); }
        else iss.aliquota = informada;
        iss.motivo = `ME/EPP do Simples: retenção pela alíquota informada na nota (LC 123/2006, art. 21, § 4º)`;
      } else if (dedTerceiros > 0) {
        iss.aliquota = ISS.minimoSimples;
        iss.motivo = `Base reduzida pelos valores pagos a terceiros (${moeda(dedTerceiros)}) e alíquota mínima de ${pct(ISS.minimoSimples)} (${DEDUCAO_TERCEIROS.fundamento})`;
        if (doc.issAliquota != null && doc.issAliquota !== 0 && difere(doc.issAliquota, iss.aliquota, 0.001)) add('erro', `Alíquota de ISS na nota (${pct(doc.issAliquota)}) diferente da devida com a dedução de terceiros (${pct(iss.aliquota)})`,
          `Com a dedução de valores pagos a terceiros, vale a alíquota mínima de ${pct(ISS.minimoSimples)} (${DEDUCAO_TERCEIROS.fundamento}). Retenha ${pct(iss.aliquota)} sobre a base reduzida e peça a nota substituta, se for o caso.`);
      } else {
        iss.aliquota = ISS_ALIQ;
        iss.motivo = `Não optante, serviço prestado em ${MUNICIPIO.nome}: ISS de ${pct(ISS_ALIQ)}${
          issMun.fonte === 'cadastro' ? ` (alíquota cadastrada para o código ${issMun.excecao})`
          : issMun.fonte === 'lei' ? ` (subitem ${issMun.subitem} do ${ANEXO_II_CURTO})`
          : issMun.fonte === 'unica' ? ' (alíquota do Município para os serviços prestados aqui)'
          : ''} retido pelo Município (tomador)`;
        if (issMun.vetado) {
          add('alerta', `O subitem ${issMun.vetado} foi vetado no Anexo II`, `Não há alíquota na lei para esse código, e a nota pode estar com o código errado. Confirme o serviço com o fornecedor e com o setor de Tributos antes de liquidar; por ora o cálculo usa ${pct(ISS_ALIQ)}.`, FUNDAMENTO_ANEXO_II);
        } else if (issMun.fonte === 'padrao' && String(doc.codigoServico || '').trim()) {
          add('alerta', `Código ${doc.codigoServico} não consta na lista do Anexo II`, `A alíquota usada (${pct(ISS_ALIQ)}) é a padrão do sistema, não a do Município. Confirme o código do serviço com o fornecedor; se o código estiver certo, peça a Tributos o enquadramento e cadastre a alíquota em "Alíquotas do ISS" nesta tela.`, FUNDAMENTO_ANEXO_II);
        } else if (issMun.anterior) {
          /* Nota antiga: vale a alíquota da época, não a de hoje. Dizer isso
             evita que alguém "corrija" a nota para a alíquota atual. */
          add('info', `Alíquota de ${pct(ISS_ALIQ)} pela vigência na data da emissão`, `O subitem ${issMun.subitem} mudou de alíquota depois desta nota (a partir de ${new Date(issMun.ate + 'T12:00:00').toLocaleDateString('pt-BR')} passou a ser ${pct(ANEXO_II[issMun.subitem])}). A nota é regida pela alíquota vigente quando foi emitida.`, FUNDAMENTO_ANEXO_II, 'declaracao');
        }
        const trib = descreverTributacao(doc.codigoServico);
        if (trib?.issNoLocal) iss.motivo += ` — subitem ${trib.subitem.slice(0, 2)}.${trib.subitem.slice(2)}: ISS devido no local da prestação (LC 116/2003, art. 3º)`;
        if (doc.issAliquota != null && doc.issAliquota !== 0 && difere(doc.issAliquota, ISS_ALIQ, 0.001)) add('erro', `Alíquota de ISS na nota (${pct(doc.issAliquota)}) diferente da do município (${pct(ISS_ALIQ)})`, `O fornecedor não é do Simples: o ISS em ${MUNICIPIO.nome} é de ${pct(ISS_ALIQ)}${issMun.fonte === 'lei' ? ` para o subitem ${issMun.subitem}, pelo ${ANEXO_II_CURTO}` : issMun.excecao ? ' para este código' : ''}. Retenha ${pct(ISS_ALIQ)} e peça a nota substituta com a alíquota correta.${doc.modelo === 'nfse' && String(doc.incidencia || '') === MUNICIPIO.ibge ? ` Atenção: na NFS-e Nacional com incidência em ${MUNICIPIO.nome}, a alíquota é puxada do cadastro do próprio Município no Emissor Nacional — confirme com o setor de Tributos. Se a lei municipal prevê ${pct(doc.issAliquota)} para este serviço, cadastre a exceção em "Alíquotas do ISS" nesta tela; se não, Tributos deve corrigir o cadastro no Painel Municipal da NFS-e.` : ''}`);
      }
      iss.base = r2(valor - dedTerceiros);
      iss.deducaoTerceiros = dedTerceiros;
      if (dedTerceiros > 0 && simples) iss.motivo += ` — base reduzida pelos valores pagos a terceiros (${moeda(dedTerceiros)}, ${DEDUCAO_TERCEIROS.fundamento})`;
      iss.valor = r2(iss.base * iss.aliquota / 100);
      iss.reter = ISS.retemOrgao;
      if (doc.issValor != null && doc.issValor > 0 && difere(doc.issValor, iss.valor) && !problemas.some(p => p.titulo.startsWith('Alíquota de ISS'))) add('erro', `Valor do ISS na nota (${moeda(doc.issValor)}) diferente do calculado (${moeda(iss.valor)})`, 'Confira a base de cálculo (deduções) na nota. Se não houver dedução legal, peça a nota substituta.');
      // Nota emitida no município do prestador é normal; o que importa é o MUNICÍPIO DE INCIDÊNCIA do ISS informado na nota.
      const incid = doc.incidencia ? String(doc.incidencia) : '';
      const nomeEmissor = doc.municipioEmissorNome || doc.municipioEmissor;
      if (iss.reter && incid && incid !== MUNICIPIO.ibge) add('erro', `A nota indica o ISS devido em outro município${doc.incidenciaNome ? ' (' + doc.incidenciaNome + ')' : ''}, mas o serviço é prestado em ${MUNICIPIO.nome}`, `Peça ao fornecedor a substituição da NFS-e com "Local da prestação" e "Município de incidência do ISSQN" = ${MUNICIPIO.nome}, alíquota de ${pctTxtF(ISS_ALIQ)} e ISS retido pelo tomador. Não liquide com a nota errada: se o Município reter e o fornecedor também recolher no outro município, o ISS é pago em dobro.`);
      else if (iss.reter && emitidaFora && !incid) add('alerta', `Nota emitida em ${nomeEmissor}: confira o município de incidência`, `É normal a NFS-e ser emitida no município do prestador. Confira no documento: "Município de incidência do ISSQN" deve ser ${MUNICIPIO.nome}. Se for, marque no formulário e a retenção de ${pctTxtF(ISS_ALIQ)} está correta; se for ${nomeEmissor}, peça a substituição da nota.`);
      if (iss.reter && doc.issRetidoNota === false) add('erro', 'A nota indica ISS NÃO retido', `O Município é o responsável pela retenção: retenha ${moeda(iss.valor)} mesmo assim e peça ao fornecedor a nota substituta com "ISS retido pelo tomador", para ele não pagar o imposto em dobro.`);
    }
  }

  // 6. CBS e IBS
  const pr = parametrosCbsIbs(ano);
  const cb = { parametros: pr, aplica: false, esperado: null, nota: doc.ibscbs || null, motivo: '' };
  if (!pr) cb.motivo = 'Nota anterior a 2026: sem CBS/IBS';
  else if (simples) {
    cb.motivo = pr.teste ? 'Simples Nacional: as alíquotas de teste de 2026 não se aplicam (LC 214/2025, art. 348)' : 'Simples Nacional: CBS e IBS recolhidos no DAS, salvo opção pelo regime regular';
    if (pr.teste && doc.ibscbs && (doc.ibscbs.vCBS > 0 || doc.ibscbs.vIBS > 0)) add('alerta', 'Nota do Simples com CBS/IBS destacados', 'Em 2026 o ano-teste não se aplica ao Simples. Não altera o pagamento; oriente o fornecedor a revisar o emissor.');
  } else {
    cb.aplica = true;
    const fator = 1 - (pr.redutor || 0) / 100;
    const aliqCBS = r2(pr.cbs * fator * 100) / 100, aliqIBS = r2((pr.ibsUF + pr.ibsMun) * fator * 100) / 100;
    const baseCb = doc.ibscbs?.base > 0 ? doc.ibscbs.base : valor; // a nota informa a base já sem PIS/Cofins/ISS
    cb.esperado = { cbs: aliqCBS, ibs: aliqIBS, base: baseCb, vCBS: r2(baseCb * aliqCBS / 100), vIBS: r2(baseCb * aliqIBS / 100) };
    cb.motivo = pr.teste
      ? `Ano-teste 2026: CBS ${pct(pr.cbs)} e IBS ${pct(pr.ibsUF)} destacados só para informação — não somam ao total da nota e o Município não retém`
      : `CBS ${pct(aliqCBS)} e IBS ${pct(aliqIBS)}${pr.redutor ? ` (com redutor de ${pct(pr.redutor)} das compras governamentais, LC 214/2025, art. 472)` : ''}`;
    if (pr.provisorio) add('alerta', `Alíquotas de ${pr.ano} provisórias`, 'Os números usados são a proposta do TCU e dependem de Resolução do Senado. Confira a regulamentação vigente antes de liquidar.');
    if (pr.repetido) add('alerta', `Sem parâmetros de CBS/IBS para ${ano}`, `Foram usados os de ${pr.ano}. Atualize a tabela da ferramenta.`);
    const n = doc.ibscbs;
    const obrigatorio = pr.teste ? (['55', '65', '57', '67'].includes(String(doc.modelo)) && emissao >= pr.obrigatorioNFe) : true;
    if (!n) {
      if (doc.origem === 'xml' && obrigatorio) add('erro', 'Nota sem o grupo de CBS/IBS', `Desde ${pr.obrigatorioNFe ? pr.obrigatorioNFe.split('-').reverse().join('/') : 'a vigência'} o destaque da CBS e do IBS é obrigatório para o regime regular. Peça ao fornecedor a regularização da nota. ${pr.teste ? 'Em 2026 isso não muda o valor a pagar.' : ''}`);
      else if (doc.origem === 'xml') add('info', 'Nota sem CBS/IBS destacados', 'Confira com o fornecedor; para NFS-e, acompanhe o calendário do emissor nacional/municipal.');
    } else {
      const cstReduzido = (n.cst && n.cst !== '000') || false;
      if (!cstReduzido) {
        if (n.pCBS != null && difere(n.pCBS, aliqCBS, 0.001)) add('erro', `Alíquota da CBS na nota (${pct(n.pCBS)}) diferente da esperada (${pct(aliqCBS)})`, 'Peça ao fornecedor a correção da nota (cancelamento e nova emissão no prazo, ou nota de ajuste).');
        const ibsNota = (n.pIBSUF ?? 0) + (n.pIBSMun ?? 0);
        if ((n.pIBSUF != null || n.pIBSMun != null) && difere(ibsNota, aliqIBS, 0.001)) add('erro', `Alíquota do IBS na nota (${pct(ibsNota)}) diferente da esperada (${pct(aliqIBS)})`, 'Peça ao fornecedor a correção da nota.');
        if (n.vCBS != null && difere(n.vCBS, cb.esperado.vCBS, 0.05) && n.pCBS == null) add('alerta', `Valor da CBS (${moeda(n.vCBS)}) diferente do esperado (${moeda(cb.esperado.vCBS)})`, 'Confira a base de cálculo da CBS na nota.');
      } else if (/^4/.test(n.cst)) {
        const transporte = String(doc.codigoServico || '').replace(/\D/g, '').startsWith('16');
        add('alerta', `CBS/IBS isentos na nota (CST ${n.cst}${n.classTrib ? ' / cClassTrib ' + n.classTrib : ''})`,
          `Confira se o serviço tem mesmo isenção na LC 214/2025.${transporte ? ' A isenção do transporte é para o transporte público coletivo de passageiros (concessão/permissão); transporte escolar ou fretamento contratado pela prefeitura não costuma se enquadrar.' : ''} ${pr.teste ? 'Em 2026 isso não muda o valor a pagar; oriente o fornecedor a corrigir a classificação nas próximas notas.' : 'Peça a correção da nota.'}`);
      } else add('info', `CBS/IBS com tratamento diferenciado na nota (CST ${n.cst}${n.classTrib ? ', cClassTrib ' + n.classTrib : ''})`, 'Confira se o bem/serviço tem mesmo redução, isenção ou alíquota zero na LC 214/2025.');
    }
  }

  // 7. Resultado para a liquidação
  const retencoes = r2((ir.reter ? ir.valor : 0) + (iss.reter ? iss.valor : 0) + (inss.reter ? inss.valor : 0));
  const liquido = r2(valor - retencoes);
  // Comparativo: o que a nota diz × o que a conferência calculou
  const irNotaV = r2(doc.irrfDestacado || 0);
  const issNotaV = doc.issRetidoNota === false ? 0 : r2(doc.issValor || 0);
  /* Retenções que a nota declara e esta ferramenta não calcula. Apareciam
     só como uma diferença no líquido, sem nome: "faltam R$ 78,12" não diz
     se é erro do fornecedor, imposto esquecido ou retenção que o Município
     nem faz. Entram no comparativo com o nome delas. */
  const csrfNota = r2(doc.csrfRetido || 0);
  const inssNota = r2(doc.inssRetido || 0);
  /* O nome vem da nota: quem confere está com o papel na mão, e lá está escrito
     "Contribuições Sociais Retidas". A descrição da nota diz quais contribuições
     são; entra ao lado, não no lugar do nome. */
  const nomeCsrf = doc.csrfRotulo || 'Contribuições Sociais Retidas';
  const nomeInss = doc.inssRotulo || 'Contribuição Previdenciária Retida';
  const naoCalculadas = [];
  if (csrfNota) naoCalculadas.push({ item: nomeCsrf, nota: csrfNota, conferido: null, naoCalculado: true, detalhe: doc.csrfDescricao || '' });
  if (inssNota && !inss.decidido) naoCalculadas.push({ item: nomeInss, nota: inssNota, conferido: null, naoCalculado: true });
  /* Qualquer outra retenção que a nota traga e que não seja nenhuma das acima
     também desce no comparativo, pelo nome dela: retenção que some da tela é
     retenção que alguém paga sem perceber. */
  for (const r of (doc.retencoesNota || [])) {
    if (!(r.valor > 0)) continue;
    if (naoCalculadas.some(l => l.item === r.rotulo)) continue;
    if (inss.decidido && r.rotulo === nomeInss) continue;
    naoCalculadas.push({ item: r.rotulo, nota: r2(r.valor), conferido: null, naoCalculado: true });
  }

  const outras = r2(naoCalculadas.reduce((soma, linha) => soma + linha.nota, 0));
  const totalNota = doc.totalRetencoesNota != null ? r2(doc.totalRetencoesNota) : r2(irNotaV + issNotaV + outras);
  const liquidoNota = doc.liquidoNota != null ? r2(doc.liquidoNota) : r2(valor - totalNota);
  const comparativo = [
    { item: 'IRRF', nota: irNotaV, conferido: ir.reter ? ir.valor : 0 },
    { item: 'ISSQN retido', nota: issNotaV, conferido: iss.reter ? iss.valor : 0, notaAliq: doc.issAliquota, conferidoAliq: iss.aplica ? iss.aliquota : null },
    ...(inss.aplica && inss.decidido ? [{ item: 'INSS retido', nota: inssNota, conferido: inss.reter ? inss.valor : 0, notaAliq: null, conferidoAliq: inss.reter ? inss.aliquota : null }] : []),
    ...naoCalculadas,
    { item: 'Total das retenções', nota: totalNota, conferido: retencoes },
    { item: inss.reter ? 'Líquido a pagar' : 'Líquido após IRRF e ISS', nota: liquidoNota, conferido: liquido, total: true }
  ].map(l => ({ ...l, diferenca: l.conferido == null ? null : r2(l.conferido - l.nota) }));
  const temDadosNota = outras > 0 || doc.totalRetencoesNota != null || doc.irrfDestacado != null || doc.issValor != null || doc.liquidoNota != null;
  if (temDadosNota && valor) {
    const diferenca = r2(liquido - liquidoNota);
    if (outras > 0) {
      const nomes = naoCalculadas.map(l => l.item + ' (' + moeda(l.nota) + ')').join(', ');
      const diligencias = [];
      if (csrfNota) diligencias.push('Confira o convênio aplicável e sua vigência para PIS/Cofins/CSLL (Lei 10.833/2003, art. 33).');
      if (inssNota && !inss.decidido) diligencias.push('Defina a retenção do INSS no formulário (Lei 8.212/1991, art. 31).');
      add('info', 'Retenções adicionais na nota: ' + nomes,
        'Líquido impresso: ' + moeda(liquidoNota) + '. Após apenas IRRF e ISS: ' + moeda(liquido) + '. ' + diligencias.join(' '));
    }
    // Não repete o aviso quando a diferença é só o INSS que a Contabilidade decidiu não reter.
    const soInssNaoRetido = inss.decidido && !inss.reter && inssNota > 0 && Math.abs(diferenca - outras - inssNota) < 0.01;
    if (Math.abs(diferenca - outras) >= 0.01 && !soInssNaoRetido) {
      add('erro', 'Valor líquido da nota requer conciliação',
        'Confira descontos, bases e retenções no documento. Líquido impresso: ' + moeda(liquidoNota) +
        '. Após IRRF e ISS: ' + moeda(liquido) + '. Demais retenções declaradas: ' + moeda(outras) + '.');
    }
  }
  const ordem = { erro: 0, alerta: 1, info: 2 };
  problemas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
  /* So o que impacta a liquidacao define a situacao. Erro de declaracao do
     emitente nao pode bloquear um pagamento que esta correto. */
  const doPagamento = problemas.filter(p => p.impacto !== 'declaracao');
  const situacao = doPagamento.some(p => p.nivel === 'erro') ? 'erro' : doPagamento.some(p => p.nivel === 'alerta') ? 'alerta' : 'ok';
  // Expõe a origem da alíquota no resultado para a pré-auditoria exigir conferência humana.
  iss.fonteConfiguracao = issMun.fonte;
  iss.aliquotaBaseMunicipal = ISS_ALIQ;
  iss.aliquotaAnexoII = issMun.anexo;
  iss.subitemAnexoII = issMun.subitem;
  const fundamentos = fundamentosAplicados({ nat, simples, mei, ir, iss, inss, localIss, cb, dedTerceiros, issMun });
  return { natureza: nat, valor, emissao, simples, mei, fonteSimples, ir, iss, inss, localIss, cbsibs: cb, retencoes, liquido, comparativo, temDadosNota, verificacao, problemas, situacao, fundamentos };
}

/**
 * Normas que sustentaram cada parte do cálculo, por esfera (federal e municipal).
 * Não há norma estadual: o Município, como tomador, não retém tributo estadual.
 */
export function fundamentosAplicados({ nat, simples, mei, ir, iss, inss, localIss, cb, dedTerceiros, issMun }) {
  const f = [];
  const add = (esfera, norma, uso) => { if (!f.some(x => x.norma === norma && x.uso === uso)) f.push({ esfera, norma, uso }); };
  if (simples) add('federal', 'LC 123/2006 e IN RFB 1.234/2012, art. 4º, XI', mei ? 'MEI: sem retenção de IRRF e de ISS' : 'Optante do Simples: sem retenção de IRRF');
  else add('federal', 'IN RFB 1.234/2012, Anexo I, com a IN RFB 2.145/2023', `IRRF de ${pct(nat.ir)} — ${nat.texto}`);
  if (!simples && ir.valor > 0 && !ir.reter) add('federal', 'IN RFB 1.234/2012, art. 3º, § 6º', 'Dispensa de IRRF inferior a R$ 10,00');
  if (localIss && !localIss.indefinido) add('federal', 'LC 116/2003, art. 3º', 'Município onde o ISS é devido');
  if (iss.aplica && !mei) {
    if (simples) add('federal', 'LC 123/2006, art. 21, § 4º', 'ISS do Simples pela alíquota informada na nota');
    else if (dedTerceiros > 0) add('municipal', 'Lei 966/2023 (art. 102, § 15, da Lei 883/2017)', 'Dedução de valores pagos a terceiros e alíquota mínima');
    else add('municipal', issMun?.fonte === 'unica' ? 'Lei 883/2017 e alterações (alíquota do Município)' : issMun?.fonte === 'lei' ? ANEXO_II_CURTO : issMun?.fonte === 'cadastro' ? 'Alíquota cadastrada pela administração (config/fiscal)' : 'Lei 883/2017 (alíquota padrão)', `ISS de ${pct(iss.aliquota)}`);
    add('municipal', 'Lei 883/2017, art. 98, XI', 'Município responsável pela retenção do ISS');
  }
  if (inss?.aplica) add('federal', INSS.fundamento, inss.reter ? `INSS de ${pct(inss.aliquota)} retido` : inss.decidido ? 'INSS não retido (motivo registrado)' : 'Retenção do INSS a definir');
  if (cb?.parametros) add('federal', 'LC 214/2025', cb.parametros.teste ? 'CBS/IBS em ano-teste (informativo)' : 'CBS/IBS');
  return f;
}

/** Texto pronto para pedir a correção ao fornecedor, a partir dos erros e avisos da conferência. */
export function mensagemFornecedor(r, doc = {}, cadastro = null, orgao = 'Prefeitura Municipal de Frei Inocêncio') {
  const nome = cadastro?.nome || doc.nome || 'fornecedor';
  const nota = [doc.documento || 'nota fiscal', doc.numero ? 'nº ' + doc.numero : ''].filter(Boolean).join(' ');
  /* Inclui tambem o que e so declaracao do emitente: nao muda o pagamento,
     mas e exatamente o que ele precisa corrigir nas proximas notas. */
  const itens = r.problemas.filter(p => (p.nivel !== 'info' || p.impacto === 'declaracao')
    && !/^Comprove|^Alíquotas de|^Sem parâmetros|^Não foi possível consultar/.test(p.titulo));
  const corretos = [];
  if (r.ir.reter) corretos.push(`IRRF: ${moeda(r.ir.valor)} (${pct(r.ir.aliquota)}${r.natureza.cooperativa ? '' : ' — ' + r.natureza.texto})`);
  if (r.inss?.reter) corretos.push(`INSS: ${pct(r.inss.aliquota)} sobre ${moeda(r.inss.base)} = ${moeda(r.inss.valor)} (${INSS.fundamento})`);
  if (r.iss.aplica && r.iss.reter && r.iss.valor) corretos.push(`ISSQN: ${pct(r.iss.aliquota)} = ${moeda(r.iss.valor)}, retido pelo tomador, local da prestação/incidência ${MUNICIPIO.nome}/${MUNICIPIO.uf}`);
  const valoresConferidos = corretos.length ? `Valores conferidos pela Contabilidade:\n- ${corretos.join('\n- ')}\n- Valor líquido a pagar: ${moeda(r.liquido)}\n\n` : '';
  if (!itens.length) return `Prezados (${nome}),\n\nA ${nota} está em pré-conferência fiscal. Não foram encontradas divergências no cálculo preliminar, mas a Contabilidade ainda verificará o documento original, eventuais retenções adicionais e o processo administrativo. Não há, por ora, solicitação de substituição da nota.\n\n${valoresConferidos}Atenciosamente,\nContabilidade — ${orgao}`;
  /* Dois assuntos diferentes na mesma carta: o que ele precisa corrigir
     porque muda o pagamento, e o que e so declaracao dele. Misturar os dois
     faz a carta pedir ao fornecedor providencia que e do Municipio. */
  const daNota = itens.filter(p => p.impacto !== 'declaracao');
  const soDeclaracao = itens.filter(p => p.impacto === 'declaracao');
  const linhas = daNota.map((p, i) => `${i + 1}. ${p.titulo}.\nProvidência solicitada: ${p.solucao}`);
  const avisos = soDeclaracao.map(p => `- ${p.aoEmitente || p.titulo}`);
  const corpo = linhas.length
    ? `Na conferência da ${nota}, no valor de ${moeda(r.valor)}, encontramos:\n${linhas.join('\n')}\n\n`
    : `Na conferência da ${nota}, no valor de ${moeda(r.valor)}, as retenções declaradas seguem em conferência pela Contabilidade.\n\n`;
  const bloco = avisos.length ? `Observação sobre o preenchimento da nota:\n${avisos.join('\n')}\n\n` : '';
  return `Prezados (${nome}),\n\n` + corpo + bloco +
    (corretos.length ? `Valores preliminares para conferência da Contabilidade (não substituir orientação tributária final):\n- ${corretos.join('\n- ')}\n- Líquido preliminar${r.inss?.reter ? '' : ' após IRRF e ISS'}: ${moeda(r.liquido)}\n\n` : '') +
    `Solicitamos a providência correspondente, observando se o documento admite correção, cancelamento ou substituição conforme a legislação e o emissor. A análise final depende do setor de Tributos, Contabilidade e dos documentos do processo. Ficamos à disposição.\n\nAtenciosamente,\nContabilidade — ${orgao}`;
}

// Reexporta para a tela: quais serviços admitem a dedução de terceiros (Lei 966/2023).
export { admiteDeducaoTerceiros, DEDUCAO_TERCEIROS };
