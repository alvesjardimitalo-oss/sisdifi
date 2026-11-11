import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  analisarResumoVerbas,prepararEmpenhos,conferirConsignadosFolha,
  centavosFolha,dinheiroFolha,competenciaNoResumo
} from '../assets/js/folha-empenhos.js';
import {sugerirMaternidadesDaFolha,consolidarMaternidade} from '../assets/js/folha-maternidade.js';
import {gerarPlanilhaFolha} from '../assets/js/folha-empenhos-xlsx.js';
assert.equal(centavosFolha('3.089,44'),308944);
assert.equal(centavosFolha('-2.803,46'),-280346);
assert.throws(()=>centavosFolha('25,123'));
assert.match(dinheiroFolha(25000),/250,00/);
const linhas=[
'UF: MINAS GERAIS MUNICÍPIO: FREI INOCENCIO RESUMO DE VERBAS FOLHA: 1',
'TIPO CÁLCULO: 01-FOLHA MENSAL',
'ENTIDADE: PREFEITURA MUNICIPAL REFERENCIA: SETEMBRO/2026',
'LOTAÇÃO...: 002.002.204.00002',
'PREF. MUNIC. DE FREI INOCENCIO',
'SECRETARIA MUNIC. DE ADMINISTRACAO',
'MANUT. SECRET.DE ADMINISTRACAO',
'PESSOAL EFETIVO',
'CLASSIFICAÇÃO CONTÁBIL: 0 - FIXA',
'100 VENCIMENTO MENSAL 9.062,74',
'CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS',
'164 SALARIO FAMILIA 135,08',
'CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS',
'201 I.N.S.S. 744,11',
'221 EMPRÉSTIMO CAIXA 784,91',
'222 EMPRÉSTIMO CAIXA 2 110,00',
'223 EMPRÉSTIMO CAIXA 3 73,99',
'292 EMPRESTIMO CAIXA 4 41,09',
'TOTAL BRUTO DE PROVENTOS...........: 9.197,82',
'TOTAL BRUTO DE DESCONTOS...........: 1.754,10',
'TOTAL LÍQUIDO......................: 7.443,72',
'TOTAL GERAL DE PROVENTOS...........: 9.062,74',
'VALOR BRUTO DO EMPENHO.............: 9.062,74',
'VALOR DO DESCONTO NA LIQUIDAÇÃO....: 1.754,10',
'VALOR LIQUIDO DO EMPENHO...........: 7.308,64',
'SALARIO FAMILIA....................: 135,08',
'LOTAÇÃO...: 002.004.215.00001',
'PREF. MUNIC. DE FREI INOCENCIO',
'SECRETARIA MUNIC. DE EDUCACAO',
'FUNDEB 70%',
'PESSOAL EFETIVO',
'CLASSIFICAÇÃO CONTÁBIL: 0 - FIXA',
'100 VENCIMENTO MENSAL 10.000,00',
'CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS',
'163 SALARIO MATERNIDADE INSS 3.089,44',
'CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS',
'201 I.N.S.S. 1.000,00',
'226 EMPRÉSTIMO SICOOB 800,00',
'VALOR BRUTO DO EMPENHO.............: 10.000,00',
'VALOR DO DESCONTO NA LIQUIDAÇÃO....: 1.800,00',
'VALOR LIQUIDO DO EMPENHO...........: 8.200,00',
'SALARIO MATERNIDADE INSS...........: 3.089,44'
];
assert.equal(competenciaNoResumo(linhas),'2026-09');
const principal=analisarResumoVerbas(linhas,{tipo:'principal',nome:'resumo-principal.pdf'});
assert.equal(principal.registros.length,2);
assert.equal(principal.competencia,'2026-09');
assert.equal(principal.avisos.length,0,principal.avisos.join('\n'));
assert.equal(principal.registros[0].valores.bruto,906274);
assert.equal(principal.registros[0].valores.familia,13508);
assert.equal(principal.registros[0].bancos.Caixa,101999);
assert.equal(principal.registros[0].vinculo,'Efetivos');
assert.equal(principal.registros[1].valores.maternidade,308944);
assert.equal(principal.registros[1].bancos.Sicoob,80000);
const pessoa=sugerirMaternidadesDaFolha([
'LOTAÇÃO:',
'002.004.215.00001 - FUNDEB 70%',
'001234 / 1 ANA MARIA DA SILVA / 3 - PROFESSORA 10/02/2020 EFETIVA',
'163 P SALARIO MATERNIDADE INSS 3.089,44',
'201 D I.N.S.S. 250,00'
]);
assert.equal(pessoa.achados.length,1);
assert.equal(pessoa.achados[0].matricula,'001234');
assert.equal(pessoa.achados[0].inss,25000);
assert.equal(pessoa.achados[0].beneficio,308944);
const confirmados=[{...pessoa.achados[0],confirmado:true}];
const consolidado=consolidarMaternidade(confirmados,[principal]);
assert.deepEqual(consolidado.avisos,[]);
assert.equal(consolidado.ajustes['principal|002.004.215.00001'].inssExtra,25000);
const mapa={
 'principal|002.002.204.00002':{ficha:'56',fonte:'1500',conta:'26538-1'},
 'principal|002.004.215.00001':{ficha:'174',fonte:'1540',conta:'123860-4'}
};
const prev=prepararEmpenhos([principal],5000,mapa,consolidado.ajustes);
assert.equal(prev.empenhos.length,2);
assert.equal(prev.empenhos[0].empenho,5000);
assert.equal(prev.empenhos[1].empenho,5001);
assert.equal(prev.empenhos[0].descontoAjustado,175410);
assert.equal(prev.empenhos[1].descontoAjustado,155000);
assert.equal(prev.empenhos[1].liquido,845000);
assert.equal(prev.extras.length,2);
assert.equal(prev.extras.find(x=>x.tipo==='Salário-família').inss,0);
assert.equal(prev.extras.find(x=>x.tipo==='Salário-maternidade').inss,25000);
assert.equal(prev.extras.find(x=>x.tipo==='Salário-maternidade').liquido,283944);
assert.equal(prev.pendentes.length,0);
const sem=prepararEmpenhos([principal],5000,mapa,{});
assert.ok(sem.pendentes.some(r=>r.problemas.some(p=>/maternidade/.test(p))));
assert.equal(sem.empenhos[1].descontoAjustado,180000);

