// Guarda das suítes: nenhum teste pode encerrar o processo no meio do arquivo.
//
// Um process.exit() antes do fim deixa todo o resto do arquivo sem rodar, e a
// suíte continua verde — foi o que aconteceu com os blocos de ISS por local,
// retenções declaradas e Lei 966/2023, que ficaram ~170 linhas depois de um
// exit e nunca executaram. O CI dizia "passou" sobre teste nenhum.
import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '.');
const arquivos = readdirSync(dir).filter(f => f.endsWith('.test.mjs') && f !== 'suites.test.mjs');
let falhas = [];

for (const f of arquivos) {
  const linhas = readFileSync(path.join(dir, f), 'utf8').split('\n');
  const saidas = [];
  linhas.forEach((l, i) => {
    if (/^\s*process\.exit\(/.test(l)) saidas.push(i + 1);
  });
  if (!saidas.length) continue;
  // depois da última saída só pode haver linha em branco, comentário ou fecho
  const ultima = saidas[saidas.length - 1];
  const resto = linhas.slice(ultima).filter(l => l.trim() && !l.trim().startsWith('//') && l.trim() !== '}');
  if (resto.length) falhas.push(`${f}: process.exit na linha ${ultima}, mas há ${resto.length} linha(s) de teste depois — elas nunca rodam. Primeira: "${resto[0].trim().slice(0, 60)}"`);
  if (saidas.length > 1) falhas.push(`${f}: process.exit em mais de um ponto (${saidas.join(', ')})`);
}

assert.equal(falhas.length, 0, '\n' + falhas.join('\n'));
console.log(`suites: ${arquivos.length} arquivos, nenhum com teste morto depois de process.exit`);
