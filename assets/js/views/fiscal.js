// SISDIFI — Conferência fiscal de notas de fornecedores (somente Contabilidade)
// Leitor de código de barras / câmera / digitação / XML → Simples Nacional, IRRF, ISSQN, CBS/IBS e o que corrigir.
import { estado } from '../estado.js';
import { esc, $, toast, dataBR, hojeISO } from '../ui.js';
import { cabecalho } from './comum.js';
import { lerDanfsePDF } from '../danfse-pdf.js';
import { auditoriaNota, monitorFiscalSituacao, VERSAO_POLITICA_FISCAL, FONTES_LEGISLATIVAS } from '../auditoria-fiscal.js?v=3.15.0';
import {
  lerCodigo, lerXML, consultarCnpj, conferir, sugerirNatureza, descreverTributacao, NATUREZAS, MUNICIPIO, ISS, MINIMO_RETENCAO_IR,
  formatarCnpj, limparCnpj, cnpjValido, moeda, aliquotaIss, mensagemFornecedor
} from '../fiscal.js';

const PORTAL_SIMPLES = 'https://consopt.www8.receita.fazenda.gov.br/consultaoptantes';
/** Link do Portal do Simples: o portal não aceita o CNPJ no endereço (tem captcha), então o CNPJ vai copiado para colar. */
const linkPortal = (texto, classe = '') => {
  const c = limparCnpj(s.doc.cnpj || s.consulta?.cadastro?.cnpj);
  return `<a class="${classe}" href="${PORTAL_SIMPLES}" target="_blank" rel="noopener noreferrer" data-portal="${esc(c)}" title="${c ? 'Copia o CNPJ ' + esc(formatarCnpj(c)) + ' e abre a Consulta Optantes — cole (Ctrl+V) no campo CNPJ' : 'Abre a Consulta Optantes do Simples Nacional'}">${texto}${c && !classe ? ' <small>(o CNPJ é copiado ao abrir)</small>' : ''}</a>`;
};
// Ao clicar em qualquer link do Portal, copia o CNPJ (só números) para colar no campo da consulta
document.addEventListener('click', e => {
  const a = e.target.closest?.('[data-portal]');
  if (!a || !a.dataset.portal) return;
  const c = a.dataset.portal;
  navigator.clipboard?.writeText(c).then(() => toast(`CNPJ ${formatarCnpj(c)} copiado. No Portal: cole (Ctrl+V) no campo CNPJ, marque o captcha e clique em Consultar.`),
    () => toast(`Digite no Portal o CNPJ ${c}.`, 'aviso'));
});
const CHAVE_HIST = 'sisdifi.fiscal.historico';

// Estado da tela (fica entre as navegações)
const s = {
  codigo: '', leitura: null, doc: {}, consulta: null, consultando: false, natureza: '', naturezaAuto: true,
  simplesManual: '', resultado: null, auditoria:null, confirmacoes:{}, conf: 0, tipo: lerTipoSalvo()
};
function lerTipoSalvo() { try { return localStorage.getItem('sisdifi.fiscal.tipo') || ''; } catch { return ''; } }
const TIPOS = [['', 'Automático'], ['nfe', 'NF-e / NFC-e / CT-e (44)'], ['nfse', 'NFS-e Nacional (50)'], ['cnpj', 'CNPJ (14)']];
const TAMANHO = { nfe: 44, nfse: 50, cnpj: 14 };
export const ultimaConferencia = { r: null, s: null, auditoria:null, quando: null };
let catalogoFiscal=null, ultimaLeituraLegislacao=0, carregandoLegislacao=null, erroCatalogoFiscal='';

// Nome do município pelo código IBGE (lista local do sistema)
let mapaMunicipios = null;
fetch('assets/data/municipios.json').then(r => r.json()).then(b => {
  mapaMunicipios = {};
  for (const [uf, lista] of Object.entries(b.municipios || {})) for (const m of lista) mapaMunicipios[String(m[3])] = `${m[0]}/${uf}`;
}).catch(() => {});
let mapaPorNome = null;
const semAcento = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** "Frei Inocêncio / MG" ou "Frei Inocêncio" → código IBGE (na falta de UF, procura primeiro em MG). */
function codigoMunicipio(texto) {
  if (!texto || !mapaMunicipios) return '';
  if (!mapaPorNome) { mapaPorNome = {}; for (const [cod, n] of Object.entries(mapaMunicipios)) { const [nome, uf] = n.split('/'); mapaPorNome[semAcento(nome) + '|' + uf] = cod; mapaPorNome[semAcento(nome)] ??= cod; } }
  const [nome, uf] = String(texto).split('/').map(x => x.trim());
  return mapaPorNome[semAcento(nome) + '|' + (uf || MUNICIPIO.uf).toUpperCase().slice(0, 2)] || mapaPorNome[semAcento(nome)] || '';
}
function nomeMunicipio(cod) { const c = String(cod || ''); return (mapaMunicipios && mapaMunicipios[c]) || (c === 'outro' ? 'outro município' : c); }

const pctTxt = v => (v == null ? '—' : String(Math.round(v * 100) / 100).replace('.', ',') + '%');
const numCampo = v => (v == null || v === '' ? '' : String(v));

function historico() { try { return JSON.parse(localStorage.getItem(CHAVE_HIST) || '[]'); } catch { return []; } }
function guardarHistorico(item) {
  try { const h = historico().filter(x => x.id !== item.id); h.unshift(item); localStorage.setItem(CHAVE_HIST, JSON.stringify(h.slice(0, 60))); } catch { /* sem armazenamento */ }
}
const idNota = () => s.doc.chave || (s.doc.cnpj && s.doc.numero ? `${limparCnpj(s.doc.cnpj)}-${s.doc.numero}` : '');

