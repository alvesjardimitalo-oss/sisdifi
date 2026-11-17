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
import { CATEGORIAS_DESCONTOS, FICHAS_EXTRA_ORCAMENTARIAS, dinheiroFolha } from './folha-empenhos.js';

export const BLOCOS_HISTORICO={
 principal:'FOLHA DE PAGAMENTO',
 extra:'FOLHA EXTRA',
 decimo:'ADIANTAMENTO DE 50% DO 13º SALÁRIO',
 rescisao:'RESCISÃO CONTRATUAL'
};
const MESES=['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO',
 'AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
export const MODELO_HISTORICO_PADRAO=
 '{bloco} REFERENTE AO MÊS DE {mes} DE {ano} - {vinculo} - {secretaria}.';

/** Rótulo de cada categoria de desconto, com a ficha extra-orçamentária fixa. */
export const ROTULOS_DESCONTO={
 INSS:'INSS',IRRF:'Imposto de Renda',Caixa:'Caixa Econômica',Sicoob:'Sicoob',
 Bradesco:'Bradesco',Pensao:'Pensão alimentícia',Outros:'Outros descontos'
};

/**
 * Preenche o modelo do histórico. As marcas são {bloco}, {mes}, {mes_numero},
 * {ano}, {vinculo}, {secretaria} e {lotacao}; o que não existir sai vazio, sem
 * deixar a marca à mostra no texto que vai para o sistema.
 */
export function montarHistorico(modelo, empenho={}, competencia=''){
 const [ano,mes]=String(competencia||'').split('-');
 const valores={
  bloco:BLOCOS_HISTORICO[empenho.tipo]||'FOLHA DE PAGAMENTO',
  mes:MESES[Number(mes)-1]||'',
  mes_numero:mes||'',
  ano:ano||'',
  vinculo:String(empenho.vinculo||'').toUpperCase(),
  secretaria:String(empenho.secretaria||'').toUpperCase(),
  lotacao:empenho.lotacao||''
 };
 /* Campo vazio não pode deixar o separador à mostra: "FOLHA - - ." tem de
    virar "FOLHA.". Colapsa em laço porque três campos vazios seguidos deixam
    mais de um par de traços. */
 let texto=String(modelo||MODELO_HISTORICO_PADRAO)
  .replace(/\{(\w+)\}/g,(_,k)=>k in valores?valores[k]:'');
 let antes;
 do{ antes=texto; texto=texto.replace(/-\s*-/g,'-'); }while(texto!==antes);
 return texto.replace(/\s{2,}/g,' ')
  .replace(/\s*-\s*(?=[.,;:]|$)/g,'')
  .replace(/^\s*-\s*/,'')
  .replace(/\s+([.,;:])/g,'$1')
  .trim();
}

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
 const {dataLiquidacao='',modeloHistorico=MODELO_HISTORICO_PADRAO,competencia='',
  fichasOP={},numerosOP={}}=opcoes;
 const desconto=empenho.descontoAjustado??empenho.descontoRH??0;
 const passos=[
  passo('Empenho','Número do empenho',String(empenho.empenho??''),{copiavel:true,destaque:true}),
  passo('Empenho','Ficha',String(empenho.ficha||''),{copiavel:true,faltando:!empenho.ficha}),
  passo('Empenho','Fonte de recursos',String(empenho.fonte||''),{copiavel:true,faltando:!empenho.fonte}),
  passo('Empenho','Desdobramento',String(empenho.desdobramento||''),{copiavel:true}),
  passo('Empenho','Valor bruto',dinheiroFolha(empenho.bruto||0),{copiavel:true}),
  passo('Empenho','Histórico',montarHistorico(modeloHistorico,empenho,competencia),{copiavel:true}),
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
  const ficha=fichasOP[op.tipo]||'';
  passos.push(passo('Ordem de pagamento',op.tipo+' — ficha extra',ficha,
   {copiavel:!!ficha,informar:!ficha,
    nota:ficha?'':'informar a ficha extra de '+op.tipo+' (vale para os próximos meses)'}));
  passos.push(passo('Ordem de pagamento',op.tipo+' — valor bruto',dinheiroFolha(op.bruto||0),{copiavel:true}));
  if(op.inss)
   passos.push(passo('Ordem de pagamento',op.tipo+' — desconto (INSS)',dinheiroFolha(op.inss),{copiavel:true}));
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
 return [...tipos].filter(t=>!fichasOP[t]).sort();
}
