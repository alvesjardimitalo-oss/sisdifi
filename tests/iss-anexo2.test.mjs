// Anexo II da Lei 883/2017: alíquota do ISS por subitem.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANEXO_II, VETADOS, subitemAnexo, aliquotaAnexo } from '../assets/js/iss-anexo2.js';
import { aliquotaIss, ISS } from '../assets/js/fiscal.js';

let ok = 0, falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };

t('normaliza o código para o subitem', () => {
  assert.equal(subitemAnexo('07.02.00'), '7.02');
  assert.equal(subitemAnexo('0702'), '7.02');
  assert.equal(subitemAnexo('7.02'), '7.02');
  assert.equal(subitemAnexo('17.05'), '17.05');
  assert.equal(subitemAnexo(''), '');
  assert.equal(subitemAnexo('08.01.01.000'), '8.01');  // formato nacional, quatro grupos
  assert.equal(subitemAnexo('12.13.01.000'), '12.13');
});

t('itens 41 e 99 vêm sem subitem', () => {
  assert.equal(subitemAnexo('41'), '41');
  assert.equal(subitemAnexo('99'), '99');
  assert.equal(aliquotaAnexo('99').aliquota, 5);
});

t('a alíquota não é única: o Anexo alterna 3 e 5', () => {
  const valores = new Set(Object.values(ANEXO_II));
  assert.deepEqual([...valores].sort(), [3, 5]);
});

t('todo subitem tem alíquota de 2% a 5% (piso constitucional e teto da LC 116)', () => {
  for (const [sub, a] of Object.entries(ANEXO_II)) {
    assert.ok(a >= 2 && a <= 5, `${sub} = ${a}`);
  }
});

t('nenhum subitem vetado tem alíquota', () => {
  for (const v of VETADOS) assert.equal(ANEXO_II[v], undefined, v);
  const r = aliquotaAnexo('03.01.00');
  assert.equal(r.vetado, true);
  assert.equal(r.aliquota, null);
});

t('chaves do Anexo estão no formato item.subitem, sem zero à esquerda', () => {
  for (const k of Object.keys(ANEXO_II)) {
    if (k === '41' || k === '99') continue;
    assert.match(k, /^(?:[1-9]|[1-3][0-9]|40)\.\d{2}$/, k);
  }
});

// Os subitens de 1 a 40 são sequenciais na lista da LC 116/2003 com a redação
// da LC 157/2016, que é a que o Anexo II reproduz. Um buraco na sequência
// significa subitem esquecido na transcrição (fora os vetados).
t('não há buraco na sequência de subitens de cada item', () => {
  const porItem = {};
  for (const k of Object.keys(ANEXO_II)) {
    if (k === '41' || k === '99') continue;
    const [i, s] = k.split('.');
    (porItem[i] ||= []).push(Number(s));
  }
  for (const [item, subs] of Object.entries(porItem)) {
    const todos = [...subs, ...VETADOS.filter(v => v.split('.')[0] === item).map(v => Number(v.split('.')[1]))];
    todos.sort((a, b) => a - b);
    assert.equal(todos[0], 1, `item ${item} não começa em .01`);
    for (let n = 0; n < todos.length; n++) {
      assert.equal(todos[n], n + 1, `item ${item}: falta o subitem ${String(n + 1).padStart(2, '0')}`);
    }
  }
});

// --- amostras conferidas linha a linha contra o PDF do Anexo II ---
t('informática é 3%, não 5%', () => {
  assert.equal(aliquotaAnexo('01.01.00').aliquota, 3);
  assert.equal(aliquotaAnexo('01.07.00').aliquota, 3);
});

t('fornecimento de mão de obra (17.05) é 3%', () => {
  assert.equal(aliquotaAnexo('17.05').aliquota, 3);
});

t('assessoria e consultoria (17.01) é 3%, mas administração de terceiros (17.12) é 5%', () => {
  assert.equal(aliquotaAnexo('17.01').aliquota, 3);
  assert.equal(aliquotaAnexo('17.12').aliquota, 5);
});

t('obra (7.02) é 5% e demolição (7.04) é 3%', () => {
  assert.equal(aliquotaAnexo('07.02').aliquota, 5);
  assert.equal(aliquotaAnexo('07.04').aliquota, 3);
});

t('saúde é 3% em todo o item 4', () => {
  for (let n = 1; n <= 23; n++) {
    const s = '4.' + String(n).padStart(2, '0');
    assert.equal(ANEXO_II[s], 3, s);
  }
});

t('setor financeiro é 5% em todo o item 15', () => {
  for (let n = 1; n <= 18; n++) {
    const s = '15.' + String(n).padStart(2, '0');
    assert.equal(ANEXO_II[s], 5, s);
  }
});

