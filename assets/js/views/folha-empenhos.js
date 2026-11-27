// SISDIFI — Folha de pagamentos: relação de empenhos em etapas.
// Exclusivo de Contabilidade/ADM. Compartilhada no Firebase entre os usuários da Contabilidade:
// quem abre a mesma competência vê, na hora, o que o outro preenche. O PDF nunca sai do navegador,
// só os valores lidos dele.
//
// 1 · Arquivos do RH (folha mensal, 13º e rescisão)
// 2 · Número do primeiro empenho
// 3 · Saldo das contas bancárias
// 4 · Ficha, fonte e conta de cada empenho, descontando do saldo
// 5 · Confirmar a folha → consignados e pensões por fonte vão para Consignações por mês
import {estado,pode} from '../estado.js';
import {consultarFichaOrcamento,alertaNaturezaFicha,fonteCompativel,classificacaoPessoal,sugerirFichaDaLotacao,fontesParaEscolher,FICHAS_PESSOAL_2026,fonteDaFicha,codigoCurto,nomeDaFonte} from '../folha-orcamento-2026.js';
import {esc,toast} from '../ui.js';
import {analisarResumoVerbas,analisarResumoConsolidado,descontarFolhasProprias,prepararEmpenhos,conferirConsignadosFolha,centavosFolha,dinheiroFolha,tipoDeFolhaCabecalho,competenciaNoResumo,pagamentosConsignados,atualizarFeriasNoResumo,emitirTextoCSV} from '../folha-empenhos.js?v=3.23.0.997c05d0';
import {extrairLinhasDaFolha} from '../folha-empenhos-pdf.js';
import {sugerirMaternidadesDaFolha,consolidarMaternidade,lotacoesDoResumo} from '../folha-maternidade.js';
import {varrerServidores,codigosDeDesconto} from '../folha-servidores.js';
import {coberturaPorConta,quadroDaFolha,previsaoDaFolha} from '../folha-cobertura.js';
import {pensoesParaOP,chaveCadastro,RUBRICAS_PENSAO} from '../folha-pensoes.js?v=3.26.0.6d3bdba8';
import {passosDoEmpenho,conferirEmpenho,fichasOPpendentes,modeloDoEmpenho,textoDoModelo,MODELOS_HISTORICO} from '../folha-transcrever.js';
import {ordemDasLotacoes} from '../folha-ordem.js?v=3.23.0.06d2837c';
import {gerarPlanilhaFolha} from '../folha-empenhos-xlsx.js?v=3.23.0.418e5047';
import {abrirAssistente} from './folha-assistente.js';
import {linhasDeLancamento,COLUNAS_DESCONTO,linhasDaPlanilha,textoParaColar} from '../folha-lancamento.js';
import {idDaPlanilha,situacaoDaPlanilha,prepararAba,escreverNaPlanilha,PRIMEIRA_LINHA} from '../folha-planilha-google.js';
import {ouvir,ouvirDoc,salvar,substituir,excluir,campoApagado,tokenGooglePlanilhas} from '../db.js';
import {carregarMes,salvarMes} from '../consignacoes-mensal.js?v=3.13.0.357fc820';
import {saldosDasContas,consignadosPorFonte,etapasDaFolha,avisosDaConta,contaParaFonte,rotuloConta,novaContaId,
  normalizarFonte,assinaturaDaFolha,previstoParaConsignacoes} from '../folha-fluxo.js?v=3.23.0.b39bf8aa';

