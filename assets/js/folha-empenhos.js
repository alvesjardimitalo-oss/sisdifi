// SISDIFI | Prévia de empenhos da folha. Todas as contas são em centavos.
// Nenhuma informação é enviada a serviços externos. Ficha/fonte/conta nunca são presumidas.
// O PDF de RESUMO DE VERBAS contém valores por lotação, não os nomes das servidoras.
import {avisosPendentes} from './consignacoes-mensal.js';
export const MESES_FOLHA=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export const TIPOS_FOLHA=[{id:'principal',nome:'Folha principal'},{id:'extra',nome:'Folha extra · incentivo enfermagem'},{id:'decimo',nome:'Adiantamento de 50% do 13º'},{id:'rescisao',nome:'Rescisões contratuais'}];
const norma=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const numeroSeguro=n=>Number.isSafeInteger(n)&&n>=0;
export const dinheiroFolha=c=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function centavosFolha(valor) {
  const s=String(valor??'').trim().replace(/^R\$\s*/,'');
  if(!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(s))throw Error('Valor monetário inválido: '+s);
  const n=Number(s.replace(/[.,]/g,''));
  if(!Number.isSafeInteger(n))throw Error('Valor monetário fora do limite.');
  return n;
}
export function competenciaNoResumo(linhas){
  const a=linhas.map(l=>typeof l==='string'?l:l.texto).join('\n'),m=a.match(/REFER[EÊ]NCIA\s*:\s*([A-ZÀ-ÚÇ]+)\s*\/\s*(20\d\d)/i);
  if(!m)return '';
  const i=MESES_FOLHA.findIndex(x=>norma(x)===norma(m[1]));
  return i<0?'':m[2]+'-'+String(i+1).padStart(2,'0');
}
const ORGAOS=[
  'GABINETE DO PREFEITO','ADMINISTRAÇÃO','CULTURA','FAZENDA','ESPORTE E LAZER',
  'TRANSPORTES','AGRICULTURA','OBRAS PUBLICAS','MEIO AMBIENTE','LIMPEZA URBANA',
  'SEC. EDUCAÇÃO','FUNDEB','FUNDO EDUCAÇÃO','FUNDO DE SAÚDE','SECRETARIA DE SAÚDE',
  'HOSPITAL MUNICIPAL','SEC. AÇÃO SOCIAL','FUNDO AÇÃO SOCIAL'
];
export function origemDaLotacao(nome=''){
  const t=norma(nome);
  if(/GABINETE|PREFEITO/.test(t))return ORGAOS[0];
  if(/ADMINISTRACAO/.test(t))return ORGAOS[1];
  if(/CULTURA/.test(t))return ORGAOS[2];
  if(/FAZENDA|FINANCAS|TRIBUT/.test(t))return ORGAOS[3];
  if(/ESPORTE|LAZER/.test(t))return ORGAOS[4];
  if(/TRANSPORTE/.test(t))return ORGAOS[5];
  if(/AGRICULTURA/.test(t))return ORGAOS[6];
  if(/OBRAS PUBLICAS|OBRAS/.test(t))return ORGAOS[7];
  if(/MEIO AMBIENTE/.test(t))return ORGAOS[8];
  if(/LIMPEZA URBANA/.test(t))return ORGAOS[9];
  if(/FUNDEB|(?:CRECHE|ENSINO (?:FUNDAMENTAL|INFANTIL)) (?:70|30)%/.test(t))return ORGAOS[11];
  if(/FUNDO.*EDUCACAO/.test(t))return ORGAOS[12];
  if(/EDUCACAO|ENSINO|ESCOLA/.test(t))return ORGAOS[10];
  if(/HOSPITAL/.test(t))return ORGAOS[15];
  if(/FUNDO.*SAUDE|FMS/.test(t))return ORGAOS[13];
  if(/SAUDE/.test(t))return ORGAOS[14];
  if(/FUNDO.*(SOCIAL|ASSISTENCIA)/.test(t))return ORGAOS[17];
  if(/ACAO SOCIAL|ASSISTENCIA SOCIAL/.test(t))return ORGAOS[16];
  return '';
}
export function vinculoDaLotacao(s=''){
  const t=norma(s);
  if(/COMISSIONAD|CARGO EM COMISS/.test(t))return 'Comissionados';
  if(/EFETIV|ESTATUTAR|CONCURSAD/.test(t))return 'Efetivos';
  if(/CONTRATAD|TEMPORAR/.test(t))return 'Contratados';
  if(/PREFEITO|VICE.PREFEITO|AGENTE POLITIC|SUBSIDIO/.test(t))return 'Agentes políticos';
  if(/APOSENTAD|PENSIONIST|PENSOES DO RPPS|INATIV/.test(t))return 'Inativos/pensionistas';
  if(/CONSELHO TUTELAR/.test(t))return 'Conselho tutelar';
  return 'Outros';
}
const VINCULOS=['Comissionados','Efetivos','Contratados','Agentes políticos','Inativos/pensionistas','Conselho tutelar','Outros'];
/* Extras do rodapé do resumo, por rubrica. O rodapé lista uma linha por tipo:
   são proventos que NÃO entram no "VALOR BRUTO DO EMPENHO", mas entram no
   "TOTAL BRUTO DE PROVENTOS". Conferido nas 93 lotações de outubro/2026. */
const codBeneficio={familia:'164',maternidade:'163',natalidade:'361',exFolha:'358',enfermagem:'344'};
/* Das extras, estas a Contabilidade SOMA ao empenho orçamentário; as demais
   (família, maternidade, natalidade) viram ordem de pagamento extra-orçamentária. */