export function telaFiscal(el) {
  const compacto = el.classList.contains('fiscal-compacto');
  el.innerHTML = `
    ${compacto ? '' : cabecalho('Auditoria fiscal pré-liquidação', '', `Tomador: Prefeitura Municipal de ${esc(MUNICIPIO.nome)}/${MUNICIPIO.uf}. Conferência de NF-e/NFS-e, retenções e legislação atualizada, com diligências antes da liquidação.`)}
    ${compacto ? '' : `<p class="alerta alerta-info">O código da nota identifica o documento, mas não fornece sozinho todos os itens, retenções ou a autorização. Para auditoria completa, abra o XML/PDF e confirme os dados e o atesto. O SISDIFI não liquida notas no sistema contábil.</p><ol class="fiscal-etapas"><li class="${s.codigo || s.doc.cnpj ? 'feita' : 'atual'}"><b>1</b> Ler a nota</li><li class="${s.resultado && s.doc.valor ? 'feita' : s.codigo || s.doc.cnpj ? 'atual' : ''}"><b>2</b> Conferir os dados</li><li class="${s.resultado && s.doc.valor ? 'atual' : ''}"><b>3</b> Liquidar e comunicar</li></ol>`}
    <div class="cartao fiscal-leitura">
      <label class="campo"><span>Código de barras, chave de acesso, QR Code ou CNPJ</span>
        <div class="fiscal-linha">
          <select id="fis-tipo" class="fiscal-tipo" title="Tipo de nota: com o tipo escolhido, a conferência só começa quando a chave estiver completa">
            ${TIPOS.map(([v, n]) => `<option value="${v}" ${s.tipo === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <div class="fiscal-campo-codigo">
          <input id="fis-codigo" inputmode="text" autocomplete="off" spellcheck="false" placeholder="Leia o código de barras ou digite a chave / CNPJ" value="${esc(s.codigo)}">
          <button type="button" class="fiscal-x" id="fis-x" title="Apagar o código (Esc)" aria-label="Apagar o código" ${s.codigo ? '' : 'hidden'}>✕</button></div>
          <button class="btn" type="button" id="fis-ler">Conferir</button>
        </div>
        <small class="dica fiscal-dica"><span id="fis-leitura-dica">${s.leitura ? esc(descreverLeitura(s.leitura)) : 'O leitor USB funciona como teclado: é só ler com o cursor neste campo. Digitando, tecle Enter no final.'}</span><span id="fis-contador" class="fiscal-contador"></span></small>
      </label>
      <div class="acoes-linha">
        <button class="btn btn-sec" type="button" id="fis-camera">📷 Ler com a câmera</button>
        <label class="btn btn-sec" for="fis-xml" title="Abra o PDF do DANFSe (ou o XML) e os campos se preenchem sozinhos">📄 Abrir PDF ou XML da nota</label><input type="file" id="fis-xml" accept=".pdf,application/pdf,.xml,text/xml,application/xml" hidden>
        <button class="btn btn-sec" type="button" id="fis-aliquotas" title="Alíquota padrão do ISS e exceções por código de serviço">⚙ Alíquotas do ISS</button>
        <button class="btn btn-sec fiscal-limpar" type="button" id="fis-limpar" title="Apaga a nota, a consulta e o resultado para conferir outra nota" ${temConsulta() ? '' : 'disabled'}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
          Limpar consulta</button>
      </div>
    </div>
    <div class="grade-form fiscal-grade">
      <form class="cartao col-form" id="fis-form" novalidate></form>
      <aside class="col-resultado" id="fis-resultado"></aside>
    </div>`;

  const inp = $('#fis-codigo', el);
  const ler = () => processarCodigo(el, inp.value);
  $('#fis-ler', el).onclick = ler;
  // Quando conferir sozinho, sem Enter:
  //  • tipo escolhido → assim que a chave tiver o tamanho certo daquele tipo (44, 50 ou 14);
  //  • automático → só quando a chave chega de uma vez (leitor USB ou colar); digitando à mão, espera o Enter.
  let espera = null, inicio = 0;
  const selTipo = $('#fis-tipo', el), contador = $('#fis-contador', el);
  const atualizarContador = () => {
    const n = inp.value.toUpperCase().replace(/[^0-9A-Z]/g, '').length;
    const alvo = TAMANHO[s.tipo];
    contador.textContent = n ? (alvo ? `${n} de ${alvo}` : `${n} caracteres`) : '';
    contador.classList.toggle('completo', !!alvo && n === alvo);
  };
  inp.maxLength = s.tipo === 'cnpj' ? 18 : s.tipo ? 60 : 600;
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(espera); ler(); } };
  inp.oninput = () => {
    clearTimeout(espera);
    const v = inp.value.trim();
    if (v.length <= 1) inicio = Date.now();
    atualizarContador();
    if (s.tipo) {
      const l = lerCodigo(v, s.tipo);
      if (l.tipo === 'chave' || l.tipo === 'cnpj') espera = setTimeout(() => { if (inp.isConnected && inp.value.trim() === v) ler(); }, 150);
      return;
    }
    const d = v.replace(/\D/g, '');
    const rapido = Date.now() - inicio < 1500; // leitor USB ou colar: a chave inteira chega em menos de 1,5 s
    if ((d.length === 44 || d.length === 50) && d === v && rapido) espera = setTimeout(() => { if (inp.isConnected && inp.value.trim() === v) ler(); }, 400);
  };
  inp.onpaste = () => { inicio = Date.now(); };
  selTipo.onchange = () => {
    s.tipo = selTipo.value;
    try { localStorage.setItem('sisdifi.fiscal.tipo', s.tipo); } catch { /* sem armazenamento */ }
    inp.maxLength = s.tipo === 'cnpj' ? 18 : s.tipo ? 60 : 600;
    atualizarContador(); inp.focus();
  };
  atualizarContador();
  $('#fis-camera', el).onclick = () => abrirCamera(el);
  $('#fis-xml', el).onchange = e => { const a = e.target.files?.[0]; e.target.value = ''; if (a && /\.pdf$/i.test(a.name)) abrirPDF(el, a); else abrirXML(el, a); };
  $('#fis-aliquotas', el).onclick = () => abrirAliquotas(el);
  carregarParametros(el);
  carregarLegislacao(el);
  $('#fis-limpar', el).onclick = () => limparConsulta(el);
  $('#fis-x', el).onclick = () => { inp.value = ''; $('#fis-x', el).hidden = true; inp.focus(); };
  inp.addEventListener('input', () => { $('#fis-x', el).hidden = !inp.value; });
  inp.addEventListener('keydown', e => { if (e.key === 'Escape' && inp.value) { e.preventDefault(); e.stopPropagation(); inp.value = ''; $('#fis-x', el).hidden = true; } });
  desenharForm(el);
  desenharResultado(el);
  if (!s.codigo) setTimeout(() => inp.focus(), 50);
  return { titulo: 'Conferência fiscal' };
}

const temConsulta = () => !!(s.codigo || s.doc.cnpj || s.doc.valor || s.resultado);

/** Apaga a nota, a consulta do CNPJ e o resultado, e deixa o leitor pronto para a próxima nota. */
function limparConsulta(el) {
  Object.assign(s, { codigo: '', leitura: null, doc: {}, consulta: null, consultando: false, natureza: '', naturezaAuto: true, simplesManual: '', resultado: null, auditoria:null, confirmacoes:{}, repetida: null, conf: 0 });
  ultimaConferencia.r = null; ultimaConferencia.s = null;
  ultimaLeitura = { texto: '', quando: 0 };
  telaFiscal(el);
  const i = $('#fis-codigo', el); i?.focus();
  toast('Consulta limpa. Pronto para a próxima nota.');
}

function descreverLeitura(l) {
  if (l.tipo === 'chave') return `${l.documento} nº ${l.numero}${l.serie ? ' série ' + l.serie : ''} · emitente ${formatarCnpj(l.cnpj || l.cpf)} · ${l.anoMes.split('-').reverse().join('/')}${l.valida ? ' · chave conferida' : ' · DÍGITO VERIFICADOR NÃO CONFERE'}`;
  if (l.tipo === 'cnpj') return l.valida ? `CNPJ ${formatarCnpj(l.cnpj)}` : 'CNPJ com dígito verificador inválido';
  return '';
}

let ultimaLeitura = { texto: '', quando: 0 };
async function processarCodigo(el, texto) {
  // o leitor USB "digita" e manda Enter: evita processar a mesma leitura duas vezes
  if (texto === ultimaLeitura.texto && Date.now() - ultimaLeitura.quando < 2000) return;
  ultimaLeitura = { texto, quando: Date.now() };
  const l = lerCodigo(texto, s.tipo);
  if (l.tipo === 'incompleto') { ultimaLeitura = { texto: '', quando: 0 }; toast(`Chave incompleta: ${l.tamanho} de ${l.esperado} caracteres. Confira os dígitos.`, 'aviso'); return; }
  if (l.tipo === 'outroTipo') { ultimaLeitura = { texto: '', quando: 0 }; toast(`Esse código é de ${l.documento}, não do tipo escolhido. Troque o tipo de nota ou use "Automático".`, 'aviso'); return; }
  if (l.tipo === 'vazio') { toast('Leia ou digite a chave, o QR Code ou o CNPJ.', 'aviso'); return; }
  if (l.tipo === 'boleto') { toast('Isso é a linha de um boleto: ele não traz o CNPJ do fornecedor. Leia o código de barras do DANFE/NFS-e ou digite o CNPJ.', 'aviso'); return; }
  if (l.tipo === 'desconhecido') { toast(`Não reconheci o código (${l.tamanho} caracteres). A chave da NF-e tem 44 dígitos, a da NFS-e Nacional 50 e o CNPJ 14.`, 'erro'); return; }
  s.codigo = l.chave || formatarCnpj(l.cnpj);
  s.leitura = l; s.conf = Date.now();
  // mantém o que veio do XML se for a mesma nota
  if (!(s.doc.origem === 'xml' && s.doc.chave === l.chave)) {
    s.confirmacoes = {};
    s.doc = { origem: 'leitura', cnpj: l.cnpj, documento: l.tipo === 'chave' ? l.documento : '', modelo: l.modelo || '', chave: l.chave || '', numero: l.numero || '', serie: l.serie || '',
      municipioEmissor: l.municipio || '', servico: l.modelo === 'nfse', emissao: l.anoMes ? l.anoMes + '-01' : '' };
    s.naturezaAuto = true;
  }
  if (l.tipo === 'cnpj' && !l.valida) { toast('CNPJ com dígito verificador inválido.', 'erro'); }
  telaFiscal(el);
  await consultar(el);
  if (s.doc.origem === 'leitura' && l.tipo === 'chave') { toast(`${l.documento} nº ${l.numero} lida. Agora preencha valor, código de tributação e o que está na nota.`); setTimeout(() => $('#fis-form [name=valor]', el)?.focus(), 50); }
}

async function abrirPDF(el, arquivo) {
  toast('Lendo o PDF do DANFSe…');
  try {
    const d = await lerDanfsePDF(arquivo);
    d.municipioEmissor = d.municipioEmissorIbge || codigoMunicipio(d.municipioEmissorTexto);
    d.localPrestacao = codigoMunicipio(d.localPrestacaoTexto) || (d.localPrestacaoTexto ? 'outro' : '');
    d.incidencia = d.incidenciaIbge || codigoMunicipio(d.incidenciaTexto) || (d.incidenciaTexto ? 'outro' : '');
    s.doc = d; s.naturezaAuto = true; s.simplesManual = ''; s.confirmacoes={}; s.conf = Date.now();
    s.leitura = d.chave ? lerCodigo(d.chave) : (d.cnpj ? lerCodigo(d.cnpj) : null);
    s.codigo = d.chave || formatarCnpj(d.cnpj);
    telaFiscal(el);
    toast(`DANFSe nº ${d.numero || ''} lido. Confira os campos com o documento.`);
    await consultar(el);
  } catch (e) { toast(e.message || 'Não consegui ler o PDF.', 'erro'); }
}

async function abrirXML(el, arquivo) {
  if (!arquivo) return;
  try {
    const texto = await arquivo.text();
    const d = lerXML(texto);
    s.doc = d; s.naturezaAuto = true; s.simplesManual = ''; s.confirmacoes={}; s.conf = Date.now();
    s.leitura = d.chave ? lerCodigo(d.chave) : (d.cnpj ? lerCodigo(d.cnpj) : null);
    s.codigo = d.chave || formatarCnpj(d.cnpj);
    telaFiscal(el);
    toast(`${d.documento} ${d.numero ? 'nº ' + d.numero : ''} lida do XML.`);
    await consultar(el);
  } catch (e) { toast(e.message || 'Não consegui ler o XML.', 'erro'); }
}

async function consultar(el) {
  const cnpj = limparCnpj(s.doc.cnpj);
  if (!cnpj || !cnpjValido(cnpj)) { s.consulta = null; recalcular(el); return; }
  if (s.consulta?.cadastro?.cnpj === cnpj) { recalcular(el); return; }
  s.consultando = true; s.consulta = null; desenharResultado(el);
  s.consulta = await consultarCnpj(cnpj);
  s.consultando = false;
  if (s.consulta.naoEncontrado) toast('CNPJ não encontrado na base da Receita Federal.', 'erro');
  desenharForm(el);
  recalcular(el);
}

// ---------------- Formulário (dados da nota) ----------------
function desenharForm(el) {
  const f = $('#fis-form', el);
  const d = s.doc;
  const ehCooperativa = s.consulta?.cadastro?.naturezaCodigo === '2143';
  if (s.naturezaAuto) s.natureza = ehCooperativa ? 'cooperativas' : sugerirNatureza(d);
  if (s.natureza === 'cooperativas' && d.coopTransporte == null) {
    const sub = String(d.codigoServico || '').replace(/\D/g, '').slice(0, 4);
    d.coopTransporte = sub === '1601' || (sub === '1602' && /passag|escolar|pessoas|alunos/i.test(d.descricaoServico || '')) ? 'passageiros' : '';
  }
  const grupos = [...new Set(NATUREZAS.map(n => n.grupo))];
  const cad = s.consulta?.cadastro;
  const ibs = d.ibscbs || {};
  const trib = descreverTributacao(d.codigoServico);
  const ehServico = d.servico || /NFS/.test(d.documento || '') || !!trib?.valido;
  const sel = (v, atual) => (v === atual ? 'selected' : '');
  f.innerHTML = `
    <h3>Dados da nota ${d.origem === 'xml' ? '<span class="selo selo-info">lidos do XML</span>' : ''}</h3>
    <p class="dica fiscal-passo">Preencha com o que está impresso na nota. Os campos com <b>*</b> são os que mudam as retenções.</p>
    <div class="fiscal-sec"><span>1</span> Identificação da nota</div>
    <div class="grade-2">
      <label class="campo"><span>CNPJ do fornecedor *</span><input name="cnpj" value="${esc(d.cnpj ? formatarCnpj(d.cnpj) : '')}" placeholder="00.000.000/0000-00"></label>
      <label class="campo"><span>Documento</span><select name="documento">
        ${['', 'NFS-e Nacional', 'NFS-e', 'NF-e', 'NFC-e', 'CT-e', 'CT-e OS', 'NF3-e (energia elétrica)', 'NFCom (telecomunicação)', 'BP-e (passagem)', 'Recibo/Fatura'].map(o => `<option ${sel(o, d.documento || '')} value="${esc(o)}">${esc(o || 'Selecione')}</option>`).join('')}</select></label>
    </div>
    <div class="grade-3">
      <label class="campo"><span>Número</span><input name="numero" value="${esc(d.numero || '')}"></label>
      <label class="campo"><span>Data de competência *</span><input type="date" name="emissao" value="${esc(d.emissao || '')}"></label>
      <label class="campo"><span>Valor bruto (R$) *</span><input type="number" name="valor" step="0.01" min="0" value="${esc(numCampo(d.valor))}" placeholder="0,00"></label>
    </div>
    <div class="fiscal-sec"><span>2</span> ${ehServico || !d.documento ? 'Serviço e natureza do IRRF' : 'Natureza do IRRF'}</div>
    ${ehServico || !d.documento ? `<div class="grade-2">
      <label class="campo"><span>Código de tributação (serviço) *</span><input name="codigoServico" value="${esc(trib?.codigo || d.codigoServico || '')}" placeholder="ex.: 16.01.01" inputmode="numeric">
        <small class="dica ${trib && !trib.valido ? 'erro-txt' : ''}">${trib ? esc(trib.valido ? `${trib.texto} (item ${trib.item} — ${trib.grupo})` : trib.texto) : 'Item da lista de serviços (LC 116), como aparece na NFS-e.'}</small></label>
      <label class="campo"><span>Local da prestação do serviço *</span><select name="localPrestacao">
        <option value="${MUNICIPIO.ibge}" ${!d.localPrestacao || d.localPrestacao === MUNICIPIO.ibge ? 'selected' : ''}>${esc(MUNICIPIO.nome)}/${MUNICIPIO.uf}</option>
        <option value="outro" ${d.localPrestacao && d.localPrestacao !== MUNICIPIO.ibge ? 'selected' : ''}>Outro município${d.localPrestacao && d.localPrestacao !== MUNICIPIO.ibge ? ' (' + esc(nomeMunicipio(d.localPrestacao)) + ')' : ''}</option></select>
        <small class="dica">Nota emitida em: <strong>${esc(d.municipioEmissor ? nomeMunicipio(d.municipioEmissor) : 'não informado')}</strong></small></label>
    </div>` : ''}
    ${ehServico || !d.documento ? `<label class="campo"><span>Descrição do serviço (como está na nota)</span><textarea name="descricaoServico" rows="2" placeholder="ex.: Prestação de serviço de transporte escolar, rota 06…">${esc(d.descricaoServico || '')}</textarea>
      <small class="dica">Usada para conferir se o código de tributação e a natureza do IRRF combinam com o serviço.</small></label>` : ''}
    <label class="campo"><span>Natureza do bem ou serviço — IRRF (Anexo I da IN RFB 1.234/2012) *</span><select name="natureza">
      ${grupos.map(g => `<optgroup label="${esc(g)}">${NATUREZAS.filter(n => n.grupo === g).map(n => `<option value="${n.id}" ${sel(n.id, s.natureza)}>${esc(n.texto)} — IR ${pctTxt(n.ir)}</option>`).join('')}</optgroup>`).join('')}
    </select><small class="dica">${s.naturezaAuto ? (ehCooperativa ? 'Sugerida porque o CNPJ é de cooperativa (natureza jurídica 214-3) — confirme.' : trib?.valido ? `Sugerida pelo código ${esc(trib.codigo)} — confirme.` : 'Sugerida pela nota — confirme.') : 'Escolhida pela Contabilidade.'}${trib?.dica && !ehCooperativa ? ' ' + esc(trib.dica) : ''}</small></label>
    ${s.natureza === 'cooperativas' ? `<div class="fiscal-bloco fiscal-bloco-coop">
      <div class="fiscal-bloco-titulo">Cooperativa — base do IR (1,5%)${ehCooperativa ? ' · CNPJ de cooperativa' : ''}</div>
      <div class="grade-2">
        <label class="campo"><span>Serviços pessoais dos cooperados (R$)</span><input type="number" step="0.01" min="0" name="coopServicosPessoais" value="${esc(numCampo(d.coopServicosPessoais))}" placeholder="se a nota discriminar">
          <small class="dica">Parcela da nota que remunera o trabalho dos cooperados. Em branco = valor total.</small></label>
        <label class="campo"><span>Tipo de serviço da cooperativa</span><select name="coopTransporte">
          ${[['passageiros', 'Transporte de passageiros — base 60%'], ['cargas', 'Transporte de cargas — base 10%'], ['', 'Outros serviços — base 100%']].map(([v, n]) => `<option value="${v}" ${sel(v, d.coopTransporte || '')}>${n}</option>`).join('')}</select>
          <small class="dica">Lei 7.713/1988, art. 9º; ADN Cosit 1/1993.</small></label>
      </div>
    </div>` : ''}
    <div class="fiscal-bloco">
      <div class="fiscal-bloco-titulo"><span class="fiscal-num">3</span> Valores e retenções impressos na nota</div>
      <div class="grade-2">
        <label class="campo"><span>Regime / Simples Nacional na nota *</span><select name="regimeNota">
          ${[['', 'Não informado'], ['normal', 'Não optante / regime normal'], ['simples', 'Optante — ME/EPP do Simples'], ['mei', 'MEI']].map(([v, n]) => `<option value="${v}" ${sel(v, d.regimeNota || '')}>${n}</option>`).join('')}</select>
          ${d.regimeNotaTexto ? `<small class="dica">${esc(d.regimeNotaTexto)}</small>` : ''}</label>
        ${ehServico || !d.documento ? `<label class="campo"><span>Retenção do ISSQN na nota *</span><select name="issRetidoNota">
          ${[['', 'Não informado'], ['sim', 'Retido pelo tomador'], ['nao', 'Não retido']].map(([v, n]) => `<option value="${v}" ${(d.issRetidoNota === true && v === 'sim') || (d.issRetidoNota === false && v === 'nao') || (d.issRetidoNota == null && v === '') ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : '<span></span>'}
      </div>
      ${ehServico || !d.documento ? `<label class="campo"><span>Município de incidência do ISSQN (na nota) *</span><select name="incidencia">
        ${[['', 'Não informado — conferir no documento'], [MUNICIPIO.ibge, `${MUNICIPIO.nome}/${MUNICIPIO.uf}`],
          ...(d.municipioEmissor && d.municipioEmissor !== MUNICIPIO.ibge ? [[String(d.municipioEmissor), nomeMunicipio(d.municipioEmissor) + ' (onde a nota foi emitida)']] : []),
          ['outro', 'Outro município']].map(([v, n]) => `<option value="${esc(v)}" ${sel(v, d.incidencia ? (d.incidencia === MUNICIPIO.ibge || d.incidencia === String(d.municipioEmissor) ? String(d.incidencia) : 'outro') : '')}>${esc(n)}</option>`).join('')}</select>
        <small class="dica">No DANFSe: "Município de incidência do ISSQN". A nota pode ser emitida no município do prestador, mas a incidência deve ser onde o serviço é prestado.</small></label>` : ''}
      <div class="grade-3">
        ${ehServico || !d.documento ? `<label class="campo"><span>Alíquota do ISS (%)</span><input type="number" step="0.01" min="0" name="issAliquota" value="${esc(numCampo(d.issAliquota))}" placeholder="5"></label>
        <label class="campo"><span>Valor do ISS (R$)</span><input type="number" step="0.01" min="0" name="issValor" value="${esc(numCampo(d.issValor))}"></label>` : '<span></span><span></span>'}
        <label class="campo"><span>IRRF destacado (R$)</span><input type="number" step="0.01" min="0" name="irrfDestacado" value="${esc(numCampo(d.irrfDestacado))}" placeholder="0,00"></label>
      </div>
      <div class="grade-2">
        <label class="campo"><span>Total das retenções na nota (R$)</span><input type="number" step="0.01" min="0" name="totalRetencoesNota" value="${esc(numCampo(d.totalRetencoesNota))}" placeholder="opcional"></label>
        <label class="campo"><span>Valor líquido da nota (R$)</span><input type="number" step="0.01" min="0" name="liquidoNota" value="${esc(numCampo(d.liquidoNota))}" placeholder="para comparar"></label>
      </div>
      <details ${ibs.vCBS != null || ibs.vIBS != null || ibs.cst ? 'open' : ''}><summary>CBS e IBS na nota</summary>
        <div class="grade-3 mt">
          <label class="campo"><span>CST / cClassTrib</span><input name="cstClass" value="${esc(ibs.cst ? ibs.cst + (ibs.classTrib ? ' / ' + ibs.classTrib : '') : '')}" placeholder="ex.: 000 / 000001"></label>
          <label class="campo"><span>Base após exclusões (R$)</span><input type="number" step="0.01" min="0" name="baseCbs" value="${esc(numCampo(ibs.base))}"></label>
          <span></span>
          <label class="campo"><span>CBS (R$)</span><input type="number" step="0.01" min="0" name="vCBS" value="${esc(numCampo(ibs.vCBS))}"></label>
          <label class="campo"><span>IBS (R$)</span><input type="number" step="0.01" min="0" name="vIBS" value="${esc(numCampo(ibs.vIBS))}"></label>
        </div>
        ${ibs.pCBS != null || ibs.cst ? `<p class="dica">CST ${esc(ibs.cst || '—')}${ibs.classTrib ? ' · cClassTrib ' + esc(ibs.classTrib) : ''} · CBS ${pctTxt(ibs.pCBS)} · IBS UF ${pctTxt(ibs.pIBSUF)} · IBS Mun ${pctTxt(ibs.pIBSMun)}</p>` : ''}
      </details>
    </div>
    <div class="fiscal-sec mt"><span>4</span> Simples Nacional</div>
    <label class="campo"><span>Situação na data da nota (Receita Federal)</span><select name="simplesManual">
      ${[['', cad ? 'Conforme a consulta à Receita' : 'Consultar automaticamente'], ['sim', 'Optante (ME/EPP) — conferido no Portal'], ['mei', 'MEI — conferido no Portal'], ['nao', 'Não optante — conferido no Portal']].map(([v, n]) => `<option value="${v}" ${sel(v, s.simplesManual)}>${n}</option>`).join('')}</select>
      <small class="dica">${linkPortal('Abrir a Consulta Optantes do Simples Nacional')} — confirme e anexe a consulta ao processo.</small></label>`;
  const ler = e => {
    const v = Object.fromEntries(new FormData(f));
    const n = x => (x === '' || x == null ? null : Number(x));
    const cnpjNovo = limparCnpj(v.cnpj);
    const mudouCnpj = cnpjNovo !== limparCnpj(s.doc.cnpj);
    const mudouCodigo = 'codigoServico' in v && v.codigoServico.replace(/\D/g, '') !== String(s.doc.codigoServico || '').replace(/\D/g, '');
    if (e?.target?.name === 'natureza' && v.natureza !== s.natureza) s.naturezaAuto = false;
    if (mudouCodigo || e?.target?.name === 'documento') s.naturezaAuto = e?.target?.name === 'natureza' ? false : true;
    s.natureza = v.natureza;
    s.simplesManual = v.simplesManual;
    const ibsAnt = s.doc.ibscbs || {};
    const vCBS = n(v.vCBS), vIBS = n(v.vIBS);
    const [cstV, classV] = String(v.cstClass || '').split('/').map(x => x.replace(/\D/g, ''));
    Object.assign(s.doc, {
      cnpj: cnpjNovo, documento: v.documento, numero: v.numero, emissao: v.emissao, valor: n(v.valor),
      codigoServico: 'codigoServico' in v ? v.codigoServico : s.doc.codigoServico,
      descricaoServico: 'descricaoServico' in v ? v.descricaoServico : s.doc.descricaoServico,
      localPrestacao: 'localPrestacao' in v ? (v.localPrestacao === 'outro' ? (s.doc.localPrestacao && s.doc.localPrestacao !== MUNICIPIO.ibge ? s.doc.localPrestacao : 'outro') : MUNICIPIO.ibge) : s.doc.localPrestacao,
      regimeNota: v.regimeNota, irrfDestacado: n(v.irrfDestacado), issAliquota: n(v.issAliquota), issValor: n(v.issValor),
      issRetidoNota: v.issRetidoNota === 'sim' ? true : v.issRetidoNota === 'nao' ? false : null,
      incidencia: 'incidencia' in v ? (v.incidencia === 'outro' ? (s.doc.incidencia && s.doc.incidencia !== MUNICIPIO.ibge && s.doc.incidencia !== String(s.doc.municipioEmissor) ? s.doc.incidencia : 'outro') : v.incidencia) : s.doc.incidencia,
      coopServicosPessoais: 'coopServicosPessoais' in v ? n(v.coopServicosPessoais) : s.doc.coopServicosPessoais,
      coopTransporte: 'coopTransporte' in v ? v.coopTransporte : s.doc.coopTransporte,
      modelo: ({ 'NF-e': '55', 'NFC-e': '65', 'CT-e': '57', 'CT-e OS': '67', 'NFS-e Nacional': 'nfse', 'NFS-e': 'nfse', 'NF3-e (energia elétrica)': '66', 'NFCom (telecomunicação)': '62', 'BP-e (passagem)': '63' })[v.documento] || s.doc.modelo || '',
      servico: s.doc.origem === 'xml' ? s.doc.servico : (/NFS/.test(v.documento) || !!descreverTributacao(v.codigoServico)?.valido),
      totalRetencoesNota: n(v.totalRetencoesNota), liquidoNota: n(v.liquidoNota),
      ibscbs: vCBS != null || vIBS != null || cstV || n(v.baseCbs) != null || ibsAnt.pCBS != null ? { ...ibsAnt, vCBS, vIBS, cst: cstV || '', classTrib: classV || '', base: n(v.baseCbs) } : null
    });
    if (mudouCodigo) s.doc.coopTransporte = null; // recalcula o tipo da cooperativa pelo novo código
    // campos que mudam o próprio formulário (código, documento, natureza sugerida) → redesenha mantendo o foco
    const redesenhar = mudouCodigo || ['documento', 'natureza'].includes(e?.target?.name) || (e?.target?.name === 'descricaoServico' && s.naturezaAuto);
    if (mudouCnpj) consultar(el); else { if (redesenhar) { const nome = e?.target?.name; desenharForm(el); if (nome) f.querySelector(`[name="${nome}"]`)?.focus(); } recalcular(el); }
  };
  f.onchange = ler;
  f.onsubmit = ev => { ev.preventDefault(); ler(ev); };
}

function recalcular(el) {
  const temDados = s.doc.cnpj || s.doc.valor;
  if (s.doc.municipioEmissor) s.doc.municipioEmissorNome = nomeMunicipio(s.doc.municipioEmissor);
  s.doc.incidenciaNome = s.doc.incidencia ? nomeMunicipio(s.doc.incidencia) : '';
  s.resultado = temDados ? conferir({ doc: s.doc, cadastro: s.consulta?.cadastro || null, naturezaId: s.natureza, simplesManual: s.simplesManual, hoje: hojeISO(), chave: s.leitura?.tipo === 'chave' ? s.leitura : null, parametros: parametrosFiscais }) : null;
  s.auditoria = s.resultado ? auditoriaNota({
    doc:s.doc,cadastro:s.consulta?.cadastro||null,resultado:s.resultado,contexto:s.confirmacoes,
    catalogo:catalogoFiscal,aprovacoes:parametrosFiscais?.legislacaoAprovada||{},hoje:hojeISO()
  }) : null;
  if (s.resultado && s.doc.valor) {
    const id = idNota();
    if (id) {
      const ant = historico().find(x => x.id === id);
      s.repetida = ant && ant.conf !== s.conf ? ant : (s.repetida && s.repetida.id === id ? s.repetida : null);
      guardarHistorico({ id, conf: s.conf, quando: Date.now(), por: estado.sessao?.nome || '', fornecedor: s.consulta?.cadastro?.nome || s.doc.nome || '', valor: s.doc.valor, numero: s.doc.numero || '', situacao: s.resultado.situacao });
    }
  }
  const bl = $('#fis-limpar', el); if (bl) bl.disabled = !temConsulta();
  const etapas = el.querySelectorAll('.fiscal-etapas li');
  if (etapas.length === 3) {
    const passo = s.resultado && s.doc.valor ? 3 : (s.codigo || s.doc.cnpj) ? 2 : 1;
    etapas.forEach((li, i) => { li.className = i + 1 < passo ? 'feita' : i + 1 === passo ? 'atual' : ''; });
  }
  ultimaConferencia.r = s.resultado; ultimaConferencia.s = structuredClone({ doc: s.doc, consulta: s.consulta, leitura: s.leitura }); ultimaConferencia.auditoria = s.auditoria ? structuredClone(s.auditoria) : null; ultimaConferencia.quando = new Date();
  desenharResultado(el);
}

// Boletim público atualizado diariamente por GitHub Actions — não altera cálculos.
const URL_LEIS_ATUALIZADAS = 'https://raw.githubusercontent.com/alvesjardimitalo-oss/sisdifi/main/assets/data/legislacao-fiscal.json';
async function carregarLegislacao(el, forcar=false) {
  if(carregandoLegislacao)return carregandoLegislacao;
  if(!forcar && catalogoFiscal && Date.now()-ultimaLeituraLegislacao<1800000)return;
  carregandoLegislacao=(async()=>{
    try {
      const resposta=await fetch(URL_LEIS_ATUALIZADAS+'?consulta='+Date.now(),{cache:'no-store'});
      if(!resposta.ok)throw Error('Catálogo indisponível (HTTP '+resposta.status+')');
      const d=await resposta.json();
      if(d.schema!==1 || d.codigoIBGE!=='3126901' || !Array.isArray(d.fontes))throw Error('Catálogo de legislação inválido.');
      catalogoFiscal=d;ultimaLeituraLegislacao=Date.now();erroCatalogoFiscal='';
    } catch(e) {
      catalogoFiscal=null;erroCatalogoFiscal=e.message||'Falha de atualização';
    } finally {
      carregandoLegislacao=null;
      if(s.resultado && el?.isConnected)recalcular(el);
    }
  })();
  return carregandoLegislacao;
}
const CHECKS_FISCAIS=[
 ['originalConferido','Conferi o XML/PDF integral ou consultei o documento no portal do emissor'],
 ['tomadorConfirmado','Confirmei o tomador: Prefeitura Municipal de Frei Inocêncio/MG e seu CNPJ'],
 ['autenticidadeConfirmada','Verifiquei a autorização e que a nota não está cancelada/substituída'],
 ['naturezaConfirmada','Conferi a natureza tributária/serviço usada na retenção do IRRF'],
 ['regimeConfirmado','Conferi o Simples/MEI na data da emissão, quando necessário'],
 ['localConfirmado','Confirmei o local efetivo da prestação e a incidência de ISS'],
 ['legislacaoIssConfirmada','Validei alíquota e base de ISS na lei municipal com Tributos'],
 ['baseEspecialAnalisada','Examinei deduções legais específicas da base do ISS e comprovantes'],
 ['inssAnalisado','Analisei possível retenção do INSS (não calculada automaticamente)'],
 ['vinculoEmpenho','Conferi empenho, contrato/ordem de fornecimento e valores'],
 ['atestoConfirmado','Conferi o atesto de recebimento dos bens ou da execução do serviço']
];
function blocoAuditoriaFiscal(el) {
  const a=s.auditoria;if(!a)return '';
  const relevantes=new Set(a.pendencias.map(q=>q.id));
  const perfil=estado.sessao?.perfil;
  const fontes=a.monitor.fontes;
  const estadoFonte={monitorado:'Monitorada',mudanca_detectada:'Alteração detectada',erro:'Fonte indisponível',revisao_registrada:'Alteração revisada',nao_verificado:'Aguardando coleta'};
  let marcacoes='';
  for(const [id,label] of CHECKS_FISCAIS){
    const cond={localConfirmado:'local',legislacaoIssConfirmada:'legislacao_iss',baseEspecialAnalisada:'base_especial',inssAnalisado:'inss'};
    if(cond[id] && !relevantes.has(cond[id]) && !s.confirmacoes[id]) continue;
    marcacoes+='<label style="display:flex;gap:9px;align-items:flex-start;margin:8px 0"><input type="checkbox" data-fis-confirma="'+id+'" '+(s.confirmacoes[id]?'checked':'')+'><span>'+esc(label)+'</span></label>';
  }
  const lembretes=a.pendencias.map(q=>'<li><strong>'+esc(q.titulo)+'</strong>: '+esc(q.pergunta)+(q.base?' <small>('+esc(q.base)+')</small>':'')+'</li>').join('');
  const impedimentos=a.impedimentos.map(q=>'<li><strong>'+esc(q.titulo)+'</strong>: '+esc(q.pergunta)+'</li>').join('');
  const fontesHtml=fontes.length?fontes.map(f=>{
    const aprovar=perfil==='admin' && f.estado==='mudanca_detectada' && f.hashObservado;
    return '<li style="margin:8px 0"><strong>'+esc(f.titulo)+'</strong> — '+esc(estadoFonte[f.estado]||f.estado)+
      ' · <a href="'+esc(f.url)+'" target="_blank" rel="noopener noreferrer">Norma oficial</a>'+
      (f.ultimaConsulta?' · <small>Última coleta: '+esc(new Date(f.ultimaConsulta).toLocaleDateString('pt-BR'))+'</small>':'')+
      (aprovar?'<button type="button" class="btn btn-sec" data-fis-aprovar-lei="'+esc(f.id)+'">Registrar revisão</button>':'')+'</li>';
  }).join(''):'<li>Boletim oficial ainda não carregado. Conferência de vigência obrigatória.</li>';
  const situacaoTxt={bloqueada:'NÃO LIQUIDAR — divergência identificada',pendente:'AGUARDAR CONFERÊNCIAS E DOCUMENTOS',conferida_para_revisao:'PRÉ-AUDITORIA CONCLUÍDA — decisão humana obrigatória'}[a.situacao];
  return '<section class="cartao" style="border-left:4px solid '+(a.situacao==='bloqueada'?'#b84040':a.situacao==='pendente'?'#c39131':'#2c885b')+'">'+
    '<h3>Auditoria da Prefeitura de Frei Inocêncio</h3><p><strong>'+esc(situacaoTxt)+'</strong></p>'+
    '<p class="dica">'+esc(a.resumo)+' O sistema não acessa nem bloqueia a liquidação no software contábil externo.</p>'+
    (s.doc.tomadorNome||s.doc.tomadorCnpj?'<p><strong>Tomador lido da nota:</strong> '+esc(s.doc.tomadorNome||'Não identificado')+
      (s.doc.tomadorCnpj?' · CNPJ '+esc(formatarCnpj(s.doc.tomadorCnpj)):'')+'</p>':'')+
    (impedimentos?'<h4>Inconsistências impeditivas</h4><ul class="fiscal-problemas">'+impedimentos+'</ul>':'')+
    '<details open><summary><strong>Confirmações do processo administrativo</strong></summary><div style="padding:10px 0">'+marcacoes+'</div></details>'+
    (lembretes?'<details open><summary><strong>Perguntas e informações pendentes ('+a.pendencias.length+')</strong></summary><ul class="fiscal-problemas">'+lembretes+'</ul></details>':'')+
    '<details><summary><strong>Atualizador de legislação · '+esc(VERSAO_POLITICA_FISCAL)+'</strong> '+(a.monitor.pendentes.length?' · ALTERAÇÕES PARA REVISÃO':'')+'</summary>'+
      '<p class="dica">As fontes oficiais são consultadas diariamente. Mudanças no texto geram revisão; nunca alteram automaticamente ISS, IRRF ou outros parâmetros da liquidação.</p>'+
      '<p><strong>Última varredura:</strong> '+esc(a.monitor.ultimo||'Ainda não realizada')+(erroCatalogoFiscal?' · '+esc(erroCatalogoFiscal):'')+
      ' · <strong>'+a.monitor.pendentes.length+'</strong> alteração(ões) em análise</p><ul>'+fontesHtml+'</ul>'+
      '<button class="btn btn-sec" type="button" data-fis-atualizar-lei>Recarregar boletim legislativo</button></details></section>';
}
async function aprovarLegislacao(el,id) {
  if(estado.sessao?.perfil!=='admin')return toast('A aprovação é exclusiva do administrador.','erro');
  const fonte=catalogoFiscal?.fontes?.find(f=>f.id===id);
  if(!fonte || fonte.estado!=='mudanca_detectada' || !fonte.hashObservado)return;
  const observacao=window.prompt('Depois de ler a fonte oficial, registre o impacto tributário e a providência (mínimo 20 caracteres). Não significa aplicar uma alíquota automaticamente.');
  if(observacao==null)return;
  if(observacao.trim().length<20)return toast('Informe a conclusão da análise e a providência (mínimo 20 caracteres).','erro');
  if(!window.confirm('Confirma que revisou a norma e registrou a consequência para o SISDIFI? A revisão ficará no registro de auditoria.'))return;
  try {
    const db=await import('../db.js');
    const aprovacao={hash:fonte.hashObservado,quando:new Date().toISOString(),por:estado.sessao.nome||estado.sessao.uid,observacao:observacao.trim(),fonte:fonte.url};
    await db.salvar('config','fiscal',{legislacaoAprovada:{[id]:aprovacao}});
    await db.registrarLog('fiscal.legislacao.revisada',{fonte:id,hash:fonte.hashObservado,observacao:observacao.trim()});
    parametrosFiscais={...(parametrosFiscais||{}),legislacaoAprovada:{...(parametrosFiscais?.legislacaoAprovada||{}),[id]:aprovacao}};
    toast('Revisão legislativa registrada. Nenhuma alíquota foi alterada.');
    recalcular(el);
  } catch(e){toast('Não foi possível registrar a análise: '+(e.message||e),'erro');}
}


// ---------------- Resultado ----------------
const SIT = {
  ok: ['fiscal-ok', 'Cálculo tributário sem divergências detectadas — confira a auditoria documental'],
  alerta: ['fiscal-alerta', 'Atenção — confira os avisos antes de liquidar'],
  erro: ['fiscal-erro', 'Há erros na nota — resolva antes de liquidar']
};
const NIVEL = { erro: ['Erro', 'selo-cancelada'], alerta: ['Atenção', 'selo-pendente'], info: ['Orientação', 'selo-info'] };

function desenharResultado(el) {
  const box = $('#fis-resultado', el);
  if (!box) return;
  const cad = s.consulta?.cadastro;
  if (s.consultando) { box.innerHTML = '<div class="cartao"><div class="carregando"><div class="spinner"></div><p>Consultando o CNPJ na Receita Federal…</p></div></div>'; return; }
  const r = s.resultado;
  if (r && !s.doc.valor) {
    box.innerHTML = `<div class="cartao">${blocoFornecedor(cad)}
      <div class="fiscal-cartoes"><div class="fiscal-item"><span>Simples Nacional na data</span><strong>${r.simples == null ? 'Não confirmado' : r.mei ? 'MEI' : r.simples ? 'Optante' : 'Não optante'}</strong><small>${r.simples == null ? 'confira no Portal' : esc(r.fonteSimples)}</small></div>
      <div class="fiscal-item"><span>IRRF</span><strong>${r.simples ? 'Não reter' : 'Reter ' + pctTxt(r.natureza.ir)}</strong><small>${esc(r.simples ? r.ir.motivo : r.natureza.texto)}</small></div></div>
      <p class="alerta alerta-info mt">Informe o <strong>valor bruto</strong>, confira a <strong>data de emissão</strong> e o <strong>código de tributação</strong> para calcular as retenções e conferir a nota.</p></div>`;
    return;
  }
  if (!r) { box.innerHTML = `<div class="cartao"><h3>Como usar</h3><ol class="passos">
    <li>Leia o código de barras ou o QR Code da nota (leitor USB ou câmera), ou digite a chave ou o CNPJ.</li>
    <li>Preencha o valor, o código de tributação e o que está impresso na nota (regime, ISS retido, IRRF).</li>
    <li>Veja aqui o que reter, o valor líquido e cada erro da nota com a solução.</li>
    <li>Imprima a ficha de conferência e junte ao processo de liquidação.</li></ol></div>`; return; }
  const a=s.auditoria;
  const [cls, txt] = a?.situacao==='bloqueada'?['fiscal-erro','NÃO LIQUIDAR — divergências materiais na nota']:
    a?.situacao==='pendente'?['fiscal-alerta','NÃO LIQUIDAR AINDA — informações ou validações pendentes']:
    a?.situacao==='conferida_para_revisao'?['fiscal-ok','Pré-auditoria concluída — encaminhar para conferência e liquidação pelo responsável']:SIT[r.situacao];
  const qtd = n => r.problemas.filter(p => p.nivel === n).length;
  box.innerHTML = `
    <div class="cartao fiscal-resumo ${cls}">
      <div class="fiscal-resumo-topo"><strong>${esc(txt)}</strong>
        <span>${qtd('erro')} erro(s) · ${qtd('alerta')} aviso(s) · ${qtd('info')} orientação(ões)</span></div>
      <div class="fiscal-kpis">
        <div><span>Valor bruto</span><strong>${moeda(r.valor)}</strong></div>
        <div><span>Retenções (IRRF + ISS)</span><strong>${moeda(r.retencoes)}</strong></div>
        <div class="fiscal-kpi-destaque"><span>Líquido a pagar</span><strong>${moeda(r.liquido)}</strong></div>
      </div>
      <div class="fiscal-acoes">
        <a class="btn" href="#/imprimir/fiscal">🖨 Ficha de conferência</a>
        <button type="button" class="btn btn-sec" data-mensagem>✉ Mensagem ao fornecedor</button>
        ${linkPortal('Portal do Simples', 'btn btn-sec')}
      </div>
    </div>
    ${blocoAuditoriaFiscal(el)}
    ${s.repetida ? `<div class="alerta">Esta nota já foi conferida neste computador em ${esc(new Date(s.repetida.quando).toLocaleString('pt-BR'))}${s.repetida.por ? ' por ' + esc(s.repetida.por) : ''}. Confira se não é pagamento em duplicidade.</div>` : ''}
    <div class="cartao">
      <h3><span class="fiscal-num">1</span> Erros e soluções</h3>
      ${r.problemas.length ? `<ul class="fiscal-problemas">${r.problemas.map(p => `<li class="fiscal-${p.nivel}">
        <span class="selo ${NIVEL[p.nivel][1]}">${NIVEL[p.nivel][0]}</span> <strong>${esc(p.titulo)}</strong>${p.detalhe ? ` <span class="muted">(${esc(p.detalhe)})</span>` : ''}
        <p><b>Como resolver:</b> ${esc(p.solucao)}</p></li>`).join('')}</ul>` : '<p class="ok-txt">Nenhuma divergência encontrada.</p>'}
    </div>
    <div class="cartao">
      <h3><span class="fiscal-num">2</span> Para a liquidação</h3>
      ${r.temDadosNota ? `<table class="tabela tabela-peq fiscal-liq fiscal-comp"><thead><tr><th></th><th class="num">Na nota</th><th class="num">Conferido</th><th class="num">Diferença</th></tr></thead><tbody>
        <tr><td>Valor bruto</td><td class="num">${moeda(r.valor)}</td><td class="num">${moeda(r.valor)}</td><td></td></tr>
        ${r.comparativo.map(l => `<tr class="${l.total ? 'fiscal-total' : ''} ${Math.abs(l.diferenca) >= 0.01 ? 'fiscal-difere' : ''}"><td>${l.total ? '' : '(−) '}${esc(l.item)}${l.notaAliq != null || l.conferidoAliq != null ? ` <span class="muted">${l.notaAliq != null ? pctTxt(l.notaAliq) : '—'} → ${l.conferidoAliq != null ? pctTxt(l.conferidoAliq) : '—'}</span>` : ''}</td>
          <td class="num">${moeda(l.nota)}</td><td class="num"><strong>${moeda(l.conferido)}</strong></td><td class="num">${Math.abs(l.diferenca) >= 0.01 ? (l.diferenca > 0 ? '+' : '−') + moeda(Math.abs(l.diferenca)) : '✓'}</td></tr>`).join('')}
      </tbody></table>
      <p class="dica">Valor líquido <b>estimado</b>, sujeito à conferência documental, INSS e demais hipóteses legais. Não liquidar enquanto houver pendências. ${r.ir.reter ? ` IRRF ${pctTxt(r.ir.aliquota)} — ${esc(r.natureza.texto)}.` : ''}</p>`
      : `<table class="tabela tabela-peq fiscal-liq"><tbody>
        <tr><td>Valor bruto da nota</td><td class="num">${moeda(r.valor)}</td></tr>
        <tr><td>(−) IRRF ${r.ir.reter ? `${pctTxt(r.ir.aliquota)} · ${esc(r.natureza.texto)}` : ''}</td><td class="num">${moeda(r.ir.reter ? r.ir.valor : 0)}</td></tr>
        <tr><td>(−) ISSQN ${r.iss.reter && r.iss.valor ? pctTxt(r.iss.aliquota) : ''}</td><td class="num">${moeda(r.iss.reter ? r.iss.valor : 0)}</td></tr>
        <tr class="fiscal-total"><td>Valor líquido a pagar</td><td class="num">${moeda(r.liquido)}</td></tr>
      </tbody></table>`}
      ${r.cbsibs.esperado && r.cbsibs.parametros?.teste ? `<p class="dica">CBS (${moeda(r.cbsibs.esperado.vCBS)}) e IBS (${moeda(r.cbsibs.esperado.vIBS)}) de 2026 são informativos: não entram no total nem são retidos.</p>` : ''}
    </div>
    <div class="cartao">
${blocoFornecedor(cad, '<span class="fiscal-num">3</span> ')}
      <div class="fiscal-cartoes">
        <div class="fiscal-item"><span>Simples Nacional</span><strong>${r.simples == null ? 'Não confirmado' : r.mei ? 'MEI' : r.simples ? 'Optante' : 'Não optante'}</strong>
          <small>${r.simples == null ? 'confira no Portal' : esc(r.fonteSimples)}${cad?.simplesInicio && r.simples ? ' · desde ' + esc(dataBR(cad.simplesInicio)) : ''}${cad?.simplesFim ? ' · excluído em ' + esc(dataBR(cad.simplesFim)) : ''}</small></div>
        <div class="fiscal-item"><span>IRRF</span><strong>${r.ir.reter ? 'Reter ' + moeda(r.ir.valor) : 'Não reter'}</strong><small>${esc(r.ir.motivo)}</small></div>
        <div class="fiscal-item"><span>ISSQN</span><strong>${!r.iss.aplica ? 'Não se aplica' : r.iss.reter && r.iss.valor ? 'Reter ' + moeda(r.iss.valor) : 'Não reter'}</strong><small>${esc(r.iss.motivo || (r.natureza.servico ? '' : 'Fornecimento de bens'))}</small></div>
        <div class="fiscal-item"><span>CBS / IBS</span><strong>${r.cbsibs.esperado ? `${pctTxt(r.cbsibs.esperado.cbs)} / ${pctTxt(r.cbsibs.esperado.ibs)}` : 'Não se aplica'}</strong><small>${esc(r.cbsibs.motivo)}</small></div>
      </div>
    </div>
    ${r.verificacao?.linhas?.length ? `<div class="cartao">
      <h3><span class="fiscal-num">4</span> Natureza do serviço</h3>
      <ul class="fiscal-verif">${r.verificacao.linhas.map(l => `<li class="${l.ok === true ? 'v-ok' : l.ok === false ? 'v-erro' : 'v-info'}"><span aria-hidden="true">${l.ok === true ? '✓' : l.ok === false ? '✕' : '•'}</span>
        <div><strong>${esc(l.titulo)}</strong><small>${esc(l.detalhe)}</small></div></li>`).join('')}</ul>
    </div>` : ''}
    <div class="fiscal-proxima"><button type="button" class="btn btn-sec fiscal-limpar" data-limpar>Limpar consulta e conferir outra nota</button></div>`;
  box.querySelectorAll('[data-fis-confirma]').forEach(cb=>cb.onchange=()=>{
    s.confirmacoes[cb.dataset.fisConfirma]=cb.checked;
    recalcular(el);
  });
  box.querySelector('[data-fis-atualizar-lei]')?.addEventListener('click',()=>carregarLegislacao(el,true));
  box.querySelectorAll('[data-fis-aprovar-lei]').forEach(b=>b.onclick=()=>aprovarLegislacao(el,b.dataset.fisAprovarLei));
  box.querySelector('[data-limpar]').onclick = () => limparConsulta(el);
  box.querySelector('[data-mensagem]').onclick = () => abrirMensagem();
}


function blocoFornecedor(cad, prefixo = '') {
  return `<h3>${prefixo}Fornecedor e tributos</h3>
      ${cad ? `<p><strong>${esc(cad.nome)}</strong>${cad.fantasia ? ` <span class="muted">(${esc(cad.fantasia)})</span>` : ''}<br>
        CNPJ ${esc(formatarCnpj(cad.cnpj))} · <span class="selo ${cad.situacao === 'ATIVA' ? 'selo-emitida' : 'selo-cancelada'}">${esc(cad.situacao || '—')}</span><br>
        <span class="muted">${esc(cad.naturezaTexto || '')}${cad.cnaeTexto ? ' · CNAE ' + esc(String(cad.cnae).replace(/\D/g, '').padStart(7, '0').replace(/^(\d{4})(\d)(\d{2})$/, '$1-$2/$3')) + ' ' + esc(cad.cnaeTexto) : ''}${cad.municipio ? ' · ' + esc(cad.municipio) + '/' + esc(cad.uf) : ''}</span></p>`
      : `<p class="muted">${s.doc.cnpj ? 'CNPJ ' + esc(formatarCnpj(s.doc.cnpj)) + ' — ' : ''}${s.consulta?.erros?.length ? 'consulta indisponível (' + esc(s.consulta.erros.join('; ')) + ')' : 'informe o CNPJ para consultar'}.</p>`}`;
}

// ---------------- Câmera ----------------
async function abrirCamera(el) {
  if (!navigator.mediaDevices?.getUserMedia) { toast('Este navegador não permite usar a câmera. Use o leitor USB ou digite a chave.', 'erro'); return; }
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `<div class="modal fiscal-camera" role="dialog" aria-label="Ler código com a câmera"><div class="modal-topo"><h2>Ler com a câmera</h2><button class="btn-icone" type="button" data-fechar aria-label="Fechar">✕</button></div>
    <div class="modal-corpo"><video playsinline muted></video><p class="dica">Aponte para o código de barras do DANFE (ou o QR Code), na horizontal e bem iluminado.</p></div></div>`;
  document.body.appendChild(fundo);
  const video = fundo.querySelector('video');
  let parar = () => {};
  let fechado = false;
  const fechar = () => { if (fechado) return; fechado = true; try { parar(); } catch { /* ignora */ } fundo.remove(); };
  fundo.querySelector('[data-fechar]').onclick = fechar;
  fundo.onclick = e => { if (e.target === fundo) fechar(); };
  const achou = texto => { fechar(); const inp = $('#fis-codigo', el); if (inp) inp.value = texto; processarCodigo(el, texto); };
  try {
    if ('BarcodeDetector' in window) {
      const formatos = (await window.BarcodeDetector.getSupportedFormats?.()) || [];
      const usar = ['code_128', 'qr_code', 'itf', 'pdf417', 'data_matrix'].filter(f => !formatos.length || formatos.includes(f));
      const det = new window.BarcodeDetector({ formats: usar });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } });
      video.srcObject = stream; await video.play();
      parar = () => stream.getTracks().forEach(t => t.stop());
      const loop = async () => {
        if (fechado) return;
        try { const c = await det.detect(video); const bom = c.find(x => lerCodigo(x.rawValue).tipo === 'chave' || lerCodigo(x.rawValue).tipo === 'cnpj'); if (bom) return achou(bom.rawValue); } catch { /* quadro ruim */ }
        setTimeout(loop, 180);
      };
      loop();
    } else {
      const { BrowserMultiFormatReader } = await import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm');
      const leitor = new BrowserMultiFormatReader();
      const ctrl = await leitor.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, res => {
        if (res && !fechado) { const t = res.getText(); const tp = lerCodigo(t).tipo; if (tp === 'chave' || tp === 'cnpj') achou(t); }
      });
      parar = () => ctrl.stop();
      if (fechado) parar();
    }
  } catch (e) {
    fechar();
    toast(e?.name === 'NotAllowedError' ? 'Permissão da câmera negada.' : 'Não foi possível abrir a câmera. Use o leitor USB ou digite a chave.', 'erro');
  }
}

// ---------------- Ficha impressa ----------------
export function telaImprimirFiscal(el) {
  const r = ultimaConferencia.r, x = ultimaConferencia.s;
  if (!r || !x) { el.innerHTML = '<div class="vazio"><h2>Nenhuma conferência para imprimir</h2><p><a href="#/fiscal">Abrir a conferência fiscal</a></p></div>'; return { titulo: 'Ficha de conferência' }; }
  const cad = x.consulta?.cadastro, d = x.doc;
  const linha = (a, b) => `<tr><td class="r" style="width:32%">${esc(a)}</td><td>${b}</td></tr>`;
  el.innerHTML = `<div class="barra-impressao"><button class="btn" onclick="window.print()">🖨 Imprimir / salvar PDF</button><a class="btn btn-sec" href="#/fiscal">Voltar</a></div>
    <div class="documentos"><div class="folha">
      <div class="doc-cab"><img src="assets/img/brasao.png" alt="Brasão" class="doc-brasao"><div class="doc-titulos"><div class="doc-orgao">${esc(estado.config.orgao)}</div>
        <div class="doc-titulo">Ficha de conferência fiscal para liquidação</div><div class="doc-sub">${esc({ ok: 'Nota conferida', alerta: 'Nota com avisos', erro: 'Nota com erros' }[r.situacao])}</div></div></div>
      <div class="doc-linha"></div>
      <div class="doc-secao"><div class="doc-secao-titulo">1 - Nota fiscal</div><table class="doc-tab">
        ${linha('Documento', esc([d.documento, d.numero ? 'nº ' + d.numero : '', d.serie ? 'série ' + d.serie : ''].filter(Boolean).join(' ')))}
        ${d.chave ? linha('Chave de acesso', `<span class="quebra">${esc(d.chave)}</span>`) : ''}
        ${linha('Data de competência', esc(dataBR(d.emissao)))}
        ${linha('Valor bruto', moeda(r.valor))}
        ${linha('Natureza (IN RFB 1.234/2012)', esc(r.natureza.texto))}</table></div>
      <div class="doc-secao"><div class="doc-secao-titulo">2 - Fornecedor</div><table class="doc-tab">
        ${linha('Razão social', esc(cad?.nome || d.nome || ''))}
        ${linha('CNPJ', esc(formatarCnpj(cad?.cnpj || d.cnpj)))}
        ${linha('Situação cadastral', esc(cad?.situacao || 'não consultada'))}
        ${linha('Simples Nacional na data', esc(r.simples == null ? 'não confirmado' : r.mei ? 'MEI' : r.simples ? 'Optante' : 'Não optante') + (r.fonteSimples ? ' — ' + esc(r.fonteSimples) : ''))}</table></div>
      ${r.verificacao?.linhas?.length ? `<div class="doc-secao"><div class="doc-secao-titulo">Natureza do serviço</div><table class="doc-tab">
        ${d.codigoServico ? linha('Código de tributação', esc((r.verificacao.tributacao?.codigo || d.codigoServico) + (r.verificacao.tributacao?.texto ? ' — ' + r.verificacao.tributacao.texto : ''))) : ''}
        ${d.descricaoServico ? linha('Descrição na nota', esc(d.descricaoServico)) : ''}
        ${r.verificacao.linhas.map(l => linha((l.ok === true ? '✓ ' : l.ok === false ? '✕ ' : '') + l.titulo, esc(l.detalhe))).join('')}</table></div>` : ''}
      <div class="doc-secao"><div class="doc-secao-titulo">3 - Tributos</div><table class="doc-tab">
        ${linha('IRRF', `${r.ir.reter ? 'Reter ' + moeda(r.ir.valor) + ' (' + pctTxt(r.ir.aliquota) + ')' : 'Não reter'} — ${esc(r.ir.motivo)}`)}
        ${linha('ISSQN', `${!r.iss.aplica ? 'Não se aplica' : r.iss.reter && r.iss.valor ? 'Reter ' + moeda(r.iss.valor) + ' (' + pctTxt(r.iss.aliquota) + ')' : 'Não reter'}${r.iss.motivo ? ' — ' + esc(r.iss.motivo) : ''}`)}
        ${linha('CBS / IBS', esc(r.cbsibs.motivo) + (r.cbsibs.esperado ? ` (CBS ${moeda(r.cbsibs.esperado.vCBS)} · IBS ${moeda(r.cbsibs.esperado.vIBS)})` : ''))}</table></div>
      <div class="doc-secao"><div class="doc-secao-titulo">4 - Liquidação</div>${r.temDadosNota ? `<table class="doc-tab">
        <tr><th style="width:40%"></th><th>Na nota</th><th>Conferido (a pagar)</th><th>Diferença</th></tr>
        <tr><td class="r">Valor bruto</td><td>${moeda(r.valor)}</td><td>${moeda(r.valor)}</td><td></td></tr>
        ${r.comparativo.map(l => `<tr><td class="r">${l.total ? '' : '(−) '}${esc(l.item)}${l.notaAliq != null || l.conferidoAliq != null ? ` (${l.notaAliq != null ? pctTxt(l.notaAliq) : '—'} → ${l.conferidoAliq != null ? pctTxt(l.conferidoAliq) : '—'})` : ''}</td><td>${moeda(l.nota)}</td><td>${l.total ? '<strong>' + moeda(l.conferido) + '</strong>' : moeda(l.conferido)}</td><td>${Math.abs(l.diferenca) >= 0.01 ? moeda(l.diferenca) : '—'}</td></tr>`).join('')}
      </table>` : `<table class="doc-tab">
        ${linha('Valor bruto', moeda(r.valor))}${linha('(−) IRRF', moeda(r.ir.reter ? r.ir.valor : 0))}${linha('(−) ISSQN', moeda(r.iss.reter ? r.iss.valor : 0))}
        ${linha('Valor líquido a pagar', `<strong>${moeda(r.liquido)}</strong>`)}</table>`}</div>
      <div class="doc-secao"><div class="doc-secao-titulo">5 - Divergências e providências</div><table class="doc-tab"><tr><td>
        ${r.problemas.length ? `<ul class="doc-lista">${r.problemas.map(p => `<li><strong>[${NIVEL[p.nivel][0]}] ${esc(p.titulo)}.</strong> ${esc(p.solucao)}</li>`).join('')}</ul>` : 'Nenhuma divergência encontrada.'}
      </td></tr></table></div>
      <p class="doc-sub" style="margin-top:6px">Bases: IN RFB 1.234/2012 com a IN RFB 2.145/2023 (IRRF, dispensa abaixo de R$ ${MINIMO_RETENCAO_IR},00); LC 116/2003 e legislação municipal (ISSQN ${pctTxt(parametrosFiscais?.issPadrao || ISS.aliquota)}${Object.keys(parametrosFiscais?.issPorCodigo || {}).length ? ', com exceções por código' : ''}); LC 123/2006 (Simples Nacional); LC 214/2025 (CBS/IBS).
        Consulta do CNPJ em dados abertos da Receita Federal${cad ? ' (' + esc(cad.fonte) + ')' : ''}. Conferido em ${esc(ultimaConferencia.quando.toLocaleString('pt-BR'))} por ${esc(estado.sessao?.nome || '')}.</p>
      <table class="doc-ass"><tr><td><div class="doc-linha-ass">${esc(estado.sessao?.nome || 'Contabilidade')}<br>Contabilidade</div></td><td><div class="doc-linha-ass">Ordenador da despesa</div></td></tr></table>
    </div></div>`;
  return { titulo: 'Ficha de conferência fiscal' };
}

// ---------------- Widget: botão flutuante + painel lateral (F2), em qualquer tela ----------------
/** Coloca o botão "Conferir nota" e o painel lateral dentro do layout (some no logout junto com o layout). */
export function iniciarWidgetFiscal(container) {
  if (!container || container.querySelector('.fiscal-fab')) return;
  const botao = document.createElement('button');
  botao.type = 'button'; botao.className = 'fiscal-fab'; botao.title = 'Conferir nota fiscal (F2)';
  botao.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7V5.5A1.5 1.5 0 0 1 5.5 4H7M17 4h1.5A1.5 1.5 0 0 1 20 5.5V7M20 17v1.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H5.5A1.5 1.5 0 0 1 4 18.5V17M8 8v8M11 8v8M14 8v8M16.5 8v8"/></svg><span>Conferir nota</span>';
  const painel = document.createElement('aside');
  painel.className = 'fiscal-gaveta'; painel.hidden = true; painel.setAttribute('aria-label', 'Conferência fiscal');
  painel.innerHTML = `<div class="fiscal-gaveta-topo"><strong>Conferência fiscal</strong>
      <a class="btn btn-sec btn-peq" href="#/fiscal" title="Abrir em tela cheia">Tela cheia</a>
      <button type="button" class="btn-icone" data-fechar aria-label="Fechar (Esc)">✕</button></div>
    <div class="fiscal-compacto"></div>`;
  container.append(botao, painel);
  const conteudo = painel.querySelector('.fiscal-compacto');
  const naTelaFiscal = () => /^#\/(fiscal|imprimir\/fiscal)/.test(location.hash);
  const abrir = () => {
    if (naTelaFiscal()) { document.querySelector('#conteudo #fis-codigo')?.focus(); return; }
    painel.hidden = false; botao.hidden = true;
    telaFiscal(conteudo);
    setTimeout(() => { const i = conteudo.querySelector('#fis-codigo'); i?.focus(); i?.select(); }, 30);
  };
  const fechar = () => { painel.hidden = true; botao.hidden = naTelaFiscal(); conteudo.innerHTML = ''; };
  botao.onclick = abrir;
  painel.querySelector('[data-fechar]').onclick = fechar;
  const teclas = e => {
    if (!document.contains(painel)) { document.removeEventListener('keydown', teclas); return; }
    if (e.key === 'F2') { e.preventDefault(); painel.hidden ? abrir() : conteudo.querySelector('#fis-codigo')?.focus(); }
    else if (e.key === 'Escape' && !painel.hidden && !document.querySelector('.modal-fundo')) fechar();
  };
  document.addEventListener('keydown', teclas);
  const aoNavegar = () => {
    if (!document.contains(painel)) { window.removeEventListener('hashchange', aoNavegar); return; }
    if (!painel.hidden) fechar(); else botao.hidden = naTelaFiscal();
  };
  window.addEventListener('hashchange', aoNavegar);
  botao.hidden = naTelaFiscal();
}

// ---------------- Alíquotas do ISS (config/fiscal no Firestore) ----------------
let parametrosFiscais = null;
let carregandoParametros = null;
async function carregarParametros(el) {
  if (parametrosFiscais || carregandoParametros) return;
  carregandoParametros = (async () => {
    try {
      const db = await import('../db.js');
      parametrosFiscais = (await db.lerDoc('config', 'fiscal')) || { issPadrao: ISS.aliquota, issPorCodigo: {} };
      if (s.resultado && el?.isConnected) recalcular(el);
    } catch { parametrosFiscais = null; }
    finally { carregandoParametros = null; }
  })();
}

function textoExcecoes(tab) { return Object.entries(tab || {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k} = ${String(v).replace('.', ',')}`).join('\n'); }

async function abrirAliquotas(el) {
  const ehAdmin = estado.sessao?.perfil === 'admin';
  const p = parametrosFiscais || { issPadrao: ISS.aliquota, issPorCodigo: {} };
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `<div class="modal" style="max-width:560px" role="dialog" aria-label="Alíquotas do ISS"><div class="modal-topo"><h2>Alíquotas do ISS — ${esc(MUNICIPIO.nome)}</h2><button class="btn-icone" type="button" data-fechar aria-label="Fechar">✕</button></div>
    <form class="modal-corpo" id="f-aliq">
      <p class="dica">Valem para serviços prestados em ${esc(MUNICIPIO.nome)} por fornecedor que não é do Simples. Use as alíquotas do Código Tributário Municipal (confirme com o setor de Tributos).</p>
      <label class="campo campo-curto"><span>Alíquota padrão (%)</span><input type="number" name="padrao" step="0.01" min="2" max="5" value="${esc(String(p.issPadrao ?? ISS.aliquota))}" ${ehAdmin ? '' : 'disabled'}></label>
      <label class="campo"><span>Exceções por código de serviço — uma por linha</span><textarea name="excecoes" rows="6" placeholder="16.01 = 2,5&#10;16.02 = 2,5" ${ehAdmin ? '' : 'disabled'}>${esc(textoExcecoes(p.issPorCodigo))}</textarea>
        <small class="dica">Item (16), subitem (16.01) ou código completo (16.01.01). O mais específico vale.</small></label>
      ${ehAdmin ? '<div class="acoes-form"><button class="btn" type="submit">Salvar alíquotas</button></div>' : '<p class="muted">Só o administrador altera as alíquotas.</p>'}
    </form></div>`;
  document.body.appendChild(fundo);
  const fechar = () => fundo.remove();
  fundo.querySelector('[data-fechar]').onclick = fechar;
  fundo.onclick = e => { if (e.target === fundo) fechar(); };
  fundo.querySelector('#f-aliq').onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    const padrao = Number(String(f.padrao.value).replace(',', '.'));
    if (!(padrao >= 2 && padrao <= 5)) return toast('A alíquota do ISS fica entre 2% e 5% (LC 116/2003).', 'erro');
    const tab = {};
    for (const linha of f.excecoes.value.split('\n').map(x => x.trim()).filter(Boolean)) {
      const m = linha.match(/^(\d{2}(?:\.?\d{2}){0,2})\s*[=:;\s]\s*(\d+(?:[.,]\d+)?)\s*%?$/);
      if (!m) return toast(`Linha não entendida: "${linha}". Use o formato 16.01 = 2,5`, 'erro');
      const cod = m[1].replace(/\D/g, '').match(/.{1,2}/g).join('.');
      const al = Number(m[2].replace(',', '.'));
      if (!(al >= 0 && al <= 5)) return toast(`Alíquota inválida para ${cod}.`, 'erro');
      tab[cod] = al;
    }
    try {
      const db = await import('../db.js');
      const novo = { issPadrao: padrao, issPorCodigo: tab };
      try { await db.atualizar('config', 'fiscal', novo); } catch { await db.salvar('config', 'fiscal', novo); }
      await db.registrarLog('fiscal.aliquotas', { antes: parametrosFiscais, depois: novo });
      parametrosFiscais = novo;
      toast('Alíquotas do ISS salvas.');
      fechar();
      if (s.resultado) recalcular(el);
    } catch (err) { toast('Não foi possível salvar: ' + (err.message || err), 'erro'); }
  };
}

