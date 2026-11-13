import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  lerValor, lerData, decendioDe, classificar, origemDe, lerCSV, lerArquivo, proporLancamentos,
  validarLancamento, numeroRetencao, situacao, resumo, codigoVerificacao, comprovanteHTML, demonstrativoHTML, linhasCSV, centavosDe
} from '../assets/js/retencoes.js';

// valores
assert.deepEqual(lerValor('1.234,56'), { centavos: 123456, sinal: '' });
assert.deepEqual(lerValor('R$ 12.345,67D'), { centavos: 1234567, sinal: 'D' });
assert.deepEqual(lerValor('-1.000,00'), { centavos: 100000, sinal: 'D' });
assert.deepEqual(lerValor('1234.5'), { centavos: 123450, sinal: '' });
assert.deepEqual(lerValor('(50,00)'), { centavos: 5000, sinal: 'D' });
assert.equal(lerValor('abc'), null);
assert.equal(centavosDe(''), 0);
assert.equal(centavosDe('3.210,05'), 321005);
assert.throws(() => centavosDe('x'));

// datas e decêndio
assert.equal(lerData('10/11/2026'), '2026-11-10');
assert.equal(lerData('10.11.2026'), '2026-11-10');
assert.equal(lerData('20261120'), '2026-11-20');
assert.equal(lerData('31/02/2026'), '');
assert.deepEqual(decendioDe('2026-11-10'), { decendio: 1, competencia: '2026-11' });
assert.deepEqual(decendioDe('2026-11-13'), { decendio: 1, competencia: '2026-11' });   // feriado: saiu dia 13
assert.deepEqual(decendioDe('2026-11-20'), { decendio: 2, competencia: '2026-11' });
assert.deepEqual(decendioDe('2026-11-30'), { decendio: 3, competencia: '2026-11' });
assert.deepEqual(decendioDe('2026-01-02'), { decendio: 3, competencia: '2025-12' }); // 3º decêndio pago no início do mês seguinte

// classificação
assert.equal(classificar('RETENCAO PASEP'), 'PASEP');
assert.equal(classificar('Débito Convênio EMATER MG'), 'EMATER');
assert.equal(classificar('CISDOCE RATEIO'), 'CISDOCE_RATEIO');
assert.equal(classificar('CISDOCE - SERVIÇOS'), 'CISDOCE_SERVICOS');
assert.equal(classificar('ARDOCE'), 'ARDOCE');
assert.equal(classificar('CONTRIB AMM'), 'AMM');
assert.equal(classificar('CNM CONTRIBUICAO'), 'CNM');
assert.equal(classificar('DEDUCAO FUNDEB', 'D'), 'FUNDEB');
assert.equal(classificar('COTA-PARTE', 'C'), 'BASE');
assert.equal(classificar('TOTAL'), 'IGNORAR');
assert.equal(origemDe('FPM - FUNDO DE PARTICIPACAO'), 'FPM');
assert.equal(origemDe('ITR - IMPOSTO TERRITORIAL RURAL'), 'ITR');
assert.equal(origemDe('IPI-EXP'), 'IPI');
assert.equal(origemDe('LC 176 - ADO 25'), 'LC176');

// CSV com aspas e separador ;
assert.deepEqual(lerCSV('a;"b;c";d\n1;2;3'), [['a', 'b;c', 'd'], ['1', '2', '3']]);

// DAF (formato em blocos por fundo, data só na primeira linha do dia)
const daf = `BENEFICIARIO: FREI INOCENCIO - MG
FPM - FUNDO DE PARTICIPACAO
DATA;PARCELA;VALOR DISTRIBUIDO
10/11/2026;COTA-PARTE;R$ 1.000.000,00C
;RETENCAO PASEP;R$ 10.000,00D
;DEDUCAO FUNDEB;R$ 200.000,00D
;TOTAL;R$ 790.000,00C
20/11/2026;COTA-PARTE;R$ 500.000,00C
;RETENCAO PASEP;R$ 4.000,00D
ITR - IMPOSTO TERRITORIAL RURAL
DATA;PARCELA;VALOR DISTRIBUIDO
20/11/2026;COTA-PARTE;R$ 3.000,00C
;RETENCAO PASEP;R$ 30,00D
`;
const movs = lerArquivo(daf);
const pasep = movs.filter(m => m.rubrica === 'PASEP');
assert.equal(pasep.length, 3);
assert.deepEqual(pasep.map(m => [m.data, m.origem, m.centavos]), [
  ['2026-11-10', 'FPM', 1000000], ['2026-11-20', 'FPM', 400000], ['2026-11-20', 'ITR', 3000]]);
const prop = proporLancamentos(movs);
const marcados = prop.filter(p => p.marcado);
assert.equal(marcados.length, 3);
assert.equal(prop.find(p => p.rubrica === 'FUNDEB').marcado, false);
assert.equal(marcados[0].base_centavos, 100000000);
assert.ok(marcados[1].avisos.some(a => /1% da cota/.test(a)), 'PASEP de 4.000 sobre 500.000 deve avisar');
assert.equal(marcados[0].avisos.length, 0);

