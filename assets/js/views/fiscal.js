// SISDIFI — Conferência fiscal de notas de fornecedores (somente Contabilidade)
// Leitor de código de barras / câmera / digitação / XML → Simples Nacional, IRRF, ISSQN, CBS/IBS e o que corrigir.
import { estado } from '../estado.js';
import { esc, $, toast, dataBR, hojeISO } from '../ui.js';
import { cabecalho } from './comum.js';
import {
  lerCodigo, lerXML, consultarCnpj, conferir, sugerirNatureza, NATUREZAS, MUNICIPIO, ISS, MINIMO_RETENCAO_IR,
  formatarCnpj, limparCnpj, cnpjValido, moeda
} from '../fiscal.js';

const PORTAL_SIMPLES = 'https://www8.receita.fazenda.gov.br/SimplesNacional/aplicacoes.aspx?id=21';
const CHAVE_HIST = 'sisdifi.fiscal.historico';

// Estado da tela (fica entre as navegações)
const s = {
  codigo: '', leitura: null, doc: {}, consulta: null, consultando: false, natureza: '', naturezaAuto: true,
  simplesManual: '', resultado: null, conf: 0
};
export const ultimaConferencia = { r: null, s: null, quando: null };

const pctTxt = v => (v == null ? '—' : String(Math.round(v * 100) / 100).replace('.', ',') + '%');
const numCampo = v => (v == null || v === '' ? '' : String(v));

function historico() { try { return JSON.parse(localStorage.getItem(CHAVE_HIST) || '[]'); } catch { return []; } }
function guardarHistorico(item) {
  try { const h = historico().filter(x => x.id !== item.id); h.unshift(item); localStorage.setItem(CHAVE_HIST, JSON.stringify(h.slice(0, 60))); } catch { /* sem armazenamento */ }
}
const idNota = () => s.doc.chave || (s.doc.cnpj && s.doc.numero ? `${limparCnpj(s.doc.cnpj)}-${s.doc.numero}` : '');

export function telaFiscal(el) {
  el.innerHTML = `
    ${cabecalho('Conferência fiscal de notas', '', `Leia o código de barras da nota, digite a chave ou o CNPJ, ou abra o XML. O sistema confere Simples Nacional, IRRF, ISSQN (${esc(MUNICIPIO.nome)}: ${pctTxt(ISS.aliquota)}), CBS e IBS e aponta o que corrigir antes da liquidação.`)}
    <div class="cartao fiscal-leitura">
      <label class="campo"><span>Código de barras, chave de acesso, QR Code ou CNPJ</span>
        <div class="fiscal-linha">
          <input id="fis-codigo" inputmode="text" autocomplete="off" spellcheck="false" placeholder="Aponte o leitor para o código de barras do DANFE ou digite a chave / CNPJ" value="${esc(s.codigo)}">
          <button class="btn" type="button" id="fis-ler">Conferir</button>
        </div>
        <small class="dica" id="fis-leitura-dica">${s.leitura ? esc(descreverLeitura(s.leitura)) : 'O leitor USB funciona como teclado: é só ler com o cursor neste campo.'}</small>
      </label>
      <div class="acoes-linha">
        <button class="btn btn-sec" type="button" id="fis-camera">📷 Ler com a câmera</button>
        <label class="btn btn-sec" for="fis-xml">📄 Abrir XML da nota</label><input type="file" id="fis-xml" accept=".xml,text/xml,application/xml" hidden>
        <button class="btn btn-sec" type="button" id="fis-limpar">Nova conferência</button>
      </div>
    </div>
    <div class="grade-form fiscal-grade">
      <form class="cartao col-form" id="fis-form" novalidate></form>
      <aside class="col-resultado" id="fis-resultado"></aside>
    </div>`;

  const inp = $('#fis-codigo', el);
  const ler = () => processarCodigo(el, inp.value);
  $('#fis-ler', el).onclick = ler;
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ler(); } };
  // leitor USB costuma "digitar" a chave inteira rapidamente: confere sozinho ao completar 44/50 dígitos
  inp.oninput = () => { const d = inp.value.replace(/\D/g, ''); if ((d.length === 44 || d.length === 50) && d === inp.value.trim()) ler(); };
  $('#fis-camera', el).onclick = () => abrirCamera(el);
  $('#fis-xml', el).onchange = e => abrirXML(el, e.target.files?.[0]);
  $('#fis-limpar', el).onclick = () => { Object.assign(s, { codigo: '', leitura: null, doc: {}, consulta: null, natureza: '', naturezaAuto: true, simplesManual: '', resultado: null }); telaFiscal(el); $('#fis-codigo', el)?.focus(); };
  desenharForm(el);
  desenharResultado(el);
  if (!s.codigo) setTimeout(() => inp.focus(), 50);
  return { titulo: 'Conferência fiscal' };
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
  const l = lerCodigo(texto);
  if (l.tipo === 'vazio') { toast('Leia ou digite a chave, o QR Code ou o CNPJ.', 'aviso'); return; }
  if (l.tipo === 'boleto') { toast('Isso é a linha de um boleto: ele não traz o CNPJ do fornecedor. Leia o código de barras do DANFE/NFS-e ou digite o CNPJ.', 'aviso'); return; }
  if (l.tipo === 'desconhecido') { toast(`Não reconheci o código (${l.tamanho} caracteres). A chave da NF-e tem 44 dígitos, a da NFS-e Nacional 50 e o CNPJ 14.`, 'erro'); return; }
  s.codigo = l.chave || formatarCnpj(l.cnpj);
  s.leitura = l; s.conf = Date.now();
  // mantém o que veio do XML se for a mesma nota
  if (!(s.doc.origem === 'xml' && s.doc.chave === l.chave)) {
    s.doc = { origem: 'leitura', cnpj: l.cnpj, documento: l.tipo === 'chave' ? l.documento : '', modelo: l.modelo || '', chave: l.chave || '', numero: l.numero || '', serie: l.serie || '',
      municipioEmissor: l.municipio || '', servico: l.modelo === 'nfse', emissao: l.anoMes ? l.anoMes + '-01' : '' };
    s.naturezaAuto = true;
  }
  if (l.tipo === 'cnpj' && !l.valida) { toast('CNPJ com dígito verificador inválido.', 'erro'); }
  telaFiscal(el);
  await consultar(el);
  if (s.doc.origem === 'leitura' && l.tipo === 'chave') toast('Confira a data de emissão e informe o valor da nota — ou abra o XML para conferir tudo.', 'aviso');
}

