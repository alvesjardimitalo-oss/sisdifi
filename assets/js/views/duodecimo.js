// SISDIFI - Controle do duodécimo da Câmara Municipal.
// Armazenamento na área compartilhada do exercício financeiro, já sincronizada pelo Firebase.
// Cada atualização grava SOMENTE o registro alterado, preservando os outros repasses e os campos do exercício.
import * as db from '../db.js';
import { estado, pode } from '../estado.js';
import { esc, modal, confirmar, toast, mensagemErro, hojeISO } from '../ui.js';
import { META_MENSAL_PADRAO, MESES_DUODECIMO, centavosDuodecimo, dinheiroDuodecimo, dataDuodecimoBR, mesDoAno, competenciaDuodecimo, validarRepasse, repassesAtivos, resumoDuodecimo } from '../duodecimo.js';

const dinheiro = dinheiroDuodecimo;
const chave = x => String(x ?? '');
const estilo = '<style>'+
'.duod{color:#21374d;max-width:1240px;margin:0 auto}.duod *{box-sizing:border-box}'+
'.duod h1{margin:0 0 6px;color:#153d61;font-size:1.65rem}.duod h2{color:#183e5e;margin:0 0 12px;font-size:1.17rem}.duod .duod-muted{color:#617384;font-size:.88rem;margin:0 0 12px}'+
'.duod .dd-toolbar{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;margin:18px 0}.duod .dd-tools{display:flex;flex-wrap:wrap;align-items:flex-end;gap:9px}'+
'.duod .dd-box{background:#fff;border:1px solid #d8e3ed;border-radius:12px;padding:17px;margin:15px 0}'+
'.duod .dd-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0}'+
'.duod .dd-kpi{background:#fff;border:1px solid #dce6ef;border-radius:11px;padding:16px;min-width:0}'+
'.duod .dd-kpi small{display:block;color:#587081;font-size:.75rem;line-height:1.4;margin-bottom:6px}.duod .dd-kpi strong{display:block;color:#174368;font-size:1.4rem;white-space:nowrap;overflow-wrap:anywhere}.duod .dd-kpi.destaque{background:#edf6f0;border-color:#a7d0b5}.duod .dd-kpi.destaque strong{color:#236441}'+
'.duod .dd-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px}.duod .dd-mes{appearance:none;background:#fff;text-align:left;color:#264762;border:1px solid #cddce6;border-radius:10px;min-height:105px;padding:12px;cursor:pointer}.duod .dd-mes:hover{border-color:#3c82a9}.duod .dd-mes[aria-pressed=true]{border:2px solid #18547a;background:#eff7fb;padding:11px}.duod .dd-mes b,.duod .dd-mes span,.duod .dd-mes small{display:block}.duod .dd-mes b{font-size:.95rem}.duod .dd-mes span{font-weight:700;margin:8px 0 3px;font-size:.95rem}.duod .dd-mes small{font-size:.73rem;color:#5f7383}'+
'.duod .dd-progress{height:6px;background:#dfeaf2;border-radius:12px;overflow:hidden;margin-top:7px}.duod .dd-progress>i{display:block;height:100%;background:#268663}'+
'.duod .dd-head{display:flex;align-items:start;justify-content:space-between;gap:10px;flex-wrap:wrap}.duod .dd-head h2{margin:0}.duod .dd-resumo{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}.duod .dd-dado{background:#f3f7fb;border-radius:8px;padding:12px}.duod .dd-dado small{display:block;color:#617384;font-size:.78rem}.duod .dd-dado strong{display:block;color:#164468;font-size:1.1rem;margin-top:3px}'+
'.duod table{border-collapse:collapse;width:100%;min-width:660px}.duod th{background:#eef4fa;text-transform:uppercase;font-size:.72rem;letter-spacing:.3px;color:#506e83}.duod td,.duod th{text-align:left;padding:10px;border-bottom:1px solid #e3eaf0}.duod tbody tr:nth-child(even){background:#fbfdff}.duod .dd-num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.duod .dd-table{overflow-x:auto}.duod .dd-actions{display:flex;gap:6px;flex-wrap:wrap}.duod .dd-actions button{padding:6px 9px}.duod .dd-label{display:inline-block;border-radius:999px;padding:3px 9px;background:#fff3d8;color:#835615;font-size:.75rem;font-weight:700;white-space:nowrap}.duod .dd-label.pago{background:#e8f5ec;color:#276846}'+
'.duod .dd-warning{padding:12px;border-left:4px solid #c88e38;background:#fff8e8;border-radius:5px;color:#76551e;margin-top:10px}.duod .dd-status{color:#51667d;margin:8px 0;font-size:.9rem}.duod .dd-empty{text-align:center;padding:25px;color:#5c7385}'+
'.duod .dd-nota{color:#526879;font-size:.81rem;line-height:1.6;margin-top:12px}'+
'@media(max-width:1000px){.duod .dd-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}'+
'@media(max-width:700px){.duod .dd-kpis,.duod .dd-resumo{grid-template-columns:repeat(2,minmax(0,1fr))}.duod .dd-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.duod .dd-kpi strong{font-size:1.16rem}.duod .dd-tools{width:100%}.duod .dd-toolbar{align-items:stretch}.duod .dd-mes{min-height:95px}}'+
'</style>';

