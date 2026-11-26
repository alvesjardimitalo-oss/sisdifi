// Fluxo em etapas da folha: saldo das contas, ficha/fonte/conta, confirmação
// e consignados por fonte levados para Consignações por mês.
import assert from 'node:assert/strict';
import {
  saldosDasContas, consignadosPorFonte, etapasDaFolha, normalizarFonte, contaParaFonte,
  previstoParaConsignacoes, compararPrevistoComMinutas, assinaturaDaFolha, avisosDaConta, novaContaId
} from '../assets/js/folha-fluxo.js';
import { analisarResumoVerbas, descontarFolhasProprias, prepararEmpenhos } from '../assets/js/folha-empenhos.js';

let ok = 0; const falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };

const emp = (n, extra = {}) => ({ id: 'principal|00' + n, empenho: 5000 + n, tipo: 'principal', lotacao: '002.00' + n,
  bruto: 100000, descontoAjustado: 10000, liquido: 90000, ficha: '10', fonte: '1.540.000.0000', contaId: 'c1',
  bancos: { Caixa: 0, Sicoob: 0, Bradesco: 0, Pensao: 0 }, problemas: [], ...extra });

t('fonte curta vira o código completo do orçamento', () => {
  assert.equal(normalizarFonte('1540'), '1.540.000.0000');
  assert.equal(normalizarFonte('15000000000'), '1.500.000.0000');
  assert.equal(normalizarFonte('1.500.000.0000'), '1.500.000.0000');
  assert.equal(normalizarFonte(''), '');
});

t('o bruto de cada empenho sai do saldo da conta, em ordem', () => {
  const contas = [{ id: 'c1', nome: 'FUNDEB 70%', fonte: '1540' }];
  const s = saldosDasContas(contas, { c1: 250000 }, [emp(0), emp(1), emp(2)]);
  assert.equal(s.contas[0].utilizado, 300000);
  assert.equal(s.contas[0].restante, -50000);
  assert.equal(s.apos['principal|000'], 150000);
  assert.equal(s.apos['principal|001'], 50000);
  assert.equal(s.apos['principal|002'], -50000);
  assert.equal(s.insuficientes.length, 1);
});

t('saldo vazio não é zero', () => {
  const s = saldosDasContas([{ id: 'c1', nome: 'X', fonte: '1500' }], {}, [emp(0)]);
  assert.equal(s.contas[0].restante, null);
  assert.equal(s.insuficientes.length, 0);
  assert.equal(s.semSaldo.length, 1);
});

t('empenho sem conta e com conta apagada são separados', () => {
  const s = saldosDasContas([{ id: 'c1', nome: 'X' }], { c1: 1 }, [emp(0, { contaId: '' }), emp(1, { contaId: 'c9' })]);
  assert.equal(s.semConta.length, 1);
  assert.equal(s.contaInexistente.length, 1);
});

t('fonte do empenho diferente da conta gera aviso', () => {
  assert.deepEqual(avisosDaConta(emp(0), { id: 'c1', fonte: '1540' }), []);
  assert.equal(avisosDaConta(emp(0), { id: 'c1', fonte: '1500' }).length, 1);
});

t('conta sugerida só quando a fonte é única', () => {
  const contas = [{ id: 'c1', fonte: '1540' }, { id: 'c2', fonte: '1500' }, { id: 'c3', fonte: '1500' }];
  assert.equal(contaParaFonte(contas, '1.540.000.0000').id, 'c1');
  assert.equal(contaParaFonte(contas, '1500'), null);
  assert.equal(novaContaId(contas), 'c4');
});

t('consignados somados por banco e fonte do empenho', () => {
  const lista = [
    emp(0, { bancos: { Caixa: 1000, Sicoob: 200, Bradesco: 0, Pensao: 50 } }),
    emp(1, { bancos: { Caixa: 500, Sicoob: 0, Bradesco: 0, Pensao: 0 } }),
    emp(2, { fonte: '1500', bancos: { Caixa: 300, Sicoob: 0, Bradesco: 0, Pensao: 0 } }),
    emp(3, { fonte: '', bancos: { Caixa: 0, Sicoob: 0, Bradesco: 70, Pensao: 0 } })
  ];
  const c = consignadosPorFonte(lista);
  const caixa540 = c.itens.find(g => g.destino === 'Caixa Econômica Federal' && g.fonteCompleta === '1.540.000.0000');
  assert.equal(caixa540.total, 1500);
  assert.equal(caixa540.empenhos.length, 2);
  assert.equal(c.itens.find(g => g.fonteCompleta === '1.500.000.0000').total, 300);
  assert.equal(c.pendentes.length, 1, 'sem fonte fica pendente');
  assert.equal(c.totais['Caixa Econômica Federal'], 1800);
  assert.equal(c.totais['Bradesco'], 70, 'o total por banco inclui o pendente');
  assert.equal(c.total, 1800 + 200 + 70 + 50);
  assert.deepEqual(c.itens.map(g => g.destino), ['Caixa Econômica Federal', 'Caixa Econômica Federal', 'Sicoob', 'Pensão alimentícia']);
});

