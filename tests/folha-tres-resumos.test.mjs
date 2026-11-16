// Folha mensal, 13º e rescisão: três relatórios, um só dinheiro.
//
// O RH entrega três resumos por competência (TIPO CÁLCULO 01, 05 e 06). O da
// folha MENSAL já inclui o 13º e a rescisão — os outros dois são o detalhamento
// do que está lá dentro, não um acréscimo. Empenhar os três como vieram contaria
// o mesmo dinheiro duas vezes.
//
// Outubro/2026, conferido contra a planilha da Contabilidade:
//   mensal     R$ 1.989.381,67   93 lotações
//   13º        R$    41.574,46   13 lotações
//   rescisão   R$    21.967,83    8 lotações
//   folha      R$ 1.925.839,38   92 lotações  (mensal menos os outros dois)
//   empenhos                     113 = 92 + 13 + 8
import assert from 'node:assert/strict';
import { analisarResumoVerbas, descontarFolhasProprias, prepararEmpenhos } from '../assets/js/folha-empenhos.js';

let ok = 0; const falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };

const brl = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const val = v => Number(String(v).replace(/\./g, '').replace(',', '.'));

/** Monta um resumo do RH com uma ou mais lotações. */
function resumo(tipoCalculo, lotacoes) {
  const l = [];
  for (const { codigo, nome, fixa = [], extras = [], descontos = [] } of lotacoes) {
    l.push('MUNICÍPIO: FREI INOCENCIO', 'RESUMO DE VERBAS', 'REFERENCIA: OUTUBRO/2026',
           'TIPO CÁLCULO: ' + tipoCalculo, 'VERBA DESCRIÇÃO VALOR');
    l.push('LOTAÇÃO...: ' + codigo, 'PREF. MUNIC. DE FREI INOCENCIO', 'SECRETARIA MUNIC. DE EDUCACAO', nome);
    const soma = a => a.reduce((s, [, , v]) => s + val(v), 0);
    l.push('CLASSIFICAÇÃO CONTÁBIL: 0 - FIXA');
    for (const [c, d, v] of fixa) l.push(`${c} ${d} ${v}`);
    l.push('TOTAL DA CLASSIFICAÇÃO: ' + brl(soma(fixa)));
    if (extras.length) {
      l.push('CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS');
      for (const [c, d, v] of extras) l.push(`${c} ${d} ${v}`);
      l.push('TOTAL DA CLASSIFICAÇÃO: ' + brl(soma(extras)));
    }
    l.push('CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS');
    for (const [c, d, v] of descontos) l.push(`${c} ${d} ${v}`);
    l.push('TOTAL DA CLASSIFICAÇÃO: ' + brl(soma(descontos)));
    const b = soma(fixa), e = soma(extras), d = soma(descontos);
    l.push('TOTAL BRUTO DE PROVENTOS...........: ' + brl(b + e));
    l.push('TOTAL BRUTO DE DESCONTOS...........: ' + brl(d));
    l.push('TOTAL LÍQUIDO......................: ' + brl(b + e - d));
    l.push('TOTAL GERAL DE PROVENTOS...........: ' + brl(b));
    l.push('VALOR BRUTO DO EMPENHO.............: ' + brl(b));
    l.push('VALOR DO DESCONTO NA LIQUIDAÇÃO....: ' + brl(d));
    l.push('VALOR LIQUIDO DO EMPENHO...........: ' + brl(b - d));
    for (const [, dsc, v] of extras) l.push(dsc.padEnd(34, '.') + ': ' + v);
  }
  return l.map(texto => ({ texto, pagina: 1 }));
}

// A lotação A tem folha, 13º e rescisão; a B é SÓ rescisão.
const MENSAL = resumo('01-FOLHA MENSAL/05-DÉCIMO', [
  { codigo: '002.004.217.00001', nome: 'PESSOAL CONTRATADO',
    fixa: [['100', 'VENCIMENTO MENSAL', '10.000,00'], ['150', 'ADIANTAMENTO 13SALARIO', '2.000,00']],
    extras: [['164', 'SALARIO FAMILIA', '135,08']],
    descontos: [['201', 'I.N.S.S.', '800,00']] },
  { codigo: '002.002.205.00001', nome: 'PESSOAL CONTRATADO',
    fixa: [['100', 'VENCIMENTO MENSAL', '1.621,00']],
    descontos: [['201', 'I.N.S.S.', '121,57']] }
]);
const DECIMO = resumo('05-DÉCIMO TERCEIRO SALÁRIO', [
  { codigo: '002.004.217.00001', nome: 'PESSOAL CONTRATADO',
    fixa: [['150', 'ADIANTAMENTO 13SALARIO', '2.000,00']], descontos: [] }
]);
const RESCISAO = resumo('06-RESCISÃO CONTRATUAL', [
  { codigo: '002.004.217.00001', nome: 'PESSOAL CONTRATADO',
    fixa: [['100', 'VENCIMENTO MENSAL', '1.500,00']],
    extras: [['164', 'SALARIO FAMILIA', '135,08']],
    descontos: [['201', 'I.N.S.S.', '120,00']] },
  { codigo: '002.002.205.00001', nome: 'PESSOAL CONTRATADO',
    fixa: [['100', 'VENCIMENTO MENSAL', '1.621,00']],
    descontos: [['201', 'I.N.S.S.', '121,57']] }
]);

const ler = (linhas, tipo) => analisarResumoVerbas(linhas, { tipo, nome: tipo });

