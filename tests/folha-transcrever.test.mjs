// Assistente de transcrição: a sequência de digitação do empenho.
//
// A Contabilidade digita no sistema da Memory numa ordem fixa — número, ficha,
// fonte, bruto, histórico, depois a janela de liquidação com data e desconto,
// depois a distribuição do desconto, depois as ordens de pagamento, e por fim
// a conferência contra a folha. Os testes travam essa ordem, porque é o que
// faz o assistente servir para digitar em vez de só para auditar.
import assert from 'node:assert/strict';
// dinheiroFolha separa o "R$" com espaço não separável: os literais abaixo
// usam \u00A0 de propósito, senão a comparação falha por um caractere.
import { passosDoEmpenho, conferirEmpenho, montarHistorico, fichasOPpendentes,
  MODELO_HISTORICO_PADRAO, BLOCOS_HISTORICO } from '../assets/js/folha-transcrever.js';

let ok = 0; const falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };

const emp = (extra = {}) => ({ empenho: 4916, tipo: 'principal', lotacao: '002.002.204.00002',
  secretaria: 'ADMINISTRAÇÃO', vinculo: 'Efetivos', ficha: '56', fonte: '1500', desdobramento: '0000',
  bruto: 568566, descontoRH: 144873, descontoAjustado: 144873, liquido: 423693, liquidoRH: 437201,
  composicao: { Caixa: 100999, INSS: 43874 }, composicaoTotal: 144873, problemas: [], ...extra });
const op = (extra = {}) => ({ id: 'principal|002.002.204.00002|familia', empenhoReferencia: 4916,
  tipo: 'Salário-família', bruto: 13508, inss: 0, liquido: 13508, ...extra });
const grupos = ps => ps.map(p => p.grupo).filter((g, i, a) => g !== a[i-1]);
const achar = (ps, rotulo) => ps.find(p => p.rotulo === rotulo);

t('a ordem dos grupos é a da digitação no sistema', () => {
  const ps = passosDoEmpenho(emp(), [op()], { dataLiquidacao: '31/10/2026', competencia: '2026-10' });
  assert.deepEqual(grupos(ps), ['Empenho', 'Liquidação', 'Distribuição do desconto', 'Ordem de pagamento']);
});

t('os campos do empenho vêm na ordem em que são digitados', () => {
  const ps = passosDoEmpenho(emp(), [], { competencia: '2026-10' });
  assert.deepEqual(ps.filter(p => p.grupo === 'Empenho').map(p => p.rotulo),
    ['Número do empenho', 'Ficha', 'Fonte de recursos', 'Desdobramento', 'Valor bruto', 'Histórico']);
  assert.deepEqual(ps.filter(p => p.grupo === 'Liquidação').map(p => p.rotulo),
    ['Data da liquidação', 'Valor do desconto']);
});

t('os valores saem em reais, prontos para copiar', () => {
  const ps = passosDoEmpenho(emp(), [], { competencia: '2026-10' });
  assert.equal(achar(ps, 'Valor bruto').valor, 'R$\u00A05.685,66');
  assert.equal(achar(ps, 'Valor do desconto').valor, 'R$\u00A01.448,73');
  assert.equal(achar(ps, 'Número do empenho').valor, '4916');
  assert.ok(achar(ps, 'Valor bruto').copiavel);
});

// Campo que falta é diferente de campo que o sistema não tem como saber.
t('ficha e fonte em branco saem marcadas como faltando', () => {
  const ps = passosDoEmpenho(emp({ ficha: '', fonte: '' }), [], {});
  assert.ok(achar(ps, 'Ficha').faltando);
  assert.ok(achar(ps, 'Fonte de recursos').faltando);
});

t('sem data informada, a liquidação pede a data', () => {
  const ps = passosDoEmpenho(emp(), [], {});
  const data = achar(ps, 'Data da liquidação');
  assert.ok(data.informar);
  assert.ok(!data.copiavel);
  const com = passosDoEmpenho(emp(), [], { dataLiquidacao: '31/10/2026' });
  assert.ok(achar(com, 'Data da liquidação').copiavel);
});

// --- distribuição do desconto ---
t('a distribuição traz só o que tem valor, com a ficha extra', () => {
  const ps = passosDoEmpenho(emp(), [], {});
  const dist = ps.filter(p => p.grupo === 'Distribuição do desconto');
  assert.deepEqual(dist.map(p => [p.rotulo, p.valor, p.ficha]),
    [['Caixa Econômica', 'R$\u00A01.009,99', '21'], ['INSS', 'R$\u00A0438,74', '4']]);
  assert.ok(!dist.some(p => p.rotulo === 'Sicoob'), 'categoria zerada não aparece');
});

