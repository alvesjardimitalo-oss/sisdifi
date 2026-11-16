// Pré-auditoria de salário-maternidade na folha nominal do RH.
//
// As linhas abaixo reproduzem o layout real do relatório "FOLHA DE PAGAMENTO —
// ORDEM LOTAÇÃO / ALFABÉTICA", na ordem em que o pdf.js entrega depois de
// agrupar por coordenada: VERBA, TIPO, DESCRIÇÃO, REF., PROVENTOS, DESCONTOS.
// O valor é o ÚLTIMO número da linha, não o primeiro — o primeiro é a
// referência (dias, horas).
import assert from 'node:assert/strict';
import { sugerirMaternidadesDaFolha, consolidarMaternidade } from '../assets/js/folha-maternidade.js';

let ok = 0; const falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };
const l = (texto, pagina = 1) => ({ texto, pagina });

// Competência de outubro/2026, lotação de quatro níveis, duas servidoras.
// A segunda está em prorrogação: tem 163 (custeado pelo INSS) e 229 (custeado
// pelo Município, que entra na classificação FIXA e não na extra-orçamentária).
const QUATRO_NIVEIS = [
  l('LOTAÇÃO: 002 - PREF. MUNIC. DE FREI INOCENCIO'),
  l('002.004 - SECRETARIA MUNIC. DE EDUCACAO'),
  l('002.004.215 - MANUTENÇAO CRECHE 70%'),
  l('002.004.215.00001 - PESSOAL CONTRATADO'),
  l('005054 / 1 MICHELE LOPES GONÇALVES 1_20 /0073 -MONITOR (SALA DE AULA) 01/01/2026 CONTRATADO'),
  l('163 P SALARIO MATERNIDADE 30,00 1.782,37'),
  l('164 P SALARIO FAMILIA 2,00 135,08'),
  l('201 P I.N.S.S. 136,09'),
  l('384 P RETRO DIF DE SAL DO 3,00 182,64'),
  l('TOTAL....: 2.100,09 136,09 1.964,00'),
  l('004734 / 0 RAQUEL DO NASCIMENTO LIMA 1_20 /0073 -AUXILIAR DE SECRETARIA 02/02/2025 CONTRATADO', 2),
  l('163 P SALARIO MATERNIDADE 7,00 415,89', 2),
  l('201 P I.N.S.S. 136,09', 2),
  l('229 P SALARIO MATERNIDADE 23,00 1.366,48', 2),
  l('384 P RETRO DIF DE SAL DO 3,00 182,64', 2),
  l('TOTAL....: 1.965,01 136,09 1.828,92', 2)
];

t('lê as servidoras, o benefício e o INSS da folha real', () => {
  const r = sugerirMaternidadesDaFolha(QUATRO_NIVEIS);
  assert.equal(r.achados.length, 2);
  assert.deepEqual(r.avisos, []);
  const [a, b] = r.achados;
  assert.equal(a.matricula, '005054');
  assert.equal(a.beneficio, 178237, 'pega o último valor da linha, não a referência de 30 dias');
  assert.equal(a.inss, 13609);
  assert.equal(b.matricula, '004734');
  assert.equal(b.beneficio, 41589);
  assert.equal(b.pagina, 2, 'guarda a página para a conferência voltar ao PDF');
});

t('a rubrica 229 (prorrogação) não entra no benefício do INSS', () => {
  const r = sugerirMaternidadesDaFolha(QUATRO_NIVEIS);
  const raquel = r.achados.find(p => p.matricula === '004734');
  assert.equal(raquel.beneficio, 41589, 'só a 163; a 229 é custeada pelo Município');
});

t('a soma das servidoras é a linha 163 do resumo da lotação', () => {
  const r = sugerirMaternidadesDaFolha(QUATRO_NIVEIS);
  assert.equal(r.achados.reduce((s, p) => s + p.beneficio, 0), 219826);
});

