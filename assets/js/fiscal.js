// =============================================================
// SISDIFI — Conferência fiscal de notas de fornecedores (motor de regras, sem tela)
// Lê o código de barras / chave / CNPJ / XML, consulta o CNPJ e confere, para a liquidação:
//   • Simples Nacional (opção na data da nota)          • IRRF — IN RFB 1.234/2012 (redação da IN RFB 2.145/2023)
//   • ISSQN — Frei Inocêncio/MG, alíquota de 5%         • CBS e IBS — LC 214/2025 (ano-teste 2026 e transição)
// Aponta cada divergência da nota com o que fazer para resolver.
// =============================================================

/** Município do órgão (tomador). Código IBGE de Frei Inocêncio/MG. */
export const MUNICIPIO = { nome: 'Frei Inocêncio', uf: 'MG', ibge: '3126901' };

/** ISSQN das notas emitidas no município. */
export const ISS = {
  aliquota: 5,             // alíquota do ISSQN em Frei Inocêncio (informada pela Contabilidade)
  retemOrgao: true,        // o Município, como tomador, retém o ISS das notas emitidas no município
  minimoSimples: 2,        // LC 123/2006: alíquota do ISS no Simples fica entre 2% e 5%
  maximoSimples: 5
};

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
  { id: 'cooperativas', grupo: 'Serviços', texto: 'Serviços de associações profissionais ou assemelhadas e cooperativas', ir: 0, codigo: '8863', servico: true },
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
export function lerCodigo(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto) return { tipo: 'vazio' };
  const so = bruto.toUpperCase().replace(/[^0-9A-Z]/g, '');
  // QR Code da NFC-e / NFS-e: endereço com a chave dentro
  const candidatos = [so, ...(bruto.toUpperCase().match(/[0-9A-Z]{44,53}/g) || [])];
  for (const c0 of candidatos) {
    const c = c0.startsWith('NFS') && c0.length === 53 ? c0.slice(3) : c0.startsWith('NFE') && c0.length === 47 ? c0.slice(3) : c0;
    if (c.length === 44 && /^\d{6}[0-9A-Z]{12}\d{26}$/.test(c)) {
      const modelo = c.slice(20, 22);
      return { tipo: 'chave', documento: MODELOS[modelo] || 'Documento modelo ' + modelo, modelo, chave: c,
        valida: dvModulo11(c.slice(0, 43)) === Number(c[43]), cnpj: c.slice(6, 20),
        anoMes: `20${c.slice(2, 4)}-${c.slice(4, 6)}`, serie: String(Number(c.slice(22, 25))), numero: String(Number(c.slice(25, 34))), ufIbge: c.slice(0, 2) };
    }
    if (c.length === 50 && /^\d{9}[0-9A-Z]{14}\d{27}$/.test(c)) {
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
    municipioEmissor: tag(inf, 'cLocIncid') || tag(dps, 'cLocEmi') || tag(bloco(emit, 'enderNac'), 'cMun'),
    municipioIncidencia: tag(inf, 'cLocIncid'),
    valor: num(tag(bloco(dps, 'vServPrest'), 'vServ') || tag(dps, 'vServ')),
    regimeNota: op === '1' ? 'normal' : op === '2' ? 'mei' : op === '3' ? 'simples' : '',
    regimeNotaTexto: ({ 1: 'Não optante pelo Simples Nacional', 2: 'MEI', 3: 'ME/EPP do Simples Nacional' })[op] || '',
    servico: true, codigoServico: tag(bloco(dps, 'cServ'), 'cTribNac'), descricaoServico: tag(bloco(dps, 'cServ'), 'xDescServ'),
    irrfDestacado: numOuNulo(tag(tribFed, 'vRetIRRF')),
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
    municipioEmissor: tag(x, 'CodigoMunicipio') || tag(x, 'MunicipioIncidencia'),
    valor: num(tag(v, 'ValorServicos')),
    regimeNota: op === '1' ? 'simples' : op === '2' ? 'normal' : '',
    regimeNotaTexto: op === '1' ? 'Optante pelo Simples Nacional' : op === '2' ? 'Não optante pelo Simples Nacional' : '',
    servico: true, codigoServico: tag(x, 'ItemListaServico') || tag(x, 'CodigoTributacaoMunicipio'), descricaoServico: tag(x, 'Discriminacao'),
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

/** Sugere a natureza (Anexo I) a partir da nota. A Contabilidade confirma. */
export function sugerirNatureza(doc) {
  if (!doc) return 'mercadorias';
  if (doc.combustivel) return 'combustiveis';
  const porModelo = { '66': 'energia', '62': 'agua_telefone', '57': 'transporte_cargas', '67': 'transporte_passageiros', '63': 'transporte_passageiros' }[String(doc.modelo)];
  if (porModelo) return porModelo;
  if (!doc.servico) return 'mercadorias';
  const c = sem(doc.codigoServico).replace(/\D/g, '');
  const item = c.slice(0, 2), sub = c.slice(0, 4);
  if (sub === '0402' || sub === '0403') return sub === '0403' ? 'hospitalares' : 'diagnostico';
  if (item === '07' && /^070[25]/.test(sub)) return 'construcao_materiais';
  if (item === '16') return /passag|passageir/i.test(doc.descricaoServico || '') ? 'transporte_passageiros' : 'transporte_cargas';
  if (sub === '0710' || sub === '1109' || sub === '1102') return 'limpeza';
  if (item === '17' && sub === '1705') return 'mao_de_obra';
  if (item === '15') return 'bancos';
  if (item === '03') return 'locacao';
  return 'demais_servicos';
}

// ---------------- Consulta do CNPJ (Receita Federal, dados abertos) ----------------
const NATUREZAS_DISPENSA = {
  '3220': 'organização religiosa (art. 4º, I)', '2143': 'cooperativa (verifique o código 8863 ou 3280)',
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
      municipio: e.cidade?.nome || '', uf: e.estado?.sigla || '', municipioIbge: sem(e.cidade?.ibge_id),
      simples: /sim/i.test(sem(s.simples)), simplesInicio: s.data_opcao_simples || '', simplesFim: s.data_exclusao_simples || '',
      mei: /sim/i.test(sem(s.mei)), meiInicio: s.data_opcao_mei || '', meiFim: s.data_exclusao_mei || ''
    };
  }
  return {
    fonte, cnpj: limparCnpj(j.cnpj), nome: j.razao_social, fantasia: j.nome_fantasia || '',
    situacao: sem(j.descricao_situacao_cadastral).toUpperCase(), naturezaCodigo: sem(j.codigo_natureza_juridica).replace(/\D/g, ''), naturezaTexto: j.natureza_juridica || '',
    cnae: sem(j.cnae_fiscal), cnaeTexto: j.cnae_fiscal_descricao || '',
    municipio: j.municipio || '', uf: j.uf || '', municipioIbge: sem(j.codigo_municipio_ibge),
    simples: j.opcao_pelo_simples === true, simplesInicio: j.data_opcao_pelo_simples || '', simplesFim: j.data_exclusao_do_simples || '',
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
  if (!data) return !!marcado;
  if (!inicio) return !!marcado;
  if (inicio > data) return false;
  if (fim && fim <= data) return false;
  return true;
}

// ---------------- Conferência ----------------
const r2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
export const moeda = v => (v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const pct = v => `${String(r2(v)).replace('.', ',')}%`;
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
export function conferir({ doc = {}, cadastro = null, naturezaId, simplesManual = '', hoje = new Date().toISOString().slice(0, 10), chave = null } = {}) {
  const nat = natureza(naturezaId) || natureza(sugerirNatureza(doc));
  const problemas = [];
  const add = (nivel, titulo, solucao, detalhe = '') => problemas.push({ nivel, titulo, solucao, detalhe });
  const valor = r2(doc.valor || 0);
  const emissao = doc.emissao || '';
  const ano = Number(emissao.slice(0, 4)) || Number(hoje.slice(0, 4));

  // 1. Documento
  if (chave && chave.tipo === 'chave' && !chave.valida) add('erro', 'Chave de acesso com dígito verificador inválido', 'Confira a digitação ou leia de novo o código de barras. Se persistir, peça ao fornecedor a chave correta: a nota pode não existir.');
  if (!valor) add('erro', 'Valor da nota não informado', 'Informe o valor bruto da nota (valor total dos serviços ou da NF-e).');
  if (emissao && emissao > hoje) add('erro', 'Data de emissão no futuro', 'Confira a data de emissão na nota.');
  if (chave?.anoMes && emissao && emissao.slice(0, 7) !== chave.anoMes) add('alerta', 'Mês da chave diferente da data de emissão informada', `A chave indica ${chave.anoMes.split('-').reverse().join('/')}. Confira a data da nota.`);
  if (doc.cnpj && cadastro?.cnpj && limparCnpj(doc.cnpj) !== cadastro.cnpj) add('erro', 'CNPJ da nota diferente do consultado', 'Confira se a nota é mesmo deste fornecedor.');

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
      add('erro', 'A nota se declara do Simples Nacional, mas o fornecedor não é optante na data da emissão', `Trate como NÃO optante: retenha o IRRF de ${pct(nat.ir)}${nat.servico ? ' e o ISS de ' + pct(ISS.aliquota) : ''}. Peça ao fornecedor a correção do regime na nota (NFS-e: nota substituta; NF-e: cancelamento e nova emissão, se ainda no prazo) ou uma consulta do Portal do Simples que prove a opção na data.`, doc.regimeNotaTexto);
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
  if (!simples) {
    const calc = r2(valor * nat.ir / 100);
    if (nat.ir === 0) ir.motivo = 'Natureza sem retenção de IR no Anexo I';
    else if (calc < MINIMO_RETENCAO_IR) { ir.valor = calc; ir.motivo = `IR calculado inferior a R$ 10,00 — retenção dispensada (art. 3º, § 6º)`; }
    else { ir.valor = calc; ir.reter = true; ir.motivo = ir.motivo || `${nat.texto}: ${pct(nat.ir)} sobre o valor bruto (Anexo I da IN RFB 1.234/2012; IN RFB 2.145/2023)`; }
  }
  if (dispensaNatureza && !simples) add('alerta', `Natureza jurídica: ${cadastro.naturezaTexto}`, `Pode haver dispensa de retenção (${dispensaNatureza}). Só deixe de reter com a declaração do Anexo II/III da IN RFB 1.234/2012 (e o Cebas, quando exigido). Sem ela, retenha normalmente.`);
  const irNota = doc.irrfDestacado;
  if (ir.reter) {
    if (irNota == null || irNota === 0) add('alerta', 'IRRF não destacado na nota', `Retenha mesmo assim ${moeda(ir.valor)} (${pct(ir.aliquota)}): a responsabilidade pela retenção é do Município. Oriente o fornecedor a informar a retenção nas próximas notas (NF-e: carta de correção nas informações complementares; NFS-e: campo de retenção do IRRF).`);
    else if (difere(irNota, ir.valor)) add('erro', `IRRF destacado na nota (${moeda(irNota)}) diferente do devido (${moeda(ir.valor)})`, `Retenha ${moeda(ir.valor)} — ${pct(ir.aliquota)} para "${nat.texto}". Se a natureza escolhida estiver certa, peça ao fornecedor a correção da nota${doc.modelo === 'nfse' ? ' (nota substituta)' : ' (carta de correção, se só nas informações complementares)'}. Confira se a natureza do bem/serviço está correta.`);
  } else if (simples && irNota > 0) {
    add('alerta', `Nota com IRRF destacado (${moeda(irNota)}), mas o fornecedor é do Simples`, 'Não retenha. Avise o fornecedor para retirar o destaque nas próximas notas; se ele quiser a nota corrigida agora, NFS-e por nota substituta.');
  }
  if (nat.inss && !simples) add('info', 'Verifique a retenção do INSS (11%)', 'Cessão de mão de obra e empreitada podem ter retenção previdenciária (Lei 8.212/1991, art. 31; IN RFB 2.110/2022). Esta ferramenta não calcula o INSS.');

  // 5. ISSQN
  const iss = { aplica: false, aliquota: null, valor: 0, reter: false, motivo: '' };
  const servico = !!(nat.servico || doc.servico);
  const doMunicipio = !doc.municipioEmissor || String(doc.municipioEmissor) === MUNICIPIO.ibge;
  if (servico) {
    if (!doMunicipio) {
      iss.motivo = `Nota de outro município (${doc.municipioEmissor}): em regra o ISS é devido no município do prestador (LC 116/2003, art. 3º)`;
      add('info', 'ISS de nota de outro município', 'Não retenha o ISS de Frei Inocêncio, exceto nos serviços em que o imposto é devido no local da prestação (obras, limpeza, vigilância, etc. — LC 116/2003, art. 3º). Confira se a nota está no município correto.');
    } else if (mei) {
      iss.aplica = true; iss.motivo = 'MEI recolhe o ISS em valor fixo no DAS — não há retenção';
      if (doc.issValor > 0 || doc.issRetidoNota) add('alerta', 'MEI com ISS destacado/retido na nota', 'Não retenha ISS de MEI (LC 123/2006, art. 18-A). Peça ao fornecedor a correção da nota.');
    } else {
      iss.aplica = true;
      if (simples) {
        const informada = doc.issAliquota;
        if (informada == null || informada === 0) { iss.aliquota = ISS.aliquota; add('alerta', 'ME/EPP do Simples sem alíquota de ISS na nota', `Retenha pela alíquota de ${pct(ISS.aliquota)} (LC 123/2006, art. 21, § 4º, IV) e oriente o fornecedor a informar a alíquota do Simples nas próximas notas.`); }
        else if (informada < ISS.minimoSimples || informada > ISS.maximoSimples) { iss.aliquota = ISS.aliquota; add('erro', `Alíquota de ISS do Simples fora da faixa (${pct(informada)})`, `No Simples a alíquota do ISS fica entre ${pct(ISS.minimoSimples)} e ${pct(ISS.maximoSimples)}. Retenha ${pct(ISS.aliquota)} e peça nota substituta com a alíquota correta.`); }
        else iss.aliquota = informada;
        iss.motivo = `ME/EPP do Simples: retenção pela alíquota informada na nota (LC 123/2006, art. 21, § 4º)`;
      } else {
        iss.aliquota = ISS.aliquota;
        iss.motivo = `Serviço com nota emitida em ${MUNICIPIO.nome}: ISS de ${pct(ISS.aliquota)}`;
        if (doc.issAliquota != null && doc.issAliquota !== 0 && difere(doc.issAliquota, ISS.aliquota, 0.001)) add('erro', `Alíquota de ISS na nota (${pct(doc.issAliquota)}) diferente da do município (${pct(ISS.aliquota)})`, `O fornecedor não é do Simples: o ISS em ${MUNICIPIO.nome} é de ${pct(ISS.aliquota)}. Retenha ${pct(ISS.aliquota)} e peça a nota substituta com a alíquota correta.`);
      }
      iss.valor = r2(valor * iss.aliquota / 100);
      iss.reter = ISS.retemOrgao;
      if (doc.issValor != null && doc.issValor > 0 && difere(doc.issValor, iss.valor) && !problemas.some(p => p.titulo.startsWith('Alíquota de ISS'))) add('erro', `Valor do ISS na nota (${moeda(doc.issValor)}) diferente do calculado (${moeda(iss.valor)})`, 'Confira a base de cálculo (deduções) na nota. Se não houver dedução legal, peça a nota substituta.');
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
    cb.esperado = { cbs: aliqCBS, ibs: aliqIBS, vCBS: r2(valor * aliqCBS / 100), vIBS: r2(valor * aliqIBS / 100) };
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
      const cstReduzido = n.cst && n.cst !== '000';
      if (!cstReduzido) {
        if (n.pCBS != null && difere(n.pCBS, aliqCBS, 0.001)) add('erro', `Alíquota da CBS na nota (${pct(n.pCBS)}) diferente da esperada (${pct(aliqCBS)})`, 'Peça ao fornecedor a correção da nota (cancelamento e nova emissão no prazo, ou nota de ajuste).');
        const ibsNota = (n.pIBSUF ?? 0) + (n.pIBSMun ?? 0);
        if ((n.pIBSUF != null || n.pIBSMun != null) && difere(ibsNota, aliqIBS, 0.001)) add('erro', `Alíquota do IBS na nota (${pct(ibsNota)}) diferente da esperada (${pct(aliqIBS)})`, 'Peça ao fornecedor a correção da nota.');
        if (n.vCBS != null && difere(n.vCBS, cb.esperado.vCBS, 0.05) && n.pCBS == null) add('alerta', `Valor da CBS (${moeda(n.vCBS)}) diferente do esperado (${moeda(cb.esperado.vCBS)})`, 'Confira a base de cálculo da CBS na nota.');
      } else add('info', `CBS/IBS com tratamento diferenciado na nota (CST ${n.cst}${n.classTrib ? ', cClassTrib ' + n.classTrib : ''})`, 'Confira se o bem/serviço tem mesmo redução, isenção ou alíquota zero na LC 214/2025.');
    }
  }

  // 7. Resultado para a liquidação
  const retencoes = r2((ir.reter ? ir.valor : 0) + (iss.reter ? iss.valor : 0));
  const liquido = r2(valor - retencoes);
  const ordem = { erro: 0, alerta: 1, info: 2 };
  problemas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
  const situacao = problemas.some(p => p.nivel === 'erro') ? 'erro' : problemas.some(p => p.nivel === 'alerta') ? 'alerta' : 'ok';
  return { natureza: nat, valor, emissao, simples, mei, fonteSimples, ir, iss, cbsibs: cb, retencoes, liquido, problemas, situacao };
}