t('confirmação só libera com tudo preenchido e saldo suficiente', () => {
  const base = { arquivos: { principal: { registros: [{}] } }, primeiro: 5000, contas: [{ id: 'c1', nome: 'A', fonte: '1540' }],
    saldos: { c1: 1000000 }, previsao: { empenhos: [emp(0)] }, maternidade: { avisos: [] }, conferiuFichas: true };
  assert.equal(etapasDaFolha(base).podeConfirmar, true);
  const saldoInsuficiente = etapasDaFolha({ ...base, saldos: { c1: 1 } });
  assert.equal(saldoInsuficiente.podeConfirmar, true, 'saldo insuficiente só gera aviso');
  assert.equal(saldoInsuficiente.situacao.insuficientes.length, 1);
  assert.equal(etapasDaFolha({ ...base, saldos: {} }).podeConfirmar, false, 'saldo não informado');
  assert.equal(etapasDaFolha({ ...base, conferiuFichas: false }).podeConfirmar, false);
  assert.equal(etapasDaFolha({ ...base, previsao: { empenhos: [emp(0, { contaId: '' })] } }).podeConfirmar, false);
  const semFicha = etapasDaFolha({ ...base, previsao: { empenhos: [emp(0, { ficha: '', problemas: ['Informar ficha e fonte de recursos'] })] } });
  assert.equal(semFicha.podeConfirmar, false);
  assert.ok(semFicha.etapas[3].pendencias[0].includes('sem ficha'));
  assert.equal(etapasDaFolha({ ...base, previsao: { empenhos: [emp(0, { problemas: ['Outra coisa'] })] } }).podeConfirmar, false);
  assert.equal(etapasDaFolha({ ...base, arquivos: {} }).podeConfirmar, false);
});

t('a assinatura muda quando um valor ou a conta muda', () => {
  const a = assinaturaDaFolha([emp(0)], [{ id: 'c1' }], { c1: 1 });
  assert.equal(a, assinaturaDaFolha([emp(0)], [{ id: 'c1' }], { c1: 1 }));
  assert.notEqual(a, assinaturaDaFolha([emp(0, { bruto: 1 })], [{ id: 'c1' }], { c1: 1 }));
  assert.notEqual(a, assinaturaDaFolha([emp(0, { contaId: 'c2' })], [{ id: 'c1' }], { c1: 1 }));
  assert.notEqual(a, assinaturaDaFolha([emp(0)], [{ id: 'c1' }], { c1: 2 }));
});

t('previsto da folha comparado com as minutas por banco e fonte', () => {
  const previsto = previstoParaConsignacoes({ empenhos: [emp(0, { bancos: { Caixa: 1000, Sicoob: 0, Bradesco: 0, Pensao: 0 } })], primeiro: 5000, ultimo: 5000 },
    { competencia: '2026-10' });
  assert.equal(previsto.totais['Caixa Econômica Federal'], 1000);
  const linhas = compararPrevistoComMinutas(previsto, [
    { destino: 'Caixa Econômica Federal', fonteCompleta: '1.540.000.0000', total: 900, guias: 2 },
    { destino: 'Sicoob', fonteCompleta: '1.500.000.0000', total: 40, guias: 1 }
  ]);
  assert.equal(linhas.length, 2);
  assert.equal(linhas[0].diferenca, -100);
  assert.equal(linhas[1].folha, 0);
  assert.equal(linhas[1].diferenca, 40);
});

