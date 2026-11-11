import assert from 'node:assert/strict';
import { conferenciaMensal, vincularFolha, valorEsperado, rotuloCompetencia, buscarDocumentosDaDiferenca, documentosParaConferencia, reconhecerCodigoCaixaExistente, avisosPendentes, classificarArquivo, agruparOPsPorBancoFonte } from '../assets/js/consignacoes-mensal.js';
import { DESTINOS } from '../assets/js/minuta-pdf.js';
const [caixa,sicoob,bradesco,pensao]=DESTINOS;
const arquivo=(destino,valor,numero='2026/1-1')=>({nome:destino+'.pdf',resultado:{avisos:[],registros:[{destino,centavos:valor,numero,data:'28/08/2026',fonte:'1500',fonteCompleta:'1.500.000.0000'}]}});
const arquivos=[arquivo(caixa,80000),arquivo(sicoob,100000),arquivo(sicoob,20000,'2026/2-1'),arquivo(bradesco,30000),arquivo(pensao,5000)];
const esperados={[caixa]:100000,[sicoob]:100000,[bradesco]:30000,[pensao]:5000};
let c=conferenciaMensal(arquivos,esperados);
assert.equal(c.blocos.length,4);assert.equal(c.diferenca,0);assert.equal(c.conferido,false);assert.equal(c.trocas.length,1);assert.equal(c.trocas[0].sobra,sicoob);assert.equal(c.trocas[0].falta,caixa);assert.equal(c.trocas[0].valor,20000);assert.equal(c.trocas[0].candidatos[0].numero,'2026/2-1');
assert.equal(conferenciaMensal([],{}).blocos.filter(b=>!b.arquivos).length,4);
assert.equal(conferenciaMensal([],{}).diferenca,null);
assert.equal(conferenciaMensal([],{[caixa]:0,[sicoob]:0,[bradesco]:0,[pensao]:0}).conferido,false);
assert.equal(conferenciaMensal(arquivos,{...esperados,[caixa]:80000,[sicoob]:120000}).conferido,true);
assert.equal(conferenciaMensal([...arquivos,arquivo('',10)],esperados).naoClassificados.length,1);
assert.equal(valorEsperado(''),null);assert.equal(valorEsperado('0'),0);assert.equal(valorEsperado('1.234,56'),123456);assert.throws(()=>valorEsperado('-10,00'));assert.throws(()=>valorEsperado('1.2'));
assert.equal(rotuloCompetencia('2026-08'),'Agosto de 2026');
console.log('Conferência mensal: quatro categorias, valores esperados, trocas, pendências e competência aprovados.');

// Folha de agosto paga em setembro: manter a referência e a data original.
const setembro={registros:[{data:'05/09/2026',centavos:20000}],avisos:[]};
const agosto=vincularFolha(setembro,'2026-08');
assert.equal(agosto.competenciaFolha,'2026-08');
assert.equal(agosto.registros[0].data,'05/09/2026');
assert.equal(agosto.registros[0].centavos,20000);
assert.equal(vincularFolha({registros:[{data:'05/01/2027'}]},'2026-12').competenciaFolha,'2026-12');
assert.equal(vincularFolha({registros:[{data:''}]},'2026-08').competenciaFolha,'2026-08');
assert.throws(()=>vincularFolha(setembro,'2026-13'));

// O mesmo empenho dividido entre fontes é um único candidato (não duas hipóteses).
const registrosReais = [
  {destino:sicoob,numero:'2026/51-1',tipo:'Empenho',arquivo:'Sicoob.pdf',data:'05/09/2026',fonte:'1500',fonteCompleta:'1.500.000.0000',centavos:12000},
  {destino:sicoob,numero:'2026/51-1',tipo:'Empenho',arquivo:'Sicoob.pdf',data:'05/09/2026',fonte:'1540',fonteCompleta:'1.540.000.0000',centavos:8000},
  {destino:sicoob,numero:'2026/52-1',tipo:'Empenho',arquivo:'Sicoob.pdf',data:'05/09/2026',fonte:'1500',fonteCompleta:'1.500.000.0000',centavos:5000},
  {destino:sicoob,numero:'2026/53-1',tipo:'Empenho',arquivo:'Sicoob.pdf',data:'05/09/2026',fonte:'1500',fonteCompleta:'1.500.000.0000',centavos:7000}
];
const docs = documentosParaConferencia(registrosReais);
assert.equal(docs.length,3);
assert.equal(docs[0].centavos,20000);
assert.deepEqual(docs[0].fontes,['1.500.000.0000','1.540.000.0000']);
const simples=buscarDocumentosDaDiferenca(registrosReais,20000);
assert.equal(simples[0][0].numero,'2026/51-1');
assert.ok(simples.some(comb=>comb.length===1));
const duplo=buscarDocumentosDaDiferenca(registrosReais,12000);
assert.ok(duplo.some(comb=>comb.length===2 && comb.reduce((s,d)=>s+d.centavos,0)===12000));
assert.equal(buscarDocumentosDaDiferenca(registrosReais,1).length,0);
const comFonte=[{nome:'Sicoob.pdf',resultado:{avisos:[],registros:registrosReais}},
 {nome:'CEF.pdf',resultado:{avisos:[],registros:[{...registrosReais[0],destino:caixa,arquivo:'CEF.pdf',centavos:10000}]}}];