const EXTRAS_NO_EMPENHO=['exFolha','enfermagem'];
const EXTRAS_EM_OP=['familia','maternidade','natalidade'];
export const EXTRAS_DO_RESUMO=[...EXTRAS_NO_EMPENHO,...EXTRAS_EM_OP];
export const somaExtras=(valores={},quais=EXTRAS_DO_RESUMO)=>quais.reduce((n,k)=>n+(valores[k]||0),0);
const ehIncentivoEnfermagem=descricao=>/COMP\s*FED\.?\s*PIS\s*SAL\s*ENFERMAGEM|INCENTIVO\s*(?:DO\s*)?(?:GOVERNO\s*)?FEDERAL|COMPLEMENTA[CÇ][AÃ]O\s*(?:DO\s*)?PISO\s*(?:DA\s*)?ENFERMAGEM|ASSISTENCIA\s*FINANCEIRA\s*COMPLEMENTAR.*ENFERMAGEM/.test(norma(descricao));
const moeda=/(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})\s*$/;
const rubrica=/^\s*(\d{2,4})\s+(.+?)\s+(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})\s*$/;
const resumo=/^\s*(TOTAL BRUTO DE PROVENTOS|TOTAL BRUTO DE DESCONTOS|TOTAL L[IÍ]QUIDO|VALOR BRUTO DO EMPENHO|VALOR DO DESCONTO NA LIQUIDA[CÇ][ÃA]O|VALOR L[IÍ]QUIDO DO EMPENHO|SALARIO FAMILIA|SALARIO MATERNIDADE INSS|COMP FED\.PIS SAL ENFERMAGEM|DIFEREN[CÇ]A SALARIO EX\.FOLHA|AUXILIO NATALIDADE)\.{2,}\s*:\s*([-\d.,]+)\s*$/i;
// Códigos e descrições de descontos identificados no Resumo de Verbas.
// As rubricas de provento (inclusive salário-família, maternidade e diárias)
// NUNCA são deduções apenas por aparecerem na classificação "2 - OUTRAS".
export const CATEGORIAS_DESCONTOS=['Caixa','Sicoob','Bradesco','Pensao','INSS','IRRF','Outros'];
export function categoriaRubricaDesconto(r) {
  const descricao=norma(r?.descricao||'');
  if(r.codigo==='201'||/^(I\.?N\.?S\.?S\.?|INSS)(?:\s|$)/.test(descricao))return 'INSS';
  if(r.codigo==='204'||/IMPOSTO DE RENDA|IRRF/.test(descricao))return 'IRRF';
  if(/EMPRESTIMO/.test(descricao)){
    if(/CAIXA|\bCEF\b/.test(descricao))return 'Caixa';
    if(/SICOOB/.test(descricao))return 'Sicoob';
    if(/BRADESCO/.test(descricao))return 'Bradesco';
  }
  if(/PENSAO JUDICIAL|PENSAO ALIMENT/.test(descricao))return 'Pensao';
  return 'Outros';
}
// Confere a soma do bloco de rubricas com o desconto total do RH.
// O RH pode incluir bloco de proventos após os descontos (ex.: diárias),
// então não é correto usar apenas o último "2 - OUTRAS" ou o código >= 200.
function selecionarBlocosDeDesconto(blocos,valorRH) {
  if(!Number.isSafeInteger(valorRH))return [];
  if(valorRH===0)return [];
  const candidatos=[];
  for(let i=0;i<blocos.length;i++){
    let soma=0;
    for(let j=i;j<blocos.length;j++){
      const faixa=blocos.slice(i,j+1).flatMap(b=>b.rubricas);
      soma+=blocos[j].rubricas.reduce((n,r)=>n+r.valor,0);
      if(soma!==valorRH)continue;
      const marcadores=faixa.filter(r=>{
        const d=norma(r.descricao);
        return r.codigo==='201'||r.codigo==='204'||/EMPRESTIMO|PENSAO|DESCONTO|INSS|IMPOSTO DE RENDA|IRRF/.test(d);
      }).length;
      if(marcadores)candidatos.push({faixa,marcadores,blocos:j-i+1,termino:j});
    }
  }
  candidatos.sort((a,b)=>b.marcadores-a.marcadores||a.blocos-b.blocos||b.termino-a.termino);
  return candidatos[0]?.faixa||[];
}
const possuiTipo=t=>/TIPO C[AÁ]LCULO|RESUMO DE VERBAS/i.test(t);
export function analisarResumoVerbas(linhas,{tipo='principal',nome=''}={}){
  if(!['principal','extra','decimo','rescisao'].includes(tipo))throw Error('Tipo de folha inválido.');
  const texto=linhas.map(l=>typeof l==='string'?l:l.texto).join('\n');
  if(!possuiTipo(texto))throw Error('O arquivo não parece ser um Resumo de Verbas do RH.');
  const comp=competenciaNoResumo(linhas),avisos=[],dados=[];
  let grupo=null,secao='',rubricas=[],blocos=[],blocoAtual=null,naHeader=false;
  const fechar=()=>{
    if(!grupo)return;
    grupo.rubricas=rubricas;
    grupo.valores={};
    const map={
      'VALOR BRUTO DO EMPENHO':'bruto','VALOR DO DESCONTO NA LIQUIDACAO':'desconto',
      'VALOR LIQUIDO DO EMPENHO':'liquido','TOTAL BRUTO DE PROVENTOS':'proventos',
      'TOTAL BRUTO DE DESCONTOS':'totalDescontos','TOTAL LIQUIDO':'totalLiquido',
      'SALARIO FAMILIA':'familia','SALARIO MATERNIDADE INSS':'maternidade',
      'COMP FED.PIS SAL ENFERMAGEM':'enfermagem',
      'DIFERENCA SALARIO EX.FOLHA':'exFolha','AUXILIO NATALIDADE':'natalidade',
      'INCENTIVO GOVERNO FEDERAL':'enfermagem',
      'INCENTIVO FEDERAL ENFERMAGEM':'enfermagem'
    };
    for(const [k,v] of Object.entries(grupo.resumos))if(map[k])grupo.valores[map[k]]=v;
    // A identificação do incentivo é feita por campo próprio ou rubrica (sem somar duas vezes).
    const encontrados=rubricas.filter(r=>ehIncentivoEnfermagem(r.descricao));
    grupo.rubricasEnfermagem=encontrados;
    const incentivoRubricas=encontrados.reduce((n,r)=>n+r.valor,0);
    if(grupo.valores.enfermagem==null && incentivoRubricas)grupo.valores.enfermagem=incentivoRubricas;
    if(grupo.valores.enfermagem!=null && incentivoRubricas && grupo.valores.enfermagem!==incentivoRubricas)
      avisos.push('Lotação '+grupo.lotacao+': incentivo federal do resumo difere da soma das rubricas. Verifique antes de empenhar.');
    for(const [campo,cod] of Object.entries(codBeneficio)){
      const informado=grupo.valores[campo];
      const calculado=rubricas.filter(r=>r.codigo===cod).reduce((s,r)=>s+r.valor,0);
      if(informado==null && calculado)grupo.valores[campo]=calculado;
      if(informado!=null&&calculado&&informado!==calculado)avisos.push('Lotação '+grupo.lotacao+': divergência na rubrica '+cod);
    }
    if(grupo.valores.bruto==null || grupo.valores.desconto==null || grupo.valores.liquido==null)
      avisos.push('Lotação '+grupo.lotacao+': faltou total bruto/desconto/líquido. Confira páginas de continuação.');
    else if(grupo.valores.bruto-grupo.valores.desconto!==grupo.valores.liquido)
      avisos.push('Lotação '+grupo.lotacao+': bruto menos desconto não corresponde ao líquido informado pelo RH.');
    /* Identidade do rodapé: o bruto do empenho mais as extras tem de dar o total
       bruto de proventos. Se não der, há extra no resumo que não reconhecemos —
       e ela sumiria do empenho sem ninguém notar, porque os outros totais fecham
       entre si. Vale nas 93 lotações de outubro/2026. */
    const extras=somaExtras(grupo.valores);
    grupo.extras=extras;
    grupo.extrasNoEmpenho=somaExtras(grupo.valores,EXTRAS_NO_EMPENHO);
    grupo.extrasEmOP=somaExtras(grupo.valores,EXTRAS_EM_OP);
    if(grupo.valores.proventos!=null&&grupo.valores.bruto!=null
      &&grupo.valores.proventos!==grupo.valores.bruto+extras)
      avisos.push('Lotação '+grupo.lotacao+': o total bruto de proventos ('+dinheiroFolha(grupo.valores.proventos)+
        ') não é o bruto do empenho mais as extras ('+dinheiroFolha(grupo.valores.bruto+extras)+
        '). Há lançamento no rodapé que o sistema não reconhece — confira antes de empenhar.');
    const subtotal=grupo.valores.desconto??grupo.valores.totalDescontos;
    const selecionadas=selecionarBlocosDeDesconto(blocos,subtotal);
    grupo.classificacaoDescontosIdentificada=subtotal===0||selecionadas.length>0;
    grupo.rubricasDesconto=selecionadas.map(r=>({...r,categoria:categoriaRubricaDesconto(r)}));
    grupo.composicao=Object.fromEntries(CATEGORIAS_DESCONTOS.map(k=>[k,0]));
    for(const r of grupo.rubricasDesconto)grupo.composicao[r.categoria]+=r.valor;
    grupo.composicaoTotal=Object.values(grupo.composicao).reduce((n,v)=>n+v,0);
    grupo.diferencaComposicao=subtotal==null?null:subtotal-grupo.composicaoTotal;
    if(subtotal!=null && grupo.diferencaComposicao!==0)
      avisos.push('Lotação '+grupo.lotacao+': soma das rubricas de desconto ('+
        dinheiroFolha(grupo.composicaoTotal)+') difere do total do RH ('+
        dinheiroFolha(subtotal)+'). Não liberar sem conferência.');
    grupo.inss=grupo.composicao.INSS;
    grupo.bancos={Caixa:grupo.composicao.Caixa,Sicoob:grupo.composicao.Sicoob,
      Bradesco:grupo.composicao.Bradesco,Pensao:grupo.composicao.Pensao};
    grupo.secretaria=origemDaLotacao(grupo.caminho.join(' '));
    grupo.vinculo=vinculoDaLotacao(grupo.caminho.at(-1)||'');
    if(!grupo.secretaria)avisos.push('Lotação '+grupo.lotacao+': secretaria não reconhecida; selecionar manualmente.');
    dados.push(grupo);grupo=null;rubricas=[];blocos=[];blocoAtual=null;secao='';
  };
  let primeiraPagina=1,ultimaPagina=1,linhasVistas=0;
  for(const item of linhas){
    const l=String(typeof item==='string'?item:item.texto).trim();
    const pagina=typeof item==='object'?item.pagina||1:1;
    if(!l)continue;linhasVistas++;
    if(/LOTA[CÇ][ÃA]O\s*\.*\s*:\s*(\d{3}(?:\.\d+){2,})/i.test(l)){
      fechar();
      grupo={lotacao:l.match(/LOTA[CÇ][ÃA]O\s*\.*\s*:\s*(\d{3}(?:\.\d+){2,})/i)[1],caminho:[],resumos:{},paginaInicio:pagina,paginaFim:pagina,fonteArquivo:nome};
      naHeader=true;primeiraPagina=pagina;
      continue;
    }
    if(!grupo)continue;
    grupo.paginaFim=pagina;ultimaPagina=pagina;
    if(/CLASSIFICA[CÇ][ÃA]O CONT[AÁ]BIL:/i.test(l)){secao=l;blocoAtual={secao,rubricas:[]};blocos.push(blocoAtual);naHeader=false;continue;}
    const v=l.match(resumo);
    if(v){grupo.resumos[norma(v[1])]=centavosFolha(v[2]);naHeader=false;continue;}
    const r=l.match(rubrica);
    if(r){const itemRubrica={codigo:r[1],descricao:r[2].trim(),valor:centavosFolha(r[3]),classe:secao,pagina};rubricas.push(itemRubrica);if(blocoAtual)blocoAtual.rubricas.push(itemRubrica);naHeader=false;continue;}
    if(naHeader && !/^(PREF\. MUNIC\.|PREFEITURA MUNICIPAL|UF:|MUNIC[IÍ]PIO:)/i.test(l)
      && !/^TOTAL\b/i.test(l) && !/^VERBA\b/.test(l) && !/^ENTIDADE\b/.test(l)){
      grupo.caminho.push(l);
    }
  }
  fechar();
  if(!dados.length)avisos.push('Nenhuma lotação reconhecida. Confira o PDF original.');
  // Alguns resumos trazem várias páginas de uma mesma lotação.
  const repetidas=new Set();for(const d of dados){if(repetidas.has(d.lotacao))avisos.push('Lotação '+d.lotacao+' repetida: verifique se há lançamentos distintos.');repetidas.add(d.lotacao);}
  return {tipo,competencia:comp,arquivo:nome,registros:dados,avisos,paginas:ultimaPagina,linhasVistas};
}
// Detecta o grupo pelo CABEÇALHO do RH, não pelo número da lotação.
// A mesma lotação pode existir na folha mensal, extra, 13º e rescisão.
export function tipoDeFolhaCabecalho(linha){
  const t=norma(linha);
  if(!/TIPO\s*(?:DE\s*)?CALCULO|TIPO\s*(?:DE\s*)?FOLHA|FOLHA\s*:|RESUMO\s*DE\s*VERBAS/.test(t))
    return '';
  // O RH usa o cabeçalho COMBINADO "01-FOLHA MENSAL/05-DÉCIMO"
  // em todas as páginas. NÃO classificar a folha inteira como 13º:
  // a verba 150 será desmembrada em um empenho de adiantamento separado.
  if(/01\s*[-–]\s*FOLHA MENSAL\s*\/\s*05\s*[-–]\s*DECIMO/.test(t))return 'principal';
  if(/RESCIS|RESCIND|TERMINO DE CONTRATO/.test(t))return 'rescisao';
  if(/13\s*[º°O]?\s*SALARIO|DECIMO\s*TERCEIRO|ADIANTAMENTO\s*(?:DE\s*)?(?:50\s*%|13)/.test(t))return 'decimo';
  if(/FOLHA\s*EXTRA|EXTRA\s*FOLHA|FOLHA\s*COMPLEMENTAR|03\s*[-–]\s*FOLHA\s*EXTRA/.test(t))return 'extra';
  if(/FOLHA\s*MENSAL|FOLHA\s*PRINCIPAL|01\s*[-–]\s*FOLHA/.test(t))return 'principal';
  return '';
}
export function separarAdiantamentoDecimo(registro,{cabecalho='',tipo='principal'}={}){
  const conjunto=/01\s*[-–]\s*FOLHA MENSAL\s*\/\s*05\s*[-–]\s*DECIMO/.test(norma(cabecalho));
  if(!conjunto||tipo!=='principal')return {principal:registro,decimo:null,avisos:[]};
  const rubricas=(registro.rubricas||[]).filter(r=>r.codigo==='150'&&/ADIANTAMENTO\s*13|DECIMO\s*TERCEIRO/.test(norma(r.descricao)));
  const soma=rubricas.reduce((v,r)=>v+r.valor,0);
  if(!soma)return {principal:registro,decimo:null,avisos:[]};
  const bruto=registro.valores?.bruto,desconto=registro.valores?.desconto,liquido=registro.valores?.liquido;
  if(!Number.isSafeInteger(bruto)||!Number.isSafeInteger(desconto)||!Number.isSafeInteger(liquido)||
     soma<=0||soma>bruto||bruto-desconto!==liquido){
    return {principal:registro,decimo:null,
      avisos:['Lotação '+registro.lotacao+': adiantamento de 13º detectado, porém os totais não permitem separar com segurança.']};
  }
  const v=bruto-soma;
  const mensal={...registro,valores:{...registro.valores,bruto:v,liquido:v-desconto},
    rubricas:(registro.rubricas||[]).filter(r=>!rubricas.includes(r)),
    adiantamentoSeparado:soma,origemMista:true};
  const categorias=Object.fromEntries(CATEGORIAS_DESCONTOS.map(k=>[k,0]));
  const decimo={...registro,tipo:'decimo',tipoIdentificado:true,
    valores:{bruto:soma,desconto:0,liquido:soma,familia:0,maternidade:0,enfermagem:0},
    rubricas,rubricasDesconto:[],composicao:categorias,composicaoTotal:0,diferencaComposicao:0,
    classificacaoDescontosIdentificada:true,inss:0,bancos:{Caixa:0,Sicoob:0,Bradesco:0,Pensao:0},
    adiantamentoOrigem:registro.lotacao,origemMista:true};
  return {principal:mensal,decimo,avisos:[]};
}

