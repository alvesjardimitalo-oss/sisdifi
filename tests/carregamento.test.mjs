// Carregamento das telas: falha de dado nunca pode virar spinner eterno.
//
// Toda tela principal chama aguardando() antes de desenhar. Se um ouvinte do
// Firestore falha (permissão, rede, regra), a coleção nunca fica "pronta" e a
// tela ficava em "Carregando dados…" para sempre — o aviso era um toast, que
// some em segundos. O usuário fica olhando um spinner sem saber o que houve.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as fs from 'node:fs';
const require_fs = () => fs;

const raiz = path.join(import.meta.dirname, '..');
const ler = p => readFileSync(path.join(raiz, p), 'utf8');
let ok = 0; const falhas = [];
const pendentes = [];
const t = (nome, fn) => {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') pendentes.push(r.then(() => { ok++; }, e => falhas.push(nome + ': ' + e.message)));
    else ok++;
  } catch (e) { falhas.push(nome + ': ' + e.message); }
};

const comum = ler('assets/js/views/comum.js');
const app = ler('assets/js/app.js');
const estado = ler('assets/js/estado.js');

t('o estado guarda as falhas de carregamento', () => {
  assert.match(estado, /falhas:\s*new Map\(\)/);
});

t('aguardando() mostra a falha em vez de continuar girando', () => {
  assert.match(comum, /estado\.falhas\.has/, 'aguardando precisa consultar as falhas');
  const i = comum.indexOf('export function aguardando');
  const corpo = comum.slice(i, comum.indexOf('\n}', i));
  assert.ok(corpo.indexOf('estado.falhas.has') < corpo.indexOf('Carregando dados'),
    'a falha tem de ser verificada ANTES de desenhar o spinner');
});

t('o painel de falha diz qual dado faltou e oferece saída', () => {
  assert.match(comum, /data-recarregar/, 'precisa de um botão para tentar de novo');
  assert.match(comum, /estado\.falhas\.get/, 'precisa mostrar o motivo, não só que falhou');
  assert.match(comum, /role="alert"/, 'leitor de tela precisa anunciar');
});

t('cada tratador de erro registra a falha', () => {
  const i = app.indexOf('const erro = (nome');  // há outro `const erro` no login
  const corpo = app.slice(i, app.indexOf('};', i));
  assert.match(corpo, /estado\.falhas\.set/, 'o erro tem de ficar registrado, não só virar toast');
  assert.match(corpo, /atualizarTelaViva/, 'a tela precisa ser redesenhada para mostrar o painel');
});

t('carregar de novo limpa prontos e falhas juntos', () => {
  assert.match(app, /estado\.prontos\.clear\(\);\s*\n\s*estado\.falhas\.clear\(\);/,
    'sobrar falha antiga faria a tela acusar erro já resolvido');
});

t('ficar pronto apaga a falha daquela coleção', () => {
  assert.match(app, /prontos\.add\(nome\);\s*estado\.falhas\.delete\(nome\)/);
});

// A armadilha: o rótulo do toast nem sempre é o nome da coleção em estado.prontos.
// erro('solicitações') registraria a falha sob "solicitações" (com cedilha e acento)
// e aguardando(['solicitacoes']) nunca a encontraria — spinner eterno de novo.
t('rótulos com acento não viram chave de coleção', () => {
  const chamadas = [...app.matchAll(/erro\('([^']+)'(?:,\s*'([^']+)')?\)/g)];
  assert.ok(chamadas.length >= 5, 'esperava vários tratadores de erro');
  const ruins = chamadas
    .map(m => m[2] || m[1])
    .filter(c => /[^a-z_]/.test(c));
  assert.deepEqual(ruins, [], 'estas chaves não batem com o nome da coleção: ' + ruins.join(', '));
});

// "valores" não é uma coleção que a tela espera: quem trava quando ela falha é
// "solicitacoes", porque juntar() só fica pronto com base E valores.
t('a falha de valores é registrada no gate que ela realmente trava', () => {
  assert.ok(!/erro\('valores'\)/.test(app),
    'erro(\'valores\') sozinho registraria uma chave que nenhuma tela espera');
  assert.match(app, /erro\('valores',\s*'solicitacoes'\)/);
});

t('toda coleção exigida por alguma tela pode ser registrada como falha', () => {
  const views = ['admin', 'conferencia', 'controle', 'imprimir', 'relatorio', 'secretarias',
    'simulador', 'exercicio', 'orcamento', 'painel', 'servidores', 'solicitacoes'];
  const exigidas = new Set();
  for (const v of views) {
    const src = ler(`assets/js/views/${v}.js`);
    for (const m of src.matchAll(/aguardando\(el,\s*\[([^\]]*)\]/g)) {
      for (const c of m[1].matchAll(/'([a-z_]+)'/g)) exigidas.add(c[1]);
    }
  }
  assert.ok(exigidas.size >= 6, 'esperava várias coleções exigidas, achei ' + exigidas.size);
  // cada uma precisa aparecer em algum pronto() ou em algum erro() do app
  const semSaida = [...exigidas].filter(c =>
    !new RegExp(`pronto\\('${c}'\\)`).test(app) && !new RegExp(`'${c}'\\)`).test(app));
  assert.deepEqual(semSaida, [], 'coleções sem nenhum caminho de pronto/falha: ' + semSaida.join(', '));
});

// --- cache-busting: o ?v= tem de refletir o conteúdo ---
// views/fiscal.js mudou várias vezes carregando ?v=3.22.0: quem tinha a versão
// antiga em cache continuava com o conferidor velho. O sufixo agora é o hash do
// conteúdo, calculado pelo scripts/versionar-assets.mjs.
t('nenhum ?v= está desatualizado', async () => {
  const { planejar } = await import('../scripts/versionar-assets.mjs');
  const fora = planejar().map(m => m.arquivo);
  assert.deepEqual(fora, [], 'rode: node scripts/versionar-assets.mjs --escrever');
});

t('todo import relativo aponta para arquivo que existe', () => {
  const { readdirSync, statSync, existsSync } = require_fs();
  const arquivos = [];
  (function varrer(d) {
    for (const n of readdirSync(d)) {
      const p = path.join(d, n);
      statSync(p).isDirectory() ? varrer(p) : n.endsWith('.js') && arquivos.push(p);
    }
  })(path.join(raiz, 'assets/js'));
  const quebrados = [];
  for (const f of arquivos) {
    for (const m of readFileSync(f, 'utf8').matchAll(/['"](\.{1,2}\/[^'"?]+\.js)(?:\?v=[^'"]*)?['"]/g)) {
      if (!existsSync(path.resolve(path.dirname(f), m[1]))) quebrados.push(`${path.relative(raiz, f)} -> ${m[1]}`);
    }
  }
  assert.deepEqual(quebrados, []);
});

await Promise.all(pendentes);
console.log(`carregamento: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
