import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../assets/js/painel-anexos.js', import.meta.url), 'utf8');

test('valida endereço HTTPS /exec do Google Apps Script', () => {
  assert.ok(src.includes("url.protocol !== 'https:'"));
  assert.ok(src.includes("url.hostname !== 'script.google.com'"));
  assert.ok(src.includes('/exec'));
});

test('leva somente o ID interno da solicitação', () => {
  assert.ok(src.includes("url.searchParams.set('solicitacao', sol.id)"));
  assert.ok(!src.includes('getIdToken'));
  assert.ok(!src.includes('Authorization'));
});

test('não mostra o painel quando a URL não está configurada', () => {
  assert.ok(src.includes('el.replaceChildren()'));
});
