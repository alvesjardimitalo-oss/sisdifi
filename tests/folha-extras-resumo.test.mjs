// Extras do rodapé do Resumo de Verbas e o fechamento do empenho.
//
// O rodapé de cada lotação lista, uma linha por tipo, os proventos que NÃO
// entram no "VALOR BRUTO DO EMPENHO" mas entram no "TOTAL BRUTO DE PROVENTOS".
// Eles se dividem em dois destinos, e a diferença é dinheiro:
//
//   somados ao empenho orçamentário : 358 diferença de salário extra folha
//                                     344 complementação do piso da enfermagem
//   em ordem de pagamento própria   : 163 salário-maternidade (INSS)
//                                     164 salário-família
//                                     361 auxílio-natalidade
//
// As duas primeiras já foram pagas na extra folha do dia 10; a folha mensal
// traz o provento inteiro para apurar INSS e IR sobre a base cheia e devolve o
// que já saiu pela rubrica 174 negativa. Por isso somam ao empenho.
//
// Os números deste teste vêm da competência outubro/2026 conferida linha a
// linha contra a planilha da Contabilidade.
import assert from 'node:assert/strict';
import { analisarResumoVerbas, prepararEmpenhos, somaExtras, EXTRAS_DO_RESUMO } from '../assets/js/folha-empenhos.js';

let ok = 0; const falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };

/** Uma lotação do resumo, no formato que o pdf.js entrega. */
function lotacao({ codigo, nome, fixa = [], extras = [], descontos = [] }) {
  // O cabeçalho se repete a cada página do relatório do RH.
  const l = ['MUNICÍPIO: FREI INOCENCIO', 'RESUMO DE VERBAS', 'REFERENCIA: OUTUBRO/2026',
             'TIPO CÁLCULO: 01-FOLHA MENSAL/05-DÉCIMO', 'VERBA DESCRIÇÃO VALOR'];
  l.push('LOTAÇÃO...: ' + codigo);
  l.push('PREF. MUNIC. DE FREI INOCENCIO');
  l.push('SECRETARIA MUNIC. DE EDUCACAO');
  l.push(nome);
  l.push('CLASSIFICAÇÃO CONTÁBIL: 0 - FIXA');
  for (const [c, d, v] of fixa) l.push(`${c} ${d} ${v}`);
  const soma = a => a.reduce((s, [, , v]) => s + Number(v.replace(/\./g, '').replace(',', '.')), 0);
  l.push('TOTAL DA CLASSIFICAÇÃO: ' + soma(fixa).toFixed(2).replace('.', ','));
  if (extras.length) {
    l.push('CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS');
    for (const [c, d, v] of extras) l.push(`${c} ${d} ${v}`);
    l.push('TOTAL DA CLASSIFICAÇÃO: ' + soma(extras).toFixed(2).replace('.', ','));
  }
  l.push('CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS');
  for (const [c, d, v] of descontos) l.push(`${c} ${d} ${v}`);
  l.push('TOTAL DA CLASSIFICAÇÃO: ' + soma(descontos).toFixed(2).replace('.', ','));
  const brl = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const bruto = soma(fixa), ex = soma(extras), desc = soma(descontos);
  l.push('TOTAL BRUTO DE PROVENTOS...........: ' + brl(bruto + ex));
  l.push('TOTAL BRUTO DE DESCONTOS...........: ' + brl(desc));
  l.push('TOTAL LÍQUIDO......................: ' + brl(bruto + ex - desc));
  l.push('TOTAL GERAL DE PROVENTOS...........: ' + brl(bruto));
  l.push('VALOR BRUTO DO EMPENHO.............: ' + brl(bruto));
  l.push('VALOR DO DESCONTO NA LIQUIDAÇÃO....: ' + brl(desc));
  l.push('VALOR LIQUIDO DO EMPENHO...........: ' + brl(bruto - desc));
  for (const [, d, v] of extras) l.push(d.padEnd(34, '.') + ': ' + v);
  return l.map(texto => ({ texto, pagina: 1 }));
}