/* Campos do rodapé que são somas e, por isso, se descontam. */
const CAMPOS_SOMA=['bruto','desconto','liquido','proventos','totalDescontos','totalLiquido',...EXTRAS_DO_RESUMO];

/**
 * O resumo da folha MENSAL já inclui o 13º e a rescisão: os relatórios próprios
 * desses tipos (TIPO CÁLCULO 05 e 06) são o detalhamento do que está lá dentro,
 * não um acréscimo. Empenhar os três como vieram contaria o mesmo dinheiro duas
 * vezes. O certo é descontar do mensal, lotação por lotação, o que cada um levou
 * — e o que sobra é a folha do mês.
 *
 * Conferido em outubro/2026: mensal R$ 1.989.381,67 menos 13º R$ 41.574,46 menos
 * rescisão R$ 21.967,83 dá R$ 1.925.839,38, que é a soma das linhas de folha da
 * Contabilidade. As 13 lotações do 13º e as 8 da rescisão existem todas no mensal.
 */
export function descontarFolhasProprias(arquivos=[]){
  const lista=arquivos.filter(Boolean);
  const mensal=lista.find(a=>a.tipo==='principal');
  const proprios=lista.filter(a=>a!==mensal&&(a.tipo==='decimo'||a.tipo==='rescisao'));
  if(!mensal||!proprios.length)return {arquivos:lista,avisos:[],descontados:0};
  const avisos=[];
  const restantes=new Map(mensal.registros.map(r=>[r.lotacao,{...r,valores:{...r.valores},
    rubricasDesconto:(r.rubricasDesconto||[]).map(d=>({...d}))}]));
  let descontados=0;
  for(const a of proprios){
    for(const r of a.registros){
      const alvo=restantes.get(r.lotacao);
      if(!alvo){
        avisos.push('Lotação '+r.lotacao+' aparece no resumo de '+a.tipo+' mas não na folha mensal. '+
          'Confira se os dois arquivos são da mesma competência antes de empenhar.');
        continue;
      }
      for(const k of CAMPOS_SOMA){
        const v=r.valores?.[k];
        if(Number.isSafeInteger(v)&&v!==0)alvo.valores[k]=(alvo.valores[k]||0)-v;
      }
      /* As rubricas de desconto também saem, senão o consignado da rescisão
         entra duas vezes e o banco receberia em dobro. Em outubro a rescisão
         só tinha INSS, então o erro não aparecia nos bancos — mas apareceria
         na primeira rescisão com empréstimo. */
      for(const d of r.rubricasDesconto||[]){
        const i=(alvo.rubricasDesconto||[]).findIndex(x=>x.codigo===d.codigo);
        if(i<0){
          avisos.push('Rubrica '+d.codigo+' ('+(d.descricao||'')+') aparece no desconto da '+
            a.tipo+' da lotação '+r.lotacao+' mas não na folha mensal. Confira antes de pagar o consignado.');
          continue;
        }
        const atual=alvo.rubricasDesconto[i];
        alvo.rubricasDesconto[i]={...atual,valor:atual.valor-d.valor};
      }
      alvo.rubricasDesconto=(alvo.rubricasDesconto||[]).filter(d=>d.valor!==0);
      alvo.composicao=Object.fromEntries(CATEGORIAS_DESCONTOS.map(k=>[k,0]));
      for(const d of alvo.rubricasDesconto)alvo.composicao[d.categoria]+=d.valor;
      alvo.composicaoTotal=Object.values(alvo.composicao).reduce((n,v)=>n+v,0);
      alvo.inss=alvo.composicao.INSS;
      alvo.bancos={Caixa:alvo.composicao.Caixa,Sicoob:alvo.composicao.Sicoob,
        Bradesco:alvo.composicao.Bradesco,Pensao:alvo.composicao.Pensao};
      alvo.diferencaComposicao=alvo.valores.desconto==null?null:alvo.valores.desconto-alvo.composicaoTotal;
      descontados++;
    }
  }
  const sobra=[];
  for(const r of restantes.values()){
    const negativos=CAMPOS_SOMA.filter(k=>Number.isSafeInteger(r.valores[k])&&r.valores[k]<0);
    if(negativos.length){
      avisos.push('Lotação '+r.lotacao+': descontar o 13º e a rescisão deixou '+negativos.join(', ')+
        ' negativo. Confira se os arquivos são da mesma competência.');
    }
    // Lotação que era só 13º ou só rescisão não sobra folha nenhuma.
    if(!r.valores.bruto&&!r.valores.desconto){continue;}
    r.extras=somaExtras(r.valores);
    r.extrasNoEmpenho=somaExtras(r.valores,EXTRAS_NO_EMPENHO);
    r.extrasEmOP=somaExtras(r.valores,EXTRAS_EM_OP);
    sobra.push(r);
  }
  const novoMensal={...mensal,registros:sobra,avisos:[...(mensal.avisos||[]),...avisos]};
  return {arquivos:lista.map(a=>a===mensal?novoMensal:a),avisos,descontados};
}

