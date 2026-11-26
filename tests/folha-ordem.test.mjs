// Ordem dos empenhos. A numeração segue a ordem de digitação, então a ordem é
// o que decide o número de cada empenho.
//
// Duas regras diferentes a formam: dentro de um grupo, o vínculo (Prefeito,
// Vice, agente político, comissionado, efetivo, contratado), que se deriva do
// texto da lotação; entre os grupos, a sequência da Contabilidade, que não sai
// de nenhum dado — em outubro ela fez Esporte e Lazer (002.011) antes de
// Transportes (002.013), que veio antes de Obras (002.012).
import assert from 'node:assert/strict';
import { ordenarEmpenhos, rankVinculo, grupoDaLotacao, gruposEmOrdem,
  moverGrupo, ultimoNivelEhVinculo, RANK_OUTROS,
  ORDEM_GRUPOS_2026 } from '../assets/js/folha-ordem.js';

let ok = 0; const falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };
const reg = (lotacao, ultimo, secretaria = '') => ({ lotacao, secretaria,
  caminho: ['PREF. MUNIC.', 'ACAO', ultimo].filter(Boolean) });
const regA = (lotacao, acao, ultimo) => ({ lotacao, caminho: ['PREF. MUNIC.', acao, ultimo] });

t('o vínculo define a posição dentro do grupo', () => {
  assert.equal(rankVinculo(reg('x', 'VICE PREFEITO')), 2);
  assert.equal(rankVinculo(reg('x', 'AGENTE POLITICO')), 3);
  assert.equal(rankVinculo(reg('x', 'COMISSIONADOS')), 4);
  assert.equal(rankVinculo(reg('x', 'PESSOAL EFETIVO')), 5);
  assert.equal(rankVinculo(reg('x', 'PESSOAL CONTRATADO')), 6);
  assert.equal(rankVinculo(reg('x', 'APOSENTADORIAS RPPS')), 7);
});

// O Prefeito vem primeiro, e é reconhecido pela secretaria: a lotação dele tem
// três níveis e o último é a ação, não o vínculo.
t('o Prefeito abre o Gabinete', () => {
  const p = { lotacao: '002.001.201', secretaria: 'GABINETE DO PREFEITO',
    caminho: ['PREF. MUNIC.', 'MANUT. DO GAB. E SECRET. DE GOVERNO'] };
  assert.equal(rankVinculo(p), 1);
});

t('o que não é vínculo de pessoal ativo vai para o fim', () => {
  assert.equal(rankVinculo(reg('x', 'CONSELHO TUTELAR')), RANK_OUTROS);
  assert.equal(rankVinculo(reg('x', 'MANUTENCAO DA SEC. DE AÇAO SOCIAL')), RANK_OUTROS);
  assert.equal(rankVinculo({}), RANK_OUTROS);
});

// --- grupo ---
/* O grupo é a AÇÃO dentro da secretaria, não o código da lotação. Dois códigos
   podem ser a mesma ação: em outubro 002.005.235 e 002.005.236 são as duas
   "ATENÇÃO BÁSICA", e a Contabilidade faz a ação de uma vez — o agente político
   junto dos efetivos e contratados dela. */
t('o grupo é a ação dentro da secretaria', () => {
  assert.equal(grupoDaLotacao(regA('002.004.217.00002', 'MANUT. ENSINO FUNDAMENTAL', 'PESSOAL EFETIVO')),
    '002.004|MANUT ENSINO FUNDAMENTAL');
});

t('códigos diferentes da mesma ação são um grupo só', () => {
  const a = regA('002.005.235.00002', 'MANUTENÇAO ATENÇÃO BASICA', 'PESSOAL EFETIVO');
  const b = regA('002.005.236.00004', 'MANUTENÇÃO ATENÇÃO BÁSICA 159', 'AGENTE POLITICO');
  assert.equal(grupoDaLotacao(a), grupoDaLotacao(b),
    'o acento e o sufixo numérico não podem separar a mesma ação');
  assert.equal(grupoDaLotacao(a), '002.005|MANUTENCAO ATENCAO BASICA');
});

t('a mesma ação em secretarias diferentes não se mistura', () => {
  assert.notEqual(grupoDaLotacao(regA('002.004.100.00001', 'MANUTENCAO', 'PESSOAL EFETIVO')),
    grupoDaLotacao(regA('002.005.100.00001', 'MANUTENCAO', 'PESSOAL EFETIVO')));
});

// Em '002.016.002' o vínculo já é o 3º nível: a ação é o nome da secretaria.
t('lotação de três níveis agrupa pelo nome da secretaria', () => {
  const a = regA('002.016.002', 'SECRETARIA MUNIC. DE LIMPEZA URBANA', 'PESSOAL EFETIVO');
  const b = regA('002.016.001', 'SECRETARIA MUNIC. DE LIMPEZA URBANA', 'PESSOAL CONTRATADO');
  assert.equal(grupoDaLotacao(a), grupoDaLotacao(b));
  assert.equal(grupoDaLotacao(a), '002.016|SECRETARIA MUNIC DE LIMPEZA URBANA');
});

