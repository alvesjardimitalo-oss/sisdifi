#!/usr/bin/env node
// Acerta o ?v= dos arquivos: no index.html e nos imports que já usam versão.
//
// O ?v= existe para o navegador buscar a versão nova em vez da que está em cache.
// Quando alguém mexe no arquivo e esquece de subir o número, quem já abriu o
// sistema continua com o código velho — e o bug "só acontece no computador dele"
// nasce aí. Em vez de confiar na memória, o sufixo passa a ser o hash do
// conteúdo: mudou o arquivo, muda o endereço, sozinho.
//
// O hash de um arquivo é calculado SOBRE O CONTEÚDO JÁ COM OS IMPORTS ACERTADOS.
// Então mudar um módulo folha muda o hash dele, o que muda o texto de quem o
// importa, o que muda o hash desse também — a correção sobe sozinha até o
// index.html. Por isso o cálculo repete até estabilizar.
//
//   node scripts/versionar-assets.mjs            → mostra o que está desatualizado
//   node scripts/versionar-assets.mjs --escrever → corrige os arquivos
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const raiz = path.join(import.meta.dirname, '..');
const curto = h => h.slice(0, 8);

function listarJs(dir = path.join(raiz, 'assets/js'), saida = []) {
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) listarJs(p, saida);
    else if (nome.endsWith('.js')) saida.push(path.relative(raiz, p));
  }
  return saida;
}

// Só mexe em referência que JÁ tem ?v=: ligar versão em import que não tem é
// decisão de quem mantém o sistema, não deste script.
const IMPORT_VERSIONADO = /(['"])(\.{1,2}\/[^'"?]+\.js)\?v=([^'"]+)\1/g;
const REF_HTML = /(href|src)="(assets\/[^"?]+\.(?:css|js))\?v=([^"]+)"/g;

const semver = v => String(v).split('.').slice(0, 3).join('.');

/**
 * Calcula, para cada arquivo, o conteúdo com os imports acertados e o hash dele.
 * Repete até estabilizar; se não estabilizar, há ciclo de import versionado e o
 * script para em vez de gravar algo que oscila a cada execução.
 */
export function calcular() {
  const arquivos = listarJs();
  const original = new Map(arquivos.map(f => [f, readFileSync(path.join(raiz, f), 'utf8')]));
  let hashes = new Map(arquivos.map(f => [f, curto(createHash('sha256').update(original.get(f)).digest('hex'))]));
  let conteudo = new Map();

  for (let passo = 0; passo < 50; passo++) {
    const novoConteudo = new Map();
    for (const f of arquivos) {
      novoConteudo.set(f, original.get(f).replace(IMPORT_VERSIONADO, (inteiro, aspas, rel, versao) => {
        const alvo = path.relative(raiz, path.resolve(path.dirname(path.join(raiz, f)), rel));
        const h = hashes.get(alvo);
        if (!h) return inteiro;                       // import para fora de assets/js: deixa como está
        return `${aspas}${rel}?v=${semver(versao)}.${h}${aspas}`;
      }));
    }
    const novoHashes = new Map(arquivos.map(f => [f, curto(createHash('sha256').update(novoConteudo.get(f)).digest('hex'))]));
    const estavel = arquivos.every(f => novoHashes.get(f) === hashes.get(f));
    hashes = novoHashes; conteudo = novoConteudo;
    if (estavel) return { arquivos, original, conteudo, hashes };
  }
  throw new Error('Os imports versionados não estabilizam: provável ciclo de import. Resolva o ciclo antes de versionar.');
}

export function planejar() {
  const { arquivos, original, conteudo, hashes } = calcular();
  const mudancas = [];
  for (const f of arquivos) if (conteudo.get(f) !== original.get(f)) mudancas.push({ arquivo: f, texto: conteudo.get(f) });

  const htmlRel = 'index.html';
  const html = readFileSync(path.join(raiz, htmlRel), 'utf8');
  const novoHtml = html.replace(REF_HTML, (inteiro, attr, rel, versao) => {
    const h = hashes.get(rel) || curto(createHash('sha256').update(readFileSync(path.join(raiz, rel))).digest('hex'));
    return `${attr}="${rel}?v=${semver(versao)}.${h}"`;
  });
  if (novoHtml !== html) mudancas.push({ arquivo: htmlRel, texto: novoHtml });
  return mudancas;
}

if (import.meta.filename === process.argv[1]) {
  const mudancas = planejar();
  if (!mudancas.length) { console.log('versionar-assets: tudo em dia.'); process.exit(0); }
  for (const m of mudancas) console.log('  desatualizado: ' + m.arquivo);
  if (process.argv.includes('--escrever')) {
    for (const m of mudancas) writeFileSync(path.join(raiz, m.arquivo), m.texto);
    console.log(`versionar-assets: ${mudancas.length} arquivo(s) corrigido(s).`);
    process.exit(0);
  }
  console.log('\nRode com --escrever para corrigir.');
  process.exit(1);
}
