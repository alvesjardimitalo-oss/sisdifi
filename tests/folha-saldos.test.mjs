// Saldo por fonte e rateio da educação entre FUNDEB e recurso próprio.
//
// A educação toda vai no FUNDEB, menos o pessoal da Secretaria de Educação.
// Quando o FUNDEB não tem saldo, a diferença vai para as fichas espelho do
// Fundo de Educação, em recurso próprio.
//
// O rateio é por lotação inteira, nunca por valor: dividir uma lotação em dois
// empenhos exigiria repartir os descontos, e o INSS de um servidor não se
// reparte — a liquidação tem de casar com a retenção real daquela pessoa.
import assert from 'node:assert/strict';
import { ratearPorSaldo, ehFundeb, mesmaFonte, saldoDaFonte,
  ESPELHO_RECURSO_PROPRIO, FONTE_EDUCACAO_PROPRIA, FONTE_SAUDE_PROPRIA,
  FONTE_NAO_VINCULADA, FONTES_FUNDEB, codigoFonte } from '../assets/js/folha-saldos.js';

let ok = 0; const falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };
// `fichaSugerida` marca o que o sistema sugeriu — só isso entra no rateio.
const emp = (numero, ficha, fonte, bruto, extra = {}) => ({ empenho: numero, lotacao: '002.004.217.0000' + numero,
  ficha, fonte, bruto, fichaSugerida: true, ...extra });

t('fonte compara ignorando pontuação', () => {
  assert.ok(mesmaFonte('1540', '1.540.000.0000'));
  assert.ok(mesmaFonte('1.500.000.0000', '1500'));
  assert.ok(!mesmaFonte('1540', '1500'));
  assert.ok(!mesmaFonte('', '1540'), 'fonte vazia não casa com nada');
  assert.ok(!mesmaFonte('', ''));
});

t('reconhece as fontes do FUNDEB', () => {
  assert.ok(ehFundeb('1540'));
  assert.ok(ehFundeb('1.542.000.0000'));
  assert.ok(!ehFundeb(FONTE_EDUCACAO_PROPRIA));
  assert.ok(!ehFundeb(''));
  assert.deepEqual(FONTES_FUNDEB, ['1540', '1542', '2540', '2542'],
    'o grupo 2 é a mesma fonte, de exercícios anteriores');
  assert.ok(ehFundeb('2540'), 'FUNDEB de exercício anterior também é FUNDEB');
  assert.ok(!ehFundeb('2546'), 'a 546 não é FUNDEB');
});

/* Cortar zeros à direita confundiria 1500 com 150; os quatro primeiros
   dígitos resolvem as duas escritas sem ambiguidade. */
t('o código da fonte são os quatro primeiros dígitos', () => {
  assert.equal(codigoFonte('1.540.000.0000'), '1540');
  assert.equal(codigoFonte('1540'), '1540');
  assert.equal(codigoFonte('1001'), '1001');
  assert.ok(!mesmaFonte('1500', '150'), 'fonte incompleta não casa com 1500');
  assert.equal(FONTE_EDUCACAO_PROPRIA, '1001');
  assert.equal(FONTE_SAUDE_PROPRIA, '1002');
  assert.equal(FONTE_NAO_VINCULADA, '1500');
});

t('saldo é achado pela fonte, escrita de qualquer jeito', () => {
  assert.equal(saldoDaFonte({ '1540': 55000954 }, '1.540.000.0000'), 55000954);
  assert.equal(saldoDaFonte({ '1.540.000.0000': 100 }, '1540'), 100);
  assert.equal(saldoDaFonte({ '1540': 100 }, '1500'), null, 'sem saldo informado é null, não zero');
});

// Faltar informação não é o mesmo que faltar dinheiro.
t('sem saldo informado nada é movido', () => {
  const r = ratearPorSaldo([emp(1, '174', '1540', 100000)], {});
  assert.equal(r.movidos.length, 0);
  assert.equal(r.empenhos[0].ficha, '174');
  assert.deepEqual(r.avisos, []);
});

t('cabendo no saldo, fica no FUNDEB', () => {
  const r = ratearPorSaldo([emp(1, '174', '1540', 100000)], { '1540': 500000 });
  assert.equal(r.movidos.length, 0);
  assert.equal(r.empenhos[0].fonte, '1540');
});

t('não cabendo, vai para a ficha espelho em recurso próprio', () => {
  const r = ratearPorSaldo([emp(1, '174', '1540', 100000)], { '1540': 50000 });
  assert.equal(r.movidos.length, 1);
  assert.equal(r.empenhos[0].ficha, '125', '174 do FUNDEB espelha na 125 do Fundo de Educação');
  assert.equal(r.empenhos[0].fonte, FONTE_EDUCACAO_PROPRIA);
  assert.match(r.empenhos[0].motivoFicha, /falta de saldo/);
  assert.match(r.empenhos[0].lotacaoOrcamentaria, /recurso próprio/);
});

t('o saldo é consumido na ordem dos empenhos', () => {
  const r = ratearPorSaldo([emp(1, '174', '1540', 60000), emp(2, '174', '1540', 60000)], { '1540': 100000 });
  assert.equal(r.empenhos[0].fonte, '1540', 'o primeiro consome 600,00 dos 1.000,00');
  assert.equal(r.empenhos[1].ficha, '125', 'o segundo não cabe nos 400,00 que restaram');
});

/* O FUNDEB é usado até o fim: um empenho grande pode sair e um menor, depois
   dele, ficar. Em troca só a diferença sai do FUNDEB, que é a regra. */
