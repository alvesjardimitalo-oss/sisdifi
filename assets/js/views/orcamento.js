// SISDIFI — Orçamento das secretarias: PDFs liberados pela Contabilidade e consultor de fichas/fontes
import * as db from '../db.js';
import { estado, pode, ehSecretaria, secretariaNome } from '../estado.js';
import { esc, $, $$, toast, modal, confirmar, lerForm, mensagemErro, normalizar, dataBR } from '../ui.js';
import { aguardando, cabecalho, opcoesSecretarias } from './comum.js';
import { extrairLinhas, analisarOrcamento, ehDiaria } from '../orcamento-pdf.js';

const filtro = { secretaria: '', busca: '', soDiarias: false };
const moedaBR = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MAX_MB = 15;

export function fichasDaSecretaria(secId) {
  return estado.fichas.filter(f => f.secretaria_id === secId && f.ativo !== false)
    .sort((a, b) => (b.ano || 0) - (a.ano || 0) || String(a.ficha).localeCompare(String(b.ficha), 'pt-BR', { numeric: true }) || String(a.fonte).localeCompare(String(b.fonte)));
}

/** Fichas do orçamento mais recente (as sem ano, cadastradas à mão, sempre entram). */
export function fichasVigentes(secId) {
  const todas = fichasDaSecretaria(secId);
  const ano = Math.max(0, ...todas.map(f => Number(f.ano) || 0));
  return todas.filter(f => !f.ano || Number(f.ano) === ano);
}

function linhaFicha(f, comAcoes) {
  return `<tr>
    <td><strong>${esc(f.ficha)}</strong></td><td>${esc(f.acao || '')}</td><td>${esc(f.elemento || '')}</td>
    <td>${esc(f.fonte || '')}</td><td>${esc(f.descricao || '')}${f.ano ? `<small class="muted bloco">Orçamento ${esc(f.ano)}</small>` : ''}</td>
    <td class="num">${f.autorizado !== undefined ? moedaBR(f.autorizado) : '—'}</td>
    ${comAcoes ? `<td class="acoes-linha"><button class="btn btn-sec btn-peq" data-ed-ficha="${esc(f.id)}">✎</button><button class="btn btn-perigo btn-peq" data-del-ficha="${esc(f.id)}">✕</button></td>` : ''}
  </tr>`;
}