t('ignora o nome do cargo ao extrair a identificação', () => {
  const r = sugerirMaternidadesDaFolha(QUATRO_NIVEIS);
  assert.equal(r.achados[0].nome, 'MICHELE LOPES GONÇALVES');
});

// A lotação do empenho tem 3 OU 4 níveis. Em 10 das 93 lotações reais a
// hierarquia pula o nível da ação e o 3º nível já é a categoria. Exigir quatro
// deixava a servidora com lotação vazia e um aviso dizendo "somente prefixo"
// para um código que é completo — e ela não entrava no empenho.
const TRES_NIVEIS = [
  l('LOTAÇÃO: 002 - PREF. MUNIC. DE FREI INOCENCIO'),
  l('002.016 - SECRETARIA MUNIC. DE LIMPEZA URBANA'),
  l('002.016.002 - PESSOAL EFETIVO'),
  l('007001 / 3 MARIA APARECIDA SOUZA 1_20 /0073 -AUXILIAR 01/01/2026 EFETIVO'),
  l('163 P SALARIO MATERNIDADE 30,00 1.782,37'),
  l('201 P I.N.S.S. 136,09'),
  l('TOTAL....: 1.918,46 136,09 1.782,37')
];

t('lotação de três níveis é completa', () => {
  const r = sugerirMaternidadesDaFolha(TRES_NIVEIS);
  assert.equal(r.achados.length, 1);
  assert.equal(r.achados[0].lotacao, '002.016.002');
  assert.deepEqual(r.avisos, [], 'não pode acusar código incompleto para um código completo');
});

t('órgão e secretaria continuam sendo prefixo, nunca lotação', () => {
  const r = sugerirMaternidadesDaFolha([
    l('LOTAÇÃO: 002 - PREF. MUNIC. DE FREI INOCENCIO'),
    l('002.016 - SECRETARIA MUNIC. DE LIMPEZA URBANA'),
    l('007001 / 3 MARIA APARECIDA SOUZA 1_20 /0073 -AUXILIAR 01/01/2026 EFETIVO'),
    l('163 P SALARIO MATERNIDADE 30,00 1.782,37'),
    l('201 P I.N.S.S. 136,09'),
    l('TOTAL....: 1.918,46 136,09 1.782,37')
  ]);
  assert.equal(r.achados[0].lotacao, '', '002.016 é secretaria, não lotação de empenho');
  assert.equal(r.achados[0].lotacaoPendente, '002.016');
  assert.match(r.avisos[0], /lota..o completo n.o encontrado/);
});

t('vale o nível mais profundo, qualquer que seja a ordem das linhas', () => {
  const r = sugerirMaternidadesDaFolha([
    l('LOTAÇÃO: 002.004.215.00001 - PESSOAL CONTRATADO'),
    l('002.004.215 - MANUTENÇAO CRECHE 70%'),
    l('005054 / 1 MICHELE LOPES G 1_20 /0073 -MONITOR 01/01/2026 CONTRATADO'),
    l('163 P SALARIO MATERNIDADE 30,00 1.782,37'),
    l('201 P I.N.S.S. 136,09'),
    l('TOTAL....: 1.918,46 136,09 1.782,37')
  ]);
  assert.equal(r.achados[0].lotacao, '002.004.215.00001', 'o 3º nível não pode sobrescrever o 4º');
});

t('servidor sem rubrica 163 não entra', () => {
  const r = sugerirMaternidadesDaFolha([
    l('LOTAÇÃO: 002 - PREF'), l('002.016 - LIMPEZA'), l('002.016.002 - PESSOAL EFETIVO'),
    l('007002 / 1 JOSE DA SILVA 1_20 /0073 -AUXILIAR 01/01/2026 EFETIVO'),
    l('100 P VENCIMENTO MENSAL 200,00 1.782,37'),
    l('201 P I.N.S.S. 136,09'),
    l('TOTAL....: 1.782,37 136,09 1.646,28')
  ]);
  assert.equal(r.achados.length, 0);
  assert.match(r.avisos[0], /Nenhuma rubrica 163/);
});

