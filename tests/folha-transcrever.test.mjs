// Assistente de transcrição: a sequência de digitação do empenho.
//
// A Contabilidade digita no sistema da Memory numa ordem fixa — número, ficha,
// fonte, bruto, histórico, depois a janela de liquidação com data e desconto,
// depois a distribuição do desconto, depois as ordens de pagamento, e por fim
// a conferência contra a folha. Os testes travam essa ordem, porque é o que
// faz o assistente servir para digitar em vez de só para auditar.
import assert from 'node:assert/strict';
// dinheiroFolha separa o "R$" com espaço não separável: os literais abaixo
// usam \u00A0 de propósito, senão a comparação falha por um caractere.
import { passosDoEmpenho, conferirEmpenho, montarHistorico, fichasOPpendentes,
  modeloDoEmpenho, textoDoModelo, MODELOS_HISTORICO,
  MODELO_HISTORICO_OP } from '../assets/js/folha-transcrever.js';
import { FICHAS_EXTRA_OP } from '../assets/js/folha-empenhos.js';

let ok = 0; const falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };

const emp = (extra = {}) => ({ empenho: 4916, tipo: 'principal', lotacao: '002.002.204.00002',
  secretaria: 'ADMINISTRAÇÃO', vinculo: 'Efetivos', ficha: '56', fonte: '1500', desdobramento: '0000',
  bruto: 568566, descontoRH: 144873, descontoAjustado: 144873, liquido: 423693, liquidoRH: 437201,
  composicao: { Caixa: 100999, INSS: 43874 }, composicaoTotal: 144873, problemas: [], ...extra });
const op = (extra = {}) => ({ id: 'principal|002.002.204.00002|familia', empenhoReferencia: 4916,
  tipo: 'Salário-família', bruto: 13508, inss: 0, liquido: 13508, ...extra });
const grupos = ps => ps.map(p => p.grupo).filter((g, i, a) => g !== a[i-1]);
const achar = (ps, rotulo) => ps.find(p => p.rotulo === rotulo);

t('a ordem dos grupos é a da digitação no sistema', () => {
  const ps = passosDoEmpenho(emp(), [op()], { dataLiquidacao: '31/10/2026', competencia: '2026-10' });
  assert.deepEqual(grupos(ps), ['Empenho', 'Liquidação', 'Distribuição do desconto', 'Ordem de pagamento']);
});

t('os campos do empenho vêm na ordem em que são digitados', () => {
  const ps = passosDoEmpenho(emp(), [], { competencia: '2026-10' });
  assert.deepEqual(ps.filter(p => p.grupo === 'Empenho').map(p => p.rotulo),
    ['Número do empenho', 'Ficha', 'Fonte de recursos', 'Desdobramento', 'Valor bruto', 'Histórico']);
  assert.deepEqual(ps.filter(p => p.grupo === 'Liquidação').map(p => p.rotulo),
    ['Data da liquidação', 'Valor do desconto']);
});

t('os valores saem em reais, prontos para copiar', () => {
  const ps = passosDoEmpenho(emp(), [], { competencia: '2026-10' });
  assert.equal(achar(ps, 'Valor bruto').valor, 'R$\u00A05.685,66');
  assert.equal(achar(ps, 'Valor do desconto').valor, 'R$\u00A01.448,73');
  assert.equal(achar(ps, 'Número do empenho').valor, '4916');
  assert.ok(achar(ps, 'Valor bruto').copiavel);
});

// Campo que falta é diferente de campo que o sistema não tem como saber.
t('ficha e fonte em branco saem marcadas como faltando', () => {
  const ps = passosDoEmpenho(emp({ ficha: '', fonte: '' }), [], {});
  assert.ok(achar(ps, 'Ficha').faltando);
  assert.ok(achar(ps, 'Fonte de recursos').faltando);
});

t('sem data informada, a liquidação pede a data', () => {
  const ps = passosDoEmpenho(emp(), [], {});
  const data = achar(ps, 'Data da liquidação');
  assert.ok(data.informar);
  assert.ok(!data.copiavel);
  const com = passosDoEmpenho(emp(), [], { dataLiquidacao: '31/10/2026' });
  assert.ok(achar(com, 'Data da liquidação').copiavel);
});

