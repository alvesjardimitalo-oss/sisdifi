// SISDIFI — Folha de pagamentos: relação de empenhos em etapas.
// Exclusivo de Contabilidade/ADM. Não grava dados de folha no Firebase.
//
// 1 · Arquivos do RH (folha mensal, 13º e rescisão)
// 2 · Número do primeiro empenho
// 3 · Saldo das contas bancárias
// 4 · Ficha, fonte e conta de cada empenho, descontando do saldo
// 5 · Confirmar a folha → consignados e pensões por fonte vão para Consignações por mês
import {estado,pode} from '../estado.js';
import {consultarFichaOrcamento,alertaNaturezaFicha,fonteCompativel,classificacaoPessoal,FICHAS_PESSOAL_2026} from '../folha-orcamento-2026.js';
import {esc,toast} from '../ui.js';
import {analisarResumoVerbas,analisarResumoConsolidado,descontarFolhasProprias,prepararEmpenhos,conferirConsignadosFolha,centavosFolha,dinheiroFolha,tipoDeFolhaCabecalho} from '../folha-empenhos.js?v=3.23.0.0ad64327';
import {extrairLinhasDaFolha} from '../folha-empenhos-pdf.js';
import {sugerirMaternidadesDaFolha,consolidarMaternidade,lotacoesDoResumo} from '../folha-maternidade.js';
import {ordemDasLotacoes} from '../folha-ordem.js?v=3.23.0.4b01d732';
import {gerarPlanilhaFolha} from '../folha-empenhos-xlsx.js?v=3.23.0.418e5047';
import {carregarRegistroFolha,salvarRegistroFolha} from '../folha-empenhos-store.js';
import {carregarMes,salvarMes} from '../consignacoes-mensal.js?v=3.13.0.357fc820';
import {saldosDasContas,consignadosPorFonte,etapasDaFolha,avisosDaConta,contaParaFonte,rotuloConta,novaContaId,
  normalizarFonte,assinaturaDaFolha,previstoParaConsignacoes} from '../folha-fluxo.js?v=3.23.0.3b56a92a';