// Creche 70%, contratados: duas servidoras em maternidade e salário-família.
const CRECHE = lotacao({
  codigo: '002.004.215.00001', nome: 'PESSOAL CONTRATADO',
  fixa: [['100', 'VENCIMENTO MENSAL', '61.419,53'], ['229', 'SALARIO MATERNIDADE PRORROG.', '1.366,48'],
         ['384', 'RETRO DIF DE SAL DO FUNDEB', '10.510,45']],
  extras: [['163', 'SALARIO MATERNIDADE INSS', '2.198,26'], ['164', 'SALARIO FAMILIA', '1.013,10']],
  descontos: [['201', 'I.N.S.S.', '5.746,13'], ['204', 'IMPOSTO DE RENDA', '773,75']]
});

// Ensino Infantil 70%: pagamento já efetuado na extra folha do dia 10.
const EX_FOLHA = lotacao({
  codigo: '002.004.219.00004', nome: 'EFETIVOS',
  fixa: [['100', 'VENCIMENTO MENSAL', '115.239,07'], ['174', 'PAGAMENTO EFETUADO/EXTRA', '-3.233,19']],
  extras: [['358', 'DIFERENÇA SALARIO EX.FOLHA', '3.233,19']],
  descontos: [['201', 'I.N.S.S.', '9.181,59'], ['204', 'IMPOSTO DE RENDA', '7.647,01'],
              ['221', 'EMPRÉSTIMO CAIXA', '2.960,84'], ['222', 'EMPRÉSTIMO CAIXA 2', '589,41'],
              ['223', 'EMPRÉSTIMO CAIXA 3', '56,31'], ['226', 'EMPRÉSTIMO SICOOB', '1.509,00'],
              ['228', 'EMPRÉSTIMO SICOOB 2', '885,05'], ['355', 'EMPRESTIMO SICOOB 3', '422,89']]
});

t('reconhece as cinco extras do rodapé', () => {
  assert.deepEqual([...EXTRAS_DO_RESUMO].sort(),
    ['enfermagem', 'exFolha', 'familia', 'maternidade', 'natalidade']);
});

t('lê salário-maternidade e salário-família do rodapé', () => {
  const a = analisarResumoVerbas(CRECHE, { tipo: 'principal', nome: 'x' });
  const g = a.registros[0];
  assert.equal(g.valores.maternidade, 219826);
  assert.equal(g.valores.familia, 101310);
  assert.equal(g.extrasEmOP, 321136);
  assert.equal(g.extrasNoEmpenho, 0);
});

t('lê a diferença de salário extra folha, que antes passava em branco', () => {
  const a = analisarResumoVerbas(EX_FOLHA, { tipo: 'principal', nome: 'x' });
  const g = a.registros[0];
  assert.equal(g.valores.exFolha, 323319);
  assert.equal(g.extrasNoEmpenho, 323319, 'soma ao empenho, não vira ordem de pagamento');
  assert.equal(g.extrasEmOP, 0);
});

// Esta é a identidade que impede uma extra desconhecida de sumir: os demais
// totais do rodapé fecham entre si mesmo quando falta uma linha, então sem
// este teste a perda seria silenciosa.
t('o bruto do empenho mais as extras tem de dar o total bruto de proventos', () => {
  for (const linhas of [CRECHE, EX_FOLHA]) {
    const g = analisarResumoVerbas(linhas, { tipo: 'principal', nome: 'x' }).registros[0];
    assert.equal(g.valores.proventos, g.valores.bruto + somaExtras(g.valores));
  }
});

t('extra não reconhecida é denunciada, não ignorada', () => {
  const comDesconhecida = lotacao({
    codigo: '002.004.215.00001', nome: 'PESSOAL CONTRATADO',
    fixa: [['100', 'VENCIMENTO MENSAL', '10.000,00']],
    extras: [['999', 'BENEFICIO QUE NAO EXISTE', '500,00']],
    descontos: [['201', 'I.N.S.S.', '1.000,00']]
  });
  const a = analisarResumoVerbas(comDesconhecida, { tipo: 'principal', nome: 'x' });
  assert.ok(a.avisos.some(x => /não é o bruto do empenho mais as extras/.test(x)),
    'avisos: ' + a.avisos.join(' | '));
});

