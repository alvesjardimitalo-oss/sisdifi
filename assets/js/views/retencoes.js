// SISDIFI — Retenções nas transferências (FPM, ITR, IPI, LC 176).
// A Contabilidade sobe o extrato da conta do FPM e a consulta do DAF (Banco do Brasil); o sistema separa
// PASEP, EMATER, CISDOCE, ARDOCE, AMM e CNM, numera cada retenção e emite o comprovante para anexar na liquidação.
// Dados em retencoes_anos/{ano} — leitura e escrita só para ADM e Contabilidade (firestore.rules).
import * as db from '../db.js';
import { estado, pode } from '../estado.js';
import { esc, modal, confirmar, toast, mensagemErro, hojeISO, baixarArquivo, csv } from '../ui.js';
import {
  ORIGENS, RUBRICAS, CODIGOS_RUBRICA, dinheiro, dataBR, decendioDe, textoDecendio, lerArquivo, lerExtratoTexto, lerPlanilhaIPI, movimentosIPI, proporLancamentos,
  validarLancamento, centavosDe, VALOR_RATEIO_CISDOCE, empenhoPadrao, CHAVES_EMPENHO, historicoContabil, ordemCronologica, linhasExtrato, renumerarPorData, foraDeOrdem, situacao, lancamentosAtivos, resumo, comprovanteHTML, demonstrativoHTML, linhasCSV
} from '../retencoes.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const CONFIG_PADRAO = { cnpj: '', responsavel: '', cargo: 'Contador(a)', contas: {}, credores: {}, rateio_cisdoce_centavos: VALOR_RATEIO_CISDOCE, empenhos: {} };

const estilo = '<style>' +
'.ret{max-width:1280px;margin:0 auto;color:#21374d}.ret *{box-sizing:border-box}.ret h1{margin:0 0 4px;color:#153d61;font-size:1.6rem}.ret .r-muted{color:#617384;font-size:.88rem;margin:0}' +
'.ret .r-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;justify-content:space-between;margin:16px 0}.ret .r-grupo{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}' +
'.ret .r-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:10px 0}.ret .r-kpi{background:#fff;border:1px solid #dce6ef;border-radius:11px;padding:14px}.ret .r-kpi small{display:block;color:#587081;font-size:.76rem;margin-bottom:5px}.ret .r-kpi strong{font-size:1.3rem;color:#174368}' +
'.ret .r-box{background:#fff;border:1px solid #d8e3ed;border-radius:12px;padding:14px;margin:12px 0}.ret .r-tab{overflow-x:auto}.ret table{border-collapse:collapse;width:100%;min-width:900px}.ret th{background:#eef4fa;font-size:.72rem;text-transform:uppercase;color:#506e83;letter-spacing:.3px}.ret td,.ret th{padding:8px;border-bottom:1px solid #e3eaf0;text-align:left;vertical-align:top}' +
'.ret .v{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.ret .r-et{display:inline-block;border-radius:999px;padding:2px 9px;font-size:.74rem;font-weight:700;background:#fff3d8;color:#835615;white-space:nowrap}.ret .r-et.ok{background:#e8f5ec;color:#276846}.ret .r-et.azul{background:#e6f0fa;color:#1f5582}.ret .r-et.cinza{background:#eceff2;color:#66737f}' +
'.ret .r-acoes{display:flex;gap:5px;flex-wrap:wrap}.ret tr.r-dia td{background:#f2f8f3;font-weight:700;color:#1b5c39;font-size:.82rem;border-bottom:2px solid #cfe3d5}.ret .r-hist{display:flex;gap:6px;align-items:center;margin-top:4px;font:600 .74rem/1.3 "Courier New",monospace;color:#1d4f75}.ret .r-hist button{border:1px solid #b9cbd9;background:#f3f8fc;border-radius:5px;padding:2px 7px;font:600 .72rem Arial;color:#1d4f75;cursor:pointer;white-space:nowrap}.ret .r-alerta{border-left:4px solid #c88e38;background:#fff8e8;color:#76551e;border-radius:5px;padding:10px 12px;margin:8px 0}.ret .r-anulado td{color:#8a97a3;text-decoration:line-through}.ret .r-resumo{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.ret .r-resumo span{background:#f3f7fb;border-radius:8px;padding:6px 10px;font-size:.85rem}' +
'.r-prev{overflow:auto;max-height:55vh}.r-prev table{border-collapse:collapse;width:100%;font-size:.86rem}.r-prev td,.r-prev th{padding:5px;border-bottom:1px solid #e3eaf0;text-align:left;vertical-align:top}.r-prev th{background:#eef4fa;position:sticky;top:0}.r-prev select,.r-prev input{font-size:.85rem;padding:3px;max-width:150px}.r-prev .aviso{color:#8a5a12;font-size:.78rem;display:block}.r-prev tr.dup{background:#f6f6f6;color:#7d8790}' +
'.r-grade{display:grid;grid-template-columns:1fr 160px;gap:6px 12px;align-items:center}.r-grade label{font-weight:600}' +
'@media(max-width:760px){.ret .r-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
'</style>';