// duplicidade com o que já foi lançado
const ja = [{ data: '2026-11-10', origem: 'FPM', rubrica: 'PASEP', centavos: 1000000 }];
const prop2 = proporLancamentos(movs, ja);
assert.equal(prop2.filter(p => p.marcado).length, 2);
assert.ok(prop2.find(p => p.duplicado));

// extrato da conta do FPM (CSV do BB)
const extrato = `"Data","Lançamento","Detalhes","Nº documento","Valor","Tipo Lançamento"
"10/11/2026","Crédito FPM","","","790.000,00","Entrada"
"10/11/2026","Débito Convênio","EMATER MG","123","-2.500,00","Saída"
"10/11/2026","Débito Convênio","CISDOCE RATEIO","124","-8.000,00","Saída"
"10/11/2026","Débito Convênio","CISDOCE SERVICOS","125","-1.200,00","Saída"
"10/11/2026","Débito Convênio","ARDOCE","126","-300,00","Saída"
"10/11/2026","Débito Convênio","AMM","127","-950,00","Saída"
"20/11/2026","Débito Convênio","CNM","128","-410,00","Saída"
"20/11/2026","Saldo do dia","","","0,00",""`;
const mv2 = lerArquivo(extrato, { origemPadrao: 'FPM' });
const p3 = proporLancamentos(mv2).filter(p => p.marcado);
assert.deepEqual(p3.map(p => [p.rubrica, p.centavos, p.origem]), [
  ['EMATER', 250000, 'FPM'], ['CISDOCE_RATEIO', 800000, 'FPM'], ['CISDOCE_SERVICOS', 120000, 'FPM'],
  ['ARDOCE', 30000, 'FPM'], ['AMM', 95000, 'FPM'], ['CNM', 41000, 'FPM']]);

// OFX
const ofx = `<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261120120000[-3:BRT]<TRNAMT>-410.00<MEMO>CNM CONTRIBUICAO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261120<TRNAMT>500000.00<MEMO>CREDITO FPM</STMTTRN></BANKTRANLIST></OFX>`;
const mo = lerArquivo(ofx, { origemPadrao: 'FPM' });
assert.equal(mo.length, 2);
assert.deepEqual([mo[0].rubrica, mo[0].centavos, mo[0].data, mo[0].sinal], ['CNM', 41000, '2026-11-20', 'D']);

// validação
const v = validarLancamento({ data: '2026-11-13', origem: 'FPM', rubrica: 'PASEP', centavos: 1000000 });
assert.equal(v.decendio, 1); assert.equal(v.competencia, '2026-11');
assert.equal(validarLancamento({ data: '2026-11-13', origem: 'FPM', rubrica: 'PASEP', centavos: 1, decendio: 2 }).decendio, 2);
assert.throws(() => validarLancamento({ data: '2026-11-31', origem: 'FPM', rubrica: 'PASEP', centavos: 1 }));
assert.throws(() => validarLancamento({ data: '2026-11-10', origem: 'X', rubrica: 'PASEP', centavos: 1 }));
assert.throws(() => validarLancamento({ data: '2026-11-10', origem: 'FPM', rubrica: 'PASEP', centavos: 0 }));
assert.throws(() => validarLancamento({ data: '2026-11-10', origem: 'FPM', rubrica: 'OUTRA', centavos: 5 }));
assert.equal(numeroRetencao(7, 2026), 'RET 0007/2026');
assert.equal(situacao({}), 'Aguardando empenho');
assert.equal(situacao({ empenho: '12' }), 'Empenhado');
assert.equal(situacao({ empenho: '12', liquidacao: '3' }), 'Liquidado');
assert.equal(situacao({ anulado: true }), 'Anulado');
const rs = resumo([{ rubrica: 'PASEP', origem: 'FPM', centavos: 100 }, { rubrica: 'AMM', origem: 'FPM', centavos: 50, empenho: '1' }, { rubrica: 'AMM', origem: 'FPM', centavos: 999, anulado: true }]);
assert.equal(rs.total, 150); assert.equal(rs.pendentes, 1); assert.equal(rs.porRubrica.AMM, 50);

// comprovante
const reg = { ...v, numero: 'RET 0001/2026', empenho: '1234/2026', base_centavos: 100000000, historico: 'RETENCAO PASEP' };
const html = comprovanteHTML([reg], { orgao: 'PREFEITURA TESTE', geradoEm: '13/11/2026' });
assert.match(html, /COMPROVANTE DE RETENÇÃO/);
assert.match(html, /RET 0001\/2026/);
assert.match(html, /10\.000,00/);
assert.match(html, /dez mil reais/);
assert.match(html, /3261-1/);
assert.match(html, /1234\/2026/);
assert.match(html, /Lei nº 9\.715\/1998/);
assert.match(html, new RegExp(codigoVerificacao(reg)));
assert.ok(!comprovanteHTML([{ ...reg, historico: '<script>x</script>' }]).includes('<script>x'));
assert.match(demonstrativoHTML([reg]), /TOTAL \(1\)/);
assert.equal(linhasCSV([reg])[1][8], '10000,00');