export function telaOrcamento(el) {
  if (aguardando(el, ['secretarias', 'fichas', 'orcamentos'])) return { viva: true, titulo: 'Orçamento' };
  const gestor = pode.contabil();
  const sec = ehSecretaria() ? estado.sessao.secretaria_id : (filtro.secretaria || estado.secretarias.find(s => s.ativo !== false)?.id || '');
  filtro.secretaria = sec;
  const docs = estado.orcamentos.filter(o => o.secretaria_id === sec).sort((a, b) => (b.ano || 0) - (a.ano || 0) || String(b.titulo).localeCompare(String(a.titulo)));
  const termo = normalizar(filtro.busca);
  const fichas = fichasDaSecretaria(sec).filter(f => (!filtro.soDiarias || ehDiaria(f)) && (!termo || normalizar(`${f.ficha} ${f.acao} ${f.elemento} ${f.fonte} ${f.descricao}`).includes(termo)));

  el.innerHTML = `
    ${cabecalho('Orçamento' + (ehSecretaria() ? ' da ' + (estado.sessao.secretaria_nome || secretariaNome(sec)) : ''), '',
      ehSecretaria() ? 'Documentos do orçamento da sua pasta e fichas/fontes disponíveis para as solicitações de diária.' : 'Libere o orçamento de cada secretaria e cadastre as fichas e fontes que ela pode usar.')}
    ${ehSecretaria() ? '' : `<form class="filtros" id="f-orc"><label class="campo cresce"><span>Secretaria</span><select name="secretaria">${opcoesSecretarias(sec, { vazio: 'Selecione' })}</select></label></form>`}

    <section class="cartao">
      <div class="cab-secao"><h3>Documentos do orçamento (PDF)</h3>${gestor ? '<button class="btn btn-peq" id="enviar-pdf">⇪ Enviar PDF</button>' : ''}</div>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Documento</th><th>Ano</th><th>Arquivo</th><th>Enviado</th><th></th></tr></thead>
        <tbody>${docs.map(d => `<tr>
          <td><strong>${esc(d.titulo)}</strong>${d.observacao ? `<small class="muted bloco">${esc(d.observacao)}</small>` : ''}</td>
          <td>${esc(d.ano || '')}</td><td>${esc(d.nome_arquivo)} <small class="muted">(${(Number(d.tamanho || 0) / 1048576).toFixed(1).replace('.', ',')} MB)</small></td>
          <td>${esc(d.enviado_por?.nome || '')}<small class="muted bloco">${d.enviado_em?.toDate ? esc(d.enviado_em.toDate().toLocaleDateString('pt-BR')) : ''}</small></td>
          <td class="acoes-linha"><button class="btn btn-peq" data-abrir="${esc(d.id)}">👁 Abrir</button><button class="btn btn-sec btn-peq" data-baixar="${esc(d.id)}">⭳ Baixar</button>
            ${gestor ? `<button class="btn btn-perigo btn-peq" data-excluir-pdf="${esc(d.id)}">✕</button>` : ''}</td></tr>`).join('')
          || `<tr><td colspan="5" class="vazio-linha">${gestor ? 'Nenhum PDF enviado para esta secretaria.' : 'A Contabilidade ainda não liberou o orçamento da sua pasta.'}</td></tr>`}</tbody>
      </table></div>
    </section>

    <section class="cartao">
      <div class="cab-secao"><h3>Fichas e fontes de recurso</h3>
        ${gestor ? '<span><button class="btn btn-peq" id="importar-orc">📄 Ler PDFs do orçamento</button> <button class="btn btn-sec btn-peq" id="colar-fichas">📋 Colar do Excel</button> <button class="btn btn-sec btn-peq" id="nova-ficha">＋ Nova ficha</button></span>' : ''}</div>
      <p class="dica">${ehSecretaria() ? 'Use esta tabela para escolher a ficha e a fonte de recurso ao solicitar uma diária (botão "Consultar fichas" no formulário).' : 'Estas fichas aparecem para a secretaria no formulário de solicitação, em "Consultar fichas".'}</p>
      <div class="filtros"><label class="campo cresce"><span>Buscar</span><input type="search" id="busca-ficha" value="${esc(filtro.busca)}" placeholder="Ficha, ação, elemento, fonte ou descrição"></label>
        <label class="check"><input type="checkbox" id="so-diarias" ${filtro.soDiarias ? 'checked' : ''}> Somente diárias (3.3.90.14)</label></div>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Ficha</th><th>Ação / Projeto</th><th>Elemento de despesa</th><th>Fonte de recurso</th><th>Unidade / uso</th><th class="num">Autorizado</th>${gestor ? '<th></th>' : ''}</tr></thead>
        <tbody>${fichas.map(f => linhaFicha(f, gestor)).join('') || `<tr><td colspan="${gestor ? 7 : 6}" class="vazio-linha">Nenhuma ficha cadastrada.</td></tr>`}</tbody>
      </table></div>
    </section>`;

  $('#f-orc', el)?.addEventListener('change', e => { filtro.secretaria = e.currentTarget.secretaria.value; telaOrcamento(el); });
  let t;
  $('#busca-ficha', el).oninput = e => { clearTimeout(t); t = setTimeout(() => { filtro.busca = e.target.value; const pos = e.target.selectionStart; telaOrcamento(el); const n = $('#busca-ficha', el); n.focus(); n.setSelectionRange(pos, pos); }, 250); };
  $('#so-diarias', el).onchange = e => { filtro.soDiarias = e.target.checked; telaOrcamento(el); };
  $$('[data-abrir]', el).forEach(b => b.onclick = () => abrirPDF(b.dataset.abrir, false));
  $$('[data-baixar]', el).forEach(b => b.onclick = () => abrirPDF(b.dataset.baixar, true));
  if (gestor) {
    $('#enviar-pdf', el).onclick = () => sec ? formPDF(sec) : toast('Selecione a secretaria.', 'erro');
    $('#nova-ficha', el).onclick = () => sec ? formFicha(sec, null) : toast('Selecione a secretaria.', 'erro');
    $('#importar-orc', el).onclick = () => importarPDFsOrcamento();
    $('#colar-fichas', el).onclick = () => sec ? colarFichas(sec) : toast('Selecione a secretaria.', 'erro');
    $$('[data-ed-ficha]', el).forEach(b => b.onclick = () => formFicha(sec, estado.fichas.find(f => f.id === b.dataset.edFicha)));
    $$('[data-del-ficha]', el).forEach(b => b.onclick = async () => {
      const f = estado.fichas.find(x => x.id === b.dataset.delFicha);
      if (!(await confirmar(`Excluir a ficha ${f.ficha}?`, { perigo: true, ok: 'Excluir' }))) return;
      try { await db.excluir('fichas', f.id); await db.registrarLog('ficha.excluir', { ficha: f.ficha, secretaria: secretariaNome(sec) }); } catch (err) { toast(mensagemErro(err), 'erro'); }
    });
    $$('[data-excluir-pdf]', el).forEach(b => b.onclick = async () => {
      const d = estado.orcamentos.find(x => x.id === b.dataset.excluirPdf);
      if (!(await confirmar(`Excluir o documento "${d.titulo}"? A secretaria deixa de vê-lo.`, { perigo: true, ok: 'Excluir' }))) return;
      try { await db.excluirPDF(d.id, d.partes || 1); await db.registrarLog('orcamento.excluir', { titulo: d.titulo, secretaria: secretariaNome(sec) }); toast('Documento excluído.'); } catch (err) { toast(mensagemErro(err), 'erro'); }
    });
  }
  return { viva: true, titulo: 'Orçamento' };
}