/* Na lotação do Prefeito o último nível é a AÇÃO, então é dele que sai o grupo
   — o mesmo das outras lotações daquela ação, o Vice incluído. */
t('o Prefeito cai no grupo da ação dele', () => {
  const p = { lotacao: '002.001.201', secretaria: 'GABINETE DO PREFEITO',
    caminho: ['PREF. MUNIC.', 'MANUT. DO GAB. E SECRET. DE GOVERNO'] };
  const vice = regA('002.001.201.00005', 'MANUT. DO GAB. E SECRET. DE GOVERNO', 'VICE PREFEITO');
  assert.equal(grupoDaLotacao(p), grupoDaLotacao(vice));
  assert.ok(!ultimoNivelEhVinculo(p));
  assert.ok(ultimoNivelEhVinculo(vice));
});

t('sem nome de ação, cai para o código da lotação', () => {
  assert.equal(grupoDaLotacao({ lotacao: '002.016.002' }), '002.016.002');
  assert.equal(grupoDaLotacao({}), '');
});

// --- ordenação ---
/* Confere contra a planilha de outubro: no Gabinete a Contabilidade fez
   Prefeito, Vice e comissionados (4912, 4913, 4914), e os códigos de lotação
   não seguem essa ordem — 201, 201.00005, 201.00003. */
t('o Gabinete sai na ordem de outubro', () => {
  const ACAO = 'MANUT. DO GAB. E SECRET. DE GOVERNO';
  const r = ordenarEmpenhos([
    regA('002.001.201.00003', ACAO, 'COMISSIONADOS'),
    { lotacao: '002.001.201', secretaria: 'GABINETE DO PREFEITO', caminho: ['PREF. MUNIC.', ACAO] },
    regA('002.001.201.00005', ACAO, 'VICE PREFEITO')]);
  assert.deepEqual(r.map(x => x.lotacao), ['002.001.201', '002.001.201.00005', '002.001.201.00003']);
});

t('a Limpeza Urbana sai na ordem de outubro', () => {
  const L = 'SECRETARIA MUNIC. DE LIMPEZA URBANA';
  const r = ordenarEmpenhos([
    regA('002.016.001', L, 'PESSOAL CONTRATADO'), regA('002.016.002', L, 'PESSOAL EFETIVO'),
    regA('002.016.003', L, 'PESSOAL COMISSIONADO'), regA('002.016.004', L, 'AGENTE POLITICO')]);
  assert.deepEqual(r.map(x => x.lotacao),
    ['002.016.004', '002.016.003', '002.016.002', '002.016.001']);
});

/* A ordem entre grupos é da Contabilidade e não sai de nenhum dado: em outubro
   Esporte (002.011) veio antes de Transportes (002.013) e de Obras (002.012). */
t('a ordem de grupos informada é respeitada', () => {
  const obras = regA('002.012.296.00001', 'MANUT. VIAS', 'PESSOAL EFETIVO');
  const esporte = regA('002.011.289.00001', 'MANUT. ESPORTE', 'PESSOAL EFETIVO');
  const transp = regA('002.013.002', 'SEC. TRANSPORTES', 'PESSOAL EFETIVO');
  const r = ordenarEmpenhos([obras, esporte, transp],
    [grupoDaLotacao(esporte), grupoDaLotacao(transp), grupoDaLotacao(obras)]);
  assert.deepEqual(r.map(x => x.lotacao), ['002.011.289.00001', '002.013.002', '002.012.296.00001']);
});

// Secretaria nova tem de aparecer no fim, não se perder no meio da sequência.
t('grupo que não está na ordem entra depois dos conhecidos', () => {
  const novo = regA('002.099.999.00001', 'SECRETARIA NOVA', 'PESSOAL EFETIVO');
  const velho = regA('002.016.002', 'LIMPEZA URBANA', 'PESSOAL EFETIVO');
  const r = ordenarEmpenhos([novo, velho], [grupoDaLotacao(velho)]);
  assert.deepEqual(r.map(x => x.lotacao), ['002.016.002', '002.099.999.00001']);
});

t('grupos novos entram na ordem em que o resumo os trouxe', () => {
  const entrada = [regA('002.050.001', 'SEC A', 'PESSOAL EFETIVO'),
    regA('002.040.001', 'SEC B', 'PESSOAL EFETIVO')];
  assert.deepEqual(ordenarEmpenhos(entrada, []).map(x => x.lotacao),
    ['002.050.001', '002.040.001'], 'não reordena por código quem não foi informado');
});