const CADASTRO_PENSAO='pensoes-beneficiarios';
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
  let primeiro=null,fontesRH={},legado=null,pessoas=[],base={mes:{},mapa:{},contas:{},arquivos:{}},escutas=[],renderPendente=false,mapa={},contas=[],saldos={},aprovouMapa=false,confirmacao=null;
  let cadastroPensao={};
  let minutas=[],alertas=[],origemIndividual='',filtro='todos',visao='resumo',carregando=false,ativa=true,etapa='arquivos';
  const $=sel=>el.querySelector(sel);
  const leituraAtual=()=>{
    const originais=legado||arquivosDoRH(fontesRH);
    const arquivos={},resolvidos=new Set(),avisosAtivos=new Set();
    for(const [tipo,original] of Object.entries(originais)){
      const atual=atualizarFeriasNoResumo(original);
      arquivos[tipo]=atual.arquivo;
      for(const a of atual.resolvidos)resolvidos.add(a);
      for(const a of atual.arquivo?.avisos||[])avisosAtivos.add(a);
    }
    return {arquivos,alertasAtivos:alertas.filter(a=>!avisosAtivos.has(a)&&!resolvidos.has(a))};
  };
  const arquivosAtuais=()=>leituraAtual().arquivos;
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
    '.fe #fe-tabela.fe-grade{max-height:65vh;max-height:65dvh;min-height:min(200px,40vh);scrollbar-gutter:stable;scroll-padding-top:62px;border:1px solid #dce5ee;border-radius:8px}'+
    '.fe #fe-tabela.fe-grade thead{position:sticky;top:0;z-index:1}.fe .fe-grade:focus-visible{outline:2px solid #174366}'+
    '.fe .fe-tabela-fichas{min-width:710px}.fe .fe-tabela-fichas td input,.fe .fe-tabela-fichas td select{font-size:1rem}'+
    '.fe .fe-tabela-fichas small{display:block;color:#526b80}.fe .fe-tabela-fichas td{vertical-align:top}'+
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
    /* Sugerida é diferente de conferida: o campo fica editável, mas marcado,
       para a conferência na LOA saber onde olhar. */
    '.fe input.fe-sugerida{border-color:#d0a63c;background:#fffdf4}'+
    /* Transcrever: fonte maior e menos coisa na tela, porque aqui se lê um
       campo e se digita noutro sistema, não se audita um quadro. */
    '.fe .fe-navegar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.fe .fe-navegar strong{color:#13466a}'+
    '.fe .fe-feito{margin-left:auto;display:flex;gap:6px;align-items:center;font-size:.85rem}'+
    '.fe table.fe-campos{font-size:.95rem}.fe table.fe-campos td{padding:10px 8px}'+
    '.fe table.fe-campos tr.fe-grupo td{background:#eef4fa;color:#13466a;font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em}'+
    '.fe table.fe-campos tr.fe-pendente td{background:#fff8e9}.fe table.fe-campos tr.fe-rodape td{border-top:2px solid #cfdce7}'+
    '.fe .fe-valor{font-variant-numeric:tabular-nums;font-size:1.02rem}.fe .fe-valor.fe-destaque{font-weight:700;color:#13466a}'+
    '@media(max-width:900px){.fe .fe-files{grid-template-columns:1fr}}@media(max-width:780px){.fe .fe-grid{grid-template-columns:1fr 1fr}.fe .fe-kpis{grid-template-columns:1fr 1fr}}'+
    '@media(max-width:500px){.fe .fe-grid{grid-template-columns:1fr}}'+
    '.fe-lanc table{font-size:.86rem;border-collapse:collapse;width:100%}.fe-lanc th,.fe-lanc td{padding:6px 8px;border-bottom:1px solid var(--borda,#ddd);vertical-align:top;text-align:left}'+
    '.fe-lanc td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.fe-lanc .hist{font-size:.75rem;min-width:300px;max-width:380px;line-height:1.3}.fe-lanc .op .hist{min-width:0}'+
    '.fe-lanc tr.nb td{background:rgba(220,38,38,.08)}.fe-lanc tr.falta td:first-child{box-shadow:inset 3px 0 #d97706}'+
    '.fe-lanc [data-cp]{cursor:copy}.fe-lanc [data-cp]:hover{outline:1px dashed currentColor}.fe-lanc .op{white-space:nowrap}.fe-lanc .op+.op{margin-top:6px}'+
    '.fe-lanc .ok{color:#15803d;font-weight:700}.fe-lanc .ruim{color:#b91c1c;font-weight:700}.fe-lanc .dif{font-size:.75rem;color:#b91c1c;white-space:normal}'+
    '.fe-lanc .cpb{border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:5px;cursor:pointer;font-size:.72rem;font-weight:700;padding:1px 6px;margin-left:5px;vertical-align:middle}.fe-lanc .cpb:hover{background:#2563eb;color:#fff}'+
    '.fe-lanc .mudou{color:#1d4ed8;font-weight:700}.fe-lanc .grupo td{background:var(--fundo-alt,#f3f4f6);font-weight:700}'+
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
    '<section class="fe-card fe-lanc" id="fe-lancamento"></section>'+
    passo('arquivos',1,'Arquivos do RH',
      '<p class="fe-muted">Envie, nesta ordem, o <strong>Resumo de Verbas</strong> e a <strong>Folha de pagamento</strong> do mês; depois o Resumo de Verbas do <strong>13º</strong> e o das <strong>rescisões</strong>, quando houver. O resumo mensal do RH já contém o 13º e as rescisões: o SISDIFI desconta esses valores do mensal e gera empenhos separados, sem contar o mesmo dinheiro duas vezes.</p>'+
      '<div class="fe-files">'+
        '<div>'+slot('principal','Folha mensal · Resumo de Verbas','Totais por lotação: bruto, descontos e líquido. Obrigatório.','principal')+
          slot('nominal','Folha mensal · Folha de pagamento','Folha nominal para identificar salário-maternidade e descontos de pensão por matrícula.','nominal')+'</div>'+
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
      '<label class="campo"><span>Visualização</span><select id="fe-visao"><option value="resumo">Preencher ficha e fonte</option><option value="planilha">Planilha de empenhos</option><option value="transcrever">Transcrever: um empenho por vez</option><option value="composicao">Composição dos descontos</option></select></label></div>'+
      '<div id="fe-kpis" class="fe-kpis"></div><div id="fe-pendencias"></div>'+
      '<div class="fe-scroll" id="fe-tabela" role="region" aria-label="Visualização dos empenhos"></div><div id="fe-extras"></div>'+
      '<p style="margin-top:12px"><label><input type="checkbox" id="fe-confirmar-mapa"> Conferi as fichas e fontes na LOA</label></p>'+
      '<p class="fe-muted">Preencha ficha e fonte de recursos de todos os empenhos. Na folha extra, se o incentivo federal estiver fora do bruto do RH, escolha <strong>Somar ao bruto</strong> na lotação.</p>'+
      '<div class="fe-continuar"><button type="button" class="btn btn-sec" data-ir="saldos">Voltar</button><button type="button" class="btn" data-ir="confirmar">Continuar</button></div>')+
    passo('confirmar',5,'Confirmar a folha',
      '<div id="fe-checklist"></div>'+
      '<div class="fe-actions"><button type="button" class="btn" id="fe-confirmar-folha" disabled>Confirmar a folha</button>'+
      '<button class="btn btn-sec" type="button" id="fe-rascunho">Baixar rascunho XLSX</button>'+
      '<button class="btn" type="button" id="fe-final" disabled>Baixar planilha conferida XLSX</button></div>'+
      '<div id="fe-repasses"></div><div id="fe-pensoes"></div><div id="fe-consignados"></div>'+
      '<details class="fe-sub" id="fe-depois"><summary>Depois do lançamento: conferir com as minutas dos bancos</summary>'+
        '<p class="fe-muted">A minuta de arrecadação só sai depois que a folha é lançada no sistema contábil. Importe-a em Consignações por mês e compare aqui. Esta conferência não impede a planilha conferida.</p>'+
        '<div class="fe-actions"><button class="btn btn-sec" type="button" id="fe-buscar-minutas">Consultar minutas</button></div><div id="fe-bancos"></div></details>')+
    '<p class="fe-muted" id="fe-compartilhado">Folha compartilhada entre os usuários da Contabilidade: cada lotação, conta e saldo é gravado separadamente, então duas pessoas podem preencher ao mesmo tempo sem apagar o trabalho uma da outra. Os PDFs não saem do navegador; só os valores lidos deles.</p>'+
    '</div>';
  const status=t=>{$('#fe-status').textContent=t;};
  const arquivosLista=()=>descontarFolhasProprias(Object.values(arquivosAtuais())).arquivos;
  const montar=()=>{
    const arquivos=arquivosAtuais();
    if(!Object.values(arquivos).some(x=>x?.registros?.length))return null;
    const maternidade=consolidarMaternidade(pessoas,[arquivos.principal].filter(Boolean));
    /* A ficha vem sugerida pela própria lotação: ou é vencimento e vantagem
       fixa, ou é contratado, e os dois saem do texto que o RH imprime. Sem
       isto a tela abre com todas as fichas em branco e o mês inteiro é
       digitado à mão — foi o que aconteceu em novembro, com 66 empenhos.
       Sugestão não sobrepõe escolha: `mapa[chave].ficha` preenchido manda. */
    const sugestoes={};
    for(const a of arquivosLista())for(const r of (a.registros||[])){
      const chave=a.tipo+'|'+r.lotacao;
      if(mapa[chave]?.ficha)continue;
      const s=sugerirFichaDaLotacao(r);
      if(s.ficha||s.motivo)sugestoes[chave]=s;
    }
    const mapaConsulta=Object.fromEntries([...new Set([...Object.keys(mapa),...Object.keys(sugestoes)])].map(chave=>{
      const m=mapa[chave]||{},sug=sugestoes[chave];
      const ficha=m.ficha||sug?.ficha||'';
      const ref=localizarFicha(ficha),c=contaPorId(m.contaId);
      return [chave,{...m,ficha,
        fonte:m.fonte||sug?.fonte||'',
        desdobramento:m.desdobramento||sug?.desdobramento||'',
        sugerida:!m.ficha&&!!sug?.ficha,
        confiancaFicha:m.ficha?'':(sug?.confianca||''),
        motivoFicha:m.ficha?'':(sug?.motivo||''),
        secretaria:m.secretaria||ref?.unidade||'',lotacaoOrcamentaria:m.lotacaoOrcamentaria||ref?.acao||'',conta:c?rotuloConta(c):''}];
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
      alertas:leituraAtual().alertasAtivos,avisosArquivos:[...new Set(arquivosLista().flatMap(a=>a.avisos||[]))],conferiuFichas:aprovouMapa});
  };
  const assinaturaAtual=pacote=>pacote?assinaturaDaFolha(pacote.previsao.empenhos,contas,saldos):'';
  const confirmadaValida=pacote=>!!(confirmacao&&pacote&&confirmacao.assinatura===assinaturaAtual(pacote));
  /* ---- Compartilhamento (Firebase) ----
     `base` guarda o que veio do servidor. persistir() grava só o que mudou em
     relação a ela, campo a campo: duas pessoas preenchendo lotações diferentes,
     ou saldos de contas diferentes, nunca apagam o trabalho uma da outra. */
  const META=new Set(['id','atualizado_em','atualizado_por','criado_em','criado_por']);
  const limpo=v=>JSON.parse(JSON.stringify(v??null));
  const igual=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
  const semMeta=o=>Object.fromEntries(Object.entries(o||{}).filter(([k])=>!META.has(k)));
  /* O estado da transcrição é do mês: o número de cada OP, a data da
     liquidação e o que já foi digitado, para retomar de onde parou em vez de
     recomeçar. Os modelos de histórico e as fichas extra-orçamentárias
     também ficam aqui, então são escolhidos uma vez por competência. */
  const CAMPOS_MES=['primeiro','pessoas','aprovouMapa','origemIndividual','confirmacao','alertas','previstoFolha',
    'numerosOP','dataLiquidacao','transcritos','fichasOP','escolhasHistorico','textosHistorico'];
  let previstoFolha=null;
  /* empenhoAtual, e não `atual`: persistir() já tem uma local com esse nome,
     e .fe-passos já é a navegação das etapas — daí .fe-campos abaixo. */
  let numerosOP={},dataLiquidacao='',transcritos=[],fichasOP={},escolhasHistorico={},textosHistorico={},empenhoAtual=0;
  /* Quem está preenchendo cada empenho e quais já foram lançados, para duas ou
     mais pessoas trabalharem ao mesmo tempo. Grava só a chave daquele empenho
     (salvar com merge), então uma pessoa não apaga a marcação da outra; por
     isso fica fora de CAMPOS_MES, que grava o campo inteiro. */
  let preenchimento={},assistente=null;
  const valoresMes=()=>({primeiro,pessoas,aprovouMapa,origemIndividual,confirmacao,alertas,previstoFolha,
    numerosOP,dataLiquidacao,transcritos,fichasOP,escolhasHistorico,textosHistorico});
  function persistir(){
    if(!uid||!ativa||carregando)return Promise.resolve();
    const comp=competencia,ops=[],atual=valoresMes(),mes={};
    for(const k of CAMPOS_MES){const v=limpo(atual[k]);if(!igual(v,base.mes[k])){mes[k]=v;base.mes[k]=v;}}
    const saldoBase=base.mes.saldos||{},sal={};
    for(const id of new Set([...Object.keys(saldos),...Object.keys(saldoBase)]))
      if(saldos[id]!==saldoBase[id])sal[id]=saldos[id]==null?campoApagado():saldos[id];
    if(Object.keys(sal).length){mes.saldos=sal;base.mes.saldos={...saldos};}
    if(Object.keys(mes).length)ops.push(salvar('folha_meses',comp,mes));
    for(const [id,m] of Object.entries(mapa)){
      const b=base.mapa[id]||{},d={};
      for(const k of new Set([...Object.keys(m),...Object.keys(b)])){
        if(META.has(k)||k.startsWith('_'))continue;
        if(!igual(m[k],b[k]))d[k]=m[k]===undefined?campoApagado():limpo(m[k]);
      }
      if(Object.keys(d).length){ops.push(salvar('folha_mapa',id,d));base.mapa[id]=structuredClone(m);}
    }
    const contasPorId=Object.fromEntries(contas.map(c=>[c.id,c]));
    for(const id of new Set([...Object.keys(contasPorId),...Object.keys(base.contas)])){
      const c=contasPorId[id];
      if(!c){ops.push(excluir('folha_contas',id));delete base.contas[id];continue;}
      const dados=limpo(semMeta(c));
      if(!igual(dados,semMeta(base.contas[id]))){ops.push(salvar('folha_contas',id,dados));base.contas[id]=structuredClone(c);}
    }
    const caminho='folha_meses/'+comp+'/arquivos';
    for(const ch of new Set([...Object.keys(fontesRH),...Object.keys(base.arquivos)])){
      if(!fontesRH[ch]){ops.push(excluir(caminho,ch));delete base.arquivos[ch];}
      else if(fontesRH[ch]!==base.arquivos[ch]){ops.push(substituir(caminho,ch,limpo(fontesRH[ch])));base.arquivos[ch]=fontesRH[ch];}
    }
    if(!ops.length)return Promise.resolve();
    return Promise.all(ops).catch(e=>{status('Não foi possível salvar no sistema: '+(e.message||e)+'. Verifique a conexão e tente de novo.');});
  }
  // Atualização vinda do outro usuário: não redesenha embaixo de quem está digitando.
  function renderRemoto(){
    const f=document.activeElement;
    if(f&&el.contains(f)&&/^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName)&&f.type!=='file'&&f.type!=='checkbox'){renderPendente=true;return;}
    render();
  }
  el.addEventListener('focusout',()=>setTimeout(()=>{if(renderPendente){renderPendente=false;renderRemoto();}},0));
  const quem=x=>x?.atualizado_por?.nome?String(x.atualizado_por.nome).split(/[ @]/)[0]:'';
  const quando=x=>{try{return x?.atualizado_em?.toDate?x.atualizado_em.toDate().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';}catch(e){return '';}};
  let ultimaAlteracao=null;
  const marcar=x=>{if(x?.atualizado_em?.toMillis&&(!ultimaAlteracao||x.atualizado_em.toMillis()>ultimaAlteracao.atualizado_em.toMillis()))ultimaAlteracao=x;};
  function carregar(){
    for(const parar of escutas)try{parar();}catch(e){}
    escutas=[];base={mes:{},mapa:{},contas:{},arquivos:{}};ultimaAlteracao=null;
    const alvo=competencia;carregando=true;status('Carregando '+alvo+'…');
    primeiro=null;fontesRH={};legado=null;pessoas=[];aprovouMapa=false;origemIndividual='';saldos={};confirmacao=null;alertas=[];minutas=[];previstoFolha=null;
    let prontos=0;const pronto=()=>{if(++prontos===4){carregando=false;
      if(!fontesRH.mensal&&etapa!=='arquivos')etapa='arquivos';
      status(fontesRH.mensal?'Folha compartilhada: o que você e os outros usuários da Contabilidade preencherem aparece aqui na hora.':'Nenhum arquivo nesta competência. Comece pelos arquivos do RH.');}
      render();};
    const erro=e=>{status('Não foi possível abrir a folha compartilhada: '+(e?.message||e)+'. Confira se as regras do Firestore foram publicadas e se o seu usuário é da Contabilidade.');carregando=false;render();};
    const primeira=f=>{let v=false;return x=>{f(x);if(!v){v=true;pronto();}else renderRemoto();};};
    escutas.push(ouvirDoc('folha_meses',alvo,primeira(d=>{
      if(alvo!==competencia)return;
      const m=semMeta(d);base.mes=limpo(m);marcar(d);
      primeiro=m.primeiro??null;pessoas=m.pessoas||[];aprovouMapa=!!m.aprovouMapa;origemIndividual=m.origemIndividual||'';
      saldos={...(m.saldos||{})};confirmacao=m.confirmacao||null;alertas=m.alertas||[];previstoFolha=m.previstoFolha||null;
      numerosOP={...(m.numerosOP||{})};dataLiquidacao=m.dataLiquidacao||'';transcritos=m.transcritos||[];
      preenchimento={...(m.preenchimento||{})};
      fichasOP={...(m.fichasOP||{})};escolhasHistorico={...(m.escolhasHistorico||{})};textosHistorico={...(m.textosHistorico||{})};
    }),erro));
    escutas.push(ouvir('folha_meses/'+alvo+'/arquivos',primeira(docs=>{
      if(alvo!==competencia)return;
      const novo={};for(const d of docs){novo[d.id]=semMeta(d);marcar(d);}
      base.arquivos={...novo};fontesRH=novo;
    }),erro));
    escutas.push(ouvir('folha_mapa',primeira(docs=>{
      mapa={};base.mapa={};cadastroPensao={};
      for(const d of docs){
        if(d.id===CADASTRO_PENSAO){cadastroPensao=d.beneficiarios||{};continue;}
        mapa[d.id]={...semMeta(d),_quem:quem(d),_quando:quando(d)};base.mapa[d.id]=structuredClone(mapa[d.id]);}
    }),erro));
    escutas.push(ouvir('folha_contas',primeira(docs=>{
      contas=docs.map(d=>({...semMeta(d),id:d.id})).sort((a,b)=>a.id.localeCompare(b.id,'pt-BR',{numeric:true}));base.contas=Object.fromEntries(contas.map(c=>[c.id,structuredClone(c)]));
    }),erro));
  }
  function irPara(id){etapa=id;render();el.querySelector('[data-passo="'+id+'"]')?.scrollIntoView({behavior:'smooth',block:'start'});}
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
      [...new Set([...leituraAtual().alertasAtivos,...descontados.arquivos.flatMap(a=>a.avisos||[])])].slice(0,18)
        .map(x=>'<p class="fe-alert">'+esc(x)+'</p>').join('');
  }
  function renderContas(pacote){
    const fontes=[...new Set(FICHAS_PESSOAL_2026.flatMap(f=>f.fontes))].sort();
    $('#fe-fontes').innerHTML=fontes.map(f=>'<option value="'+esc(f)+'"></option>').join('');
    const sit=saldosDasContas(contas,saldos,pacote?.previsao.empenhos||[]);
    $('#fe-contas').innerHTML='<table><thead><tr><th>Nome da conta</th><th>Banco / agência / conta</th><th>Fonte de recurso</th><th class="fe-money">Saldo em '+esc(competencia.slice(5)+'/'+competencia.slice(0,4))+'</th><th>Pode pagar</th><th class="fe-money">Folha nesta conta</th><th class="fe-money">Saldo depois</th><th></th></tr></thead><tbody>'+
      (contas.length?sit.contas.map(c=>'<tr><td><input style="width:190px" data-conta="'+esc(c.id)+'" data-campo="nome" value="'+esc(c.nome||'')+'" placeholder="Ex.: FUNDEB 70%"></td>'+
        '<td><input style="width:190px" data-conta="'+esc(c.id)+'" data-campo="numero" value="'+esc(c.numero||'')+'" placeholder="Ex.: BB 1234-5 / 6789-0"></td>'+
        '<td><input style="width:150px" list="fe-fontes" data-conta="'+esc(c.id)+'" data-campo="fonte" value="'+esc(c.fonte||'')+'" placeholder="1540 · ou várias: 1600, 1604"></td>'+
        '<td class="fe-money"><input style="width:130px;text-align:right" inputmode="decimal" data-conta="'+esc(c.id)+'" data-campo="saldo" value="'+(c.saldo==null?'':formato(c.saldo))+'" placeholder="0,00"></td>'+
        '<td><textarea rows="2" style="width:260px;font-size:.85rem" data-conta="'+esc(c.id)+'" data-campo="podePagar" placeholder="Vazio: qualquer lotação da fonte. Ou nomes dos servidores, ou nº das fichas, separados por vírgula">'+esc(c.podePagar||'')+'</textarea></td>'+
        '<td class="fe-money">'+dinheiroFolha(c.utilizado)+'</td>'+
        '<td class="fe-money '+(c.insuficiente?'fe-neg':'')+'">'+(c.restante==null?'Informe o saldo':dinheiroFolha(c.restante))+'</td>'+
        '<td><button type="button" class="btn btn-sec btn-peq" data-remover-conta="'+esc(c.id)+'">Remover</button></td></tr>').join(''):
        '<tr><td colspan="8">Nenhuma conta cadastrada. Clique em <strong>+ Adicionar conta</strong>.</td></tr>')+
      '</tbody>'+(contas.length?'<tfoot><tr><th colspan="3">Total</th><th class="fe-money">'+dinheiroFolha(sit.totalSaldo)+'</th><th></th><th class="fe-money">'+dinheiroFolha(sit.totalUtilizado)+'</th><th class="fe-money">'+dinheiroFolha(sit.totalSaldo-sit.totalUtilizado)+'</th><th></th></tr></tfoot>':'')+'</table>'+
      (pacote?'<p class="fe-muted">Bruto total dos empenhos desta folha: <strong>'+dinheiroFolha(pacote.previsao.totalBruto)+'</strong>.</p>':'');
    $('#fe-contas').querySelectorAll('[data-conta]').forEach(i=>i.onchange=()=>{
      const c=contaPorId(i.dataset.conta);if(!c)return;
      try{
        if(i.dataset.campo==='saldo'){const v=lerValor(i.value);if(v!=null&&v<0)throw Error('O saldo não pode ser negativo.');if(v==null)delete saldos[c.id];else saldos[c.id]=v;}
        else if(i.dataset.campo==='fonte')c.fonte=i.value.split(/[,;/]|\s+e\s+/).map(x=>normalizarFonte(x.trim())).filter(Boolean).join(', ');
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
    const listaFichas=()=>(Number(competencia.slice(0,4))===2026?'<datalist id="fe-fichas-2026">'+FICHAS_PESSOAL_2026.map(f=>'<option value="'+esc(f.ficha)+'" label="'+esc(f.acao)+'"></option>').join('')+'</datalist>':'');
    const opcoesConta=sel=>'<option value="">Escolher conta</option>'+contas.map(c=>'<option value="'+esc(c.id)+'" '+(c.id===sel?'selected':'')+'>'+esc(rotuloConta(c)||c.id)+(c.fonte?' · '+esc(c.fonte):'')+'</option>').join('')+
      (sel&&!contaPorId(sel)?'<option value="'+esc(sel)+'" selected>Conta removida</option>':'');
    const tabela=$('#fe-tabela');
    const grade=visao!=='transcrever';
    tabela.classList.toggle('fe-grade',grade);
    tabela.tabIndex=grade?0:-1;
    if(visao==='transcrever'){
      /* Um empenho por vez, na ordem em que os campos são digitados no sistema
         da Memory. O quadro grande serve para auditar depois; para digitar, o
         que serve é ter na frente só o campo da vez. */
      const ops=p.extras.reduce((a,x)=>{(a[x.empenhoReferencia]??=[]).push(x);return a;},{});
      const feitos=new Set(transcritos);
      empenhoAtual=Math.max(0,Math.min(empenhoAtual,registros.length-1));
      const r=registros[empenhoAtual];
      if(!r){$('#fe-tabela').innerHTML='';$('#fe-extras').innerHTML='';return;}
      const meus=ops[r.empenho]||[];
      const passos=passosDoEmpenho(r,meus,{dataLiquidacao,competencia,fichasOP,numerosOP,escolhasHistorico,textosHistorico});
      const conf=conferirEmpenho(r,meus);
      const pendFichas=fichasOPpendentes(p.extras,fichasOP);
      let g='';
      const corpo=passos.map((x,i)=>{
        const abre=x.grupo!==g;g=x.grupo;
        const cab=abre?'<tr class="fe-grupo"><td colspan="3">'+esc(x.grupo)+'</td></tr>':'';
        const valor=x.valor?'<span class="fe-valor'+(x.destaque?' fe-destaque':'')+'">'+esc(x.valor)+'</span>'
          :'<em class="fe-muted">a informar</em>';
        const acao=x.chaveOP!=null
          ?'<input style="width:72px" data-op="'+esc(x.chaveOP)+'" placeholder="nº" value="'+esc(numerosOP[x.chaveOP]||'')+'">'
          :x.copiavel?'<button type="button" class="btn btn-sec" data-copiar="'+i+'">copiar</button>':'';
        return cab+'<tr'+(x.faltando||x.informar?' class="fe-pendente"':'')+'>'+
          '<td>'+esc(x.rotulo)+(x.nota?'<br><small class="fe-muted">'+esc(x.nota)+'</small>':'')+'</td>'+
          '<td class="fe-money">'+valor+'</td><td>'+acao+'</td></tr>';
      }).join('');
      const linhasConf=conf.linhas.map(l=>'<tr'+(l.total?' class="fe-rodape"':'')+'><td>'+esc(l.rotulo)+'</td>'+
        '<td class="fe-money">'+(l.total?'<strong>':'')+dinheiroFolha(l.valor)+(l.total?'</strong>':'')+'</td><td></td></tr>').join('');
      const aviso=conf.problemas.map(x=>'<p class="fe-alert">'+esc(x)+'</p>').join('')+
        conf.pendencias.map(x=>'<p class="fe-muted">Falta preencher: '+esc(x)+'</p>').join('')+
        (conf.bateu&&!conf.pendencias.length?'<p class="fe-ok">Bateu com a folha.</p>':'');
      const chaveModelo=modeloDoEmpenho(r,escolhasHistorico);
      const proprio='proprio:'+r.lotacao;
      const opcoesModelo=MODELOS_HISTORICO.map(m=>'<option value="'+m.chave+'"'+(m.chave===chaveModelo?' selected':'')+'>'+esc(m.rotulo)+'</option>').join('')+
        '<option value="'+proprio+'"'+(chaveModelo===proprio?' selected':'')+'>Texto próprio desta lotação</option>';
      const textoModelo=chaveModelo?(textosHistorico[chaveModelo]||textoDoModelo(chaveModelo)):'';
      $('#fe-tabela').innerHTML=
        '<section class="fe-card fe-transcrever">'+
        '<div class="fe-navegar">'+
          '<button type="button" class="btn btn-sec" data-andar="-1"'+(empenhoAtual?'':' disabled')+'>&larr; anterior</button>'+
          '<strong>'+(empenhoAtual+1)+' de '+registros.length+'</strong>'+
          '<span class="fe-muted">'+feitos.size+' já transcrito'+(feitos.size===1?'':'s')+'</span>'+
          '<button type="button" class="btn btn-sec" data-andar="1"'+(empenhoAtual<registros.length-1?'':' disabled')+'>próximo &rarr;</button>'+
          '<label class="fe-feito"><input type="checkbox" data-feito'+(feitos.has(r.id)?' checked':'')+'> transcrito</label>'+
        '</div>'+
        '<h3>Empenho '+r.empenho+' · '+esc(r.secretaria||'')+' · '+esc(r.vinculo||'')+'</h3>'+
        '<p class="fe-muted">Lotação '+esc(r.lotacao)+' · '+esc(tipos[r.tipo]||r.tipo)+'</p>'+
        '<div class="fe-scroll"><table class="fe-campos"><tbody>'+corpo+
          '<tr class="fe-grupo"><td colspan="3">Conferência</td></tr>'+linhasConf+'</tbody></table></div>'+
        aviso+'</section>';
      $('#fe-extras').innerHTML=
        '<section class="fe-card"><h3>Vale para todos os empenhos</h3>'+
        '<label class="campo"><span>Data da liquidação</span>'+
          '<input id="fe-data-liq" placeholder="dd/mm/aaaa" value="'+esc(dataLiquidacao)+'"></label>'+
        '<label class="campo"><span>Modelo do histórico deste empenho</span>'+
          '<select id="fe-modelo-sel">'+(chaveModelo?'':'<option value="" selected>— escolher —</option>')+opcoesModelo+'</select></label>'+
        (chaveModelo?'<label class="campo"><span>Texto do modelo</span>'+
          '<input id="fe-modelo-txt" style="width:100%" value="'+esc(textoModelo)+'"></label>'+
          '<p class="fe-muted">Marcas: {mes} {mes_numero} {ano} {vinculo} {secretaria} {lotacao}. Editar aqui vale para todos os empenhos deste vínculo.</p>'
          :'<p class="fe-alert">Este empenho está sem modelo de histórico: escolha acima.</p>')+
        (pendFichas.length?'<p class="fe-alert">Informe a ficha extra-orçamentária de: '+pendFichas.map(esc).join(', ')+'.</p>':'')+
        [...new Set([...pendFichas,...Object.keys(fichasOP)])].map(t2=>'<label class="campo"><span>Ficha extra · '+esc(t2)+'</span>'+
          '<input data-ficha-op="'+esc(t2)+'" value="'+esc(fichasOP[t2]||'')+'" placeholder="nº da ficha"></label>').join('')+
        '</section>';
      const area=el;
      area.querySelectorAll('[data-copiar]').forEach(b=>b.onclick=async()=>{
        try{ await navigator.clipboard.writeText(passos[Number(b.dataset.copiar)].valor); b.textContent='copiado'; }
        catch{ status('Não foi possível copiar: selecione o valor à mão.'); }
      });
      area.querySelectorAll('[data-andar]').forEach(b=>b.onclick=()=>{empenhoAtual+=Number(b.dataset.andar);render();});
      area.querySelector('[data-feito]').onchange=ev=>{
        const s2=new Set(transcritos);
        if(ev.target.checked){s2.add(r.id);if(empenhoAtual<registros.length-1)empenhoAtual++;}
        else s2.delete(r.id);
        transcritos=[...s2];persistir();render();
      };
      area.querySelectorAll('[data-op]').forEach(i=>i.onchange=()=>{
        const v=i.value.trim();
        if(v)numerosOP[i.dataset.op]=v; else delete numerosOP[i.dataset.op];
        persistir();render();
      });
      area.querySelectorAll('[data-ficha-op]').forEach(i=>i.onchange=()=>{
        const v=i.value.trim();
        if(v)fichasOP[i.dataset.fichaOp]=v; else delete fichasOP[i.dataset.fichaOp];
        persistir();render();
      });
      $('#fe-data-liq').onchange=ev=>{dataLiquidacao=ev.target.value.trim();persistir();render();};
      $('#fe-modelo-sel').onchange=ev=>{
        const v=ev.target.value;
        if(v)escolhasHistorico[r.lotacao]=v; else delete escolhasHistorico[r.lotacao];
        persistir();render();
      };
      const campoTexto=$('#fe-modelo-txt');
      if(campoTexto)campoTexto.onchange=ev=>{
        const chave=modeloDoEmpenho(r,escolhasHistorico);
        if(!chave)return;
        const v=ev.target.value.trim();
        if(v&&v!==textoDoModelo(chave))textosHistorico[chave]=v; else delete textosHistorico[chave];
        persistir();render();
      };
      return;
    }
    if(visao==='planilha'){
      const ops=new Map();
      for(const x of p.extras){
        const lista=ops.get(x.empenhoReferencia)||[];
        lista.push(x);ops.set(x.empenhoReferencia,lista);
      }
      const moeda=v=>'<td class="fe-money">'+v+'</td>';
      const soma=(lista,campo)=>lista.reduce((n,x)=>n+(x[campo]||0),0);
      const vaga=lista=>moeda(lista.length?dinheiroFolha(soma(lista,'bruto')):'')+
        moeda(lista.some(x=>x.inss)?dinheiroFolha(soma(lista,'inss')):'');
      const linhas=registros.map(r=>{
        const m=mapa[r.id]||mapa[r.lotacao]||{};
        const extras=ops.get(r.empenho)||[];
        const input=(campo,rotulo,valor,atributos='')=>'<td><input aria-label="'+rotulo+
          '" data-ref="'+esc(r.id)+'" data-campo="'+campo+'" value="'+esc(valor||'')+'"'+atributos+'></td>';
        return '<tr><td>'+esc(tipos[r.tipo])+'</td><td><strong>'+r.empenho+'</strong><br><small>'+esc(r.lotacao)+'</small></td>'+
          input('secretaria','Secretaria',r.secretaria)+
          input('ficha','Ficha',r.ficha,' list="fe-fichas-2026"'+
            (r.fichaSugerida?' class="fe-sugerida" title="'+esc(r.motivoFicha||'')+'"':''))+
          input('fonte','Fonte',r.fonte,!m.fonte&&r.fonte?' class="fe-sugerida" title="Fonte da ficha sugerida"':'')+
          input('desdobramento','Desdobramento',r.desdobramento)+
          '<td><select aria-label="Conta bancária" data-ref="'+esc(r.id)+'" data-campo="contaId">'+opcoesConta(r.contaId)+'</select></td>'+
          moeda(dinheiroFolha(r.bruto))+moeda(dinheiroFolha(r.descontoAjustado))+
          '<td>'+extras.map(x=>'<input data-op="'+esc(x.id)+'" aria-label="Número da OP de '+esc(x.tipo)+
            '" title="'+esc(x.tipo)+'" value="'+esc(numerosOP[x.id]||'')+'">').join(' ')+'</td>'+
          vaga(extras.slice(0,1))+vaga(extras.slice(1))+moeda(dinheiroFolha(r.liquido+soma(extras,'liquido')))+
          '<td class="fe-status">'+esc(r.problemas.join(' · '))+'</td></tr>';
      }).join('');
      const liquido=p.totalLiquido+p.totalLiquidoExtras;
      const totais=[
        ['Bruto geral',p.totalBruto+soma(p.extras,'bruto')],['Líquido geral',liquido],
        ['Líquido do resumo do RH',p.totalLiquidoResumo],['Diferença',liquido-p.totalLiquidoResumo]
      ];
      $('#fe-tabela').innerHTML='<table><thead><tr><th colspan="3"></th><th colspan="6">Empenho orçamentário</th>'+
        '<th colspan="5">Extraorçamentária</th><th colspan="2"></th></tr><tr>'+
        ['Grupo','Empenho','Secretaria','Ficha','Fonte','Desdobramento','Conta bancária','Bruto','Desconto da liquidação',
          'Nº OP','Bruto OP 1','Retenção OP 1','Bruto demais OPs','Retenção demais OPs','Líquido','Pendências']
          .map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+
        (linhas||'<tr><td colspan="16">Nenhum empenho neste filtro.</td></tr>')+'</tbody><tfoot>'+
        totais.map(([rotulo,valor])=>'<tr><th colspan="14" scope="row">'+rotulo+'</th>'+moeda(dinheiroFolha(valor))+'<td></td></tr>').join('')+
        '</tfoot></table>'+listaFichas();
      $('#fe-tabela').querySelectorAll('[data-op]').forEach(i=>i.onchange=()=>{
        const v=i.value.trim();
        if(v)numerosOP[i.dataset.op]=v;else delete numerosOP[i.dataset.op];
        persistir();
      });
    }else if(visao==='resumo'){
      tabela.innerHTML='<table class="fe-tabela-fichas"><thead><tr><th>Empenho / lotação</th><th>Ficha</th><th>Fonte</th><th>Conta</th><th class="fe-money">Saldo após empenho</th><th>Detalhes</th></tr></thead><tbody>'+
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
          const campo=(nome,rotulo,valor)=>'<label class="campo"><span>'+rotulo+'</span><input data-ref="'+esc(r.id)+
            '" data-campo="'+nome+'" value="'+esc(valor||'')+'"></label>';
          const avisos=[...r.problemas,...(r.avisos||[]),avisoFicha,avisoFonte,avisoNatureza,avisoConta].filter(Boolean);
          const resumo=avisos.length?avisos.length+' aviso(s)':'Ver detalhes';
          return '<tr><td><strong>'+r.empenho+'</strong><small>'+esc(r.secretaria||tipos[r.tipo])+'</small>'+
            '<small>'+esc(r.lotacao)+'</small></td>'+
            '<td><input aria-label="Ficha do empenho '+r.empenho+'" list="fe-fichas-2026" data-ref="'+esc(r.id)+
              '" data-campo="ficha" value="'+esc(m.ficha||r.ficha||'')+'"'+
              (r.fichaSugerida?' class="fe-sugerida" title="Sugerida pela lotação: '+esc(r.motivoFicha||'')+'"':'')+'>'+
              (r.fichaSugerida?'<small>Sugerida</small>':'')+'</td>'+
            '<td><input aria-label="Fonte do empenho '+r.empenho+'" list="fe-fontes" data-ref="'+esc(r.id)+
              '" data-campo="fonte" value="'+esc(m.fonte||r.fonte||'')+'"'+
              (!m.fonte&&r.fonte?' class="fe-sugerida" title="Fonte da ficha sugerida"':'')+'></td>'+
            '<td><select aria-label="Conta do empenho '+r.empenho+'" style="width:150px" data-ref="'+esc(r.id)+
              '" data-campo="contaId">'+opcoesConta(r.contaId)+'</select></td>'+
            '<td class="fe-money '+(apos<0?'fe-neg':'')+'">'+(apos==null?'—':dinheiroFolha(apos))+'</td>'+
            '<td><details data-detalhes="'+esc(r.id)+'"><summary>'+resumo+'</summary>'+
              (avisos.length?'<ul class="fe-pend">'+avisos.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+
              campo('secretaria','Secretaria / unidade',m.secretaria||r.secretaria)+
              campo('vinculo','Vínculo',m.vinculo||r.vinculo)+
              campo('lotacaoOrcamentaria','Ação orçamentária',m.lotacaoOrcamentaria||ref?.acao)+
              '<small>'+esc([classe.codigo,classe.titulo,ref?.origem].filter(Boolean).join(' · '))+'</small>'+
              '<small>Bruto '+dinheiroFolha(r.bruto)+' · Desconto RH '+dinheiroFolha(r.descontoRH)+
              ' · INSS extra '+dinheiroFolha(r.maisInssExtra)+' · Líquido '+dinheiroFolha(r.liquido)+'</small>'+
              (m._quem?'<small>Última alteração: '+esc(m._quem)+(m._quando?' · '+esc(m._quando):'')+'</small>':'')+
              '</details></td></tr>';
        }).join('')+(registros.length?'':'<tr><td colspan="6">Nenhum empenho neste filtro.</td></tr>')+
        '</tbody></table>'+listaFichas();
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
        if(c?.fonte&&!mapa[k].fonte)mapa[k].fonte=c.fonte.split(',')[0].trim();
      }else{
        mapa[k]={...(mapa[k]||{}),[campo]:campo==='fonte'?normalizarFonte(input.value):input.value.trim()};
        if(campo==='fonte')sugerirConta(k);
      }
      aprovouMapa=false;persistir();
      // Deixa o navegador concluir Tab ou o clique antes de repor os campos calculados.
      setTimeout(render,0);
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
  function renderRepasses(p){
    const alvo=$('#fe-repasses');
    if(!p){alvo.innerHTML='';return;}
    const r=pagamentosConsignados(p.empenhos);
    const destinos=r.destinos.filter(d=>d.chave!=='Pensao');
    if(!destinos.length&&!r.outros.length){alvo.innerHTML='';return;}
    const linhas=destinos.map(d=>'<tr><th colspan="2">'+esc(d.nome)+' · ficha '+esc(d.fichaExtra)+'</th>'+
      '<th class="fe-money">'+dinheiroFolha(d.valor)+'</th><th>'+esc(d.forma)+'</th></tr>'+
      d.porFonte.map(f=>'<tr><td></td><td>'+(f.fonte?esc(f.fonte):'<strong>Fonte a informar</strong>')+'</td>'+
        '<td class="fe-money">'+dinheiroFolha(f.valor)+'</td><td>'+f.empenhos.map(esc).join(', ')+'</td></tr>').join('')
    ).join('');
    const outros=r.outros.length?'<p class="fe-muted">Fora do repasse a terceiro: '+
      r.outros.map(x=>esc(x.codigo)+' '+esc(x.descricao)+' · '+dinheiroFolha(x.valor)).join(' · ')+'</p>':'';
    alvo.innerHTML='<section class="fe-card"><h2>Repasses por fonte de recursos</h2>'+
      '<p class="fe-muted">Cada fonte informada corresponde a uma OP por destino. A pensão é apresentada em OP única no quadro próprio.</p>'+
      (linhas?'<div class="fe-scroll"><table><thead><tr><th>Destino</th><th>Fonte</th><th class="fe-money">Valor</th><th>Empenhos de origem</th></tr></thead>'+
        '<tbody>'+linhas+'</tbody></table></div>':'')+outros+'</section>';
  }
  function renderPensoes(p){
    const alvo=$('#fe-pensoes');
    if(!p){alvo.innerHTML='';return;}
    const r=pensoesParaOP(p.empenhos,fontesRH.nominal?.pensoes||[],cadastroPensao);
    if(!r.totalEmpenhado&&!r.op.quantidade){alvo.innerHTML='';return;}
    const linhas=r.op.liquidacoes.map((l,i)=>'<tr><td>'+esc(l.lotacao)+'</td><td>'+(l.empenho??'—')+'</td>'+
      '<td>'+esc(l.matricula)+'</td><td>'+esc(l.servidor)+'</td><td>'+esc(l.rubrica)+'</td>'+
      '<td class="fe-money">'+dinheiroFolha(l.valor)+'</td>'+
      '<td><input style="width:190px" data-pensao="'+i+'" data-campo="beneficiario" '+
        'placeholder="Nome no comprovante" aria-label="Beneficiário no comprovante de depósito" '+(l.matricula?'':'disabled ')+'value="'+esc(l.beneficiario)+'"></td>'+
      '<td><input style="width:150px" data-pensao="'+i+'" data-campo="processo" '+
        'placeholder="processo (opcional)" aria-label="Processo" '+(l.matricula?'':'disabled ')+'value="'+esc(l.processo)+'"></td></tr>'+
      '<tr class="fe-historico"><td colspan="8"><span class="fe-muted">Histórico: </span>'+esc(l.historico)+'</td></tr>').join('');
    alvo.innerHTML='<section class="fe-card"><h2>Pensão alimentícia · OP única · ficha 8 · '+r.op.quantidade+
      ' liquidaç'+(r.op.quantidade===1?'ão':'ões')+' · '+dinheiroFolha(r.op.total)+'</h2>'+
      '<p class="fe-muted">Uma ordem de pagamento extraorçamentária, com uma liquidação por pensão. '+
      'A folha do RH identifica o desconto por matrícula. Após o pagamento da folha, informe o nome do beneficiário que consta no comprovante de depósito. O nome entra no histórico e fica salvo por matrícula e rubrica.</p>'+
      (r.pendentes.length?'<p class="fe-alert">'+r.pendentes.length+' liquidaç'+(r.pendentes.length===1?'ão':'ões')+
        ' aguardando identificação do beneficiário pelo comprovante de depósito.</p>':'')+
      r.avisos.map(a=>'<p class="fe-alert">'+esc(a)+'</p>').join('')+
      (r.op.quantidade?'<div class="fe-scroll"><table><thead><tr><th>Lotação</th><th>Empenho</th>'+
        '<th>Matrícula</th><th>Servidor</th><th>Rubrica</th><th>Valor</th><th>Beneficiário</th><th>Processo</th>'+
        '</tr></thead><tbody>'+linhas+'</tbody></table></div>':'')+'</section>';
    alvo.querySelectorAll('[data-pensao]').forEach(i=>i.onchange=async()=>{
      const l=r.op.liquidacoes[Number(i.dataset.pensao)];
      if(!l)return;
      const k=chaveCadastro(l.matricula,l.rubrica);
      if(!l.matricula)return;
      try{
        await salvar('folha_mapa',CADASTRO_PENSAO,{beneficiarios:{[k]:{[i.dataset.campo]:i.value.trim()}}});
      }catch(e){
        toast('Falha ao salvar o cadastro da pensão: '+(e.message||e),'erro');
        render();
      }
    });
  }
  function renderConfirmar(pacote,sit){
    renderRepasses(pacote?.previsao);
    renderPensoes(pacote?.previsao);
    const confirmada=confirmadaValida(pacote);
    const lista=sit.etapas.map(x=>'<li>'+(x.pronta?'✓ ':'✗ ')+'<strong>'+esc(x.titulo)+'</strong>'+
      (x.pronta?'':'<ul class="fe-pend">'+x.pendencias.map(p=>'<li>'+esc(p)+'</li>').join('')+'</ul>')+'</li>').join('');
    const avisosSaldo=sit.situacao.insuficientes.map(c=>'<p class="fe-alert">Saldo insuficiente em '+
      esc(rotuloConta(c))+'. Faltam '+dinheiroFolha(-c.restante)+'. Você pode confirmar a folha.</p>').join('');
    $('#fe-checklist').innerHTML='<ul style="list-style:none;padding:0;margin:0 0 12px">'+lista+'</ul>'+avisosSaldo+
      (confirmada?'<p class="fe-ok"><strong>Folha confirmada</strong>'+(confirmacao.por?' por '+esc(confirmacao.por):'')+' em '+esc(new Date(confirmacao.em).toLocaleString('pt-BR'))+'. Os consignados e pensões por fonte foram enviados para <a href="#/consignacoes" id="fe-ir-consig">Consignações por mês</a>.</p>':
        confirmacao?'<p class="fe-alert">A folha mudou depois da confirmação de '+esc(new Date(confirmacao.em).toLocaleString('pt-BR'))+'. Confirme de novo para atualizar os consignados.</p>':
        sit.podeConfirmar?'<p class="fe-ok">Tudo pronto. Ao confirmar, os descontos de consignados e pensões por fonte vão para Consignações por mês.</p>':'');
    $('#fe-confirmar-folha').disabled=!sit.podeConfirmar||confirmada;
    $('#fe-confirmar-folha').textContent=confirmacao&&!confirmada?'Confirmar de novo':'Confirmar a folha';
    $('#fe-final').disabled=!confirmada;
    const irConsig=$('#fe-ir-consig');
    if(irConsig)irConsig.onclick=()=>{try{sessionStorage.setItem('sisdifi-consignacoes-competencia',competencia);}catch(e){}};
    $('#fe-consignados').innerHTML=pacote?'<h2 style="margin-top:18px;font-size:1rem">Consignados e pensões por fonte de recurso'+(confirmada?'':' · prévia')+'</h2>'+
      '<p class="fe-muted">Valores descontados pelo RH, agrupados pela fonte de cada empenho. Esta distribuição serve para conferir a minuta.</p>'+
      tabelaConsignados(consignadosPorFonte(pacote.previsao.empenhos)):'';
    const cs=pacote?conferirConsignadosFolha(pacote.previsao.empenhos,minutas):[];
    $('#fe-bancos').innerHTML=pacote?'<div class="fe-scroll"><table><thead><tr><th>Banco/desconto</th><th>RH</th><th>Minuta</th><th>Diferença</th><th>Situação</th></tr></thead><tbody>'+
      cs.map(c=>'<tr><td>'+esc(c.banco)+'</td><td>'+dinheiroFolha(c.esperado)+'</td><td>'+dinheiroFolha(c.minuta)+'</td>'+
        '<td class="fe-money">'+dinheiroFolha(c.diferenca)+'</td><td>'+(c.conferido?'Total conferido':minutas.length?'Diferença':'Aguardando minuta')+'</td></tr>').join('')+'</tbody></table></div>'+
      (!minutas.length?'<p class="fe-muted">Nenhuma minuta consultada. Depois do lançamento, importe as minutas em Consignações por mês e clique em Consultar minutas.</p>':'')+
      '<p class="fe-muted">A igualdade do total por banco não prova que cada guia está vinculada à lotação correta. A comparação por fonte fica em Consignações por mês.</p>':'';
  }
  /* ---- Lançamento: uma linha por empenho ----
     O que se digita no sistema contábil, na ordem dos empenhos, sem lotação e
     sem conta: ficha, fonte, bruto, histórico, desconto e composição, OPs e a
     prova contra o Resumo de Verbas. Não depende das etapas: aparece assim que
     o Resumo de Verbas é lido. Clicar num valor copia. */
  const linkPlanilha=()=>{try{return localStorage.getItem('sisdifi-folha-planilha')||'';}catch(e){return '';}};
  const somenteValor=c=>(c/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  /* Saldo por fonte, das contas da etapa 3, na ordem das contas. */
  const contasComSaldo=()=>contas.filter(c=>c.fonte&&saldos[c.id]!=null).map(c=>({id:c.id,nome:c.nome||rotuloConta(c),fonte:c.fonte,saldo:saldos[c.id],podePagar:c.podePagar||''}));
  const fichaInfo=ficha=>{
    const ref=localizarFicha(ficha);
    if(!ref)return null;
    const fontes=(ref.fontes||[]).map(codigoCurto);
    const propria=fontes.includes('1500')?fonteDaFicha({fontes:['1500'],unidade:ref.unidade,acao:ref.acao}):'';
    return {fontes,propria};
  };
  const eu=()=>({uid:estado.sessao?.uid||'',nome:String(estado.sessao?.nome||estado.sessao?.email||'').split(/[ @]/)[0]});
  const lancadoNoMes=id=>preenchimento[id]?.estado==='lancado'||transcritos.includes(id);
  function marcarPreenchimento(id,situacao){
    const v=situacao?{estado:situacao,...eu(),em:new Date().toISOString()}:null;
    preenchimento={...preenchimento,[id]:v};
    if(uid)salvar('folha_meses',competencia,{preenchimento:{[id]:v}}).catch(e=>toast('Não foi possível gravar o andamento: '+(e.message||e),'erro'));
    render();
  }
  function abrirPreenchimento(p,inicio=null){
    assistente=abrirAssistente({empenhos:p.empenhos,extras:p.extras,inicio,eu:eu(),
      estado:{competencia,dataLiquidacao,numerosOP,transcritos,preenchimento,fichasOP,escolhasHistorico,textosHistorico},
      aoMarcar:marcarPreenchimento,
      aoMudar:m=>{
        if('dataLiquidacao' in m)dataLiquidacao=m.dataLiquidacao;
        if(m.numerosOP)numerosOP=m.numerosOP;
        if(m.escolhasHistorico)escolhasHistorico=m.escolhasHistorico;
        persistir();render();
      }});
  }
  function renderLancamento(pacote){
    const alvo=$('#fe-lancamento');
    if(!pacote){alvo.innerHTML='<h2>Lançamento · uma linha por empenho</h2><p class="fe-muted">Envie o Resumo de Verbas na etapa 1 e a tabela aparece aqui.</p>';return;}
    const p=pacote.previsao;
    const r=linhasDeLancamento(p,{competencia,numerosOP,escolhasHistorico,textosHistorico});
    const rateio=coberturaPorConta(p.empenhos,contasComSaldo(),fichaInfo,fontesRH.nominal?.quadro||null);
    const proposta=Object.fromEntries(rateio.propostas.map(x=>[x.id,x]));
    const usadas=COLUNAS_DESCONTO.filter(c=>r.linhas.some(l=>l.composicao[c.chave]));
    const temOP=r.linhas.some(l=>l.ops.length);
    /* Cada valor tem o botão de copiar à vista (⧉): clicar no valor também copia. */
    const cp=(v,txt)=>'<span data-cp="'+esc(v)+'">'+esc(txt??v)+'</span><button type="button" class="cpb" data-cp="'+esc(v)+'" title="Copiar" aria-label="Copiar '+esc(txt??v)+'">copiar</button>';
    const din=c=>c?cp(somenteValor(c)):'<span class="fe-muted">—</span>';
    const nomes={principal:'Folha mensal',extra:'Folha extra',decimo:'Adiantamento do 13º',rescisao:'Rescisões'};
    const colunas=7+usadas.length+(temOP?1:0)+3;
    let grupo='';
    const corpo=r.linhas.map(l=>{
      const cab=l.tipo!==grupo?'<tr class="grupo"><td colspan="'+colunas+'">'+esc(nomes[l.tipo]||l.tipo)+'</td></tr>':'';grupo=l.tipo;
      const pr=proposta[l.id];
      const fonte=l.fonte?cp(l.fonte):'<span class="ruim">falta</span>';
      const sugere=pr?.mudou?'<br><small class="mudou" title="'+esc(pr.motivo)+'">saldo: '+(pr.ficha!==l.ficha?'ficha '+esc(pr.ficha)+' · ':'')+esc(pr.fonte)+'</small>':'';
      const ops=l.ops.map(o=>'<div class="op"><strong>'+esc(o.tipo)+'</strong> · ficha '+cp(o.ficha||'?')+'<br>'+
        'OP nº <input data-op-lanc="'+esc(o.id)+'" style="width:64px" value="'+esc(o.numero)+'" aria-label="Número da OP"> '+din(o.valor)+
        (o.desconto?' · desconto (INSS) '+din(o.desconto):'')+'<br><small class="hist">'+cp(o.historico)+'</small></div>').join('');
      const lancado=lancadoNoMes(l.id),quem=preenchimento[l.id],n=p.empenhos.findIndex(e=>e.id===l.id);
      const situ=lancado?'<small class="ok">✓ lançado'+(quem?.nome?' · '+esc(quem.nome):'')+'</small>'
        :quem?.estado==='preenchendo'?'<small class="mudou">✎ '+(quem.uid===eu().uid?'você':esc(quem.nome||'em preenchimento'))+'</small>'
        :'<button type="button" class="cpb" data-preencher="'+n+'" title="Abrir o assistente neste empenho">▶ preencher</button>';
      return cab+'<tr class="'+(l.bateu?'':'nb ')+(l.falta.length?'falta':'')+'">'+
        '<td><strong>'+cp(String(l.numero),l.empenhoAno)+'</strong><br>'+situ+'</td>'+
        '<td>'+(l.ficha?cp(l.ficha):'<span class="ruim">falta</span>')+'</td>'+
        '<td>'+fonte+sugere+'</td>'+
        '<td class="n">'+din(l.bruto)+'</td>'+
        '<td class="hist">'+(l.historico?cp(l.historico):'<span class="ruim">escolher modelo (Transcrever)</span>')+'</td>'+
        '<td class="n"><strong>'+din(l.desconto)+'</strong></td>'+
        usadas.map(c=>'<td class="n">'+din(l.composicao[c.chave])+'</td>').join('')+
        (temOP?'<td>'+(ops||'<span class="fe-muted">—</span>')+'</td>':'')+
        '<td class="n"><strong>'+din(l.calculado)+'</strong></td>'+
        '<td class="n">'+(l.resumo==null?'<span class="ruim">?</span>':din(l.resumo))+'</td>'+
        '<td>'+(l.bateu?'<span class="ok">✓ bateu</span>':'<span class="ruim">✗ não bateu</span>'+l.diferencas.map(d=>'<div class="dif">'+esc(d)+'</div>').join(''))+'</td>'+
        '</tr>';
    }).join('');
    const tot=r.totais;
    const rodape='<tr class="grupo"><td colspan="3">Total · '+r.linhas.length+' empenhos</td><td class="n">'+somenteValor(tot.bruto)+'</td><td></td>'+
      '<td class="n">'+somenteValor(tot.desconto)+'</td>'+usadas.map(c=>'<td class="n">'+somenteValor(tot.composicao[c.chave])+'</td>').join('')+
      (temOP?'<td class="n">'+somenteValor(tot.liquidoOP)+'</td>':'')+'<td class="n">'+somenteValor(tot.calculado)+'</td><td class="n">'+somenteValor(tot.resumo)+'</td>'+
      '<td>'+(tot.calculado===tot.resumo?'<span class="ok">✓</span>':'<span class="ruim">dif. '+somenteValor(tot.resumo-tot.calculado)+'</span>')+'</td></tr>';
    /* Cobertura das contas: quanto de cada saldo a folha usa, o que vai para o
       recurso próprio e o que o RH poderia separar para usar melhor o saldo. */
    const tipoRegra={servidores:'servidores pelo nome',fichas:'fichas',livre:'qualquer lotação da fonte'};
    /* Previsão do mês com a cobertura aplicada: contas × recurso próprio. */
    const prev=previsaoDaFolha(p.empenhos,rateio.propostas);
    const barra='<div style="display:flex;height:14px;border-radius:7px;overflow:hidden;margin:6px 0;background:#e5e7eb">'+
      '<div style="width:'+prev.pctContas+'%;background:#16a34a" title="Contas"></div><div style="width:'+prev.pctPropria+'%;background:#f59e0b" title="Recurso próprio"></div></div>';
    const previsao='<div class="fe-card" style="margin:8px 0;padding:10px 12px"><strong>Previsão do mês</strong> · bruto dos empenhos '+dinheiroFolha(prev.total)+barra+
      '<span style="color:#15803d"><strong>'+dinheiroFolha(prev.contas)+'</strong> das contas estaduais e federais ('+prev.pctContas.toLocaleString('pt-BR')+'%)</span> · '+
      '<span style="color:#b45309"><strong>'+dinheiroFolha(prev.propria)+'</strong> de recurso próprio ('+prev.pctPropria.toLocaleString('pt-BR')+'%)</span>'+
      (prev.semFonte?' · <span class="ruim">'+dinheiroFolha(prev.semFonte)+' sem fonte</span>':'')+
      '<div class="fe-scroll"><table style="margin-top:6px"><thead><tr><th>Fonte</th><th></th><th class="n">Valor</th><th class="n">%</th><th class="n">Empenhos</th></tr></thead><tbody>'+
      prev.porFonte.map(x=>'<tr><td>'+esc(x.fonte)+'</td><td>'+esc(nomeDaFonte(x.fonte)||'')+(x.propria?' <small class="fe-muted">(próprio)</small>':'')+'</td><td class="n">'+somenteValor(x.valor)+'</td><td class="n">'+x.pct.toLocaleString('pt-BR')+'%</td><td class="n">'+x.empenhos+'</td></tr>').join('')+
      '</tbody></table></div><small class="fe-muted">Já com as fontes propostas pela cobertura das contas. Salário-família e maternidade ficam de fora: são OP extraorçamentária.</small></div>';
    const usoSaldo=rateio.uso.length?'<details class="fe-sub" open><summary><strong>Cobertura das contas</strong> · saldo informado na etapa 3, comparado com o bruto de cada empenho</summary>'+previsao+
        '<div class="fe-scroll"><table style="margin:8px 0"><thead><tr><th>Conta</th><th>Fonte</th><th>Paga</th><th class="n">Saldo</th><th class="n">Usado pela folha</th><th class="n">Sobra</th><th>Empenhos</th></tr></thead><tbody>'+
        rateio.uso.map(u=>'<tr><td>'+esc(u.nome||'')+'</td><td>'+esc(u.fonte)+'</td><td>'+esc(tipoRegra[u.regra])+'</td><td class="n">'+somenteValor(u.saldo)+'</td>'+
          '<td class="n">'+somenteValor(u.usado)+'</td><td class="n'+(u.sobra<0?' ruim':'')+'">'+somenteValor(u.sobra)+'</td><td>'+(u.empenhos.join(', ')||'—')+'</td></tr>').join('')+
        '</tbody></table></div>'+
      (rateio.mudancas?'<p>'+rateio.mudancas+' empenho(s) mudam de fonte pela cobertura (em azul na coluna Fonte). <button type="button" class="btn" id="fe-aplicar-saldo">Usar as fontes pelo saldo</button></p>':'<p class="fe-muted">As fontes já estão de acordo com a cobertura das contas.</p>')+
      (rateio.sugestoes.length?'<div class="fe-alert"><strong>Sugestões para pedir ao RH</strong> — nestas lotações a conta pode pagar só parte dos servidores, então o empenho inteiro foi para o recurso próprio. Separando esses servidores numa lotação própria, <em>da mesma modalidade</em>, o valor abaixo sairia da conta e não do recurso próprio:<ul>'+
        rateio.sugestoes.map(x=>'<li>Empenho <strong>'+x.empenho+'</strong> · '+esc(x.secretaria)+(x.vinculo?' · '+esc(x.vinculo):'')+' (lotação '+esc(x.lotacao)+'): '+
          x.servidores.map(v=>esc(v.nome)+' ('+somenteValor(v.bruto)+')').join(', ')+' → <strong>'+dinheiroFolha(x.valor)+'</strong> na conta '+esc(x.contaNome)+' ('+esc(x.fonte)+')'+
          (x.cabe?'':' <em>— a conta não tem saldo para tudo este mês</em>')+'; ficariam '+x.outros+' servidor(es) na lotação atual.</li>').join('')+'</ul></div>':'')+
      (rateio.conferencia.length?'<p class="fe-alert">Confira os nomes do "pode pagar": '+rateio.conferencia.map(c=>esc(c.nome)+' ('+esc(c.conta)+') '+
        (c.achados.length?'aparece em '+c.achados.length+' servidores: '+c.achados.slice(0,4).map(esc).join(', ')+' — escreva o nome completo':'não foi encontrado na folha')).join(' · ')+'</p>':'')+
      rateio.avisos.map(a=>'<p class="fe-alert">'+esc(a)+'</p>').join('')+'</details>'
      :'<p class="fe-muted">Para o sistema dizer quais empenhos cabem no recurso estadual/federal, informe na etapa 3 o saldo de cada conta, a fonte e o que ela pode pagar. O que não couber vai para o recurso próprio.</p>';
    alvo.innerHTML='<div class="fe-actions" style="justify-content:space-between"><h2 style="margin:0">Lançamento · uma linha por empenho</h2>'+
      '<span><button type="button" class="btn" id="fe-lanc-assistente" style="background:#16a34a;border-color:#16a34a;font-size:1.05rem">▶ Iniciar preenchimento</button> '+
        '<button type="button" class="btn" id="fe-lanc-planilha">Lançar na planilha Google</button> '+
        '<button type="button" class="btn btn-sec" id="fe-lanc-colar">Copiar para colar na planilha</button> '+
        '<button type="button" class="btn btn-sec" id="fe-lanc-csv">Baixar tabela (Excel)</button></span></div>'+
      '<details class="fe-sub"><summary>Planilha Google da folha</summary>'+
        '<label class="campo"><span>Link da planilha (fica guardado neste navegador)</span><input id="fe-lanc-link" style="width:100%" placeholder="https://docs.google.com/spreadsheets/d/…" value="'+esc(linkPlanilha())+'"></label>'+
        '<p class="fe-muted">O SISDIFI escreve na aba do mês da competência (ex.: NOVEMBRO), a partir da linha '+PRIMEIRA_LINHA+', na ordem do lançamento: empenho, secretaria, e num grupo que abre e fecha no "+" a ficha, a fonte, o bruto e o histórico (aberto: feche depois de digitar o empenho e siga para a liquidação); depois o desconto, os itens do desconto (INSS, Caixa, Sicoob, Bradesco, Pensão, IR, Outros) num grupo fechado no "+", as OPs, o líquido, o resumo do RH e a conferência. A conta bancária fica só no SISDIFI. Na primeira vez em cada mês o SISDIFI arruma a aba sozinho. A aba precisa existir. Para colar com Ctrl+V, a aba já precisa estar nesse modelo. Não apaga nada abaixo das linhas lançadas. O Google pede para escolher a conta que edita a planilha.</p>'+
      '</details>'+
      '<p class="'+(r.naoBateram?'fe-danger':'fe-ok')+'" style="margin:10px 0"><strong>'+r.bateram+' de '+r.linhas.length+' empenhos bateram</strong> com o Resumo de Verbas'+
        (r.naoBateram?' · '+r.naoBateram+' não bateram (em vermelho)':'')+(r.incompletas?' · '+r.incompletas+' com ficha, fonte ou histórico faltando':'')+'.</p>'+
      '<p class="fe-muted">Conta de cada linha: bruto − desconto + OP − desconto da OP = total líquido do Resumo de Verbas. Clique num valor para copiar.</p>'+
      usoSaldo+
      '<div class="fe-scroll"><table><thead><tr><th>Empenho</th><th>Ficha</th><th>Fonte</th><th>Bruto</th><th>Histórico</th><th>Desconto</th>'+
        usadas.map(c=>'<th>'+esc(c.rotulo)+'</th>').join('')+(temOP?'<th>Ordem de pagamento</th>':'')+'<th>Líquido</th><th>Resumo RH</th><th>Conferência</th></tr></thead>'+
      '<tbody>'+corpo+rodape+'</tbody></table></div>';
    alvo.querySelectorAll('[data-cp]').forEach(x=>x.onclick=()=>{
      navigator.clipboard?.writeText(x.dataset.cp).then(()=>toast('Copiado: '+(x.dataset.cp.length>60?x.dataset.cp.slice(0,60)+'…':x.dataset.cp)),()=>toast('O navegador não deixou copiar.','erro'));
    });
    alvo.querySelectorAll('[data-op-lanc]').forEach(i=>i.onchange=()=>{
      const v=i.value.trim();
      if(v)numerosOP[i.dataset.opLanc]=v;else delete numerosOP[i.dataset.opLanc];
      persistir();render();
    });
    const aplicar=$('#fe-aplicar-saldo');
    if(aplicar)aplicar.onclick=()=>{
      for(const x of rateio.propostas)if(x.mudou)mapa[x.id]={...(mapa[x.id]||{}),ficha:x.ficha,fonte:x.fonte,...(x.conta?{contaId:x.conta}:{})};
      persistir();render();toast(rateio.mudancas+' empenho(s) com a fonte pelo saldo.');
    };
    const paraPlanilha=()=>linhasDaPlanilha(p.empenhos,r);
    $('#fe-lanc-link').onchange=e=>{try{localStorage.setItem('sisdifi-folha-planilha',e.target.value.trim());}catch(x){}};
    $('#fe-lanc-colar').onclick=async()=>{
      try{await navigator.clipboard.writeText(textoParaColar(paraPlanilha()));
        toast('Copiado. Na planilha, clique na célula A'+PRIMEIRA_LINHA+' da aba do mês e cole (Ctrl+V). A aba precisa ter as 7 colunas dos itens do desconto depois do H.');}
      catch(e){toast('O navegador não deixou copiar: '+(e.message||e),'erro');}
    };
    $('#fe-lanc-planilha').onclick=async e=>{
      const botao=e.currentTarget;
      const id=idDaPlanilha($('#fe-lanc-link').value);
      if(!id){$('#fe-lancamento details.fe-sub').open=true;toast('Cole o link da planilha Google da folha.','erro');return;}
      try{localStorage.setItem('sisdifi-folha-planilha',$('#fe-lanc-link').value.trim());}catch(x){}
      if(!primeiro){toast('Informe o número do primeiro empenho (etapa 2) antes de lançar.','erro');return;}
      if(r.naoBateram&&!confirm(r.naoBateram+' empenho(s) não bateram com o Resumo de Verbas. Lançar mesmo assim? Eles vão com "NÃO BATEU" na última coluna.'))return;
      botao.disabled=true;
      try{
        status('Pedindo permissão ao Google…');
        const {token,email}=await tokenGooglePlanilhas();
        const sit=await situacaoDaPlanilha(token,id,competencia);
        if(!sit.aba)throw Error('A planilha "'+sit.titulo+'" não tem a aba do mês '+competencia+'. Crie a aba (copie a do mês anterior) e tente de novo.');
        const linhas=paraPlanilha();
        if(sit.preenchidas&&!confirm('A aba '+sit.aba+' já tem '+sit.preenchidas+' empenho(s) preenchido(s). Substituir as linhas '+PRIMEIRA_LINHA+' a '+(PRIMEIRA_LINHA+linhas.length-1)+'?'))return;
        if(await prepararAba(token,id,sit))toast('Aba '+sit.aba+' preparada: itens do desconto depois do desconto da liquidação, no "+".');
        status('Lançando na aba '+sit.aba+'…');
        const res=await escreverNaPlanilha(token,id,sit.aba,linhas,sit.sheetId);
        status(res.linhas+' empenhos lançados em '+sit.titulo+' › '+sit.aba+' ('+res.faixa+'), com a conta '+email+'.');
        toast(res.linhas+' empenhos lançados na aba '+sit.aba+'.');
        if(sit.preenchidas>linhas.length)toast('A aba tinha '+sit.preenchidas+' linhas e foram lançadas '+linhas.length+': confira e apague as que sobraram.','erro');
      }catch(err){
        const cancelou=/popup-closed|cancelled-popup/.test(err.code||'');
        status(cancelou?'Lançamento cancelado.':'Não foi possível lançar na planilha: '+(err.message||err));
        if(!cancelou)toast('Não foi possível lançar na planilha: '+(err.message||err),'erro');
      }finally{botao.disabled=false;}
    };
    $('#fe-lanc-assistente').onclick=()=>abrirPreenchimento(p);
    alvo.querySelectorAll('[data-preencher]').forEach(b=>b.onclick=()=>abrirPreenchimento(p,Number(b.dataset.preencher)));
    // Mudança de outra pessoa chega aqui: o assistente aberto acompanha.
    if(assistente?.aberto())assistente.atualizar({empenhos:p.empenhos,extras:p.extras,
      estado:{competencia,dataLiquidacao,numerosOP,transcritos,preenchimento,fichasOP,escolhasHistorico,textosHistorico}});
    $('#fe-lanc-csv').onclick=()=>{
      const cab=['Empenho','Ficha','Fonte','Bruto','Histórico','Desconto',...COLUNAS_DESCONTO.map(c=>c.rotulo),
        'OP tipo','OP ficha','OP nº','OP valor','OP desconto','OP histórico','Resumo RH','Calculado','Diferença','Situação'];
      const linhas=[cab];
      for(const l of r.linhas){
        const base=[l.empenhoAno,l.ficha,l.fonte,somenteValor(l.bruto),l.historico,somenteValor(l.desconto),...COLUNAS_DESCONTO.map(c=>somenteValor(l.composicao[c.chave]))];
        const fim=[l.resumo==null?'':somenteValor(l.resumo),somenteValor(l.calculado),l.diferenca==null?'':somenteValor(l.diferenca),l.bateu?'bateu':'não bateu: '+l.diferencas.join(' ')];
        if(!l.ops.length)linhas.push([...base,'','','','','','',...fim]);
        l.ops.forEach((o,i)=>linhas.push([...(i?base.map(()=>''):base),o.tipo,o.ficha,o.numero,somenteValor(o.valor),somenteValor(o.desconto),o.historico,...(i?fim.map(()=>''):fim)]));
      }
      const a=document.createElement('a');
      a.href=URL.createObjectURL(new Blob([emitirTextoCSV(linhas)],{type:'text/csv;charset=utf-8'}));
      a.download='lancamento-folha-'+competencia+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    };
  }
  function render(){
    if(!ativa)return;
    const pacote=montar();
    const sit=situacaoGeral(pacote);
    renderArquivos();renderPessoas();renderNumeracao(pacote);
    const sitContas=renderContas(pacote);
    const tabela=$('#fe-tabela'),foco=document.activeElement;
    const campo=tabela.contains(foco)?foco.dataset:null;
    const {scrollLeft,scrollTop}=tabela;
    const detalhesAbertos=new Set([...tabela.querySelectorAll('[data-detalhes][open]')].map(d=>d.dataset.detalhes));
    renderFichas(pacote,sitContas);
    for(const d of tabela.querySelectorAll('[data-detalhes]'))d.open=detalhesAbertos.has(d.dataset.detalhes);
    tabela.scrollTo(scrollLeft,scrollTop);
    if(campo?.ref){
      const proximo=[...tabela.querySelectorAll('[data-ref]')].find(i=>i.dataset.ref===campo.ref&&i.dataset.campo===campo.campo);
      proximo?.focus({preventScroll:true});
    }
    $('#fe-confirmar-mapa').checked=aprovouMapa;
    renderConfirmar(pacote,sit);
    renderLancamento(pacote);
    renderPassos(sit,pacote);
    if(ultimaAlteracao)$('#fe-compartilhado').title='Última alteração: '+quem(ultimaAlteracao)+' · '+quando(ultimaAlteracao);
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
    const rubricasPensao=new Set(RUBRICAS_PENSAO);
    const {servidores}=varrerServidores(linhas,lotacoesDoResumo(arquivosLista()));
    const pensoes=servidores.flatMap(s=>{
      const rubricas=s.rubricas.filter(r=>rubricasPensao.has(r.codigo));
      return rubricas.length?[{...s,rubricas}]:[];
    });
    /* Quem está em cada lotação e o bruto de cada um: é o que a cobertura das
       contas precisa para saber se uma conta que paga servidores pelo nome
       pode pagar a lotação inteira. Só nome e bruto, por lotação. */
    const quadro=quadroDaFolha(servidores,codigosDeDesconto(arquivosLista()));
    fontesRH={...fontesRH,nominal:{nome,pensoes,quadro}};
    origemIndividual=nome;
    alertas=alertas.filter(x=>!/^Matrícula .*lotação .*sem rubrica 163/.test(x));
    alertas.push(...candidatos.avisos);
    return candidatos.achados.length;
  }
  el.querySelectorAll('[data-importar]').forEach(input=>input.onchange=async()=>{
    const f=input.files?.[0],tipo=input.dataset.importar,compAntes=competencia;
    if(!f)return;
    status('Lendo '+f.name+'…');input.disabled=true;
    try{
      const linhas=await lerPDF(f);
      if(tipo==='principal'||tipo==='automatico'){
        const analisado=analisarResumoConsolidado(linhas,{nome:f.name});
        if(!analisado.quantidade)throw Error(ehFolhaNominal(linhas)?'Este PDF é a Folha de pagamento (nominal), não o Resumo de Verbas. O nome do arquivo do RH pode estar trocado: envie-o no campo "Folha de pagamento".':
          'Nenhum Resumo de Verbas legível neste PDF. A folha nominal isolada não traz os totais por lotação; envie o Resumo de Verbas.');
        const comp=analisado.arquivos.find(a=>a.competencia)?.competencia;
        if(tipo==='automatico'){fontesRH={};pessoas=[];origemIndividual='';}
        conferirCompetencia(comp);
        if(tipo==='principal'&&!analisado.arquivos.some(a=>a.tipo==='principal'))
          throw Error('Este PDF não parece ser a folha mensal (o cabeçalho indica '+analisado.arquivos.map(a=>tipos[a.tipo]).join(', ')+'). Envie-o no campo correspondente.');
        const separou=analisado.arquivos.some(a=>a.tipo==='principal'&&a.registros.some(r=>r.adiantamentoSeparado));
        fontesRH={...fontesRH,mensal:{nome:f.name,arquivos:analisado.arquivos,...(separou?{simples:analisarResumoVerbas(linhas,{tipo:'principal',nome:f.name})}:{})}};
        if(tipo==='automatico'){delete fontesRH.decimo;delete fontesRH.rescisao;delete fontesRH.extra;}
        alertas=[...analisado.avisos];
        // A folha nominal pode vir no mesmo PDF.
        if(linhas.some(x=>/\b\d{5,8}\s*\/\s*\d+\s+.+/.test(x.texto||'')))lerMaternidades(linhas,f.name);
        status('Folha mensal lida: '+(arquivosAtuais().principal?.registros.length||0)+' lotações. Agora envie a Folha de pagamento e, se houver, o 13º e as rescisões.');
      }else if(tipo==='nominal'){
        if(ehResumo(linhas))throw Error('Este PDF é o Resumo de Verbas, não a Folha de pagamento. O nome do arquivo do RH pode estar trocado: envie-o no campo "Resumo de Verbas".');
        if(!arquivosAtuais().principal)throw Error('Envie primeiro o Resumo de Verbas da folha mensal.');
        const comp=competenciaNoResumo(linhas);
        if(comp&&comp!==competencia)throw Error('A folha nominal é de '+comp+'. Importe a folha da competência '+competencia+'.');
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
      await persistir();
      // A competência veio do PDF: passa a acompanhar a folha compartilhada desse mês.
      if(competencia!==compAntes)carregar();else render();
    }catch(e){toast('Falha em '+f.name+': '+(e.message||e),'erro');status('Arquivo não importado: '+e.message);}
    finally{input.disabled=false;input.value='';}
  });
  el.querySelectorAll('[data-remover-arquivo]').forEach(b=>b.onclick=e=>{
    e.preventDefault();
    const k=b.dataset.removerArquivo;
    if(!window.confirm('Retirar este arquivo da competência?'))return;
    if(k==='nominal'){
      pessoas=pessoas.filter(p=>p.origem==='Preenchimento manual');origemIndividual='';
      fontesRH={...fontesRH};delete fontesRH.nominal;
    }
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
    etapa=etapa===id?'':id;render();
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
  $('#fe-filtro').onchange=e=>{filtro=e.target.value;$('#fe-tabela').scrollTo(0,0);render();};
  $('#fe-visao').onchange=e=>{visao=e.target.value;$('#fe-tabela').scrollTo(0,0);render();};
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
      confirmacao={em,assinatura,por:estado.sessao?.nome||estado.sessao?.email||''};previstoFolha=previsto;
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
  return {titulo:'Folha de pagamentos',limpar:()=>{ativa=false;for(const parar of escutas)try{parar();}catch(e){}}};
}