async function abrirPDF(id, baixar) {
  const d = estado.orcamentos.find(x => x.id === id);
  const janela = baixar ? null : window.open('', '_blank');
  try {
    toast('Carregando documento…');
    const blob = await db.baixarPDF(id, d?.partes || 1);
    const url = URL.createObjectURL(blob);
    if (baixar) {
      const a = document.createElement('a'); a.href = url; a.download = d?.nome_arquivo || 'orcamento.pdf';
      document.body.appendChild(a); a.click(); a.remove();
    } else if (janela) janela.location.href = url;
    else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) { janela && janela.close(); toast('Não foi possível abrir o documento: ' + mensagemErro(err), 'erro'); }
}

function formPDF(sec) {
  const m = modal({
    titulo: 'Enviar orçamento — ' + secretariaNome(sec), largura: 560,
    corpo: `<form id="fpdf" novalidate>
      <label class="campo"><span>Título *</span><input name="titulo" required placeholder="Ex.: QDD 2026 — Secretaria de Saúde"></label>
      <div class="grade-2">
        <label class="campo"><span>Ano</span><input type="number" name="ano" value="${new Date().getFullYear()}"></label>
        <label class="campo"><span>Arquivo PDF * (até ${MAX_MB} MB)</span><input type="file" name="arquivo" accept="application/pdf,.pdf" required></label>
      </div>
      <label class="campo"><span>Observação</span><input name="observacao" maxlength="200" placeholder="Ex.: atualizado após suplementação de março"></label>
      <p class="erro-form" id="erro-pdf"></p><div id="prog-pdf"></div>
      <div class="acoes-form"><button type="button" class="btn btn-sec" data-cancelar>Cancelar</button><button class="btn" type="submit">Enviar</button></div>
    </form>`
  });
  const f = $('#fpdf', m.el);
  f.querySelector('[data-cancelar]').onclick = m.fechar;
  f.onsubmit = async e => {
    e.preventDefault();
    const arq = f.arquivo.files[0], erro = $('#erro-pdf', m.el);
    if (!f.titulo.value.trim()) return (erro.textContent = 'Informe o título.');
    if (!arq) return (erro.textContent = 'Escolha o arquivo PDF.');
    if (!/\.pdf$/i.test(arq.name) && arq.type !== 'application/pdf') return (erro.textContent = 'O arquivo precisa ser PDF.');
    if (arq.size > MAX_MB * 1048576) return (erro.textContent = `O arquivo tem mais de ${MAX_MB} MB. Reduza o PDF (ex.: "Salvar como PDF" de novo, ou compressão) e tente outra vez.`);
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      await db.enviarPDF({ secretaria_id: sec, titulo: f.titulo.value.trim(), ano: Number(f.ano.value) || null, observacao: f.observacao.value.trim() }, arq,
        (i, n) => { $('#prog-pdf', m.el).innerHTML = `<progress max="${n}" value="${i}"></progress> ${i}/${n}`; });
      await db.registrarLog('orcamento.enviar', { titulo: f.titulo.value.trim(), secretaria: secretariaNome(sec) });
      toast('Orçamento liberado para a secretaria.');
      m.fechar();
    } catch (err) { erro.textContent = mensagemErro(err); btn.disabled = false; }
  };
}