const inv=conferenciaMensal(comFonte,{[sicoob]:12000,[caixa]:18000});
assert.ok(inv.investigacoes.some(v=>v.sobra===sicoob && v.falta===caixa && v.valor===8000));
console.log('Diagnóstico: fontes agregadas por documento e hipóteses simples/combinadas aprovadas.');

const legadoCaixa = {
  nome:'caixa.pdf', resultado: {
    avisos:['2026/4001-1: receita não classificada; confira antes de usar o resultado.'],
    registros:[{numero:'2026/4001-1',destino:'',descricao:'00021 2.1.3.01.00.00 21 2.549,99',fonte:'1500',fonteCompleta:'1.500.000.0000',centavos:254999}]
  }
};
const corrigido = reconhecerCodigoCaixaExistente(legadoCaixa);
assert.equal(corrigido.alterados,1);
assert.equal(corrigido.arquivo.resultado.registros[0].destino,caixa);
assert.equal(avisosPendentes(corrigido.arquivo).length,0);
assert.equal(legadoCaixa.resultado.registros[0].destino,''); // Histórico bruto original intacto
assert.equal(reconhecerCodigoCaixaExistente(corrigido.arquivo).alterados,0);
assert.equal(conferenciaMensal([corrigido.arquivo],{}).naoClassificados.length,0);
const confirmadoManual=classificarArquivo(legadoCaixa,caixa);
assert.equal(avisosPendentes(confirmadoManual).length,0);
assert.equal(classificarArquivo(confirmadoManual,'').resultado.registros[0].destino,'');
console.log('Arquivo Caixa já importado reconhecido, com avisos resolvidos.');


// Cada combinação banco + fonte completa deve produzir UMA OP, sem misturar bancos.
const resumoOP=agruparOPsPorBancoFonte([
 {nome:'bradesco setembro.pdf',resultado:{registros:[
   {destino:bradesco,tipo:'Guia',numero:'2026/4548-1',fonte:'1500',fonteCompleta:'1.500.000.0000',fonteNome:'Recursos não vinculados de Impostos',centavos:39483},
   {destino:bradesco,tipo:'Guia',numero:'2026/4570-1',fonte:'1540',fonteCompleta:'1.540.000.0000',centavos:17230},
   {destino:bradesco,tipo:'Guia',numero:'2026/4583-1',fonte:'1600',fonteCompleta:'1.600.000.0000',centavos:37391},
   {destino:bradesco,tipo:'Guia',numero:'2026/4548-1',fonte:'1500',fonteCompleta:'1.500.000.0000',centavos:100}
 ]}},
 {nome:'sicoob setembro.pdf',resultado:{registros:[
   {destino:sicoob,tipo:'Guia',numero:'2026/4529-1',fonte:'1540',fonteCompleta:'1.540.000.0000',centavos:39516},
   {destino:'',tipo:'Guia',numero:'2026/9999-1',fonte:'1500',fonteCompleta:'1.500.000.0000',centavos:250}
 ]}}
]);
assert.equal(resumoOP.itens.length,4);
assert.equal(resumoOP.pendentes.length,1);
assert.equal(resumoOP.totalPendentes,250);
assert.equal(resumoOP.itens.find(x=>x.destino===bradesco&&x.fonte==='1500').total,39583);
assert.equal(resumoOP.itens.find(x=>x.destino===bradesco&&x.fonte==='1500').guias,1);
assert.equal(resumoOP.itens.find(x=>x.destino===bradesco&&x.fonte==='1540').total,17230);
assert.equal(resumoOP.itens.find(x=>x.destino===bradesco&&x.fonte==='1600').total,37391);
assert.equal(resumoOP.itens.find(x=>x.destino===sicoob&&x.fonte==='1540').total,39516);
assert.equal(resumoOP.total,39583+17230+37391+39516);
const semExtra=agruparOPsPorBancoFonte([{nome:'x',resultado:{registros:[{
 destino:bradesco,fonte:'1500',fonteCompleta:'1.500.000.0000',numero:'1',tipo:'Guia',centavos:39483
}]}}]);
assert.equal(semExtra.total,39483);
assert.equal(agruparOPsPorBancoFonte([]).itens.length,0);
const bradescoExato=agruparOPsPorBancoFonte([{
 nome:'bradesco setembro.pdf', resultado:{registros:[
  {destino:bradesco,fonte:'1500',fonteCompleta:'1.500.000.0000',numero:'2026/4548-1',tipo:'Guia',centavos:39483},
  {destino:bradesco,fonte:'1540',fonteCompleta:'1.540.000.0000',numero:'2026/4570-1',tipo:'Guia',centavos:17230},
  {destino:bradesco,fonte:'1600',fonteCompleta:'1.600.000.0000',numero:'2026/4583-1',tipo:'Guia',centavos:37391}
 ]}}]);
assert.equal(bradescoExato.itens.length,3);
assert.equal(bradescoExato.total,94104);
assert.deepEqual(bradescoExato.itens.map(g=>[g.fonte,g.total]),[['1500',39483],['1540',17230],['1600',37391]]);
const fontesDiferentes=agruparOPsPorBancoFonte([{nome:'teste',resultado:{registros:[
 {destino:bradesco,fonte:'1500',fonteCompleta:'1.500.000.0000',numero:'1',tipo:'Guia',centavos:100},
 {destino:bradesco,fonte:'1500',fonteCompleta:'1.500.100.0000',numero:'2',tipo:'Guia',centavos:200}
]}}]);
assert.equal(fontesDiferentes.itens.length,2);
console.log('OP extra por banco/fonte: fontes separadas, guias únicas e pendências aprovadas.');