// --- distribuição do desconto ---
t('a distribuição traz só o que tem valor, com a ficha extra', () => {
  const ps = passosDoEmpenho(emp(), [], {});
  const dist = ps.filter(p => p.grupo === 'Distribuição do desconto');
  assert.deepEqual(dist.map(p => [p.rotulo, p.valor, p.ficha]),
    [['Caixa Econômica', 'R$\u00A01.009,99', '21'], ['INSS', 'R$\u00A0438,74', '4']]);
  assert.ok(!dist.some(p => p.rotulo === 'Sicoob'), 'categoria zerada não aparece');
});

t('cada categoria sai com a ficha extra-orçamentária fixa', () => {
  const ps = passosDoEmpenho(emp({ composicao: { INSS: 100, IRRF: 200, Caixa: 300,
    Sicoob: 400, Bradesco: 500, Pensao: 600 }, composicaoTotal: 2100, descontoAjustado: 2100 }), [], {});
  assert.deepEqual(ps.filter(p => p.grupo === 'Distribuição do desconto').map(p => [p.rotulo, p.ficha]),
    [['Caixa Econômica','21'], ['Sicoob','41'], ['Bradesco','42'], ['Pensão alimentícia','8'],
     ['INSS','4'], ['Imposto de Renda','9']]);
});

t('categoria sem ficha extra cadastrada é marcada para informar', () => {
  const ps = passosDoEmpenho(emp({ composicao: { Outros: 23255 }, composicaoTotal: 23255,
    descontoAjustado: 23255 }), [], {});
  const o = achar(ps, 'Outros descontos');
  assert.ok(o.informar);
  assert.match(o.nota, /sem ficha extra/);
});

// --- ordens de pagamento ---
/* A ficha da OP é extra-orçamentária e fixa por tipo de benefício. O sistema
   repetia a ficha ORÇAMENTÁRIA do empenho — 56, 173, 174 em outubro — que não
   serve: ordem de pagamento é despesa extra. */
t('a OP traz a ficha extra fixa do benefício', () => {
  assert.deepEqual(FICHAS_EXTRA_OP,
    { 'Salário-família': '1', 'Salário-maternidade': '31', 'Auxílio-natalidade': '44' });
  const ps = passosDoEmpenho(emp(), [op()], {});
  const f = achar(ps, 'Salário-família — ficha extra');
  assert.equal(f.valor, '1');
  assert.ok(f.copiavel);
  assert.ok(!f.informar);
});

t('o cadastro corrige a ficha extra quando a Contabilidade quiser', () => {
  const com = passosDoEmpenho(emp(), [op()], { fichasOP: { 'Salário-família': '12' } });
  assert.equal(achar(com, 'Salário-família — ficha extra').valor, '12');
});

t('benefício desconhecido pede a ficha extra', () => {
  const ps = passosDoEmpenho(emp(), [op({ tipo: 'Auxílio-funeral', id: 'z' })], {});
  const f = achar(ps, 'Auxílio-funeral — ficha extra');
  assert.ok(f.informar);
  assert.match(f.nota, /vale para os próximos meses/);
});

t('a OP sem desconto não pede desconto', () => {
  const ps = passosDoEmpenho(emp(), [op()], {});
  assert.deepEqual(ps.filter(p => p.grupo === 'Ordem de pagamento').map(p => p.rotulo),
    ['Salário-família — ficha extra', 'Salário-família — valor bruto',
     'Salário-família — histórico', 'Salário-família — nº da OP']);
});

// O INSS da maternidade sai na própria OP, e é por isso que ela tem desconto.
t('a OP de maternidade pede o desconto do INSS', () => {
  const ps = passosDoEmpenho(emp(), [op({ tipo: 'Salário-maternidade', bruto: 219826, inss: 27218,
    liquido: 192608, id: 'x|mat' })], {});
  assert.deepEqual(ps.filter(p => p.grupo === 'Ordem de pagamento').map(p => p.rotulo),
    ['Salário-maternidade — ficha extra', 'Salário-maternidade — valor bruto',
     'Salário-maternidade — desconto (INSS)', 'Salário-maternidade — histórico',
     'Salário-maternidade — nº da OP']);
  assert.equal(achar(ps, 'Salário-maternidade — desconto (INSS)').valor, 'R$\u00A0272,18');
});