const tipos={principal:'Folha principal',extra:'Folha extra · incentivo federal (dia 10)',decimo:'Adiantamento de 50% do 13º',rescisao:'Rescisões'};
const formato=c=>(Number(c||0)/100).toFixed(2).replace('.',',');
const lerValor=v=>{const t=String(v||'').trim();if(!t)return null;return centavosFolha(/^\d+$/.test(t)?t+',00':t);};
function baixar(nome,blob){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=nome;a.click();setTimeout(()=>URL.revokeObjectURL(url),2500);
}
function csv(linhas){return '﻿'+linhas.map(l=>l.map(v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"').join(';')).join('\r\n');}
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

/* Arquivos do RH → grupos para empenhar.
   O resumo mensal do RH já contém o 13º e a rescisão: quando os resumos próprios
   desses tipos chegam, eles mandam e são descontados do mensal (descontarFolhasProprias).
   Se o mensal foi lido com o 13º separado pela rubrica 150 (cabeçalho misto),
   usa-se a leitura sem separar, para não tirar o mesmo 13º duas vezes. */
// O RH já entregou os arquivos com os nomes trocados: identifica pelo conteúdo.
const cabecalho=linhas=>linhas.slice(0,12).map(l=>String(l.texto||l)).join(' ');
const ehFolhaNominal=linhas=>/F\s?O\s?L\s?H\s?A\s+D\s?E\s+P\s?A\s?G\s?A\s?M\s?E\s?N\s?T\s?O/.test(cabecalho(linhas));
const ehResumo=linhas=>/RESUMO\s+DE\s+VERBAS/.test(cabecalho(linhas));
function arquivosDoRH(f){
  const out={};
  if(!f)return out;
  if(f.mensal){
    for(const a of f.mensal.arquivos||[]){
      if(a.tipo==='decimo'&&f.decimo)continue;
      if(a.tipo==='rescisao'&&f.rescisao)continue;
      out[a.tipo]=a;
    }
    const separouDecimo=(out.principal?.registros||[]).some(r=>r.adiantamentoSeparado);
    if(f.decimo&&separouDecimo&&f.mensal.simples)out.principal=f.mensal.simples;
  }
  for(const tipo of ['decimo','rescisao','extra'])if(f[tipo])out[tipo]=f[tipo].arquivo;
  return out;
}

export function telaFolhaEmpenhos(el){
  if(!pode.contabil())return {titulo:'Acesso restrito'};
  const uid=estado.sessao?.uid;
  let competencia=new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0');
  let primeiro=null,fontesRH={},legado=null,pessoas=[],mapa={},contas=[],saldos={},aprovouMapa=false,confirmacao=null;
  let minutas=[],alertas=[],origemIndividual='',filtro='todos',visao='resumo',carregando=false,ativa=true,etapa='arquivos';
  let filaDeSalvamento=Promise.resolve();
  const $=sel=>el.querySelector(sel);
  const arquivosAtuais=()=>legado||arquivosDoRH(fontesRH);
  const localizarFicha=numero=>consultarFichaOrcamento(numero,Number(competencia.slice(0,4)),estado.fichas||[],estado.secretarias||[]);
  const contaPorId=id=>contas.find(c=>c.id===id)||null;
  const sugerirConta=id=>{
    const m=mapa[id]||{};
    if(m.contaId&&contaPorId(m.contaId))return;
    const c=contaParaFonte(contas,m.fonte);
    if(c)mapa[id]={...m,contaId:c.id};
  };
  const preencherPelaFicha=(id,numero)=>{
    const atual=mapa[id]||{},ficha=String(numero||'').trim(),referencia=localizarFicha(ficha);
    const novo={...atual,ficha};
    if(referencia&&!referencia.ambiguo){
      if(referencia.unidade)novo.secretaria=referencia.unidade;
      if(referencia.acao)novo.lotacaoOrcamentaria=referencia.acao;
      novo.origemFicha=referencia.origem;
      if(referencia.fontes.length===1)novo.fonte=referencia.fontes[0];
      else if(novo.fonte&&referencia.fontes.length&&!fonteCompativel(novo.fonte,referencia.fontes))novo.fonte='';
    }else{
      novo.lotacaoOrcamentaria='';novo.origemFicha='';
    }
    mapa[id]=novo;sugerirConta(id);
  };
  const estilo='<style>'+
    '.fe{max-width:1350px;margin:0 auto;color:#233e58}.fe h1{color:#174366;font-size:1.55rem;margin:0 0 8px}.fe h2{font-size:1.12rem;color:#174366;margin:0}'+
    '.fe p{line-height:1.52}.fe .fe-muted{color:#66798b;font-size:.85rem}.fe .fe-card{background:#fff;border:1px solid #dce5ee;border-radius:12px;margin:14px 0;padding:17px}'+
    '.fe .fe-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.fe .fe-files{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}'+
    '.fe .fe-file{display:block;border:1px dashed #b8ccd9;border-radius:8px;padding:12px;background:#f7fafd}.fe .fe-file strong,.fe .fe-file small{display:block}.fe .fe-file small{font-size:.8rem;color:#526b80;margin:5px 0}'+
    '.fe .fe-file input[type=file]{width:100%;font-size:.8rem;margin:4px 0}.fe .fe-file .fe-recebido{color:#265f3f;font-size:.8rem;display:block}.fe .fe-file.ok{border-style:solid;border-color:#7fbf98;background:#f2fbf5}'+
    '.fe .fe-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.fe .fe-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:10px 0}'+
    '.fe .fe-kpis div{border:1px solid #d7e4ee;background:#f7fbff;border-radius:8px;padding:12px}.fe .fe-kpis small{font-size:.74rem;color:#526c82;display:block}.fe .fe-kpis strong{font-size:1.13rem;color:#13466a;display:block;margin-top:5px}'+
    '.fe .fe-scroll{overflow:auto;max-width:100%}.fe table{border-collapse:collapse;width:100%;font-size:.82rem}.fe th,.fe td{padding:8px;border-bottom:1px solid #e1e9ef;text-align:left;vertical-align:middle}'+
    '.fe th{background:#edf4f9;color:#345975;white-space:nowrap}.fe td input,.fe td select{border:1px solid #b9ccda;border-radius:5px;padding:6px;min-width:78px;width:100px;font-size:.8rem}'+
    '.fe .fe-money{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.fe .fe-neg{color:#b53c30;font-weight:700}.fe .fe-alert{border-left:4px solid #bc8b31;background:#fff8e9;padding:10px;margin:9px 0;color:#704e21;border-radius:4px}'+
    '.fe .fe-danger{border-left:4px solid #ba4444;background:#ffefee;padding:10px;margin:9px 0;color:#8b3333;border-radius:4px}.fe .fe-ok{border-left:4px solid #36865c;background:#eef9f1;padding:10px;margin:9px 0;color:#265f3f;border-radius:4px}'+
    '.fe details.fe-sub{margin:14px 0}.fe details.fe-sub summary{cursor:pointer;font-weight:600}.fe .fe-status{color:#8b5a1e;font-size:.76rem;min-width:160px}.fe button{white-space:nowrap}'+
    '.fe .fe-passos{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.fe .fe-passos button{flex:1 1 150px;text-align:left;border:1px solid #cfdce7;background:#fff;border-radius:9px;padding:9px 11px;cursor:pointer;font:inherit;color:#33526c}'+
    '.fe .fe-passos button small{display:block;font-size:.72rem;color:#6b7f90}.fe .fe-passos button.feito{border-color:#7fbf98;background:#f2fbf5}.fe .fe-passos button.atual{border-color:#174366;box-shadow:inset 0 0 0 1px #174366}'+
    '.fe .fe-passo{background:#fff;border:1px solid #dce5ee;border-radius:12px;margin:12px 0}.fe .fe-passo>summary{list-style:none;cursor:pointer;padding:15px 17px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}'+
    '.fe .fe-passo>summary::-webkit-details-marker{display:none}.fe .fe-passo>summary .fe-sit{font-size:.8rem;color:#8b5a1e}.fe .fe-passo>summary .fe-sit.ok{color:#265f3f}.fe .fe-passo .fe-corpo{padding:0 17px 17px}'+
    '.fe .fe-continuar{margin-top:14px;display:flex;justify-content:flex-end;gap:10px}.fe .fe-pend{margin:6px 0 0;padding-left:18px;color:#704e21;font-size:.85rem}'+
    '@media(max-width:900px){.fe .fe-files{grid-template-columns:1fr}}@media(max-width:780px){.fe .fe-grid{grid-template-columns:1fr 1fr}.fe .fe-kpis{grid-template-columns:1fr 1fr}}'+
    '@media(max-width:500px){.fe .fe-grid{grid-template-columns:1fr}}'+
    '</style>';
  const passo=(id,n,titulo,corpo)=>'<details class="fe-passo" data-passo="'+id+'"><summary><h2>'+n+' · '+titulo+'</h2><span class="fe-sit" id="fe-sit-'+id+'"></span></summary><div class="fe-corpo">'+corpo+'</div></details>';
  const slot=(chave,titulo,ajuda,importar)=>'<label class="fe-file" id="fe-slot-'+chave+'"><strong>'+titulo+'</strong><small>'+ajuda+'</small>'+
    '<input data-importar="'+importar+'" type="file" accept=".pdf,application/pdf"><span class="fe-recebido" id="fe-nome-'+chave+'"></span>'+
    '<button type="button" class="btn btn-sec btn-peq" data-remover-arquivo="'+chave+'" hidden>Retirar</button></label>';
  el.innerHTML=estilo+'<div class="fe">'+
    '<h1>Folha de pagamentos · Relação de empenhos</h1>'+
    '<p class="fe-muted">Prefeitura Municipal de Frei Inocêncio — prévia contábil por lotação. Siga as etapas: arquivos do RH, primeiro empenho, saldo das contas, ficha/fonte/conta e confirmação. Não registra empenho ou liquidação no sistema contábil.</p>'+
    '<section class="fe-card"><div class="fe-grid">'+
      '<label class="campo"><span>Competência da folha</span><input type="month" id="fe-comp" value="'+esc(competencia)+'"></label>'+
    '</div><p id="fe-status" class="fe-muted" role="status" aria-live="polite"></p><nav class="fe-passos" id="fe-passos" aria-label="Etapas"></nav></section>'+
    passo('arquivos',1,'Arquivos do RH',
      '<p class="fe-muted">Envie, nesta ordem, o <strong>Resumo de Verbas</strong> e a <strong>Folha de pagamento</strong> do mês; depois o Resumo de Verbas do <strong>13º</strong> e o das <strong>rescisões</strong>, quando houver. O resumo mensal do RH já contém o 13º e as rescisões: o SISDIFI desconta esses valores do mensal e gera empenhos separados, sem contar o mesmo dinheiro duas vezes.</p>'+
      '<div class="fe-files">'+
        '<div>'+slot('principal','Folha mensal · Resumo de Verbas','Totais por lotação: bruto, descontos e líquido. Obrigatório.','principal')+
          slot('nominal','Folha mensal · Folha de pagamento','Folha nominal: identifica as servidoras com salário-maternidade (rubricas 163 e 201).','nominal')+'</div>'+
        '<div>'+slot('decimo','13º salário · Resumo de Verbas','Adiantamento de 50% do 13º. Opcional: só quando houver na competência.','decimo')+'</div>'+
        '<div>'+slot('rescisao','Rescisões · Resumo de Verbas','Opcional: só quando houver rescisões na competência.','rescisao')+'</div>'+
      '</div>'+
      '<details class="fe-sub"><summary>Outros casos</summary><div class="fe-files" style="margin-top:10px">'+
        slot('extra','Folha extra do dia 10 · Resumo de Verbas','Incentivo da enfermagem e diferenças salariais pagas no dia 10.','extra')+
        slot('automatico','PDF único com todos os resumos','Um só PDF com folha mensal, 13º e rescisões juntos. Substitui os arquivos acima.','automatico')+
      '</div></details>'+
      '<div id="fe-avisos"></div>'+
      '<div id="fe-bloco-maternidade"><div class="fe-actions" style="margin-top:12px"><h2 style="font-size:1rem">Servidoras com salário-maternidade</h2><button id="fe-nova-servidora" type="button" class="btn btn-sec">+ Adicionar registro</button></div>'+
        '<p class="fe-muted">O INSS individual confirmado sai do desconto do empenho e vai para a retenção da OP extraorçamentária. A rubrica 229 (prorrogação) não é convertida automaticamente. Se o layout nominal não for reconhecido, preencha com base no contracheque.</p>'+
        '<div id="fe-pessoas"></div></div>'+
      '<div class="fe-continuar"><button type="button" class="btn" data-ir="numero">Continuar</button></div>')+
    passo('numero',2,'Número do primeiro empenho',
      '<p class="fe-muted">Digite o primeiro número: os empenhos são numerados a partir dele, na ordem da planilha da Contabilidade — folha mensal por secretaria (Gabinete, Administração, Cultura, Fazenda… Ação Social), depois folha extra, adiantamento do 13º e rescisões.</p>'+
      '<div class="fe-grid"><label class="campo"><span>Primeiro número do empenho</span><input type="number" min="1" id="fe-inicio" placeholder="Ex.: 5000"></label></div>'+
      '<div id="fe-numeracao"></div>'+
      '<div class="fe-continuar"><button type="button" class="btn btn-sec" data-ir="arquivos">Voltar</button><button type="button" class="btn" data-ir="saldos">Continuar</button></div>')+
    passo('saldos',3,'Saldo das contas bancárias',
      '<p class="fe-muted">Cadastre as contas que pagam a folha, com a fonte de recurso e o saldo disponível. As contas ficam guardadas para os próximos meses; o saldo é informado a cada competência. Na próxima etapa, o <strong>bruto</strong> de cada empenho é descontado do saldo da conta escolhida.</p>'+
      '<div class="fe-scroll" id="fe-contas"></div>'+
      '<div class="fe-actions" style="margin-top:10px"><button type="button" class="btn btn-sec" id="fe-nova-conta">+ Adicionar conta</button></div>'+
      '<datalist id="fe-fontes"></datalist>'+
      '<div class="fe-continuar"><button type="button" class="btn btn-sec" data-ir="numero">Voltar</button><button type="button" class="btn" data-ir="fichas">Continuar</button></div>')+
    passo('fichas',4,'Ficha, fonte e conta de cada empenho',
      '<p class="fe-muted">Ao informar a ficha, o SISDIFI identifica a secretaria, a ação e a natureza da despesa pela LOA (<strong>3.1.90.11.00</strong> Pessoal Civil ou <strong>3.1.90.04.00</strong> Contratação por Tempo Determinado) e sugere a conta quando só uma conta tem aquela fonte. O saldo da conta cai a cada empenho.</p>'+
      '<div id="fe-resumo-contas"></div>'+
      '<div class="fe-actions"><button class="btn btn-sec" id="fe-baixar-mapa" type="button">Baixar modelo CSV</button>'+
      '<label class="btn btn-sec" style="cursor:pointer">Importar mapa CSV <input id="fe-ler-mapa" type="file" accept=".csv,text/csv" style="display:none"></label>'+
      '<label class="campo"><span>Filtrar empenhos</span><select id="fe-filtro"><option value="todos">Todos</option><option value="pendentes">Com pendências</option><option value="principal">Folha principal</option><option value="extra">Folha extra</option><option value="decimo">13º adiantamento</option><option value="rescisao">Rescisões</option></select></label>'+
      '<label class="campo"><span>Visualização</span><select id="fe-visao"><option value="resumo">Empenhos: ficha, fonte, conta e saldo</option><option value="composicao">Composição dos descontos</option></select></label></div>'+
      '<div id="fe-kpis" class="fe-kpis"></div><div id="fe-pendencias"></div>'+
      '<div class="fe-scroll" id="fe-tabela"></div><div id="fe-extras"></div>'+
      '<p style="margin-top:12px"><label><input type="checkbox" id="fe-confirmar-mapa"> Conferi as fichas e fontes na LOA</label></p>'+
      '<p class="fe-muted">Preencha ficha e fonte de recursos de todos os empenhos. Na folha extra, se o incentivo federal estiver fora do bruto do RH, escolha <strong>Somar ao bruto</strong> na lotação.</p>'+
      '<div class="fe-continuar"><button type="button" class="btn btn-sec" data-ir="saldos">Voltar</button><button type="button" class="btn" data-ir="confirmar">Continuar</button></div>')+
    passo('confirmar',5,'Confirmar a folha',
      '<div id="fe-checklist"></div>'+
      '<div class="fe-actions"><button type="button" class="btn" id="fe-confirmar-folha" disabled>Confirmar a folha</button>'+
      '<button class="btn btn-sec" type="button" id="fe-rascunho">Baixar rascunho XLSX</button>'+
      '<button class="btn" type="button" id="fe-final" disabled>Baixar planilha conferida XLSX</button></div>'+
      '<div id="fe-consignados"></div>'+
      '<details class="fe-sub" id="fe-depois"><summary>Depois do lançamento: conferir com as minutas dos bancos</summary>'+
        '<p class="fe-muted">A minuta de arrecadação só sai depois que a folha é lançada no sistema contábil. Importe-a em Consignações por mês e compare aqui. Esta conferência não impede a planilha conferida.</p>'+
        '<div class="fe-actions"><button class="btn btn-sec" type="button" id="fe-buscar-minutas">Consultar minutas</button></div><div id="fe-bancos"></div></details>')+
    '<p class="fe-muted">Dados armazenados no navegador, separados pela conta. A planilha contém fórmulas de líquido para a Contabilidade conferir e preencher a liquidação no sistema oficial.</p>'+
    '</div>';
  const status=t=>{$('#fe-status').textContent=t;};
  const arquivosLista=()=>descontarFolhasProprias(Object.values(arquivosAtuais())).arquivos;
  const montar=()=>{
    const arquivos=arquivosAtuais();
    if(!Object.values(arquivos).some(x=>x?.registros?.length))return null;
    const maternidade=consolidarMaternidade(pessoas,[arquivos.principal].filter(Boolean));
    const mapaConsulta=Object.fromEntries(Object.entries(mapa).map(([chave,m])=>{
      const ref=localizarFicha(m.ficha),c=contaPorId(m.contaId);
      return [chave,{...m,secretaria:m.secretaria||ref?.unidade||'',lotacaoOrcamentaria:m.lotacaoOrcamentaria||ref?.acao||'',conta:c?rotuloConta(c):''}];
    }));
    const previsao=prepararEmpenhos(arquivosLista(),primeiro||1,mapaConsulta,maternidade.ajustes,{ordem:ordemDasLotacoes(mapa)});
    for(const emp of previsao.empenhos){
      const ref=localizarFicha(emp.ficha);
      const tipo=classificacaoPessoal(ref?.naturezas||[]);
      emp.classificacaoOrcamentaria=tipo.codigo?tipo.titulo:'';
      emp.codigoNatureza=tipo.codigo;
      emp.contaId=(mapa[emp.id]||mapa[emp.lotacao]||{}).contaId||'';
    }
    for(const x of previsao.extras){
      const origem=previsao.empenhos.find(e=>e.empenho===x.empenhoReferencia);
      if(origem)x.conta=origem.conta;
    }
    return {maternidade,previsao};
  };
  const situacaoGeral=pacote=>{
    const arquivos=arquivosAtuais();
    return etapasDaFolha({arquivos,primeiro,contas,saldos,previsao:pacote?.previsao,maternidade:pacote?.maternidade,
      alertas,avisosArquivos:arquivosLista().flatMap(a=>a.avisos||[]),conferiuFichas:aprovouMapa});
  };
  const assinaturaAtual=pacote=>pacote?assinaturaDaFolha(pacote.previsao.empenhos,contas,saldos):'';
  const confirmadaValida=pacote=>!!(confirmacao&&pacote&&confirmacao.assinatura===assinaturaAtual(pacote));
  function persistir(){
    if(!uid||!ativa||carregando)return Promise.resolve();
    const compAtual=competencia;
    const mensal=structuredClone({versao:2,primeiro,fontesRH,arquivos:legado||undefined,pessoas,aprovouMapa,origemIndividual,saldos,confirmacao,etapa});
    const mapaAtual=structuredClone(mapa),contasAtuais=structuredClone(contas);
    filaDeSalvamento=filaDeSalvamento.catch(()=>{}).then(async()=>{
      await salvarRegistroFolha(uid,compAtual,mensal);
      await salvarRegistroFolha(uid,'mapa-lotacoes',mapaAtual);
      await salvarRegistroFolha(uid,'contas-folha',contasAtuais);
    }).catch(e=>{status('Erro ao salvar localmente: '+(e.message||e));});
    return filaDeSalvamento;
  }
  async function carregar(){
    const alvo=competencia;carregando=true;status('Carregando dados de '+alvo+'…');
    try{
      const [mensal,reusavel,contasSalvas]=await Promise.all([carregarRegistroFolha(uid,alvo),carregarRegistroFolha(uid,'mapa-lotacoes'),carregarRegistroFolha(uid,'contas-folha')]);
      if(!ativa||alvo!==competencia)return;
      primeiro=mensal?.primeiro||null;fontesRH=mensal?.fontesRH||{};pessoas=mensal?.pessoas||[];
      // Registro de antes das etapas: só os grupos já lidos, sem os PDFs separados.
      legado=!mensal?.fontesRH&&mensal?.arquivos&&Object.keys(mensal.arquivos).length?mensal.arquivos:null;
      aprovouMapa=!!mensal?.aprovouMapa;origemIndividual=mensal?.origemIndividual||'';
      saldos=mensal?.saldos||{};confirmacao=mensal?.confirmacao||null;
      mapa=reusavel||{};
      // Contas antigas eram texto livre por lotação; agora são cadastradas uma vez.
      contas=Array.isArray(contasSalvas)?contasSalvas:[];
      alertas=[];minutas=[];
      etapa=mensal?.etapa||(legado||fontesRH.mensal?'fichas':'arquivos');
      status(legado?'Dados importados antes da nova versão. Reenvie os PDFs do RH na etapa 1 para atualizar os valores.':
        mensal?'Dados deste mês carregados.':'Nenhum dado nesta competência. Comece pelos arquivos do RH.');
    }catch(e){status('Histórico local indisponível: '+(e.message||e));}
    finally{carregando=false;render();}
  }
  function irPara(id){etapa=id;persistir();render();el.querySelector('[data-passo="'+id+'"]')?.scrollIntoView({behavior:'smooth',block:'start'});}
  function renderPessoas(){
    const principal=arquivosAtuais().principal;
    const r=principal?.registros?.filter(x=>x.valores.maternidade)||[];
    $('#fe-bloco-maternidade').hidden=!r.length&&!pessoas.length;
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
        '<tr><td colspan="8">Nenhuma servidora identificada. Envie a Folha de pagamento do mês ou adicione registros.</td></tr>')+
      '</tbody></table></div>';
    const check=consolidarMaternidade(pessoas,[principal||{registros:[]}]);
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
  function renderArquivos(){
    const arquivos=arquivosAtuais();
    const nomes={
      principal:fontesRH.mensal?fontesRH.mensal.nome+' · '+(arquivos.principal?.registros.length||0)+' lotações':legado?'Importação antiga — reenvie o PDF':'',
      nominal:origemIndividual,
      decimo:fontesRH.decimo?fontesRH.decimo.nome+' · '+fontesRH.decimo.arquivo.registros.length+' lotações':'',
      rescisao:fontesRH.rescisao?fontesRH.rescisao.nome+' · '+fontesRH.rescisao.arquivo.registros.length+' lotações':'',
      extra:fontesRH.extra?fontesRH.extra.nome+' · '+fontesRH.extra.arquivo.registros.length+' lotações':'',
      automatico:''
    };
    for(const [k,v] of Object.entries(nomes)){
      $('#fe-nome-'+k).textContent=v?'✓ '+v:'';
      $('#fe-slot-'+k).classList.toggle('ok',!!v&&!/reenvie/.test(v));
      const b=el.querySelector('[data-remover-arquivo="'+k+'"]');
      if(b)b.hidden=!v||k==='automatico';
    }
    const descontados=descontarFolhasProprias(Object.values(arquivos));
    $('#fe-avisos').innerHTML=(descontados.descontados?'<p class="fe-ok">13º e rescisões descontados da folha mensal em '+descontados.descontados+' lotação(ões).</p>':'')+
      alertas.map(x=>'<p class="fe-alert">'+esc(x)+'</p>').join('')+
      descontados.arquivos.flatMap(a=>a.avisos||[]).slice(0,18).map(x=>'<p class="fe-alert">'+esc(x)+'</p>').join('');
  }
  function renderContas(pacote){
    const fontes=[...new Set(FICHAS_PESSOAL_2026.flatMap(f=>f.fontes))].sort();
    $('#fe-fontes').innerHTML=fontes.map(f=>'<option value="'+esc(f)+'"></option>').join('');
    const sit=saldosDasContas(contas,saldos,pacote?.previsao.empenhos||[]);
    $('#fe-contas').innerHTML='<table><thead><tr><th>Nome da conta</th><th>Banco / agência / conta</th><th>Fonte de recurso</th><th class="fe-money">Saldo em '+esc(competencia.slice(5)+'/'+competencia.slice(0,4))+'</th><th class="fe-money">Folha nesta conta</th><th class="fe-money">Saldo depois</th><th></th></tr></thead><tbody>'+
      (contas.length?sit.contas.map(c=>'<tr><td><input style="width:190px" data-conta="'+esc(c.id)+'" data-campo="nome" value="'+esc(c.nome||'')+'" placeholder="Ex.: FUNDEB 70%"></td>'+
        '<td><input style="width:190px" data-conta="'+esc(c.id)+'" data-campo="numero" value="'+esc(c.numero||'')+'" placeholder="Ex.: BB 1234-5 / 6789-0"></td>'+
        '<td><input style="width:150px" list="fe-fontes" data-conta="'+esc(c.id)+'" data-campo="fonte" value="'+esc(c.fonte||'')+'" placeholder="1.540.000.0000"></td>'+
        '<td class="fe-money"><input style="width:130px;text-align:right" inputmode="decimal" data-conta="'+esc(c.id)+'" data-campo="saldo" value="'+(c.saldo==null?'':formato(c.saldo))+'" placeholder="0,00"></td>'+
        '<td class="fe-money">'+dinheiroFolha(c.utilizado)+'</td>'+
        '<td class="fe-money '+(c.insuficiente?'fe-neg':'')+'">'+(c.restante==null?'Informe o saldo':dinheiroFolha(c.restante))+'</td>'+
        '<td><button type="button" class="btn btn-sec btn-peq" data-remover-conta="'+esc(c.id)+'">Remover</button></td></tr>').join(''):
        '<tr><td colspan="7">Nenhuma conta cadastrada. Clique em <strong>+ Adicionar conta</strong>.</td></tr>')+
      '</tbody>'+(contas.length?'<tfoot><tr><th colspan="3">Total</th><th class="fe-money">'+dinheiroFolha(sit.totalSaldo)+'</th><th class="fe-money">'+dinheiroFolha(sit.totalUtilizado)+'</th><th class="fe-money">'+dinheiroFolha(sit.totalSaldo-sit.totalUtilizado)+'</th><th></th></tr></tfoot>':'')+'</table>'+
      (pacote?'<p class="fe-muted">Bruto total dos empenhos desta folha: <strong>'+dinheiroFolha(pacote.previsao.totalBruto)+'</strong>.</p>':'');
    $('#fe-contas').querySelectorAll('[data-conta]').forEach(i=>i.onchange=()=>{
      const c=contaPorId(i.dataset.conta);if(!c)return;
      try{
        if(i.dataset.campo==='saldo'){const v=lerValor(i.value);if(v!=null&&v<0)throw Error('O saldo não pode ser negativo.');if(v==null)delete saldos[c.id];else saldos[c.id]=v;}
        else if(i.dataset.campo==='fonte')c.fonte=normalizarFonte(i.value);
        else c[i.dataset.campo]=i.value.trim();
        persistir();render();
      }catch(e){toast(e.message,'erro');render();}
    });
    $('#fe-contas').querySelectorAll('[data-remover-conta]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.removerConta,usos=Object.values(mapa).filter(m=>m.contaId===id).length;
      if(!window.confirm('Remover esta conta?'+(usos?' Ela está escolhida em '+usos+' lotação(ões), que ficarão sem conta.':'')))return;
      contas=contas.filter(c=>c.id!==id);delete saldos[id];
      for(const m of Object.values(mapa))if(m.contaId===id)m.contaId='';
      persistir();render();
    });
    return sit;
  }
  function renderPassos(sit,pacote){
    const confirmada=confirmadaValida(pacote);
    const itens=[...sit.etapas,{id:'confirmar',titulo:'Confirmar a folha',pronta:confirmada,pendencias:confirmada?[]:[confirmacao?'A folha mudou depois da confirmação':'Ainda não confirmada']}];
    $('#fe-passos').innerHTML=itens.map((x,i)=>'<button type="button" data-ir="'+x.id+'" class="'+(x.pronta?'feito ':'')+(etapa===x.id?'atual':'')+'">'+
      (x.pronta?'✓ ':(i+1)+' · ')+esc(x.titulo)+'<small>'+esc(x.pronta?'Concluída':x.pendencias.length+' pendência(s)')+'</small></button>').join('');
    for(const x of itens){
      const s=$('#fe-sit-'+x.id);
      s.className='fe-sit'+(x.pronta?' ok':'');
      s.textContent=x.pronta?'✓ Concluída':x.pendencias[0]+(x.pendencias.length>1?' (+'+(x.pendencias.length-1)+')':'');
    }
    el.querySelectorAll('.fe-passo').forEach(d=>{d.open=d.dataset.passo===etapa;});
  }
  function renderNumeracao(pacote){
    $('#fe-inicio').value=primeiro??'';
    if(!pacote){$('#fe-numeracao').innerHTML='<p class="fe-muted">Envie os arquivos do RH para ver a numeração.</p>';return;}
    const p=pacote.previsao;
    if(!primeiro){$('#fe-numeracao').innerHTML='<p class="fe-alert">'+p.empenhos.length+' empenho(s) a numerar. Informe o primeiro número.</p>';return;}
    const grupos=Object.keys(tipos).map(t=>{const l=p.empenhos.filter(e=>e.tipo===t);return l.length?[tipos[t],l[0].empenho,l.at(-1).empenho,l.length]:null;}).filter(Boolean);
    $('#fe-numeracao').innerHTML='<table style="max-width:620px"><thead><tr><th>Grupo</th><th>Empenhos</th><th>Quantidade</th></tr></thead><tbody>'+
      grupos.map(g=>'<tr><td>'+esc(g[0])+'</td><td>'+g[1]+(g[2]!==g[1]?' a '+g[2]:'')+'</td><td>'+g[3]+'</td></tr>').join('')+
      '</tbody><tfoot><tr><th>Total</th><th>'+p.primeiro+' a '+p.ultimo+'</th><th>'+p.empenhos.length+'</th></tr></tfoot></table>';
  }
  function renderFichas(pacote,sitContas){
    if(!pacote){
      $('#fe-kpis').innerHTML='';$('#fe-pendencias').innerHTML='<p class="fe-alert">Envie o Resumo de Verbas da folha mensal na etapa 1.</p>';
      $('#fe-tabela').innerHTML='';$('#fe-extras').innerHTML='';$('#fe-resumo-contas').innerHTML='';return;
    }
    const p=pacote.previsao;
    $('#fe-resumo-contas').innerHTML=contas.length?'<div class="fe-scroll"><table style="margin-bottom:12px"><thead><tr><th>Conta</th><th>Fonte</th><th class="fe-money">Saldo</th><th class="fe-money">Folha</th><th class="fe-money">Saldo depois</th><th>Empenhos</th></tr></thead><tbody>'+
      sitContas.contas.map(c=>'<tr><td><strong>'+esc(rotuloConta(c)||'(sem nome)')+'</strong></td><td>'+esc(c.fonte||'—')+'</td><td class="fe-money">'+(c.saldo==null?'—':dinheiroFolha(c.saldo))+'</td>'+
        '<td class="fe-money">'+dinheiroFolha(c.utilizado)+'</td><td class="fe-money '+(c.insuficiente?'fe-neg':'')+'">'+(c.restante==null?'Informe o saldo':dinheiroFolha(c.restante))+(c.insuficiente?' · saldo insuficiente':'')+'</td><td>'+c.empenhos.length+'</td></tr>').join('')+
      '</tbody></table></div>':'<p class="fe-alert">Cadastre as contas e os saldos na etapa 3 para escolher a conta de cada empenho.</p>';
    const campos=[['Empenhos previstos',String(p.empenhos.length)],['Bruto orçamentário',dinheiroFolha(p.totalBruto)],
      ['Desconto ajustado',dinheiroFolha(p.totalDescontoAjustado)],['Líquido ajustado',dinheiroFolha(p.totalLiquido)]];
    $('#fe-kpis').innerHTML=campos.map(x=>'<div><small>'+x[0]+'</small><strong>'+x[1]+'</strong></div>').join('');
    const bateu=p.diferencaTotalRH===0;
    $('#fe-pendencias').innerHTML='<div class="'+(bateu?'fe-ok':'fe-danger')+'" style="display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap">'+
      '<strong>'+(bateu?'VALOR BATEU':'VALOR NÃO BATEU')+' · Conferência aritmética do Resumo de Verbas</strong>'+
      '<span>Líquido informado pelo RH: '+dinheiroFolha(p.totalLiquidoRH)+' · Líquido base calculado: '+dinheiroFolha(p.totalLiquidoBase)+' · Diferença: '+dinheiroFolha(p.diferencaTotalRH)+'</span></div>'+
      pacote.maternidade.avisos.map(x=>'<p class="fe-alert">'+esc(x)+'</p>').join('');
    const registros=p.empenhos.filter(e=>filtro==='todos'||filtro==='pendentes'&&e.problemas.length||e.tipo===filtro);
    const opcoesConta=sel=>'<option value="">Escolher conta</option>'+contas.map(c=>'<option value="'+esc(c.id)+'" '+(c.id===sel?'selected':'')+'>'+esc(rotuloConta(c)||c.id)+(c.fonte?' · '+esc(c.fonte):'')+'</option>').join('')+
      (sel&&!contaPorId(sel)?'<option value="'+esc(sel)+'" selected>Conta removida</option>':'');
    if(visao==='resumo'){
      $('#fe-tabela').innerHTML='<table><thead><tr><th>Empenho</th><th>Grupo</th><th>Secretaria/unidade</th><th>Vínculo</th><th>Lotação RH</th><th>Lotação orçamentária (ação)</th><th>Ficha</th><th>Natureza da despesa</th><th>Fonte</th><th>Conta</th><th class="fe-money">Bruto</th><th class="fe-money">Saldo da conta depois</th><th class="fe-money">Desconto RH</th><th class="fe-money">INSS extra</th><th class="fe-money">Líquido</th><th>Pendências</th></tr></thead><tbody>'+
        registros.map(r=>{
          const m=mapa[r.id]||mapa[r.lotacao]||{};
          const ref=localizarFicha(m.ficha||r.ficha);
          const classe=classificacaoPessoal(ref?.naturezas||[]);
          const avisoNatureza=ref?alertaNaturezaFicha(r.vinculo,ref.naturezas):'';
          const fontes=ref?.fontes||[];
          const avisoFicha=m.ficha&&!ref?'Ficha não localizada no orçamento disponível; confira manualmente.':ref?.ambiguo?'Ficha com correspondências orçamentárias distintas; confira manualmente.':classe.conflito?'Ficha possui natureza orçamentária ambígua; conferir.':'';
          const avisoFonte=ref&&fontes.length>1&&!m.fonte?'Selecione uma das fontes permitidas: '+fontes.join(', '):ref&&m.fonte&&fontes.length&&!fonteCompativel(m.fonte,fontes)?'A fonte informada não corresponde às fontes cadastradas nesta ficha.':'';
          const avisoConta=avisosDaConta(r,contaPorId(r.contaId)).join('; ');
          const apos=sitContas.apos[r.id];
          return '<tr><td><strong>'+r.empenho+'</strong></td><td>'+esc(tipos[r.tipo])+'</td>'+
            '<td><input style="width:170px" data-ref="'+esc(r.id)+'" data-campo="secretaria" value="'+esc(m.secretaria||r.secretaria||'')+'"></td>'+
            '<td><input style="width:115px" data-ref="'+esc(r.id)+'" data-campo="vinculo" value="'+esc(m.vinculo||r.vinculo||'')+'"></td>'+
            '<td><strong>'+esc(r.lotacao)+'</strong></td>'+
            '<td><input style="width:225px" data-ref="'+esc(r.id)+'" data-campo="lotacaoOrcamentaria" value="'+esc(m.lotacaoOrcamentaria||ref?.acao||'')+'"><small style="display:block;color:#526b80">'+esc(ref?.origem||'Edição manual')+'</small></td>'+
            '<td><input style="width:88px" list="fe-fichas-2026" data-ref="'+esc(r.id)+'" data-campo="ficha" value="'+esc(m.ficha||'')+'"></td>'+
            '<td style="min-width:225px"><strong>'+esc(classe.titulo)+'</strong>'+(classe.codigo?'<small style="display:block;color:#526b80">'+esc(classe.codigo)+'</small>':'')+'</td>'+
            '<td><input style="width:132px" data-ref="'+esc(r.id)+'" data-campo="fonte" value="'+esc(m.fonte||'')+'"></td>'+
            '<td><select style="width:190px" data-ref="'+esc(r.id)+'" data-campo="contaId">'+opcoesConta(r.contaId)+'</select></td>'+
            '<td class="fe-money">'+dinheiroFolha(r.bruto||0)+(r.tipo==='extra'&&r.incentivo?'<small style="display:block;color:#506d82">Incentivo: '+dinheiroFolha(r.incentivo)+'</small>':'')+'</td>'+
            '<td class="fe-money '+(apos<0?'fe-neg':'')+'">'+(apos==null?'—':dinheiroFolha(apos))+'</td>'+
            '<td class="fe-money">'+dinheiroFolha(r.descontoRH||0)+'</td>'+
            '<td class="fe-money">'+dinheiroFolha(r.maisInssExtra)+'</td><td class="fe-money"><strong>'+dinheiroFolha(r.liquido||0)+'</strong></td>'+
            '<td class="fe-status">'+esc([...r.problemas,...(r.avisos||[]),avisoFicha,avisoFonte,avisoNatureza,avisoConta].filter(Boolean).join('; ')||'Pronto para conferir')+'</td></tr>';
        }).join('')+'</tbody></table>'+
        (Number(competencia.slice(0,4))===2026?'<datalist id="fe-fichas-2026">'+FICHAS_PESSOAL_2026.map(f=>'<option value="'+esc(f.ficha)+'" label="'+esc(f.acao)+'"></option>').join('')+'</datalist>':'');
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
          ['Caixa','Sicoob','Bradesco','Pensao','INSS','IRRF','Outros'].map(cat=>'<td class="fe-money">'+dinheiroFolha(c[cat]||0)+'</td>').join('')+
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
      if(campo==='ficha')preencherPelaFicha(k,input.value);
      else if(campo==='contaId'){
        const c=contaPorId(input.value);
        mapa[k]={...(mapa[k]||{}),contaId:input.value};
        if(c?.fonte&&!mapa[k].fonte)mapa[k].fonte=c.fonte;
      }else{
        mapa[k]={...(mapa[k]||{}),[campo]:campo==='fonte'?normalizarFonte(input.value):input.value.trim()};
        if(campo==='fonte')sugerirConta(k);
      }
      aprovouMapa=false;persistir();render();
    });
    const incentivos=p.empenhos.filter(r=>r.tipo==='extra'&&r.incentivo>0);
    const boxIncentivo=incentivos.map(r=>{
      const decisao=mapa[r.id]?.incentivoNoBruto||'';
      return '<label style="display:flex;gap:10px;align-items:center;margin:8px 0;flex-wrap:wrap"><strong>Lotação '+esc(r.lotacao)+'</strong> · Incentivo: '+dinheiroFolha(r.incentivo)+
        ' · Bruto informado pelo RH: '+dinheiroFolha(r.brutoRH||0)+
        ' <select data-extra-bruto="'+esc(r.id)+'"><option value="">Confirmar tratamento do incentivo</option>'+
        '<option value="sim" '+(decisao==='sim'?'selected':'')+'>Já incluído no bruto do RH</option>'+
        '<option value="nao" '+(decisao==='nao'?'selected':'')+'>Somar incentivo ao bruto do RH</option></select></label>';
    }).join('');
    $('#fe-extras').innerHTML=(incentivos.length?'<section class="fe-card"><h2>Incentivo federal de enfermagem · folha extra</h2>'+
      '<p class="fe-muted">Confirme em cada lotação se o bruto do RH já contém o incentivo. A soma é feita somente após a escolha explícita.</p>'+
      boxIncentivo+'</section>':'')+'<details class="fe-sub"><summary>OPs extraorçamentárias sugeridas ('+p.extras.length+')</summary><div class="fe-scroll"><table>'+
      '<thead><tr><th>Tipo</th><th>Empenho origem</th><th>Lotação</th><th>Bruto</th><th>INSS a reter</th><th>Líquido</th><th>Status</th></tr></thead><tbody>'+
      p.extras.map(x=>'<tr><td>'+esc(x.tipo)+'</td><td>'+x.empenhoReferencia+'</td><td>'+esc(x.lotacao)+'</td>'+
        '<td>'+dinheiroFolha(x.bruto)+'</td><td>'+dinheiroFolha(x.inss)+'</td><td>'+dinheiroFolha(x.liquido)+'</td>'+
        '<td>'+esc(x.problemas.join('; ')||'A conferir')+'</td></tr>').join('')+'</tbody></table></div></details>';
    $('#fe-extras').querySelectorAll('[data-extra-bruto]').forEach(c=>c.onchange=()=>{
      const id=c.dataset.extraBruto;
      mapa[id]={...(mapa[id]||{}),incentivoNoBruto:c.value};
      aprovouMapa=false;persistir();render();
    });
  }
  function tabelaConsignados(c){
    if(!c.itens.length&&!c.pendentes.length)return '<p class="fe-muted">Nenhum desconto de consignado ou pensão nesta folha.</p>';
    return '<div class="fe-scroll"><table><thead><tr><th>Banco / desconto</th><th>Fonte de recurso</th><th>Empenhos</th><th class="fe-money">Valor da OP</th></tr></thead><tbody>'+
      c.itens.map(g=>'<tr><td><strong>'+esc(g.destino)+'</strong></td><td>'+esc(g.fonteCompleta)+'</td><td><details><summary>'+g.empenhos.length+' empenho(s)</summary><small>'+
        g.empenhos.map(e=>esc(e.empenho+' · '+e.lotacao+' · '+dinheiroFolha(e.valor))).join('<br>')+'</small></details></td><td class="fe-money"><strong>'+dinheiroFolha(g.total)+'</strong></td></tr>').join('')+
      '</tbody><tfoot>'+Object.entries(c.totais).map(([d,v])=>'<tr><th colspan="3">Total '+esc(d)+'</th><th class="fe-money">'+dinheiroFolha(v)+'</th></tr>').join('')+'</tfoot></table></div>'+
      (c.pendentes.length?'<p class="fe-alert">'+c.pendentes.length+' desconto(s) sem fonte de recurso no empenho: '+c.pendentes.map(p=>esc(p.empenho+' ('+p.destino+')')).join(', ')+'.</p>':'');
  }
  function renderConfirmar(pacote,sit){
    const confirmada=confirmadaValida(pacote);
    const lista=sit.etapas.map(x=>'<li>'+(x.pronta?'✓ ':'✗ ')+'<strong>'+esc(x.titulo)+'</strong>'+
      (x.pronta?'':'<ul class="fe-pend">'+x.pendencias.map(p=>'<li>'+esc(p)+'</li>').join('')+'</ul>')+'</li>').join('');
    $('#fe-checklist').innerHTML='<ul style="list-style:none;padding:0;margin:0 0 12px">'+lista+'</ul>'+
      (confirmada?'<p class="fe-ok"><strong>Folha confirmada</strong> em '+esc(new Date(confirmacao.em).toLocaleString('pt-BR'))+'. Os consignados e pensões por fonte foram enviados para <a href="#/consignacoes" id="fe-ir-consig">Consignações por mês</a>.</p>':
        confirmacao?'<p class="fe-alert">A folha mudou depois da confirmação de '+esc(new Date(confirmacao.em).toLocaleString('pt-BR'))+'. Confirme de novo para atualizar os consignados.</p>':
        sit.podeConfirmar?'<p class="fe-ok">Tudo pronto. Ao confirmar, os descontos de consignados e pensões por fonte vão para Consignações por mês.</p>':'');
    $('#fe-confirmar-folha').disabled=!sit.podeConfirmar||confirmada;
    $('#fe-confirmar-folha').textContent=confirmacao&&!confirmada?'Confirmar de novo':'Confirmar a folha';
    $('#fe-final').disabled=!confirmada;
    const irConsig=$('#fe-ir-consig');
    if(irConsig)irConsig.onclick=()=>{try{sessionStorage.setItem('sisdifi-consignacoes-competencia',competencia);}catch(e){}};
    $('#fe-consignados').innerHTML=pacote?'<h2 style="margin-top:18px;font-size:1rem">Consignados e pensões por fonte de recurso'+(confirmada?'':' · prévia')+'</h2>'+
      '<p class="fe-muted">Valores descontados pelo RH, agrupados pela fonte de cada empenho. Uma linha por banco e fonte: é a OP extraorçamentária.</p>'+
      tabelaConsignados(consignadosPorFonte(pacote.previsao.empenhos)):'';
    const cs=pacote?conferirConsignadosFolha(pacote.previsao.empenhos,minutas):[];
    $('#fe-bancos').innerHTML=pacote?'<div class="fe-scroll"><table><thead><tr><th>Banco/desconto</th><th>RH</th><th>Minuta</th><th>Diferença</th><th>Situação</th></tr></thead><tbody>'+
      cs.map(c=>'<tr><td>'+esc(c.banco)+'</td><td>'+dinheiroFolha(c.esperado)+'</td><td>'+dinheiroFolha(c.minuta)+'</td>'+
        '<td class="fe-money">'+dinheiroFolha(c.diferenca)+'</td><td>'+(c.conferido?'Total conferido':minutas.length?'Diferença':'Aguardando minuta')+'</td></tr>').join('')+'</tbody></table></div>'+
      (!minutas.length?'<p class="fe-muted">Nenhuma minuta consultada. Depois do lançamento, importe as minutas em Consignações por mês e clique em Consultar minutas.</p>':'')+
      '<p class="fe-muted">A igualdade do total por banco não prova que cada guia está vinculada à lotação correta. A comparação por fonte fica em Consignações por mês.</p>':'';
  }
  function render(){
    if(!ativa)return;
    const pacote=montar();
    const sit=situacaoGeral(pacote);
    renderArquivos();renderPessoas();renderNumeracao(pacote);
    const sitContas=renderContas(pacote);
    renderFichas(pacote,sitContas);
    $('#fe-confirmar-mapa').checked=aprovouMapa;
    renderConfirmar(pacote,sit);
    renderPassos(sit,pacote);
    $('#fe-filtro').value=filtro;$('#fe-visao').value=visao;
  }
  async function lerPDF(f){
    if(!/\.pdf$/i.test(f.name)||f.size>90*1024*1024)throw Error('Informe PDF de até 90 MB.');
    return extrairLinhasDaFolha(await f.arrayBuffer());
  }
  function conferirCompetencia(comp){
    if(!comp||comp===competencia)return;
    const temDados=fontesRH.mensal||fontesRH.decimo||fontesRH.rescisao||fontesRH.extra||legado;
    if(temDados)throw Error('O PDF é de '+comp+' e o controle aberto é '+competencia+'. Altere a competência antes de importar para não misturar meses.');
    competencia=comp;$('#fe-comp').value=comp;
    status('Competência identificada automaticamente no PDF: '+comp+'.');
  }
  function lerMaternidades(linhas,nome){
    const candidatos=sugerirMaternidadesDaFolha(linhas,lotacoesDoResumo([arquivosAtuais().principal]));
    const matriculas=new Set(candidatos.achados.map(c=>c.matricula));
    pessoas=pessoas.filter(p=>!matriculas.has(p.matricula)||p.origem==='Preenchimento manual');
    const chaves=new Set(pessoas.map(p=>p.matricula+'|'+p.lotacao));
    for(const c of candidatos.achados){const k=c.matricula+'|'+c.lotacao;if(!chaves.has(k)){chaves.add(k);pessoas.push(c);}}
    origemIndividual=nome;
    alertas=alertas.filter(x=>!/^Matrícula .*lotação .*sem rubrica 163/.test(x));
    alertas.push(...candidatos.avisos);
    return candidatos.achados.length;
  }
  el.querySelectorAll('[data-importar]').forEach(input=>input.onchange=async()=>{
    const f=input.files?.[0],tipo=input.dataset.importar;
    if(!f)return;
    status('Lendo '+f.name+'…');input.disabled=true;
    try{
      const linhas=await lerPDF(f);
      if(tipo==='principal'||tipo==='automatico'){
        const analisado=analisarResumoConsolidado(linhas,{nome:f.name});
        if(!analisado.quantidade)throw Error(ehFolhaNominal(linhas)?'Este PDF é a Folha de pagamento (nominal), não o Resumo de Verbas. O nome do arquivo do RH pode estar trocado: envie-o no campo "Folha de pagamento".':
          'Nenhum Resumo de Verbas legível neste PDF. A folha nominal isolada não traz os totais por lotação; envie o Resumo de Verbas.');
        const comp=analisado.arquivos.find(a=>a.competencia)?.competencia;
        if(tipo==='automatico'){fontesRH={};legado=null;pessoas=[];origemIndividual='';}
        if(tipo==='principal'&&legado){legado=null;}
        conferirCompetencia(comp);
        if(tipo==='principal'&&!analisado.arquivos.some(a=>a.tipo==='principal'))
          throw Error('Este PDF não parece ser a folha mensal (o cabeçalho indica '+analisado.arquivos.map(a=>tipos[a.tipo]).join(', ')+'). Envie-o no campo correspondente.');
        fontesRH={...fontesRH,mensal:{nome:f.name,arquivos:analisado.arquivos,simples:analisarResumoVerbas(linhas,{tipo:'principal',nome:f.name})}};
        if(tipo==='automatico'){delete fontesRH.decimo;delete fontesRH.rescisao;delete fontesRH.extra;}
        alertas=[...analisado.avisos];
        // A folha nominal pode vir no mesmo PDF.
        if(linhas.some(x=>/\b\d{5,8}\s*\/\s*\d+\s+.+/.test(x.texto||'')))lerMaternidades(linhas,f.name);
        status('Folha mensal lida: '+(arquivosAtuais().principal?.registros.length||0)+' lotações. Agora envie a Folha de pagamento e, se houver, o 13º e as rescisões.');
      }else if(tipo==='nominal'){
        if(ehResumo(linhas))throw Error('Este PDF é o Resumo de Verbas, não a Folha de pagamento. O nome do arquivo do RH pode estar trocado: envie-o no campo "Resumo de Verbas".');
        if(!arquivosAtuais().principal)throw Error('Envie primeiro o Resumo de Verbas da folha mensal.');
        const n=lerMaternidades(linhas,f.name);
        status(n+' servidora(s) com maternidade identificada(s) por matrícula e lotação. Confira os valores e marque Conferi.');
      }else{
        if(ehFolhaNominal(linhas)&&!ehResumo(linhas))throw Error('Este PDF é a Folha de pagamento (nominal) de '+tipos[tipo]+'. Aqui vai o Resumo de Verbas: o nome do arquivo do RH pode estar trocado.');
        const cab=linhas.map(l=>tipoDeFolhaCabecalho(l.texto||l)).find(Boolean);
        if(cab&&cab!==tipo)throw Error('O cabeçalho deste PDF indica '+tipos[cab]+', não '+tipos[tipo]+'. Confira o campo escolhido.');
        const a=analisarResumoVerbas(linhas,{tipo,nome:f.name});
        if(!a.registros.length)throw Error('Nenhuma lotação com dados reconhecidos.');
        conferirCompetencia(a.competencia);
        fontesRH={...fontesRH,[tipo]:{nome:f.name,arquivo:a}};
        status('Importado '+f.name+' · '+a.registros.length+' lotações de '+tipos[tipo]+'.');
      }
      aprovouMapa=false;
      await persistir();render();
    }catch(e){toast('Falha em '+f.name+': '+(e.message||e),'erro');status('Arquivo não importado: '+e.message);}
    finally{input.disabled=false;input.value='';}
  });
  el.querySelectorAll('[data-remover-arquivo]').forEach(b=>b.onclick=e=>{
    e.preventDefault();
    const k=b.dataset.removerArquivo;
    if(!window.confirm('Retirar este arquivo da competência?'))return;
    if(k==='nominal'){pessoas=pessoas.filter(p=>p.origem==='Preenchimento manual');origemIndividual='';}
    else if(k==='principal'){fontesRH={...fontesRH};delete fontesRH.mensal;legado=null;alertas=[];}
    else{fontesRH={...fontesRH};delete fontesRH[k];}
    aprovouMapa=false;persistir();render();
  });
  el.addEventListener('click',e=>{
    const b=e.target.closest('[data-ir]');
    if(!b)return;
    e.preventDefault();irPara(b.dataset.ir);
  });
  el.querySelectorAll('.fe-passo>summary').forEach(s=>s.onclick=e=>{
    e.preventDefault();
    const id=s.parentElement.dataset.passo;
    etapa=etapa===id?'':id;persistir();render();
  });
  $('#fe-nova-servidora').onclick=()=>{
    pessoas.push({nome:'',matricula:'',lotacao:'',beneficio:0,inss:0,confirmado:false,origem:'Preenchimento manual'});
    persistir();render();
  };
  $('#fe-nova-conta').onclick=()=>{
    contas=[...contas,{id:novaContaId(contas),nome:'',numero:'',fonte:''}];
    persistir();render();
  };
  $('#fe-comp').onchange=e=>{
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))return;
    competencia=e.target.value;carregar();
  };
  $('#fe-inicio').onchange=e=>{
    const v=Number(e.target.value);
    if(!Number.isSafeInteger(v)||v<1){toast('Informe número inicial válido.','erro');e.target.value=primeiro??'';return;}
    primeiro=v;persistir();render();
  };
  $('#fe-filtro').onchange=e=>{filtro=e.target.value;render();};
  $('#fe-visao').onchange=e=>{visao=e.target.value;render();};
  $('#fe-confirmar-mapa').onchange=e=>{aprovouMapa=e.target.checked;persistir();render();};
  $('#fe-baixar-mapa').onclick=()=>{
    const linhas=[['Tipo','Lotacao','Ficha','Fonte','Conta','Secretaria','Vinculo','Ordem']];
    const ordem=ordemDasLotacoes(mapa);
    for(const r of montar()?.previsao.empenhos||[])linhas.push([r.tipo,r.lotacao,r.ficha,r.fonte,r.conta,r.secretaria,r.vinculo,ordem[r.id]??'']);
    baixar('modelo-ficha-fonte-'+competencia+'.csv',new Blob([csv(linhas)],{type:'text/csv;charset=utf-8'}));
  };
  $('#fe-ler-mapa').onchange=async e=>{
    const f=e.target.files?.[0];if(!f)return;
    try{
      if(!/\.csv$/i.test(f.name)||f.size>2*1024*1024)throw Error('Importe um CSV de até 2 MB.');
      const linhas=parseCSV(await f.text().then(t=>t.replace(/^﻿/,'')));
      const cab=(linhas.shift()||[]).map(x=>x.trim().toLowerCase());
      const ind=x=>cab.indexOf(x);
      if(ind('lotacao')<0||ind('ficha')<0||ind('fonte')<0)
        throw Error('O mapa precisa ter colunas Lotacao, Ficha e Fonte. Use o modelo gerado pelo SISDIFI.');
      const norm=s=>String(s||'').trim().toLowerCase();
      let n=0,semConta=0;
      for(const r of linhas){
        const lot=String(r[ind('lotacao')]||'').trim(),tipo=ind('tipo')<0?'principal':String(r[ind('tipo')]||'principal').trim();
        if(!lot)continue;
        const id=tipo+'|'+lot,textoConta=ind('conta')<0?'':String(r[ind('conta')]||'').trim();
        const conta=textoConta?contas.find(c=>[c.id,c.nome,c.numero,rotuloConta(c)].some(v=>v&&norm(v)===norm(textoConta))):null;
        if(textoConta&&!conta)semConta++;
        mapa[id]={...(mapa[id]||{}),ficha:String(r[ind('ficha')]||'').trim(),fonte:normalizarFonte(r[ind('fonte')]),
          contaId:conta?conta.id:(mapa[id]?.contaId||''),
          secretaria:ind('secretaria')<0?'':String(r[ind('secretaria')]||'').trim(),
          vinculo:ind('vinculo')<0?'':String(r[ind('vinculo')]||'').trim()};
        // Coluna Ordem: posição do empenho na folha, guardada para os próximos meses.
        if(ind('ordem')>=0){const o=String(r[ind('ordem')]||'').trim();if(o)mapa[id].ordem=Number(o.replace(',','.'));else delete mapa[id].ordem;}
        preencherPelaFicha(id,mapa[id].ficha);
        n++;
      }
      aprovouMapa=false;await persistir();render();
      toast(n+' correspondências importadas'+(semConta?'; '+semConta+' conta(s) do CSV não estão cadastradas na etapa 3':'')+'. Confira antes de confirmar.');
    }catch(e){toast(e.message,'erro');}
    finally{e.target.value='';}
  };
  $('#fe-confirmar-folha').onclick=async()=>{
    const pacote=montar();
    if(!pacote||!situacaoGeral(pacote).podeConfirmar){toast('Ainda há pendências nas etapas.','erro');return;}
    const botao=$('#fe-confirmar-folha');botao.disabled=true;
    try{
      const assinatura=assinaturaAtual(pacote),em=new Date().toISOString();
      const previsto=previstoParaConsignacoes(pacote.previsao,{competencia,confirmadaEm:em,assinatura});
      const mes=await carregarMes(uid,competencia);
      // Os totais do RH viram o "valor esperado" de cada banco na conferência das minutas.
      await salvarMes(uid,competencia,{...mes,previstoFolha:previsto,esperados:{...(mes.esperados||{}),...previsto.totais}});
      confirmacao={em,assinatura};
      await persistir();render();
      toast('Folha confirmada. Consignados e pensões enviados para Consignações por mês.');
    }catch(e){toast('Não foi possível confirmar: '+(e.message||e),'erro');render();}
  };
  $('#fe-buscar-minutas').onclick=async()=>{
    try{
      const dados=await carregarMes(uid,competencia);
      minutas=dados.arquivos||[];
      status('Carregadas '+minutas.length+' minuta(s) da competência '+competencia+'.');
      render();
    }catch(e){toast('Não foi possível ler as minutas deste navegador: '+e.message,'erro');}
  };
  function exportar(conferida=false){
    const pacote=montar();
    if(!pacote){toast('Envie o Resumo de Verbas.','erro');return;}
    if(conferida&&!confirmadaValida(pacote)){toast('Confirme a folha antes de baixar a planilha conferida.','erro');return;}
    const sit=saldosDasContas(contas,saldos,pacote.previsao.empenhos);
    const blob=gerarPlanilhaFolha(pacote.previsao,{competencia,
      status:conferida?'CONFERIDA PELA CONTABILIDADE':'RASCUNHO — PENDENTE',
      conciliacao:conferirConsignadosFolha(pacote.previsao.empenhos,minutas),aprovouMapa,
      consignados:consignadosPorFonte(pacote.previsao.empenhos),contas:sit.contas});
    baixar('empenhos-folha-'+competencia+(conferida?'-conferida':'-rascunho')+'.xlsx',blob);
  }
  $('#fe-rascunho').onclick=()=>exportar(false);
  $('#fe-final').onclick=()=>exportar(true);
  carregar();
  return {titulo:'Folha de pagamentos',limpar:()=>{ativa=false;}};
}
