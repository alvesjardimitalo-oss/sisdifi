// Pensão alimentícia: uma OP com várias liquidações, o beneficiário no
// histórico de cada uma. E a varredura por servidor da folha, que é o que
// permite saber de quem é cada desconto.
import assert from 'node:assert/strict';
import { varrerServidores, somarRubricas, lotacoesDoResumo,
  servidoresComRepasse, codigosDeDesconto, extrairNome } from '../assets/js/folha-servidores.js';
import { categoriaRubricaDesconto } from '../assets/js/folha-empenhos.js';
import { pensoesParaOP, historicoPensao, chaveCadastro,
  RUBRICAS_PENSAO } from '../assets/js/folha-pensoes.js';

let ok = 0; const falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };
const l = (texto, pagina = 1) => ({ texto, pagina });

// Cabeçalho de lotação como a folha imprime: um nível por linha.
const cabecalho = (lotacao, pagina = 1) => [
  l('LOTAÇÃO: 002 - PREF. MUNIC. DE FREI INOCENCIO', pagina),
  l('002.012 - SECRETARIA MUNIC. DE OBRAS PUBLICAS', pagina),
  l('- MANUT. VIAS/PRAÇAS/JARDINS E CEMITERIOS', pagina),
  l(lotacao.split('.').slice(0, 3).join('.'), pagina),
  l('- PESSOAL EFETIVO', pagina),
  l(lotacao, pagina)];
const servidor = (matricula, nome, rubricas, pagina = 1) => [
  l(matricula + ' / 4 ' + nome + ' 1_20 /0008 -OPERÁRIO BRAÇAL 13/03/2000 EFETIVO', pagina),
  ...rubricas.map(([cod, desc, v]) => l(cod + ' P ' + desc + ' ' + cent(v), pagina))];
