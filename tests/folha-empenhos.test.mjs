import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {
  analisarResumoVerbas,analisarResumoConsolidado,tipoDeFolhaCabecalho,prepararEmpenhos,conferirConsignadosFolha,
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
assert.equal(principal.registros[0].bancos.Caixa,100999);
assert.equal(principal.registros[0].composicao.INSS,74411);
assert.equal(principal.registros[0].composicao.Caixa,100999);
assert.equal(principal.registros[0].composicaoTotal,175410);
assert.equal(principal.registros[0].diferencaComposicao,0);
assert.ok(principal.registros[0].rubricasDesconto.every(x=>x.codigo!=='164'));
assert.equal(principal.registros[1].composicao.Sicoob,80000);
assert.equal(principal.registros[1].composicao.INSS,100000);
assert.ok(principal.registros[1].rubricasDesconto.every(x=>x.codigo!=='163'));
assert.equal(principal.registros[0].vinculo,'Efetivos');
assert.equal(principal.registros[1].valores.maternidade,308944);
assert.equal(principal.registros[1].bancos.Sicoob,80000);
// Bloco da classificação 2 - OUTRAS pode ser provento (salário-família),
// e pode existir uma classificação FIXA depois do bloco de descontos (diárias).
const rubricasTodas=analisarResumoVerbas([
  'RESUMO DE VERBAS','TIPO CÁLCULO: 01-FOLHA MENSAL','REFERENCIA: SETEMBRO/2026',
  'LOTAÇÃO...: 002.002.204.00002',
  'SECRETARIA MUNIC. DE ADMINISTRACAO','PESSOAL EFETIVO',
  'CLASSIFICAÇÃO CONTÁBIL: 0 - FIXA',
  '100 VENCIMENTO MENSAL 10.000,00',
  'CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS','164 SALARIO FAMILIA 100,00',
  'CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS',
  '201 I.N.S.S. 800,00','204 IMPOSTO DE RENDA 200,00',
  '221 EMPRÉSTIMO CAIXA 100,00','226 EMPRÉSTIMO SICOOB 300,00',
  '352 EMPRESTIMO BRADESCO 50,00','230 PENSAO JUDICIAL 75,00',
  '242 DESCONTO DE PAG. INDEVIDO 25,00',
  'CLASSIFICAÇÃO CONTÁBIL: 0 - FIXA','1600 DIÁRIA DE VIAGEM 60,00',
  'VALOR BRUTO DO EMPENHO.............: 10.000,00',
  'VALOR DO DESCONTO NA LIQUIDAÇÃO....: 1.550,00',
  'VALOR LIQUIDO DO EMPENHO...........: 8.450,00',
  'SALARIO FAMILIA....................: 100,00'
],{tipo:'principal',nome:'resumo-teste.pdf'});
assert.equal(rubricasTodas.avisos.length,0,rubricasTodas.avisos.join('\n'));
const composição=rubricasTodas.registros[0].composicao;
assert.deepEqual(composição,{Caixa:10000,Sicoob:30000,Bradesco:5000,Pensao:7500,INSS:80000,IRRF:20000,Outros:2500});
assert.equal(rubricasTodas.registros[0].composicaoTotal,155000);
assert.equal(rubricasTodas.registros[0].diferencaComposicao,0);
assert.ok(rubricasTodas.registros[0].rubricasDesconto.every(x=>!['164','1600'].includes(x.codigo)));
const incorreto=analisarResumoVerbas([
  'RESUMO DE VERBAS','REFERENCIA: SETEMBRO/2026','LOTAÇÃO...: 002.002.204.00002',
  'SECRETARIA MUNIC. DE ADMINISTRACAO','PESSOAL EFETIVO',
  'CLASSIFICAÇÃO CONTÁBIL: 0 - FIXA','100 VENCIMENTO MENSAL 10.000,00',
  'CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS','201 I.N.S.S. 800,00',
  'VALOR BRUTO DO EMPENHO.............: 10.000,00',
  'VALOR DO DESCONTO NA LIQUIDAÇÃO....: 799,99',
  'VALOR LIQUIDO DO EMPENHO...........: 9.200,01'
],{tipo:'principal',nome:'resumo-errado.pdf'});
assert.equal(incorreto.registros[0].classificacaoDescontosIdentificada,false);
assert.ok(incorreto.avisos.some(x=>x.includes('soma das rubricas')));
const bloqueado=prepararEmpenhos([incorreto],5000,{'principal|002.002.204.00002':{ficha:'1',fonte:'1500',conta:'1'}},{});
assert.ok(bloqueado.pendentes.some(x=>x.problemas.some(p=>p.includes('Composição'))));

// Folha extra do dia 10: incentivo da enfermagem pode vir fora do bruto do empenho.
// A soma depende de confirmação da Contabilidade para não contar o incentivo duas vezes.
const folhaExtra=analisarResumoVerbas([
  'RESUMO DE VERBAS','TIPO CÁLCULO: 03-FOLHA EXTRA','REFERENCIA: SETEMBRO/2026',
  'LOTAÇÃO...: 002.005.250.00002','PREF. MUNIC. DE FREI INOCENCIO',
  'HOSPITAL MUNICIPAL','PESSOAL CONTRATADO',
  'CLASSIFICAÇÃO CONTÁBIL: 0 - FIXA',
  '100 DIFERENCA SALARIAL 500,00',
  'CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS',
  '344 COMP FED.PIS SAL ENFERMAGEM 1.500,00',
  'VALOR BRUTO DO EMPENHO.............: 500,00',
  'VALOR DO DESCONTO NA LIQUIDAÇÃO....: 0,00',
  'VALOR LIQUIDO DO EMPENHO...........: 500,00',
  'COMP FED.PIS SAL ENFERMAGEM........: 1.500,00'
],{tipo:'extra',nome:'extra-dia10.pdf'});
assert.equal(folhaExtra.avisos.length,0,folhaExtra.avisos.join(' | '));
assert.equal(folhaExtra.registros[0].valores.enfermagem,150000);
const mapaExtra={'extra|002.005.250.00002':{ficha:'100',fonte:'1605',conta:'1'}};
const semDecisao=prepararEmpenhos([folhaExtra],7000,mapaExtra,{});
assert.equal(semDecisao.empenhos[0].bruto,50000);
assert.ok(semDecisao.pendentes[0].problemas.some(x=>x.includes('incentivo federal')));
const jaIncluido=prepararEmpenhos([folhaExtra],7000,{
  'extra|002.005.250.00002':{...mapaExtra['extra|002.005.250.00002'],incentivoNoBruto:'sim'}
},{});
assert.equal(jaIncluido.empenhos[0].bruto,50000);
assert.equal(jaIncluido.empenhos[0].incentivo,150000);
assert.equal(jaIncluido.empenhos[0].liquido,50000);
const naoIncluido=prepararEmpenhos([folhaExtra],7000,{
  'extra|002.005.250.00002':{...mapaExtra['extra|002.005.250.00002'],incentivoNoBruto:'nao'}
},{});
assert.equal(naoIncluido.empenhos[0].bruto,200000);
assert.equal(naoIncluido.empenhos[0].liquido,200000);
assert.equal(naoIncluido.empenhos[0].composicao.INSS,0);
assert.equal(naoIncluido.empenhos[0].descontoRH,0);
assert.equal(naoIncluido.pendentes.length,0);
const excelExtra=new TextDecoder().decode(new Uint8Array(await gerarPlanilhaFolha(naoIncluido,{competencia:'2026-09'}).arrayBuffer()));
assert.match(excelExtra,/Folha extra/);
assert.match(excelExtra,/Incentivo federal enfermagem/);
assert.match(excelExtra,/INSS da folha extra/);

// PDF único com tipo de cálculo variando entre lotações do mesmo número:
const pdfConsolidado=analisarResumoConsolidado([
  {pagina:1,texto:'RESUMO DE VERBAS'}, {pagina:1,texto:'TIPO CÁLCULO: 01-FOLHA MENSAL'},
  {pagina:1,texto:'REFERENCIA: SETEMBRO/2026'},
  {pagina:1,texto:'LOTAÇÃO...: 002.004.215.00001'},
  {pagina:1,texto:'SECRETARIA MUNIC. DE EDUCACAO'}, {pagina:1,texto:'PESSOAL EFETIVO'},
  {pagina:1,texto:'CLASSIFICAÇÃO CONTÁBIL: 0 - FIXA'}, {pagina:1,texto:'100 VENCIMENTO 1.000,00'},
  {pagina:1,texto:'CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS'}, {pagina:1,texto:'201 I.N.S.S. 90,00'},
  {pagina:1,texto:'VALOR BRUTO DO EMPENHO.............: 1.000,00'},
  {pagina:1,texto:'VALOR DO DESCONTO NA LIQUIDAÇÃO....: 90,00'},
  {pagina:1,texto:'VALOR LIQUIDO DO EMPENHO...........: 910,00'},
  {pagina:2,texto:'RESUMO DE VERBAS'}, {pagina:2,texto:'TIPO CÁLCULO: 13 - ADIANTAMENTO 50% DO 13º SALARIO'},
  {pagina:2,texto:'REFERENCIA: SETEMBRO/2026'}, {pagina:2,texto:'LOTAÇÃO: 002.004.215.00001'},
  {pagina:2,texto:'SECRETARIA MUNIC. DE EDUCACAO'}, {pagina:2,texto:'PESSOAL EFETIVO'},
  {pagina:2,texto:'CLASSIFICAÇÃO CONTÁBIL: 0 - FIXA'}, {pagina:2,texto:'100 ADIANTAMENTO 500,00'},
  {pagina:2,texto:'VALOR BRUTO DO EMPENHO.............: 500,00'},
  {pagina:2,texto:'VALOR DO DESCONTO NA LIQUIDAÇÃO....: 0,00'},
  {pagina:2,texto:'VALOR LIQUIDO DO EMPENHO...........: 500,00'}
],{nome:'resumo-unico.pdf'});
assert.equal(tipoDeFolhaCabecalho('TIPO CÁLCULO: 13 - ADIANTAMENTO 50% DO 13º SALARIO'),'decimo');
assert.equal(pdfConsolidado.quantidade,2);
assert.deepEqual(pdfConsolidado.tipos,{principal:1,decimo:1});
assert.equal(pdfConsolidado.arquivos[0].registros[0].lotacao,'002.004.215.00001');
assert.equal(pdfConsolidado.arquivos[1].registros[0].lotacao,'002.004.215.00001');
assert.equal(pdfConsolidado.arquivos[0].registros[0].valores.bruto,100000);
assert.equal(pdfConsolidado.arquivos[1].registros[0].valores.bruto,50000);
assert.ok(!pdfConsolidado.avisos.some(a=>a.includes('repetida')));
const semTipo=analisarResumoConsolidado([
 'RESUMO DE VERBAS','LOTAÇÃO...: 002.004.215.00003',
 'SECRETARIA DE EDUCACAO','PESSOAL EFETIVO','CLASSIFICAÇÃO CONTÁBIL: 0 - FIXA',
 '100 VENCIMENTO 100,00','VALOR BRUTO DO EMPENHO.............: 100,00',
 'VALOR DO DESCONTO NA LIQUIDAÇÃO....: 0,00','VALOR LIQUIDO DO EMPENHO...........: 100,00'
],{nome:'sem-tipo.pdf'});
assert.equal(semTipo.arquivos[0].registros[0].tipoIdentificado,false);
assert.ok(semTipo.avisos.some(x=>x.includes('tipo de folha não identificado')));
// Layout real mostrado pelo usuário: na coluna P os proventos 163/164;
// a rubrica 201 do INSS também tem flag P mas é desconto na última coluna.
const michele=sugerirMaternidadesDaFolha([
 {pagina:3,texto:'LOTAÇÃO:'},
 {pagina:3,texto:'002.004.215.00002 - EDUCACAO CONTRATADOS'},
 {pagina:3,texto:'005054 / 1 MICHELE LOPES GONCALVES 1_20 / 0073 - MONITOR (SALA DE AULA) 01/01/2026 CONTRATADO'},
 {pagina:3,texto:'163 P SALARIO MATERNIDADE 30,00 1.782,37'},
 {pagina:3,texto:'164 P SALARIO FAMILIA 2,00 135,08'},
 {pagina:3,texto:'201 P I.N.S.S. 136,09'},
 {pagina:3,texto:'384 P RETRO DIF DE SAL DO 3,00 182,64'}
]);
assert.equal(michele.achados.length,1);
assert.equal(michele.achados[0].nome,'MICHELE LOPES GONCALVES');
assert.equal(michele.achados[0].lotacao,'002.004.215.00002');
assert.equal(michele.achados[0].beneficio,178237);
assert.equal(michele.achados[0].inss,13609);
assert.equal(michele.achados[0].pagina,3);

// Layout efetivo do PDF de outubro/2026: quatro níveis separados em linhas.
// Antes do reparo, a matrícula 005054 era associada incorretamente ao prefixo 002.004.
const micheleReal=sugerirMaternidadesDaFolha([
 {pagina:19,texto:'LOTAÇÃO: 002 - PREF. MUNIC. DE FREI INOCENCIO'},
 {pagina:19,texto:'002.004 - SECRETARIA MUNIC. DE EDUCACAO'},
 {pagina:19,texto:'002.004.215 - MANUTENÇAO CRECHE 70%'},
 {pagina:19,texto:'002.004.215.00001 - PESSOAL CONTRATADO'},
 {pagina:19,texto:'005054 /1 MICHELE LOPES GONÇALVES 1_20 / 0073 - MONITOR (SALA DE AULA) 01/01/2026 CONTRATADO'},
 {pagina:19,texto:'163 P SALARIO MATERNIDADE 30,00 1.782,37'},
 {pagina:19,texto:'164 P SALARIO FAMILIA 2,00 135,08'},
 {pagina:19,texto:'201 P I.N.S.S. 136,09'},
 {pagina:19,texto:'384 P RETRO DIF DE SAL DO 3,00 182,64'}
]);
assert.equal(micheleReal.achados.length,1);
assert.equal(micheleReal.achados[0].lotacao,'002.004.215.00001');
assert.equal(micheleReal.achados[0].beneficio,178237);
assert.equal(micheleReal.achados[0].inss,13609);
assert.equal(micheleReal.avisos.length,0,micheleReal.avisos.join('; '));
// Nunca usar 002.004 como lotação para uma OP, mesmo com maternidade identificada.
const semUltimoNivel=sugerirMaternidadesDaFolha([
 'LOTAÇÃO: 002 - PREF. MUNIC. DE FREI INOCENCIO',
 '002.004 - SECRETARIA MUNIC. DE EDUCACAO',
 '002.004.215 - MANUTENÇAO CRECHE 70%',
 '005054 /1 MICHELE LOPES GONÇALVES 1_20 / 0073 - MONITOR',
 '163 P SALARIO MATERNIDADE 30,00 1.782,37',
 '201 P I.N.S.S. 136,09'
]);
assert.equal(semUltimoNivel.achados[0].lotacao,'');
assert.ok(semUltimoNivel.avisos.some(x=>x.includes('somente prefixo')));

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
assert.deepEqual(pdfConsolidado.avisos,[]);
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
{resultado:{registros:[{destino:'Caixa Econômica Federal',centavos:100999},{destino:'Sicoob',centavos:80000}]},nome:'minutas'}
];
const conc=conferirConsignadosFolha(prev.empenhos,minuta);
assert.equal(conc.find(x=>x.banco==='Caixa').diferenca,0);
assert.equal(conc.find(x=>x.banco==='Sicoob').diferenca,0);
const troca=conferirConsignadosFolha(prev.empenhos,[{resultado:{registros:[
 {destino:'Caixa Econômica Federal',centavos:100411},{destino:'Sicoob',centavos:80588}
]},nome:'trocadas'}]);
assert.equal(troca.find(x=>x.banco==='Caixa').diferenca,-588);
assert.equal(troca.find(x=>x.banco==='Sicoob').diferenca,588);
const xlsx=gerarPlanilhaFolha(prev,{competencia:'2026-09',status:'RASCUNHO',conciliacao:conc});
const file=new Uint8Array(await xlsx.arrayBuffer());
writeFileSync('/tmp/sisdifi-folha-teste.xlsx',file);
assert.deepEqual([...file.slice(0,4)],[0x50,0x4b,0x03,0x04]);
const texto=new TextDecoder().decode(file);
assert.match(texto,/sheet1.xml/);
assert.match(texto,/Empenhos/);
assert.match(texto,/Salário-maternidade/);
assert.match(texto,/<f>Q3-T3<\/f>/);
assert.match(texto,/<f>SUM\(J3:P3\)<\/f>/);
assert.match(texto,/<f>Q3-R3<\/f>/);
assert.match(texto,/Composição/);
assert.match(texto,/Imposto de renda|IRRF/);
const view=readFileSync(new URL('../assets/js/views/folha-empenhos.js',import.meta.url),'utf8');
assert.match(view,/pode\.contabil\(\)/);
assert.match(view,/data-importar="principal"/);
assert.match(view,/data-importar="nominal"/);
assert.match(view,/fe-final/);
assert.match(view,/fe-visao/);
assert.match(view,/Rubricas de origem/);
assert.match(view,/diferencaComposicao/);
assert.match(view,/conferirConsignadosFolha/);
console.log('Folha: resumo, INSS individual, família, matrícula, ordenação, consignações e XLSX: OK.');