// ---------- arquivos reais (Frei Inocêncio, out–nov/2026) ----------
const fx = n => readFileSync(new URL('./fixtures/' + n, import.meta.url), 'utf8');
assert.deepEqual(lerValor('31.072_95C'), { centavos: 3107295, sinal: 'C' });
assert.deepEqual(lerValor('9_50D'), { centavos: 950, sinal: 'D' });
assert.deepEqual(lerValor('1.635,23 €'), { centavos: 163523, sinal: 'C' });

// DAF: só o PASEP vem marcado; totais do bloco não duplicam; RFB e FUNDEB desmarcados
const pDaf = proporLancamentos(lerArquivo(fx('daf-exemplo.csv')), [], { fonte: 'daf' });
const mDaf = pDaf.filter(p => p.marcado);
assert.deepEqual(mDaf.map(p => [p.data, p.origem, p.centavos]), [
  ['2026-10-20', 'FPM', 242174], ['2026-10-30', 'FPM', 522982], ['2026-11-10', 'FPM', 1204114],
  ['2026-10-28', 'FEP', 41866],
  ['2026-10-20', 'ITR', 950], ['2026-10-30', 'ITR', 1839], ['2026-11-10', 'ITR', 3018],
  ['2026-10-30', 'LC176', 3544]]);
assert.ok(mDaf.every(p => p.rubrica === 'PASEP' && !p.avisos.length), 'PASEP do DAF confere com 1% (FPM bruto; ITR líquido do FUNDEB)');
assert.equal(mDaf[0].base_centavos, 24217626);
assert.equal(mDaf[4].base_centavos, 118796 - 23759);
assert.equal(pDaf.filter(p => p.rubrica === 'RFB_DARF').length, 2);
assert.ok(pDaf.filter(p => p.rubrica === 'RFB_DARF' || p.rubrica === 'FUNDEB').every(p => !p.marcado));
assert.equal(pDaf.reduce((s, p) => s + (p.rubrica === 'PASEP' ? p.centavos : 0), 0), 1969270 + 41866 + 5807 + 3544);

// Extrato do FPM escaneado (texto do OCR): convênios marcados, estornos anulam o débito, PASEP fica para o DAF
const mvEx = lerArquivo(fx('extrato-fpm-ocr.txt'), { origemPadrao: 'FPM' });
assert.ok(mvEx.every(m => m.origem === 'FPM'));
const pEx = proporLancamentos(mvEx, [], { fonte: 'extrato' });
const mEx = pEx.filter(p => p.marcado);
const porRub = {}; for (const p of mEx) porRub[p.rubrica] = (porRub[p.rubrica] || 0) + p.centavos;
assert.deepEqual(porRub, {
  EMATER: 288990 * 3 + 288991, CNM: 91000 * 2, ARDOCE: 171639 * 3,
  CISDOCE_RATEIO: 322168 * 4, CISDOCE_SERVICOS: 2726851 + 2502100 + 10070644 + 2502100, AMM: 88052 });
// rateio (3.221,68) em todo decêndio; serviços (outros valores) só no dia 10
assert.ok(mEx.filter(p => p.rubrica === 'CISDOCE_SERVICOS').every(p => ['2026-10-09', '2026-11-10'].includes(p.data) && !p.avisos.some(a => /dia 10/.test(a))));
assert.ok(mEx.find(p => p.data === '2026-10-09' && p.rubrica === 'CISDOCE_RATEIO' && /decêndio anterior/.test(p.observacao)));
// 10/11: o rateio estornado em 30/10 volta junto com o do decêndio (e um deles foi estornado de novo no dia)
assert.equal(mEx.filter(p => p.data === '2026-11-10' && p.rubrica === 'CISDOCE_RATEIO').length, 1);
assert.ok(pEx.filter(p => p.rubrica === 'PASEP').every(p => !p.marcado && !p.avisos.some(a => /diferente/.test(a))), 'PASEP do extrato soma 1% no dia');
assert.equal(pEx.filter(p => p.avisos.some(a => /Débito estornado/.test(a))).length, 4);
assert.ok(!mEx.some(p => p.data === '2026-11-03'), 'ARDOCE de 03/11 foi estornado');
// lançado de novo: tudo vira duplicado, inclusive os dois CISDOCE iguais do mesmo dia
const jaEx = mEx.map(p => ({ data: p.data, origem: p.origem, rubrica: p.rubrica, centavos: p.centavos }));
assert.equal(proporLancamentos(mvEx, jaEx, { fonte: 'extrato' }).filter(p => p.marcado).length, 0);
// valor do rateio configurável
const outroRateio = proporLancamentos(mvEx, [], { fonte: 'extrato', valorRateioCisdoce: 2502100 });
assert.ok(outroRateio.filter(p => p.centavos === 2502100).every(p => p.rubrica === 'CISDOCE_RATEIO'));
assert.ok(outroRateio.filter(p => p.centavos === 322168).every(p => p.rubrica === 'CISDOCE_SERVICOS'));
assert.ok(outroRateio.some(p => p.data === '2026-10-20' && p.rubrica === 'CISDOCE_SERVICOS' && p.avisos.some(a => /dia 10/.test(a))));

console.log('retencoes: ok');