t('cada categoria sai com a ficha extra-orçamentária fixa', () => {
  const ps = passosDoEmpenho(emp({ composicao: { INSS: 100, IRRF: 200, Caixa: 300,
    Sicoob: 400, Bradesco: 500, Pensao: 600 }, composicaoTotal: 2100, descontoAjustado: 2100 }), [], {});
  assert.deepEqual(ps.filter(p => p.grupo === 'Distribuição do desconto').map(p => [p.rotulo, p.ficha]),
    [['Caixa Econômica','21'], ['Sicoob','41'], ['Bradesco','42'], ['Pensão alimentícia','8'],
     ['INSS','4'], ['Imposto de Renda','9']]);
});

t('categoria sem ficha extra cadastrada é marcada para informar', () => {
  const ps = passosDoEmpenho(emp({ composicao: { Outros: 23255 }, composicaoTotal: 23255,
    descontoAjustado: 23255 }), [], {});
  const o = achar(ps, 'Outros descontos');
  assert.ok(o.informar);
  assert.match(o.nota, /sem ficha extra/);
});

// --- ordens de pagamento ---
/* A ficha da OP é extra-orçamentária e fixa por tipo de benefício. O sistema
   repetia a ficha orçamentária do empenho, o que não serve: é informada. */
t('a OP pede a ficha extra por tipo e a guarda', () => {
  const ps = passosDoEmpenho(emp(), [op()], {});
  const f = achar(ps, 'Salário-família — ficha extra');
  assert.ok(f.informar);
  assert.match(f.nota, /vale para os próximos meses/);
  const com = passosDoEmpenho(emp(), [op()], { fichasOP: { 'Salário-família': '12' } });
  assert.equal(achar(com, 'Salário-família — ficha extra').valor, '12');
  assert.ok(achar(com, 'Salário-família — ficha extra').copiavel);
});

t('a OP sem desconto não pede desconto', () => {
  const ps = passosDoEmpenho(emp(), [op()], {});
  assert.deepEqual(ps.filter(p => p.grupo === 'Ordem de pagamento').map(p => p.rotulo),
    ['Salário-família — ficha extra', 'Salário-família — valor bruto', 'Salário-família — nº da OP']);
});

// O INSS da maternidade sai na própria OP, e é por isso que ela tem desconto.
t('a OP de maternidade pede o desconto do INSS', () => {
  const ps = passosDoEmpenho(emp(), [op({ tipo: 'Salário-maternidade', bruto: 219826, inss: 27218,
    liquido: 192608, id: 'x|mat' })], {});
  assert.deepEqual(ps.filter(p => p.grupo === 'Ordem de pagamento').map(p => p.rotulo),
    ['Salário-maternidade — ficha extra', 'Salário-maternidade — valor bruto',
     'Salário-maternidade — desconto (INSS)', 'Salário-maternidade — nº da OP']);
  assert.equal(achar(ps, 'Salário-maternidade — desconto (INSS)').valor, 'R$\u00A0272,18');
});

t('o nº da OP é informado e volta quando já atribuído', () => {
  const ps = passosDoEmpenho(emp(), [op()], {});
  const n = achar(ps, 'Salário-família — nº da OP');
  assert.ok(n.informar);
  assert.equal(n.chaveOP, 'principal|002.002.204.00002|familia');
  const com = passosDoEmpenho(emp(), [op()], { numerosOP: { 'principal|002.002.204.00002|familia': '460' } });
  assert.equal(achar(com, 'Salário-família — nº da OP').valor, '460');
});

t('duas OPs no mesmo empenho saem em sequência', () => {
  const ps = passosDoEmpenho(emp(), [op(), op({ tipo: 'Salário-maternidade', id: 'y|mat', bruto: 1000 })], {});
  const tipos = ps.filter(p => p.grupo === 'Ordem de pagamento').map(p => p.rotulo.split(' — ')[0]);
  assert.deepEqual([...new Set(tipos)], ['Salário-família', 'Salário-maternidade']);
});

t('fichasOPpendentes lista os tipos sem ficha, sem repetir', () => {
  const extras = [op(), op({ id: 'b' }), op({ tipo: 'Salário-maternidade', id: 'c' })];
  assert.deepEqual(fichasOPpendentes(extras, {}), ['Salário-família', 'Salário-maternidade']);
  assert.deepEqual(fichasOPpendentes(extras, { 'Salário-família': '12' }), ['Salário-maternidade']);
  assert.deepEqual(fichasOPpendentes(), []);
});

