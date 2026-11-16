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
  pagamentosConsignados } from '../assets/js/folha-empenhos.js';

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
const empenhosDe = arquivos => prepararEmpenhos(descontarFolhasProprias(arquivos).arquivos, 1, {}, {}).empenhos;

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

t('folha sem consignado devolve lista vazia, não erro', () => {
  const men = arquivo('principal', [linhas('001.001.001.00002', SALARIO, [['201', 'I.N.S.S.', 50000]])]);
  const p = pagamentosConsignados(empenhosDe([men]));
  assert.deepEqual(p.destinos, []);
  assert.equal(p.total, 0);
  assert.deepEqual(pagamentosConsignados([]).destinos, []);
  assert.deepEqual(pagamentosConsignados().destinos, []);
});

console.log(`folha-consignados: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
