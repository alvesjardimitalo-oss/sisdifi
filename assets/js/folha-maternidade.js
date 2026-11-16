// Pré-auditoria por matrícula da folha nominal, sem presumir que o campo "tipo" P/D
// indique provento/desconto: nesses relatórios ele representa o status do processamento.
// Os valores da rubrica 163 (provento) e 201 (desconto) vêm em colunas diferentes.
// A chave de conciliação é a lotação COMPLETA do último nível da hierarquia RH.
import {centavosFolha} from './folha-empenhos.js';
const texto=o=>String(typeof o==='string'?o:o?.texto||'').trim();
const pagina=o=>typeof o==='string'?1:o?.pagina||1;
const dinheiro=/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/;
const matricula=/^(\d{4,8})\s*\/\s*\d+\s+(.+)$/;
// A lotação do empenho tem 3 OU 4 níveis, e as duas formas são completas.
// Em '002.004.215.00001' o 3º nível é a ação e o 4º a categoria; em
// '002.016.002' a hierarquia pula a ação e o 3º nível já é a categoria
// ('PESSOAL EFETIVO'). Exigir quatro níveis fazia o relatório acusar
// "código completo não encontrado" em 10 das 93 lotações reais — e a
// servidora não entrava no empenho. '002' é órgão e '002.004' é secretaria:
// esses sim são prefixo. Então o piso é 3 níveis e vale o mais profundo que
// aparecer no cabeçalho antes do primeiro servidor.
const PISO_NIVEIS=3;
const codigoLotacao=/\b(\d{3}(?:\s*\.\s*\d+)+)\b/g;
const limparLotacao=v=>String(v||'').replace(/\s+/g,'');
const niveis=v=>limparLotacao(v).split('.').length;
/**
 * Código de lotação na linha.
 * Quem decide o que é lotação é o resumo de verbas, que lista as reais: quando
 * `conhecidas` é informado, só vale código que está lá. '002.004.215' é o nível
 * da ação da creche e seria recusado; '002.016.002' é lotação de verdade e passa.
 * Sem o resumo em mãos, vale o mais profundo da linha a partir do piso — o
 * cabeçalho da folha sempre desce até o último nível.
 */
function localizarLotacaoCompleta(linha,conhecidas=null){
  const achados=[...String(linha||'').matchAll(codigoLotacao)]
    .map(m=>limparLotacao(m[1]))
    .filter(c=>niveis(c)>=PISO_NIVEIS)
    .sort((a,b)=>niveis(b)-niveis(a));
  if(conhecidas&&conhecidas.size)return achados.find(c=>conhecidas.has(c))||'';
  return achados[0]||'';
}
/** Lotações reais, extraídas dos registros do resumo de verbas. */
export function lotacoesDoResumo(resumos=[]){
  return new Set((resumos||[]).filter(Boolean)
    .flatMap(a=>a.registros||[]).map(r=>limparLotacao(r.lotacao)).filter(Boolean));
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
export function sugerirMaternidadesDaFolha(linhas,conhecidas=null){
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
      const codigo=localizarLotacaoCompleta(s,conhecidas);
      if(codigo)lotacaoAtual=codigo;
      continue;
    }
    /* O cabeçalho traz um nível por linha: 002, 002.004, 002.004.215 e às
       vezes 002.004.215.00001. Vale o mais profundo; o que ficar abaixo do
       piso é prefixo (órgão, secretaria) e nunca é a lotação do empenho.
       Não exigir hífen, pois o pdf.js pode separar descrição e código. */
    if(emCabecalho){
      const codigo=localizarLotacaoCompleta(s,conhecidas);
      if(codigo){
        if(!lotacaoAtual||niveis(codigo)>niveis(lotacaoAtual)){lotacaoAtual=codigo;ultimoPrefixo='';}
        continue;
      }
      const parcial=s.match(codigoLotacao);
      if(parcial&&niveis(parcial[0])<PISO_NIVEIS){
        ultimoPrefixo=limparLotacao(parcial[0]);
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
