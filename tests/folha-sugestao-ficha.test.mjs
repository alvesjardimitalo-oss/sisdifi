// Sugestão da ficha a partir da lotação do RH.
//
// A ficha de pessoal é sempre um par na mesma ação: 3.1.90.04 para contratado
// por tempo determinado e 3.1.90.11 para os demais vínculos. O último nível da
// lotação diz o vínculo; o nível acima dele diz a ação, por extenso.
//
// O código da lotação do RH não corresponde ao da ação do orçamento, então o
// casamento é pelo nome — e por isso a sugestão vem com grau de confiança. Ela
// é ponto de partida para a Contabilidade trocar conforme o saldo, nunca
// decisão automática.
//
// Medido contra outubro/2026: 79 das 86 lotações com ficha conhecida.
import assert from 'node:assert/strict';
import { sugerirFichaDaLotacao, elementoDoVinculo, EDUCACAO_2026,
  FICHAS_FIXAS_2026, DESDOBRAMENTO_PADRAO, fontesParaEscolher,
  NOMES_FONTE } from '../assets/js/folha-orcamento-2026.js';

let ok = 0; const falhas = [];
const t = (nome, fn) => { try { fn(); ok++; } catch (e) { falhas.push(nome + ': ' + e.message); } };
const reg = (lotacao, caminho, rubricas = []) => ({ lotacao, caminho, rubricas });

t('o vínculo escolhe o elemento', () => {
  assert.equal(elementoDoVinculo('PESSOAL CONTRATADO'), '04');
  assert.equal(elementoDoVinculo('CONTRATADOS'), '04');
  assert.equal(elementoDoVinculo('PESSOAL EFETIVO'), '11');
  assert.equal(elementoDoVinculo('COMISSIONADOS'), '11');
  assert.equal(elementoDoVinculo('AGENTE POLITICO'), '11');
});

t('aposentadoria e pensão não são ficha de pessoal ativo', () => {
  assert.equal(elementoDoVinculo('APOSENTADORIAS RPPS'), '');
  assert.equal(elementoDoVinculo('PENSOES DO RPPS'), '');
});

// Aposentadoria, pensão e estágio não têm par 04/11: a ficha é fixa na LOA.
t('aposentadoria e pensão saem na ficha fixa da Administração', () => {
  const caminho = ['SECRETARIA MUNIC. DE ADMINISTRACAO', 'PAGAMENTO DE INATIVOS E PENSIONISTAS'];
  const apos = sugerirFichaDaLotacao(reg('002.002.209.00001', [...caminho, 'APOSENTADORIAS RPPS']));
  assert.equal(apos.ficha, '81');
  assert.equal(apos.fonte, '1500');
  assert.equal(apos.confianca, 'confirmada');
  assert.match(apos.motivo, /3\.1\.90\.01/);
  const pens = sugerirFichaDaLotacao(reg('002.002.209.00002', [...caminho, 'PENSOES DO RPPS']));
  assert.equal(pens.ficha, '82');
  assert.match(pens.motivo, /3\.1\.90\.03/);
});

// As duas dividem a mesma ação: só o nível do vínculo separa.
t('a ação em comum não decide entre aposentadoria e pensão', () => {
  const caminho = ['SECRETARIA MUNIC. DE ADMINISTRACAO', 'MANUTENCAO INATIVOS E PENSIONISTAS'];
  assert.equal(sugerirFichaDaLotacao(reg('002.002.209.00001', [...caminho, 'INATIVOS'])).ficha, '81');
  assert.equal(sugerirFichaDaLotacao(reg('002.002.209.00002', [...caminho, 'PENSIONISTAS'])).ficha, '82');
});

t('estágio sai na 303, serviços de terceiros', () => {
  const s = sugerirFichaDaLotacao(reg('002.009.266',
    ['SECRETARIA MUNIC. DE ACAO SOCIAL', 'MANUTENCAO DA SEC. DE AÇAO SOCIAL'],
    [{ codigo: '370', descricao: 'BOLSA ESTAGIO', valor: 1173900 }]));
  assert.equal(s.ficha, '303');
  assert.equal(s.confianca, 'confirmada');
  assert.match(s.motivo, /3\.3\.90\.36/);
  assert.equal(s.fonte, '', 'a 303 tem mais de uma fonte: quem escolhe é a Contabilidade');
});

