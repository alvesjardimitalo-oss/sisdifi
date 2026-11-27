// Lançamento: uma linha por empenho e a fonte pelo saldo.
// O exemplo é o que a Contabilidade usa para explicar o serviço: empenho de
// R$ 10.000, desconto de R$ 2.000 (INSS, Caixa, Sicoob, Bradesco, IR) e OP de
// salário-família de R$ 400 — e a linha tem de fechar com o Resumo de Verbas.
import assert from 'node:assert/strict';
import { linhaDeLancamento, linhasDeLancamento, composicaoDaLiquidacao,
  distribuirFontesPorSaldo, linhasDaPlanilha, textoParaColar, secretariaDaPlanilha } from '../assets/js/folha-lancamento.js';
import { idDaPlanilha, abaDoMes, valoresParaAPI, letraColuna } from '../assets/js/folha-planilha-google.js';

let ok = 0; const falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };

const empenho = (x = {}) => ({
  id: 'principal|002.003.064.00002', empenho: 5000, tipo: 'principal',
  caminho: ['SECRETARIA MUNIC. DE ADMINISTRACAO', 'MANUT SERV RH', 'PESSOAL EFETIVO'],
  ficha: '65', fonte: '1500', bruto: 1000000, descontoRH: 200000, descontoAjustado: 200000,
  composicao: { INSS: 130000, Caixa: 30000, Sicoob: 20000, Bradesco: 10000, IRRF: 10000 },
  liquidoRH: 840000, maisInssExtra: 0, ...x
});
const familia = { id: 'principal|002.003.064.00002|familia', empenhoReferencia: 5000,
  tipo: 'Salário-família', ficha: '1', bruto: 40000, inss: 0 };

t('a linha traz o que se digita, com empenho/ano', () => {
  const l = linhaDeLancamento(empenho(), [familia], { competencia: '2026-11', numerosOP: { [familia.id]: '100' } });
  assert.equal(l.empenhoAno, '5000/2026');
  assert.equal(l.ficha, '65');
  assert.equal(l.fonte, '1500');
  assert.equal(l.bruto, 1000000);
  assert.match(l.historico, /PESSOAL EFETIVO NO MES DE NOVEMBRO/);
  assert.equal(l.desconto, 200000);
  assert.equal(l.ops.length, 1);
  assert.equal(l.ops[0].numero, '100');
  assert.equal(l.ops[0].valor, 40000);
  assert.equal(l.ops[0].historico, 'REFERENTE AO EMPENHO 5000/2026');
});

t('bruto − desconto + OP igual ao resumo: bateu', () => {
  const l = linhaDeLancamento(empenho(), [familia], { competencia: '2026-11' });
  assert.equal(l.calculado, 840000);
  assert.equal(l.bateu, true);
  assert.equal(l.diferenca, 0);
});

// O exemplo como foi contado: 1.200 + 300 + 200 + 100 + 100 = 1.900, não 2.000.
t('itens do desconto que não somam o desconto aparecem com a diferença', () => {
  const l = linhaDeLancamento(empenho({ composicao: { INSS: 120000, Caixa: 30000, Sicoob: 20000, Bradesco: 10000, IRRF: 10000 } }),
    [familia], { competencia: '2026-11' });
  assert.equal(l.bateu, false);
  assert.equal(l.somaComposicao, 190000);
  assert.match(l.diferencas[0], /R\$\s*100,00/);
});

t('total diferente do resumo mostra quanto falta', () => {
  const l = linhaDeLancamento(empenho({ liquidoRH: 850000 }), [familia], { competencia: '2026-11' });
  assert.equal(l.bateu, false);
  assert.equal(l.diferenca, 10000);
});

t('INSS da maternidade sai da liquidação e vai para a OP', () => {
  const e = empenho({ descontoAjustado: 186391, maisInssExtra: 13609 });
  assert.equal(composicaoDaLiquidacao(e).INSS, 116391);
  const mat = { id: 'x|maternidade', empenhoReferencia: 5000, tipo: 'Salário-maternidade', bruto: 178237, inss: 13609 };
  const l = linhaDeLancamento({ ...e, liquidoRH: 1000000 - 200000 + 178237 }, [mat], { competencia: '2026-11' });
  assert.equal(l.somaComposicao, l.desconto);
  assert.equal(l.ops[0].desconto, 13609);
  assert.equal(l.bateu, true);
});