function formFicha(sec, fi) {
  const m = modal({
    titulo: (fi ? 'Editar' : 'Nova') + ' ficha — ' + secretariaNome(sec), largura: 620,
    corpo: `<form id="ffi" class="grade-2" novalidate>
      <label class="campo"><span>Ficha *</span><input name="ficha" value="${esc(fi?.ficha || '')}" required></label>
      <label class="campo"><span>Fonte de recurso *</span><input name="fonte" value="${esc(fi?.fonte || '')}" required placeholder="Ex.: 1500 — Recursos não vinculados"></label>
      <label class="campo span-2"><span>Ação / Projeto / Atividade</span><input name="acao" value="${esc(fi?.acao || '')}" placeholder="Ex.: 2.045 — Manutenção da Secretaria de Saúde"></label>
      <label class="campo"><span>Elemento de despesa</span><input name="elemento" value="${esc(fi?.elemento || '')}" placeholder="Ex.: 3.3.90.14 — Diárias civil"></label>
      <label class="campo"><span>Uso / descrição</span><input name="descricao" value="${esc(fi?.descricao || '')}" placeholder="Ex.: diárias de motoristas (TFD)"></label>
      <p class="erro-form span-2" id="erro-fi"></p>
      <div class="acoes-form span-2"><button type="button" class="btn btn-sec" data-cancelar>Cancelar</button><button class="btn" type="submit">Salvar</button></div>
    </form>`
  });
  const f = $('#ffi', m.el);
  f.querySelector('[data-cancelar]').onclick = m.fechar;
  f.onsubmit = async e => {
    e.preventDefault();
    const d = lerForm(f);
    if (!d.ficha || !d.fonte) return ($('#erro-fi', m.el).textContent = 'Informe a ficha e a fonte de recurso.');
    try {
      await db.salvar('fichas', fi?.id || null, { ...d, secretaria_id: sec, ativo: true });
      await db.registrarLog(fi ? 'ficha.editar' : 'ficha.criar', { ficha: d.ficha, secretaria: secretariaNome(sec) });
      toast('Ficha salva.'); m.fechar();
    } catch (err) { $('#erro-fi', m.el).textContent = mensagemErro(err); }
  };
}

