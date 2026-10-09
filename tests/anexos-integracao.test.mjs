import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../assets/js/painel-anexos.js', import.meta.url), 'utf8');
test('somente Google Apps Script HTTPS /exec é aceito', () => {
  assert.match(src, /script\\.google\\.com/);
  assert.match(src, /\\/exec/);
});
test('URL inclui identificador interno e não inclui token', () => {
  assert.match(src, /searchParams\\.set\\('solicitacao', sol\\.id\\)/);
  assert.doesNotMatch(src, /getIdToken|Authorization/);
});
test('painel não abre anexos sem URL configurada', () => {
  assert.match(src, /el\\.replaceChildren\\(\\)/);
});