// Uma rubrica de salário ao lado da bolsa significa que não é lotação de estágio.
t('bolsa junto de salário não é lotação de estágio', () => {
  const s = sugerirFichaDaLotacao(reg('002.009.266',
    ['SECRETARIA MUNIC. DE ACAO SOCIAL', 'MANUTENCAO DA SEC. DE AÇAO SOCIAL', 'PESSOAL EFETIVO'],
    [{ codigo: '370', valor: 100000 }, { codigo: '101', valor: 500000 }]));
  assert.notEqual(s.ficha, '303');
});

// --- educação: regra fechada com a Contabilidade ---
t('educação sai confirmada, com fonte e desdobramento', () => {
  const s = sugerirFichaDaLotacao(reg('002.004.215.00001',
    ['SECRETARIA MUNIC. DE EDUCACAO', 'MANUTENÇAO CRECHE 70%', 'PESSOAL CONTRATADO']));
  assert.equal(s.ficha, '186');
  assert.equal(s.fonte, '1540');
  assert.equal(s.desdobramento, '1071');
  assert.equal(s.confianca, 'confirmada');
});

t('o vínculo escolhe qual ficha do par', () => {
  const caminho = ['SECRETARIA MUNIC. DE EDUCACAO', 'MANUT. ENSINO FUNDAMENTAL 70%'];
  assert.equal(sugerirFichaDaLotacao(reg('002.004.217.00001', [...caminho, 'PESSOAL CONTRATADO'])).ficha, '173');
  assert.equal(sugerirFichaDaLotacao(reg('002.004.217.00002', [...caminho, 'PESSOAL EFETIVO'])).ficha, '174');
  assert.equal(sugerirFichaDaLotacao(reg('002.004.217.00006', [...caminho, 'COMISSIONADOS'])).ficha, '174');
});

// O 70% e o 30% usam a MESMA ficha e diferem no desdobramento; o tempo integral
// tem código próprio. Nome nenhum revela isso — vem da regra.
t('o desdobramento separa 70%, 30% e tempo integral', () => {
  const s = l => sugerirFichaDaLotacao(reg(l + '.00002',
    ['SECRETARIA MUNIC. DE EDUCACAO', 'X', 'PESSOAL EFETIVO']));
  assert.equal(s('002.004.217').desdobramento, '1071');
  assert.equal(s('002.004.221').desdobramento, '0000');
  assert.equal(s('002.004.230').desdobramento, '1073');
  assert.equal(s('002.004.217').ficha, s('002.004.221').ficha, 'mesma ficha, desdobramento diferente');
});

t('a tabela da educação cobre os sete grupos', () => {
  assert.deepEqual(Object.keys(EDUCACAO_2026).sort(), ['002.004.214', '002.004.215', '002.004.217',
    '002.004.219', '002.004.221', '002.004.223', '002.004.230']);
  for (const [g, v] of Object.entries(EDUCACAO_2026)) {
    assert.ok(v['04'] && v['11'], g + ' precisa do par de fichas');
    assert.match(v.fonte, /^1\d{3}$/, g + ': fonte no código curto, como vai no empenho');
  }
});

// --- demais secretarias: casamento por nome ---
t('casa a ação pelo nome', () => {
  const s = sugerirFichaDaLotacao(reg('002.012.296.00001',
    ['SECRETARIA MUNIC. DE OBRAS PUBLICAS', 'MANUT. VIAS/PRAÇAS/JARDINS E CEMITERIO', 'PESSOAL EFETIVO']));
  assert.equal(s.ficha, '399');
  assert.equal(s.confianca, 'provavel');
});