// --- o consignado da rescisão não pode contar duas vezes ---
const brl = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
function resumo(tipo, codigo, fixa, descontos) {
  const l = ['RESUMO DE VERBAS', 'REFERENCIA: OUTUBRO/2026', 'TIPO CÁLCULO: ' + tipo, 'LOTAÇÃO...: ' + codigo,
    'PREF. MUNIC. DE FREI INOCENCIO', 'SECRETARIA MUNIC. DE EDUCACAO', 'PESSOAL CONTRATADO', 'CLASSIFICAÇÃO CONTÁBIL: 0 - FIXA'];
  const soma = a => a.reduce((s, [, , v]) => s + v, 0);
  for (const [c, d, v] of fixa) l.push(`${c} ${d} ${brl(v)}`);
  l.push('TOTAL DA CLASSIFICAÇÃO: ' + brl(soma(fixa)), 'CLASSIFICAÇÃO CONTÁBIL: 2 - OUTRAS');
  for (const [c, d, v] of descontos) l.push(`${c} ${d} ${brl(v)}`);
  const b = soma(fixa), d = soma(descontos);
  l.push('TOTAL DA CLASSIFICAÇÃO: ' + brl(d), 'TOTAL BRUTO DE PROVENTOS...........: ' + brl(b),
    'TOTAL BRUTO DE DESCONTOS...........: ' + brl(d), 'TOTAL LÍQUIDO......................: ' + brl(b - d),
    'VALOR BRUTO DO EMPENHO.............: ' + brl(b), 'VALOR DO DESCONTO NA LIQUIDAÇÃO....: ' + brl(d),
    'VALOR LIQUIDO DO EMPENHO...........: ' + brl(b - d));
  return l.map(texto => ({ texto, pagina: 1 }));
}
t('empréstimo quitado na rescisão sai do consignado da folha mensal', () => {
  const mensal = analisarResumoVerbas(resumo('01-FOLHA MENSAL', '002.004.217.00001',
    [['100', 'VENCIMENTO MENSAL', 10000]], [['201', 'I.N.S.S.', 800], ['410', 'EMPRESTIMO CAIXA', 900]]), { tipo: 'principal' });
  const resc = analisarResumoVerbas(resumo('06-RESCISÃO CONTRATUAL', '002.004.217.00001',
    [['100', 'VENCIMENTO MENSAL', 2000]], [['201', 'I.N.S.S.', 100], ['410', 'EMPRESTIMO CAIXA', 400]]), { tipo: 'rescisao' });
  assert.equal(mensal.registros[0].bancos.Caixa, 90000);
  const r = descontarFolhasProprias([mensal, resc]);
  const e = prepararEmpenhos(r.arquivos, 5000, {}, {});
  const principal = e.empenhos.find(x => x.tipo === 'principal'), rescisao = e.empenhos.find(x => x.tipo === 'rescisao');
  assert.equal(principal.bancos.Caixa, 50000, 'mensal fica só com o que é dele');
  assert.equal(rescisao.bancos.Caixa, 40000);
  assert.equal(principal.diferencaComposicao, 0, 'a composição continua fechando com o desconto');
  assert.ok(!principal.problemas.some(p => /Composição/.test(p)));
  const c = consignadosPorFonte(e.empenhos.map(x => ({ ...x, fonte: '1500' })));
  assert.equal(c.totais['Caixa Econômica Federal'], 90000, 'soma igual ao mensal original, sem dobrar');
});

// --- ordem da Contabilidade ---
import { ORDEM_FOLHA_MENSAL, ordemDasLotacoes } from '../assets/js/folha-ordem.js';
t('a folha mensal segue a ordem da planilha da Contabilidade, não a do RH', () => {
  const mk = (lot, pag, tipo = 'principal') => ({ lotacao: lot, paginaInicio: pag, valores: { bruto: 100, desconto: 0, liquido: 100 },
    composicao: {}, bancos: {}, classificacaoDescontosIdentificada: true, diferencaComposicao: 0, rubricas: [] });
  // No RH: Cultura (002.008) vem depois da Fazenda (002.003); na planilha, antes.
  const arq = [{ tipo: 'principal', registros: [mk('002.003.212.00004', 1), mk('002.008.297.00003', 2), mk('002.099.999.00001', 3)] },
    { tipo: 'rescisao', registros: [mk('002.016.001', 4), mk('002.002.205.00001', 5)] }];
  const e = prepararEmpenhos(arq, 4912, {}, {}, { ordem: ordemDasLotacoes({}) }).empenhos;
  assert.deepEqual(e.map(x => x.lotacao), ['002.008.297.00003', '002.003.212.00004', '002.099.999.00001', '002.016.001', '002.002.205.00001']);
  assert.deepEqual(e.map(x => x.empenho), [4912, 4913, 4914, 4915, 4916], 'numerado a partir do número digitado');
  assert.ok(e[2].avisos[0].includes('Lotação nova'), 'lotação fora da lista vai para o fim com aviso');
  assert.ok(!e[2].problemas.some(p => /ordem/i.test(p)), 'o aviso não bloqueia a confirmação');
  // A coluna Ordem do mapa manda sobre a padrão
  const m = prepararEmpenhos(arq, 1, { 'principal|002.099.999.00001': { ordem: 0 } }, {}, { ordem: ordemDasLotacoes({ 'principal|002.099.999.00001': { ordem: 0 } }) }).empenhos;
  assert.equal(m[0].lotacao, '002.099.999.00001');
  assert.equal(ORDEM_FOLHA_MENSAL.length, 92);
  assert.equal(new Set(ORDEM_FOLHA_MENSAL).size, 92);
});

if (falhas.length) { console.error(falhas.join('\n')); process.exit(1); }
console.log(`folha-fluxo: ${ok} ok, 0 falhas`);