t('o que ainda couber continua no FUNDEB depois de um que não cabe', () => {
  const r = ratearPorSaldo([emp(1, '174', '1540', 90000), emp(2, '174', '1540', 10000)], { '1540': 50000 });
  assert.equal(r.empenhos[0].ficha, '125', 'o de 900,00 não cabe nos 500,00');
  assert.equal(r.empenhos[1].ficha, '174', 'o de 100,00 cabe e fica');
  assert.equal(r.movidos.length, 1);
});

t('o número do empenho nunca muda', () => {
  const entrada = [emp(4939, '174', '1540', 90000), emp(4940, '174', '1540', 10000)];
  const r = ratearPorSaldo(entrada, { '1540': 50000 });
  assert.deepEqual(r.empenhos.map(e => e.empenho), [4939, 4940],
    'rateio por lotação inteira não cria empenho, então a numeração fica de pé');
});

// Transporte Escolar não tem elemento de pessoal no Fundo de Educação: só
// material e serviços. Então não há para onde mover, e o sistema diz isso.
t('ação sem espelho de pessoal avisa em vez de inventar ficha', () => {
  const r = ratearPorSaldo([emp(1, '179', '1540', 100000)], { '1540': 10000 });
  assert.equal(r.movidos.length, 0);
  assert.equal(r.empenhos[0].ficha, '179', 'a ficha não é trocada por uma que não existe');
  assert.ok(r.avisos.some(a => /não tem ficha de pessoal em recurso próprio/.test(a)));
  assert.ok(r.avisos.some(a => /Informe a ficha à mão/.test(a)));
});

t('ficha escolhida à mão não é movida', () => {
  const r = ratearPorSaldo([emp(1, '174', '1540', 100000, { fichaSugerida: false })], { '1540': 10000 });
  assert.equal(r.movidos.length, 0);
  assert.equal(r.empenhos[0].ficha, '174');
  assert.ok(r.avisos.some(a => /falta/.test(a)), 'mas avisa que o saldo não cobre');
});

t('fonte estourada é denunciada com o quanto falta', () => {
  const r = ratearPorSaldo([emp(1, '179', '1540', 100000)], { '1540': 60000 });
  const aviso = r.avisos.find(a => /tem saldo de/.test(a));
  assert.ok(aviso);
  assert.match(aviso, /400,00/, 'diz quanto falta');
});

t('empenho fora da educação não entra no rateio, mas consome a fonte', () => {
  const r = ratearPorSaldo([{ empenho: 1, lotacao: '002.012.296.00001', ficha: '399',
    fonte: FONTE_EDUCACAO_PROPRIA, bruto: 100000, fichaSugerida: true }], { [FONTE_EDUCACAO_PROPRIA]: 50000 });
  assert.equal(r.movidos.length, 0);
  assert.equal(r.empenhos[0].ficha, '399');
  const c = r.consumo.find(x => x.fonte === FONTE_EDUCACAO_PROPRIA);
  assert.equal(c.total, 100000);
  assert.ok(r.avisos.some(a => /falta/.test(a)));
});

t('o consumo soma por fonte, do maior para o menor', () => {
  const r = ratearPorSaldo([emp(1, '174', '1540', 30000), emp(2, '174', '1540', 20000),
    { empenho: 3, lotacao: 'x', ficha: '108', fonte: '1500', bruto: 90000, fichaSugerida: true }], {});
  assert.deepEqual(r.consumo.map(c => [c.fonte, c.total]), [['1500', 90000], ['1540', 50000]]);
  assert.equal(r.consumo[0].saldo, null, 'saldo não informado aparece como null');
});

t('o movido registra de onde veio e para onde foi', () => {
  const r = ratearPorSaldo([emp(4932, '192', '1540', 11060511)], { '1540': 100 });
  const m = r.movidos[0];
  assert.equal(m.empenho, 4932);
  assert.equal(m.bruto, 11060511);
  assert.deepEqual(m.de, { ficha: '192', fonte: '1540' });
  assert.deepEqual(m.para, { ficha: '149', fonte: FONTE_EDUCACAO_PROPRIA });
  assert.match(m.acao, /Pré-Escola/);
});

t('todo espelho é par 04/11 da mesma ação', () => {
  const pares = [['173', '174'], ['186', '187'], ['191', '192'], ['198', '199']];
  for (const [a, b] of pares) {
    assert.ok(ESPELHO_RECURSO_PROPRIO[a] && ESPELHO_RECURSO_PROPRIO[b], a + '/' + b);
    assert.equal(ESPELHO_RECURSO_PROPRIO[a].acao, ESPELHO_RECURSO_PROPRIO[b].acao, 'mesma ação nos dois');
    assert.equal(Number(ESPELHO_RECURSO_PROPRIO[b].ficha) - Number(ESPELHO_RECURSO_PROPRIO[a].ficha), 1,
      'o par de pessoal é sempre ficha seguida');
  }
  assert.equal(ESPELHO_RECURSO_PROPRIO['179'], undefined, 'Transporte Escolar não tem espelho de pessoal');
  assert.equal(ESPELHO_RECURSO_PROPRIO['180'], undefined);
});

t('lista vazia não quebra', () => {
  assert.deepEqual(ratearPorSaldo([], {}).empenhos, []);
  assert.deepEqual(ratearPorSaldo().movidos, []);
  assert.deepEqual(ratearPorSaldo(null, null).avisos, []);
});

t('bruto zerado ou ausente não move nada', () => {
  const r = ratearPorSaldo([emp(1, '174', '1540', 0), emp(2, '174', '1540', null)], { '1540': 0 });
  assert.equal(r.movidos.length, 0);
  assert.deepEqual(r.empenhos.map(e => e.ficha), ['174', '174']);
});

console.log(`folha-saldos: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