t('o vínculo manda dentro do grupo, mesmo com a ordem informada', () => {
  const a = regA('002.016.001', 'LIMPEZA URBANA', 'PESSOAL CONTRATADO');
  const b = regA('002.016.004', 'LIMPEZA URBANA', 'AGENTE POLITICO');
  assert.deepEqual(ordenarEmpenhos([a, b], [grupoDaLotacao(a)]).map(x => x.lotacao),
    ['002.016.004', '002.016.001']);
});

// A ação é uma só, em dois códigos de lotação: o vínculo ordena os dois juntos.
t('ação em dois códigos é ordenada como um grupo', () => {
  const ag = regA('002.005.236.00004', 'MANUTENÇÃO ATENÇÃO BÁSICA 159', 'AGENTE POLITICO');
  const ef = regA('002.005.235.00019', 'MANUTENÇAO ATENÇÃO BASICA', 'SERVIDOR EFETIVO');
  const ct = regA('002.005.235.00008', 'MANUTENÇAO ATENÇÃO BASICA', 'SERVIDORES CONTRATADOS');
  assert.deepEqual(ordenarEmpenhos([ct, ef, ag], []).map(x => x.lotacao),
    ['002.005.236.00004', '002.005.235.00019', '002.005.235.00008'],
    'é assim que a Contabilidade fez em outubro');
});

// Mesmo vínculo duas vezes no grupo: a lotação decide, para o resultado não
// depender da ordem de leitura do PDF.
t('empate de vínculo é resolvido pela lotação', () => {
  const a = regA('002.004.217.00009', 'MANUT. ENSINO FUNDAMENTAL', 'PESSOAL EFETIVO');
  const b = regA('002.004.217.00002', 'MANUT. ENSINO FUNDAMENTAL', 'PESSOAL EFETIVO');
  assert.deepEqual(ordenarEmpenhos([a, b], []).map(x => x.lotacao),
    ['002.004.217.00002', '002.004.217.00009']);
});

/* A sequência de 2026 foi recuperada da planilha de outubro: os 35 grupos que
   deu para casar saem na mesma ordem, nenhum fora de lugar. */
t('a ordem de 2026 está cadastrada e sem repetição', () => {
  assert.equal(ORDEM_GRUPOS_2026.length, 36);
  assert.equal(new Set(ORDEM_GRUPOS_2026).size, 36);
  for (const g of ORDEM_GRUPOS_2026) assert.match(g, /^002\.\d{3}\|[A-Z0-9 ]+$/, g);
  assert.equal(ORDEM_GRUPOS_2026[0], '002.001|MANUT DO GAB E SECRET DE GOVERNO',
    'o Gabinete abre, porque o Prefeito e o Vice são os primeiros');
});

t('não mexe na lista que recebeu', () => {
  const entrada = [regA('002.016.001', 'LIMPEZA', 'PESSOAL CONTRATADO'),
    regA('002.016.004', 'LIMPEZA', 'AGENTE POLITICO')];
  const copia = [...entrada];
  ordenarEmpenhos(entrada, []);
  assert.deepEqual(entrada, copia);
});

t('lista vazia não quebra', () => {
  assert.deepEqual(ordenarEmpenhos([], []), []);
  assert.deepEqual(ordenarEmpenhos(), []);
  assert.deepEqual(ordenarEmpenhos(null, null), []);
});

// --- guardar e mexer na ordem ---
t('gruposEmOrdem devolve a sequência sem repetir', () => {
  const r = [regA('002.016.004', 'LIMPEZA', 'AGENTE POLITICO'),
    regA('002.016.001', 'LIMPEZA', 'PESSOAL CONTRATADO'),
    regA('002.013.002', 'TRANSPORTES', 'PESSOAL EFETIVO')];
  assert.deepEqual(gruposEmOrdem(r), ['002.016|LIMPEZA', '002.013|TRANSPORTES']);
  assert.deepEqual(gruposEmOrdem(), []);
});

t('moverGrupo sobe e desce um grupo', () => {
  const o = ['a', 'b', 'c'];
  assert.deepEqual(moverGrupo(o, 'c', -1), ['a', 'c', 'b']);
  assert.deepEqual(moverGrupo(o, 'a', 1), ['b', 'a', 'c']);
  assert.deepEqual(o, ['a', 'b', 'c'], 'não mexe na lista original');
});

t('moverGrupo fora da lista não faz nada', () => {
  assert.deepEqual(moverGrupo(['a', 'b'], 'a', -1), ['a', 'b']);
  assert.deepEqual(moverGrupo(['a', 'b'], 'b', 1), ['a', 'b']);
  assert.deepEqual(moverGrupo(['a', 'b'], 'z', 1), ['a', 'b']);
  assert.deepEqual(moverGrupo(), []);
});

console.log(`folha-ordem: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
