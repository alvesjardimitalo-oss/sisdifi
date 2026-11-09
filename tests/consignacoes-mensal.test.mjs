import assert from 'node:assert/strict';
import { conferenciaMensal, vincularFolha, valorEsperado, rotuloCompetencia } from '../assets/js/consignacoes-mensal.js';
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