const decimo=analisarResumoVerbas([
'RESUMO DE VERBAS','REFERENCIA: SETEMBRO/2026',
'LOTAÇÃO...: 002.002.204.00002',
'PREF. MUNIC. DE FREI INOCENCIO','SECRETARIA MUNIC. DE ADMINISTRACAO','PESSOAL EFETIVO',
'CLASSIFICAÇÃO CONTÁBIL: 0 - FIXA',
'100 VENCIMENTO MENSAL 1.000,00',
'VALOR BRUTO DO EMPENHO.............: 1.000,00',
'VALOR DO DESCONTO NA LIQUIDAÇÃO....: 0,00',
'VALOR LIQUIDO DO EMPENHO...........: 1.000,00'
],{tipo:'decimo',nome:'13.pdf'});
const mapa2={...mapa,'decimo|002.002.204.00002':{ficha:'56',fonte:'1500',conta:'26538-1'}};
const tres=prepararEmpenhos([decimo,principal],5000,mapa2,consolidado.ajustes);
assert.deepEqual(tres.empenhos.map(x=>x.empenho),[5000,5001,5002]);
assert.equal(tres.empenhos[2].tipo,'decimo');
const minuta=[
{resultado:{registros:[{destino:'Caixa Econômica Federal',centavos:101999},{destino:'Sicoob',centavos:80000}]},nome:'minutas'}
];
const conc=conferirConsignadosFolha(prev.empenhos,minuta);
assert.equal(conc.find(x=>x.banco==='Caixa').diferenca,0);
assert.equal(conc.find(x=>x.banco==='Sicoob').diferenca,0);
const troca=conferirConsignadosFolha(prev.empenhos,[{resultado:{registros:[
 {destino:'Caixa Econômica Federal',centavos:101411},{destino:'Sicoob',centavos:80588}
]},nome:'trocadas'}]);
assert.equal(troca.find(x=>x.banco==='Caixa').diferenca,-588);
assert.equal(troca.find(x=>x.banco==='Sicoob').diferenca,588);
const xlsx=gerarPlanilhaFolha(prev,{competencia:'2026-09',status:'RASCUNHO',conciliacao:conc});
const file=new Uint8Array(await xlsx.arrayBuffer());
assert.deepEqual([...file.slice(0,4)],[0x50,0x4b,0x03,0x04]);
const texto=new TextDecoder().decode(file);
assert.match(texto,/sheet1.xml/);
assert.match(texto,/Empenhos/);
assert.match(texto,/Salário-maternidade/);
assert.match(texto,/<f>J3-K3<\/f>/);
const view=readFileSync(new URL('../assets/js/views/folha-empenhos.js',import.meta.url),'utf8');
assert.match(view,/pode\.contabil\(\)/);
assert.match(view,/data-importar="principal"/);
assert.match(view,/data-importar="nominal"/);
assert.match(view,/fe-final/);
assert.match(view,/conferirConsignadosFolha/);
console.log('Folha: resumo, INSS individual, família, matrícula, ordenação, consignações e XLSX: OK.');
