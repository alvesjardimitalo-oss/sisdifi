// SISDIFI — Folha de pagamentos: geração de relação prévia de empenhos.
// Exclusivo de Contabilidade/ADM. Não grava dados de folha no Firebase.
import {estado,pode} from '../estado.js';
import {esc,toast} from '../ui.js';
import {analisarResumoVerbas,analisarResumoConsolidado,prepararEmpenhos,conferirConsignadosFolha,centavosFolha,dinheiroFolha} from '../folha-empenhos.js';
import {extrairLinhasDaFolha} from '../folha-empenhos-pdf.js';
import {sugerirMaternidadesDaFolha,consolidarMaternidade} from '../folha-maternidade.js';
import {gerarPlanilhaFolha} from '../folha-empenhos-xlsx.js';
import {carregarRegistroFolha,salvarRegistroFolha} from '../folha-empenhos-store.js';
import {carregarMes} from '../consignacoes-mensal.js?v=3.13.0';

const tipos={principal:'Folha principal',extra:'Folha extra · incentivo federal (dia 10)',decimo:'Adiantamento de 50% do 13º',rescisao:'Rescisões'};
const formato=c=>(Number(c||0)/100).toFixed(2).replace('.',',');
function baixar(nome,blob){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=nome;a.click();setTimeout(()=>URL.revokeObjectURL(url),2500);
}
function csv(linhas){return '\ufeff'+linhas.map(l=>l.map(v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"').join(';')).join('\r\n');}
function parseCSV(texto) {
  const linhas=[],campos=[];let atual='',aspas=false;
  for(let i=0;i<texto.length;i++){
    const c=texto[i];
    if(c==='"'){if(aspas&&texto[i+1]==='"'){atual+='"';i++;}else aspas=!aspas;}
    else if(c===';'&&!aspas){campos.push(atual);atual='';}
    else if((c==='\n'||c==='\r')&&!aspas){if(c==='\r'&&texto[i+1]==='\n')i++;campos.push(atual);linhas.push([...campos]);campos.length=0;atual='';}
    else atual+=c;
  }
  if(atual||campos.length){campos.push(atual);linhas.push(campos);}
  return linhas;
}
export function telaFolhaEmpenhos(el){
  if(!pode.contabil())return {titulo:'Acesso restrito'};
  const uid=estado.sessao?.uid;
  let competencia=new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0');
  let primeiro=5000,arquivos={},pessoas=[],mapa={},aprovouMapa=false,aprovouConsignados=false;
  let minutas=[],alertas=[],nomeConsolidado='',origemIndividual='',filtro='todos',visao='resumo',carregando=false,ativa=true,filaDeSalvamento=Promise.resolve();
  const $=sel=>el.querySelector(sel);
  const estilo='<style>'+
    '.fe{max-width:1350px;margin:0 auto;color:#233e58}.fe h1{color:#174366;font-size:1.55rem;margin:0 0 8px}.fe h2{font-size:1.12rem;color:#174366;margin:0 0 12px}'+
    '.fe p{line-height:1.52}.fe .fe-muted{color:#66798b;font-size:.85rem}.fe .fe-card{background:#fff;border:1px solid #dce5ee;border-radius:12px;margin:14px 0;padding:17px}'+
    '.fe .fe-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.fe .fe-files{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}'+
    '.fe .fe-file{display:block;border:1px dashed #b8ccd9;border-radius:8px;padding:12px;background:#f7fafd}.fe .fe-file strong,.fe .fe-file small{display:block}.fe .fe-file small{font-size:.8rem;color:#526b80;margin:5px 0}'+
    '.fe .fe-file input{width:100%;font-size:.8rem}.fe .fe-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.fe .fe-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}'+
    '.fe .fe-kpis div{border:1px solid #d7e4ee;background:#f7fbff;border-radius:8px;padding:12px}.fe .fe-kpis small{font-size:.74rem;color:#526c82;display:block}.fe .fe-kpis strong{font-size:1.13rem;color:#13466a;display:block;margin-top:5px}'+
    '.fe .fe-scroll{overflow:auto;max-width:100%}.fe table{border-collapse:collapse;width:100%;font-size:.82rem}.fe th,.fe td{padding:8px;border-bottom:1px solid #e1e9ef;text-align:left;vertical-align:middle}'+
    '.fe th{background:#edf4f9;color:#345975;white-space:nowrap}.fe td input{border:1px solid #b9ccda;border-radius:5px;padding:6px;min-width:78px;width:100px;font-size:.8rem}'+
    '.fe .fe-money{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.fe .fe-alert{border-left:4px solid #bc8b31;background:#fff8e9;padding:10px;margin:9px 0;color:#704e21;border-radius:4px}'+
    '.fe .fe-danger{border-left:4px solid #ba4444;background:#ffefee;padding:10px;margin:9px 0;color:#8b3333;border-radius:4px}.fe .fe-ok{border-left:4px solid #36865c;background:#eef9f1;padding:10px;margin:9px 0;color:#265f3f;border-radius:4px}'+
    '.fe details{margin:14px 0}.fe summary{cursor:pointer;font-weight:600}.fe .fe-status{color:#8b5a1e;font-size:.76rem;min-width:160px}.fe button{white-space:nowrap}'+
    '@media(max-width:780px){.fe .fe-grid{grid-template-columns:1fr 1fr}.fe .fe-files{grid-template-columns:1fr}.fe .fe-kpis{grid-template-columns:1fr 1fr}}'+
    '@media(max-width:500px){.fe .fe-grid{grid-template-columns:1fr}}'+
    '</style>';
  el.innerHTML=estilo+'<div class="fe">'+
    '<h1>Folha de pagamentos · Relação de empenhos</h1>'+
    '<p class="fe-muted">Prefeitura Municipal de Frei Inocêncio — prévia contábil por lotação. Uma linha por empenho, com bruto, descontos, líquido, ficha e fonte. Não registra empenho ou liquidação no sistema contábil.</p>'+
    '<section class="fe-card"><div class="fe-grid">'+
      '<label class="campo"><span>Competência</span><input type="month" id="fe-comp" value="'+esc(competencia)+'"></label>'+
      '<label class="campo"><span>Primeiro número do empenho</span><input type="number" min="1" id="fe-inicio" value="5000"></label>'+
      '<label class="campo"><span>Filtrar empenhos</span><select id="fe-filtro"><option value="todos">Todos</option><option value="pendentes">Com pendências</option><option value="principal">Folha principal</option><option value="decimo">13º adiantamento</option><option value="rescisao">Rescisões</option></select></label>'+
    '</div><p id="fe-status" class="fe-muted" role="status" aria-live="polite"></p></section>'+
    '<section class="fe-card"><h2>1 · Importar a folha</h2>'+
      '<label class="fe-file" style="display:block;border:2px solid #3981b4;background:#eef7ff;padding:19px;margin-bottom:12px">'+
      '<strong style="font-size:1.05rem;color:#16456a">Escolha um único arquivo do RH (PDF)</strong>'+
      '<small>Importe o Resumo de Verbas consolidado. O SISDIFI identifica as lotações, separa folha principal, adiantamento do 13º, folha extra e rescisões, gera os valores e calcula os descontos. Ficha e fonte ficam para você preencher.</small>'+
      '<input data-importar="automatico" type="file" accept=".pdf,application/pdf">'+
      '<span id="fe-nome-automatico" class="fe-muted">Nenhum arquivo importado</span></label>'+
      '<details><summary>Importação separada (opcional, para casos especiais)</summary><div class="fe-files">'+
      '<label class="fe-file" style="border-color:#3d89bd;background:#eff8ff"><strong>Resumo de Verbas consolidado · todos os tipos</strong><small>Preferencial: um único PDF contendo folha principal, extra, 13º e rescisões. Separa pelo tipo de folha do cabeçalho e pela lotação completa.</small><input data-importar="consolidado" type="file" accept=".pdf"><span id="fe-nome-consolidado" class="fe-muted">Não enviado</span></label>'+
      '<label class="fe-file"><strong>Resumo de Verbas da folha principal</strong><small>Dados por lotação, rubricas e totais da liquidação.</small><input data-importar="principal" type="file" accept=".pdf"><span id="fe-nome-principal" class="fe-muted">Não enviado</span></label>'+
      '<label class="fe-file"><strong>Resumo de Verbas · Folha extra do dia 10</strong><small>Incentivo da enfermagem e eventuais diferenças salariais. Informe se o incentivo já compõe o bruto do RH.</small><input data-importar="extra" type="file" accept=".pdf"><span id="fe-nome-extra" class="fe-muted">Não enviado</span></label>'+ 
      '<label class="fe-file"><strong>Resumo do adiantamento de 50% do 13º</strong><small>Opcional, quando houver na competência.</small><input data-importar="decimo" type="file" accept=".pdf"><span id="fe-nome-decimo" class="fe-muted">Não enviado</span></label>'+
      '<label class="fe-file"><strong>Resumo de Verbas das rescisões</strong><small>Opcional, quando houver rescisões.</small><input data-importar="rescisao" type="file" accept=".pdf"><span id="fe-nome-rescisao" class="fe-muted">Não enviado</span></label>'+
      '<label class="fe-file"><strong>Folha nominal consolidada · identificação das servidoras</strong><small>Para identificar matrícula, servidora, rubrica 163 e INSS (201). Confirmação individual obrigatória.</small><input data-importar="nominal" type="file" accept=".pdf"><span id="fe-nome-nominal" class="fe-muted">Não enviado</span></label>'+
    '</div></details><div id="fe-avisos"></div></section>'+
    '<section class="fe-card"><div class="fe-actions"><h2>2 · Servidoras com salário-maternidade</h2><button id="fe-nova-servidora" type="button" class="btn btn-sec">+ Adicionar registro</button></div>'+
      '<p class="fe-muted">O INSS individual confirmado é retirado do desconto do empenho principal e transferido para a retenção da OP extraorçamentária. A rubrica 229 (prorrogação) não é convertida automaticamente. Se o layout nominal não for reconhecido, preencha manualmente com base no contracheque.</p>'+
      '<div id="fe-pessoas"></div></section>'+
    '<section class="fe-card"><h2>3 · Preencha ficha e fonte de recursos</h2>'+
      '<p class="fe-muted">Na folha extra, se o incentivo federal estiver informado fora do bruto do RH, escolha <strong>Somar ao bruto</strong> na respectiva lotação. Se já estiver incluído, escolha <strong>Já incluído</strong>. Não haverá INSS automático na extra: eventual desconto na folha seguinte será conferido separadamente.</p>'+
      '<p class="fe-muted">O Resumo de Verbas já fornece bruto, composição dos descontos e líquido por empenho. Você só precisa informar ficha e fonte, conferir os valores e, se desejar, a conta bancária. Reaproveitamos as informações por lotação nos meses seguintes.</p>'+
      '<div class="fe-actions"><button class="btn btn-sec" id="fe-baixar-mapa" type="button">Baixar modelo CSV</button>'+
      '<label class="btn btn-sec" style="cursor:pointer">Importar mapa CSV <input id="fe-ler-mapa" type="file" accept=".csv,text/csv" style="display:none"></label>'+
      '<label><input type="checkbox" id="fe-confirmar-mapa"> Conferi as fichas e fontes na LOA</label></div><div id="fe-mapa-notas"></div></section>'+
    '<section class="fe-card"><h2>4 · Conferência de consignados e pensões</h2>'+
      '<p class="fe-muted">Consulta as minutas já lidas na aba Consignações por mês, neste mesmo navegador e conta. A comparação automática é por total de cada banco, não garante por si só a lotação de cada guia.</p>'+
      '<div class="fe-actions"><button class="btn btn-sec" type="button" id="fe-buscar-minutas">Consultar minutas</button>'+
      '<label><input type="checkbox" id="fe-confirmar-bancos"> Conferi também a distribuição dos descontos por empenho</label></div><div id="fe-bancos"></div></section>'+
    '<section class="fe-card"><div class="fe-actions"><h2>5 · Empenhos gerados automaticamente</h2>'+ 
      '<label class="campo"><span>Visualização</span><select id="fe-visao"><option value="resumo">Empenhos: ficha, fonte, bruto e líquido</option><option value="composicao">Composição dos descontos</option></select></label>'+
      '<button class="btn btn-sec" type="button" id="fe-rascunho">Baixar rascunho XLSX</button>'+
      '<button class="btn" type="button" id="fe-final" disabled>Baixar planilha conferida XLSX</button></div>'+
      '<div id="fe-kpis" class="fe-kpis"></div><div id="fe-pendencias"></div>'+ 
      '<p class="fe-muted">Uma linha por empenho. A composição mostra Caixa, Sicoob, Bradesco, pensões, INSS, IRRF e demais descontos, com rubricas originais e conferência da soma.</p>'+ 
      '<div class="fe-scroll" id="fe-tabela"></div><div id="fe-extras"></div>'+
      '<p class="fe-muted">Dados armazenados no navegador, separados pela conta. A planilha contém fórmulas de líquido para a Contabilidade conferir e preencher a liquidação no sistema oficial.</p>'+
    '</section></div>';
  const status=t=>{$('#fe-status').textContent=t;};
  const arquivosLista=()=>Object.values(arquivos);
  const montar=()=>{
    if(!Object.values(arquivos).some(x=>x?.registros?.length))return null;
    const maternidade=consolidarMaternidade(pessoas,[arquivos.principal].filter(Boolean));
    return {maternidade,previsao:prepararEmpenhos(arquivosLista(),primeiro,mapa,maternidade.ajustes)};
  };
  function persistir(){
    if(!uid||!ativa||carregando)return Promise.resolve();
    const compAtual=competencia;
    const mensal=structuredClone({primeiro,arquivos,pessoas,aprovouMapa,aprovouConsignados,origemIndividual,nomeConsolidado});
    const mapaAtual=structuredClone(mapa);
    filaDeSalvamento=filaDeSalvamento.catch(()=>{}).then(async()=>{
      await salvarRegistroFolha(uid,compAtual,mensal);
      await salvarRegistroFolha(uid,'mapa-lotacoes',mapaAtual);
    }).catch(e=>{status('Erro ao salvar localmente: '+(e.message||e));});
    return filaDeSalvamento;
  }
  async function carregar(){
    const alvo=competencia;carregando=true;status('Carregando dados de '+alvo+'…');
    try{
      const [mensal,reusavel]=await Promise.all([carregarRegistroFolha(uid,alvo),carregarRegistroFolha(uid,'mapa-lotacoes')]);
      if(!ativa||alvo!==competencia)return;
      primeiro=mensal?.primeiro||5000;arquivos=mensal?.arquivos||{};pessoas=mensal?.pessoas||[];
      aprovouMapa=!!mensal?.aprovouMapa;aprovouConsignados=!!mensal?.aprovouConsignados;origemIndividual=mensal?.origemIndividual||'';nomeConsolidado=mensal?.nomeConsolidado||'';
      mapa=reusavel||{};
      $('#fe-inicio').value=primeiro;$('#fe-confirmar-mapa').checked=aprovouMapa;$('#fe-confirmar-bancos').checked=aprovouConsignados;
      minutas=[];status('Dados deste mês carregados. Consulte as minutas para verificar os descontos.');
    }catch(e){status('Histórico local indisponível: '+(e.message||e));}
    finally{carregando=false;render();}
  }
  const conciliar=x=>conferirConsignadosFolha(x.previsao.empenhos,minutas);
  function finalPossivel(x){
    if(!x||!Object.values(arquivos).some(a=>a?.registros?.length)||alertas.length||x.maternidade.avisos.length||x.previsao.pendentes.length||!aprovouMapa)return false;
    const contemBancoOuPensao=x.previsao.empenhos.some(e=>Object.values(e.bancos||{}).some(v=>v>0));
    if((arquivos.principal||contemBancoOuPensao) && (!minutas.length||!aprovouConsignados))return false;
    if(arquivosLista().some(f=>f.avisos?.length))return false;
    return (!arquivos.principal&&!contemBancoOuPensao)||conciliar(x).every(r=>r.conferido);
  }
  function renderPessoas(){
    const r=arquivos.principal?.registros?.filter(x=>x.valores.maternidade)||[];
    const info=r.map(x=>'<span style="display:inline-block;margin:5px;padding:6px;background:#eef5fb;border-radius:6px">Lotação '+esc(x.lotacao)+' · '+dinheiroFolha(x.valores.maternidade)+'</span>').join('');
    const tabela='<div class="fe-scroll"><table><thead><tr><th>Nome</th><th>Matrícula</th><th>Lotação</th><th>Benefício bruto</th><th>INSS individual</th><th>Origem</th><th>Conferi</th><th>Excluir</th></tr></thead><tbody>'+
      (pessoas.length?pessoas.map((p,i)=>'<tr><td><input style="width:175px" data-pessoa="'+i+'" data-campo="nome" value="'+esc(p.nome||'')+'"></td>'+
        '<td><input data-pessoa="'+i+'" data-campo="matricula" value="'+esc(p.matricula||'')+'"></td>'+
        '<td><input style="width:150px" data-pessoa="'+i+'" data-campo="lotacao" value="'+esc(p.lotacao||'')+'"></td>'+
        '<td><input data-pessoa="'+i+'" data-campo="beneficio" value="'+formato(p.beneficio)+'"></td>'+
        '<td><input data-pessoa="'+i+'" data-campo="inss" value="'+formato(p.inss)+'"></td>'+
        '<td>'+esc(p.origem||'Manual')+(p.pagina?' p. '+p.pagina:'')+'</td>'+
        '<td><input type="checkbox" data-pessoa="'+i+'" data-campo="confirmado" '+(p.confirmado?'checked':'')+'></td>'+
        '<td><button class="btn btn-sec" type="button" data-excluir="'+i+'">Excluir</button></td></tr>').join(''):
        '<tr><td colspan="8">Nenhuma servidora identificada. Importe a folha nominal ou adicione registros.</td></tr>')+
      '</tbody></table></div>';
    const check=consolidarMaternidade(pessoas,[arquivos.principal||{registros:[]}]);
    $('#fe-pessoas').innerHTML=info+tabela+check.avisos.map(a=>'<p class="fe-alert">'+esc(a)+'</p>').join('');
    $('#fe-pessoas').querySelectorAll('[data-pessoa]').forEach(i=>i.onchange=()=>{
      const idx=Number(i.dataset.pessoa),campo=i.dataset.campo;
      if(!pessoas[idx])return;
      try{
        pessoas[idx][campo]=campo==='confirmado'?i.checked:campo==='beneficio'||campo==='inss'?centavosFolha(i.value.includes(',')?i.value:i.value+',00'):i.value.trim();
        if(campo!=='confirmado')pessoas[idx].confirmado=false;
        persistir();render();
      }catch(e){toast(e.message,'erro');render();}
    });
    $('#fe-pessoas').querySelectorAll('[data-excluir]').forEach(b=>b.onclick=()=>{
      if(!window.confirm('Excluir este registro local?'))return;
      pessoas.splice(Number(b.dataset.excluir),1);persistir();render();
    });
  }
  function render(){
    if(!ativa)return;
    $('#fe-nome-consolidado').textContent=nomeConsolidado||'Não enviado';
    for(const tipo of Object.keys(tipos)){
      $('#fe-nome-'+tipo).textContent=arquivos[tipo]?arquivos[tipo].arquivo+' ('+arquivos[tipo].registros.length+' lotações)':'Não enviado';
    }
    $('#fe-nome-nominal').textContent=origemIndividual||'Não enviado';
    $('#fe-avisos').innerHTML=alertas.map(x=>'<p class="fe-alert">'+esc(x)+'</p>').join('');
    renderPessoas();
    const pacote=montar();
    if(!pacote){
      $('#fe-kpis').innerHTML='';$('#fe-pendencias').innerHTML='<p class="fe-alert">Importe o Resumo de Verbas principal ou o Resumo da folha extra do dia 10.</p>';
      $('#fe-bancos').innerHTML='<p class="fe-muted">Aguardando dados da folha.</p>';
      $('#fe-tabela').innerHTML='';$('#fe-extras').innerHTML='';$('#fe-final').disabled=true;return;
    }
    const p=pacote.previsao,possivel=finalPossivel(pacote);
    const campos=[['Empenhos previstos',String(p.empenhos.length)],['Bruto orçamentário',dinheiroFolha(p.totalBruto)],
      ['Desconto ajustado',dinheiroFolha(p.totalDescontoAjustado)],['Líquido ajustado',dinheiroFolha(p.totalLiquido)]];
    $('#fe-kpis').innerHTML=campos.map(x=>'<div><small>'+x[0]+'</small><strong>'+x[1]+'</strong></div>').join('');
    $('#fe-pendencias').innerHTML='<p class="'+(possivel?'fe-ok':'fe-alert')+'">'+
      (possivel?'Planilha conferida habilitada. Revise os lançamentos no sistema contábil.':
        p.pendentes.length+' empenho(s) com pendências. Os PDFs e a planilha podem ser conferidos em rascunho.')+'</p>'+
      '<p class="fe-muted">Numeração sugerida: '+p.primeiro+' até '+p.ultimo+'. A ordem é: folha principal por secretaria/vínculo, 13º, depois rescisões.</p>'+
      pacote.maternidade.avisos.map(x=>'<p class="fe-alert">'+esc(x)+'</p>').join('')+
      arquivosLista().flatMap(a=>a.avisos||[]).slice(0,18).map(x=>'<p class="fe-alert">'+esc(x)+'</p>').join('');
    $('#fe-final').disabled=!possivel;
    const cs=conciliar(pacote);
    $('#fe-bancos').innerHTML='<div class="fe-scroll"><table><thead><tr><th>Banco/desconto</th><th>RH</th><th>Minuta</th><th>Diferença</th><th>Situação</th></tr></thead><tbody>'+
      cs.map(c=>'<tr><td>'+esc(c.banco)+'</td><td>'+dinheiroFolha(c.esperado)+'</td><td>'+dinheiroFolha(c.minuta)+'</td>'+
        '<td class="fe-money">'+dinheiroFolha(c.diferenca)+'</td><td>'+(c.conferido?'Total conferido':'PENDENTE')+'</td></tr>').join('')+'</tbody></table></div>'+
      (!minutas.length?'<p class="fe-alert">Sem minutas carregadas. Consulte a competência correspondente.</p>':'')+
      '<p class="fe-muted">A igualdade do total por banco não prova que cada guia está vinculada à lotação correta.</p>';
    const registros=p.empenhos.filter(e=>filtro==='todos'||filtro==='pendentes'&&e.problemas.length||e.tipo===filtro);
    if(visao==='resumo'){
    $('#fe-tabela').innerHTML='<table><thead><tr><th>Empenho</th><th>Grupo</th><th>Secretaria</th><th>Vínculo</th><th>Lotação</th><th>Ficha</th><th>Fonte</th><th>Conta</th><th class="fe-money">Bruto</th><th class="fe-money">Desconto RH</th><th class="fe-money">INSS extra</th><th class="fe-money">Líquido</th><th>Pendências</th></tr></thead><tbody>'+
      registros.map(r=>{
        const m=mapa[r.id]||mapa[r.lotacao]||{};
        return '<tr><td><strong>'+r.empenho+'</strong></td><td>'+esc(tipos[r.tipo])+'</td>'+
          '<td><input style="width:170px" data-ref="'+esc(r.id)+'" data-campo="secretaria" value="'+esc(m.secretaria||r.secretaria||'')+'"></td>'+
          '<td><input style="width:115px" data-ref="'+esc(r.id)+'" data-campo="vinculo" value="'+esc(m.vinculo||r.vinculo||'')+'"></td>'+
        '<td>'+esc(r.lotacao)+'</td>'+
        ['ficha','fonte','conta'].map(col=>'<td><input data-ref="'+esc(r.id)+'" data-campo="'+col+'" value="'+esc(m[col]||'')+'"></td>').join('')+
        '<td class="fe-money">'+dinheiroFolha(r.bruto||0)+(r.tipo==='extra'&&r.incentivo?'<small style="display:block;color:#506d82">Incentivo: '+dinheiroFolha(r.incentivo)+'</small>':'')+'</td><td class="fe-money">'+dinheiroFolha(r.descontoRH||0)+'</td>'+
        '<td class="fe-money">'+dinheiroFolha(r.maisInssExtra)+'</td><td class="fe-money"><strong>'+dinheiroFolha(r.liquido||0)+'</strong></td>'+
        '<td class="fe-status">'+esc(r.problemas.join('; ')||'Pronto para conferir')+'</td></tr>';
      }).join('')+'</tbody></table>';
    }else{
      const cabecalhos=['Empenho','Secretaria / vínculo','Lotação','Bruto','Caixa','Sicoob','Bradesco','Pensão',
        'INSS original','Imposto de Renda','Outros','Soma das rubricas','Desconto do RH','Diferença',
        'INSS maternidade para OP extra','Desconto a liquidar','Líquido','Rubricas de origem'];
      const linhas=registros.map(r=>{
        const c=r.composicao||{};
        const detalhes=(r.rubricasDesconto||[]).map(v=>
          '<li><strong>'+esc(v.codigo)+' — '+esc(v.descricao)+'</strong> · '+esc(v.categoria)+
          ' · '+dinheiroFolha(v.valor)+' <small>(p. '+esc(v.pagina||r.pagina)+')</small></li>').join('');
        return '<tr><td><strong>'+r.empenho+'</strong></td><td>'+esc(r.secretaria)+'<br><small>'+esc(r.vinculo)+'</small></td><td>'+esc(r.lotacao)+'</td>'+ 
          '<td class="fe-money"><strong>'+dinheiroFolha(r.bruto||0)+'</strong></td>'+
          ['Caixa','Sicoob','Bradesco','Pensao','INSS','IRRF','Outros'].map(cat=>
            '<td class="fe-money">'+dinheiroFolha(c[cat]||0)+'</td>').join('')+
          '<td class="fe-money"><strong>'+dinheiroFolha(r.composicaoTotal||0)+'</strong></td>'+
          '<td class="fe-money">'+dinheiroFolha(r.descontoRH||0)+'</td>'+
          '<td class="fe-money" style="'+(r.diferencaComposicao?'color:#b53c30;font-weight:700':'color:#287746')+'">'+
          (r.diferencaComposicao==null?'Pendente':dinheiroFolha(r.diferencaComposicao))+'</td>'+ 
          '<td class="fe-money">'+dinheiroFolha(r.maisInssExtra)+'</td>'+ 
          '<td class="fe-money">'+dinheiroFolha(r.descontoAjustado||0)+'</td>'+ 
          '<td class="fe-money"><strong>'+dinheiroFolha(r.liquido||0)+'</strong></td>'+
          '<td><details><summary>Ver ('+(r.rubricasDesconto||[]).length+')</summary>'+
          '<ul style="min-width:270px;padding-left:18px">'+(detalhes||'<li>Não foi identificado o bloco de descontos do RH.</li>')+
          '</ul><small>Origem: '+esc(r.arquivo)+' · lotação '+esc(r.lotacao)+'</small></details></td></tr>';
      }).join('');
      $('#fe-tabela').innerHTML='<table><thead><tr>'+cabecalhos.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+
        (linhas||'<tr><td colspan="18">Nenhum empenho neste filtro.</td></tr>')+'</tbody></table>';
    }
    $('#fe-tabela').querySelectorAll('[data-ref]').forEach(input=>input.onchange=()=>{
      const k=input.dataset.ref,campo=input.dataset.campo;
      mapa[k]={...(mapa[k]||{}),[campo]:input.value.trim()};
      aprovouMapa=false;$('#fe-confirmar-mapa').checked=false;persistir();render();
    });
    const situacoes=p.previsao?.empenhos||p.empenhos;
    const incentivos=situacoes.filter(r=>r.tipo==='extra'&&r.incentivo>0);
    const boxIncentivo=incentivos.map(r=>{
      const decisao=mapa[r.id]?.incentivoNoBruto||'';
      return '<label style="display:flex;gap:10px;align-items:center;margin:8px 0;flex-wrap:wrap"><strong>Lotação '+esc(r.lotacao)+'</strong> · Incentivo: '+dinheiroFolha(r.incentivo)+
        ' · Bruto informado pelo RH: '+dinheiroFolha(r.brutoRH||0)+
        ' <select data-extra-bruto="'+esc(r.id)+'"><option value="">Confirmar tratamento do incentivo</option>'+
        '<option value="sim" '+(decisao==='sim'?'selected':'')+'>Já incluído no bruto do RH</option>'+
        '<option value="nao" '+(decisao==='nao'?'selected':'')+'>Somar incentivo ao bruto do RH</option></select></label>';
    }).join('');
    $('#fe-extras').innerHTML=(incentivos.length?'<section class="fe-card"><h2>Incentivo federal de enfermagem · folha extra</h2>'+
      '<p class="fe-muted">Confirme em cada lotação se o bruto do RH já contém o incentivo. A soma é feita somente após a escolha explícita. O desconto previdenciário da folha seguinte não é lançado nesta operação.</p>'+
      boxIncentivo+'</section>':'')+'<details><summary>OPs extraorçamentárias sugeridas ('+p.extras.length+')</summary><div class="fe-scroll"><table>'+
      '<thead><tr><th>Tipo</th><th>Empenho origem</th><th>Lotação</th><th>Bruto</th><th>INSS a reter</th><th>Líquido</th><th>Status</th></tr></thead><tbody>'+
      p.extras.map(x=>'<tr><td>'+esc(x.tipo)+'</td><td>'+x.empenhoReferencia+'</td><td>'+esc(x.lotacao)+'</td>'+
        '<td>'+dinheiroFolha(x.bruto)+'</td><td>'+dinheiroFolha(x.inss)+'</td><td>'+dinheiroFolha(x.liquido)+'</td>'+
        '<td>'+esc(x.problemas.join('; ')||'A conferir')+'</td></tr>').join('')+'</tbody></table></div></details>';
    $('#fe-extras').querySelectorAll('[data-extra-bruto]').forEach(c=>c.onchange=()=>{
      const id=c.dataset.extraBruto;
      mapa[id]={...(mapa[id]||{}),incentivoNoBruto:c.value};
      aprovouMapa=false;$('#fe-confirmar-mapa').checked=false;persistir();render();
    });
  }
  el.querySelectorAll('[data-importar]').forEach(input=>input.onchange=async()=>{
    const f=input.files?.[0],tipo=input.dataset.importar;
    if(!f)return;
    if(!/\.pdf$/i.test(f.name)||f.size>90*1024*1024){toast('Informe PDF de até 90 MB.','erro');return;}
    status('Lendo '+f.name+'…');input.disabled=true;
    try{
      const linhas=await extrairLinhasDaFolha(await f.arrayBuffer());
      if(tipo==='automatico'||tipo==='consolidado'){
        const analisado=analisarResumoConsolidado(linhas,{nome:f.name});
        if(!analisado.quantidade)throw Error('Nenhum Resumo de Verbas legível neste PDF. A folha nominal isolada não traz os totais orçamentários por lotação; envie o PDF de Resumo de Verbas.');
        const comp=analisado.arquivos.find(a=>a.competencia)?.competencia;
        if(comp&&comp!==competencia){
          if(Object.values(arquivos).some(x=>x?.registros?.length))
            throw Error('O PDF é de '+comp+' e o controle aberto é '+competencia+'. Altere a competência antes de importar para evitar misturar meses.');
          competencia=comp;$('#fe-comp').value=comp;
          status('Competência identificada automaticamente no PDF: '+comp+'.');
        }
        // Importação única substitui os grupos anteriores, evitando contagem dupla.
        if(tipo==='automatico')arquivos={};
        for(const a of analisado.arquivos)arquivos[a.tipo]=a;
        nomeConsolidado=f.name;alertas=[...analisado.avisos];
        $('#fe-nome-automatico').textContent=f.name+' · '+analisado.quantidade+' lançamentos identificados';
        // Se o mesmo PDF também contém folha nominal, identifica as servidoras
        // sem exigir novo upload. Se não contém, sinaliza a pendência sem inventar INSS.
        if(tipo==='automatico'&&linhas.some(x=>/\b\d{5,8}\s*\/\s*\d+\s+.+/.test(x.texto||''))){
          const identificadas=sugerirMaternidadesDaFolha(linhas);
          if(identificadas.achados.length){
            pessoas=identificadas.achados;
            origemIndividual=f.name;
            alertas.push(...identificadas.avisos);
          }
        }
        aprovouMapa=false;aprovouConsignados=false;
        $('#fe-confirmar-mapa').checked=false;$('#fe-confirmar-bancos').checked=false;
        status('Folha gerada a partir de '+f.name+': '+analisado.quantidade+' empenhos por lotação, mais adiantamentos identificados. Ordem original preservada. Informe ficha e fonte.');
      } else if(tipo==='nominal'){
        const candidatos=sugerirMaternidadesDaFolha(linhas);
        const matriculasImportadas=new Set(candidatos.achados.map(c=>c.matricula));
        // Reimportação corrige registros antigos que ficaram vinculados a "002.004".
        // Preserva registros manuais e registros de outras matrículas.
        pessoas=pessoas.filter(p=>!matriculasImportadas.has(p.matricula) ||
          p.origem==='Preenchimento manual');
        const chaves=new Set(pessoas.map(p=>p.matricula+'|'+p.lotacao));
        for(const c of candidatos.achados){
          const chave=c.matricula+'|'+c.lotacao;
          if(chaves.has(chave))continue;
          chaves.add(chave);
          pessoas.push(c); // Exige nova confirmação na lotação correta.
        }
        origemIndividual=f.name;
        alertas=alertas.filter(x=>!/^Matrícula .*lotação .*sem rubrica 163/.test(x));
        alertas.push(...candidatos.avisos);
        status(candidatos.achados.length+' servidora(s) com maternidade identificada(s) por matrícula e lotação completa. Confira os valores e marque Conferi.');
      } else {
        const a=analisarResumoVerbas(linhas,{tipo,nome:f.name});
        if(a.competencia&&a.competencia!==competencia)throw Error('Competência do PDF ('+a.competencia+') difere da selecionada ('+competencia+').');
        if(!a.registros.length)throw Error('Nenhuma lotação com dados reconhecidos.');
        arquivos[tipo]=a;aprovouMapa=false;aprovouConsignados=false;
        $('#fe-confirmar-mapa').checked=false;$('#fe-confirmar-bancos').checked=false;
        status('Importado '+f.name+' · '+a.registros.length+' lotações. Revise alertas e fichas.');
      }
      await persistir();render();
    }catch(e){toast('Falha em '+f.name+': '+(e.message||e),'erro');status('Arquivo não importado: '+e.message);}
    finally{input.disabled=false;input.value='';}
  });
  $('#fe-nova-servidora').onclick=()=>{
    pessoas.push({nome:'',matricula:'',lotacao:'',beneficio:0,inss:0,confirmado:false,origem:'Preenchimento manual'});
    persistir();render();
  };
  $('#fe-comp').onchange=e=>{
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))return;
    competencia=e.target.value;carregar();
  };
  $('#fe-inicio').onchange=e=>{
    const v=Number(e.target.value);
    if(!Number.isSafeInteger(v)||v<1){toast('Informe número inicial válido.','erro');e.target.value=primeiro;return;}
    primeiro=v;persistir();render();
  };
  $('#fe-filtro').onchange=e=>{filtro=e.target.value;render();};
  $('#fe-visao').onchange=e=>{visao=e.target.value;render();};
  $('#fe-confirmar-mapa').onchange=e=>{aprovouMapa=e.target.checked;persistir();render();};
  $('#fe-confirmar-bancos').onchange=e=>{aprovouConsignados=e.target.checked;persistir();render();};
  $('#fe-baixar-mapa').onclick=()=>{
    const linhas=[['Tipo','Lotacao','Ficha','Fonte','Conta','Secretaria','Vinculo']];
    for(const r of montar()?.previsao.empenhos||[])linhas.push([r.tipo,r.lotacao,r.ficha,r.fonte,r.conta,r.secretaria,r.vinculo]);
    baixar('modelo-ficha-fonte-'+competencia+'.csv',new Blob([csv(linhas)],{type:'text/csv;charset=utf-8'}));
  };
  $('#fe-ler-mapa').onchange=async e=>{
    const f=e.target.files?.[0];if(!f)return;
    try{
      if(!/\.csv$/i.test(f.name)||f.size>2*1024*1024)throw Error('Importe um CSV de até 2 MB.');
      const linhas=parseCSV(await f.text().then(t=>t.replace(/^\ufeff/,'')));
      const cab=(linhas.shift()||[]).map(x=>x.trim().toLowerCase());
      const ind=x=>cab.indexOf(x);
      if(ind('lotacao')<0||ind('ficha')<0||ind('fonte')<0||ind('conta')<0)
        throw Error('O mapa precisa ter colunas Lotacao, Ficha, Fonte e Conta. Use o modelo gerado pelo SISDIFI.');
      let n=0;
      for(const r of linhas){
        const lot=String(r[ind('lotacao')]||'').trim(),tipo=ind('tipo')<0?'principal':String(r[ind('tipo')]||'principal').trim();
        if(!lot)continue;
        mapa[tipo+'|'+lot]={ficha:String(r[ind('ficha')]||'').trim(),
          fonte:String(r[ind('fonte')]||'').trim(),conta:String(r[ind('conta')]||'').trim(),
          secretaria:ind('secretaria')<0?'':String(r[ind('secretaria')]||'').trim(),
          vinculo:ind('vinculo')<0?'':String(r[ind('vinculo')]||'').trim()};
        n++;
      }
      aprovouMapa=false;$('#fe-confirmar-mapa').checked=false;await persistir();render();
      toast(n+' correspondências importadas. Confira o mapeamento antes de autorizar.');
    }catch(e){toast(e.message,'erro');}
    finally{e.target.value='';}
  };
  $('#fe-buscar-minutas').onclick=async()=>{
    try{
      const dados=await carregarMes(uid,competencia);
      minutas=dados.arquivos||[];
      status('Carregadas '+minutas.length+' minuta(s) da competência '+competencia+'.');
      aprovouConsignados=false;$('#fe-confirmar-bancos').checked=false;render();
    }catch(e){toast('Não foi possível ler as minutas deste navegador: '+e.message,'erro');}
  };
  function exportar(conferida=false){
    const pacote=montar();
    if(!pacote){toast('Importe um Resumo de Verbas.','erro');return;}
    if(conferida&&!finalPossivel(pacote)){toast('Há pendências. Exporte apenas o rascunho.','erro');return;}
    const blob=gerarPlanilhaFolha(pacote.previsao,{competencia,
      status:conferida?'CONFERIDA PELA CONTABILIDADE':'RASCUNHO — PENDENTE',
      conciliacao:conciliar(pacote),aprovouMapa});
    baixar('empenhos-folha-'+competencia+(conferida?'-conferida':'-rascunho')+'.xlsx',blob);
  }
  $('#fe-rascunho').onclick=()=>exportar(false);
  $('#fe-final').onclick=()=>exportar(true);
  carregar();
  return {titulo:'Folha de pagamentos',limpar:()=>{ativa=false;}};
}