t('falta de ficha, fonte ou histórico é pendência, não diferença', () => {
  const l = linhaDeLancamento(empenho({ ficha: '', fonte: '', caminho: ['X', 'Y'] }), [familia], { competencia: '2026-11' });
  assert.deepEqual(l.falta, ['ficha', 'fonte', 'histórico']);
  assert.equal(l.bateu, true);
});

t('linhas e totais da folha', () => {
  const r = linhasDeLancamento({ empenhos: [empenho(), empenho({ id: 'b', empenho: 5001, liquidoRH: 800000 })], extras: [familia] },
    { competencia: '2026-11' });
  assert.equal(r.linhas.length, 2);
  assert.equal(r.linhas[1].ops.length, 0);
  assert.equal(r.totais.bruto, 2000000);
  assert.equal(r.totais.liquidoOP, 40000);
  assert.equal(r.bateram, 2);
});

/* ---- Fonte pelo saldo ---- */
const LOA = {
  '226': { fontes: ['1500', '1600', '1604', '1605', '1621'], propria: '1002' },
  '227': { fontes: ['1500', '1600', '1605', '1621'], propria: '1002' },
  '174': { fontes: ['1540', '1542'], propria: '' },
  '65': { fontes: ['1500'], propria: '1500' }
};
const info = f => LOA[f] || null;
const e = (n, ficha, fonte, bruto) => ({ id: String(n), empenho: n, ficha, fonte, bruto });

t('o federal paga até onde dá e o resto vai para o próprio', () => {
  const r = distribuirFontesPorSaldo(
    [e(1, '227', '1500', 500000), e(2, '227', '1500', 400000), e(3, '227', '1500', 300000)],
    { '1600': 800000 }, info);
  assert.deepEqual(r.propostas.map(p => p.fonte), ['1600', '1002', '1600']);
  assert.equal(r.uso[0].usado, 800000);
  assert.equal(r.uso[0].sobra, 0);
});

t('estadual e federal na ordem em que os saldos foram informados', () => {
  const r = distribuirFontesPorSaldo([e(1, '227', '1500', 500000), e(2, '227', '1500', 500000)],
    [{ fonte: '1621', saldo: 500000 }, { fonte: '1600', saldo: 500000 }], info);
  assert.deepEqual(r.propostas.map(p => p.fonte), ['1621', '1600']);
});

t('sem saldo informado não muda nada', () => {
  const r = distribuirFontesPorSaldo([e(1, '227', '1500', 500000)], {}, info);
  assert.equal(r.propostas[0].fonte, '1500');
  assert.equal(r.mudancas, 0);
});

t('ficha só de recurso próprio não recebe federal', () => {
  const r = distribuirFontesPorSaldo([e(1, '65', '1500', 500000)], { '1600': 9000000 }, info);
  assert.equal(r.propostas[0].fonte, '1500');
  assert.equal(r.uso[0].usado, 0);
});

t('ACS (1604) não é oferecida a outro empenho, mas o dela consome o saldo', () => {
  const r = distribuirFontesPorSaldo([e(1, '226', '1500', 100000), e(2, '226', '1604', 200000)],
    { '1604': 900000 }, info);
  assert.equal(r.propostas[0].fonte, '1500');
  assert.equal(r.propostas[1].fonte, '1604');
  assert.equal(r.uso[0].usado, 200000);
});

t('FUNDEB sem saldo vai para a ficha espelho em recurso próprio', () => {
  const r = distribuirFontesPorSaldo([e(1, '174', '1540', 600000), e(2, '174', '1540', 600000)],
    { '1540': 1000000 }, info);
  assert.deepEqual(r.propostas.map(p => [p.ficha, p.fonte]), [['174', '1540'], ['125', '1001']]);
});

