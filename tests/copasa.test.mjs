import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lerContaCopasa, ehArquivoCopasa, cadastroCompleto, separarPorEmpenho, linhasPlanilha, memoriaCopasaHTML, historicoCopasa, nomeSecretaria, locaisDaCentralizadora } from '../assets/js/copasa.js';
import { abrirZip } from '../assets/js/xlsx-leitor.js';

const ler = n => new TextDecoder('windows-1252').decode(readFileSync(new URL('./fixtures/copasa/' + n, import.meta.url)));
const adm = lerContaCopasa(ler('mat5649.txt')), edu = lerContaCopasa(ler('mat113863829.txt')), sau = lerContaCopasa(ler('mat113863845.txt'));
const cad = cadastroCompleto();

// cabeçalho e totais batem com as faturas de out/2026
assert.deepEqual([adm.matriculaCliente, adm.fatura, adm.referencia, adm.vencimento, adm.imoveis.length, adm.total], ['5649', '126851608850', '10/2026', '2026-11-25', 20, 193677]);
assert.deepEqual([edu.matriculaCliente, edu.total, edu.imoveis.length], ['113863829', 339156, 6]);
assert.deepEqual([sau.matriculaCliente, sau.total, sau.imoveis.length], ['113863845', 155940, 12]);
assert.equal(nomeSecretaria(sau), 'Secretaria de Saúde');
assert.equal(sau.imoveis.find(i => i.matricula === '22260501').irrf, 169);

// por empenho = planilha COPASA CENTRALIZADORA
const tot = c => Object.fromEntries(separarPorEmpenho(c, cad).grupos.map(g => [g.empenho, g.total]));
assert.deepEqual(tot(edu), { '83/2026': 30125, '84/2026': 96347, '85/2026': 6101, '86/2026': 206583 });
assert.deepEqual(tot(sau), { '87/2026': 97560, '88/2026': 3349, '89/2026': 8693, '90/2026': 46338 });
assert.deepEqual(tot(adm), { '91/2026': 2414, '92/2026': 26264, '93/2026': 99132, '94/2026': 24507, '95/2026': 3564, '97/2026': 37796 });
for (const c of [adm, edu, sau]) { const s = separarPorEmpenho(c, cad); assert.equal(s.pendentes.length, 0); assert.equal(s.grupos.reduce((n, g) => n + g.total, 0), c.total); }

// imóvel novo fica pendente; cadastro salvo prevalece
const nova = { ...edu, imoveis: [...edu.imoveis, { matricula: '999', endereco: 'R NOVA 1', valor: 1000, irrf: 0 }], total: edu.total + 1000 };
assert.equal(separarPorEmpenho(nova, cad).pendentes.length, 1);
const cad2 = cadastroCompleto({ imoveis: { 999: 'L85' }, locais: { L85: { empenhos: { 2027: '40/2027' } }, L99: { nome: 'Escola Nova', centralizadora: '113863829', empenhos: { 2026: '99/2026' } } } });
assert.equal(separarPorEmpenho(nova, cad2).grupos.find(g => g.local === 'L85').total, 7101);
assert.equal(cad2.locais.L85.empenhos[2026], '85/2026'); assert.equal(cad2.locais.L85.empenhos[2027], '40/2027');
assert.equal(locaisDaCentralizadora(cad2, '113863829')[0].centralizadora, '113863829');
// virada do ano: sem empenho cadastrado
assert.deepEqual(separarPorEmpenho({ ...edu, referencia: '01/2027' }, cad).semEmpenho.length, 4);

// saídas
assert.equal(historicoCopasa(edu, { nome: 'Ensino Fundamental' }), 'REFERENTE A CONTA DE AGUA DO MES DE OUTUBRO/2026 - ENSINO FUNDAMENTAL, FATURA 126851617051.');
const pl = linhasPlanilha([edu], cad);
assert.deepEqual(pl.find(l => l[4] === '86/2026').slice(4, 6), ['86/2026', 'Ensino Fundamental']);
assert.ok(pl.some(l => l[5] === 'TOTAL DA FATURA' && l[8] === '3.391,56'));
const html = memoriaCopasaHTML([edu, sau], cad, { geradoEm: 'x' });
assert.equal((html.match(/class="paper"/g) || []).length, 2);
assert.match(html, /86\/2026 · Ensino Fundamental/); assert.match(html, /R\$\s?2\.065,83/); assert.match(html, /IRRF retido/);
assert.throws(() => lerContaCopasa('Dados da Matricula Centralizadora; ;...'));
assert.ok(!ehArquivoCopasa('1    Faturamento'));

// e-mail .zip: acha o mat….txt certo
const zip = await abrirZip(readFileSync(new URL('./fixtures/copasa/email-saude.zip', import.meta.url)));
const txts = [];
for (const n of zip.nomes.filter(n => /\.txt$/i.test(n))) { const t = new TextDecoder('windows-1252').decode(await zip.ler(n)); if (ehArquivoCopasa(t)) txts.push(t); }
assert.equal(txts.length, 1);
assert.equal(lerContaCopasa(txts[0]).total, 155940);
console.log('copasa: ok');
