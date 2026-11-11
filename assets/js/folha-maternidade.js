// Busca conservadora de salário-maternidade (rubrica 163) e INSS individual (201).
// PDF principal pode ter layout diferente: só oferece candidatos quando matrícula,
// rubrica e valor pertencem ao mesmo bloco de servidor. A confirmação é sempre humana.
import {centavosFolha} from './folha-empenhos.js';
const matricula=/^(\d{4,8})\s*\/\s*\d+\s+(.+)$/;
const verba=/^\s*(\d{2,4})\s+([PD])\s+(.+?)\s+(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})\s*$/i;
const lotacao=/^\s*(\d{3}(?:\.\d+){2,})\s*-\s*(.+)$/;
export function sugerirMaternidadesDaFolha(linhas){
  const achados=[],avisos=[];let atual=null,lot='',cabecalho=false,ultimaPagina=1;
  const fechar=()=>{
    if(!atual)return;
    if(atual.beneficio){
      if(!atual.nome || !atual.matricula || atual.inss==null)
        avisos.push('Matrícula '+(atual.matricula||'?')+' na página '+atual.pagina+': dados incompletos para conferência.');
      achados.push({...atual,confirmado:false,origem:'PDF individual'});
    }
    atual=null;
  };
  for(const o of linhas){
    const s=String(typeof o==='string'?o:o.texto).trim(),pagina=typeof o==='string'?1:o.pagina;
    if(!s)continue;ultimaPagina=pagina;
    if(/^LOTA[CÇ][AÃ]O\s*:/i.test(s)){
      fechar();lot='';cabecalho=true;continue;
    }
    if(cabecalho){const m=s.match(lotacao);if(m){lot=m[1];continue;}}
    const ini=s.match(matricula);
    if(ini){
      fechar();cabecalho=false;
      const a=ini[2].match(/^(.+?)\s*(?:\d\w*|[IVX]{1,4})?\s*\/\s*\d{1,4}\s*-\s+/);
      atual={matricula:ini[1],nome:(a?a[1]:ini[2].split(/\s{2,}/)[0]).trim(),
        lotacao:lot,pagina,beneficio:0,inss:null};
      continue;
    }
    if(!atual)continue;
    const v=s.match(verba);
    if(!v)continue;
    const cod=v[1],natureza=v[2].toUpperCase(),valor=centavosFolha(v[4]);
    if(cod==='163' && natureza==='P')atual.beneficio+=valor;
    if(cod==='201' && natureza==='D')atual.inss=(atual.inss||0)+valor;
  }
  fechar();
  if(!achados.length)avisos.push('Não foi possível identificar salário-maternidade individual automaticamente neste layout. Informe nome, matrícula, lotação, benefício e INSS e confira os contracheques.');
  return {achados,avisos,paginas:ultimaPagina};
}
export function consolidarMaternidade(pessoas,principais){
  const avisos=[],mapa={};
  const grupos=principais.flatMap(a=>(a.registros||[])).filter(r=>r.tipo===undefined||r.tipo==='principal');
  const porLot=new Map(grupos.filter(r=>(r.valores?.maternidade||0)>0).map(r=>[r.lotacao,r]));
  for(const [lot,r] of porLot){
    const todos=pessoas.filter(p=>p.lotacao===lot && p.confirmado);
    const bruto=todos.reduce((s,p)=>s+p.beneficio,0),inssExtra=todos.reduce((s,p)=>s+p.inss,0);
    const duplicidade=new Set(),erros=[];
    for(const p of todos){
      if(!p.nome||!p.matricula||p.inss==null)erros.push('Identificação ou INSS individual incompleto');
      if(!Number.isSafeInteger(p.beneficio)||p.beneficio<=0||!Number.isSafeInteger(p.inss)||p.inss<0)erros.push('Benefício/INSS individual inválido');
      if(duplicidade.has(p.matricula))erros.push('Matrícula repetida '+p.matricula);
      duplicidade.add(p.matricula);
    }
    if(bruto!==r.valores.maternidade)erros.push('Somatório do salário-maternidade ('+bruto+') difere do Resumo de Verbas ('+r.valores.maternidade+')');
    if(inssExtra>(r.inss||0))erros.push('INSS individual das servidoras excede o INSS da lotação');
    if(erros.length)avisos.push('Lotação '+lot+': '+erros.join('; '));
    mapa['principal|'+lot]={confirmado:!!todos.length&&!erros.length,inssExtra:!!todos.length&&!erros.length?inssExtra:0,servidoras:todos};
  }
  for(const p of pessoas){
    if(!porLot.has(p.lotacao))avisos.push('Matrícula '+p.matricula+': lotação sem rubrica 163 no Resumo de Verbas principal.');
  }
  return {ajustes:mapa,avisos,grupos:porLot.size};
}