export function telaRetencoes(el) {
  if (!pode.contabil()) return { titulo: 'Acesso restrito' };
  let ano = Number(estado.exercicio) || new Date().getFullYear();
  let mes = String(new Date().getMonth() + 1).padStart(2, '0');
  let filtroOrigem = '', filtroRubrica = '', filtroSituacao = '', busca = '';
  let documento = null, config = { ...CONFIG_PADRAO }, cancelou = false, desinscrever = null, desConfig = null, erro = '', carregando = true;
  const selecionados = new Set();
  const $ = s => el.querySelector(s);
  const anos = Array.from({ length: 8 }, (_, i) => ano + 1 - i);

  el.innerHTML = estilo + `<section class="ret">
    <h1>Retenções nas transferências</h1>
    <p class="r-muted">PASEP pela consulta do DAF (FPM ${ORIGENS.FPM.conta}, ITR ${ORIGENS.ITR.conta}, IPI ${ORIGENS.IPI.conta}, FEP e LC 176); EMATER, CISDOCE, ARDOCE, AMM e CNM pelo extrato da conta do FPM (CSV, OFX, PDF ou scan). Suba os arquivos, confira e gere o comprovante para anexar na liquidação do empenho.</p>
    <div class="r-bar">
      <div class="r-grupo">
        <button class="btn" id="r-imp-fpm" disabled>⬆ Extrato da conta do FPM</button>
        <button class="btn" id="r-imp-daf" disabled>⬆ Consulta do DAF (BB)</button>
        <button class="btn" id="r-imp-ipi" disabled>⬆ Planilha do IPI (SEF-MG)</button>
        <button class="btn btn-sec" id="r-decendio" disabled>+ Lançar decêndio</button>
        <button class="btn btn-sec" id="r-avulso" disabled>+ Lançamento avulso</button>
        <input type="file" id="r-arquivo" accept=".csv,.txt,.ofx,.pdf,.xlsx,image/*,text/csv,application/pdf" hidden>
      </div>
      <div class="r-grupo">
        <button class="btn btn-sec" id="r-config" disabled>Configurar</button>
        <a class="btn btn-sec" href="https://demonstrativos.apps.bb.com.br/arrecadacao-federal" target="_blank" rel="noopener noreferrer">Abrir DAF no BB ↗</a>
        <a class="btn btn-sec" href="https://www.fazenda.mg.gov.br/governo/assuntos_municipais/previsao_repasses/previsao_repasse_IPI/repasse_decendial/" target="_blank" rel="noopener noreferrer">Planilhas IPI SEF-MG ↗</a>
      </div>
    </div>
    <div class="r-bar">
      <div class="r-grupo">
        <label class="campo"><span>Exercício</span><select id="r-ano">${anos.map(a => `<option ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label class="campo"><span>Mês</span><select id="r-mes"><option value="">Todos</option>${MESES.map((n, i) => { const v = String(i + 1).padStart(2, '0'); return `<option value="${v}" ${v === mes ? 'selected' : ''}>${n}</option>`; }).join('')}</select></label>
        <label class="campo"><span>Fundo</span><select id="r-origem"><option value="">Todos</option>${Object.entries(ORIGENS).map(([k, o]) => `<option value="${k}">${esc(o.sigla)}</option>`).join('')}</select></label>
        <label class="campo"><span>Retenção</span><select id="r-rubrica"><option value="">Todas</option>${CODIGOS_RUBRICA.map(k => `<option value="${k}">${esc(RUBRICAS[k].nome)}</option>`).join('')}</select></label>
        <label class="campo"><span>Situação</span><select id="r-sit"><option value="">Todas</option><option>Aguardando empenho</option><option>Empenhado</option><option>Liquidado</option><option>Anulado</option></select></label>
        <label class="campo"><span>Buscar</span><input id="r-busca" placeholder="nº, empenho, histórico"></label>
      </div>
    </div>
    <p id="r-status" class="r-muted" role="status" aria-live="polite"></p>
    <div id="r-alerta-emp"></div>
    <div id="r-kpis" class="r-kpis"></div>
    <section class="r-box">
      <div class="r-bar" style="margin:0 0 8px">
        <div class="r-grupo"><button class="btn btn-peq" id="r-comp-sel" disabled>Comprovantes dos selecionados</button>
          <button class="btn btn-sec btn-peq" id="r-emp-sel" disabled>Informar empenho nos selecionados</button>
          <button class="btn btn-sec btn-peq" id="r-emp-padrao">Preencher empenhos padrão</button>
          <button class="btn btn-sec btn-peq" id="r-reordenar" title="Renumera as retenções do exercício pela data do desconto">Reordenar por data</button></div>
        <div class="r-grupo"><button class="btn btn-sec btn-peq" id="r-demo">Extrato do filtro</button><button class="btn btn-sec btn-peq" id="r-csv">Exportar planilha</button></div>
      </div>
      <div id="r-lista" class="r-tab"></div>
      <div id="r-resumo" class="r-resumo"></div>
    </section>
    <p class="r-muted">O comprovante declara que o valor foi retido na fonte pelo agente financeiro, sem saída de numerário: o empenho é liquidado em favor do credor e baixado contra a conta da transferência. A dedução do FUNDEB não é listada nem lançada (é dedução de receita).</p>
  </section>`;

  const contaDe = origem => config.contas?.[origem] || ORIGENS[origem]?.conta || '';
  const credorDe = rubrica => config.credores?.[rubrica] || RUBRICAS[rubrica]?.credor || '';
  const registros = () => lancamentosAtivos(documento);
  function filtrados() {
    const b = busca.toLowerCase();
    return registros().filter(r => (!mes || String(r.data).slice(5, 7) === mes) && (!filtroOrigem || r.origem === filtroOrigem)
      && (!filtroRubrica || r.rubrica === filtroRubrica) && (!filtroSituacao || situacao(r) === filtroSituacao)
      && (!b || [r.numero, r.empenho, r.historico, r.observacao, r.liquidacao].some(x => String(x || '').toLowerCase().includes(b))));
  }
  function botoes() {
    const bloq = carregando || !!erro;
    for (const id of ['r-imp-fpm', 'r-imp-daf', 'r-imp-ipi', 'r-decendio', 'r-avulso', 'r-config']) $('#' + id).disabled = bloq;
    $('#r-comp-sel').disabled = bloq || !selecionados.size;
    $('#r-emp-sel').disabled = bloq || !selecionados.size;
    $('#r-comp-sel').textContent = 'Comprovantes dos selecionados' + (selecionados.size ? ` (${selecionados.size})` : '');
  }
  function render() {
    if (cancelou) return;
    const lista = filtrados();
    const r = resumo(lista);
    $('#r-kpis').innerHTML = [['Total retido no filtro', dinheiro(r.total)], ['Lançamentos', r.quantidade], ['Aguardando empenho', r.pendentes], ['PASEP no filtro', dinheiro(r.porRubrica.PASEP || 0)]]
      .map(([t, v]) => `<div class="r-kpi"><small>${t}</small><strong>${v}</strong></div>`).join('');
    const ids = new Set(lista.map(x => x.id));
    for (const id of [...selecionados]) if (!ids.has(id)) selecionados.delete(id);
    $('#r-lista').innerHTML = lista.length ? `<table><thead><tr><th><input type="checkbox" id="r-todos" aria-label="Selecionar todos"></th><th>Nº</th><th>Data</th><th>Decêndio</th><th>Fundo</th><th>Retenção</th><th class="v">Valor</th><th class="v">Acumulado</th><th>Empenho</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${
      linhasExtrato(lista).map(l => { if (l.tipo === 'dia') return `<tr class="r-dia"><td></td><td colspan="5">Total do dia ${dataBR(l.data)} · ${l.quantidade} retenção(ões)</td><td class="v">${dinheiro(l.total)}</td><td class="v">${dinheiro(l.acumulado)}</td><td colspan="3"></td></tr>`;
        const x = l.r, s = situacao(x); return `<tr class="${x.anulado ? 'r-anulado' : ''}">
        <td>${x.anulado ? '' : `<input type="checkbox" data-sel="${esc(x.id)}" ${selecionados.has(x.id) ? 'checked' : ''} aria-label="Selecionar ${esc(x.numero)}">`}</td>
        <td><strong>${esc(x.numero)}</strong></td><td>${dataBR(x.data)}</td><td>${esc(textoDecendio(x.decendio, x.competencia))}</td>
        <td>${esc(ORIGENS[x.origem]?.sigla || x.origem)}</td><td>${esc(RUBRICAS[x.rubrica]?.nome || x.rubrica)}${x.historico ? `<small class="bloco r-muted">${esc(x.historico)}</small>` : ''}${x.anulado ? '' : `<div class="r-hist"><span>${esc(historicoDe(x))}</span><button type="button" data-copiar="${esc(x.id)}" title="Copiar o histórico para colar no empenho/liquidação">Copiar</button></div>`}</td>
        <td class="v"><strong>${dinheiro(x.centavos)}</strong></td><td class="v r-muted">${x.anulado ? '' : dinheiro(l.acumulado)}</td><td>${esc(x.empenho || '—')}${x.liquidacao ? `<small class="bloco r-muted">liq. ${esc(x.liquidacao)}</small>` : ''}</td>
        <td><span class="r-et ${s === 'Liquidado' ? 'ok' : s === 'Empenhado' ? 'azul' : s === 'Anulado' ? 'cinza' : ''}">${s}</span></td>
        <td><div class="r-acoes">${x.anulado ? '' : `<button class="btn btn-peq" data-comp="${esc(x.id)}">Comprovante</button><button class="btn btn-sec btn-peq" data-editar="${esc(x.id)}">Editar</button><button class="btn btn-sec btn-peq" data-anular="${esc(x.id)}">Anular</button>`}</div></td></tr>`; }).join('')
    }</tbody></table>` : `<p class="r-muted" style="text-align:center;padding:24px">Nenhuma retenção ${mes ? 'em ' + MESES[Number(mes) - 1] + '/' + ano : 'em ' + ano} com esse filtro. Suba o extrato do FPM ou a consulta do DAF.</p>`;
    $('#r-resumo').innerHTML = Object.entries(r.porRubrica).map(([k, v]) => `<span>${esc(RUBRICAS[k]?.nome || k)}: <strong>${dinheiro(v)}</strong></span>`).join('');
    el.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => { c.checked ? selecionados.add(c.dataset.sel) : selecionados.delete(c.dataset.sel); botoes(); });
    const todos = $('#r-todos');
    if (todos) todos.onchange = () => { lista.filter(x => !x.anulado).forEach(x => todos.checked ? selecionados.add(x.id) : selecionados.delete(x.id)); render(); };
    el.querySelectorAll('[data-copiar]').forEach(b => b.onclick = () => copiar(historicoDe(registros().find(x => x.id === b.dataset.copiar)), b));
    alertaEmpenhos();
    el.querySelectorAll('[data-comp]').forEach(b => b.onclick = () => imprimirComprovantes([registros().find(x => x.id === b.dataset.comp)]));
    el.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => editar(registros().find(x => x.id === b.dataset.editar)));
    el.querySelectorAll('[data-anular]').forEach(b => b.onclick = () => anular(registros().find(x => x.id === b.dataset.anular)));
    botoes();
  }

  // ---------- impressão ----------
  function historicoDe(r) { return r ? historicoContabil(r, r.conta || contaDe(r.origem)) : ''; }
  async function copiar(texto, botao) {
    if (!texto) return;
    try { await navigator.clipboard.writeText(texto); }
    catch {
      const t = document.createElement('textarea'); t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* sem cópia */ } t.remove();
    }
    if (botao) { const antes = botao.textContent; botao.textContent = 'Copiado ✓'; setTimeout(() => { botao.textContent = antes; }, 1500); }
    toast('Histórico copiado: ' + texto);
  }
  // Exercício sem empenhos: avisa para cadastrar (cada ano tem empenhos novos)
  const empenhosDoAno = a => ['PASEP', 'EMATER', 'ARDOCE', 'CISDOCE_RATEIO', 'CISDOCE_SERVICOS', 'AMM', 'CNM'].filter(k => !empenhoPadrao(config.empenhos, k, 'FPM', a + '-01-01'));
  function alertaEmpenhos() {
    const box = $('#r-alerta-emp'); if (!box) return;
    const faltam = empenhosDoAno(ano);
    box.innerHTML = faltam.length ? `<div class="r-alerta"><strong>Empenhos de ${ano} não cadastrados</strong> (${faltam.map(k => esc(RUBRICAS[k].nome)).join(', ')}). Cadastre em <a href="#" id="r-ir-config">Configurar</a> antes de lançar — os lançamentos ficam sem empenho até lá.</div>` : '';
    box.querySelector('#r-ir-config')?.addEventListener('click', e => { e.preventDefault(); $('#r-config').click(); });
  }
  function abrirJanela(html) {
    const w = window.open('', '_blank');
    if (!w) { toast('Libere o pop-up para imprimir.', 'erro'); return; }
    w.opener = null; w.document.write(html); w.document.close();
    w.document.getElementById('doc-imprimir')?.addEventListener('click', () => w.print());
    w.document.getElementById('doc-fechar')?.addEventListener('click', () => w.close());
    // espera o brasão carregar antes de abrir a impressão
    const logos = [...w.document.querySelectorAll('img.doc-logo')];
    let feito = false;
    const imprimir = () => { if (feito) return; feito = true; try { w.focus(); w.print(); } catch { /* janela fechada */ } };
    if (logos.length && !logos[0].complete) { logos[0].addEventListener('load', imprimir, { once: true }); logos[0].addEventListener('error', imprimir, { once: true }); setTimeout(imprimir, 1800); }
    else setTimeout(imprimir, 200);
  }
  const cfgImpressao = () => ({ empenhos: config.empenhos, orgao: estado.config?.orgao, cnpj: config.cnpj, responsavel: config.responsavel, cargo: config.cargo,
    logo: new URL('assets/img/brasao.png', document.baseURI).href, geradoEm: new Date().toLocaleString('pt-BR'), geradoPor: estado.sessao?.nome });
  function imprimirComprovantes(lista) {
    const l = lista.filter(Boolean).map(r => ({ ...r, conta: r.conta || contaDe(r.origem), credor: r.credor || credorDe(r.rubrica) }))
      .sort((a, b) => (a.seq || 0) - (b.seq || 0));
    if (!l.length) return;
    abrirJanela(comprovanteHTML(l, cfgImpressao()));
    db.registrarLog('retencoes.comprovante', { ano, numeros: l.map(r => r.numero) }).catch(() => {});
  }

  // ---------- gravação ----------
  const empenhoDe = r => empenhoPadrao(config.empenhos, r.rubrica, r.origem, r.data);
  async function gravarNovos(validos, origemDoLote) {
    for (const v of validos) if (!v.empenho) v.empenho = empenhoDe(v);
    validos.sort(ordemCronologica); // numera na ordem da data do desconto (= data da liquidação)
    const porAno = {};
    for (const v of validos) (porAno[v.data.slice(0, 4)] ||= []).push(v);
    const criados = [];
    for (const [a, lista] of Object.entries(porAno)) criados.push(...await db.lancarRetencoes(a, lista));
    db.registrarLog('retencoes.lancar', { origem: origemDoLote, quantidade: criados.length, total_centavos: criados.reduce((s, r) => s + r.centavos, 0), numeros: criados.map(r => r.numero) }).catch(() => {});
    toast(`${criados.length} retenção(ões) lançada(s): ${criados[0]?.numero}${criados.length > 1 ? ' a ' + criados.at(-1).numero : ''}.`);
    if (criados.some(r => r.data.slice(0, 4) !== String(ano))) toast('Há lançamentos de outro exercício: troque o ano para vê-los.');
    // Lançou data anterior a outras já numeradas: oferece reordenar ANTES de imprimir, para o comprovante sair com o número certo.
    let paraImprimir = criados;
    for (const a of Object.keys(porAno)) {
      const d = await db.lerDoc('retencoes_anos', a).catch(() => null);
      if (!d || !foraDeOrdem(d.lancamentos)) continue;
      if (!await confirmar(`Há retenções de ${a} com data anterior a outras já numeradas. Reordenar a numeração pela data do desconto agora? (comprovantes já impressos de ${a} precisarão ser gerados de novo)`, { titulo: 'Numeração fora da ordem das datas', ok: 'Reordenar', nao: 'Manter' })) continue;
      const n = await db.renumerarRetencoes(a, l => renumerarPorData(l, a));
      db.registrarLog('retencoes.reordenar', { ano: a, alterados: n }).catch(() => {});
      const novo = await db.lerDoc('retencoes_anos', a).catch(() => null);
      if (novo) paraImprimir = paraImprimir.map(r => r.data.startsWith(a) && novo.lancamentos?.[r.id] ? { id: r.id, ...novo.lancamentos[r.id] } : r);
    }
    paraImprimir.sort(ordemCronologica);
    if (await confirmar(`Gerar agora o${criados.length > 1 ? 's' : ''} comprovante${criados.length > 1 ? 's' : ''} de retenção para anexar na liquidação?`, { titulo: 'Lançamentos gravados', ok: 'Gerar comprovantes', nao: 'Depois' }))
      imprimirComprovantes(paraImprimir);
    return paraImprimir;
  }

  // ---------- importação ----------
  let tipoImport = 'fpm';
  $('#r-imp-fpm').onclick = () => { tipoImport = 'fpm'; $('#r-arquivo').multiple = false; $('#r-arquivo').value = ''; $('#r-arquivo').click(); };
  $('#r-imp-daf').onclick = () => { tipoImport = 'daf'; $('#r-arquivo').multiple = false; $('#r-arquivo').value = ''; $('#r-arquivo').click(); };
  $('#r-imp-ipi').onclick = () => { tipoImport = 'ipi'; $('#r-arquivo').multiple = true; $('#r-arquivo').value = ''; $('#r-arquivo').click(); };
  $('#r-arquivo').onchange = async e => {
    if (tipoImport === 'ipi') return importarIPI([...(e.target.files || [])]);
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 25 * 1024 * 1024) return toast('Arquivo grande demais (máx. 25 MB).', 'erro');
    const binario = /\.(pdf|png|jpe?g|webp|bmp|tiff?)$/i.test(f.name) || /^(image\/|application\/pdf)/.test(f.type);
    let movimentos;
    if (binario) {
      if (tipoImport === 'daf') return toast('Para o DAF use o CSV exportado no site do BB (botão de exportar/CSV).', 'erro');
      const aviso = modal({ titulo: 'Lendo o extrato', largura: 440, corpo: '<p id="r-ocr-msg">Abrindo o arquivo…</p><p class="dica">PDF escaneado é lido por reconhecimento de texto no seu computador e pode levar até 1 minuto por página. O extrato salvo direto do site do BB (Imprimir → Salvar como PDF) é lido na hora.</p>' });
      try {
        const { linhasDoExtrato } = await import('../extrato-ocr.js?v=3.18.0');
        const linhas = await linhasDoExtrato(f, t => { const p = document.getElementById('r-ocr-msg'); if (p) p.textContent = t; });
        movimentos = lerExtratoTexto(linhas, { origemPadrao: 'FPM' });
      } catch (err) { aviso.fechar(); return toast('Não foi possível ler o arquivo: ' + mensagemErro(err), 'erro'); }
      aviso.fechar();
    } else {
      let texto = await f.text();
      if (/�/.test(texto)) { try { texto = new TextDecoder('windows-1252').decode(await f.arrayBuffer()); } catch { /* mantém UTF-8 */ } }
      movimentos = lerArquivo(texto, { origemPadrao: tipoImport === 'fpm' ? 'FPM' : '' });
    }
    if (!movimentos.length) return toast('Não encontrei lançamentos com valor nesse arquivo. Confira se é o arquivo certo.', 'erro');
    const propostas = proporLancamentos(movimentos, registros(), { fonte: tipoImport === 'fpm' ? 'extrato' : 'daf', valorRateioCisdoce: Number(config.rateio_cisdoce_centavos) || VALOR_RATEIO_CISDOCE });
    if (!propostas.length) return toast('O arquivo não tem retenções a lançar.', 'erro');
    previa(propostas, f.name);
  };

  // Planilhas decendiais do IPI (SEF-MG): acha a linha do município em cada arquivo e propõe o PASEP do IPI
  async function importarIPI(arquivos) {
    if (!arquivos.length) return;
    const municipio = estado.config?.origem?.cidade || 'Frei Inocêncio';
    const { lerXlsx } = await import('../xlsx-leitor.js?v=3.20.0');
    const movimentos = [], erros = [];
    for (const f of arquivos) {
      try {
        if (!/\.xlsx$/i.test(f.name)) throw Error('use o arquivo .xlsx baixado do site da Fazenda');
        movimentos.push(...movimentosIPI(lerPlanilhaIPI(await lerXlsx(new Uint8Array(await f.arrayBuffer())), municipio)).map(m => ({ ...m, arquivo: f.name })));
      } catch (err) { erros.push(`${f.name}: ${mensagemErro(err)}`); }
    }
    if (erros.length) toast('Não li: ' + erros.join(' · '), 'erro');
    if (!movimentos.length) return;
    const propostas = proporLancamentos(movimentos, registros());
    previa(propostas, arquivos.length === 1 ? arquivos[0].name : arquivos.length + ' planilhas do IPI');
  }

  function previa(propostas, nomeArquivo) {
    const opOrigem = sel => Object.entries(ORIGENS).map(([k, o]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(o.sigla)}</option>`).join('');
    const opRub = sel => `<option value="">— não lançar —</option>` + CODIGOS_RUBRICA.map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(RUBRICAS[k].nome)}</option>`).join('');
    const total = () => propostas.reduce((s, p, i) => s + (m.el.querySelector(`[data-m="${i}"]`)?.checked ? p.centavos : 0), 0);
    const m = modal({
      titulo: tipoImport === 'fpm' ? 'Extrato do FPM — conferir retenções' : tipoImport === 'ipi' ? 'Planilha do IPI (SEF-MG) — conferir PASEP' : 'Consulta do DAF — conferir retenções', largura: 1100,
      corpo: `${(() => { const anos = [...new Set(propostas.filter(p => p.marcado && RUBRICAS[p.rubrica] && !empenhoDe(p)).map(p => String(p.data).slice(0, 4)))]; return anos.length ? `<div class="r-alerta" style="border-left:4px solid #c88e38;background:#fff8e8;color:#76551e;border-radius:5px;padding:10px 12px;margin-bottom:10px">Sem empenho cadastrado para ${anos.join(', ')}: as linhas sem empenho ficarão "Aguardando empenho". Cadastre em Configurar (com esse exercício selecionado) e use "Preencher empenhos padrão".</div>` : ''; })()}<p class="muted">Arquivo <strong>${esc(nomeArquivo)}</strong>: ${propostas.length} linha(s) com valor. Vêm marcadas só as retenções reconhecidas; corrija o fundo ou a rubrica se precisar. Linhas já lançadas ficam desmarcadas.</p>
      ${tipoImport === 'daf' ? `<label class="campo" style="max-width:320px"><span>Fundo para linhas sem fundo identificado</span><select id="rp-origem"><option value="">—</option>${opOrigem('')}</select></label>` : ''}
      <label style="display:inline-flex;gap:6px;align-items:center;margin:4px 0 8px"><input type="checkbox" id="rp-todas"> Mostrar também as ${propostas.filter(p => !p.marcado).length} linha(s) que não serão lançadas (${tipoImport === 'fpm' ? 'PASEP, ' : ''}RFB, estornos, já lançadas)</label>
      <div class="r-prev"><table><thead><tr><th></th><th>Data</th><th>Fundo</th><th>Retenção</th><th style="text-align:right">Valor</th><th>Empenho</th><th>Histórico / avisos</th></tr></thead><tbody>${
        propostas.map((p, i) => `<tr class="${p.duplicado ? 'dup' : ''}" data-linha="${i}" ${p.marcado ? '' : 'hidden'}><td><input type="checkbox" data-m="${i}" ${p.marcado ? 'checked' : ''}></td>
        <td><input type="date" data-d="${i}" value="${esc(p.data)}"></td><td><select data-o="${i}"><option value="">—</option>${opOrigem(p.origem)}</select></td>
        <td><select data-r="${i}">${opRub(RUBRICAS[p.rubrica] ? p.rubrica : '')}</select>${p.rubrica === 'FUNDEB' ? '<span class="aviso">FUNDEB</span>' : ''}</td>
        <td style="text-align:right;white-space:nowrap">${p.sinal === 'D' ? '−' : ''}${dinheiro(p.centavos)}</td>
        <td><input data-e="${i}" maxlength="40" style="max-width:90px" value="${esc(RUBRICAS[p.rubrica] ? empenhoDe(p) : '')}"></td>
        <td>${esc(p.historico || '—')}${p.avisos.map(a => `<span class="aviso">⚠ ${esc(a)}</span>`).join('')}</td></tr>`).join('')
      }</tbody></table></div>
      <p id="rp-total" style="margin:10px 0;font-weight:700"></p>
      <p id="rp-erro" class="erro-form" role="alert"></p>
      <div class="acoes-form"><button class="btn btn-sec" id="rp-cancelar" type="button">Cancelar</button><button class="btn" id="rp-ok" type="button">Lançar marcadas</button></div>`
    });
    const atualizarTotal = () => { const n = propostas.filter((_, i) => m.el.querySelector(`[data-m="${i}"]`).checked).length; m.el.querySelector('#rp-total').textContent = `${n} marcada(s) · ${dinheiro(total())}`; };
    m.el.querySelectorAll('[data-m]').forEach(c => c.onchange = atualizarTotal);
    m.el.querySelector('#rp-todas').onchange = e => m.el.querySelectorAll('[data-linha]').forEach(tr => { tr.hidden = !e.target.checked && !tr.querySelector('[data-m]').checked; });
    if (!propostas.some(p => p.marcado)) { m.el.querySelector('#rp-todas').checked = true; m.el.querySelectorAll('[data-linha]').forEach(tr => { tr.hidden = false; }); }
    const reEmpenho = i => { const e = m.el.querySelector(`[data-e="${i}"]`); e.value = empenhoDe({ rubrica: m.el.querySelector(`[data-r="${i}"]`).value, origem: m.el.querySelector(`[data-o="${i}"]`).value, data: m.el.querySelector(`[data-d="${i}"]`).value }); };
    m.el.querySelectorAll('[data-o],[data-d],[data-r]').forEach(x => x.addEventListener('change', () => reEmpenho(x.dataset.o ?? x.dataset.d ?? x.dataset.r)));
    m.el.querySelectorAll('[data-r]').forEach(s => s.onchange = () => { const c = m.el.querySelector(`[data-m="${s.dataset.r}"]`); if (s.value && !c.checked) c.checked = true; if (!s.value) c.checked = false; atualizarTotal(); });
    m.el.querySelector('#rp-origem')?.addEventListener('change', e => m.el.querySelectorAll('[data-o]').forEach(s => { if (!s.value) s.value = e.target.value; }));
    atualizarTotal();
    m.el.querySelector('#rp-cancelar').onclick = () => m.fechar();
    m.el.querySelector('#rp-ok').onclick = async () => {
      const aviso = m.el.querySelector('#rp-erro'), btn = m.el.querySelector('#rp-ok');
      aviso.textContent = '';
      const validos = [];
      try {
        propostas.forEach((p, i) => {
          if (!m.el.querySelector(`[data-m="${i}"]`).checked) return;
          const origem = m.el.querySelector(`[data-o="${i}"]`).value, rubrica = m.el.querySelector(`[data-r="${i}"]`).value, data = m.el.querySelector(`[data-d="${i}"]`).value;
          try {
            validos.push(validarLancamento({ data, origem, rubrica, centavos: p.centavos, base_centavos: p.base_centavos, historico: p.historico, observacao: p.observacao,
              conta: contaDe(origem), credor: credorDe(rubrica), arquivo: p.arquivo || nomeArquivo, detalhe_ipi: p.detalhe_ipi, empenho: m.el.querySelector(`[data-e="${i}"]`).value }));
          } catch (err) { throw Error(`Linha ${p.linha} (${dinheiro(p.centavos)}): ${err.message}`); }
        });
        if (!validos.length) throw Error('Marque ao menos uma retenção.');
        btn.disabled = true; btn.textContent = 'Lançando…';
        m.fechar();
        await gravarNovos(validos, tipoImport === 'fpm' ? 'extrato_fpm' : tipoImport === 'ipi' ? 'planilha_ipi' : 'daf');
      } catch (err) { aviso.textContent = mensagemErro(err); btn.disabled = false; btn.textContent = 'Lançar marcadas'; if (!aviso.isConnected) toast(mensagemErro(err), 'erro'); }
    };
  }

  // ---------- lançamento do decêndio (grade) ----------
  $('#r-decendio').onclick = () => {
    const m = modal({
      titulo: 'Lançar retenções do decêndio', largura: 560,
      corpo: `<form id="rd-form"><div class="form-grid">
        <label class="campo"><span>Data do crédito/desconto *</span><input type="date" name="data" required value="${hojeISO()}"></label>
        <label class="campo"><span>Fundo *</span><select name="origem">${Object.entries(ORIGENS).map(([k, o]) => `<option value="${k}">${esc(o.sigla)} · conta ${esc(contaDe(k) || 'a configurar')}</option>`).join('')}</select></label>
        <label class="campo"><span>Decêndio</span><select name="decendio"><option value="1">1º</option><option value="2">2º</option><option value="3">3º</option></select></label>
        <label class="campo"><span>Cota bruta (opcional, confere o PASEP)</span><input name="base" inputmode="decimal" placeholder="0,00"></label></div>
        <p class="dica" id="rd-dec"></p>
        <div class="r-grade" id="rd-grade"></div>
        <p id="rd-total" style="font-weight:700"></p><p id="rd-erro" class="erro-form" role="alert"></p>
        <div class="acoes-form"><button class="btn btn-sec" type="button" id="rd-cancelar">Cancelar</button><button class="btn" type="submit">Lançar</button></div></form>`
    });
    const f = m.el.querySelector('#rd-form');
    const grade = () => {
      const o = f.origem.value;
      const ant = Object.fromEntries([...f.querySelectorAll('[data-v]')].map(i => [i.dataset.v, i.value]));
      m.el.querySelector('#rd-grade').innerHTML = CODIGOS_RUBRICA.filter(k => k !== 'OUTRA' && RUBRICAS[k].origens.includes(o))
        .map(k => `<label for="rd-${k}">${esc(RUBRICAS[k].nome)}</label><input id="rd-${k}" data-v="${k}" inputmode="decimal" placeholder="0,00" value="${esc(ant[k] || '')}">`).join('');
      m.el.querySelectorAll('[data-v]').forEach(i => i.oninput = soma);
      soma();
    };
    const soma = () => { let t = 0; try { m.el.querySelectorAll('[data-v]').forEach(i => t += centavosDe(i.value)); m.el.querySelector('#rd-total').textContent = 'Total: ' + dinheiro(t); } catch { m.el.querySelector('#rd-total').textContent = 'Valor inválido em algum campo.'; } };
    const dec = () => { const d = decendioDe(f.data.value); if (d) { f.decendio.value = String(d.decendio); m.el.querySelector('#rd-dec').textContent = 'Referência: ' + textoDecendio(d.decendio, d.competencia) + ' (ajuste se o repasse atrasou por feriado).'; } };
    f.origem.onchange = grade; f.data.onchange = dec; grade(); dec();
    m.el.querySelector('#rd-cancelar').onclick = () => m.fechar();
    f.onsubmit = async e => {
      e.preventDefault();
      const aviso = m.el.querySelector('#rd-erro'); aviso.textContent = '';
      try {
        const d = decendioDe(f.data.value);
        let comp = d?.competencia;
        // 3º decêndio pago no início do mês seguinte já vem com a competência anterior; se o usuário mudar o decêndio, a competência é a do mês da data
        if (d && Number(f.decendio.value) !== d.decendio) comp = f.data.value.slice(0, 7);
        const base = centavosDe(f.base.value);
        const existentes = registros().filter(r => !r.anulado);
        const validos = [];
        for (const i of m.el.querySelectorAll('[data-v]')) {
          const c = centavosDe(i.value); if (!c) continue;
          const v = validarLancamento({ data: f.data.value, origem: f.origem.value, rubrica: i.dataset.v, centavos: c, decendio: f.decendio.value, competencia: comp,
            base_centavos: i.dataset.v === 'PASEP' ? base : 0, conta: contaDe(f.origem.value), credor: credorDe(i.dataset.v), historico: 'Lançamento manual do decêndio' });
          if (existentes.some(r => r.data === v.data && r.origem === v.origem && r.rubrica === v.rubrica && r.centavos === v.centavos)
            && !await confirmar(`${RUBRICAS[v.rubrica].nome} de ${dinheiro(c)} em ${dataBR(v.data)} já está lançado. Lançar de novo?`, { ok: 'Lançar mesmo assim' })) continue;
          validos.push(v);
        }
        if (!validos.length) throw Error('Informe ao menos um valor.');
        const pasep = validos.find(v => v.rubrica === 'PASEP');
        if (pasep && base && Math.abs(Math.round(base * 0.01) - pasep.centavos) > 5
          && !await confirmar(`PASEP de ${dinheiro(pasep.centavos)} não é 1% da cota (${dinheiro(Math.round(base * 0.01))}). Continuar?`, { ok: 'Continuar' })) return;
        m.fechar();
        await gravarNovos(validos, 'decendio');
      } catch (err) { aviso.textContent = mensagemErro(err); if (!aviso.isConnected) toast(mensagemErro(err), 'erro'); }
    };
  };

  // ---------- avulso / edição ----------
  function formulario(r = null) {
    const a = r || { data: hojeISO(), origem: 'FPM', rubrica: 'PASEP' };
    const m = modal({
      titulo: r ? 'Editar ' + r.numero : 'Lançamento avulso', largura: 640,
      corpo: `<form id="ra-form" class="form-grid">
        <label class="campo"><span>Data *</span><input type="date" name="data" required value="${esc(a.data)}"></label>
        <label class="campo"><span>Fundo *</span><select name="origem">${Object.entries(ORIGENS).map(([k, o]) => `<option value="${k}" ${k === a.origem ? 'selected' : ''}>${esc(o.sigla)}</option>`).join('')}</select></label>
        <label class="campo"><span>Retenção *</span><select name="rubrica">${CODIGOS_RUBRICA.map(k => `<option value="${k}" ${k === a.rubrica ? 'selected' : ''}>${esc(RUBRICAS[k].nome)}</option>`).join('')}</select></label>
        <label class="campo"><span>Valor *</span><input name="valor" inputmode="decimal" required value="${a.centavos ? (a.centavos / 100).toFixed(2).replace('.', ',') : ''}"></label>
        <label class="campo"><span>Decêndio</span><select name="decendio">${[1, 2, 3].map(n => `<option value="${n}" ${Number(a.decendio || decendioDe(a.data)?.decendio) === n ? 'selected' : ''}>${n}º</option>`).join('')}</select></label>
        <label class="campo"><span>Competência</span><input type="month" name="competencia" value="${esc(a.competencia || decendioDe(a.data)?.competencia || '')}"></label>
        <label class="campo"><span>Credor</span><input name="credor" maxlength="160" value="${esc(a.credor || credorDe(a.rubrica))}"></label>
        <label class="campo"><span>Cota bruta (opcional)</span><input name="base" inputmode="decimal" value="${a.base_centavos ? (a.base_centavos / 100).toFixed(2).replace('.', ',') : ''}"></label>
        <label class="campo"><span>Nº do empenho</span><input name="empenho" maxlength="40" value="${esc(a.empenho || (r ? '' : empenhoDe(a)))}"></label>
        <label class="campo"><span>Ficha</span><input name="ficha" maxlength="40" value="${esc(a.ficha || '')}"></label>
        <label class="campo"><span>Nº da liquidação</span><input name="liquidacao" maxlength="40" value="${esc(a.liquidacao || '')}"></label>
        <label class="campo"><span>Conta</span><input name="conta" maxlength="30" value="${esc(a.conta || contaDe(a.origem))}"></label>
        <label class="campo" style="grid-column:1/-1"><span>Histórico</span><input name="historico" maxlength="300" value="${esc(a.historico || '')}"></label>
        <label class="campo" style="grid-column:1/-1"><span>Observação</span><textarea name="observacao" rows="2" maxlength="500">${esc(a.observacao || '')}</textarea></label>
        <p id="ra-erro" class="erro-form" role="alert" style="grid-column:1/-1"></p>
        <div class="acoes-form" style="grid-column:1/-1"><button class="btn btn-sec" type="button" id="ra-cancelar">Cancelar</button><button class="btn" type="submit">${r ? 'Salvar' : 'Lançar'}</button></div></form>`
    });
    const f = m.el.querySelector('#ra-form');
    f.origem.onchange = () => { f.conta.value = contaDe(f.origem.value); };
    const sugerir = () => { if (!r) f.empenho.value = empenhoDe({ rubrica: f.rubrica.value, origem: f.origem.value, data: f.data.value }); };
    f.rubrica.onchange = () => { f.credor.value = credorDe(f.rubrica.value); sugerir(); };
    f.origem.addEventListener('change', sugerir);
    f.data.onchange = () => { const d = decendioDe(f.data.value); if (d) { f.decendio.value = d.decendio; f.competencia.value = d.competencia; } };
    m.el.querySelector('#ra-cancelar').onclick = () => m.fechar();
    f.onsubmit = async e => {
      e.preventDefault();
      const aviso = m.el.querySelector('#ra-erro'); aviso.textContent = '';
      try {
        const v = validarLancamento({ data: f.data.value, origem: f.origem.value, rubrica: f.rubrica.value, centavos: centavosDe(f.valor.value), decendio: f.decendio.value,
          competencia: f.competencia.value, credor: f.credor.value, base_centavos: centavosDe(f.base.value), empenho: f.empenho.value, ficha: f.ficha.value,
          liquidacao: f.liquidacao.value, conta: f.conta.value, historico: f.historico.value, observacao: f.observacao.value, arquivo: r?.arquivo });
        if (!r) { m.fechar(); await gravarNovos([v], 'avulso').catch(err => toast(mensagemErro(err), 'erro')); return; }
        if (v.data.slice(0, 4) !== String(r.data).slice(0, 4)) throw Error('Para mudar o ano, anule este lançamento e faça outro no exercício certo.');
        const { id, ...antes } = r;
        await db.salvar('retencoes_anos', String(r.data).slice(0, 4), { lancamentos: { [id]: { ...antes, ...v, atualizadoEm: new Date().toISOString(), atualizadoPor: estado.sessao.nome } } });
        db.registrarLog('retencoes.editar', { numero: r.numero, empenho: v.empenho, liquidacao: v.liquidacao, centavos: v.centavos }).catch(() => {});
        toast(r.numero + ' atualizado.'); m.fechar();
      } catch (err) { aviso.textContent = mensagemErro(err); }
    };
  }
  const editar = r => r && formulario(r);
  $('#r-avulso').onclick = () => formulario();

  async function anular(r) {
    if (!r) return;
    const motivo = await confirmar(`Anular ${r.numero} — ${RUBRICAS[r.rubrica]?.nome} de ${dinheiro(r.centavos)}? Ele sai dos totais e o número não é reaproveitado.`, { titulo: 'Anular retenção', ok: 'Anular', perigo: true, pedirTexto: 'Motivo' });
    if (!motivo) return;
    try {
      const { id, ...antes } = r;
      await db.salvar('retencoes_anos', String(r.data).slice(0, 4), { lancamentos: { [id]: { ...antes, anulado: true, motivoAnulacao: motivo, anuladoEm: new Date().toISOString(), anuladoPor: estado.sessao.nome } } });
      db.registrarLog('retencoes.anular', { numero: r.numero, motivo }).catch(() => {});
      toast(r.numero + ' anulado.');
    } catch (e) { toast(mensagemErro(e), 'erro'); }
  }

  // ---------- em lote ----------
  $('#r-comp-sel').onclick = () => imprimirComprovantes(registros().filter(r => selecionados.has(r.id)));
  $('#r-emp-sel').onclick = () => {
    const lista = registros().filter(r => selecionados.has(r.id));
    const m = modal({
      titulo: `Empenho de ${lista.length} retenção(ões)`, largura: 480,
      corpo: `<form id="re-form"><p class="muted">Total ${dinheiro(lista.reduce((s, r) => s + r.centavos, 0))}. Campos em branco não alteram o que já está gravado.</p>
        <label class="campo"><span>Nº do empenho</span><input name="empenho" maxlength="40"></label>
        <label class="campo"><span>Ficha</span><input name="ficha" maxlength="40"></label>
        <label class="campo"><span>Nº da liquidação</span><input name="liquidacao" maxlength="40"></label>
        <div class="acoes-form"><button class="btn btn-sec" type="button" id="re-c">Cancelar</button><button class="btn" type="submit">Gravar</button></div></form>`
    });
    const f = m.el.querySelector('#re-form');
    m.el.querySelector('#re-c').onclick = () => m.fechar();
    f.onsubmit = async e => {
      e.preventDefault();
      const campos = Object.fromEntries(['empenho', 'ficha', 'liquidacao'].map(k => [k, f[k].value.trim().slice(0, 40)]).filter(([, v]) => v));
      if (!Object.keys(campos).length) return m.fechar();
      try {
        const porAno = {};
        for (const r of lista) (porAno[String(r.data).slice(0, 4)] ||= {})[r.id] = { ...campos, atualizadoEm: new Date().toISOString(), atualizadoPor: estado.sessao.nome };
        for (const [a, lanc] of Object.entries(porAno)) await db.salvar('retencoes_anos', a, { lancamentos: lanc });
        db.registrarLog('retencoes.empenho_lote', { numeros: lista.map(r => r.numero), ...campos }).catch(() => {});
        toast('Empenho gravado em ' + lista.length + ' retenção(ões).'); m.fechar();
      } catch (err) { toast(mensagemErro(err), 'erro'); }
    };
  };
  async function reordenar(perguntar = true) {
    if (perguntar && !await confirmar(`Renumerar as retenções de ${ano} pela data do desconto (= data da liquidação)? Comprovantes já impressos precisam ser gerados de novo com o número novo.`, { titulo: 'Reordenar numeração', ok: 'Reordenar' })) return;
    try {
      const n = await db.renumerarRetencoes(ano, l => renumerarPorData(l, ano));
      db.registrarLog('retencoes.reordenar', { ano, alterados: n }).catch(() => {});
      toast(n ? `${n} retenção(ões) renumerada(s) pela data.` : 'A numeração já está na ordem das datas.');
    } catch (e) { toast(mensagemErro(e), 'erro'); }
  }
  $('#r-reordenar').onclick = () => reordenar();
  $('#r-emp-padrao').onclick = async () => {
    const sem = registros().filter(r => !r.anulado && !r.empenho && empenhoDe(r));
    if (!sem.length) return toast('Nenhuma retenção sem empenho (ou sem empenho padrão configurado).');
    if (!await confirmar(`Preencher o empenho padrão em ${sem.length} retenção(ões) sem empenho?`, { ok: 'Preencher' })) return;
    try {
      const porAno = {};
      for (const r of sem) (porAno[String(r.data).slice(0, 4)] ||= {})[r.id] = { empenho: empenhoDe(r), atualizadoEm: new Date().toISOString(), atualizadoPor: estado.sessao.nome };
      for (const [a, lanc] of Object.entries(porAno)) await db.salvar('retencoes_anos', a, { lancamentos: lanc });
      db.registrarLog('retencoes.empenho_padrao', { quantidade: sem.length }).catch(() => {});
      toast('Empenho preenchido em ' + sem.length + ' retenção(ões).');
    } catch (e) { toast(mensagemErro(e), 'erro'); }
  };
  $('#r-demo').onclick = () => abrirJanela(demonstrativoHTML(filtrados(), cfgImpressao(), (mes ? MESES[Number(mes) - 1] + '/' : '') + ano));
  $('#r-csv').onclick = () => baixarArquivo(`retencoes-${ano}${mes ? '-' + mes : ''}.csv`, csv(linhasCSV(filtrados())));

  // ---------- configuração ----------
  $('#r-config').onclick = () => {
    const m = modal({
      titulo: 'Configurar retenções', largura: 640,
      corpo: `<form id="rc-form" class="form-grid">
        <label class="campo"><span>CNPJ do Município</span><input name="cnpj" maxlength="20" value="${esc(config.cnpj || '')}"></label>
        <label class="campo"><span>Responsável (assina o comprovante)</span><input name="responsavel" maxlength="120" value="${esc(config.responsavel || '')}"></label>
        <label class="campo"><span>Cargo</span><input name="cargo" maxlength="80" value="${esc(config.cargo || '')}"></label>
        <label class="campo"><span>Valor do rateio CISDOCE (todo decêndio)</span><input name="rateio" inputmode="decimal" value="${esc(((Number(config.rateio_cisdoce_centavos) || VALOR_RATEIO_CISDOCE) / 100).toFixed(2).replace('.', ','))}"></label>
        <p class="dica" style="grid-column:1/-1">No extrato, CISDOCE com esse valor é lançado como <strong>rateio</strong>; qualquer outro valor como <strong>serviços</strong> (descontado só no dia 10).</p>
        <h4 style="grid-column:1/-1;margin:6px 0 0">Empenhos do exercício ${ano}</h4>
        <p class="dica" style="grid-column:1/-1">Cada exercício tem os seus empenhos. Para cadastrar os de outro ano, feche, troque o <strong>Exercício</strong> na tela e abra Configurar de novo.</p>
        ${CHAVES_EMPENHO.map(([k, t]) => { const [rb, og] = k.split(':'); return `<label class="campo"><span>${esc(t)}</span><input data-emp="${k}" maxlength="40" value="${esc(empenhoPadrao(config.empenhos, rb, og || 'FPM', ano + '-01-01'))}" placeholder="nº/${ano}"></label>`; }).join('')}
        <h4 style="grid-column:1/-1;margin:6px 0 0">Contas</h4>
        ${Object.entries(ORIGENS).map(([k, o]) => `<label class="campo"><span>${esc(o.sigla)}</span><input data-conta="${k}" maxlength="30" value="${esc(contaDe(k))}" placeholder="conta"></label>`).join('')}
        <h4 style="grid-column:1/-1;margin:6px 0 0">Credores (nome no comprovante)</h4>
        ${CODIGOS_RUBRICA.filter(k => k !== 'OUTRA').map(k => `<label class="campo"><span>${esc(RUBRICAS[k].nome)}</span><input data-credor="${k}" maxlength="160" value="${esc(credorDe(k))}"></label>`).join('')}
        <div class="acoes-form" style="grid-column:1/-1"><button class="btn btn-sec" type="button" id="rc-c">Cancelar</button><button class="btn" type="submit">Salvar</button></div></form>`
    });
    const f = m.el.querySelector('#rc-form');
    m.el.querySelector('#rc-c').onclick = () => m.fechar();
    f.onsubmit = async e => {
      e.preventDefault();
      let rateio;
      try { rateio = centavosDe(f.rateio.value); if (!rateio) throw Error(); } catch { return toast('Informe o valor do rateio do CISDOCE, ex.: 3.221,68.', 'erro'); }
      const dados = { cnpj: f.cnpj.value.trim(), responsavel: f.responsavel.value.trim(), cargo: f.cargo.value.trim(), rateio_cisdoce_centavos: rateio,
        contas: Object.fromEntries([...f.querySelectorAll('[data-conta]')].map(i => [i.dataset.conta, i.value.trim()])),
        credores: Object.fromEntries([...f.querySelectorAll('[data-credor]')].map(i => [i.dataset.credor, i.value.trim()])),
        empenhos: { ...(config.empenhos || {}), [ano]: Object.fromEntries([...f.querySelectorAll('[data-emp]')].map(i => [i.dataset.emp, i.value.trim()])) } };
      try { await db.salvar('retencoes_config', 'geral', dados); toast('Configuração salva.'); m.fechar(); }
      catch (err) { toast(mensagemErro(err), 'erro'); }
    };
  };

  // ---------- filtros e dados ----------
  $('#r-mes').onchange = e => { mes = e.target.value; render(); };
  $('#r-origem').onchange = e => { filtroOrigem = e.target.value; render(); };
  $('#r-rubrica').onchange = e => { filtroRubrica = e.target.value; render(); };
  $('#r-sit').onchange = e => { filtroSituacao = e.target.value; render(); };
  $('#r-busca').oninput = e => { busca = e.target.value.trim(); render(); };
  $('#r-ano').onchange = e => { ano = Number(e.target.value); selecionados.clear(); ouvir(); };
  function ouvir() {
    desinscrever?.();
    documento = null; carregando = true; erro = ''; render();
    $('#r-status').textContent = 'Carregando retenções de ' + ano + '…';
    const lido = ano;
    desinscrever = db.ouvirDoc('retencoes_anos', String(ano), d => {
      if (cancelou || lido !== ano) return;
      documento = d || { ano, lancamentos: {} }; carregando = false;
      corrigirContaIPI();
      $('#r-status').textContent = 'Sincronizado · exercício ' + ano; render();
    }, e => {
      if (cancelou || lido !== ano) return;
      carregando = false; erro = mensagemErro(e);
      $('#r-status').textContent = 'Não foi possível abrir as retenções. Publique as regras atualizadas do Firestore (firestore.rules) e recarregue. Detalhe: ' + erro;
      render();
    });
  }
  // Correção da conta do IPI (92998-8 → 92998-0): ajusta a configuração e os lançamentos já gravados, uma vez.
  const CONTA_IPI_ERRADA = '92998-8', CONTA_IPI = ORIGENS.IPI.conta;
  let corrigindoIPI = false;
  function corrigirContaIPI() {
    if (corrigindoIPI || !documento) return;
    const errados = registros().filter(r => r.origem === 'IPI' && r.conta === CONTA_IPI_ERRADA);
    if (!errados.length) return;
    corrigindoIPI = true;
    const lanc = Object.fromEntries(errados.map(r => [r.id, { conta: CONTA_IPI }]));
    db.salvar('retencoes_anos', String(ano), { lancamentos: lanc })
      .then(() => db.registrarLog('retencoes.corrige_conta_ipi', { quantidade: errados.length }).catch(() => {}))
      .catch(() => {}).finally(() => { corrigindoIPI = false; });
  }
  desConfig = db.ouvirDoc('retencoes_config', 'geral', d => {
    config = { ...CONFIG_PADRAO, ...(d || {}) };
    if (config.contas?.IPI === CONTA_IPI_ERRADA) db.salvar('retencoes_config', 'geral', { contas: { IPI: CONTA_IPI } }).catch(() => {});
    alertaEmpenhos();
  }, () => {});
  ouvir();
  return { titulo: 'Retenções das transferências', limpar: () => { cancelou = true; desinscrever?.(); desConfig?.(); } };
}