t('o nº da OP é informado e volta quando já atribuído', () => {
  const ps = passosDoEmpenho(emp(), [op()], {});
  const n = achar(ps, 'Salário-família — nº da OP');
  assert.ok(n.informar);
  assert.equal(n.chaveOP, 'principal|002.002.204.00002|familia');
  const com = passosDoEmpenho(emp(), [op()], { numerosOP: { 'principal|002.002.204.00002|familia': '460' } });
  assert.equal(achar(com, 'Salário-família — nº da OP').valor, '460');
});

t('duas OPs no mesmo empenho saem em sequência', () => {
  const ps = passosDoEmpenho(emp(), [op(), op({ tipo: 'Salário-maternidade', id: 'y|mat', bruto: 1000 })], {});
  const tipos = ps.filter(p => p.grupo === 'Ordem de pagamento').map(p => p.rotulo.split(' — ')[0]);
  assert.deepEqual([...new Set(tipos)], ['Salário-família', 'Salário-maternidade']);
});

// Os três benefícios de Frei Inocêncio já têm ficha: nada a pedir.
t('fichasOPpendentes só lista benefício sem ficha cadastrada', () => {
  const extras = [op(), op({ id: 'b' }), op({ tipo: 'Salário-maternidade', id: 'c' })];
  assert.deepEqual(fichasOPpendentes(extras, {}), []);
  assert.deepEqual(fichasOPpendentes([op({ tipo: 'Auxílio-funeral', id: 'z' })], {}), ['Auxílio-funeral']);
  assert.deepEqual(fichasOPpendentes([op({ tipo: 'Auxílio-funeral', id: 'z' })],
    { 'Auxílio-funeral': '50' }), []);
  assert.deepEqual(fichasOPpendentes(), []);
});

// --- histórico ---
/* Os textos são os que a Contabilidade já usa, e vão verbatim para o sistema:
   dois deles têm espaço duplo, e não cabe ao SISDIFI "corrigir" isso. */
t('o histórico vem pronto, com o mês preenchido', () => {
  const ps = passosDoEmpenho(emp({ caminho: ['X', 'Y', 'PESSOAL EFETIVO'] }), [], { competencia: '2026-10' });
  assert.equal(achar(ps, 'Histórico').valor,
    'VALOR QUE SE EMPENHA REFERE-SE A PAGAMENTO DE SALARIO DE PESSOAL EFETIVO NO MES DE OUTUBRO.');
  assert.ok(achar(ps, 'Histórico').copiavel);
});

t('o espaçamento do modelo é preservado', () => {
  const h = montarHistorico(textoDoModelo('prefeito'), emp(), '2026-10');
  assert.equal(h, 'VALOR QUE SE EMPENHA REFERE-SE A PAGAMENTO  DE SUBSÍDIO DO PREFEITO NO MES DE OUTUBRO.');
  assert.match(textoDoModelo('decimo'), /DÉCIMO TERCEIRO; NO MES DE/, 'o ponto e vírgula também fica');
});

t('os modelos estão cadastrados e têm a marca do mês', () => {
  assert.equal(MODELOS_HISTORICO.length, 12);
  for (const m of MODELOS_HISTORICO) {
    assert.ok(m.chave && m.rotulo, m.chave);
    assert.match(m.texto, /^VALOR QUE SE EMPENHA REFERE-SE A /, m.chave);
    assert.match(m.texto, /\{mes\}\.$/, m.chave + ': o mês entra no fim');
  }
  assert.deepEqual(MODELOS_HISTORICO.map(m => m.chave),
    ['prefeito','vice','agentePolitico','comissionado','efetivo','contratado',
     'decimo','aposentadoria','rescisao','pensao','estagio','conselhoTutelar']);
});

t('pensão, conselho tutelar e estágio têm o texto da Contabilidade', () => {
  assert.match(textoDoModelo('pensao'), /PAGAMENTO DE PENSOES NO MES DE/);
  assert.match(textoDoModelo('conselhoTutelar'), /REFERE-SE A {2}PAGAMENTO DE CONSELHEIROS TUTELARES/,
    'o espaço duplo é o que ela escreve');
  assert.match(textoDoModelo('estagio'), /PAGAMENTO DE ESTAGIARIOS NO MES DE/);
});