export function telaDuodecimo(el) {
  if (!pode.contabil()) return {titulo:'Acesso restrito'};
  let ano = Number(estado.exercicio) || new Date().getFullYear();
  let mes = mesDoAno(new Date().getMonth()+1);
  let documento = null, cancelou = false, desinscrever = null, erro = '', carregando = true, ocupada = false;
  const $ = seletor => el.querySelector(seletor);
  const selecaoAno = Array.from({length:11},(_,i)=>ano+3-i);
  el.innerHTML = estilo + '<section class="duod">'+
    '<h1>Controle de repasses do duodécimo</h1>'+
    '<p class="duod-muted">Câmara Municipal · Registre cada OP e a data em que o dinheiro foi efetivamente repassado. A competência continua sendo o mês a que o repasse se refere.</p>'+
    '<div class="dd-toolbar"><div class="dd-tools">'+
      '<label class="campo"><span>Exercício</span><select id="dd-ano">'+
      selecaoAno.map(y=>'<option value="'+y+'" '+(y===ano?'selected':'')+'>'+y+'</option>').join('')+
      '</select></label><label class="campo"><span>Mês de referência</span><select id="dd-mes">'+
      MESES_DUODECIMO.map((nome,i)=>'<option value="'+mesDoAno(i+1)+'" '+(mesDoAno(i+1)===mes?'selected':'')+'>'+nome+'</option>').join('')+
      '</select></label></div><div class="dd-tools"><button class="btn btn-sec" id="dd-csv" disabled>Exportar CSV anual</button><button class="btn btn-sec" id="dd-imprimir" disabled>Imprimir demonstrativo</button><button class="btn" id="dd-adicionar" disabled>+ Registrar OP / repasse</button></div></div>'+
    '<div id="dd-status" class="dd-status" role="status" aria-live="polite"></div>'+
    '<div id="dd-ano-kpis" class="dd-kpis"></div>'+
    '<section class="dd-box"><h2>Repasses por mês · <span id="dd-ano-label"></span></h2><div id="dd-meses" class="dd-grid"></div></section>'+
    '<section class="dd-box"><div class="dd-head"><div><h2 id="dd-mes-title"></h2><p class="duod-muted">Repasses vinculados à competência selecionada</p></div><span id="dd-mes-status" class="dd-label"></span></div>'+
    '<div id="dd-mes-dados" class="dd-resumo"></div><div id="dd-lista" class="dd-table"></div><div id="dd-alerta"></div></section>'+
    '<p class="dd-nota">A OP cadastrada sem data de repasse fica como <strong>pendente</strong> e não aumenta o valor pago. Somente transferências confirmadas entram no total repassado. Este controle não emite OPs no sistema contábil.</p>'+
    '</section>';
  function mostrarErro(t) {erro=t; const p=$('#dd-status');if(p)p.textContent=t;}
  function registros() {return repassesAtivos(documento);}
  function resumo() {return resumoDuodecimo(registros(), META_MENSAL_PADRAO, ano);}
  function estadoBotoes() {
    const bloqueio = carregando || ocupada || !!erro;
    $('#dd-adicionar').disabled = bloqueio;
    $('#dd-csv').disabled = bloqueio;
    $('#dd-imprimir').disabled = bloqueio;
  }
  function render() {
    if(cancelou)return;
    const resumoAno=resumo(), m=resumoAno.meses.find(m=>m.mes===mes);
    $('#dd-ano-label').textContent=String(ano);
    $('#dd-mes-title').textContent=MESES_DUODECIMO[Number(mes)-1]+' de '+ano;
    estadoBotoes();
    $('#dd-ano-kpis').innerHTML = [
      ['Previsão anual',resumoAno.metaTotal],
      ['Total repassado',resumoAno.pago],
      ['Saldo anual',resumoAno.saldo],
      ['OPs sem repasse',resumoAno.emAberto]
    ].map((v,i)=>'<div class="dd-kpi '+(i===1?'destaque':'')+'"><small>'+v[0]+'</small><strong>'+dinheiro(v[1])+'</strong></div>').join('');
    $('#dd-meses').innerHTML=resumoAno.meses.map(x=>
      '<button type="button" class="dd-mes" data-mes="'+x.mes+'" aria-pressed="'+(x.mes===mes)+'">'+
      '<b>'+x.nome+'</b><span>'+dinheiro(x.pago)+'</span><small>'+x.situacao+' · '+x.pagos.length+' repasse(s)</small>'+
      '<div class="dd-progress"><i style="width:'+x.percentual+'%"></i></div></button>'
    ).join('');
    $('#dd-mes-status').textContent=m.situacao;
    $('#dd-mes-status').className='dd-label '+(m.situacao==='Integral'?'pago':'');
    const dados=[
      ['Previsto no mês',m.meta],['Total repassado',m.pago],
      ['Saldo a repassar',m.saldo],['OPs aguardando pagamento',m.emAberto]
    ];
    $('#dd-mes-dados').innerHTML=dados.map(v=>'<div class="dd-dado"><small>'+v[0]+'</small><strong>'+dinheiro(v[1])+'</strong></div>').join('');
    const arr=[...m.repasses].sort((a,b)=>String(a.dataRepasse||a.dataOP).localeCompare(String(b.dataRepasse||b.dataOP)) || String(a.numeroOP).localeCompare(String(b.numeroOP)));
    $('#dd-lista').innerHTML=arr.length?
      '<table><thead><tr><th>Número da OP</th><th>Data da OP</th><th>Data do repasse</th><th>Situação</th><th class="dd-num">Valor</th><th>Ações</th></tr></thead><tbody>'+
      arr.map(r=>'<tr><td><strong>'+esc(r.numeroOP)+'</strong>'+(r.observacao?'<small class="bloco duod-muted">'+esc(r.observacao)+'</small>':'')+
        '</td><td>'+dataDuodecimoBR(r.dataOP)+'</td><td>'+dataDuodecimoBR(r.dataRepasse)+'</td>'+
        '<td><span class="dd-label '+(r.dataRepasse?'pago':'')+'">'+(r.dataRepasse?'Repassado':'OP pendente')+'</span></td>'+
        '<td class="dd-num"><strong>'+dinheiro(r.valorCentavos)+'</strong></td>'+
        '<td><div class="dd-actions"><button class="btn btn-sec btn-peq" data-editar="'+esc(r.id)+'">Editar</button>'+
        '<button class="btn btn-sec btn-peq" data-anular="'+esc(r.id)+'">Anular</button></div></td></tr>').join('')+
      '</tbody></table>':'<div class="dd-empty">Nenhuma OP registrada neste mês. Clique em “Registrar OP / repasse”.</div>';
    $('#dd-alerta').innerHTML=m.saldo<0?
      '<div class="dd-warning">O valor repassado ultrapassou a referência mensal em '+dinheiro(-m.saldo)+'. Confira os registros antes de fechar o mês.</div>':
      (m.pago>0 && m.saldo>0?
      '<div class="dd-warning">Repasse parcial: ainda restam '+dinheiro(m.saldo)+' para atingir os R$ 140.000,00 previstos neste mês.</div>':'');
    el.querySelectorAll('[data-mes]').forEach(b=>b.onclick=()=>{mes=b.dataset.mes;$('#dd-mes').value=mes;render();});
    el.querySelectorAll('[data-editar]').forEach(b=>b.onclick=()=>abrirFormulario(registros().find(r=>r.id===b.dataset.editar)));
    el.querySelectorAll('[data-anular]').forEach(b=>b.onclick=()=>anular(b.dataset.anular));
  }
  function ouvirAno() {
    if(desinscrever)desinscrever();
    documento=null;erro='';carregando=true;render();mostrarErro('Carregando repasses de '+ano+'…');
    desinscrever=db.ouvirDoc('exercicios',String(ano),doc=>{
      if(cancelou)return;documento=doc||{ano,duodecimo:{repasses:{}}};
      erro='';carregando=false;$('#dd-status').textContent='Dados sincronizados com o SISDIFI · exercício '+ano;render();
    }, e=>{if(cancelou)return;carregando=false;mostrarErro('Não foi possível carregar os repasses: '+mensagemErro(e));render();});
  }
  async function salvarRegistro(dados, anterior=null) {
    if(ocupada || carregando || erro)return;
    const validado=validarRepasse(dados,ano);
    const duplicado=registros().some(r=>r.id!==anterior?.id && r.numeroOP.toLowerCase()===validado.numeroOP.toLowerCase());
    if(duplicado)throw Error('Já existe uma OP com esse número neste exercício. Confira antes de cadastrar.');
    const id=anterior?.id || crypto.randomUUID(), agora=new Date().toISOString();
    const registro={...validado,criadoEm:anterior?.criadoEm||agora,criadoPor:anterior?.criadoPor||estado.sessao.nome,
      atualizadoEm:agora,atualizadoPor:estado.sessao.nome,anulado:false};
    ocupada=true;estadoBotoes();
    try {
      await db.salvar('exercicios',String(ano),{ano,duodecimo:{repasses:{[id]:registro}}});
      try{await db.registrarLog(anterior?'duodecimo.op.editar':'duodecimo.op.criar',
        {ano,competencia:registro.competencia,numeroOP:registro.numeroOP,valorCentavos:registro.valorCentavos,dataRepasse:registro.dataRepasse});}
      catch(e){toast('Registro salvo. Não foi possível registrar o log de auditoria.','erro');}
      toast(anterior?'OP atualizada.':'OP registrada com sucesso.');
      return true;
    } finally {ocupada=false;estadoBotoes();}
  }
  function abrirFormulario(registro=null) {
    if(carregando||erro)return;
    const atual=registro||{};
    const m=modal({titulo:registro?'Editar OP / repasse':'Registrar OP / repasse',largura:610,
      corpo:'<p class="muted">Competência: <strong>'+MESES_DUODECIMO[Number(mes)-1]+'/'+ano+
      '</strong>. Informe a data do repasse somente depois de confirmar que o pagamento foi realizado.</p>'+
      '<form id="dd-form" class="form-grid">'+
      '<label class="campo"><span>Número da OP *</span><input name="numeroOP" maxlength="80" required placeholder="Ex.: 2451/2026" value="'+esc(atual.numeroOP||'')+'"></label>'+
      '<label class="campo"><span>Valor da OP *</span><input name="valor" inputmode="decimal" required placeholder="Ex.: 35.000,00" value="'+(atual.valorCentavos?esc((atual.valorCentavos/100).toFixed(2).replace('.',',')):'')+'"></label>'+
      '<label class="campo"><span>Data de emissão da OP *</span><input type="date" name="dataOP" required value="'+esc(atual.dataOP||hojeISO())+'"></label>'+
      '<label class="campo"><span>Data do repasse efetivo</span><input type="date" name="dataRepasse" value="'+esc(atual.dataRepasse||'')+'"></label>'+
      '<label class="campo" style="grid-column:1/-1"><span>Observações (opcional)</span><textarea name="observacao" maxlength="500" rows="2" placeholder="Ex.: repasse parcial do mês">'+esc(atual.observacao||'')+'</textarea></label>'+
      '<p class="dica" style="grid-column:1/-1">Sem data do repasse, a OP aparece como pendente e NÃO soma ao total pago do mês. A data do repasse pode ser posterior ao mês de competência.</p>'+
      '<p id="dd-form-erro" class="erro-form" role="alert" style="grid-column:1/-1"></p>'+
      '<div class="acoes-form" style="grid-column:1/-1"><button class="btn btn-sec" type="button" id="dd-cancelar">Cancelar</button><button class="btn" type="submit" id="dd-enviar">Salvar registro</button></div></form>'
    });
    const form=m.el.querySelector('#dd-form');
    m.el.querySelector('#dd-cancelar').onclick=()=>m.fechar();
    form.onsubmit=async e=>{
      e.preventDefault();
      const btn=m.el.querySelector('#dd-enviar'), aviso=m.el.querySelector('#dd-form-erro');
      aviso.textContent='';btn.disabled=true;
      try {
        const dados={
          numeroOP:form.elements.numeroOP.value,valor:form.elements.valor.value,
          dataOP:form.elements.dataOP.value,dataRepasse:form.elements.dataRepasse.value,
          competencia:registro?.competencia||competenciaDuodecimo(ano,mes),
          observacao:form.elements.observacao.value
        };
        if(await salvarRegistro(dados,registro))m.fechar();
      } catch(err){aviso.textContent=mensagemErro(err)||err.message;btn.disabled=false;}
    };
  }
  async function anular(id) {
    const r=registros().find(x=>x.id===id);
    if(!r||ocupada)return;
    const ok=await confirmar('Anular a OP '+r.numeroOP+' ('+dinheiro(r.valorCentavos)+')? Ela sairá dos totais, mas ficará preservada no histórico para auditoria.',
      {titulo:'Anular registro',ok:'Anular OP',perigo:true});
    if(!ok)return;
    ocupada=true;estadoBotoes();
    try {
      const {id: ignorado, ...dadosExistentes} = r;
      await db.salvar('exercicios',String(ano),{ano,duodecimo:{repasses:{[id]:{...dadosExistentes,anulado:true,
        anuladoEm:new Date().toISOString(),anuladoPor:estado.sessao.nome}}}});
      try{await db.registrarLog('duodecimo.op.anular',{ano,competencia:r.competencia,numeroOP:r.numeroOP,valorCentavos:r.valorCentavos});}
      catch(e){toast('OP anulada. Falha ao registrar log de auditoria.','erro');}
      toast('OP anulada e excluída dos totais.');
    } catch(e){toast(mensagemErro(e),'erro');}
    finally {ocupada=false;estadoBotoes();}
  }
  function exportarCSV() {
    const linhas=[['SISDIFI - Controle de Duodécimo','Ano '+ano],
      ['Competência','Meta mensal','Repassado','Saldo','OP emitida e não paga','Número da OP','Data da OP','Data do repasse','Valor da OP','Situação','Observação']];
    const r=resumo();
    for(const m of r.meses) {
      if(!m.repasses.length)linhas.push([m.nome+'/'+ano,dinheiro(m.meta),dinheiro(m.pago),dinheiro(m.saldo),dinheiro(m.emAberto)]);
      else for(const x of m.repasses)linhas.push([m.nome+'/'+ano,dinheiro(m.meta),dinheiro(m.pago),dinheiro(m.saldo),dinheiro(m.emAberto),
        x.numeroOP,dataDuodecimoBR(x.dataOP),dataDuodecimoBR(x.dataRepasse),dinheiro(x.valorCentavos),x.dataRepasse?'Pago':'OP pendente',x.observacao||'']);
    }
    const proteger=t=>'"'+String(t??'').replace(/^[=+@-]/,"'"+'$&').replace(/"/g,'""')+'"';
    const blob=new Blob(['\uFEFF'+linhas.map(l=>l.map(proteger).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='duodecimo-camara-'+ano+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function imprimir() {
    const m=resumo().meses.find(x=>x.mes===mes),w=window.open('','_blank');
    if(!w){toast('Libere o pop-up para imprimir.','erro');return;}
    w.opener=null;
    const logo=new URL('assets/img/brasao.png',document.baseURI).href;
    const rows=m.repasses.map(r=>'<tr><td>'+esc(r.numeroOP)+'</td><td>'+dataDuodecimoBR(r.dataOP)+'</td><td>'+dataDuodecimoBR(r.dataRepasse)+
      '</td><td>'+esc(r.dataRepasse?'Repassado':'OP pendente')+'</td><td class="valor">'+dinheiro(r.valorCentavos)+'</td></tr>').join('');
    const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Duodécimo · '+mes+'/'+ano+'</title><style>'+
      '@page{size:A4;margin:15mm}body{font:12px Arial;color:#19334b;margin:0}h1{font-size:18px;color:#164e73}h2{font-size:15px}small{color:#536879}header{display:flex;gap:12px;align-items:center;border-bottom:3px solid #287b4e;padding-bottom:12px;margin-bottom:20px}header img{width:65px;height:65px;object-fit:contain}.resumo{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.bloco{flex:1;background:#f0f5f9;border:1px solid #d9e5ee;padding:11px}.bloco small,.bloco strong{display:block}.bloco strong{font-size:15px;margin-top:5px}table{width:100%;border-collapse:collapse}th{background:#eaf2f8}td,th{text-align:left;padding:8px;border-bottom:1px solid #d7e1e8}.valor{text-align:right;white-space:nowrap}tr{break-inside:avoid}.assin{display:flex;gap:25px;margin-top:70px}.assin span{flex:1;border-top:1px solid #8797a7;text-align:center;padding-top:8px}'+
      '</style></head><body><header><img src="'+esc(logo)+'" alt="Brasão municipal"><div><strong>PREFEITURA MUNICIPAL DE FREI INOCÊNCIO</strong><br>Setor de Contabilidade · SISDIFI</div></header>'+
      '<h1>CONTROLE DE REPASSES DO DUODÉCIMO</h1><h2>Câmara Municipal · '+MESES_DUODECIMO[Number(mes)-1]+'/'+ano+'</h2>'+
      '<div class="resumo"><div class="bloco"><small>Previsão mensal</small><strong>'+dinheiro(m.meta)+'</strong></div>'+
      '<div class="bloco"><small>Repassado</small><strong>'+dinheiro(m.pago)+'</strong></div>'+
      '<div class="bloco"><small>Saldo a repassar</small><strong>'+dinheiro(m.saldo)+'</strong></div></div>'+
      '<table><thead><tr><th>Número da OP</th><th>Emissão</th><th>Data do repasse</th><th>Situação</th><th class="valor">Valor</th></tr></thead><tbody>'+
      (rows||'<tr><td colspan="5">Nenhuma OP registrada.</td></tr>')+'</tbody></table>'+
      '<p><small>Somente OPs com data de repasse confirmada compõem o total pago. Este é um demonstrativo interno, não uma ordem de pagamento.</small></p>'+
      '<div class="assin"><span>Responsável pela conferência</span><span>Setor de Contabilidade</span></div></body></html>';
    w.document.write(html);w.document.close();w.focus();
    setTimeout(()=>w.print(),300);
  }
  $('#dd-mes').onchange=e=>{mes=e.target.value;render();};
  $('#dd-ano').onchange=e=>{ano=Number(e.target.value);ouvirAno();};
  $('#dd-adicionar').onclick=()=>abrirFormulario();
  $('#dd-csv').onclick=exportarCSV;
  $('#dd-imprimir').onclick=imprimir;
  ouvirAno();
  return {titulo:'Duodécimo da Câmara',limpar:()=>{cancelou=true;desinscrever?.();}};
}