t('o tipo de cálculo do cabeçalho identifica cada arquivo', () => {
  assert.equal(ler(MENSAL, 'principal').tipo, 'principal');
  assert.equal(ler(DECIMO, 'decimo').tipo, 'decimo');
  assert.equal(ler(RESCISAO, 'rescisao').tipo, 'rescisao');
});

t('o 13º e a rescisão são descontados do mensal, não somados', () => {
  const r = descontarFolhasProprias([ler(MENSAL, 'principal'), ler(DECIMO, 'decimo'), ler(RESCISAO, 'rescisao')]);
  assert.equal(r.descontados, 3);
  assert.deepEqual(r.avisos, []);
  const folha = r.arquivos.find(a => a.tipo === 'principal');
  const a = folha.registros.find(x => x.lotacao === '002.004.217.00001');
  assert.equal(a.valores.bruto, 1200000 - 200000 - 150000, 'tira o 13º e a rescisão');
  assert.equal(a.valores.desconto, 80000 - 12000);
  assert.equal(a.valores.familia, 13508 - 13508, 'a família da rescisão sai junto');
});

t('lotação que era só rescisão não sobra na folha', () => {
  const r = descontarFolhasProprias([ler(MENSAL, 'principal'), ler(DECIMO, 'decimo'), ler(RESCISAO, 'rescisao')]);
  const folha = r.arquivos.find(a => a.tipo === 'principal');
  assert.equal(folha.registros.length, 1, 'de duas lotações, uma zerou');
  assert.ok(!folha.registros.some(x => x.lotacao === '002.002.205.00001'));
});

t('os três tipos viram empenhos próprios, na ordem', () => {
  const r = descontarFolhasProprias([ler(MENSAL, 'principal'), ler(DECIMO, 'decimo'), ler(RESCISAO, 'rescisao')]);
  const e = prepararEmpenhos(r.arquivos, 4912, {}, {});
  assert.deepEqual(e.empenhos.map(x => x.tipo), ['principal', 'decimo', 'rescisao', 'rescisao']);
  assert.deepEqual(e.empenhos.map(x => x.empenho), [4912, 4913, 4914, 4915]);
});

// Sem descontar, o mesmo dinheiro seria empenhado duas vezes.
t('somar os três sem descontar inflaria o bruto', () => {
  const semDescontar = prepararEmpenhos(
    [ler(MENSAL, 'principal'), ler(DECIMO, 'decimo'), ler(RESCISAO, 'rescisao')], 4912, {}, {});
  const r = descontarFolhasProprias([ler(MENSAL, 'principal'), ler(DECIMO, 'decimo'), ler(RESCISAO, 'rescisao')]);
  const certo = prepararEmpenhos(r.arquivos, 4912, {}, {});
  assert.equal(semDescontar.totalBruto - certo.totalBruto, 200000 + 150000 + 162100,
    'a diferença é exatamente o 13º e as duas rescisões contados em dobro');
});

t('o bruto total depois de descontar é o do mensal', () => {
  const mensal = ler(MENSAL, 'principal');
  const bruto = mensal.registros.reduce((s, x) => s + x.valores.bruto, 0);
  const r = descontarFolhasProprias([mensal, ler(DECIMO, 'decimo'), ler(RESCISAO, 'rescisao')]);
  const e = prepararEmpenhos(r.arquivos, 4912, {}, {});
  assert.equal(e.totalBruto, bruto, 'nada se perde e nada se duplica');
});

t('empenhos mais ordens de pagamento fecham com o total líquido', () => {
  const r = descontarFolhasProprias([ler(MENSAL, 'principal'), ler(DECIMO, 'decimo'), ler(RESCISAO, 'rescisao')]);
  const e = prepararEmpenhos(r.arquivos, 4912, {}, {});
  assert.equal(e.totalLiquido + e.totalLiquidoExtras, e.totalLiquidoResumo);
});

// --- quando os arquivos não combinam ---
t('lotação do 13º ausente na folha mensal é denunciada', () => {
  const outra = resumo('05-DÉCIMO TERCEIRO SALÁRIO', [
    { codigo: '002.099.999.00001', nome: 'PESSOAL CONTRATADO',
      fixa: [['150', 'ADIANTAMENTO 13SALARIO', '500,00']], descontos: [] }
  ]);
  const r = descontarFolhasProprias([ler(MENSAL, 'principal'), ler(outra, 'decimo')]);
  assert.ok(r.avisos.some(a => /não na folha mensal/.test(a)), 'avisos: ' + r.avisos.join(' | '));
});

t('desconto maior que o mensal denuncia competência trocada', () => {
  const grande = resumo('06-RESCISÃO CONTRATUAL', [
    { codigo: '002.004.217.00001', nome: 'PESSOAL CONTRATADO',
      fixa: [['100', 'VENCIMENTO MENSAL', '99.000,00']], descontos: [] }
  ]);
  const r = descontarFolhasProprias([ler(MENSAL, 'principal'), ler(grande, 'rescisao')]);
  assert.ok(r.avisos.some(a => /negativo/.test(a)), 'avisos: ' + r.avisos.join(' | '));
});

t('sem os arquivos próprios nada é alterado', () => {
  const mensal = ler(MENSAL, 'principal');
  const r = descontarFolhasProprias([mensal]);
  assert.equal(r.descontados, 0);
  assert.equal(r.arquivos[0], mensal, 'o mesmo objeto, intocado');
});

console.log(`folha-tres-resumos: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
