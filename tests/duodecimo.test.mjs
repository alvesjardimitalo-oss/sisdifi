import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  META_MENSAL_PADRAO, MESES_DUODECIMO, centavosDuodecimo, dinheiroDuodecimo, dataISOValida,
  validarRepasse, repassesAtivos, resumoDuodecimo, competenciaDuodecimo
} from '../assets/js/duodecimo.js';

assert.equal(META_MENSAL_PADRAO,14000000);
assert.equal(MESES_DUODECIMO.length,12);
assert.equal(centavosDuodecimo('140.000,00'),14000000);
assert.equal(centavosDuodecimo('35000,50'),3500050);
assert.equal(centavosDuodecimo('R$ 25.000,00'),2500000);
assert.equal(centavosDuodecimo('70'),7000);
assert.throws(()=>centavosDuodecimo('-1,00'));
assert.throws(()=>centavosDuodecimo('0,00'));
assert.throws(()=>centavosDuodecimo('1,123'));
assert.throws(()=>centavosDuodecimo('abc'));
assert.match(dinheiroDuodecimo(14000000),/140.000,00/);
assert.ok(dataISOValida('2024-02-29'));
assert.equal(dataISOValida('2026-02-29'),false);
assert.equal(dataISOValida('2026-13-01'),false);
const base={numeroOP:'OP 135/2026',competencia:'2026-09',dataOP:'2026-09-12',dataRepasse:'2026-10-03',valor:'35.000,00',observacao:'Primeira parcela'};
const v=validarRepasse(base,2026);
assert.equal(v.valorCentavos,3500000);
assert.equal(v.dataRepasse,'2026-10-03');
assert.throws(()=>validarRepasse({...base,numeroOP:''},2026));
assert.throws(()=>validarRepasse({...base,competencia:'2026-10'},2025));
assert.throws(()=>validarRepasse({...base,dataRepasse:'2026-02-31'},2026));
assert.equal(validarRepasse({...base,dataRepasse:''},2026).dataRepasse,'');
assert.equal(competenciaDuodecimo(2026,'09'),'2026-09');

const registro=(competencia,valorCentavos,dataRepasse,id)=>({
  competencia,valorCentavos,dataOP:'2026-09-12',dataRepasse,numeroOP:id,id
});
const porAno = {
  repasses:{
    p1:registro('2026-09',3500000,'2026-09-12','p1'),
    p2:registro('2026-09',4500000,'2026-09-20','p2'),
    p3:registro('2026-09',6000000,'2026-10-01','p3'),
    p4:registro('2026-09',1000000,'','p4'),
    p5:{...registro('2026-09',4000000,'2026-09-21','p5'),anulado:true},
    p6:registro('2026-10',1000000,'','p6'),
    p7:registro('2026-10',15000000,'2026-11-03','p7')
  }
};
const ativos=repassesAtivos(porAno);
assert.equal(ativos.length,6);
const resumo=resumoDuodecimo(ativos,META_MENSAL_PADRAO,2026);
assert.equal(resumo.meses.length,12);
assert.equal(resumo.metaTotal,168000000);
const setembro=resumo.meses[8];
assert.equal(setembro.pago,14000000);
assert.equal(setembro.saldo,0);
assert.equal(setembro.emAberto,1000000);
assert.equal(setembro.pagos.length,3);
assert.equal(setembro.situacao,'Integral');
const outubro=resumo.meses[9];
assert.equal(outubro.pago,15000000);
assert.equal(outubro.saldo,-1000000);
assert.equal(outubro.emAberto,1000000);
assert.equal(outubro.situacao,'Integral');
assert.equal(resumo.pago,29000000);
assert.equal(resumo.mesesIntegrais,2);
assert.equal(resumo.totalOPs,6);
assert.equal(resumoDuodecimo([],META_MENSAL_PADRAO,2026).pago,0);

const app=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const view=readFileSync(new URL('../assets/js/views/duodecimo.js',import.meta.url),'utf8');
assert.match(app,/rota: 'duodecimo'.*contabil: true/);
assert.match(app,/\^duodecimo\$/);
assert.match(view,/pode\.contabil\(\)/);
assert.match(view,/ouvirDoc\('duodecimo_anos'/);
assert.match(view,/db\.salvar\('duodecimo_anos'/);
assert.match(view,/dataRepasse/);
assert.match(view,/dd-csv/);
assert.match(view,/dd-imprimir/);
assert.match(view,/dd-imprimir-anual/);
assert.match(view,/imprimirAnual/);
console.log('Duodécimo: 12 meses, R$ 140 mil, OPs parceladas, competência e data real, saldo, anulação, integração ao SISDIFI: OK.');

const regras = readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const db = readFileSync(new URL('../assets/js/db.js',import.meta.url),'utf8');
assert.match(regras,/match \/duodecimo_anos\/\{ano\}\s*\{\s*allow read, write: if operador\(\);/);
assert.match(regras,/match \/exercicios\/\{ano\}[\s\S]*?allow create, update: if operador\(\)\s*&& !request\.resource\.data\.keys\(\)\.hasAny\(\['duodecimo'\]\)/);
assert.match(db,/export async function migrarDuodecimoLegado/);
assert.match(db,/tx\.update\(refOrigem,\{duodecimo:deleteField\(\)\}\)/);
assert.match(view,/db\.lerDoc\('duodecimo_anos'/);
assert.doesNotMatch(view,/db\.salvar\('exercicios'/);
assert.doesNotMatch(view,/ouvirDoc\('exercicios'/);
assert.equal(repassesAtivos({duodecimo:porAno}).length,0); // Não usa origem pública.
console.log('Duodécimo: regras privadas e migração do documento público testadas.');