const cent = v => (v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

// --- varredura por servidor ---
t('lê matrícula, nome, lotação e rubricas', () => {
  const { servidores } = varrerServidores([...cabecalho('002.012.296.00001'),
    ...servidor('000092', 'VALDEVI DIAS DE ARAUJO', [['100', 'VENCIMENTO MENSAL', 162100], ['232', 'PENSÃO ALIMENTICIA (', 40525]])]);
  assert.equal(servidores.length, 1);
  assert.equal(servidores[0].matricula, '000092');
  assert.equal(servidores[0].nome, 'VALDEVI DIAS DE ARAUJO');
  assert.equal(servidores[0].lotacao, '002.012.296.00001');
  assert.equal(somarRubricas(servidores[0], ['232']), 40525);
});

/* O bloco de um servidor pode ser cortado pela quebra de página: a página
   seguinte reimprime o cabeçalho inteiro — LOTAÇÃO incluída — e as rubricas
   continuam sem nova linha de matrícula. Em outubro isso escondia a pensão de
   504,61 do servidor 001213, cujo bloco começa na página 148 e acaba na 149. */
t('rubricas depois da quebra de página continuam no mesmo servidor', () => {
  const { servidores } = varrerServidores([
    ...cabecalho('002.012.296.00001', 148),
    ...servidor('001213', 'VALDEIR FERNANDES', [['100', 'VENCIMENTO MENSAL', 162100]], 148),
    l('UF: MINAS GERAIS', 149), l('F O L H A D E P A G A M E N T O', 149),
    l('MATRÍCULA NOME DO SERVIDOR NÍVEL/PADRÃO-FUNÇÃO ADMISSÃO SITUAÇÃO', 149),
    ...cabecalho('002.012.296.00001', 149),
    l('221 P EMPRÉSTIMO CAIXA 73/84 498,82', 149),
    l('233 P PENSÃO ALIMENTÍCIA ( 504,61', 149),
    l('TOTAL....: 3.371,68 1.361,62 2.010,06', 149)]);
  assert.equal(servidores.length, 1, 'é o mesmo servidor, não dois');
  assert.equal(servidores[0].matricula, '001213');
  assert.equal(somarRubricas(servidores[0], ['233']), 50461, 'a pensão não pode se perder na quebra');
  assert.equal(somarRubricas(servidores[0], ['100', '221', '233']), 162100 + 49882 + 50461);
});

t('lotação diferente depois do cabeçalho fecha o servidor anterior', () => {
  const { servidores } = varrerServidores([
    ...cabecalho('002.012.296.00001'),
    ...servidor('000092', 'PRIMEIRO SERVIDOR', [['100', 'VENCIMENTO MENSAL', 100000]]),
    ...cabecalho('002.016.002', 2),
    l('232 P PENSÃO ALIMENTICIA ( 405,25', 2)]);
  assert.equal(servidores.length, 1, 'rubrica órfã em outra lotação não vira servidor');
  assert.equal(servidores[0].matricula, '000092');
  assert.equal(somarRubricas(servidores[0], ['232']), 0, 'não pode herdar desconto de outra lotação');
});

t('o resumo decide o que é lotação', () => {
  const linhas = [...cabecalho('002.012.296.00001'), ...servidor('000092', 'X', [['100', 'VENCIMENTO', 100000]])];
  const conhecidas = new Set(['002.012.296.00001']);
  assert.equal(varrerServidores(linhas, conhecidas).servidores[0].lotacao, '002.012.296.00001');
  // '002.012.296' é o nível da ação, não lotação: sem par no resumo, fica pendente.
  const so3 = new Set(['002.016.002']);
  const r = varrerServidores(linhas, so3).servidores[0];
  assert.equal(r.lotacao, '');
  assert.equal(r.lotacaoPendente, '002.012');
});

t('lotacoesDoResumo junta as lotações dos arquivos', () => {
  const s = lotacoesDoResumo([{ registros: [{ lotacao: '002.012.296.00001' }, { lotacao: '002.016.002' }] },
    null, { registros: [{ lotacao: '002.016.002' }] }]);
  assert.deepEqual([...s].sort(), ['002.012.296.00001', '002.016.002']);
});

/* O nível tem duas formas na mesma folha: "1_20 /0073 -" em 511 linhas de
   outubro e um algarismo romano, "II /0032 -", em outras 102. Cobrir só a
   primeira deixava um sexto dos nomes com o cargo e a data grudados — e o nome
   vai no histórico da liquidação de pensão, que a Contabilidade copia. */
t('o nome para no nível, nas duas formas que a folha usa', () => {
  assert.equal(extrairNome('MICHELE LOPES GONÇALVES 1_20 /0073 -MONITOR (SALA DE AULA) 01/01/2026 CONTRATADO'),
    'MICHELE LOPES GONÇALVES');
  assert.equal(extrairNome('GLEISSIKELI GOMES DOS SANTOS II /0032 -PROFESSOR GRADUADO E 03/02/2025 CONTRATADO'),
    'GLEISSIKELI GOMES DOS SANTOS');
  assert.equal(extrairNome('VALDEVI DIAS DE ARAUJO 1_20 /0008 -OPERÁRIO BRAÇAL 13/03/2000 EFETIVO'),
    'VALDEVI DIAS DE ARAUJO');
});

// Em quatro linhas as colunas se sobrepõem no PDF e o nível entra no meio do
// nome: o fim é irrecuperável, mas o cargo e a data não podem sobrar.
t('coluna sobreposta apara o nome, não devolve o cargo', () => {
  const n = extrairNome('THIAGO MARQUES TEIXEIRA DE OLIVEIR1A_20 /0061 -MEDICO PSF 20/01/2020 EFETIVO');
  assert.equal(n, 'THIAGO MARQUES TEIXEIRA DE OLIVEIR');
  assert.ok(!/MEDICO|2020|_/.test(n));
});

t('nenhum nome sai com dígito, sublinhado ou barra', () => {
  for (const linha of [
    'MICHELE LOPES GONÇALVES 1_20 /0073 -MONITOR 01/01/2026 CONTRATADO',
    'GLEISSIKELI GOMES DOS SANTOS II /0032 -PROFESSOR 03/02/2025 CONTRATADO',
    'RODRIGO RODRIGUES PEREIRA DA CRU1Z_20 /0026 -TÉCNICO 01/02/2026 CONTRATADO'])
    assert.ok(!/[\d_\/]/.test(extrairNome(linha)), linha);
  assert.equal(extrairNome(''), '');
});

// --- OP de pensão ---
const empenho = (numero, lotacao, descontos) => ({ empenho: numero, lotacao,
  rubricasDesconto: descontos.map(([codigo, descricao, valor]) => ({ codigo, descricao, valor, categoria: 'Pensao' })) });

t('uma OP só, com uma liquidação por pensão', () => {
  const emp = [empenho(4988, '002.012.296.00001', [['232', 'PENSÃO ALIMENTICIA (25%)', 40525], ['233', 'PENSÃO ALIMENTÍCIA (45%)', 50461]])];
  const { servidores } = varrerServidores([...cabecalho('002.012.296.00001'),
    ...servidor('000092', 'VALDEVI DIAS DE ARAUJO', [['232', 'PENSÃO ALIMENTICIA (', 40525]]),
    ...servidor('001213', 'VALDEIR FERNANDES', [['233', 'PENSÃO ALIMENTÍCIA (', 50461]])]);
  const r = pensoesParaOP(emp, servidores, {});
  assert.equal(r.op.quantidade, 2);
  assert.equal(r.op.total, 90986);
  assert.equal(r.totalEmpenhado, 90986);
  assert.deepEqual(r.avisos, []);
  assert.deepEqual(r.op.liquidacoes.map(x => x.matricula), ['000092', '001213']);
});

// A mesma rubrica em lotações diferentes é outro beneficiário: não se soma.
t('a mesma rubrica em duas lotações são duas liquidações', () => {
  const emp = [empenho(4970, '002.009.266.00004', [['230', 'PENSAO JUDICIAL', 56735]]),
    empenho(5001, '002.016.002', [['230', 'PENSAO JUDICIAL', 48630]])];
  const { servidores } = varrerServidores([
    ...cabecalho('002.009.266.00004'), ...servidor('003684', 'VAGNER B DE JESUS', [['230', 'PENSAO JUDICIAL', 56735]]),
    ...cabecalho('002.016.002', 2), ...servidor('003625', 'RAMON CORREA TELES', [['230', 'PENSAO JUDICIAL', 48630]], 2)]);
  const r = pensoesParaOP(emp, servidores, {});
  assert.equal(r.op.quantidade, 2);
  assert.deepEqual(r.op.liquidacoes.map(x => x.empenho), [4970, 5001], 'cada liquidação sabe de qual empenho veio');
});

t('o beneficiário vem do cadastro e entra no histórico', () => {
  const emp = [empenho(4988, '002.012.296.00001', [['233', 'PENSÃO ALIMENTÍCIA (45%)', 50461]])];
  const { servidores } = varrerServidores([...cabecalho('002.012.296.00001'),
    ...servidor('001213', 'VALDEIR FERNANDES', [['233', 'PENSÃO ALIMENTÍCIA (', 50461]])]);
  const cad = { [chaveCadastro('001213', '233')]: { beneficiario: 'MARIA DAS GRAÇAS F. SILVA', processo: '0001234-56.2019.8.13.0272' } };
  const r = pensoesParaOP(emp, servidores, cad);
  const liq = r.op.liquidacoes[0];
  assert.equal(liq.beneficiario, 'MARIA DAS GRAÇAS F. SILVA');
  assert.equal(liq.pendente, false);
  assert.match(liq.historico, /^Pensão alimentícia a MARIA DAS GRAÇAS F\. SILVA/);
  assert.match(liq.historico, /VALDEIR FERNANDES \(matrícula 001213\)/);
  assert.match(liq.historico, /processo 0001234-56\.2019\.8\.13\.0272/);
  assert.equal(r.pendentes.length, 0);
});

t('sem beneficiário a liquidação fica pendente, mas o valor sai certo', () => {
  const emp = [empenho(4988, '002.012.296.00001', [['233', 'PENSÃO', 50461]])];
  const { servidores } = varrerServidores([...cabecalho('002.012.296.00001'),
    ...servidor('001213', 'VALDEIR FERNANDES', [['233', 'PENSÃO ALIMENTÍCIA (', 50461]])]);
  const r = pensoesParaOP(emp, servidores, {});
  assert.equal(r.pendentes.length, 1);
  assert.equal(r.op.total, 50461);
  assert.match(r.op.liquidacoes[0].historico, /beneficiário a informar/);
});

t('histórico põe o beneficiário na frente, que é o que se procura', () => {
  assert.match(historicoPensao({ beneficiario: 'ANA', servidor: 'JOÃO', matricula: '1', rubrica: '230' }), /^Pensão alimentícia a ANA,/);
  // Sem servidor identificado o histórico ainda sai, sem inventar nome.
  const h = historicoPensao({ beneficiario: 'ANA', rubrica: '230' });
  assert.equal(h, 'Pensão alimentícia a ANA, rubrica 230.');
});

t('folha incompleta é denunciada pela diferença', () => {
  const emp = [empenho(4988, '002.012.296.00001', [['232', 'PENSÃO', 40525], ['233', 'PENSÃO', 50461]])];
  const { servidores } = varrerServidores([...cabecalho('002.012.296.00001'),
    ...servidor('000092', 'VALDEVI', [['232', 'PENSÃO ALIMENTICIA (', 40525]])]);
  const r = pensoesParaOP(emp, servidores, {});
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /não fecha/);
  assert.match(r.avisos[0], /504,61/, 'diz quanto falta');
});

