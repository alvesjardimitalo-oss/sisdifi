// SISDIFI | Prévia de empenhos da folha. Todas as contas são em centavos.
// Nenhuma informação é enviada a serviços externos. Ficha/fonte/conta nunca são presumidas.
// O PDF de RESUMO DE VERBAS contém valores por lotação, não os nomes das servidoras.
import {avisosPendentes} from './consignacoes-mensal.js';
export const MESES_FOLHA=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export const TIPOS_FOLHA=[{id:'principal',nome:'Folha principal'},{id:'decimo',nome:'Adiantamento de 50% do 13º'},{id:'rescisao',nome:'Rescisões contratuais'}];
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
const codBeneficio={familia:'164',maternidade:'163'};
const moeda=/(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})\s*$/;
const rubrica=/^\s*(\d{2,4})\s+(.+?)\s+(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})\s*$/;
const resumo=/^\s*(TOTAL BRUTO DE PROVENTOS|TOTAL BRUTO DE DESCONTOS|TOTAL L[IÍ]QUIDO|VALOR BRUTO DO EMPENHO|VALOR DO DESCONTO NA LIQUIDA[CÇ][ÃA]O|VALOR L[IÍ]QUIDO DO EMPENHO|SALARIO FAMILIA|SALARIO MATERNIDADE INSS|COMP FED\.PIS SAL ENFERMAGEM)\.{2,}\s*:\s*([-\d.,]+)\s*$/i;
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
  if(!['principal','decimo','rescisao'].includes(tipo))throw Error('Tipo de folha inválido.');
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
      'COMP FED.PIS SAL ENFERMAGEM':'enfermagem'
    };
    for(const [k,v] of Object.entries(grupo.resumos))if(map[k])grupo.valores[map[k]]=v;
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
    if(/LOTA[CÇ][ÃA]O\.{2,}\s*:\s*([\d.]+)/i.test(l)){
      fechar();
      grupo={lotacao:l.match(/LOTA[CÇ][ÃA]O\.{2,}\s*:\s*([\d.]+)/i)[1],caminho:[],resumos:{},paginaInicio:pagina,paginaFim:pagina,fonteArquivo:nome};
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
export function prepararEmpenhos(arquivos,primeiro,mapa={},ajustes={}){
  if(!Number.isSafeInteger(Number(primeiro))||Number(primeiro)<1||Number(primeiro)>999999999)
    throw Error('Informe o número inteiro do primeiro empenho.');
  const todas=arquivos.flatMap(a=>(a?.registros||[]).map(r=>({...r,tipo:a.tipo,competencia:a.competencia})));
  const destino=r=>mapa[r.tipo+'|'+r.lotacao]||mapa[r.lotacao]||{};
  const ordenadas=todas.sort((a,b)=>{
    const ia=['principal','decimo','rescisao'].indexOf(a.tipo),ib=['principal','decimo','rescisao'].indexOf(b.tipo);
    if(ia!==ib)return ia-ib;
    const sa=ORGAOS.indexOf(destino(a).secretaria||a.secretaria),sb=ORGAOS.indexOf(destino(b).secretaria||b.secretaria);
    if(sa!==sb)return (sa<0?999:sa)-(sb<0?999:sb);
    const va=VINCULOS.indexOf(destino(a).vinculo||a.vinculo),vb=VINCULOS.indexOf(destino(b).vinculo||b.vinculo);
    if(va!==vb)return (va<0?999:va)-(vb<0?999:vb);
    return a.paginaInicio-b.paginaInicio;
  });
  const empenhos=ordenadas.map((r,i)=>{
    const destino=mapa[r.tipo+'|'+r.lotacao]||mapa[r.lotacao]||{};
    const a=ajustes[r.tipo+'|'+r.lotacao]||{};
    const bruto=r.valores.bruto??null,desconto=r.valores.desconto??null;
    const maternidade=r.valores.maternidade||0,familia=r.valores.familia||0;
    // Somente INSS individual comprovado é transferido ao extraorçamentário.
    const inssExtra=a.confirmado?Number(a.inssExtra)||0:0;
    const problemas=[];
    if(!r.secretaria)problemas.push('Classificar secretaria');
    if(!destino.ficha||!destino.fonte||!destino.conta)problemas.push('Informar ficha, fonte e conta bancária');
    if(bruto==null||desconto==null)problemas.push('Total bruto/desconto ilegível');
    if(!r.classificacaoDescontosIdentificada||r.diferencaComposicao!==0)problemas.push('Composição dos descontos divergente do Resumo de Verbas');
    if(maternidade && !a.confirmado)problemas.push('Conferir servidoras do salário-maternidade e INSS individual');
    if(r.valores.enfermagem)problemas.push('Complementação federal da enfermagem fora do empenho principal: conferir classificação e lançamento próprio');
    if(!numeroSeguro(inssExtra)||inssExtra>r.inss||inssExtra>desconto)
      problemas.push('INSS do salário-maternidade inválido');
    const descontoAjustado=desconto!=null&&numeroSeguro(inssExtra)?desconto-inssExtra:null;
    const liquido=bruto!=null&&descontoAjustado!=null?bruto-descontoAjustado:null;
    if(r.tipo==='decimo' && descontoAjustado!==0)problemas.push('Adiantamento 13º com descontos: conferir documento');
    return {
      id:r.tipo+'|'+r.lotacao,empenho:Number(primeiro)+i,tipo:r.tipo,lotacao:r.lotacao,
      secretaria:destino.secretaria||r.secretaria,vinculo:destino.vinculo||r.vinculo,
      ficha:String(destino.ficha||''),fonte:String(destino.fonte||''),conta:String(destino.conta||''),
      bruto,descontoRH:desconto,descontoAjustado,liquido,maisInssExtra:inssExtra,
      familia,maternidade,beneficiosOutros:r.valores.enfermagem||0,
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
    return itens;
  });
  return {empenhos,extras,primeiro:Number(primeiro),ultimo:Number(primeiro)+empenhos.length-1,
    totalBruto:empenhos.reduce((s,r)=>s+(r.bruto||0),0),
    totalDescontoRH:empenhos.reduce((s,r)=>s+(r.descontoRH||0),0),
    totalDescontoAjustado:empenhos.reduce((s,r)=>s+(r.descontoAjustado||0),0),
    totalLiquido:empenhos.reduce((s,r)=>s+(r.liquido||0),0),
    pendentes:empenhos.filter(r=>r.problemas.length)};
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
