// Pré-auditoria do salário-maternidade por matrícula da folha nominal.
// Os valores da rubrica 163 (provento) e 201 (desconto) vêm em colunas
// diferentes; a leitura da folha fica em folha-servidores.js.
// A chave de conciliação é a lotação COMPLETA do último nível da hierarquia RH.
import {varrerServidores,somarRubricas,normalizar} from './folha-servidores.js';
export {lotacoesDoResumo} from './folha-servidores.js';
export function sugerirMaternidadesDaFolha(linhas,conhecidas=null){
  const {servidores,paginas}=varrerServidores(linhas,conhecidas);
  const achados=[],avisos=[];
  for(const p of servidores){
    const beneficio=somarRubricas(p,['163'],r=>/MATERNIDADE/.test(normalizar(r.descricao)));
    if(beneficio<=0)continue;
    // A rubrica 201 pode vir com "P" em vez de "D"; a coluna é que define desconto.
    const temInss=(p.rubricas||[]).some(r=>r.codigo==='201'&&/I\.?\s*N\.?\s*S\.?\s*S\.?/.test(normalizar(r.descricao)));
    const inss=temInss?somarRubricas(p,['201'],r=>/I\.?\s*N\.?\s*S\.?\s*S\.?/.test(normalizar(r.descricao))):null;
    const pessoa={matricula:p.matricula,nome:p.nome,lotacao:p.lotacao,pagina:p.pagina,beneficio,inss};
    if(p.lotacaoPendente)pessoa.lotacaoPendente=p.lotacaoPendente;
    if(!pessoa.nome||!pessoa.matricula||pessoa.inss==null||!pessoa.lotacao)
      avisos.push('Matrícula '+(pessoa.matricula||'?')+' (página '+pessoa.pagina+'): código de lotação completo não encontrado'+
        (pessoa.lotacaoPendente?' (somente prefixo '+pessoa.lotacaoPendente+')':'')+
        '. Não atribuir automaticamente a outra lotação.');
    achados.push({...pessoa,confirmado:false,origem:'Folha individual — PDF'});
  }
  if(!achados.length)avisos.push('Nenhuma rubrica 163 de salário-maternidade reconhecida na folha nominal. Confira o período e as páginas do PDF.');
  return {achados,avisos,paginas};
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