t('empenho com pensão e nenhuma folha pede a folha', () => {
  const r = pensoesParaOP([empenho(4988, '002.012.296.00001', [['232', 'PENSÃO', 40525]])], [], {});
  assert.equal(r.op.quantidade, 0);
  assert.match(r.avisos[0], /folha individual/);
});

t('servidor sem lotação não é atribuído a outro empenho', () => {
  const emp = [empenho(4988, '002.012.296.00001', [['232', 'PENSÃO', 40525]])];
  const servidores = [{ matricula: '000092', nome: 'X', lotacao: '', rubricas: [{ codigo: '232', descricao: 'PENSÃO', valor: 40525 }] }];
  const r = pensoesParaOP(emp, servidores, {});
  assert.equal(r.op.liquidacoes[0].empenho, null);
  assert.match(r.avisos[0], /sem lotação completa/);
});

t('pensão na folha que o resumo não desconta é avisada', () => {
  const emp = [empenho(4988, '002.012.296.00001', [['232', 'PENSÃO', 40525]])];
  const { servidores } = varrerServidores([...cabecalho('002.016.002'),
    ...servidor('003625', 'RAMON', [['230', 'PENSAO JUDICIAL', 48630]])]);
  const r = pensoesParaOP(emp, servidores, {});
  assert.ok(r.avisos.some(a => /não desconta essa rubrica no resumo/.test(a)));
});