export function analisarResumoConsolidado(linhas,{nome=''}={}){
  const grupos=[],alertas=[];let tipo='',inicio=[],grupo=null,ultimaPagina=0;
  const cabecalho=[];
  const lot=/LOTA[CÇ][AÃ]O\s*\.*\s*:\s*(\d{3}(?:\.\d+){2,})/i;
  const finalizar=()=>{
    if(!grupo)return;
    const tipoAtual=grupo.tipo;
    const itens=[...grupo.cabecalho,...grupo.linhas];
    const identificado=analisarResumoVerbas(itens,{tipo:tipoAtual||'principal',nome});
    if(!tipoAtual)alertas.push('Lotação '+grupo.lotacao+': tipo de folha não identificado no cabeçalho. Classifique antes da conferência.');
    if(identificado.registros.length){
      for(const r of identificado.registros){
        const referencia=grupo.cabecalho.map(x=>typeof x==='string'?x:x.texto).join(' ');
        const par=separarAdiantamentoDecimo(r,{cabecalho:referencia,tipo:tipoAtual});
        grupos.push({...par.principal,tipo:tipoAtual||'principal',tipoIdentificado:!!tipoAtual});
        if(par.decimo)grupos.push(par.decimo);
        alertas.push(...par.avisos);
      }
    }else alertas.push('Não foi possível ler os valores da lotação '+grupo.lotacao+' (página '+grupo.pagina+').');
    alertas.push(...identificado.avisos);
    grupo=null;
  };
  for(const item of linhas){
    const linha=String(typeof item==='string'?item:item.texto||'').trim();
    if(!linha)continue;
    const pag=typeof item==='string'?1:item.pagina||1;
    ultimaPagina=pag;
    const classe=tipoDeFolhaCabecalho(linha);
    if(classe){tipo=classe;cabecalho.push(item);}
    // Preserva referências e títulos repetidos de páginas do PDF consolidado.
    if(!grupo && (/RESUMO\s*DE\s*VERBAS|REFER[EÊ]NCIA\s*:|TIPO\s*C[AÁ]LCULO/i.test(linha)))
      cabecalho.push(item);
    const chave=linha.match(lot);
    if(chave){
      finalizar();
      grupo={tipo,lotacao:chave[1],pagina:pag,cabecalho:[...cabecalho],linhas:[]};
      cabecalho.length=0;
    }
    if(grupo)grupo.linhas.push(item);
  }
  finalizar();
  // Mesmo número de lotação é válido em tipos diferentes, mas dentro do mesmo
  // tipo será necessária desambiguação antes de sugerir numeração de empenho.
  const vistos=new Set();
  for(const r of grupos){
    const id=r.tipo+'|'+r.lotacao;
    if(vistos.has(id))alertas.push('Lotação '+r.lotacao+' repetida na folha '+r.tipo+': confira se é continuação, ou dois lançamentos distintos.');
    vistos.add(id);
  }
  const arquivos=TIPOS_FOLHA.map(t=>{
    const registros=grupos.filter(r=>r.tipo===t.id);
    return registros.length?{tipo:t.id,arquivo:nome,competencia:competenciaNoResumo(linhas),
      registros,avisos:alertas.filter(a=>a.includes('Lotação ')&&registros.some(r=>a.includes(r.lotacao)))||[]} : null;
  }).filter(Boolean);
  return {arquivos,avisos:[...new Set(alertas)],quantidade:grupos.length,paginas:ultimaPagina,
    tipos:Object.fromEntries(arquivos.map(a=>[a.tipo,a.registros.length]))};
}