t('pensão e conselho tutelar são reconhecidos pelo texto da lotação', () => {
  const caso = ultimo => modeloDoEmpenho({ tipo: 'principal', caminho: ['A', 'B', ultimo] }, {});
  assert.equal(caso('PENSOES DO RPPS'), 'pensao');
  assert.equal(caso('CONSELHO TUTELAR'), 'conselhoTutelar');
  assert.equal(caso('APOSENTADORIAS RPPS'), 'aposentadoria', 'aposentadoria não virou pensão');
});

/* Estágio não se reconhece pelo nome: a lotação da Ação Social diz só
   "MANUTENCAO DA SEC. DE AÇAO SOCIAL". Quem denuncia é a rubrica 370 sozinha. */
t('estágio é reconhecido pela rubrica 370 sozinha', () => {
  const base = { tipo: 'principal', lotacao: '002.009.266',
    caminho: ['PREF.', 'MANUTENCAO DA SEC. DE AÇAO SOCIAL'] };
  assert.equal(modeloDoEmpenho({ ...base, rubricas: [{ codigo: '370' }] }, {}), 'estagio');
  assert.notEqual(modeloDoEmpenho({ ...base, rubricas: [{ codigo: '370' }, { codigo: '101' }] }, {}), 'estagio',
    'bolsa junto de salário não é lotação de estágio');
  assert.notEqual(modeloDoEmpenho({ ...base, rubricas: [] }, {}), 'estagio');
});

// O vínculo vem do último nível da lotação, e o RH não o escreve de um jeito só.
t('o vínculo é reconhecido nas várias grafias do RH', () => {
  const caso = (ultimo, tipo = 'principal') => modeloDoEmpenho({ tipo, caminho: ['A', 'B', ultimo] }, {});
  for (const x of ['PESSOAL EFETIVO', 'EFETIVOS', 'EFETIVO', 'SERVIDOR EFETIVO', 'SERVIDORES EFETIVOS'])
    assert.equal(caso(x), 'efetivo', x);
  for (const x of ['PESSOAL CONTRATADO', 'CONTRATADOS', 'SERVIDOR CONTRATADO',
    'PESSOAS CONTRATADAS', 'CONTRATADOS/PROCESSO SELETIVO'])
    assert.equal(caso(x), 'contratado', x);
  for (const x of ['COMISSIONADOS', 'PESSOAL COMISSIONADO']) assert.equal(caso(x), 'comissionado', x);
  for (const x of ['AGENTE POLITICO', 'AGENTE POLÍTICO']) assert.equal(caso(x), 'agentePolitico', x);
  assert.equal(caso('APOSENTADORIAS RPPS'), 'aposentadoria');
});

// "VICE PREFEITO" contém "PREFEITO": a ordem do reconhecimento importa.
t('vice-prefeito não é confundido com prefeito', () => {
  assert.equal(modeloDoEmpenho({ tipo: 'principal', caminho: ['A', 'VICE PREFEITO'] }, {}), 'vice');
  assert.equal(modeloDoEmpenho({ tipo: 'principal', caminho: ['A', 'PREFEITO'] }, {}), 'prefeito');
});

// No 13º e na rescisão o texto é o do bloco, qualquer que seja o cargo.
t('o tipo do arquivo manda sobre o vínculo', () => {
  const c = ['A', 'B', 'PESSOAL EFETIVO'];
  assert.equal(modeloDoEmpenho({ tipo: 'decimo', caminho: c }, {}), 'decimo');
  assert.equal(modeloDoEmpenho({ tipo: 'rescisao', caminho: c }, {}), 'rescisao');
  assert.equal(modeloDoEmpenho({ tipo: 'principal', caminho: c }, {}), 'efetivo');
});

/* A lotação do Prefeito tem três níveis, então o último é a ação e não há
   vínculo escrito — mas ela está no Gabinete do Prefeito, e as outras lotações
   de lá dizem o vínculo. Os agentes políticos são secretários de pasta. */
t('o Prefeito é reconhecido pela lotação do Gabinete', () => {
  const prefeito = { tipo: 'principal', lotacao: '002.001.201', secretaria: 'GABINETE DO PREFEITO',
    caminho: ['PREF. MUNIC.', 'MANUT. DO GAB. E SECRET. DE GOVERNO'] };
  assert.equal(modeloDoEmpenho(prefeito, {}), 'prefeito');
  assert.match(achar(passosDoEmpenho(prefeito, [], { competencia: '2026-10' }), 'Histórico').valor,
    /SUBSÍDIO DO PREFEITO NO MES DE OUTUBRO/);
});

