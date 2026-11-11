// Pré-auditoria por matrícula da folha nominal, sem presumir que o campo "tipo" P/D
// indique provento/desconto: nesses relatórios ele representa o status do processamento.
// Os valores da rubrica 163 (provento) e 201 (desconto) vêm em colunas diferentes.
// A chave de conciliação é a lotação COMPLETA do último nível da hierarquia RH.
import {centavosFolha} from './folha-empenhos.js';
const texto=o=>String(typeof o==='string'?o:o?.texto||'').trim();
const pagina=o=>typeof o==='string'?1:o?.pagina||1;
const dinheiro=/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/;
const matricula=/^(\d{4,8})\s*\/\s*\d+\s+(.+)$/;
// Exige a hierarquia completa (4 níveis ou mais); '002.004' é secretaria,
// não a lotação do empenho. Captura códigos mesmo com espaços dos PDFs.
const lotacaoCompleta=/\b(\d{3}(?:\s*\.\s*\d+){3,})\b/g;
const limparLotacao=v=>String(v||'').replace(/\s+/g,'');
function localizarLotacaoCompleta(linha){
  const achados=[...String(linha||'').matchAll(lotacaoCompleta)];
  return achados.sort((a,b)=>b[1].split('.').length-a[1].split('.').length)[0]?.[1]
    ? limparLotacao(achados[0][1]) : '';
}
const verba=/^(\d{2,4})\s+([A-Z])\s+(.+)$/i;
const normalizar=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
function extrairNome(s){
  // Entre matrícula e coluna NÍVEL / PADRÃO - FUNÇÃO ("1_20 / 0073").
  const m=s.match(/^(.+?)\s+\d+_\d+\s*\/\s*\d+\s*-\s+/);
  return (m?m[1]:s.replace(/\s+\d+_\d+\s*\/.*$/,'')).trim();
}
function valoresRubrica(l){
  const v=l.match(verba);
  if(!v)return null;
  const finais=v[3].match(/-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}/g)||[];
  if(!finais.length)return null;
  return {codigo:v[1],tipo:v[2],descricao:v[3],valor:centavosFolha(finais.at(-1))};
}
export function sugerirMaternidadesDaFolha(linhas){
  const achados=[],avisos=[];
  let pessoa=null,lotacaoAtual='',emCabecalho=false,ultimaPagina=1;
  let ultimoPrefixo='',ultimaPaginaLotacao=0;
  const fechar=()=>{
    if(!pessoa)return;
    if(pessoa.beneficio>0){
      if(!pessoa.nome||!pessoa.matricula||pessoa.inss==null||!pessoa.lotacao)
        avisos.push('Matrícula '+(pessoa.matricula||'?')+' (página '+pessoa.pagina+'): código de lotação completo não encontrado'+
          (pessoa.lotacaoPendente?' (somente prefixo '+pessoa.lotacaoPendente+')':'')+
          '. Não atribuir automaticamente a outra lotação.');
      achados.push({...pessoa,confirmado:false,origem:'Folha individual — PDF'});
    }
    pessoa=null;
  };
  for(const item of linhas){
    const s=texto(item);
    if(!s)continue;
    ultimaPagina=pagina(item);
    if(/^LOTA[CÇ][AÃ]O\s*:/i.test(s)){
      fechar();
      lotacaoAtual='';
      ultimoPrefixo='';
      emCabecalho=true;
      ultimaPaginaLotacao=pagina(item);
      const codigo=localizarLotacaoCompleta(s);
      if(codigo)lotacaoAtual=codigo;
      continue;
    }
    // Nos PDFs do RH há quatro níveis em linhas distintas: 002, 002.004,
    // 002.004.215, 002.004.215.00001. NÃO usar um nível parcial.
    // Não exigir hífen, pois o pdf.js pode separar descrição e código.
    if(emCabecalho){
      const codigo=localizarLotacaoCompleta(s);
      if(codigo){lotacaoAtual=codigo;ultimoPrefixo='';continue;}
      const parcial=s.match(/\b(\d{3}(?:\s*\.\s*\d+){1,2})\b/);
      if(parcial){
        ultimoPrefixo=limparLotacao(parcial[1]);
        continue;
      }
    }
    const cab=s.match(matricula);
    if(cab){
      fechar();emCabecalho=false;
      pessoa={matricula:cab[1],nome:extrairNome(cab[2]),lotacao:lotacaoAtual,
        pagina:pagina(item),beneficio:0,inss:null};
      if(!lotacaoAtual && ultimoPrefixo)pessoa.lotacaoPendente=ultimoPrefixo;
      continue;
    }
    if(!pessoa)continue;
    const v=valoresRubrica(s);
    if(!v)continue;
    const descricao=normalizar(v.descricao);
    if(v.codigo==='163' && /MATERNIDADE/.test(descricao))pessoa.beneficio+=v.valor;
    // A rubrica 201 pode ter "P" em vez de "D"; a coluna é que define desconto.
    if(v.codigo==='201' && /I\.?\s*N\.?\s*S\.?\s*S\.?/.test(descricao))pessoa.inss=(pessoa.inss||0)+v.valor;
  }
  fechar();
  if(!achados.length)avisos.push('Nenhuma rubrica 163 de salário-maternidade reconhecida na folha nominal. Confira o período e as páginas do PDF.');
  return {achados,avisos,paginas:ultimaPagina};
}
export function consolidarMaternidade(pessoas=[],resumos=[]){
  const avisos=[],ajustes={};
  // As lotações são chaves textuais completas. Nunca conciliar por prefixo de secretaria.
  const grupos=(resumos||[]).filter(Boolean).flatMap(a=>a.registros||[]);
  const porLot=new Map(grupos.filter(r=>(r.valores?.maternidade||0)>0).map(r=>[r.lotacao,r]));
  for(const [lot,r] of porLot){
    const todos=pessoas.filter(p=>p.lotacao===lot && p.confirmado);
    const bruto=todos.reduce((n,p)=>n+p.beneficio,0),inssExtra=todos.reduce((n,p)=>n+(p.inss||0),0);
    const matr=new Set(),erros=[];
    if(!todos.length)erros.push('Nenhuma servidora com benefício e INSS individual confirmados');
    for(const p of todos){
      if(!p.nome||!p.matricula||p.inss==null)erros.push('Matrícula, identificação ou INSS incompletos');
      if(!Number.isSafeInteger(p.beneficio)||p.beneficio<=0||!Number.isSafeInteger(p.inss)||p.inss<0)
        erros.push('Benefício ou INSS individual inválido');
      if(matr.has(p.matricula))erros.push('Matrícula repetida '+p.matricula);
      matr.add(p.matricula);
    }
    if(bruto!==r.valores.maternidade)
      erros.push('Salário-maternidade das servidoras não confere com o resumo da lotação');
    if(inssExtra>(r.inss||0))erros.push('INSS individual excede o total do INSS da lotação');
    if(erros.length)avisos.push('Lotação '+lot+': '+erros.join('; '));
    ajustes['principal|'+lot]={confirmado:erros.length===0,inssExtra:erros.length?0:inssExtra,servidoras:todos};
  }
  for(const p of pessoas)if(!porLot.has(p.lotacao))
    avisos.push('Matrícula '+(p.matricula||'?')+': lotação '+(p.lotacao||'não identificada')+' sem rubrica 163 correspondente no Resumo de Verbas.');
  return {ajustes,avisos,grupos:porLot.size};
}