// --- histórico ---
t('o histórico preenche o modelo', () => {
  const h = montarHistorico(MODELO_HISTORICO_PADRAO, emp(), '2026-10');
  assert.equal(h, 'FOLHA DE PAGAMENTO REFERENTE AO MÊS DE OUTUBRO DE 2026 - EFETIVOS - ADMINISTRAÇÃO.');
});

t('cada bloco tem o seu nome no histórico', () => {
  for (const [tipo, nome] of Object.entries(BLOCOS_HISTORICO)) {
    const h = montarHistorico('{bloco}', emp({ tipo }), '2026-10');
    assert.equal(h, nome);
  }
});

// Marca que não existe não pode ir para o sistema como "{xyz}".
t('marca desconhecida não vaza para o histórico', () => {
  assert.equal(montarHistorico('FOLHA {xyz} DE {mes}', emp(), '2026-10'), 'FOLHA DE OUTUBRO');
});

t('campo vazio não deixa traço solto nem espaço duplo', () => {
  const h = montarHistorico('{bloco} - {vinculo} - {secretaria}.', emp({ vinculo: '', secretaria: '' }), '2026-10');
  assert.equal(h, 'FOLHA DE PAGAMENTO.');
});

t('modelo próprio é respeitado', () => {
  assert.equal(montarHistorico('PAGAMENTO {mes_numero}/{ano} LOT {lotacao}', emp(), '2026-10'),
    'PAGAMENTO 10/2026 LOT 002.002.204.00002');
});

// --- conferência ---
/* O total que sai pelo empenho é o líquido dele mais o das OPs — é assim que a
   planilha da Contabilidade soma, e é o que tem de bater com a folha. */
t('a conferência fecha empenho mais OPs contra a folha', () => {
  const c = conferirEmpenho(emp(), [op()]);
  assert.equal(c.liquidoLinha, 437201);
  assert.equal(c.daFolha, 437201);
  assert.ok(c.bateu);
  assert.deepEqual(c.problemas, []);
  assert.deepEqual(c.linhas.map(l => l.rotulo), ['Bruto do empenho', 'Desconto na liquidação',
    'Líquido do empenho', 'Ordens de pagamento (líquido)', 'Total que sai por este empenho']);
  assert.equal(c.linhas[1].valor, -144873, 'o desconto entra negativo, como se lê numa conta');
});

t('empenho sem OP não mostra linha de OP', () => {
  const c = conferirEmpenho(emp({ liquidoRH: 423693 }), []);
  assert.deepEqual(c.linhas.map(l => l.rotulo), ['Bruto do empenho', 'Desconto na liquidação',
    'Líquido do empenho', 'Total que sai por este empenho']);
  assert.ok(c.bateu);
});

t('distribuição que não soma o desconto é denunciada', () => {
  const c = conferirEmpenho(emp({ composicao: { INSS: 43874 }, composicaoTotal: 43874 }), [op()]);
  assert.ok(!c.bateu);
  assert.match(c.problemas[0], /distribuição do desconto soma/);
  assert.match(c.problemas[0], /438,74/);
});

t('total que não casa com a folha é denunciado', () => {
  const c = conferirEmpenho(emp({ liquidoRH: 500000 }), [op()]);
  assert.ok(!c.bateu);
  assert.match(c.problemas[0], /a folha traz/);
});

// "Não bateu" é conta que não fecha; pendência é campo a preencher.
t('pendência de preenchimento não é tratada como diferença', () => {
  const c = conferirEmpenho(emp({ problemas: ['Escolher a fonte de recursos'] }), [op()]);
  assert.ok(c.bateu, 'a conta fecha');
  assert.deepEqual(c.problemas, []);
  assert.deepEqual(c.pendencias, ['Escolher a fonte de recursos']);
});

t('sem líquido da folha não inventa diferença', () => {
  const c = conferirEmpenho(emp({ liquidoRH: null }), [op()]);
  assert.equal(c.daFolha, null);
  assert.ok(c.bateu);
});

t('empenho vazio não quebra', () => {
  const c = conferirEmpenho();
  assert.equal(c.liquidoLinha, 0);
  assert.deepEqual(passosDoEmpenho().filter(p => p.grupo === 'Ordem de pagamento'), []);
});

console.log(`folha-transcrever: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