t('a unidade do resumo não separa Secretaria, Fundo e Hospital — a ação separa', () => {
  const hosp = sugerirFichaDaLotacao(reg('002.005.250.00002',
    ['SECRETARIA MUNIC. DE SAUDE', 'MANUT. ATIV. HOSPITAL MUNICIPAL', 'PESSOAL EFETIVO']));
  assert.equal(hosp.ficha, '267');
  const sec = sugerirFichaDaLotacao(reg('002.005.231.00001',
    ['SECRETARIA MUNIC. DE SAUDE', 'MANUTENÇÃO SECRETARIA DE SAUDE', 'PESSOAL EFETIVO']));
  assert.equal(sec.ficha, '206', 'as duas dizem SAUDE na unidade; só a ação distingue');
});

// Dez das 93 lotações têm três níveis: a hierarquia pula a ação e o 3º nível já
// é o vínculo. Aí só resta a unidade para casar.
t('lotação sem nome de ação casa pela secretaria', () => {
  const s = sugerirFichaDaLotacao(reg('002.013.002',
    ['SECRETARIA MUNIC. DE TRANSPORTES', 'PESSOAL EFETIVO']));
  assert.equal(s.ficha, '417');
});

// "TRANSPORTES" no resumo, "TRANSPORTE" no orçamento: sem tirar o plural,
// quatro lotações de Transportes casavam com o Gabinete do Prefeito.
t('plural não atrapalha o casamento', () => {
  for (const vinculo of ['PESSOAL EFETIVO', 'COMISSIONADOS', 'AGENTE POLITICO']) {
    const s = sugerirFichaDaLotacao(reg('002.013.003', ['SECRETARIA MUNIC. DE TRANSPORTES', vinculo]));
    assert.equal(s.ficha, '417', vinculo);
  }
  const contratado = sugerirFichaDaLotacao(reg('002.013.001', ['SECRETARIA MUNIC. DE TRANSPORTES', 'PESSOAL CONTRATADO']));
  assert.equal(contratado.ficha, '416');
});

t('ação que não se parece com nada vira incerta', () => {
  const s = sugerirFichaDaLotacao(reg('002.099.999.00001',
    ['SECRETARIA DE COISA NENHUMA', 'ACAO QUE NAO EXISTE NO ORCAMENTO', 'PESSOAL EFETIVO']));
  assert.equal(s.confianca, 'incerta');
  assert.match(s.motivo, /Nenhuma ação do orçamento/);
});

t('ficha com mais de uma fonte não presume a fonte', () => {
  const s = sugerirFichaDaLotacao(reg('002.005.235.00002',
    ['SECRETARIA MUNIC. DE SAUDE', 'MANUTENÇAO ATENÇÃO BASICA', 'PESSOAL EFETIVO']));
  assert.equal(s.ficha, '227');
  assert.equal(s.fonte, '', 'a ficha 227 admite 1500, 1600, 1605 e 1621: quem escolhe é a Contabilidade');
});

t('toda sugestão diz o porquê', () => {
  const casos = [
    reg('002.004.215.00001', ['SECRETARIA MUNIC. DE EDUCACAO', 'MANUTENÇAO CRECHE 70%', 'PESSOAL CONTRATADO']),
    reg('002.013.002', ['SECRETARIA MUNIC. DE TRANSPORTES', 'PESSOAL EFETIVO']),
    reg('002.002.209.00001', ['SECRETARIA MUNIC. DE ADMINISTRACAO', 'PAGAMENTO DE INATIVOS', 'APOSENTADORIAS RPPS'])
  ];
  for (const c of casos) {
    const s = sugerirFichaDaLotacao(c);
    assert.ok(s.motivo, 'sem motivo em ' + c.lotacao);
    assert.ok(s.ficha, 'sem ficha em ' + c.lotacao);
    assert.ok(['confirmada', 'provavel', 'incerta', 'manual'].includes(s.confianca), s.confianca);
  }
});

/* "os demais servidores são 0000, com exceção do pessoal do tempo integral":
   0000 é o desdobramento neutro e vale para todo empenho, não só na educação. */