t('folha sem pensão devolve OP vazia, não erro', () => {
  const r = pensoesParaOP([], [], {});
  assert.equal(r.op.total, 0);
  assert.deepEqual(r.op.liquidacoes, []);
  assert.deepEqual(r.avisos, []);
  assert.deepEqual(pensoesParaOP().op.liquidacoes, []);
});

t('as três rubricas de pensão estão cobertas', () => {
  assert.deepEqual([...RUBRICAS_PENSAO].sort(), ['230', '232', '233']);
});

// --- o que vai para o registro mensal ---
/* Guardar a folha inteira custava 298 KiB em outubro, contra 37 KiB só com
   quem tem repasse. Quem diz quais códigos são desconto é o resumo: a folha
   sozinha não separa provento de desconto pelo código. */
t('guarda só servidor com desconto de repasse', () => {
  const { servidores } = varrerServidores([...cabecalho('002.012.296.00001'),
    ...servidor('000001', 'SO SALARIO', [['100', 'VENCIMENTO MENSAL', 162100], ['201', 'I.N.S.S.', 29319]]),
    ...servidor('000002', 'COM EMPRESTIMO', [['100', 'VENCIMENTO MENSAL', 162100], ['221', 'EMPRÉSTIMO CAIXA 1/84', 49882]]),
    ...servidor('000003', 'COM PENSAO', [['100', 'VENCIMENTO MENSAL', 162100], ['232', 'PENSÃO ALIMENTICIA (', 40525]])]);
  const codigos = new Set(['201', '221', '232']);
  const r = servidoresComRepasse(servidores, codigos, categoriaRubricaDesconto);
  assert.deepEqual(r.map(s => s.matricula), ['000002', '000003'], 'quem só tem INSS não entra');
  assert.deepEqual(r[0].rubricas.map(x => x.codigo), ['221'], 'o vencimento não é guardado');
});

t('rubrica que o resumo não classificou como desconto fica fora', () => {
  const { servidores } = varrerServidores([...cabecalho('002.012.296.00001'),
    ...servidor('000002', 'X', [['221', 'EMPRÉSTIMO CAIXA 1/84', 49882]])]);
  assert.deepEqual(servidoresComRepasse(servidores, new Set(['232']), categoriaRubricaDesconto), [],
    'sem o código no resumo, não há de onde saber que é desconto');
  assert.deepEqual(servidoresComRepasse(servidores, null, categoriaRubricaDesconto), [],
    'sem o resumo não se inventa desconto');
});

t('codigosDeDesconto junta os códigos dos resumos', () => {
  const c = codigosDeDesconto([
    { registros: [{ rubricasDesconto: [{ codigo: '221' }, { codigo: '201' }] }] },
    null,
    { registros: [{ rubricasDesconto: [{ codigo: '232' }, { codigo: '221' }] }] }]);
  assert.deepEqual([...c].sort(), ['201', '221', '232']);
  assert.equal(codigosDeDesconto().size, 0);
});

// Um empréstimo novo tem de entrar sozinho, sem ninguém editar lista de códigos.
t('empréstimo que o catálogo não conhece ainda é guardado', () => {
  const { servidores } = varrerServidores([...cabecalho('002.012.296.00001'),
    ...servidor('000004', 'Y', [['399', 'EMPRESTIMO BANCO NOVO 1/60', 10000]])]);
  const r = servidoresComRepasse(servidores, new Set(['399']), categoriaRubricaDesconto);
  assert.equal(r.length, 1);
  assert.equal(r[0].rubricas[0].codigo, '399');
});

console.log(`folha-pensoes: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