t('o vínculo escrito manda, mesmo no Gabinete', () => {
  const base = { tipo: 'principal', secretaria: 'GABINETE DO PREFEITO' };
  assert.equal(modeloDoEmpenho({ ...base, caminho: ['A', 'VICE PREFEITO'] }, {}), 'vice');
  assert.equal(modeloDoEmpenho({ ...base, caminho: ['A', 'COMISSIONADOS'] }, {}), 'comissionado');
  assert.equal(modeloDoEmpenho({ ...base, caminho: ['A', 'AGENTE POLITICO'] }, {}), 'agentePolitico');
});

t('vínculo que nada revela fica para a Contabilidade escolher', () => {
  const desconhecido = { tipo: 'principal', lotacao: '002.020.500.00001',
    secretaria: 'SECRETARIA NOVA', caminho: ['A', 'MANUTENCAO DE ALGUMA COISA'] };
  assert.equal(modeloDoEmpenho(desconhecido, {}), '', 'melhor pedir do que chutar um histórico');
  const h = achar(passosDoEmpenho(desconhecido, [], { competencia: '2026-10' }), 'Histórico');
  assert.ok(h.informar);
  assert.equal(h.valor, '');
  assert.match(h.nota, /vale para os próximos meses/);
});

t('a escolha da Contabilidade vale e é guardada pela lotação', () => {
  const prefeito = { tipo: 'principal', lotacao: '002.001.201', caminho: ['A', 'MANUT. DO GAB.'] };
  const esc = { '002.001.201': 'prefeito' };
  assert.equal(modeloDoEmpenho(prefeito, esc), 'prefeito');
  const ps = passosDoEmpenho(prefeito, [], { competencia: '2026-10', escolhasHistorico: esc });
  assert.match(achar(ps, 'Histórico').valor, /SUBSÍDIO DO PREFEITO NO MES DE OUTUBRO/);
});

// A escolha à mão tem a última palavra, inclusive sobre o 13º e a rescisão.
t('a escolha à mão sobrepõe a detecção', () => {
  const r = { tipo: 'rescisao', lotacao: '002.001.201', caminho: ['A', 'PESSOAL EFETIVO'] };
  assert.equal(modeloDoEmpenho(r, { '002.001.201': 'efetivo' }), 'efetivo');
});

t('texto editado pela Contabilidade substitui o de fábrica', () => {
  const ps = passosDoEmpenho(emp({ caminho: ['A', 'PESSOAL EFETIVO'] }), [],
    { competencia: '2026-10', textosHistorico: { efetivo: 'PAGAMENTO DE SALÁRIO — {mes}/{ano}.' } });
  assert.equal(achar(ps, 'Histórico').valor, 'PAGAMENTO DE SALÁRIO — OUTUBRO/2026.');
});

// Lotação sem modelo entre os nove: texto próprio, guardado por lotação.
t('texto próprio de uma lotação é aceito', () => {
  const nova = { tipo: 'principal', lotacao: '002.020.500.00001', caminho: ['A', 'MANUTENCAO NOVA'] };
  const chave = 'proprio:002.020.500.00001';
  const ps = passosDoEmpenho(nova, [], { competencia: '2026-10',
    escolhasHistorico: { '002.020.500.00001': chave },
    textosHistorico: { [chave]: 'VALOR QUE SE EMPENHA REFERE-SE A PAGAMENTO DE ALGUMA COISA NO MES DE {mes}.' } });
  assert.match(achar(ps, 'Histórico').valor, /ALGUMA COISA NO MES DE OUTUBRO\.$/);
});

t('marca desconhecida não vaza para o histórico', () => {
  assert.equal(montarHistorico('FOLHA {xyz} DE {mes}', emp(), '2026-10'), 'FOLHA DE OUTUBRO');
});

t('campo vazio não deixa traço solto nem espaço duplo', () => {
  const h = montarHistorico('PAGAMENTO - {vinculo} - {secretaria}.', emp({ vinculo: '', secretaria: '' }), '2026-10');
  assert.equal(h, 'PAGAMENTO.');
});