t('folha sem INSS individual avisa e não confirma', () => {
  const r = sugerirMaternidadesDaFolha([
    l('LOTAÇÃO: 002 - PREF'), l('002.016 - LIMPEZA'), l('002.016.002 - PESSOAL EFETIVO'),
    l('007003 / 9 ANA LIMA 1_20 /0073 -AUXILIAR 01/01/2026 EFETIVO'),
    l('163 P SALARIO MATERNIDADE 30,00 1.782,37'),
    l('TOTAL....: 1.782,37 0,00 1.782,37')
  ]);
  assert.equal(r.achados[0].inss, null);
  assert.equal(r.achados[0].confirmado, false);
  assert.equal(r.avisos.length, 1);
});

// --- consolidação contra o resumo de verbas ---
const resumoCreche = [{ registros: [{ lotacao: '002.004.215.00001', valores: { maternidade: 219826 }, inss: 574613 }] }];

t('confere a soma das servidoras contra o resumo e devolve o INSS integral', () => {
  const pessoas = sugerirMaternidadesDaFolha(QUATRO_NIVEIS).achados.map(p => ({ ...p, confirmado: true }));
  const r = consolidarMaternidade(pessoas, resumoCreche);
  const a = r.ajustes['principal|002.004.215.00001'];
  assert.equal(a.confirmado, true);
  // regra da Contabilidade: vai o INSS INTEIRO da servidora, não a parte
  // proporcional ao benefício — é o que a planilha de outubro faz (6.519,88
  // do resumo menos 272,18 = 6.247,70 no empenho).
  assert.equal(a.inssExtra, 27218);
  assert.deepEqual(r.avisos, []);
});

t('soma divergente do resumo não confirma e não leva INSS', () => {
  const pessoas = sugerirMaternidadesDaFolha(QUATRO_NIVEIS).achados.map(p => ({ ...p, confirmado: true }));
  const r = consolidarMaternidade(pessoas, [{ registros: [{ lotacao: '002.004.215.00001', valores: { maternidade: 219825 }, inss: 574613 }] }]);
  const a = r.ajustes['principal|002.004.215.00001'];
  assert.equal(a.confirmado, false);
  assert.equal(a.inssExtra, 0, 'nada entra na extra-orçamentária sem o total de controle fechar');
  assert.match(r.avisos[0], /n.o confere com o resumo/);
});

t('INSS individual acima do INSS da lotação é erro', () => {
  const pessoas = sugerirMaternidadesDaFolha(QUATRO_NIVEIS).achados.map(p => ({ ...p, confirmado: true }));
  const r = consolidarMaternidade(pessoas, [{ registros: [{ lotacao: '002.004.215.00001', valores: { maternidade: 219826 }, inss: 100 }] }]);
  assert.equal(r.ajustes['principal|002.004.215.00001'].confirmado, false);
  assert.ok(r.avisos.some(a => /excede o total do INSS/.test(a)));
});

t('matrícula repetida é erro', () => {
  const p = { lotacao: 'X', beneficio: 100, inss: 10, nome: 'A', matricula: '1', confirmado: true };
  const r = consolidarMaternidade([p, { ...p }], [{ registros: [{ lotacao: 'X', valores: { maternidade: 200 }, inss: 20 }] }]);
  assert.ok(r.avisos.some(a => /Matr.cula repetida/.test(a)));
});

t('servidora sem rubrica 163 no resumo é avisada, nunca atribuída a outra lotação', () => {
  const r = consolidarMaternidade(
    [{ lotacao: '002.016.002', beneficio: 100, inss: 10, nome: 'A', matricula: '9', confirmado: true }],
    resumoCreche);
  assert.ok(r.avisos.some(a => /sem rubrica 163 correspondente/.test(a)));
  assert.equal(r.ajustes['principal|002.016.002'], undefined);
});

console.log(`folha-maternidade: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