t('manutenção de veículos (14.01) é 3% e instalação/montagem (14.06) é 5%', () => {
  assert.equal(aliquotaAnexo('14.01').aliquota, 3);
  assert.equal(aliquotaAnexo('14.06').aliquota, 5);
});

// --- integração com o motor ---
t('a tabela do Município vale: mão de obra é 3%, não o padrão', () => {
  const r = aliquotaIss('17.05.00');
  assert.equal(r.aliquota, 3);
  assert.equal(r.fonte, 'lei');
  assert.equal(r.subitem, '17.05');
});

t('o cadastro de Tributos fica acima da tabela e do padrão', () => {
  const r = aliquotaIss('17.05.00', { issPorCodigo: { '17.05': 2 } });
  assert.equal(r.aliquota, 2);
  assert.equal(r.fonte, 'cadastro');
  assert.equal(r.anexo, 3);
});

t('código fora da lista cai no padrão, sem alíquota de lei', () => {
  const r = aliquotaIss('88.88.00');
  assert.equal(r.aliquota, ISS.aliquota);
  assert.equal(r.fonte, 'padrao');
  assert.equal(r.anexo, null);
});

t('obra continua em 5%', () => {
  assert.equal(aliquotaIss('07.02.00').aliquota, 5);
});

// --- vigência: a nota é regida pela alíquota da data em que foi emitida ---
t('educação: 3% até 16/07/2026, 5% a partir de 17/07', () => {
  assert.equal(aliquotaAnexo('08.01.01.000', '2026-06-30').aliquota, 3);
  assert.equal(aliquotaAnexo('08.01.01.000', '2026-07-16').aliquota, 3);
  assert.equal(aliquotaAnexo('08.01.01.000', '2026-07-17').aliquota, 5);
  assert.equal(aliquotaAnexo('08.02.01.000', '2026-11-16').aliquota, 5);
});

t('a alíquota antiga se identifica como antiga', () => {
  const velha = aliquotaAnexo('08.01', '2026-05-01');
  assert.equal(velha.anterior, true);
  assert.equal(velha.ate, '2026-07-16');
  assert.equal(aliquotaAnexo('08.01', '2026-11-16').anterior, false);
});

t('sem data de emissão usa a alíquota de hoje', () => {
  assert.equal(aliquotaAnexo('08.01').aliquota, 5);
});

t('vigência não contamina subitem que nunca mudou', () => {
  assert.equal(aliquotaAnexo('17.05', '2026-01-02').aliquota, 3);
  assert.equal(aliquotaAnexo('17.05', '2026-11-16').aliquota, 3);
});

t('a nota velha de educação chega ao motor com 3%', () => {
  assert.equal(aliquotaIss('08.01.01.000', null, '2026-06-30').aliquota, 3);
  assert.equal(aliquotaIss('08.01.01.000', null, '2026-11-16').aliquota, 5);
});

t('nota sem código de serviço usa o padrão', () => {
  assert.equal(aliquotaIss('').aliquota, ISS.aliquota);
  assert.equal(aliquotaIss('').fonte, 'padrao');
});

t('subitem vetado não vira alíquota da lei', () => {
  const r = aliquotaIss('03.01.00');
  assert.equal(r.fonte, 'padrao');
  assert.equal(r.vetado, '3.01');
});

// --- a tabela conferida contra o cadastro do Município no Emissor Nacional ---
// fixtures-iss-frei-inocencio.json é a extração oficial de 03/09/2026, filtrada
// pelo IBGE 3126901 e pelas linhas sem data de fim. É o que o Emissor Nacional
// usa para imprimir o ISS na NFS-e: se divergir daqui, a nota e a conferência
// vão brigar em toda liquidação.
t('bate com o cadastro oficial do Município, subitem a subitem', () => {
  const oficial = JSON.parse(readFileSync(new URL('./fixtures-iss-frei-inocencio.json', import.meta.url), 'utf8'));
  const divergem = [];
  for (const [sub, a] of Object.entries(oficial)) {
    if (ANEXO_II[sub] !== a) divergem.push(`${sub}: tabela ${ANEXO_II[sub]} x oficial ${a}`);
  }
  assert.deepEqual(divergem, []);
});

t('não sobra subitem na nossa tabela que o cadastro não conheça', () => {
  const oficial = JSON.parse(readFileSync(new URL('./fixtures-iss-frei-inocencio.json', import.meta.url), 'utf8'));
  // 41 e 99 são linhas do Anexo II sem subitem; o cadastro nacional não as tem.
  const sobrando = Object.keys(ANEXO_II).filter(k => !(k in oficial) && k !== '41' && k !== '99');
  assert.deepEqual(sobrando, []);
});

console.log(`iss-anexo2: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
