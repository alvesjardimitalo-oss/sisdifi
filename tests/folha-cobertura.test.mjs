// Cobertura das contas: o que cada conta pode pagar, quanto do saldo se usa e
// o que vai para o recurso próprio. Os casos imitam a planilha de contas da
// Contabilidade (Assistência Social por servidor, Custeio SUS e FUNDEB por
// fonte, Atenção Básica por ficha). Nomes fictícios.
import assert from 'node:assert/strict';
import { lerPodePagar, mesmoServidor, quadroDaFolha, coberturaPorConta } from '../assets/js/folha-cobertura.js';

let ok = 0; const falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };

const LOA = {
  '347': { fontes: ['1500', '1660'], propria: '1500' },
  '352': { fontes: ['1500', '1660'], propria: '1500' },
  '226': { fontes: ['1500', '1600', '1604', '1605', '1621'], propria: '1002' },
  '227': { fontes: ['1500', '1600', '1605', '1621'], propria: '1002' },
  '235': { fontes: ['1500', '1600', '1621'], propria: '1002' },
  '174': { fontes: ['1540', '1542'], propria: '' },
  '65': { fontes: ['1500'], propria: '1500' }
};
const info = f => LOA[f] || null;
const emp = (n, ficha, fonte, bruto, lotacao) => ({ id: 'p|' + lotacao, empenho: n, ficha, fonte, bruto, lotacao });

t('o "pode pagar" lê nomes com cargo, "e" e fichas', () => {
  const r = lerPodePagar('Assistente Social: Ana Lima =>Psicóloga: Beatriz =>Monitora: Carla Souza');
  assert.deepEqual(r.nomes.map(n => n.texto), ['Ana Lima', 'Beatriz', 'Carla Souza']);
  assert.deepEqual(lerPodePagar('Daniela Reis e Elisa Prado').nomes.map(n => n.texto), ['Daniela Reis', 'Elisa Prado']);
  assert.deepEqual(lerPodePagar('Supervisora: Fátima Visitadora: Gilda').nomes.map(n => n.texto), ['Fátima', 'Gilda']);
  assert.deepEqual([...lerPodePagar('226, 227').fichas], ['226', '227']);
  assert.equal(lerPodePagar(''), null);
});

t('nome da lista casa com o nome completo, sem acento e sem ligações', () => {
  assert.ok(mesmoServidor('Fátima', 'FATIMA APARECIDA DE SOUZA'));
  assert.ok(mesmoServidor('Carla Souza', 'CARLA MARIA DOS SANTOS SOUZA'));
  assert.ok(!mesmoServidor('Carla Souza', 'CARLA MARIA DOS SANTOS'));
  assert.ok(!mesmoServidor('Ana', 'MARIANA LIMA'), 'palavra inteira, não pedaço');
});

t('bruto por servidor sem descontos e sem as OPs', () => {
  const q = quadroDaFolha([{ nome: 'ANA LIMA', lotacao: 'L1', rubricas: [
    { codigo: '100', valor: 200000 }, { codigo: '164', valor: 6754 }, { codigo: '201', valor: 15000 }] }], new Set(['201']));
  assert.deepEqual(q, { L1: [['ANA LIMA', 200000]] });
});

const QUADRO = {
  CRAS: [['ANA LIMA', 300000], ['BEATRIZ COSTA', 250000], ['CARLA SOUZA', 180000]],
  CRAS2: [['ANA PAULA', 200000], ['HELENA DIAS', 210000]],
  IGD: [['DANIELA REIS', 150000], ['ELISA PRADO', 150000]]
};
const CONTAS = [
  { id: 'cras', nome: 'CRAS/SCFV', fonte: '1660', saldo: 1000000, podePagar: 'Assistente Social: Ana Lima =>Psicóloga: Beatriz =>Monitora: Carla Souza' },
  { id: 'igd', nome: 'IGD', fonte: '1660', saldo: 200000, podePagar: 'Daniela Reis e Elisa Prado' },
  { id: 'sus', nome: 'Custeio SUS', fonte: '1600', saldo: 5000000, podePagar: '' }
];