/** Importação rápida: cola linhas copiadas do Excel (Ficha | Ação | Elemento | Fonte | Descrição). */
function colarFichas(sec) {
  const m = modal({
    titulo: 'Colar fichas do Excel — ' + secretariaNome(sec), largura: 760,
    corpo: `<p>No Excel, organize as colunas nesta ordem e copie as linhas (sem o cabeçalho):<br>
      <code>Ficha</code> · <code>Ação/Projeto</code> · <code>Elemento de despesa</code> · <code>Fonte de recurso</code> · <code>Uso/descrição</code></p>
      <textarea id="txt-fichas" rows="10" placeholder="Cole aqui (Ctrl+V)"></textarea>
      <div id="prev-fichas"></div>
      <div class="acoes-form"><button type="button" class="btn btn-sec" data-cancelar>Cancelar</button><button class="btn" id="imp-fichas" disabled>Importar</button></div>`
  });
  m.el.querySelector('[data-cancelar]').onclick = m.fechar;
  let linhas = [];
  const txt = $('#txt-fichas', m.el);
  txt.oninput = () => {
    linhas = txt.value.split(/\r?\n/).map(l => l.split(l.includes('\t') ? '\t' : ';').map(c => c.trim())).filter(c => c[0]);
    $('#prev-fichas', m.el).innerHTML = linhas.length ? `<p class="muted">${linhas.length} ficha(s) reconhecida(s):</p><div class="tabela-wrap"><table class="tabela tabela-peq">
      <thead><tr><th>Ficha</th><th>Ação</th><th>Elemento</th><th>Fonte</th><th>Uso</th></tr></thead>
      <tbody>${linhas.slice(0, 50).map(c => `<tr>${[0, 1, 2, 3, 4].map(i => `<td>${esc(c[i] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    $('#imp-fichas', m.el).disabled = !linhas.length;
  };
  $('#imp-fichas', m.el).onclick = async () => {
    const existentes = new Map(fichasDaSecretaria(sec).map(f => [String(f.ficha), f.id]));
    try {
      for (const c of linhas) {
        const dados = { ficha: c[0], acao: c[1] || '', elemento: c[2] || '', fonte: c[3] || '', descricao: c[4] || '', secretaria_id: sec, ativo: true };
        await db.salvar('fichas', existentes.get(String(c[0])) || null, dados);
      }
      await db.registrarLog('ficha.importar', { quantidade: linhas.length, secretaria: secretariaNome(sec) });
      toast(`${linhas.length} ficha(s) importada(s).`); m.fechar();
    } catch (err) { toast(mensagemErro(err), 'erro'); }
  };
}

// ---------- Leitura automática dos PDFs do orçamento (Demonstrativo da Despesa Fixada) ----------
const PALAVRAS_VAZIAS = new Set(['secretaria', 'secetaria', 'municipal', 'fundo', 'de', 'da', 'do', 'das', 'dos', 'e']);
const tokens = t => normalizar(t).split(/[^a-z0-9]+/).filter(x => x.length > 1 && !PALAVRAS_VAZIAS.has(x));

/** Secretaria do sistema que corresponde ao PDF: primeiro pelo código já associado, depois pelo nome. */
export function sugerirSecretaria(an, secretarias) {
  const unid = an.unidades[0]?.codigo || '';
  const org = an.orgao?.codigo || unid.slice(0, 5);
  const ativas = secretarias.filter(s => s.ativo !== false);
  const porCodigo = ativas.find(s => (s.unidades_orcamento || []).includes(unid)) ||
    ativas.find(s => org && (s.unidades_orcamento || []).some(u => u.startsWith(org + '.')));
  if (porCodigo) return porCodigo.id;
  let texto = ' ' + tokens([an.orgao?.nome, ...an.unidades.map(u => u.nome)].join(' ')).join(' ') + ' ';
  if (/ acao social /.test(texto)) texto += ' assistencia social ';
  let melhor = null, pts = 0;
  for (const s of ativas) {
    const tk = tokens(s.nome);
    if (tk.length && tk.every(t => texto.includes(' ' + t.slice(0, 5))) && tk.length > pts) { melhor = s.id; pts = tk.length; }
  }
  return melhor;
}

/** Nome proposto para criar uma secretaria que ainda não existe no sistema. */
export function nomeProposto(an) {
  const bruto = an.orgao?.nome || an.unidades[0]?.nome || '';
  const sem = bruto.replace(/^SEC[RE]*TARIA\s+(MUNICIPAL\s+)?(D[AEO]S?\s+)?/i, '').trim() || bruto;
  return sem.toLowerCase().split(/\s+/).map((w, i) => i && ['de', 'da', 'do', 'das', 'dos', 'e'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Monta os registros de fichas (um por ficha × fonte) com id fixo: reimportar atualiza em vez de duplicar. */
export function fichasDoOrcamento(an, secId, { soDiarias = false, ano = an.ano } = {}) {
  return an.fichas.filter(f => !soDiarias || ehDiaria(f)).map(f => ({
    colecao: 'fichas',
    id: `orc-${ano || 'sa'}-${secId}-${f.ficha}-${f.fonte_codigo.replace(/\D/g, '')}`,
    dados: {
      secretaria_id: secId, ativo: true, origem: 'pdf', ano: ano || null,
      ficha: f.ficha, unidade: f.unidade, descricao: f.unidade_nome,
      acao: `${f.acao_codigo} — ${f.acao_nome}`, acao_codigo: f.acao_codigo,
      elemento: `${f.elemento_codigo} — ${f.elemento_nome}`, elemento_codigo: f.elemento_codigo,
      fonte: `${f.fonte_codigo} — ${f.fonte_nome}`, fonte_codigo: f.fonte_codigo,
      autorizado: f.autorizado, autorizado_ficha: f.autorizado_ficha,
      importado_em: new Date().toISOString()
    }
  }));
}

function importarPDFsOrcamento() {
  const m = modal({
    titulo: 'Ler PDFs do orçamento', largura: 980,
    corpo: `<p>Escolha um ou mais PDFs do <strong>Demonstrativo da Despesa Fixada</strong> (pode selecionar todos de uma vez).
      O sistema lê as fichas, as fontes de recurso e os valores autorizados e sugere a secretaria de cada arquivo.</p>
      <label class="campo"><span>Arquivos PDF</span><input type="file" id="orc-arqs" accept="application/pdf,.pdf" multiple></label>
      <div id="orc-prev"></div>
      <div id="orc-opcoes" hidden>
        <label class="check"><input type="checkbox" id="orc-enviar" checked> Liberar também o PDF para a secretaria (aparece em Orçamento)</label>
        <label class="check"><input type="checkbox" id="orc-sodiarias"> Importar somente as fichas de diárias (3.3.90.14)</label>
      </div>
      <p class="erro-form" id="orc-erro"></p><div id="orc-prog"></div>
      <div class="acoes-form"><button type="button" class="btn btn-sec" data-cancelar>Cancelar</button><button class="btn" id="orc-importar" disabled>Importar</button></div>`
  });
  m.el.querySelector('[data-cancelar]').onclick = m.fechar;
  let itens = [];
  const opcoesSec = (sel, proposto) => `<option value="">— não importar —</option>
    ${estado.secretarias.filter(s => s.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(s => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}
    <option value="__nova" ${sel === '__nova' ? 'selected' : ''}>＋ Criar secretaria "${esc(proposto)}"</option>`;
  const desenhar = () => {
    $('#orc-prev', m.el).innerHTML = itens.length ? `<div class="tabela-wrap"><table class="tabela tabela-peq">
      <thead><tr><th>Arquivo</th><th>Unidade orçamentária</th><th class="num">Fichas</th><th class="num">De diárias</th><th>Secretaria no sistema</th></tr></thead>
      <tbody>${itens.map((it, i) => `<tr>
        <td>${esc(it.arquivo.name)}${it.erro ? `<small class="erro-form bloco">${esc(it.erro)}</small>` : ''}${it.an?.avisos.length ? `<small class="muted bloco">⚠ ${esc(it.an.avisos.join(' '))}</small>` : ''}</td>
        <td>${it.an ? esc(it.an.unidades.map(u => u.codigo + ' ' + u.nome).join(', ') || '—') + (it.an.ano ? `<small class="muted bloco">Orçamento ${it.an.ano}</small>` : '') : '…'}</td>
        <td class="num">${it.an ? new Set(it.an.fichas.map(f => f.ficha)).size : ''}</td>
        <td class="num">${it.an ? new Set(it.an.fichas.filter(ehDiaria).map(f => f.ficha)).size : ''}</td>
        <td>${it.an ? `<select data-sec="${i}">${opcoesSec(it.sec, it.proposto)}</select>
          <input data-nome="${i}" value="${esc(it.proposto)}" placeholder="Nome da nova secretaria" ${it.sec === '__nova' ? '' : 'hidden'}>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>` : '';
    $$('[data-sec]', m.el).forEach(sel => sel.onchange = () => { itens[sel.dataset.sec].sec = sel.value; desenhar(); });
    $$('[data-nome]', m.el).forEach(inp => inp.oninput = () => { itens[inp.dataset.nome].proposto = inp.value; });
    $('#orc-opcoes', m.el).hidden = !itens.some(it => it.an);
    $('#orc-importar', m.el).disabled = !itens.some(it => it.an && it.sec);
  };
  $('#orc-arqs', m.el).onchange = async e => {
    itens = [...e.target.files].map(arquivo => ({ arquivo, an: null, sec: '', proposto: '' }));
    $('#orc-erro', m.el).textContent = '';
    desenhar();
    for (const it of itens) {
      try {
        if (it.arquivo.size > MAX_MB * 1048576) throw new Error(`arquivo com mais de ${MAX_MB} MB`);
        const an = analisarOrcamento(await extrairLinhas(await it.arquivo.arrayBuffer()));
        if (!an.fichas.length) throw new Error('não reconheci fichas neste PDF (é o "Demonstrativo da Despesa Fixada"?)');
        it.an = an; it.proposto = nomeProposto(an);
        it.sec = sugerirSecretaria(an, estado.secretarias) || '__nova';
      } catch (err) { it.erro = /import|fetch|module/i.test(String(err?.message)) ? 'Não foi possível carregar o leitor de PDF (verifique a internet).' : (err?.message || String(err)); }
      desenhar();
    }
  };
  $('#orc-importar', m.el).onclick = async () => {
    const btn = $('#orc-importar', m.el); btn.disabled = true;
    const enviar = $('#orc-enviar', m.el).checked, soDiarias = $('#orc-sodiarias', m.el).checked;
    const prog = t => { $('#orc-prog', m.el).textContent = t; };
    const criadas = new Map(), unidadesPorSec = new Map();
    let nFichas = 0, nPdfs = 0;
    try {
      for (const it of itens.filter(x => x.an && x.sec)) {
        let secId = it.sec;
        if (secId === '__nova') {
          const nome = it.proposto.trim();
          if (!nome) throw new Error(`Informe o nome da secretaria para ${it.arquivo.name}.`);
          const chave = normalizar(nome);
          secId = criadas.get(chave) || estado.secretarias.find(s => normalizar(s.nome) === chave)?.id;
          if (!secId) {
            secId = await db.salvar('secretarias', null, { nome, ativo: true });
            criadas.set(chave, secId);
            await db.registrarLog('secretaria.criar', { nome, origem: 'orçamento PDF' });
          }
        }
        prog(`Gravando ${it.arquivo.name}…`);
        if (!unidadesPorSec.has(secId)) unidadesPorSec.set(secId, new Set(estado.secretarias.find(s => s.id === secId)?.unidades_orcamento || []));
        const codigos = unidadesPorSec.get(secId), antes = codigos.size;
        it.an.unidades.forEach(u => codigos.add(u.codigo));
        if (codigos.size !== antes) await db.salvar('secretarias', secId, { unidades_orcamento: [...codigos].sort() });
        const ops = fichasDoOrcamento(it.an, secId, { soDiarias });
        const falhas = await db.gravarEmLote(ops);
        if (falhas.length) throw new Error(`${falhas.length} ficha(s) de ${it.arquivo.name} não foram gravadas.`);
        nFichas += ops.length;
        if (enviar) {
          const unidade = it.an.unidades.map(u => u.nome).join(', ');
          await db.enviarPDF({ secretaria_id: secId, titulo: `Orçamento ${it.an.ano || ''} — ${unidade}`.replace('  ', ' '), ano: it.an.ano || null,
            observacao: 'Demonstrativo da Despesa Fixada' }, it.arquivo, (i, n) => prog(`Enviando ${it.arquivo.name} (${i}/${n})…`));
          nPdfs++;
        }
      }
      await db.registrarLog('orcamento.importar_pdf', { arquivos: itens.filter(x => x.an && x.sec).length, fichas: nFichas, pdfs: nPdfs });
      toast(`${nFichas} ficha(s)/fonte(s) importada(s)${nPdfs ? ` e ${nPdfs} PDF(s) liberado(s)` : ''}.`);
      m.fechar();
    } catch (err) { $('#orc-erro', m.el).textContent = mensagemErro(err); btn.disabled = false; prog(''); }
  };
}

/** Janela "Consultar fichas" usada no formulário da solicitação. Chama aoEscolher(ficha). */
export function consultarFichas(secId, aoEscolher) {
  const lista = fichasVigentes(secId);
  const temDiarias = lista.some(ehDiaria);
  const m = modal({
    titulo: 'Fichas e fontes — ' + (secretariaNome(secId) || 'secretaria'), largura: 860,
    corpo: `${lista.length ? `<div class="filtros"><label class="campo cresce"><span>Buscar</span><input type="search" id="bf" placeholder="Ficha, ação, elemento, fonte ou uso"></label>
        ${temDiarias ? '<label class="check"><input type="checkbox" id="bf-diarias" checked> Somente fichas de diárias (3.3.90.14)</label>' : ''}</div>` : ''}
      <div id="lf"></div>
      ${estado.orcamentos.some(o => o.secretaria_id === secId) ? '<p class="dica">O PDF completo do orçamento está no menu <a href="#/orcamento">Orçamento</a>.</p>' : ''}`
  });
  const desenhar = () => {
    const t = normalizar($('#bf', m.el)?.value || '');
    const soDiarias = $('#bf-diarias', m.el)?.checked;
    const l = lista.filter(f => (!soDiarias || ehDiaria(f)) && (!t || normalizar(`${f.ficha} ${f.acao} ${f.elemento} ${f.fonte} ${f.descricao}`).includes(t)));
    $('#lf', m.el).innerHTML = l.length ? `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Ficha</th><th>Ação</th><th>Elemento</th><th>Fonte</th><th>Unidade / uso</th><th></th></tr></thead>
      <tbody>${l.map(f => `<tr><td><strong>${esc(f.ficha)}</strong></td><td>${esc(f.acao || '')}</td><td>${esc(f.elemento || '')}</td><td>${esc(f.fonte)}</td><td>${esc(f.descricao || '')}</td>
        <td><button type="button" class="btn btn-peq" data-usar="${esc(f.id)}">Usar</button></td></tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">${lista.length ? 'Nenhuma ficha encontrada com esse filtro.' : 'Nenhuma ficha cadastrada para esta secretaria. Peça à Contabilidade para cadastrar em Orçamento.'}</p>`;
    $$('[data-usar]', m.el).forEach(b => b.onclick = () => { aoEscolher(lista.find(f => f.id === b.dataset.usar)); m.fechar(); });
  };
  $('#bf', m.el)?.addEventListener('input', desenhar);
  $('#bf-diarias', m.el)?.addEventListener('change', desenhar);
  desenhar();
}