// ---------------- Mensagem ao fornecedor ----------------
function abrirMensagem() {
  const r = s.resultado;
  if (!r) return;
  const cad = s.consulta?.cadastro;
  const texto = mensagemFornecedor(r, s.doc, cad);
  const assunto = `Correção da ${s.doc.documento || 'nota fiscal'}${s.doc.numero ? ' nº ' + s.doc.numero : ''}`;
  const email = s.doc.email || '';
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `<div class="modal" style="max-width:640px" role="dialog" aria-label="Mensagem ao fornecedor"><div class="modal-topo"><h2>Mensagem ao fornecedor</h2><button class="btn-icone" type="button" data-fechar aria-label="Fechar">✕</button></div>
    <div class="modal-corpo"><textarea id="msg-forn" rows="14" style="width:100%;font:inherit">${esc(texto)}</textarea>
      <div class="acoes-form">
        <button class="btn" type="button" data-copiar>📋 Copiar</button>
        <a class="btn btn-sec" data-whats target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <a class="btn btn-sec" data-email>E-mail${email ? ' (' + esc(email) + ')' : ''}</a>
      </div></div></div>`;
  document.body.appendChild(fundo);
  const area = fundo.querySelector('#msg-forn');
  const atualizarLinks = () => {
    fundo.querySelector('[data-whats]').href = 'https://wa.me/?text=' + encodeURIComponent(area.value);
    fundo.querySelector('[data-email]').href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(area.value)}`;
  };
  atualizarLinks(); area.oninput = atualizarLinks;
  fundo.querySelector('[data-copiar]').onclick = () => navigator.clipboard?.writeText(area.value).then(() => toast('Mensagem copiada.'), () => { area.select(); toast('Selecione e copie (Ctrl+C).', 'aviso'); });
  const fechar = () => fundo.remove();
  fundo.querySelector('[data-fechar]').onclick = fechar;
  fundo.onclick = e => { if (e.target === fundo) fechar(); };
}