// --- fechamento ---
t('empenho mais ordens de pagamento fecha com o total líquido do resumo', () => {
  const a = analisarResumoVerbas([...CRECHE, ...EX_FOLHA], { tipo: 'principal', nome: 'x' });
  const ajustes = { 'principal|002.004.215.00001': { confirmado: true, inssExtra: 27218 } };
  const r = prepararEmpenhos([a], 4950, {}, ajustes);
  assert.equal(r.totalLiquido + r.totalLiquidoExtras, r.totalLiquidoResumo);
  // Creche 73.296,46 + 3.211,36 - 6.519,88 = 69.987,94
  // Infantil 112.005,88 + 3.233,19 - 23.252,10 = 91.986,97
  assert.equal(r.totalLiquidoResumo, 6998794 + 9198697);
});

t('o bruto do empenho carrega a diferença extra folha', () => {
  const a = analisarResumoVerbas(EX_FOLHA, { tipo: 'principal', nome: 'x' });
  const e = prepararEmpenhos([a], 4954, {}, {}).empenhos[0];
  assert.equal(e.brutoRH, 11200588, 'o RH empenha 112.005,88');
  assert.equal(e.bruto, 11523907, 'a Contabilidade soma os 3.233,19 já pagos no dia 10');
});

t('o líquido do empenho é só o orçamentário', () => {
  const a = analisarResumoVerbas(CRECHE, { tipo: 'principal', nome: 'x' });
  const ajustes = { 'principal|002.004.215.00001': { confirmado: true, inssExtra: 27218 } };
  const e = prepararEmpenhos([a], 4950, {}, ajustes).empenhos[0];
  assert.equal(e.descontoAjustado, 651988 - 27218, 'o INSS da maternidade sai do desconto');
  assert.equal(e.liquido, 7329646 - 624770);
});

t('auxílio-natalidade vira ordem de pagamento própria', () => {
  const linhas = lotacao({
    codigo: '002.009.267.00008', nome: 'COMISSIONADOS',
    fixa: [['100', 'VENCIMENTO MENSAL', '10.000,00']],
    extras: [['361', 'AUXILIO NATALIDADE', '1.621,00']],
    descontos: [['201', 'I.N.S.S.', '1.000,00']]
  });
  const a = analisarResumoVerbas(linhas, { tipo: 'principal', nome: 'x' });
  assert.equal(a.registros[0].valores.natalidade, 162100);
  const r = prepararEmpenhos([a], 5003, {}, {});
  const op = r.extras.find(x => x.tipo === 'Auxílio-natalidade');
  assert.ok(op, 'OPs: ' + r.extras.map(x => x.tipo).join(', '));
  assert.equal(op.bruto, 162100);
  assert.equal(op.liquido, 162100, 'não tem desconto');
  assert.equal(r.empenhos[0].bruto, 1000000, 'não entra no empenho orçamentário');
});

t('o INSS da maternidade move dinheiro de documento, não muda o total', () => {
  const a = analisarResumoVerbas(CRECHE, { tipo: 'principal', nome: 'x' });
  const com = prepararEmpenhos([a], 4950, {}, { 'principal|002.004.215.00001': { confirmado: true, inssExtra: 27218 } });
  const sem = prepararEmpenhos([a], 4950, {}, {});
  assert.equal(com.totalLiquido + com.totalLiquidoExtras, sem.totalLiquido + sem.totalLiquidoExtras);
  assert.equal(com.totalLiquido, sem.totalLiquido + 27218, 'o empenho cresce');
  assert.equal(com.totalLiquidoExtras, sem.totalLiquidoExtras - 27218, 'a OP encolhe no mesmo valor');
});

console.log(`folha-extras-resumo: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