/* O histórico da OP é, por padrão, o empenho a que ela pertence. */
t('a OP traz o histórico do empenho dela', () => {
  assert.equal(MODELO_HISTORICO_OP, 'REFERENTE AO EMPENHO {empenho}/{ano}');
  const ps = passosDoEmpenho(emp(), [op()], { competencia: '2026-10' });
  const h = achar(ps, 'Salário-família — histórico');
  assert.equal(h.valor, 'REFERENTE AO EMPENHO 4916/2026');
  assert.ok(h.copiavel);
});

t('o histórico da OP vem antes do número dela', () => {
  const ps = passosDoEmpenho(emp(), [op()], { competencia: '2026-10' });
  assert.deepEqual(ps.filter(p => p.grupo === 'Ordem de pagamento').map(p => p.rotulo),
    ['Salário-família — ficha extra', 'Salário-família — valor bruto',
     'Salário-família — histórico', 'Salário-família — nº da OP']);
});

t('o histórico da OP pode ser trocado pela Contabilidade', () => {
  const ps = passosDoEmpenho(emp(), [op()], { competencia: '2026-10',
    textosHistorico: { op: 'OP DO EMPENHO {empenho} — {mes}/{ano}' } });
  assert.equal(achar(ps, 'Salário-família — histórico').valor, 'OP DO EMPENHO 4916 — OUTUBRO/2026');
});

// --- conferência ---
/* O total que sai pelo empenho é o líquido dele mais o das OPs — é assim que a
   planilha da Contabilidade soma, e é o que tem de bater com a folha. */
t('a conferência fecha empenho mais OPs contra a folha', () => {
  const c = conferirEmpenho(emp(), [op()]);
  assert.equal(c.liquidoLinha, 437201);
  assert.equal(c.daFolha, 437201);
  assert.ok(c.bateu);
  assert.deepEqual(c.problemas, []);
  assert.deepEqual(c.linhas.map(l => l.rotulo), ['Bruto do empenho', 'Desconto na liquidação',
    'Líquido do empenho', 'Ordens de pagamento (líquido)', 'Total que sai por este empenho']);
  assert.equal(c.linhas[1].valor, -144873, 'o desconto entra negativo, como se lê numa conta');
});

t('empenho sem OP não mostra linha de OP', () => {
  const c = conferirEmpenho(emp({ liquidoRH: 423693 }), []);
  assert.deepEqual(c.linhas.map(l => l.rotulo), ['Bruto do empenho', 'Desconto na liquidação',
    'Líquido do empenho', 'Total que sai por este empenho']);
  assert.ok(c.bateu);
});

t('distribuição que não soma o desconto é denunciada', () => {
  const c = conferirEmpenho(emp({ composicao: { INSS: 43874 }, composicaoTotal: 43874 }), [op()]);
  assert.ok(!c.bateu);
  assert.match(c.problemas[0], /distribuição do desconto soma/);
  assert.match(c.problemas[0], /438,74/);
});

t('total que não casa com a folha é denunciado', () => {
  const c = conferirEmpenho(emp({ liquidoRH: 500000 }), [op()]);
  assert.ok(!c.bateu);
  assert.match(c.problemas[0], /a folha traz/);
});

// "Não bateu" é conta que não fecha; pendência é campo a preencher.
t('pendência de preenchimento não é tratada como diferença', () => {
  const c = conferirEmpenho(emp({ problemas: ['Escolher a fonte de recursos'] }), [op()]);
  assert.ok(c.bateu, 'a conta fecha');
  assert.deepEqual(c.problemas, []);
  assert.deepEqual(c.pendencias, ['Escolher a fonte de recursos']);
});

t('sem líquido da folha não inventa diferença', () => {
  const c = conferirEmpenho(emp({ liquidoRH: null }), [op()]);
  assert.equal(c.daFolha, null);
  assert.ok(c.bateu);
});

t('empenho vazio não quebra', () => {
  const c = conferirEmpenho();
  assert.equal(c.liquidoLinha, 0);
  assert.deepEqual(passosDoEmpenho().filter(p => p.grupo === 'Ordem de pagamento'), []);
});

console.log(`folha-transcrever: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