t('fora da educação o desdobramento é 0000', () => {
  assert.equal(DESDOBRAMENTO_PADRAO, '0000');
  const s = sugerirFichaDaLotacao(reg('002.012.296.00001',
    ['SECRETARIA MUNIC. DE OBRAS PUBLICAS', 'MANUT. VIAS/PRAÇAS/JARDINS E CEMITERIO', 'PESSOAL EFETIVO']));
  assert.equal(s.desdobramento, '0000');
  const t3 = sugerirFichaDaLotacao(reg('002.013.002', ['SECRETARIA MUNIC. DE TRANSPORTES', 'PESSOAL EFETIVO']));
  assert.equal(t3.desdobramento, '0000');
});

/* A LOA publica 1.500.000.0000 nas fichas de educação e saúde pagas com
   imposto, mas o empenho leva o pactuado: 1001 no mínimo da educação (25%) e
   1002 no da saúde (15%). */
t('educação em recurso próprio sai no pactuado 1001', () => {
  const s = sugerirFichaDaLotacao(reg('002.004.214.00002',
    ['SECRETARIA MUNIC. DE EDUCACAO', 'MANUT. SECRETARIA MUNICIPAL DE EDUCAÇÃO', 'PESSOAL EFETIVO']));
  assert.equal(s.ficha, '108');
  assert.equal(s.fonte, '1001', 'Secretaria de Educação é educação fora do FUNDEB');
});

t('saúde em recurso próprio sai no pactuado 1002', () => {
  const s = sugerirFichaDaLotacao(reg('002.005.231.00001',
    ['SECRETARIA MUNIC. DE SAUDE', 'MANUTENÇÃO SECRETARIA DE SAUDE', 'PESSOAL EFETIVO']));
  assert.equal(s.ficha, '206');
  assert.equal(s.fonte, '1002');
});

t('fora da educação e da saúde, recurso próprio é 1500', () => {
  const s = sugerirFichaDaLotacao(reg('002.012.296.00001',
    ['SECRETARIA MUNIC. DE OBRAS PUBLICAS', 'MANUT. VIAS/PRAÇAS/JARDINS E CEMITERIO', 'PESSOAL EFETIVO']));
  assert.equal(s.fonte, '1500');
});

t('ficha com mais de uma fonte continua sem fonte sugerida', () => {
  const s = sugerirFichaDaLotacao(reg('002.005.235.00002',
    ['SECRETARIA MUNIC. DE SAUDE', 'MANUTENÇAO ATENÇÃO BASICA', 'PESSOAL EFETIVO']));
  assert.equal(s.fonte, '', 'depende de onde o dinheiro entrou: quem decide é a Contabilidade');
});

/* Saúde tem várias fontes e a escolha depende de onde o dinheiro entrou:
   farmácia, vigilância sanitária e atenção básica podem sair pela 1621, do
   Estado. O sistema oferece a lista; não adivinha. */
t('a lista de fontes cobre as do orçamento, com nome', () => {
  const fs = fontesParaEscolher();
  const codigos = fs.map(f => f.codigo);
  for (const c of ['1001', '1002', '1500', '1540', '1542', '1600', '1604', '1605', '1621', '1660'])
    assert.ok(codigos.includes(c), 'falta a fonte ' + c);
  for (const f of fs) assert.ok(f.rotulo, 'fonte ' + f.codigo + ' sem nome');
  assert.deepEqual(codigos, [...codigos].sort(), 'em ordem de código');
  assert.equal(new Set(codigos).size, codigos.length, 'sem repetição');
  assert.match(NOMES_FONTE['1621'], /Estadual/);
});

t('as fichas fixas trazem a natureza conferida na LOA', () => {
  assert.equal(FICHAS_FIXAS_2026.aposentadoria.natureza, '3.1.90.01.00');
  assert.equal(FICHAS_FIXAS_2026.pensao.natureza, '3.1.90.03.00');
  assert.equal(FICHAS_FIXAS_2026.estagio.natureza, '3.3.90.36.00');
});

console.log(`folha-sugestao-ficha: ${ok} ok, ${falhas.length} falhas`);
falhas.forEach(f => console.log('  ✗ ' + f));
process.exit(falhas.length ? 1 : 0);