export function prepararEmpenhos(arquivos,primeiro,mapa={},ajustes={}){
  if(!Number.isSafeInteger(Number(primeiro))||Number(primeiro)<1||Number(primeiro)>999999999)
    throw Error('Informe o número inteiro do primeiro empenho.');
  // A ordem de impressão do RH reproduz a sequência histórica do modelo
  // de junho: secretaria e vínculo são intercalados na origem; reordenar
  // alfabética/heuristicamente trocaria os empenhos de lotação.
  const todas=arquivos.flatMap(a=>(a?.registros||[]).map(r=>({...r,tipo:a.tipo,competencia:a.competencia})));
  const destino=r=>mapa[r.tipo+'|'+r.lotacao]||mapa[r.lotacao]||{};
  /* Blocos sempre nessa ordem; dentro de cada bloco vale a ordem em que os
     registros chegaram, e sort é estável. Antes isto reordenava por página do
     PDF, o que desfazia a ordem de digitação da Contabilidade — e a ordem é o
     que decide o número do empenho. Quem chama ordena (folha-ordem.js); sem
     ordenação, a ordem de chegada ainda é a do PDF, como antes. */
  const ordem=['principal','extra','decimo','rescisao'];
  const ordenadas=todas.sort((a,b)=>ordem.indexOf(a.tipo)-ordem.indexOf(b.tipo));
  const empenhos=ordenadas.map((r,i)=>{
    const destino=mapa[r.tipo+'|'+r.lotacao]||mapa[r.lotacao]||{};
    const a=ajustes[r.tipo+'|'+r.lotacao]||{};
    const brutoRH=r.valores.bruto??null,desconto=r.valores.desconto??null;
    const incentivo=r.valores.enfermagem||0;
    // Situação precisa ser confirmada: não presumir que o incentivo esteja fora do bruto.
    const decisao=destino.incentivoNoBruto;
    const incentivoPendente=r.tipo==='extra' && incentivo>0 && !['sim','nao'].includes(decisao);
    /* O bruto do empenho é o do RH mais as extras que a Contabilidade soma a ele:
       diferença de salário extra folha (358) e complementação do piso da
       enfermagem (344). As duas já foram pagas na extra folha do dia 10; a folha
       mensal traz o provento inteiro para apurar INSS e IR sobre a base cheia e
       devolve o que já saiu pela rubrica 174 negativa. */
    /* A folha "extra" tem tratamento proprio para o incentivo da enfermagem
       (a decisao abaixo), entao nela as extras nao sao somadas aqui. Nos demais
       tipos — mensal, 13o e rescisao — somam. */
    const extrasNoEmpenho=r.tipo==='extra'?0:(r.extrasNoEmpenho||0);
    const bruto=brutoRH==null?null:brutoRH+extrasNoEmpenho
      +(r.tipo==='extra' && incentivo>0 && decisao==='nao'?incentivo:0);
    const maternidade=r.valores.maternidade||0,familia=r.valores.familia||0;
    const natalidade=r.valores.natalidade||0;
    /* Extras que viram ordem de pagamento extra-orçamentária: não entram no
       empenho, e existem em qualquer tipo de folha — a rescisão de outubro/2026
       trouxe salário-família em três lotações. */
    const ops=maternidade+familia+natalidade;
    // Somente INSS individual comprovado é transferido ao extraorçamentário.
    const inssExtra=a.confirmado?Number(a.inssExtra)||0:0;
    const problemas=[];
    if(r.tipoIdentificado===false)problemas.push('Identificar o tipo de folha desta lotação');
    if(!r.secretaria)problemas.push('Classificar secretaria');
    /* Diz o que de fato falta. A ficha quase sempre vem sugerida e o que fica
       em aberto é a fonte, nas fichas que admitem mais de uma — pedir "ficha e
       fonte" ali manda conferir uma coisa que já está resolvida. */
    if(!destino.ficha&&!destino.fonte)problemas.push('Informar ficha e fonte de recursos');
    else if(!destino.ficha)problemas.push('Informar a ficha');
    else if(!destino.fonte)problemas.push('Escolher a fonte de recursos');
    if(bruto==null||desconto==null)problemas.push('Total bruto/desconto ilegível');
    if(!r.classificacaoDescontosIdentificada||r.diferencaComposicao!==0)problemas.push('Composição dos descontos divergente do Resumo de Verbas');
    if(maternidade && !a.confirmado)problemas.push('Conferir servidoras do salário-maternidade e INSS individual');
    if(incentivoPendente)problemas.push('Confirmar se incentivo federal já integra o bruto do RH');
    if(r.tipo==='extra' && (r.composicao?.INSS||0)>0)
      problemas.push('Folha extra contém desconto INSS; conferir competência e não transferir automaticamente');
    /* A complementação federal da enfermagem (344) é somada ao empenho
       orçamentário: foi paga na extra folha do dia 10 e a folha mensal a devolve
       pela rubrica 174 negativa. Como o destino está definido e conferido, deixou
       de ser pendência — travaria a liberação todo mês nas lotações da saúde. */
    if(!numeroSeguro(inssExtra)||inssExtra>r.inss||inssExtra>desconto)
      problemas.push('INSS do salário-maternidade inválido');
    const descontoAjustado=desconto!=null&&numeroSeguro(inssExtra)?desconto-inssExtra:null;
    /* O líquido do EMPENHO é só o orçamentário: as ordens de pagamento
       extra-orçamentárias saem em documento próprio e viram linhas em `extras`.
       A planilha da Contabilidade junta os dois na mesma linha; aqui ficam
       separados, que é como o dinheiro realmente sai. */
    const liquido=bruto!=null&&descontoAjustado!=null?bruto-descontoAjustado:null;
    /* Mas somados têm de reproduzir o TOTAL LÍQUIDO do resumo. O INSS da
       maternidade sai do desconto do empenho e volta como dedução da OP, então
       não muda a soma — só move dinheiro de um documento para o outro.
       Conferido nas 93 lotações de outubro/2026. */
    const liquidoRH=r.valores.totalLiquido??null;
    if(liquido!=null&&liquidoRH!=null&&liquido+ops-inssExtra!==liquidoRH)
      problemas.push('Empenho mais ordens de pagamento ('+dinheiroFolha(liquido+ops-inssExtra)+
        ') não fecha com o total líquido do resumo ('+dinheiroFolha(liquidoRH)+')');
    if(r.tipo==='decimo' && descontoAjustado!==0)problemas.push('Adiantamento 13º com descontos: conferir documento');
    return {
      id:r.tipo+'|'+r.lotacao,empenho:Number(primeiro)+i,tipo:r.tipo,lotacao:r.lotacao,
      secretaria:destino.secretaria||r.secretaria,vinculo:destino.vinculo||r.vinculo,
      ficha:String(destino.ficha||''),fonte:String(destino.fonte||''),conta:String(destino.conta||''),
      desdobramento:String(destino.desdobramento||''),
      // De onde veio a ficha, para a tela mostrar o que merece conferência.
      fichaSugerida:!!destino.sugerida,confiancaFicha:String(destino.confiancaFicha||''),
      motivoFicha:String(destino.motivoFicha||''),
      lotacaoOrcamentaria:String(destino.lotacaoOrcamentaria||''),origemFicha:String(destino.origemFicha||''),
      bruto,brutoRH,incentivo,enfermagemIncluidaNoBruto:decisao||'',
      descontoRH:desconto,descontoAjustado,liquido,maisInssExtra:inssExtra,
      familia,maternidade,natalidade,extrasNoEmpenho,liquidoRH,beneficiosOutros:r.valores.enfermagem||0,
      bancos:r.bancos,inssOriginal:r.inss,composicao:r.composicao,
      rubricasDesconto:r.rubricasDesconto,diferencaComposicao:r.diferencaComposicao,
      composicaoTotal:r.composicaoTotal,arquivo:r.fonteArquivo,pagina:r.paginaInicio,problemas
    };
  });
  const extras=empenhos.flatMap(r=>{
    const itens=[];
    if(r.familia)itens.push({id:r.id+'|familia',empenhoReferencia:r.empenho,tipo:'Salário-família',lotacao:r.lotacao,
      ficha:r.ficha,fonte:r.fonte,conta:r.conta,bruto:r.familia,inss:0,liquido:r.familia,problemas:[]});
    if(r.maternidade)itens.push({id:r.id+'|maternidade',empenhoReferencia:r.empenho,tipo:'Salário-maternidade',lotacao:r.lotacao,
      ficha:r.ficha,fonte:r.fonte,conta:r.conta,bruto:r.maternidade,inss:r.maisInssExtra,liquido:r.maternidade-r.maisInssExtra,
      problemas:r.problemas.filter(x=>/maternidade|INSS/.test(x))});
    if(r.natalidade)itens.push({id:r.id+'|natalidade',empenhoReferencia:r.empenho,tipo:'Auxílio-natalidade',lotacao:r.lotacao,
      ficha:r.ficha,fonte:r.fonte,conta:r.conta,bruto:r.natalidade,inss:0,liquido:r.natalidade,problemas:[]});
    return itens;
  });
  return {empenhos,extras,primeiro:Number(primeiro),ultimo:Number(primeiro)+empenhos.length-1,
    totalBruto:empenhos.reduce((s,r)=>s+(r.bruto||0),0),
    totalDescontoRH:empenhos.reduce((s,r)=>s+(r.descontoRH||0),0),
    totalDescontoAjustado:empenhos.reduce((s,r)=>s+(r.descontoAjustado||0),0),
    totalLiquido:empenhos.reduce((s,r)=>s+(r.liquido||0),0),
    /* Controle do fechamento: empenhos mais ordens de pagamento têm de dar o
       TOTAL LÍQUIDO que o RH somou no resumo. É o "valor bateu" da Contabilidade. */
    totalLiquidoExtras:extras.reduce((s,r)=>s+(r.liquido||0),0),
    totalLiquidoResumo:ordenadas.reduce((s,r)=>s+(r.valores?.totalLiquido||0),0),
    totalLiquidoRH:ordenadas.reduce((s,r)=>s+(Number.isSafeInteger(r.valores?.liquido)?r.valores.liquido:0),0),
    totalLiquidoBase:ordenadas.reduce((s,r)=>s+(
      Number.isSafeInteger(r.valores?.bruto)&&Number.isSafeInteger(r.valores?.desconto)
        ?r.valores.bruto-r.valores.desconto:0),0),
    diferencaTotalRH:ordenadas.reduce((s,r)=>s+(
      Number.isSafeInteger(r.valores?.bruto)&&Number.isSafeInteger(r.valores?.desconto)
        &&Number.isSafeInteger(r.valores?.liquido)
        ?r.valores.bruto-r.valores.desconto-r.valores.liquido:0),0),
    pendentes:empenhos.filter(r=>r.problemas.length)};
}
/* Lista de pagamento dos consignados: quanto vai para cada destino e de quais
   rubricas. A pensão é uma OP só, com uma liquidação por pensão e o
   beneficiário no histórico de cada uma — por isso sai detalhada, já que um
   total único de "Pensão" não diz quantas liquidações fazer. Quem é o servidor
   de cada liquidação vem da folha nominal, em folha-pensoes.js: o resumo de
   verbas só traz o total da rubrica por lotação. */
