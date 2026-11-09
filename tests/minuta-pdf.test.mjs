import assert from 'node:assert/strict';
import { analisarMinuta, agruparMinuta, identificarDestino, centavos, extrairMinuta } from '../assets/js/minuta-pdf.js';
const header = 'DATA GUIA FICHA CÓDIGO ESPECIFICAÇÃO DA RECEITA VALOR DA ARRECADAÇÃO';
const lines = [header,'28/08/2026','2026/1-1 00041 CONSIGNAÇÃO SICOOB 100,00','Total da Guia : 500,00','1.500.000.0000 Impostos 40,00','1.540.000.0000 FUNDEB 60,00','UF: MINAS GERAIS','25/08/2026','31/08/2026',header,'2026/2-1 00041 CONSIGNAÇÃO CEF 10,05','1.500.100.0000 Impostos 10,05','2026/3-1 00041 CONSIGNAÇÃO BRADESCO 20,00','1.500.000.0000 Impostos 20,00','2026/4-1 00041 PENSÃO ALIMENTÍCIA 30,00','1.540.000.0000 FUNDEB 30,00','TOTAL GERAL: 160,05'];
const r=analisarMinuta(lines);
assert.equal(r.totalLido,16005);assert.equal(r.totalInformado,16005);assert.equal(r.registros.length,5);assert.equal(r.avisos.length,0);assert.equal(r.registros.at(-1).data,'28/08/2026');assert.equal(r.registros[0].tipo,'Guia');
assert.equal(agruparMinuta(r.registros).length,5);
assert.equal(identificarDestino('CONSIGNAÇÃO CAIXA ECONÔMICA FEDERAL'),'Caixa Econômica Federal');
assert.equal(identificarDestino('SALDO CAIXA'),'');assert.equal(identificarDestino('CONSIGNAÇÃO OUTRO BANCO'),'');
assert.equal(centavos('-1.234,56'),-123456);assert.throws(()=>centavos('1,2'));
assert.ok(analisarMinuta(lines.slice(0,-1).concat('TOTAL GERAL: 200,00')).avisos.some(a=>a.includes('total geral')));
assert.ok(analisarMinuta(['2026/1-1 CONSIGNAÇÃO SICOOB 10,00']).avisos.some(a=>a.includes('não identificado')));
assert.ok(analisarMinuta(['2026/1-1 RECEITA DESCONHECIDA 10,00','1.500.000.0000 Fonte 10,00']).avisos.some(a=>a.includes('não classificada')));
assert.ok(analisarMinuta(['1.500.000.0000 Fonte 10,00']).avisos.some(a=>a.includes('sem documento')));
assert.ok(analisarMinuta(['2026/1-1 CONSIGNAÇÃO SICOOB 10,00','1.500.000.0000 Fonte 9,00']).avisos.some(a=>a.includes('difere')));
assert.ok(analisarMinuta([...lines,...lines]).avisos.some(a=>a.includes('repetido')));
assert.equal(agruparMinuta([{destino:'Sicoob',fonte:'1500',centavos:10},{destino:'Sicoob',fonte:'1500',centavos:20}])[0].total,30);
// Itens com total sobreposto: não podem se misturar com a receita seguinte.
const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y]});
let destroyed=false;
const lib={getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getViewport:()=>({transform:[1,0,0,1,0,0]}),getTextContent:async()=>({items:[item(header,0,0),item('2026/1-1',0,10),item('CONSIGNAÇÃO SICOOB 15,00',100,10.6),item('Total da Guia : 500,00',200,12.4),item('1.500.000.0000 Fonte 15,00',0,20),item('TOTAL GERAL: 15,00',0,30)]}),cleanup(){}})}),destroy:async()=>{destroyed=true;}})};
const mock=await extrairMinuta(new Uint8Array(),lib);assert.equal(mock.totalLido,1500);assert.equal(mock.avisos.length,0);assert.ok(destroyed);
console.log('Minuta: classificação, fontes, totais, cabeçalhos, duplicidade e extração aprovados.');

// Layout real da Caixa em Frei Inocêncio: o nome do banco não aparece no texto;
// a identificação está no código 2.1.3.01.00.00 / especificação 21.
assert.equal(identificarDestino('00021 2.1.3.01.00.00 21 2.549,99'),'Caixa Econômica Federal');
assert.equal(identificarDestino('00021 2.1.3.01.00.00 22 2.549,99'),'');
assert.equal(identificarDestino('00021 2.1.3.01.00.01 21 2.549,99'),'');
assert.equal(identificarDestino('00021 2.1.3.01.00.00 210 2.549,99'),'');
assert.equal(identificarDestino('00021 2.1.3.01.00.00 21 CONSIGNAÇÃO SICOOB 1.000,00'),'Sicoob');
const caixaRealista=analisarMinuta([
  header, '28/08/2026',
  '2026/4001-1 00021 2.1.3.01.00.00 21 2.549,99',
  '1.500.000.0000 Recursos não vinculados de Impostos 2.549,99',
  '2026/4041-1 00021 2.1.3.01.00.00 21 Total da Guia : 9.727,42',
  '1.540.000.0000 Transferências do FUNDEB - Impostos / Tr 9.727,42',
  'TOTAL GERAL: 12.277,41'
]);
assert.equal(caixaRealista.registros.length,2);
assert.equal(caixaRealista.totalLido,1227741);
assert.equal(caixaRealista.registros[0].destino,'Caixa Econômica Federal');
assert.equal(caixaRealista.registros[1].destino,'Caixa Econômica Federal');
assert.ok(!caixaRealista.avisos.some(a=>a.includes('não classificada')));
console.log('Caixa código 21 e layout sem nome de banco aprovados.');
