// Consignados: quanto vai para cada destino, e de quais rubricas.
//
// O repasse sai do desconto da folha. Dois riscos de pagar errado:
//  1. dupla contagem — a folha mensal já contém o 13º e a rescisão, então um
//     empréstimo descontado na rescisão entraria duas vezes;
//  2. total único de pensão — a pensão é uma OP só, com uma liquidação por
//     pensão e o beneficiário no histórico, então um valor só não diz quantas
//     liquidações fazer.
import assert from 'node:assert/strict';
import { analisarResumoVerbas, descontarFolhasProprias, prepararEmpenhos,
  pagamentosConsignados, FICHAS_EXTRA_ORCAMENTARIAS } from '../assets/js/folha-empenhos.js';

let ok = 0; const falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };

// Monta um resumo de verbas no layout que o RH imprime: a lotação, a
// hierarquia, e as rubricas separadas por classificação contábil.
const cent = v => (v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const linhas = (lotacao, proventos, descontos) => {
  const p = proventos.reduce((n, r) => n + r[2], 0);
  const d = descontos.reduce((n, r) => n + r[2], 0);
  return ['LOTAÇÃO...: ' + lotacao,
    'PREF. MUNIC. DE FREI INOCENCIO', 'SECRETARIA MUNIC. DE TESTE', 'ACAO DE TESTE', 'PESSOAL EFETIVO',
    'CLASSIFICAÇÃO CONTÁBIL: 0 - FIXA',
    ...proventos.map(([cod, desc, v]) => cod + ' ' + desc + ' ' + cent(v)),
    'TOTAL DA CLASSIFICAÇÃO: ' + cent(p),
    'CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS',
    ...descontos.map(([cod, desc, v]) => cod + ' ' + desc + ' ' + cent(v)),
    'TOTAL DA CLASSIFICAÇÃO: ' + cent(d),
    'TOTAL BRUTO DE PROVENTOS...........: ' + cent(p),
    'TOTAL BRUTO DE DESCONTOS...........: ' + cent(d),
    'TOTAL LÍQUIDO......................: ' + cent(p - d),
    'TOTAL GERAL DE PROVENTOS...........: ' + cent(p),
    'VALOR BRUTO DO EMPENHO.............: ' + cent(p),
    'VALOR DO DESCONTO NA LIQUIDAÇÃO....: ' + cent(d),
    'VALOR LIQUIDO DO EMPENHO...........: ' + cent(p - d)];
};
const arquivo = (tipo, blocos) => analisarResumoVerbas(
  [{ pagina: 1, texto: 'TIPO CÁLCULO: ' + (tipo === 'decimo' ? '05-DÉCIMO' : tipo === 'rescisao' ? '06-RESCISÃO' : '01-FOLHA MENSAL') },
    ...blocos.flat().map(texto => ({ pagina: 1, texto }))],
  { tipo, nome: tipo });
const empenhosDe = (arquivos, mapa = {}) =>
  prepararEmpenhos(descontarFolhasProprias(arquivos).arquivos, 1, mapa, {}).empenhos;

const SALARIO = [['101', 'VENCIMENTO', 500000]];

t('soma cada banco e diz como se paga', () => {
  const men = arquivo('principal', [linhas('001.001.001.00002', SALARIO,
    [['221', 'EMPRÉSTIMO CAIXA', 30000], ['226', 'EMPRÉSTIMO SICOOB', 20000], ['352', 'EMPRESTIMO BRADESCO', 5000]])]);
  const p = pagamentosConsignados(empenhosDe([men]));
  const por = Object.fromEntries(p.destinos.map(d => [d.chave, d.valor]));
  assert.deepEqual(por, { Caixa: 30000, Sicoob: 20000, Bradesco: 5000 });
  assert.equal(p.total, 55000);
  assert.equal(p.destinos.find(d => d.chave === 'Caixa').forma, 'guia do banco');
});

t('soma os vários contratos do mesmo banco', () => {
  const men = arquivo('principal', [linhas('001.001.001.00002', SALARIO,
    [['221', 'EMPRÉSTIMO CAIXA', 30000], ['222', 'EMPRESTIMO CAIXA 2', 10000], ['223', 'EMPRESTIMO CAIXA 3', 2500]])]);
  const p = pagamentosConsignados(empenhosDe([men]));
  const caixa = p.destinos.find(d => d.chave === 'Caixa');
  assert.equal(caixa.valor, 42500);
  assert.equal(caixa.rubricas.length, 3, 'a guia é uma, mas a Contabilidade confere contrato por contrato');
  assert.deepEqual(caixa.rubricas.map(r => r.codigo), ['221', '222', '223'], 'do maior para o menor');
});

t('junta a mesma rubrica de empenhos diferentes e lista quais', () => {
  const men = arquivo('principal', [
    linhas('001.001.001.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 30000]]),
    linhas('001.001.002.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 12000]])]);
  const p = pagamentosConsignados(empenhosDe([men]));
  const r = p.destinos.find(d => d.chave === 'Caixa').rubricas[0];
  assert.equal(r.valor, 42000);
  assert.equal(r.empenhos.length, 2);
});

// O resumo mensal já contém a rescisão e o 13º. Sem deduzir as rubricas de
// desconto, o empréstimo da rescisão entra duas vezes e o banco recebe em dobro.
t('empréstimo descontado na rescisão não é pago duas vezes', () => {
  const men = arquivo('principal', [linhas('001.001.001.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 30000]])]);
  const res = arquivo('rescisao', [linhas('001.001.001.00002',
    [['101', 'VENCIMENTO', 100000]], [['221', 'EMPRÉSTIMO CAIXA', 8000]])]);
  const p = pagamentosConsignados(empenhosDe([men, res]));
  assert.equal(p.destinos.find(d => d.chave === 'Caixa').valor, 30000,
    'o mensal já continha os 80,00 da rescisão: o total do mês continua 300,00');
});

t('o INSS da rescisão também não dobra', () => {
  const men = arquivo('principal', [linhas('001.001.001.00002', SALARIO, [['201', 'I.N.S.S.', 50000]])]);
  const res = arquivo('rescisao', [linhas('001.001.001.00002',
    [['101', 'VENCIMENTO', 100000]], [['201', 'I.N.S.S.', 11000]])]);
  const total = empenhosDe([men, res]).reduce((s, e) => s + (e.composicao?.INSS || 0), 0);
  assert.equal(total, 50000);
});

t('rubrica que só existe na rescisão avisa em vez de zerar calado', () => {
  const men = arquivo('principal', [linhas('001.001.001.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 30000]])]);
  const res = arquivo('rescisao', [linhas('001.001.001.00002',
    [['101', 'VENCIMENTO', 100000]], [['226', 'EMPRÉSTIMO SICOOB', 7000]])]);
  const d = descontarFolhasProprias([men, res]);
  assert.equal(d.avisos.length, 1);
  assert.match(d.avisos[0], /226/);
  assert.match(d.avisos[0], /antes de pagar o consignado/);
});

// Cada pensão vai para um beneficiário diferente: um total só não dá para pagar.
t('pensão sai detalhada, porque é uma OP com várias liquidações', () => {
  const men = arquivo('principal', [linhas('001.001.001.00002', SALARIO,
    [['230', 'PENSAO JUDICIAL', 60000], ['232', 'PENSAO ALIMENTICIA (25%)', 25000]])]);
  const p = pagamentosConsignados(empenhosDe([men]));
  const pensao = p.destinos.find(d => d.chave === 'Pensao');
  assert.equal(pensao.valor, 85000);
  assert.equal(pensao.detalhar, true);
  assert.equal(pensao.forma, 'uma OP, com uma liquidação por pensão');
  assert.deepEqual(pensao.rubricas.map(r => r.valor), [60000, 25000]);
});

t('pagamento indevido a restituir não é repasse a terceiro', () => {
  const men = arquivo('principal', [linhas('001.001.001.00002', SALARIO,
    [['221', 'EMPRÉSTIMO CAIXA', 30000], ['242', 'DESCONTO DE PAG. INDEVIDO', 4000]])]);
  const p = pagamentosConsignados(empenhosDe([men]));
  assert.equal(p.total, 30000, 'o indevido não entra no total a repassar');
  assert.deepEqual(p.outros.map(r => [r.codigo, r.valor]), [['242', 4000]]);
});

t('destino sem desconto no mês não aparece na lista', () => {
  const men = arquivo('principal', [linhas('001.001.001.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 30000]])]);
  const p = pagamentosConsignados(empenhosDe([men]));
  assert.deepEqual(p.destinos.map(d => d.chave), ['Caixa'], 'não pede guia de banco que não descontou nada');
});

/* As fichas extra-orçamentárias são as mesmas todo mês: é por elas que a
   retenção sai do passivo quando o repasse é feito. */
/* A soma por destino tem de bater, mas a OP é feita por FONTE: a retenção sai
   da fonte em que a despesa foi empenhada. Então a Caixa com 43 mil pode virar
   quatro OPs — 20 mil na 1500, 15 mil na 1540, 5 mil na 1621, 3 mil na 1600. */
t('o destino sai aberto por fonte de recursos', () => {
  const men = arquivo('principal', [
    linhas('001.001.001.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 2000000]]),
    linhas('001.001.002.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 1500000]]),
    linhas('001.001.003.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 500000]]),
    linhas('001.001.004.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 300000]])]);
  const fontes = { 'principal|001.001.001.00002': { fonte: '1500' },
    'principal|001.001.002.00002': { fonte: '1540' },
    'principal|001.001.003.00002': { fonte: '1621' },
    'principal|001.001.004.00002': { fonte: '1600' } };
  const p = pagamentosConsignados(empenhosDe([men], fontes));
  const caixa = p.destinos.find(d => d.chave === 'Caixa');
  assert.equal(caixa.valor, 4300000, 'a soma do destino não muda');
  assert.deepEqual(caixa.porFonte.map(f => [f.fonte, f.valor]),
    [['1500', 2000000], ['1540', 1500000], ['1621', 500000], ['1600', 300000]],
    'da maior para a menor');
  assert.equal(p.ops, 4, 'quatro OPs, uma por fonte');
});

t('a soma das fontes fecha com o total do destino', () => {
  const men = arquivo('principal', [
    linhas('001.001.001.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 30000], ['201', 'I.N.S.S.', 50000]]),
    linhas('001.001.002.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 12000], ['201', 'I.N.S.S.', 20000]])]);
  const p = pagamentosConsignados(empenhosDe([men],
    { 'principal|001.001.001.00002': { fonte: '1500' }, 'principal|001.001.002.00002': { fonte: '1540' } }));
  for (const d of p.destinos)
    assert.equal(d.porFonte.reduce((n, f) => n + f.valor, 0), d.valor, d.nome);
  assert.equal(p.total, p.destinos.reduce((n, d) => n + d.valor, 0));
});

t('a mesma fonte em vários empenhos vira uma OP só', () => {
  const men = arquivo('principal', [
    linhas('001.001.001.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 30000]]),
    linhas('001.001.002.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 12000]])]);
  const p = pagamentosConsignados(empenhosDe([men],
    { 'principal|001.001.001.00002': { fonte: '1500' }, 'principal|001.001.002.00002': { fonte: '1500' } }));
  const caixa = p.destinos.find(d => d.chave === 'Caixa');
  assert.equal(caixa.porFonte.length, 1);
  assert.equal(caixa.porFonte[0].valor, 42000);
  assert.equal(caixa.porFonte[0].empenhos.length, 2, 'a OP sabe de quais empenhos veio');
});

// Sem a fonte não há como emitir a OP: somar em outra fonte seria pagar errado.
t('empenho sem fonte fica numa linha à parte, no fim', () => {
  const men = arquivo('principal', [
    linhas('001.001.001.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 30000]]),
    linhas('001.001.002.00002', SALARIO, [['221', 'EMPRÉSTIMO CAIXA', 12000]])]);
  const p = pagamentosConsignados(empenhosDe([men], { 'principal|001.001.001.00002': { fonte: '1500' } }));
  const caixa = p.destinos.find(d => d.chave === 'Caixa');
  assert.deepEqual(caixa.porFonte.map(f => [f.fonte, f.valor]), [['1500', 30000], ['', 12000]]);
  assert.equal(p.semFonte.length, 1);
  assert.equal(p.totalSemFonte, 12000);
  assert.equal(caixa.valor, 42000, 'o total do destino continua certo');
});

t('cada destino traz a ficha extra-orçamentária fixa', () => {
  const men = arquivo('principal', [linhas('001.001.001.00002', SALARIO,
    [['201', 'I.N.S.S.', 50000], ['204', 'IMPOSTO DE RENDA', 20000], ['230', 'PENSAO JUDICIAL', 10000],
     ['221', 'EMPRÉSTIMO CAIXA', 30000], ['226', 'EMPRÉSTIMO SICOOB', 20000], ['352', 'EMPRESTIMO BRADESCO', 5000]])]);
  const p = pagamentosConsignados(empenhosDe([men]));
  assert.deepEqual(Object.fromEntries(p.destinos.map(d => [d.chave, d.fichaExtra])),
    { INSS: '4', IRRF: '9', Pensao: '8', Caixa: '21', Sicoob: '41', Bradesco: '42' });
  assert.deepEqual(FICHAS_EXTRA_ORCAMENTARIAS,
    { INSS: '4', Pensao: '8', IRRF: '9', Caixa: '21', Sicoob: '41', Bradesco: '42' });
});

// Tributo tem prazo legal: vem antes da pensão e dos bancos.
t('os tributos aparecem primeiro na lista de repasse', () => {
  const men = arquivo('principal', [linhas('001.001.001.00002', SALARIO,
    [['221', 'EMPRÉSTIMO CAIXA', 30000], ['201', 'I.N.S.S.', 50000], ['204', 'IMPOSTO DE RENDA', 20000]])]);
  const p = pagamentosConsignados(empenhosDe([men]));
  assert.deepEqual(p.destinos.map(d => d.chave), ['INSS', 'IRRF', 'Caixa']);
  assert.equal(p.destinos[0].forma, 'guia da previdência (GPS)');
  assert.equal(p.destinos[1].forma, 'DARF');
  assert.equal(p.total, 100000);
});

t('folha sem desconto nenhum devolve lista vazia, não erro', () => {
  const men = arquivo('principal', [linhas('001.001.001.00002', SALARIO, [])]);
  const p = pagamentosConsignados(empenhosDe([men]));
  assert.deepEqual(p.destinos, []);
  assert.equal(p.total, 0);
  assert.deepEqual(pagamentosConsignados([]).destinos, []);
  assert.deepEqual(pagamentosConsignados().destinos, []);
});

console.log(`folha-consignados: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