/* Fichas extra-orçamentárias fixas de Frei Inocêncio: são as mesmas todo mês,
   então ficam aqui em vez de serem digitadas. É por elas que a retenção sai do
   passivo quando o repasse é feito. */
export const FICHAS_EXTRA_ORCAMENTARIAS={
 INSS:'4',Pensao:'8',IRRF:'9',Caixa:'21',Sicoob:'41',Bradesco:'42'
};
/* Ordem da lista de repasse: primeiro os tributos, que têm prazo legal, depois
   a pensão e os bancos. */
const DESTINOS_PAGAMENTO=[
 {chave:'INSS',nome:'INSS',forma:'guia da previdência (GPS)'},
 {chave:'IRRF',nome:'Imposto de Renda retido',forma:'DARF'},
 {chave:'Pensao',nome:'Pensão alimentícia',
  forma:'uma OP, com uma liquidação por pensão',detalhar:true},
 {chave:'Caixa',nome:'Caixa Econômica Federal',forma:'guia do banco'},
 {chave:'Sicoob',nome:'Sicoob',forma:'guia do banco'},
 {chave:'Bradesco',nome:'Bradesco',forma:'guia do banco'}
].map(d=>({...d,fichaExtra:FICHAS_EXTRA_ORCAMENTARIAS[d.chave]||''}));
export function pagamentosConsignados(empenhos=[]){
 const lista=Array.isArray(empenhos)?empenhos:[];
 const porRubrica=new Map();
 for(const e of lista)for(const d of e.rubricasDesconto||[]){
   const k=d.categoria+'|'+d.codigo;
   const at=porRubrica.get(k)||{categoria:d.categoria,codigo:d.codigo,descricao:d.descricao||'',valor:0,empenhos:[]};
   at.valor+=d.valor;
   if(e.empenho!=null&&!at.empenhos.includes(e.empenho))at.empenhos.push(e.empenho);
   porRubrica.set(k,at);
 }
 const rubricas=[...porRubrica.values()].filter(r=>r.valor!==0);
 const destinos=DESTINOS_PAGAMENTO.map(d=>{
   const suas=rubricas.filter(r=>r.categoria===d.chave).sort((a,b)=>b.valor-a.valor);
   return {...d,valor:suas.reduce((n,r)=>n+r.valor,0),rubricas:suas};
 }).filter(d=>d.valor!==0);
 // O que não é banco nem pensão não se paga a terceiro: fica para a Contabilidade ver.
 const outros=rubricas.filter(r=>r.categoria==='Outros').sort((a,b)=>b.valor-a.valor);
 return {destinos,outros,total:destinos.reduce((n,d)=>n+d.valor,0)};
}
export function conferirConsignadosFolha(empenhos,arquivosMinuta){
  const calc={Caixa:0,Sicoob:0,Bradesco:0,Pensao:0};
  empenhos.forEach(r=>Object.entries(calc).forEach(([b])=>{calc[b]+=r.bancos[b]||0;}));
  const destinos={'Caixa Econômica Federal':'Caixa',Sicoob:'Sicoob',Bradesco:'Bradesco','Pensão alimentícia':'Pensao'};
  const minuta={Caixa:0,Sicoob:0,Bradesco:0,Pensao:0};let semBanco=0,avisos=[];
  for(const a of arquivosMinuta||[]){
    for(const r of a.resultado?.registros||[]){
      const b=destinos[r.destino];if(b)minuta[b]+=r.centavos;else semBanco++;
    }
    avisos.push(...avisosPendentes(a));
  }
  return Object.keys(calc).map(b=>({banco:b,esperado:calc[b],minuta:minuta[b],
    diferenca:minuta[b]-calc[b],conferido:!!arquivosMinuta?.length&&!avisos.length&&!semBanco&&minuta[b]===calc[b],
    indicativo:'Comparação TOTAL por banco; a vinculação de cada guia ao empenho exige conferência específica.'}));
}
export function emitirTextoCSV(linhas){
  const proteger=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
  return '\uFEFF'+linhas.map(l=>l.map(proteger).join(';')).join('\r\n');
}
