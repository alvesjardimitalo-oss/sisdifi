// Assistente de transcrição do empenho.
//
// A Contabilidade digita no sistema da Memory numa ordem fixa: número do
// empenho, ficha, fonte, valor bruto, histórico; abre a janela de liquidação e
// informa a data e o valor do desconto; detalha a distribuição do desconto
// (INSS, IR, consignados); lança as ordens de pagamento; e confere o que foi
// feito contra a folha.
//
// Este módulo devolve exatamente essa sequência, um empenho por vez, para a
// tela mostrar o campo que está sendo digitado. Conferir num quadro de várias
// abas não serve para digitar: serve para auditar depois.
import { CATEGORIAS_DESCONTOS, FICHAS_EXTRA_ORCAMENTARIAS, FICHAS_EXTRA_OP,
  dinheiroFolha } from './folha-empenhos.js';

const MESES=['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO',
 'AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

/* Modelos de histórico como a Contabilidade os escreve. O texto vai verbatim
   para o sistema — espaçamento e pontuação incluídos, porque é o que ela já
   usa. A única marca é {mes}; quem quiser o ano acrescenta {ano} no modelo. */
export const MODELOS_HISTORICO=[
 {chave:'prefeito',rotulo:'Subsídio do Prefeito',
  texto:'VALOR QUE SE EMPENHA REFERE-SE A PAGAMENTO  DE SUBSÍDIO DO PREFEITO NO MES DE {mes}.'},
 {chave:'vice',rotulo:'Subsídio do Vice-Prefeito',
  texto:'VALOR QUE SE EMPENHA REFERE-SE A PAGAMENTO  DE SUBSÍDIO DO VICE PREFEITO NO MES DE {mes}.'},
 {chave:'agentePolitico',rotulo:'Subsídio de agente político',
  texto:'VALOR QUE SE EMPENHA REFERE-SE A PAGAMENTO DE SUBSÍDIO DO AGENTE POLITICO NO MES DE {mes}.'},
 {chave:'comissionado',rotulo:'Pessoal comissionado',
  texto:'VALOR QUE SE EMPENHA REFERE-SE A PAGAMENTO DE SALARIO DE PESSOAL COMISSIONADO NO MES DE {mes}.'},
 {chave:'efetivo',rotulo:'Pessoal efetivo',
  texto:'VALOR QUE SE EMPENHA REFERE-SE A PAGAMENTO DE SALARIO DE PESSOAL EFETIVO NO MES DE {mes}.'},
 {chave:'contratado',rotulo:'Pessoal contratado',
  texto:'VALOR QUE SE EMPENHA REFERE-SE A PAGAMENTO DE SALARIO DE PESSOAL CONTRATADO NO MES DE {mes}.'},
 {chave:'decimo',rotulo:'Adiantamento de 50% do 13º',
  texto:'VALOR QUE SE EMPENHA REFERE-SE A ADIANTAMENTO DE 50% DE DÉCIMO TERCEIRO; NO MES DE {mes}.'},
 {chave:'aposentadoria',rotulo:'Aposentadorias',
  texto:'VALOR QUE SE EMPENHA REFERE-SE A PAGAMENTO DE APOSENTADORIAS NO MES DE {mes}.'},
 {chave:'rescisao',rotulo:'Rescisão contratual',
  texto:'VALOR QUE SE EMPENHA REFERE-SE A PAGAMENTO DE RESCISÃO CONTRATUAL NO MES DE {mes}.'},
 {chave:'pensao',rotulo:'Pensões',
  texto:'VALOR QUE SE EMPENHA REFERE-SE A PAGAMENTO DE PENSOES NO MES DE {mes}.'},
 {chave:'estagio',rotulo:'Estagiários',
  texto:'VALOR QUE SE EMPENHA REFERE-SE A PAGAMENTO DE ESTAGIARIOS NO MES DE {mes}.'},
 {chave:'conselhoTutelar',rotulo:'Conselheiros tutelares',
  texto:'VALOR QUE SE EMPENHA REFERE-SE A  PAGAMENTO DE CONSELHEIROS TUTELARES NO MES DE {mes}.'}
];

/* Histórico da ordem de pagamento: por padrão é o empenho a que ela pertence. */
export const MODELO_HISTORICO_OP='REFERENTE AO EMPENHO {empenho}/{ano}';
export const textoDoModelo=chave=>MODELOS_HISTORICO.find(m=>m.chave===chave)?.texto||'';

/* O vínculo vem do último nível da lotação, e o RH não o escreve de um jeito
   só: "PESSOAL EFETIVO", "EFETIVOS", "SERVIDOR EFETIVO" são o mesmo. O
   Prefeito é o caso que não se detecta — a lotação dele tem três níveis e o
   último é a ação, então o texto não diz "PREFEITO" em lugar nenhum. Aí quem
   diz é a Contabilidade, uma vez, e a escolha fica guardada pela lotação. */
const DETECTA=[
 [/VICE.?PREFEITO/,'vice'],
 [/\bPREFEITO\b/,'prefeito'],
 [/AGENTE\s+POL/,'agentePolitico'],
 [/COMISSION/,'comissionado'],
 [/APOSENT|INATIV/,'aposentadoria'],
 [/PENSO|PENSION|PENSAO/,'pensao'],
 [/CONSELHO\s+TUTELAR/,'conselhoTutelar'],
 [/EFETIV/,'efetivo'],
 [/CONTRATAD|PESSOAS CONTRATADAS/,'contratado']
];
/* Estágio não se reconhece pelo nome da lotação — a da Ação Social diz só
   "MANUTENCAO DA SEC. DE AÇAO SOCIAL". Quem denuncia é a rubrica: a lotação de
   estágio tem a 370 e mais nada. */
const RUBRICA_ESTAGIO='370';
const soEstagio=registro=>{
 const r=registro?.rubricas||[];
 return r.length>0&&r.every(x=>String(x.codigo)===RUBRICA_ESTAGIO);
};
const semAcento=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();

/**
 * Vínculo de um registro, pelo texto do último nível da lotação.
 * É a mesma detecção que decide o histórico e a ordem dos empenhos: uma só,
 * para as duas não divergirem. Devolve '' quando nada no dado revela o vínculo.
 */
/**
 * Modelo de histórico de um empenho.
 * O tipo do arquivo manda sobre o vínculo: no 13º e na rescisão o texto é o do
 * bloco, qualquer que seja o cargo. `escolhas` associa lotação ao modelo que a
 * Contabilidade fixou, e tem a última palavra.
 * Devolve '' quando não há como saber — aí a tela pede.
 */
export function vinculoDoRegistro(registro={}){
 if(soEstagio(registro))return 'estagio';
 const texto=semAcento((registro.caminho||[]).slice(-1)[0]||registro.vinculo||'');
 for(const [re,chave] of DETECTA)if(re.test(texto))return chave;
 /* Sobra o Prefeito. A lotação dele tem três níveis, então o último é a ação e
    não há vínculo escrito em lugar nenhum — mas ela está no Gabinete do
    Prefeito, e as outras lotações de lá dizem o vínculo. Os subsídios de agente
    político são todos de secretários de pasta, já reconhecidos acima. */
 if(/GABINETE DO PREFEITO/.test(semAcento(registro.secretaria)))return 'prefeito';
 return '';
}

export function modeloDoEmpenho(empenho={}, escolhas={}){
 const daMao=escolhas[empenho.lotacao];
 if(daMao)return daMao;
 // No 13º e na rescisão o texto é o do bloco, qualquer que seja o cargo.
 if(empenho.tipo==='decimo')return 'decimo';
 if(empenho.tipo==='rescisao')return 'rescisao';
 return vinculoDoRegistro(empenho);
}

/**
 * Preenche o modelo. As marcas são {mes}, {mes_numero}, {ano}, {vinculo},
 * {secretaria} e {lotacao}; o que não existir sai vazio, sem deixar a marca à
 * mostra no texto que vai para o sistema.
 *
 * O espaçamento do modelo é preservado — os textos da Contabilidade têm espaço
 * duplo em dois deles, e não cabe ao sistema "corrigir" o que ela escreve. A
 * limpeza de separador solto só roda quando alguma marca ficou vazia.
 */
export function montarHistorico(modelo, empenho={}, competencia=''){
 const [ano,mes]=String(competencia||'').split('-');
 const valores={
  empenho:empenho.empenho!=null?String(empenho.empenho):'',
  mes:MESES[Number(mes)-1]||'',
  mes_numero:mes||'',
  ano:ano||'',
  vinculo:String(empenho.vinculo||'').toUpperCase(),
  secretaria:String(empenho.secretaria||'').toUpperCase(),
  lotacao:empenho.lotacao||''
 };
 let vazia=false;
 let texto=String(modelo||'').replace(/\{(\w+)\}/g,(_,k)=>{
  // Marca desconhecida também abre buraco no texto: a limpeza vale para ela.
  if(!(k in valores)||!valores[k]){vazia=true;return '';}
  return valores[k];
 });
 if(!vazia)return texto.trim();
 let antes;
 do{ antes=texto; texto=texto.replace(/-\s*-/g,'-'); }while(texto!==antes);
 return texto.replace(/\s{2,}/g,' ')
  .replace(/\s*-\s*(?=[.,;:]|$)/g,'')
  .replace(/^\s*-\s*/,'')
  .replace(/\s+([.,;:])/g,'$1')
  .trim();
}

/** Rótulo de cada categoria de desconto, como aparece na distribuição. */
export const ROTULOS_DESCONTO={
 INSS:'INSS',IRRF:'Imposto de Renda',Caixa:'Caixa Econômica',Sicoob:'Sicoob',
 Bradesco:'Bradesco',Pensao:'Pensão alimentícia',Outros:'Outros descontos'
};

const passo=(grupo,rotulo,valor,extra={})=>({grupo,rotulo,valor,...extra});

/**
 * Sequência de digitação de um empenho, na ordem dos campos do sistema.
 *
 * `ops` são as ordens de pagamento daquele empenho; `opcoes` traz a data da
 * liquidação, o modelo do histórico, a competência, as fichas extra das OPs
 * (por tipo) e os números de OP já atribuídos.
 *
 * Cada passo tem grupo, rótulo e valor em texto. `copiavel` marca o que vai
 * para a área de transferência; `informar` marca o que a Contabilidade digita
 * no sistema e o SISDIFI não tem como saber.
 */
export function passosDoEmpenho(empenho={}, ops=[], opcoes={}){
 const {dataLiquidacao='',competencia='',fichasOP={},numerosOP={},
  escolhasHistorico={},textosHistorico={}}=opcoes;
 /* O histórico vem pronto: o modelo é escolhido pelo vínculo do empenho, e o
    texto editado pela Contabilidade tem precedência sobre o de fábrica. */
 const chaveModelo=modeloDoEmpenho(empenho,escolhasHistorico);
 const modeloTexto=chaveModelo?(textosHistorico[chaveModelo]||textoDoModelo(chaveModelo)):'';
 const desconto=empenho.descontoAjustado??empenho.descontoRH??0;
 const passos=[
  passo('Empenho','Número do empenho',String(empenho.empenho??''),{copiavel:true,destaque:true}),
  passo('Empenho','Ficha',String(empenho.ficha||''),{copiavel:true,faltando:!empenho.ficha}),
  passo('Empenho','Fonte de recursos',String(empenho.fonte||''),
   {copiavel:true,faltando:!empenho.fonte,
    nota:empenho.fonteHerdada?'escolhida em '+empenho.fonteDe+': confirmar neste mês':''}),
  passo('Empenho','Desdobramento',String(empenho.desdobramento||''),{copiavel:true}),
  passo('Empenho','Valor bruto',dinheiroFolha(empenho.bruto||0),{copiavel:true}),
  passo('Empenho','Histórico',modeloTexto?montarHistorico(modeloTexto,empenho,competencia):'',
   {copiavel:!!modeloTexto,informar:!modeloTexto,chaveModelo,
    nota:modeloTexto?'':'escolher o modelo deste vínculo (vale para os próximos meses)'}),
  passo('Liquidação','Data da liquidação',dataLiquidacao||'',{copiavel:!!dataLiquidacao,informar:!dataLiquidacao}),
  passo('Liquidação','Valor do desconto',dinheiroFolha(desconto),{copiavel:true})
 ];

 // Distribuição do desconto, só o que tem valor, cada um com a ficha extra.
 const comp=empenho.composicao||{};
 for(const cat of CATEGORIAS_DESCONTOS){
  const v=comp[cat]||0;
  if(!v)continue;
  const ficha=FICHAS_EXTRA_ORCAMENTARIAS[cat]||'';
  passos.push(passo('Distribuição do desconto',ROTULOS_DESCONTO[cat]||cat,dinheiroFolha(v),
   {copiavel:true,ficha,informar:!ficha,
    nota:ficha?'ficha extra '+ficha:'sem ficha extra cadastrada'}));
 }

 /* Ordens de pagamento. A ficha da OP é extra-orçamentária e fixa por tipo de
    benefício, mas o SISDIFI ainda não a tem: hoje ele repete a ficha
    orçamentária do empenho, o que não serve. Então ela é informada e guardada
    por tipo, como as outras fichas extra. */
 for(const op of ops||[]){
  // A ficha extra do benefício é fixa; o cadastro só serve para corrigi-la.
  const ficha=fichasOP[op.tipo]||FICHAS_EXTRA_OP[op.tipo]||op.ficha||'';
  passos.push(passo('Ordem de pagamento',op.tipo+' — ficha extra',ficha,
   {copiavel:!!ficha,informar:!ficha,
    nota:ficha?'':'informar a ficha extra de '+op.tipo+' (vale para os próximos meses)'}));
  passos.push(passo('Ordem de pagamento',op.tipo+' — valor bruto',dinheiroFolha(op.bruto||0),{copiavel:true}));
  if(op.inss)
   passos.push(passo('Ordem de pagamento',op.tipo+' — desconto (INSS)',dinheiroFolha(op.inss),{copiavel:true}));
  passos.push(passo('Ordem de pagamento',op.tipo+' — histórico',
   montarHistorico(textosHistorico.op||MODELO_HISTORICO_OP,empenho,competencia),{copiavel:true}));
  passos.push(passo('Ordem de pagamento',op.tipo+' — nº da OP',numerosOP[op.id]||'',
   {informar:!numerosOP[op.id],chaveOP:op.id,
    nota:'o número vem do sistema da Memory'}));
 }

 return passos;
}

/**
 * Conferência do empenho: o que foi digitado tem de fechar com a folha.
 *
 * O líquido da linha é o do empenho mais o das OPs — é o total que sai por
 * aquele empenho, e é assim que a planilha da Contabilidade soma.
 */
export function conferirEmpenho(empenho={}, ops=[]){
 const desconto=empenho.descontoAjustado??empenho.descontoRH??0;
 const bruto=empenho.bruto||0;
 const liquidoEmpenho=bruto-desconto;
 const opsBruto=(ops||[]).reduce((n,o)=>n+(o.bruto||0),0);
 const opsLiquido=(ops||[]).reduce((n,o)=>n+(o.liquido||0),0);
 const liquidoLinha=liquidoEmpenho+opsLiquido;
 const composicao=empenho.composicaoTotal??Object.values(empenho.composicao||{}).reduce((n,v)=>n+v,0);
 const daFolha=empenho.liquidoRH??null;
 const linhas=[
  {rotulo:'Bruto do empenho',valor:bruto},
  {rotulo:'Desconto na liquidação',valor:-desconto},
  {rotulo:'Líquido do empenho',valor:liquidoEmpenho,parcial:true}
 ];
 if(opsBruto)linhas.push({rotulo:'Ordens de pagamento (líquido)',valor:opsLiquido});
 linhas.push({rotulo:'Total que sai por este empenho',valor:liquidoLinha,total:true});

 const problemas=[];
 if(composicao!==desconto)
  problemas.push('A distribuição do desconto soma '+dinheiroFolha(composicao)+
   ' e o desconto na liquidação é '+dinheiroFolha(desconto)+'.');
 if(daFolha!=null&&liquidoLinha!==daFolha)
  problemas.push('O total deste empenho é '+dinheiroFolha(liquidoLinha)+
   ' e a folha traz '+dinheiroFolha(daFolha)+' nesta lotação.');
 /* "Não bateu" é conta que não fecha; "pendência" é campo a preencher. Juntar
    os dois faria a tela gritar diferença onde só falta escolher a fonte. */
 return {linhas,liquidoLinha,composicao,desconto,daFolha,
  bateu:!problemas.length,problemas,pendencias:[...(empenho.problemas||[])]};
}

/** Tipos de OP que ainda não têm ficha extra cadastrada. */
export function fichasOPpendentes(extras=[], fichasOP={}){
 const tipos=new Set((extras||[]).map(o=>o.tipo).filter(Boolean));
 return [...tipos].filter(t=>!fichasOP[t]&&!FICHAS_EXTRA_OP[t]).sort();
}