t('conta por servidores paga a lotação só quando TODOS dela estão na lista', () => {
  const r = coberturaPorConta([emp(1, '347', '1500', 730000, 'CRAS'), emp(2, '347', '1500', 410000, 'CRAS2')], CONTAS, info, QUADRO);
  assert.equal(r.propostas[0].fonte, '1660');
  assert.equal(r.propostas[0].conta, 'cras');
  assert.equal(r.propostas[1].fonte, '1500', 'CRAS2 tem Helena, que a conta não paga');
  const u = r.uso.find(x => x.id === 'cras');
  assert.equal(u.usado, 730000);
  assert.equal(u.sobra, 270000);
});

t('saldo menor que o bruto: o empenho vai inteiro para o recurso próprio', () => {
  const r = coberturaPorConta([emp(1, '352', '1500', 300000, 'IGD')], CONTAS, info, QUADRO);
  assert.equal(r.propostas[0].fonte, '1500');
  assert.match(r.propostas[0].motivo, /saldo de IGD não cobre/);
});

t('lotação com parte dos servidores na lista: sugestão ao RH com o valor', () => {
  const quadro = { ...QUADRO, CRAS3: [['ANA LIMA', 300000], ['JOAO MOTA', 400000]] };
  const r = coberturaPorConta([emp(1, '347', '1500', 700000, 'CRAS3')], CONTAS, info, quadro);
  assert.equal(r.propostas[0].fonte, '1500');
  assert.equal(r.sugestoes.length, 1);
  const s = r.sugestoes[0];
  assert.equal(s.conta, 'cras');
  assert.deepEqual(s.servidores, [{ nome: 'ANA LIMA', bruto: 300000 }]);
  assert.equal(s.valor, 300000);
  assert.equal(s.outros, 1);
  assert.equal(s.cabe, true);
});

t('conta livre paga qualquer empenho cuja ficha admita a fonte, até o saldo', () => {
  const contas = [{ id: 'sus', nome: 'Custeio SUS', fonte: '1600', saldo: 1000000 }];
  const r = coberturaPorConta([emp(1, '227', '1500', 600000, 'AB1'), emp(2, '227', '1500', 500000, 'AB2'), emp(3, '227', '1500', 300000, 'AB3'),
    emp(4, '65', '1500', 100000, 'ADM')], contas, info, null);
  assert.deepEqual(r.propostas.map(p => p.fonte), ['1600', '1002', '1600', '1500']);
  assert.equal(r.uso[0].sobra, 100000);
});

t('conta por fichas: só os empenhos dessas fichas', () => {
  const contas = [{ id: 'emenda', nome: 'Emenda', fonte: '1600', saldo: 9000000, podePagar: '226, 227' }];
  const r = coberturaPorConta([emp(1, '227', '1500', 100000, 'AB'), emp(2, '235', '1500', 100000, 'FARM')], contas, info, null);
  assert.deepEqual(r.propostas.map(p => p.fonte), ['1600', '1500']);
});

t('as contas mais específicas são usadas primeiro', () => {
  // A conta livre 1660 viria primeiro na lista, mas a do CRAS (por nome) tem prioridade.
  const contas = [{ id: 'livre', nome: 'FNAS livre', fonte: '1660', saldo: 1000000 }, CONTAS[0]];
  const r = coberturaPorConta([emp(1, '347', '1500', 730000, 'CRAS')], contas, info, QUADRO);
  assert.equal(r.propostas[0].conta, 'cras');
});

t('sem a folha nominal, conta por nomes avisa e não decide', () => {
  const r = coberturaPorConta([emp(1, '347', '1500', 730000, 'CRAS')], [CONTAS[0]], info, null);
  assert.equal(r.propostas[0].fonte, '1500');
  assert.match(r.avisos[0], /Folha de pagamento \(nominal\)/);
});

t('FUNDEB sem saldo vai para a ficha espelho em recurso próprio', () => {
  const contas = [{ id: 'fundeb', nome: 'FUNDEB', fonte: '1540', saldo: 100000 }];
  const r = coberturaPorConta([emp(1, '174', '1540', 600000, 'EF')], contas, info, null);
  assert.deepEqual([r.propostas[0].ficha, r.propostas[0].fonte], ['125', '1001']);
});

t('nome da lista que não está na folha, ou que é de mais de um servidor, vai para conferência', () => {
  const contas = [{ id: 'x', nome: 'Farmácia', fonte: '1621', saldo: 100, podePagar: 'Zélia, Ana' }];
  const r = coberturaPorConta([], contas, info, QUADRO);
  assert.deepEqual(r.conferencia.map(c => [c.nome, c.achados.length]), [['Zélia', 0], ['Ana', 2]]);
});

console.log(`folha-cobertura: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