async function abrirXML(el, arquivo) {
  if (!arquivo) return;
  try {
    const texto = await arquivo.text();
    const d = lerXML(texto);
    s.doc = d; s.naturezaAuto = true; s.simplesManual = ''; s.conf = Date.now();
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
  if (s.naturezaAuto) s.natureza = sugerirNatureza(d);
  const grupos = [...new Set(NATUREZAS.map(n => n.grupo))];
  const cad = s.consulta?.cadastro;
  const ibs = d.ibscbs || {};
  f.innerHTML = `
    <h3>Dados da nota ${d.origem === 'xml' ? '<span class="selo selo-info">lidos do XML</span>' : ''}</h3>
    <div class="grade-2">
      <label class="campo"><span>CNPJ do fornecedor</span><input name="cnpj" value="${esc(d.cnpj ? formatarCnpj(d.cnpj) : '')}" placeholder="00.000.000/0000-00"></label>
      <label class="campo"><span>Documento</span><select name="documento">
        ${['', 'NF-e', 'NFC-e', 'NFS-e Nacional', 'NFS-e', 'CT-e', 'Recibo/Fatura'].map(o => `<option ${d.documento === o ? 'selected' : ''} value="${esc(o)}">${esc(o || 'Selecione')}</option>`).join('')}</select></label>
    </div>
    <div class="grade-3">
      <label class="campo"><span>Número</span><input name="numero" value="${esc(d.numero || '')}"></label>
      <label class="campo"><span>Data de emissão</span><input type="date" name="emissao" value="${esc(d.emissao || '')}"></label>
      <label class="campo"><span>Valor bruto (R$)</span><input type="number" name="valor" step="0.01" min="0" value="${esc(numCampo(d.valor))}"></label>
    </div>
    <label class="campo"><span>Natureza do bem ou serviço (Anexo I da IN RFB 1.234/2012)</span><select name="natureza">
      ${grupos.map(g => `<optgroup label="${esc(g)}">${NATUREZAS.filter(n => n.grupo === g).map(n => `<option value="${n.id}" ${s.natureza === n.id ? 'selected' : ''}>${esc(n.texto)} — IR ${pctTxt(n.ir)}</option>`).join('')}</optgroup>`).join('')}
    </select><small class="dica">${s.naturezaAuto ? 'Sugerida pela nota — confirme.' : 'Escolhida pela Contabilidade.'}${d.descricaoServico ? ' Serviço: ' + esc(d.descricaoServico.slice(0, 120)) : ''}</small></label>
    <div class="grade-2">
      <label class="campo"><span>Município de emissão / incidência</span><select name="municipio">
        <option value="${MUNICIPIO.ibge}" ${!d.municipioEmissor || d.municipioEmissor === MUNICIPIO.ibge ? 'selected' : ''}>${esc(MUNICIPIO.nome)}/${MUNICIPIO.uf}</option>
        <option value="outro" ${d.municipioEmissor && d.municipioEmissor !== MUNICIPIO.ibge ? 'selected' : ''}>Outro município${d.municipioEmissor && d.municipioEmissor !== MUNICIPIO.ibge ? ' (' + esc(d.municipioEmissor) + ')' : ''}</option></select></label>
      <label class="campo"><span>Regime declarado na nota</span><select name="regimeNota">
        ${[['', 'Não informado'], ['normal', 'Regime normal / não optante'], ['simples', 'Simples Nacional (ME/EPP)'], ['mei', 'MEI']].map(([v, t]) => `<option value="${v}" ${d.regimeNota === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        ${d.regimeNotaTexto ? `<small class="dica">${esc(d.regimeNotaTexto)}</small>` : ''}</label>
    </div>
    <details class="mt" ${d.origem === 'xml' || d.irrfDestacado != null || d.issAliquota != null ? 'open' : ''}><summary>Valores destacados na nota (para conferir)</summary>
      <div class="grade-3 mt">
        <label class="campo"><span>IRRF destacado (R$)</span><input type="number" step="0.01" min="0" name="irrfDestacado" value="${esc(numCampo(d.irrfDestacado))}"></label>
        <label class="campo"><span>Alíquota do ISS (%)</span><input type="number" step="0.01" min="0" name="issAliquota" value="${esc(numCampo(d.issAliquota))}"></label>
        <label class="campo"><span>Valor do ISS (R$)</span><input type="number" step="0.01" min="0" name="issValor" value="${esc(numCampo(d.issValor))}"></label>
      </div>
      <div class="grade-3">
        <label class="campo"><span>ISS retido pelo tomador?</span><select name="issRetidoNota">
          ${[['', 'Não informado'], ['sim', 'Sim'], ['nao', 'Não']].map(([v, t]) => `<option value="${v}" ${(d.issRetidoNota === true && v === 'sim') || (d.issRetidoNota === false && v === 'nao') || (d.issRetidoNota == null && v === '') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="campo"><span>CBS destacada (R$)</span><input type="number" step="0.01" min="0" name="vCBS" value="${esc(numCampo(ibs.vCBS))}"></label>
        <label class="campo"><span>IBS destacado (R$)</span><input type="number" step="0.01" min="0" name="vIBS" value="${esc(numCampo(ibs.vIBS))}"></label>
      </div>
      ${ibs.pCBS != null || ibs.cst ? `<p class="dica">No XML: CST ${esc(ibs.cst || '—')}${ibs.classTrib ? ' · cClassTrib ' + esc(ibs.classTrib) : ''} · CBS ${pctTxt(ibs.pCBS)} · IBS UF ${pctTxt(ibs.pIBSUF)} · IBS Mun ${pctTxt(ibs.pIBSMun)}</p>` : ''}
    </details>
    <label class="campo mt"><span>Simples Nacional na data da nota</span><select name="simplesManual">
      ${[['', cad ? 'Conforme a consulta à Receita' : 'Consultar automaticamente'], ['sim', 'Optante (ME/EPP) — conferido no Portal'], ['mei', 'MEI — conferido no Portal'], ['nao', 'Não optante — conferido no Portal']].map(([v, t]) => `<option value="${v}" ${s.simplesManual === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <small class="dica"><a href="${PORTAL_SIMPLES}" target="_blank" rel="noopener noreferrer">Abrir o Portal do Simples Nacional</a> para confirmar e anexar a consulta ao processo.</small></label>`;
  const ler = () => {
    const v = Object.fromEntries(new FormData(f));
    const n = x => (x === '' || x == null ? null : Number(x));
    const cnpjNovo = limparCnpj(v.cnpj);
    const mudouCnpj = cnpjNovo !== limparCnpj(s.doc.cnpj);
    if (v.natureza !== s.natureza) s.naturezaAuto = false;
    s.natureza = v.natureza;
    s.simplesManual = v.simplesManual;
    const ibsAnt = s.doc.ibscbs || {};
    const vCBS = n(v.vCBS), vIBS = n(v.vIBS);
    Object.assign(s.doc, {
      cnpj: cnpjNovo, documento: v.documento, numero: v.numero, emissao: v.emissao, valor: n(v.valor),
      municipioEmissor: v.municipio === 'outro' ? (s.doc.municipioEmissor && s.doc.municipioEmissor !== MUNICIPIO.ibge ? s.doc.municipioEmissor : 'outro') : MUNICIPIO.ibge,
      regimeNota: v.regimeNota, irrfDestacado: n(v.irrfDestacado), issAliquota: n(v.issAliquota), issValor: n(v.issValor),
      issRetidoNota: v.issRetidoNota === 'sim' ? true : v.issRetidoNota === 'nao' ? false : null,
      modelo: s.doc.modelo || ({ 'NF-e': '55', 'NFC-e': '65', 'CT-e': '57', 'NFS-e Nacional': 'nfse', 'NFS-e': 'nfse' })[v.documento] || '',
      servico: s.doc.origem === 'xml' ? s.doc.servico : /NFS/.test(v.documento),
      ibscbs: vCBS != null || vIBS != null || ibsAnt.pCBS != null ? { ...ibsAnt, vCBS, vIBS } : null
    });
    if (mudouCnpj) consultar(el); else recalcular(el);
  };
  f.onchange = ler;
  f.onsubmit = e => { e.preventDefault(); ler(); };
}

function recalcular(el) {
  const temDados = s.doc.cnpj || s.doc.valor;
  s.resultado = temDados ? conferir({ doc: s.doc, cadastro: s.consulta?.cadastro || null, naturezaId: s.natureza, simplesManual: s.simplesManual, hoje: hojeISO(), chave: s.leitura?.tipo === 'chave' ? s.leitura : null }) : null;
  if (s.resultado && s.doc.valor) {
    const id = idNota();
    if (id) {
      const ant = historico().find(x => x.id === id);
      s.repetida = ant && ant.conf !== s.conf ? ant : (s.repetida && s.repetida.id === id ? s.repetida : null);
      guardarHistorico({ id, conf: s.conf, quando: Date.now(), por: estado.sessao?.nome || '', fornecedor: s.consulta?.cadastro?.nome || s.doc.nome || '', valor: s.doc.valor, numero: s.doc.numero || '', situacao: s.resultado.situacao });
    }
  }
  ultimaConferencia.r = s.resultado; ultimaConferencia.s = structuredClone({ doc: s.doc, consulta: s.consulta, leitura: s.leitura }); ultimaConferencia.quando = new Date();
  desenharResultado(el);
}

// ---------------- Resultado ----------------
const SIT = {
  ok: ['fiscal-ok', 'Nota conferida — pode seguir para a liquidação'],
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
      <p class="alerta alerta-info mt">Informe o <strong>valor bruto</strong> e confira a <strong>data de emissão</strong> para calcular as retenções e conferir a nota. Com o XML, tudo é preenchido sozinho.</p></div>`;
    return;
  }
  if (!r) { box.innerHTML = `<div class="cartao"><h3>Como usar</h3><ol class="passos">
    <li>Leia o código de barras do DANFE (leitor USB ou câmera), cole o QR Code, digite a chave ou o CNPJ — ou abra o XML da nota.</li>
    <li>Confira a natureza do bem/serviço e o valor bruto.</li>
    <li>Veja aqui o que reter, o valor líquido e cada erro da nota com a solução.</li>
    <li>Imprima a ficha de conferência e junte ao processo de liquidação.</li></ol></div>`; return; }
  const [cls, txt] = SIT[r.situacao];
  const qtd = n => r.problemas.filter(p => p.nivel === n).length;
  box.innerHTML = `
    <div class="cartao fiscal-situacao ${cls}"><strong>${esc(txt)}</strong>
      <span>${qtd('erro')} erro(s) · ${qtd('alerta')} aviso(s) · ${qtd('info')} orientação(ões)</span></div>
    ${s.repetida ? `<div class="alerta">Esta nota já foi conferida neste computador em ${esc(new Date(s.repetida.quando).toLocaleString('pt-BR'))}${s.repetida.por ? ' por ' + esc(s.repetida.por) : ''}. Confira se não é pagamento em duplicidade.</div>` : ''}
    <div class="cartao">
${blocoFornecedor(cad)}
      <div class="fiscal-cartoes">
        <div class="fiscal-item"><span>Simples Nacional</span><strong>${r.simples == null ? 'Não confirmado' : r.mei ? 'MEI' : r.simples ? 'Optante' : 'Não optante'}</strong>
          <small>${r.simples == null ? 'confira no Portal' : esc(r.fonteSimples)}${cad?.simplesInicio && r.simples ? ' · desde ' + esc(dataBR(cad.simplesInicio)) : ''}${cad?.simplesFim ? ' · excluído em ' + esc(dataBR(cad.simplesFim)) : ''}</small></div>
        <div class="fiscal-item"><span>IRRF</span><strong>${r.ir.reter ? 'Reter ' + moeda(r.ir.valor) : 'Não reter'}</strong><small>${esc(r.ir.motivo)}</small></div>
        <div class="fiscal-item"><span>ISSQN</span><strong>${!r.iss.aplica ? 'Não se aplica' : r.iss.reter && r.iss.valor ? 'Reter ' + moeda(r.iss.valor) : 'Não reter'}</strong><small>${esc(r.iss.motivo || (r.natureza.servico ? '' : 'Fornecimento de bens'))}</small></div>
        <div class="fiscal-item"><span>CBS / IBS</span><strong>${r.cbsibs.esperado ? `${pctTxt(r.cbsibs.esperado.cbs)} / ${pctTxt(r.cbsibs.esperado.ibs)}` : 'Não se aplica'}</strong><small>${esc(r.cbsibs.motivo)}</small></div>
      </div>
    </div>
    <div class="cartao">
      <h3>Para a liquidação</h3>
      <table class="tabela tabela-peq fiscal-liq"><tbody>
        <tr><td>Valor bruto da nota</td><td class="num">${moeda(r.valor)}</td></tr>
        <tr><td>(−) IRRF ${r.ir.reter ? `${pctTxt(r.ir.aliquota)} · ${esc(r.natureza.texto)}` : ''}</td><td class="num">${moeda(r.ir.reter ? r.ir.valor : 0)}</td></tr>
        <tr><td>(−) ISSQN ${r.iss.reter && r.iss.valor ? pctTxt(r.iss.aliquota) : ''}</td><td class="num">${moeda(r.iss.reter ? r.iss.valor : 0)}</td></tr>
        <tr class="fiscal-total"><td>Valor líquido a pagar</td><td class="num">${moeda(r.liquido)}</td></tr>
      </tbody></table>
      ${r.cbsibs.esperado && r.cbsibs.parametros?.teste ? `<p class="dica">CBS (${moeda(r.cbsibs.esperado.vCBS)}) e IBS (${moeda(r.cbsibs.esperado.vIBS)}) de 2026 são informativos: não entram no total nem são retidos.</p>` : ''}
      <div class="acoes-form"><a class="btn" href="#/imprimir/fiscal">🖨 Imprimir ficha de conferência</a>
        <a class="btn btn-sec" href="${PORTAL_SIMPLES}" target="_blank" rel="noopener noreferrer">Portal do Simples</a></div>
    </div>
    <div class="cartao">
      <h3>Erros e soluções</h3>
      ${r.problemas.length ? `<ul class="fiscal-problemas">${r.problemas.map(p => `<li class="fiscal-${p.nivel}">
        <span class="selo ${NIVEL[p.nivel][1]}">${NIVEL[p.nivel][0]}</span> <strong>${esc(p.titulo)}</strong>${p.detalhe ? ` <span class="muted">(${esc(p.detalhe)})</span>` : ''}
        <p><b>Como resolver:</b> ${esc(p.solucao)}</p></li>`).join('')}</ul>` : '<p class="ok-txt">Nenhuma divergência encontrada.</p>'}
    </div>`;
}


function blocoFornecedor(cad) {
  return `<h3>Fornecedor</h3>
      ${cad ? `<p><strong>${esc(cad.nome)}</strong>${cad.fantasia ? ` <span class="muted">(${esc(cad.fantasia)})</span>` : ''}<br>
        CNPJ ${esc(formatarCnpj(cad.cnpj))} · <span class="selo ${cad.situacao === 'ATIVA' ? 'selo-emitida' : 'selo-cancelada'}">${esc(cad.situacao || '—')}</span><br>
        <span class="muted">${esc(cad.naturezaTexto || '')}${cad.cnaeTexto ? ' · CNAE ' + esc(cad.cnae) + ' ' + esc(cad.cnaeTexto) : ''}${cad.municipio ? ' · ' + esc(cad.municipio) + '/' + esc(cad.uf) : ''}</span></p>`
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
        ${linha('Data de emissão', esc(dataBR(d.emissao)))}
        ${linha('Valor bruto', moeda(r.valor))}
        ${linha('Natureza (IN RFB 1.234/2012)', esc(r.natureza.texto))}</table></div>
      <div class="doc-secao"><div class="doc-secao-titulo">2 - Fornecedor</div><table class="doc-tab">
        ${linha('Razão social', esc(cad?.nome || d.nome || ''))}
        ${linha('CNPJ', esc(formatarCnpj(cad?.cnpj || d.cnpj)))}
        ${linha('Situação cadastral', esc(cad?.situacao || 'não consultada'))}
        ${linha('Simples Nacional na data', esc(r.simples == null ? 'não confirmado' : r.mei ? 'MEI' : r.simples ? 'Optante' : 'Não optante') + (r.fonteSimples ? ' — ' + esc(r.fonteSimples) : ''))}</table></div>
      <div class="doc-secao"><div class="doc-secao-titulo">3 - Tributos</div><table class="doc-tab">
        ${linha('IRRF', `${r.ir.reter ? 'Reter ' + moeda(r.ir.valor) + ' (' + pctTxt(r.ir.aliquota) + ')' : 'Não reter'} — ${esc(r.ir.motivo)}`)}
        ${linha('ISSQN', `${!r.iss.aplica ? 'Não se aplica' : r.iss.reter && r.iss.valor ? 'Reter ' + moeda(r.iss.valor) + ' (' + pctTxt(r.iss.aliquota) + ')' : 'Não reter'}${r.iss.motivo ? ' — ' + esc(r.iss.motivo) : ''}`)}
        ${linha('CBS / IBS', esc(r.cbsibs.motivo) + (r.cbsibs.esperado ? ` (CBS ${moeda(r.cbsibs.esperado.vCBS)} · IBS ${moeda(r.cbsibs.esperado.vIBS)})` : ''))}</table></div>
      <div class="doc-secao"><div class="doc-secao-titulo">4 - Liquidação</div><table class="doc-tab">
        ${linha('Valor bruto', moeda(r.valor))}${linha('(−) IRRF', moeda(r.ir.reter ? r.ir.valor : 0))}${linha('(−) ISSQN', moeda(r.iss.reter ? r.iss.valor : 0))}
        ${linha('Valor líquido a pagar', `<strong>${moeda(r.liquido)}</strong>`)}</table></div>
      <div class="doc-secao"><div class="doc-secao-titulo">5 - Divergências e providências</div><table class="doc-tab"><tr><td>
        ${r.problemas.length ? `<ul class="doc-lista">${r.problemas.map(p => `<li><strong>[${NIVEL[p.nivel][0]}] ${esc(p.titulo)}.</strong> ${esc(p.solucao)}</li>`).join('')}</ul>` : 'Nenhuma divergência encontrada.'}
      </td></tr></table></div>
      <p class="doc-sub" style="margin-top:6px">Bases: IN RFB 1.234/2012 com a IN RFB 2.145/2023 (IRRF, dispensa abaixo de R$ ${MINIMO_RETENCAO_IR},00); LC 116/2003 e legislação municipal (ISSQN ${pctTxt(ISS.aliquota)}); LC 123/2006 (Simples Nacional); LC 214/2025 (CBS/IBS).
        Consulta do CNPJ em dados abertos da Receita Federal${cad ? ' (' + esc(cad.fonte) + ')' : ''}. Conferido em ${esc(ultimaConferencia.quando.toLocaleString('pt-BR'))} por ${esc(estado.sessao?.nome || '')}.</p>
      <table class="doc-ass"><tr><td><div class="doc-linha-ass">${esc(estado.sessao?.nome || 'Contabilidade')}<br>Contabilidade</div></td><td><div class="doc-linha-ass">Ordenador da despesa</div></td></tr></table>
    </div></div>`;
  return { titulo: 'Ficha de conferência fiscal' };
}