/* ---- Planilha da Contabilidade ---- */
// Empenho 5168 de novembro/2026 na planilha: bruto 62.274,25, desconto 5.667,63,
// salário-família 810,48, maternidade 1.782,37, líquido 59.199,47.
t('linha da planilha nas colunas A–N, com o líquido da planilha', () => {
  const emp = empenho({ id: 'principal|x', empenho: 5168, secretaria: 'SECRETARIA MUNIC. DE EDUCACAO', ficha: '186', fonte: '1540',
    bruto: 6227425, descontoRH: 566763, descontoAjustado: 566763, composicao: { INSS: 566763 }, liquidoRH: 5919947 });
  const ops = [{ id: 'a', empenhoReferencia: 5168, tipo: 'Salário-família', bruto: 81048, inss: 0 },
    { id: 'b', empenhoReferencia: 5168, tipo: 'Salário-maternidade', bruto: 178237, inss: 0 }];
  const lanc = linhasDeLancamento({ empenhos: [emp], extras: ops }, { competencia: '2026-11', numerosOP: { a: '470', b: '471' } });
  const [l] = linhasDaPlanilha([emp], lanc);
  assert.deepEqual(l.slice(0, 14), ['FOLHA DE PAGAMENTO', 5168, 'FUNDEB', '186', '1540', '', 6227425, 566763, '470 / 471',
    81048, null, 178237, null, 5919947]);
  assert.equal(l[l.length - 1], 'BATEU');
  const texto = textoParaColar([l]);
  assert.match(texto, /^FOLHA DE PAGAMENTO\t5168\tFUNDEB\t186\t1540\t\t62\.274,25\t5\.667,63\t470 \/ 471\t810,48\t\t1\.782,37\t\t59\.199,47\t/);
  assert.equal(valoresParaAPI([l])[0][6], 62274.25);
});

t('o nome do grupo só na primeira linha', () => {
  const lanc = linhasDeLancamento({ empenhos: [empenho(), empenho({ id: 'b', empenho: 5001 }), empenho({ id: 'c', empenho: 5002, tipo: 'decimo' })], extras: [] },
    { competencia: '2026-11' });
  assert.deepEqual(linhasDaPlanilha([], lanc).map(l => l[0]), ['FOLHA DE PAGAMENTO', '', 'ADIANTAMENTO DE 50% 13º SALÁRIO']);
});

t('secretaria no nome curto da planilha', () => {
  assert.equal(secretariaDaPlanilha('SECRETARIA MUNIC. DE ADMINISTRACAO'), 'ADMINISTRAÇÃO');
  assert.equal(secretariaDaPlanilha('SECRETARIA MUNIC. DE EDUCACAO', '108'), 'SEC. EDUCAÇÃO');
  assert.equal(secretariaDaPlanilha('SECRETARIA MUNIC. DE EDUCACAO', '174'), 'FUNDEB');
  assert.equal(secretariaDaPlanilha('HOSPITAL MUNICIPAL SAO GERALDO'), 'HOSPITAL MUNICIPAL');
  assert.equal(secretariaDaPlanilha('SECRETARIA MUNIC. DE ACAO SOCIAL'), 'SEC. AÇÃO SOCIAL');
});

t('link e aba da planilha', () => {
  assert.equal(idDaPlanilha('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz_-123/edit#gid=0'), '1AbCdEfGhIjKlMnOpQrStUvWxYz_-123');
  assert.equal(idDaPlanilha('qualquer coisa'), '');
  assert.equal(abaDoMes(['Janeiro', 'Março', 'NOVEMBRO'], '2026-11'), 'NOVEMBRO');
  assert.equal(abaDoMes(['Janeiro', 'Março'], '2026-03'), 'Março');
  assert.equal(abaDoMes(['EXTRA FOLHA - ABRIL', 'Abril'], '2026-04'), 'Abril');
  assert.equal(abaDoMes(['Janeiro'], '2026-12'), '');
  assert.equal(letraColuna(0), 'A');
  assert.equal(letraColuna(22), 'W');
});

console.log(`folha-lancamento: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
