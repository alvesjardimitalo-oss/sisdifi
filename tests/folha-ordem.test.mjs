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
  moverGrupo, ultimoNivelEhVinculo, RANK_OUTROS } from '../assets/js/folha-ordem.js';

let ok = 0; const falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };
const reg = (lotacao, ultimo, secretaria = '') => ({ lotacao, secretaria,
  caminho: ['PREF. MUNIC.', 'ACAO', ultimo].filter(Boolean) });

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
t('o grupo é a lotação sem o nível do vínculo', () => {
  assert.equal(grupoDaLotacao(reg('002.004.217.00002', 'PESSOAL EFETIVO')), '002.004.217');
  assert.equal(grupoDaLotacao(reg('002.004.217.00006', 'COMISSIONADOS')), '002.004.217');
});

// Em '002.016.002' o vínculo já é o 3º nível: o grupo é a secretaria.
t('lotação de três níveis agrupa pela secretaria', () => {
  assert.equal(grupoDaLotacao(reg('002.016.002', 'PESSOAL EFETIVO')), '002.016');
  assert.equal(grupoDaLotacao(reg('002.016.001', 'PESSOAL CONTRATADO')), '002.016');
});

/* Na lotação do Prefeito o último nível é a AÇÃO, então não pode ser removido:
   o grupo é ela inteira, e é o mesmo das outras lotações daquela ação. */
t('a lotação do Prefeito não perde o último nível', () => {
  const p = { lotacao: '002.001.201', secretaria: 'GABINETE DO PREFEITO',
    caminho: ['PREF. MUNIC.', 'MANUT. DO GAB. E SECRET. DE GOVERNO'] };
  assert.equal(grupoDaLotacao(p), '002.001.201');
  assert.equal(grupoDaLotacao(reg('002.001.201.00005', 'VICE PREFEITO')), '002.001.201',
    'o Vice está no mesmo grupo que o Prefeito');
  assert.ok(!ultimoNivelEhVinculo(p));
  assert.ok(ultimoNivelEhVinculo(reg('002.001.201.00005', 'VICE PREFEITO')));
});

// --- ordenação ---
/* Confere contra a planilha de outubro: no Gabinete a Contabilidade fez
   Prefeito, Vice e comissionados (4912, 4913, 4914), e os códigos de lotação
   não seguem essa ordem — 201, 201.00005, 201.00003. */
t('o Gabinete sai na ordem de outubro', () => {
  const r = ordenarEmpenhos([
    reg('002.001.201.00003', 'COMISSIONADOS'),
    { lotacao: '002.001.201', secretaria: 'GABINETE DO PREFEITO',
      caminho: ['PREF. MUNIC.', 'MANUT. DO GAB. E SECRET. DE GOVERNO'] },
    reg('002.001.201.00005', 'VICE PREFEITO')]);
  assert.deepEqual(r.map(x => x.lotacao), ['002.001.201', '002.001.201.00005', '002.001.201.00003']);
});

t('a Limpeza Urbana sai na ordem de outubro', () => {
  const r = ordenarEmpenhos([
    reg('002.016.001', 'PESSOAL CONTRATADO'), reg('002.016.002', 'PESSOAL EFETIVO'),
    reg('002.016.003', 'PESSOAL COMISSIONADO'), reg('002.016.004', 'AGENTE POLITICO')]);
  assert.deepEqual(r.map(x => x.lotacao),
    ['002.016.004', '002.016.003', '002.016.002', '002.016.001']);
});

/* A ordem entre grupos é da Contabilidade e não sai de nenhum dado: em outubro
   Esporte (002.011) veio antes de Transportes (002.013) e de Obras (002.012). */
t('a ordem de grupos informada é respeitada', () => {
  const entrada = [reg('002.012.296.00001', 'PESSOAL EFETIVO'),
    reg('002.011.289.00001', 'PESSOAL EFETIVO'), reg('002.013.002', 'PESSOAL EFETIVO')];
  const r = ordenarEmpenhos(entrada, ['002.011.289', '002.013', '002.012.296']);
  assert.deepEqual(r.map(x => grupoDaLotacao(x)), ['002.011.289', '002.013', '002.012.296']);
});

// Secretaria nova tem de aparecer no fim, não se perder no meio da sequência.
t('grupo que não está na ordem entra depois dos conhecidos', () => {
  const entrada = [reg('002.099.999.00001', 'PESSOAL EFETIVO'), reg('002.016.002', 'PESSOAL EFETIVO')];
  const r = ordenarEmpenhos(entrada, ['002.016']);
  assert.deepEqual(r.map(x => x.lotacao), ['002.016.002', '002.099.999.00001']);
});

t('grupos novos entram na ordem em que o resumo os trouxe', () => {
  const entrada = [reg('002.050.001', 'PESSOAL EFETIVO'), reg('002.040.001', 'PESSOAL EFETIVO')];
  assert.deepEqual(ordenarEmpenhos(entrada, []).map(x => x.lotacao),
    ['002.050.001', '002.040.001'], 'não reordena por código quem não foi informado');
});

t('o vínculo manda dentro do grupo, mesmo com a ordem informada', () => {
  const r = ordenarEmpenhos([reg('002.016.001', 'PESSOAL CONTRATADO'),
    reg('002.016.004', 'AGENTE POLITICO')], ['002.016']);
  assert.deepEqual(r.map(x => x.lotacao), ['002.016.004', '002.016.001']);
});

// Mesmo vínculo duas vezes no grupo: a lotação decide, para o resultado não
// depender da ordem de leitura do PDF.
t('empate de vínculo é resolvido pela lotação', () => {
  const r = ordenarEmpenhos([reg('002.004.217.00009', 'PESSOAL EFETIVO'),
    reg('002.004.217.00002', 'PESSOAL EFETIVO')], ['002.004.217']);
  assert.deepEqual(r.map(x => x.lotacao), ['002.004.217.00002', '002.004.217.00009']);
});

t('não mexe na lista que recebeu', () => {
  const entrada = [reg('002.016.001', 'PESSOAL CONTRATADO'), reg('002.016.004', 'AGENTE POLITICO')];
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
  const r = [reg('002.016.004', 'AGENTE POLITICO'), reg('002.016.001', 'PESSOAL CONTRATADO'),
    reg('002.013.002', 'PESSOAL EFETIVO')];
  assert.deepEqual(gruposEmOrdem(r), ['002.016', '002.013']);
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
