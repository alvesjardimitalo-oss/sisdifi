import { esc } from '../ui.js';
import { pode } from '../estado.js';
import { DESTINOS, extrairMinuta, agruparMinuta } from '../minuta-pdf.js';
const moeda = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function telaConsignacoes(el) {
  if (!pode.contabil()) return { titulo: 'Acesso restrito' };
  let arquivos = [], ocupado = false, ativo = true;
  el.innerHTML = `<style>
  .minuta .mi-acoes{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:16px 0}.minuta .mi-card{border:1px solid #dce3ed;border-radius:12px;padding:20px;margin:16px 0;background:#fff}.minuta .mi-total{font-size:1.6rem;font-weight:700;color:#174665}.minuta .mi-tabela{overflow:auto}.minuta table{width:100%;border-collapse:collapse}.minuta th,.minuta td{padding:10px;text-align:left;border-bottom:1px solid #e2e8f0}.minuta .mi-valor{text-align:right;white-space:nowrap}.minuta .mi-aviso{background:#fff7df;padding:14px;border-radius:8px}.minuta select{max-width:100%}.minuta summary{cursor:pointer}.minuta small{display:block;color:#526174}
  </style><section class="minuta"><h1>Consignações por fonte</h1><p>Importe minutas de arrecadação e confira os descontos de Caixa Econômica Federal, Sicoob, Bradesco e pensão alimentícia.</p>
  <div class="mi-card"><label class="campo"><span>Minutas em PDF (até 15 MB por arquivo)</span><input id="mi-pdf" type="file" accept="application/pdf,.pdf" multiple></label><p class="dica">Leitura no seu navegador. Os PDFs e resultados não são enviados ao servidor nem ficam salvos ao sair desta tela. PDFs digitalizados como imagem precisam de reconhecimento de texto antes da importação.</p><p class="dica">O número mantém o tipo indicado no PDF: guia ou empenho. Guias não são convertidas em empenhos.</p><div id="mi-status" role="status" aria-live="polite"></div></div>
  <div id="mi-arquivos"></div><div class="mi-acoes"><label class="campo">Destino<select id="mi-destino"><option value="">Todos</option>${DESTINOS.map(d=>`<option>${esc(d)}</option>`).join('')}<option>Não classificado</option></select></label><label class="campo">Fonte<select id="mi-fonte"><option value="">Todas</option></select></label><button class="btn btn-sec" id="mi-csv" disabled>Exportar CSV</button><button class="btn btn-sec" id="mi-print" disabled>Imprimir / PDF</button><button class="btn btn-sec" id="mi-limpar">Limpar</button></div>
  <label><input type="checkbox" id="mi-revisado"> Conferi os documentos, as categorias e os avisos antes de exportar</label><div id="mi-resultado"></div></section>`;
  const $ = s => el.querySelector(s);
  const todos = () => arquivos.flatMap(a => a.resultado.registros.map(r => ({ ...r, arquivo: a.nome })));
  const filtrados = () => todos().filter(r => (!$('#mi-destino').value || (r.destino || 'Não classificado') === $('#mi-destino').value) && (!$('#mi-fonte').value || r.fonte === $('#mi-fonte').value));
  function tabela(grupos) {
    return grupos.map(g => `<section class="mi-card"><h3>${esc(g.destino)} · Fonte ${esc(g.fonte)}</h3><div class="mi-tabela"><table><thead><tr><th>Tipo / Número</th><th>Data</th><th>Fonte completa</th><th>Arquivo / página</th><th class="mi-valor">Valor</th></tr></thead><tbody>${g.registros.map(r => `<tr><td>${esc(r.tipo)} ${esc(r.numero)}</td><td>${esc(r.data)}</td><td>${esc(r.fonteCompleta)}<small>${esc(r.fonteNome)}</small></td><td>${esc(r.arquivo)} · p. ${r.pagina}</td><td class="mi-valor">${moeda(r.centavos)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="4">Total da fonte ${esc(g.fonte)}</th><th class="mi-valor">${moeda(g.total)}</th></tr></tfoot></table></div></section>`).join('');
  }
  function render() {
    const rs = filtrados(), grupos = agruparMinuta(rs), total = rs.reduce((s,r)=>s+r.centavos,0);
    $('#mi-arquivos').innerHTML = arquivos.map((a,i)=>`<div class="mi-card"><strong>${esc(a.nome)}</strong><p>${a.resultado.quantidadeDocumentos} documentos · ${a.resultado.registros.length} linhas por fonte · Lido: ${moeda(a.resultado.totalLido)} · Total do PDF: ${a.resultado.totalInformado === null ? 'não identificado' : moeda(a.resultado.totalInformado)}</p>${a.resultado.avisos.length ? `<details class="mi-aviso" open><summary>${a.resultado.avisos.length} aviso(s) de conferência</summary><ul>${a.resultado.avisos.map(v=>`<li>${esc(v)}</li>`).join('')}</ul></details>` : '<p>Os valores das fontes conferem com os documentos reconhecidos.</p>'}<button class="btn btn-sec" data-remover="${i}" ${ocupado?'disabled':''}>Remover arquivo</button></div>`).join('');
    $('#mi-resultado').innerHTML = rs.length ? `<div class="mi-card"><small>Total da seleção · ${rs.length} lançamentos</small><div class="mi-total">${moeda(total)}</div>${[...new Set(grupos.map(g=>g.destino))].map(d=>`<p>${esc(d)}: <strong>${moeda(grupos.filter(g=>g.destino===d).reduce((s,g)=>s+g.total,0))}</strong></p>`).join('')}</div>${tabela(grupos)}` : '<div class="mi-card">Nenhum lançamento nesta seleção.</div>';
    $('#mi-csv').disabled = $('#mi-print').disabled = ocupado || !rs.length || !$('#mi-revisado').checked;
    el.querySelectorAll('[data-remover]').forEach(b=>b.onclick=()=>{arquivos.splice(Number(b.dataset.remover),1);atualizar();});
  }
  function atualizar() {
    $('#mi-revisado').checked = false;
    const anterior = $('#mi-fonte').value;
    $('#mi-fonte').innerHTML = '<option value="">Todas</option>'+[...new Set(todos().map(r=>r.fonte))].sort().map(f=>`<option>${esc(f)}</option>`).join('');
    $('#mi-fonte').value = [...$('#mi-fonte').options].some(o=>o.value===anterior) ? anterior : '';
    render();
  }
  $('#mi-pdf').onchange = async e => {
    if (ocupado) return;
    ocupado = true; $('#mi-pdf').disabled = true; $('#mi-limpar').disabled = true; $('#mi-revisado').checked = false; render();
    const erros = [];
    try {
      for (const file of e.target.files) {
        if (!ativo) break;
        $('#mi-status').textContent = `Analisando ${file.name}…`;
        try {
          if (!/\.pdf$/i.test(file.name) || file.size > 15*1024*1024) throw new Error('Selecione um PDF de até 15 MB.');
          const data = await file.arrayBuffer();
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(b=>b.toString(16).padStart(2,'0')).join('');
          if (arquivos.some(a=>a.hash===hash)) throw new Error('Este PDF já foi importado; cópia ignorada.');
          const resultado = await extrairMinuta(data);
          const chaves = new Set(todos().map(r=>[r.data,r.numero,r.fonteCompleta,r.destino,r.centavos].join('|')));
          if(resultado.registros.some(r=>chaves.has([r.data,r.numero,r.fonteCompleta,r.destino,r.centavos].join('|')))) resultado.avisos.push('Há lançamentos iguais aos de outro arquivo. Confira os períodos e remova o arquivo sobreposto para evitar soma duplicada.');
          if (ativo) arquivos.push({ nome:file.name,hash,resultado });
        } catch(err) { erros.push(`${file.name}: ${err.message || 'Não foi possível ler o PDF.'}`); }
      }
    } finally {
      ocupado = false;
      if (ativo) { $('#mi-pdf').disabled = false; $('#mi-limpar').disabled = false; $('#mi-pdf').value = ''; $('#mi-status').textContent = erros.length ? erros.join(' | ') : 'Leitura concluída. Confira o resultado abaixo.'; atualizar(); }
    }
  };
  $('#mi-destino').onchange = $('#mi-fonte').onchange = $('#mi-revisado').onchange = render;
  $('#mi-limpar').onclick = () => { arquivos = []; $('#mi-status').textContent = ''; atualizar(); };
  $('#mi-csv').onclick = () => {
    const cell = s => '"'+String(s??'').replace(/^[=+@-]/,"'"+'$&').replace(/"/g,'""')+'"';
    const linhas = [['Destino','Tipo','Número','Data','Fonte','Fonte completa','Valor','Arquivo','Página']];
    for (const g of agruparMinuta(filtrados())) {
      for (const r of g.registros) linhas.push([g.destino,r.tipo,r.numero,r.data,r.fonte,r.fonteCompleta,(r.centavos/100).toFixed(2).replace('.',','),r.arquivo,r.pagina]);
      linhas.push([g.destino,'TOTAL DA FONTE','','',g.fonte,'',(g.total/100).toFixed(2).replace('.',',')]);
    }
    linhas.push(['TOTAL DA SELEÇÃO','','','','','',(filtrados().reduce((s,r)=>s+r.centavos,0)/100).toFixed(2).replace('.',',')]);
    const url = URL.createObjectURL(new Blob(['\uFEFF'+linhas.map(l=>l.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a = document.createElement('a'); a.href=url;a.download='consignacoes-por-fonte.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('#mi-print').onclick = () => {
    const w = window.open('','_blank'); if(!w) { $('#mi-status').textContent='Permita a abertura da janela para imprimir.';return; }
    w.opener = null;
    w.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Consignações por fonte · SISDIFI</title><style>body{font:12px Arial;padding:20px;color:#172b42}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #ccc;text-align:left}small{display:block}.mi-valor{text-align:right}h3{margin-top:28px}tr{break-inside:avoid}thead{display:table-header-group}</style><h1>SISDIFI · Consignações por fonte</h1><p>Resultado conferido pelo usuário · ${new Date().toLocaleDateString('pt-BR')}</p><p>Total da seleção: <strong>${moeda(filtrados().reduce((s,r)=>s+r.centavos,0))}</strong></p>${arquivos.some(a=>a.resultado.avisos.length)?'<p>A importação contém avisos de leitura ou classificação. Consulte os documentos de origem.</p>':''}${tabela(agruparMinuta(filtrados()))}</html>`);
    w.document.close(); w.focus(); w.print();
  };
  render();
  return { titulo:'Consignações por fonte', limpar:()=>{ativo=false;arquivos=[];} };
}
