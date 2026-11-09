import { esc } from '../ui.js';
import { pode, estado } from '../estado.js';
import { DESTINOS, extrairMinuta, agruparMinuta } from '../minuta-pdf.js';
import { MESES, rotuloCompetencia, valorEsperado, vincularFolha, conferenciaMensal, carregarMes, salvarMes } from '../consignacoes-mensal.js';
const moeda = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function telaConsignacoes(el) {
  if (!pode.contabil()) return { titulo: 'Acesso restrito' };
  const uid=estado.sessao.uid, hoje=new Date();
  let competencia=`${estado.exercicio || hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  let arquivos=[],esperados={},revisao=0,ocupado=true,ativo=true,erroCarga=false;
  const urls=new Set();
  el.innerHTML=`<style>
  .minuta .mi-acoes{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:16px 0}.minuta .mi-card{border:1px solid #dce3ed;border-radius:12px;padding:20px;margin:16px 0;background:#fff}.minuta .mi-total{font-size:1.6rem;font-weight:700;color:#174665}.minuta .mi-tabela{overflow:auto}.minuta table{width:100%;border-collapse:collapse}.minuta th,.minuta td{padding:10px;text-align:left;border-bottom:1px solid #e2e8f0}.minuta .mi-valor{text-align:right;white-space:nowrap}.minuta .mi-aviso{background:#fff7df;padding:14px;border-radius:8px;margin:10px 0}.minuta select{max-width:100%}.minuta summary{cursor:pointer}.minuta small{display:block;color:#526174}.minuta .mi-bancos{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.minuta .mi-bancos .mi-card{margin:0}.minuta .mi-diferenca{font-weight:700;color:#a3430c}.minuta .mi-ok{color:#14673c}.minuta input[type=search]{min-width:220px}.minuta .mi-abas{display:flex;gap:8px;overflow-x:auto;padding:6px 0 12px;scrollbar-width:thin}.minuta .mi-abas button{flex:0 0 auto;padding:11px 16px;border:1px solid #ccd8e5;border-radius:9px;background:#fff;color:#23445c;cursor:pointer;font:inherit;font-weight:600}.minuta .mi-abas button[aria-selected=true]{background:#174665;color:#fff;border-color:#174665}.minuta .mi-analise{border-left:4px solid #d98e2c;background:#fffaf1}.minuta .mi-analise li{margin:7px 0}.minuta .mi-analise .mi-candidato{border-radius:7px;padding:9px;background:#fff}.minuta .mi-pendencias{color:#7b421c}.minuta .mi-card button{max-width:100%}@media(max-width:600px){.minuta .mi-card{padding:13px}.minuta .mi-bancos{grid-template-columns:1fr}.minuta th,.minuta td{padding:7px;font-size:.88rem}.minuta .mi-acoes>*{min-width:0}.minuta input[type=search]{min-width:0;width:100%}}
  </style><section class="minuta"><h1>Conferência mensal de consignações</h1><p>Selecione a competência da folha, importe as minutas e confira os três bancos e a pensão alimentícia.</p>
  <div class="mi-acoes"><label class="campo"><span>Mês da folha</span><select id="mi-mes">${MESES.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}">${m}</option>`).join('')}</select></label><label class="campo"><span>Ano da folha</span><input id="mi-ano" type="number" min="2000" max="2100" step="1" style="width:110px"></label><strong id="mi-competencia"></strong></div>
  <p class="dica">Histórico salvo neste navegador e nesta conta do SISDIFI. Não é compartilhado com outros computadores; limpar os dados do navegador apaga este histórico. Guarde os PDFs originais e exporte a conferência.</p>
  <div id="mi-status" role="status" aria-live="polite"></div><div id="mi-bancos" class="mi-bancos"></div><div id="mi-conferencia"></div>
  <div class="mi-card"><label class="campo"><span>Adicionar minutas à competência da folha selecionada (PDF, até 15 MB por arquivo)</span><input id="mi-pdf" type="file" accept="application/pdf,.pdf" multiple disabled></label><p class="dica">O banco é identificado pelo conteúdo do PDF. A competência é a da folha, mesmo quando o pagamento ou a arrecadação ocorre no mês seguinte. As datas do PDF são preservadas e não definem a competência. PDFs sem texto precisam de OCR. O número mantém o tipo indicado na minuta: guia ou empenho.</p></div>
  <div id="mi-arquivos"></div><h2>Conferir por banco ou desconto</h2><nav id="mi-abas" class="mi-abas" role="tablist" aria-label="Conferência por banco"><button type="button" data-aba="" role="tab" aria-selected="true">Visão geral</button>${DESTINOS.map(d=>`<button type="button" data-aba="${esc(d)}" role="tab" aria-selected="false">${esc(d)}</button>`).join('')}</nav><div class="mi-acoes"><label class="campo"><span>Banco / desconto</span><select id="mi-destino"><option value="">Todos</option>${DESTINOS.map(d=>`<option>${esc(d)}</option>`).join('')}<option>Não classificado</option></select></label><label class="campo"><span>Fonte</span><select id="mi-fonte"><option value="">Todas</option></select></label><label class="campo"><span>Buscar guia ou empenho</span><input id="mi-busca" type="search" placeholder="Ex.: 4041"></label><button class="btn btn-sec" id="mi-csv" disabled>Exportar CSV</button><button class="btn btn-sec" id="mi-print" disabled>Imprimir / PDF</button></div>
  <label><input type="checkbox" id="mi-revisado"> Conferi os documentos, as categorias e os avisos antes de exportar</label><div id="mi-resultado"></div></section>`;
  const $=s=>el.querySelector(s);
  $('#mi-mes').value=competencia.slice(5);$('#mi-ano').value=competencia.slice(0,4);
  const todos=()=>arquivos.flatMap(a=>a.resultado.registros.map(r=>({...r,arquivo:a.nome})));
  const filtrados=()=>todos().filter(r=>(!$('#mi-destino').value||(r.destino||'Não classificado')===$('#mi-destino').value)&&(!$('#mi-fonte').value||r.fonte===$('#mi-fonte').value)&&String(r.numero||'').toLowerCase().includes($('#mi-busca').value.trim().toLowerCase()));
  const status=t=>{if(ativo)$('#mi-status').textContent=t;};
  function travar(valor) {
    ocupado=valor;
    for(const id of ['mi-pdf','mi-mes','mi-ano']) $("#"+id).disabled=valor || (erroCarga && id==='mi-pdf');
    el.querySelectorAll('[data-esperado],[data-salvar],[data-remover]').forEach(e=>e.disabled=valor||erroCarga);
    $('#mi-csv').disabled=$('#mi-print').disabled=valor||!filtrados().length||!$('#mi-revisado').checked;
  }
  function tabela(grupos) {
    return grupos.map(g=>`<section class="mi-card"><h3>${esc(g.destino)} · Fonte ${esc(g.fonte)}</h3><div class="mi-tabela"><table><thead><tr><th>Tipo / Número</th><th>Data da arrecadação</th><th>Fonte completa</th><th>Arquivo / página</th><th class="mi-valor">Valor</th></tr></thead><tbody>${g.registros.map(r=>`<tr><td>${esc(r.tipo)} ${esc(r.numero)}</td><td>${esc(r.data)}</td><td>${esc(r.fonteCompleta)}<small>${esc(r.fonteNome)}</small></td><td>${esc(r.arquivo)} · p. ${r.pagina}</td><td class="mi-valor">${moeda(r.centavos)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="4">Total da fonte ${esc(g.fonte)}</th><th class="mi-valor">${moeda(g.total)}</th></tr></tfoot></table></div></section>`).join('');
  }
  function resumo(c) {
    return `<h2>${esc(rotuloCompetencia(competencia))}</h2><table><thead><tr><th>Destino</th><th>Importado</th><th>Esperado</th><th>Diferença</th></tr></thead><tbody>${c.blocos.map(b=>`<tr><td>${esc(b.destino)}${b.arquivos?'':' — arquivo pendente'}</td><td>${moeda(b.total)}</td><td>${b.esperado===null?'Não informado':moeda(b.esperado)}</td><td>${b.diferenca===null?'—':moeda(b.diferenca)}</td></tr>`).join('')}</tbody></table>`;
  }
  function render() {
    const c=conferenciaMensal(arquivos,esperados), rs=filtrados();
    $('#mi-competencia').textContent=rotuloCompetencia(competencia);
    $('#mi-bancos').innerHTML=c.blocos.map((b,i)=>`<div class="mi-card"><h3>${esc(b.destino)}</h3><small>${b.arquivos?`${b.arquivos} arquivo(s) · ${b.registros.length} lançamentos`:'Arquivo pendente'}</small><p class="mi-total">${moeda(b.total)}</p><label class="campo"><span>Valor esperado · ${esc(b.destino)}</span><input data-esperado="${i}" inputmode="decimal" placeholder="Ex.: 10.000,00" value="${b.esperado===null?'':(b.esperado/100).toFixed(2).replace('.',',')}"></label><button class="btn btn-sec" data-salvar="${i}">Salvar valor</button><p class="${b.diferenca===0?'mi-ok':'mi-diferenca'}">${b.diferenca===null?'Informe o valor para comparar':b.diferenca===0?'Sem diferença de valor':b.diferenca>0?'Sobra '+moeda(b.diferenca):'Falta '+moeda(-b.diferenca)}</p><button class="btn btn-sec" data-ver="${i}">Ver lançamentos</button></div>`).join('');
    const documento = r => `${esc(r.tipo)} ${esc(r.numero)} · fonte(s) ${(r.fontes||[r.fonteCompleta]).map(esc).join(', ')} · ${moeda(r.centavos)} · ${esc(r.arquivo||'')} · p. ${(r.paginas||[r.pagina]).join(', ')}`;
    const hipoteses = c.investigacoes.map(t => {
      const combinacoes = t.combinacoes.map((docs,i) => `<li class="mi-candidato"><strong>Hipótese ${i+1}:</strong> ${docs.map(documento).join(' <strong>+</strong> ')} = <strong>${moeda(t.valor)}</strong></li>`).join('');
      const aproximados = t.proximos.map(r => `<li>${documento(r)} · diferença de ${moeda(Math.abs(r.centavos-t.valor))} para o valor investigado</li>`).join('');
      return `<section class="mi-card mi-analise"><h3>${t.exata?'Possível empenho em banco errado':'Investigar diferença parcial'}</h3><p><strong>${esc(t.sobra)} (sobra) → ${esc(t.falta)} (falta)</strong></p><p>Valor investigado: <strong>${moeda(t.valor)}</strong>${t.exata?' · Os saldos opostos se compensam.':' · Os saldos não se compensam integralmente.'}</p>${combinacoes?`<p>Documentos inteiros que, individualmente ou combinados (até 3), explicam esse valor:</p><ol>${combinacoes}</ol>`:`<p>Nenhum conjunto de até três documentos coincide com a diferença.${aproximados?' Documentos mais próximos para conferência:':''}</p>${aproximados?`<ul>${aproximados}</ul>`:''}`}<small>Indicação matemática para revisão manual; a descrição, a fonte e a minuta original precisam confirmar o destino correto. Nenhum empenho é alterado automaticamente.</small></section>`;
    }).join('');
    $('#mi-conferencia').innerHTML=`<div class="mi-card"><strong>${c.conferido?'Quatro categorias conferem com os valores esperados':'Conferência pendente'}</strong><p>Total das quatro categorias: ${moeda(c.total)}${c.esperado===null?' · Informe os quatro valores esperados para comparar.':` · Esperado: ${moeda(c.esperado)} · Diferença: ${moeda(c.diferenca)}`}</p>${c.diferenca===0&&c.blocos.some(b=>b.diferenca!==0)?'<p class="mi-aviso">O total geral bate, mas há diferenças entre bancos. Confira os empenhos apontados abaixo.</p>':''}${c.naoClassificados.length?`<p class="mi-aviso">${c.naoClassificados.length} lançamento(s) não classificado(s). Se a minuta é de um banco só, selecione o banco no arquivo para corrigir a classificação.</p>`:''}</div>${hipoteses}`;
    $('#mi-abas').querySelectorAll('[data-aba]').forEach(b => b.setAttribute('aria-selected',String(b.dataset.aba===$('#mi-destino').value)));
    $('#mi-arquivos').innerHTML=arquivos.map((a,i)=>`<details class="mi-card"><summary><strong>${esc(a.nome)}</strong> · ${a.resultado.registros.length} linhas · ${moeda(a.resultado.totalLido)}${a.resultado.avisos.length?' · Revisar avisos':''}</summary><p>Total do PDF: ${a.resultado.totalInformado===null?'Não identificado':moeda(a.resultado.totalInformado)}</p>${a.resultado.avisos.length?`<ul class="mi-aviso">${a.resultado.avisos.map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`:''}<label class="campo"><span>Banco do arquivo (opcional, para PDF sem identificação)</span><select data-classificar="${i}"><option value="">Identificação automática</option>${DESTINOS.map(d=>`<option value="${esc(d)}" ${a.destinoForcado===d?'selected':''}>${esc(d)}</option>`).join('')}</select></label><small>Escolha manualmente apenas se todos os lançamentos deste PDF pertencerem ao mesmo banco/desconto. A descrição extraída será preservada para auditoria.</small><div class="mi-acoes"><button class="btn btn-sec" data-pdf="${i}">Baixar PDF original</button><button class="btn btn-sec" data-remover="${i}">Retirar deste mês</button></div></details>`).join('');
    $('#mi-resultado').innerHTML=rs.length?`<div class="mi-card"><small>Detalhamento filtrado · ${rs.length} lançamentos</small><div class="mi-total">${moeda(rs.reduce((s,r)=>s+r.centavos,0))}</div></div>${tabela(agruparMinuta(rs))}`:'<div class="mi-card">Nenhum lançamento nesta seleção.</div>';
    el.querySelectorAll('[data-ver]').forEach(b=>b.onclick=()=>{$('#mi-destino').value=DESTINOS[Number(b.dataset.ver)];$('#mi-busca').value='';$('#mi-fonte').value='';render();$('#mi-resultado').scrollIntoView({behavior:'smooth'});});
    el.querySelectorAll('[data-salvar]').forEach(botao=>botao.onclick=async()=>{
      if(ocupado)return;
      const input=el.querySelector('[data-esperado="'+botao.dataset.salvar+'"]');
      const destino=DESTINOS[Number(botao.dataset.salvar)];
      try { const valor=valorEsperado(input.value);await gravar(arquivos,{...esperados,[destino]:valor}); }
      catch(e){status(e.message);render();}
    });
    el.querySelectorAll('[data-remover]').forEach(b=>b.onclick=async()=>{
      if(ocupado)return;
      if(!window.confirm('Retirar este arquivo da conferência de '+rotuloCompetencia(competencia)+'? Os valores serão recalculados.'))return;
      try{await gravar(arquivos.filter((_,i)=>i!==Number(b.dataset.remover)),esperados);}catch(e){status(e.message);}
    });
    el.querySelectorAll('[data-pdf]').forEach(b=>b.onclick=()=>baixar(arquivos[Number(b.dataset.pdf)].pdf,arquivos[Number(b.dataset.pdf)].nome));
    el.querySelectorAll('[data-classificar]').forEach(select=>select.onchange=async()=>{
      if(ocupado)return;
      const i=Number(select.dataset.classificar), destino=select.value, a=arquivos[i];
      const novo={...a,destinoForcado:destino,resultado:{...a.resultado,registros:a.resultado.registros.map(r=>({...r,destinoOriginal:r.destinoOriginal??r.destino,destino:destino||(r.destinoOriginal??r.destino)}))}};
      try{await gravar(arquivos.map((x,j)=>j===i?novo:x),esperados);}catch(e){status(e.message);render();}
    });
    travar(ocupado);
  }
  function atualizar() {
    $('#mi-revisado').checked=false;
    const anterior=$('#mi-fonte').value;
    $('#mi-fonte').innerHTML='<option value="">Todas</option>'+[...new Set(todos().map(r=>r.fonte))].sort().map(f=>`<option>${esc(f)}</option>`).join('');
    $('#mi-fonte').value=[...$('#mi-fonte').options].some(o=>o.value===anterior)?anterior:'';
    render();
  }
  async function gravar(novos,novosEsperados) {
    if(!ativo||erroCarga)throw Error('Reabra a tela para carregar o histórico.');
    travar(true);
    try {
      const proxima=await salvarMes(uid,competencia,{arquivos:novos,esperados:novosEsperados,revisao});
      if(!ativo)return;
      revisao=proxima;arquivos=novos;esperados=novosEsperados;status('Salvo neste navegador · '+rotuloCompetencia(competencia));
    } finally {if(ativo){ocupado=false;atualizar();}}
  }
  async function carregar() {
    travar(true);erroCarga=false;arquivos=[];esperados={};revisao=0;atualizar();status('Carregando '+rotuloCompetencia(competencia)+'…');
    try {const d=await carregarMes(uid,competencia);if(!ativo)return;arquivos=d.arquivos;esperados=d.esperados;revisao=d.revisao;status('Histórico local carregado.');}
    catch(e){erroCarga=true;status('Não foi possível abrir o histórico local. '+e.message);}
    finally{if(ativo){ocupado=false;atualizar();}}
  }
  const mudar=()=>{
    const ano=$('#mi-ano').value;
    if(!/^\d{4}$/.test(ano)||Number(ano)<2000||Number(ano)>2100){status('Informe um ano entre 2000 e 2100.');$('#mi-ano').value=competencia.slice(0,4);return;}
    competencia=ano+'-'+$('#mi-mes').value;$('#mi-destino').value='';$('#mi-busca').value='';carregar();
  };
  $('#mi-mes').onchange=$('#mi-ano').onchange=mudar;
  $('#mi-pdf').onchange=async e=>{
    if(ocupado||erroCarga)return;
    const files=[...e.target.files],novos=[...arquivos],erros=[];
    travar(true);$('#mi-revisado').checked=false;
    try {
      for(const file of files){
        if(!ativo)break;status('Analisando '+file.name+'…');
        try{
          if(!/\.pdf$/i.test(file.name)||file.size>15*1024*1024)throw Error('Selecione um PDF de até 15 MB.');
          const data=await file.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(b=>b.toString(16).padStart(2,'0')).join('');
          if(novos.some(a=>a.hash===hash))throw Error('Este PDF já está neste mês; cópia ignorada.');
          const resultado=vincularFolha(await extrairMinuta(data),competencia);
          resultado.registros=resultado.registros.map(r=>({...r,destinoOriginal:r.destino}));
          if(!resultado.registros.length)throw Error('Nenhum lançamento reconhecido. Confira o layout e se o PDF possui texto.');
          const chaves=new Set(novos.flatMap(a=>a.resultado.registros).map(r=>[r.data,r.numero,r.fonteCompleta,r.destino,r.centavos].join('|')));
          if(resultado.registros.some(r=>chaves.has([r.data,r.numero,r.fonteCompleta,r.destino,r.centavos].join('|'))))resultado.avisos.push('Há lançamentos iguais em outro PDF deste mês. Confira a sobreposição antes de usar os totais.');
          novos.push({nome:file.name,hash,resultado,pdf:file});
        }catch(err){erros.push(file.name+': '+(err.message||'Falha na leitura. Verifique o PDF e a conexão com o leitor.'));}
      }
      if(ativo&&novos.length!==arquivos.length)await gravar(novos,esperados);
      if(erros.length)status(erros.join(' | '));
    }catch(err){status(err.message+' Os novos PDFs não foram adicionados.');}
    finally{if(ativo){ocupado=false;$('#mi-pdf').value='';atualizar();}}
  };
  $('#mi-destino').onchange=$('#mi-fonte').onchange=$('#mi-revisado').onchange=render;
  $('#mi-abas').querySelectorAll('[data-aba]').forEach(b=>b.onclick=()=>{
    $('#mi-destino').value=b.dataset.aba;$('#mi-fonte').value='';$('#mi-busca').value='';render();
    $('#mi-resultado').scrollIntoView({behavior:'smooth',block:'start'});
  });
  $('#mi-busca').oninput=render;
  function baixar(blob,nome){const url=URL.createObjectURL(blob);urls.add(url);const a=document.createElement('a');a.href=url;a.download=nome;a.click();setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},1000);}
  $('#mi-csv').onclick=()=>{
    const cell=s=>'"'+String(s??'').replace(/^[=+@-]/,"'"+'$&').replace(/"/g,'""')+'"';
    const linhas=[['Competência da folha',competencia],['Conferência mensal (todos os lançamentos)'],['Destino','Importado','Esperado','Diferença','Arquivos']];
    const c=conferenciaMensal(arquivos,esperados),num=n=>n===null?'':(n/100).toFixed(2).replace('.',',');
    for(const b of c.blocos)linhas.push([b.destino,num(b.total),num(b.esperado),num(b.diferenca),b.arquivos]);
    linhas.push([],['Detalhamento conforme filtros'],['Destino','Tipo','Número','Data da arrecadação','Fonte','Fonte completa','Valor','Arquivo','Página']);
    for(const g of agruparMinuta(filtrados())){
      for(const r of g.registros)linhas.push([g.destino,r.tipo,r.numero,r.data,r.fonte,r.fonteCompleta,num(r.centavos),r.arquivo,r.pagina]);
      linhas.push([g.destino,'TOTAL DA FONTE','','',g.fonte,'',num(g.total)]);
    }
    baixar(new Blob(['\uFEFF'+linhas.map(l=>l.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'consignacoes-'+competencia+'.csv');
  };
  $('#mi-print').onclick=()=>{
    const w=window.open('','_blank');if(!w){status('Permita a abertura da janela para imprimir.');return;}w.opener=null;
    const c=conferenciaMensal(arquivos,esperados);
    w.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Consignações ${esc(competencia)} · SISDIFI</title><style>body{font:12px Arial;padding:20px;color:#172b42}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #ccc;text-align:left}small{display:block}.mi-valor{text-align:right}h3{margin-top:28px}tr{break-inside:avoid}thead{display:table-header-group}</style><h1>SISDIFI · Conferência mensal</h1>${resumo(c)}<p>${c.conferido?'Valores das quatro categorias conferem.':'Conferência pendente: revise arquivos, valores e avisos.'}</p>${c.trocas.map(t=>`<p>Possível troca: sobra ${moeda(t.valor)} em ${esc(t.sobra)}, falta igual em ${esc(t.falta)}.</p>`).join('')}<h2>Detalhamento conforme filtros</h2>${tabela(agruparMinuta(filtrados()))}</html>`);w.document.close();w.focus();w.print();
  };
  carregar();
  return{titulo:'Consignações por mês',limpar:()=>{ativo=false;arquivos=[];urls.forEach(u=>URL.revokeObjectURL(u));urls.clear();}};
}
