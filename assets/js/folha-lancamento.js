// Lançamento da folha: uma linha por empenho, só com o que se digita.
//
// É o que a Contabilidade precisa ter na frente para lançar:
//   empenho/ano · ficha · fonte · valor bruto · histórico
//   desconto da liquidação e a composição (INSS, Caixa, Sicoob, Bradesco,
//   pensão, IR)
//   ordens de pagamento extra (salário-família, maternidade, natalidade), com
//   valor, desconto e histórico
//   e a prova: bruto − desconto + OP − desconto da OP = total líquido do
//   Resumo de Verbas daquela lotação.
//
// A lotação não aparece na linha: ela só serve para achar a ficha. A conta
// também não: é planejamento, não lançamento.
//
// O outro serviço daqui é a fonte pelo saldo. A Contabilidade olha o saldo das
// fontes estaduais e federais, vê quais empenhos cabem nelas até o saldo
// acabar e manda o resto para o recurso próprio. distribuirFontesPorSaldo()
// faz essa conta e devolve uma PROPOSTA — quem aplica é a Contabilidade.
import { CATEGORIAS_DESCONTOS, dinheiroFolha } from './folha-empenhos.js';
import { modeloDoEmpenho, textoDoModelo, montarHistorico, MODELO_HISTORICO_OP } from './folha-transcrever.js';
import { ESPELHO_RECURSO_PROPRIO, codigoFonte } from './folha-saldos.js';

/* Recurso próprio: o que sobra vai para cá. 1500 é o não vinculado; 1001 e
   1002 são os pactuados da educação e da saúde. */
export const FONTES_PROPRIAS = ['1500', '1001', '1002'];
const ehPropria = f => FONTES_PROPRIAS.includes(codigoFonte(f));

/* Fontes presas a uma categoria de servidor: 1604 paga só agente comunitário
   de saúde e 1605 só o piso da enfermagem. A ficha da atenção básica admite as
   duas, mas dar o saldo da 1604 ao primeiro empenho da atenção básica pagaria
   médico com dinheiro de ACS. Então elas só ficam onde a Contabilidade já as
   pôs — consomem o saldo, mas não são oferecidas a outro empenho. */
export const FONTES_DE_CATEGORIA = ['1604', '1605'];

/** Colunas da composição, na ordem em que a liquidação é detalhada. */
export const COLUNAS_DESCONTO = [
  { chave: 'INSS', rotulo: 'INSS' },
  { chave: 'Caixa', rotulo: 'Caixa' },
  { chave: 'Sicoob', rotulo: 'Sicoob' },
  { chave: 'Bradesco', rotulo: 'Bradesco' },
  { chave: 'Pensao', rotulo: 'Pensão' },
  { chave: 'IRRF', rotulo: 'IR' },
  { chave: 'Outros', rotulo: 'Outros' }
];

const num = v => (Number.isSafeInteger(v) ? v : 0);

/**
 * Composição do desconto que vai na liquidação.
 *
 * O INSS da servidora em salário-maternidade sai do empenho e vai para a OP
 * (`maisInssExtra`), então o INSS da liquidação é o do RH menos esse valor —
 * senão a composição soma mais que o desconto e a linha nunca bate.
 */
export function composicaoDaLiquidacao(empenho = {}) {
  const comp = {};
  for (const c of CATEGORIAS_DESCONTOS) comp[c] = num(empenho.composicao?.[c]);
  comp.INSS -= num(empenho.maisInssExtra);
  return comp;
}

/**
 * Uma linha de lançamento por empenho.
 *
 * `ops` são as ordens de pagamento daquele empenho (previsao.extras filtradas
 * por empenhoReferencia). `opcoes`: competencia ('2026-11'), numerosOP,
 * escolhasHistorico, textosHistorico — os mesmos do assistente de transcrição.
 */
export function linhaDeLancamento(empenho = {}, ops = [], opcoes = {}) {
  const { competencia = '', numerosOP = {}, escolhasHistorico = {}, textosHistorico = {} } = opcoes;
  const ano = String(competencia).slice(0, 4);
  const chaveModelo = modeloDoEmpenho(empenho, escolhasHistorico);
  const modelo = chaveModelo ? (textosHistorico[chaveModelo] || textoDoModelo(chaveModelo)) : '';
  const historico = modelo ? montarHistorico(modelo, empenho, competencia) : '';
  const bruto = num(empenho.bruto);
  const desconto = num(empenho.descontoAjustado ?? empenho.descontoRH);
  const composicao = composicaoDaLiquidacao(empenho);
  const somaComposicao = Object.values(composicao).reduce((n, v) => n + v, 0);
  const historicoOP = montarHistorico(textosHistorico.op || MODELO_HISTORICO_OP, empenho, competencia);
  const linhasOP = (ops || []).map(o => ({
    id: o.id, tipo: o.tipo, ficha: o.ficha || '', numero: numerosOP[o.id] || '',
    valor: num(o.bruto), desconto: num(o.inss), liquido: num(o.bruto) - num(o.inss),
    historico: historicoOP
  }));
  const liquidoOP = linhasOP.reduce((n, o) => n + o.liquido, 0);
  const calculado = bruto - desconto + liquidoOP;
  const resumo = Number.isSafeInteger(empenho.liquidoRH) ? empenho.liquidoRH : null;

  const falta = [];
  if (!empenho.ficha) falta.push('ficha');
  if (!empenho.fonte) falta.push('fonte');
  if (!historico) falta.push('histórico');
  const diferencas = [];
  if (somaComposicao !== desconto)
    diferencas.push('Os itens do desconto somam ' + dinheiroFolha(somaComposicao) +
      ' e o desconto é ' + dinheiroFolha(desconto) + ' (diferença ' + dinheiroFolha(desconto - somaComposicao) + ').');
  if (resumo == null) diferencas.push('O total líquido desta lotação não foi lido no Resumo de Verbas.');
  else if (calculado !== resumo)
    diferencas.push('Bruto − desconto + OP dá ' + dinheiroFolha(calculado) + ' e o Resumo de Verbas traz ' +
      dinheiroFolha(resumo) + ' (diferença ' + dinheiroFolha(resumo - calculado) + ').');

  return {
    id: empenho.id, tipo: empenho.tipo, numero: empenho.empenho,
    empenhoAno: empenho.empenho != null ? empenho.empenho + (ano ? '/' + ano : '') : '',
    ficha: String(empenho.ficha || ''), fonte: String(empenho.fonte || ''),
    desdobramento: String(empenho.desdobramento || ''),
    bruto, historico, chaveModelo, desconto, composicao, somaComposicao,
    ops: linhasOP, liquidoEmpenho: bruto - desconto, liquidoOP, calculado, resumo,
    diferenca: resumo == null ? null : resumo - calculado,
    bateu: !diferencas.length, diferencas, falta
  };
}

/** Todas as linhas da folha, na ordem dos empenhos, e os totais. */
export function linhasDeLancamento(previsao = {}, opcoes = {}) {
  const porEmpenho = {};
  for (const x of previsao.extras || []) (porEmpenho[x.empenhoReferencia] ??= []).push(x);
  // OP pelo número do empenho e, se a numeração mudou, pela lotação (id da OP = id do empenho + '|…').
  const opsDe = e => {
    const pelaLotacao = (previsao.extras || []).filter(x => String(x.id || '').startsWith(e.id + '|'));
    return pelaLotacao.length ? pelaLotacao : porEmpenho[e.empenho] || [];
  };
  const linhas = (previsao.empenhos || []).map(e => linhaDeLancamento(e, opsDe(e), opcoes));
  const soma = k => linhas.reduce((n, l) => n + (l[k] || 0), 0);
  const composicao = {};
  for (const c of CATEGORIAS_DESCONTOS) composicao[c] = linhas.reduce((n, l) => n + l.composicao[c], 0);
  return {
    linhas,
    totais: { bruto: soma('bruto'), desconto: soma('desconto'), liquidoOP: soma('liquidoOP'),
      calculado: soma('calculado'), resumo: soma('resumo'), composicao },
    bateram: linhas.filter(l => l.bateu).length,
    naoBateram: linhas.filter(l => !l.bateu).length,
    incompletas: linhas.filter(l => l.falta.length).length
  };
}

/**
 * Fonte de cada empenho pelo saldo das fontes estaduais e federais.
 *
 * `saldos` é [{ fonte, saldo }] em centavos, na ordem de preferência — ou
 * { fonte: centavos }, aí na ordem do código. Só as fontes vinculadas contam;
 * duas contas da mesma fonte somam.
 * Fonte sem saldo informado não recebe nada — o sistema não presume saldo.
 *
 * Percorre os empenhos na ordem da folha. Para cada um, olha as fontes
 * vinculadas que a FICHA admite e que têm saldo informado, na ordem em que os
 * saldos foram digitados, e põe o empenho na primeira que ainda o cobre
 * inteiro. O saldo é comparado com o BRUTO: tudo sai da mesma conta.
 * Se nenhuma cobre, o empenho vai para o recurso próprio da mesma ficha
 * (1500, ou 1001/1002 na educação e na saúde) ou, no FUNDEB, para a ficha
 * espelho em recurso próprio.
 *
 * O empenho vai inteiro para uma fonte: repartir exigiria repartir o INSS e o
 * IR de cada servidor, que não se repartem.
 *
 * `fichaInfo(ficha)` devolve { fontes:[...], propria:'1500'|'1001'|'1002'|'' }
 * — as fontes que a LOA admite naquela ficha e o recurso próprio dela.
 *
 * Devolve uma proposta por empenho ({ ficha, fonte, motivo, mudou }), o uso de
 * cada fonte e os avisos. Não altera os empenhos.
 */
export function distribuirFontesPorSaldo(empenhos = [], saldos = {}, fichaInfo = () => null) {
  /* A ordem conta: é nela que as fontes são oferecidas. Num objeto, chave
     numérica ("1621") é ordenada pelo número, então a ordem digitada só se
     guarda numa lista [{ fonte, saldo }]. */
  const pares = (Array.isArray(saldos) ? saldos.map(x => [x.fonte, x.saldo]) : Object.entries(saldos || {}))
    .map(([f, v]) => [codigoFonte(f), Number(v)])
    .filter(([f, v]) => f && !ehPropria(f) && Number.isFinite(v));
  const ordem = [...new Set(pares.map(([f]) => f))];
  const restante = new Map(ordem.map(f => [f, pares.filter(([g]) => g === f).reduce((n, [, v]) => n + v, 0)]));
  const uso = new Map(ordem.map(f => [f, { fonte: f, saldo: restante.get(f), usado: 0, empenhos: [] }]));
  const avisos = [];
  const usar = (f, e) => {
    if (!uso.has(f)) return;
    const u = uso.get(f);
    u.usado += num(e.bruto); u.empenhos.push(e.empenho);
    restante.set(f, restante.get(f) - num(e.bruto));
  };

  const propostas = (empenhos || []).map(e => {
    const atual = { ficha: String(e.ficha || ''), fonte: codigoFonte(e.fonte) };
    const igual = (motivo) => ({ id: e.id, empenho: e.empenho, ...atual, motivo, mudou: false });
    const bruto = num(e.bruto);
    if (!atual.ficha || bruto <= 0) return igual('');
    const info = fichaInfo(atual.ficha) || {};
    const admitidas = (info.fontes || []).map(codigoFonte);

    // Fonte de categoria já escolhida fica onde está e gasta o saldo dela.
    if (FONTES_DE_CATEGORIA.includes(atual.fonte)) {
      usar(atual.fonte, e);
      if (restante.has(atual.fonte) && restante.get(atual.fonte) < 0)
        avisos.push('Empenho ' + e.empenho + ': a fonte ' + atual.fonte + ' não tem saldo para ele.');
      return igual('fonte ' + atual.fonte + ' mantida (só paga esta categoria)');
    }

    const candidatas = ordem.filter(f => !FONTES_DE_CATEGORIA.includes(f) && admitidas.includes(f));
    if (!candidatas.length) return igual('');
    const cabe = candidatas.find(f => restante.get(f) >= bruto);
    if (cabe) {
      usar(cabe, e);
      return { id: e.id, empenho: e.empenho, ficha: atual.ficha, fonte: cabe,
        motivo: 'cabe no saldo da ' + cabe, mudou: cabe !== atual.fonte };
    }
    // Nenhum saldo cobre: recurso próprio.
    const espelho = ESPELHO_RECURSO_PROPRIO[atual.ficha];
    if (espelho)
      return { id: e.id, empenho: e.empenho, ficha: espelho.ficha, fonte: '1001',
        motivo: 'sem saldo no FUNDEB: ficha ' + espelho.ficha + ' em recurso próprio',
        mudou: espelho.ficha !== atual.ficha || atual.fonte !== '1001' };
    if (info.propria)
      return { id: e.id, empenho: e.empenho, ficha: atual.ficha, fonte: info.propria,
        motivo: 'sem saldo nas fontes ' + candidatas.join(', ') + ': recurso próprio',
        mudou: info.propria !== atual.fonte };
    avisos.push('Empenho ' + e.empenho + ' (ficha ' + atual.ficha + '): nenhuma fonte cobre ' +
      dinheiroFolha(bruto) + ' e a ficha não tem recurso próprio. Informe à mão.');
    return igual('sem saldo e sem recurso próprio na ficha');
  });

  return { propostas, avisos,
    uso: [...uso.values()].map(u => ({ ...u, sobra: u.saldo - u.usado })),
    mudancas: propostas.filter(p => p.mudou).length };
}

/* =====================================================================
   Planilha da Contabilidade ("Nova Folha 2026", uma aba por mês)
   =====================================================================
   A partir da linha 4, na ordem em que a Contabilidade lança o empenho:
   A grupo (só na primeira linha do grupo) · B empenho · C secretaria ·
   D ficha · E fonte · F bruto · G histórico — o que se digita no empenho,
   num grupo que abre e fecha no "+" (aberto: depois de digitar o empenho, a
   Contabilidade fecha e segue para a liquidação) ·
   H desconto da liquidação · I–O itens do desconto (INSS, Caixa, Sicoob,
   Bradesco, Pensão, IR, Outros), num grupo fechado no "+" ·
   P nº da OP · Q salário-família · R desconto dele (INSS) ·
   S salário-maternidade (e natalidade) · T desconto dele (INSS) ·
   U líquido · V total líquido do Resumo de Verbas · W conferência.
   A conta bancária não vai para a planilha: é escolhida no SISDIFI.
   O único desconto que uma OP tem é o INSS da servidora em
   salário-maternidade, que sai da liquidação do empenho e vai para a OP —
   daí o título "Desconto (INSS)".
   Conferido em novembro/2026: líquido = F − H + Q − R + S − T. */
export const GRUPOS_PLANILHA = {
  principal: 'FOLHA DE PAGAMENTO', extra: 'FOLHA EXTRA',
  decimo: 'ADIANTAMENTO DE 50% 13º SALÁRIO', rescisao: 'RECISÃO CONTRATUAL'
};
/** Colunas (0 = A): D ficha, F bruto, G histórico — o grupo do empenho é D–G. */
export const COLUNA_FICHA_PLANILHA = 3;
export const COLUNA_BRUTO_PLANILHA = 5;
export const COLUNA_HISTORICO_PLANILHA = 6;
/** Coluna do desconto da liquidação: H. */
export const COLUNA_DESCONTO_PLANILHA = 7;
/** Primeira coluna dos itens do desconto: I, logo depois do desconto. */
export const INICIO_ITENS_PLANILHA = 8;
export const ROTULOS_ITENS_PLANILHA = COLUNAS_DESCONTO.map(c => c.rotulo);
/** Coluna do nº da OP: P, logo depois dos itens. */
export const COLUNA_OP_PLANILHA = INICIO_ITENS_PLANILHA + ROTULOS_ITENS_PLANILHA.length;
export const ROTULOS_OP_PLANILHA = ['Nº OP', 'Salário-família', 'Desconto (INSS)', 'Salário-maternidade', 'Desconto (INSS)'];
/** Coluna do líquido: U. Depois dela, resumo do RH (V) e conferência (W). */
export const COLUNA_LIQUIDO_PLANILHA = COLUNA_OP_PLANILHA + ROTULOS_OP_PLANILHA.length;
export const CABECALHO_PLANILHA = ['', 'Empenho', 'Secretaria', 'Ficha', 'Fonte de Recursos',
  'Valor Bruto', 'Histórico', 'Desconto Liquidação', ...ROTULOS_ITENS_PLANILHA, ...ROTULOS_OP_PLANILHA,
  'Valor Liquido ', 'Resumo RH', 'Conferência'];

const FICHAS_FUNDEB = new Set(['173', '174', '186', '187', '191', '192', '198', '199']);
const semAcentoMaiusc = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
/** Nome curto da secretaria, como a planilha escreve. */
const FICHAS_HOSPITAL = new Set(['266', '267']);
const FICHAS_TRANSPORTE_ESCOLAR = new Set(['179', '180']);
export function secretariaDaPlanilha(secretaria = '', ficha = '') {
  const s = semAcentoMaiusc(secretaria);
  // A ficha decide antes do nome: o RH lança o hospital dentro da Saúde e o
  // transporte escolar dentro da Educação, e a planilha os separa.
  if (/HOSPITAL/.test(s) || FICHAS_HOSPITAL.has(String(ficha))) return 'HOSPITAL MUNICIPAL';
  if (FICHAS_TRANSPORTE_ESCOLAR.has(String(ficha))) return 'TRANSPORTES';
  if (/EDUCA|ENSINO|FUNDEB/.test(s)) return FICHAS_FUNDEB.has(String(ficha)) ? 'FUNDEB' : 'SEC. EDUCAÇÃO';
  // AGRICULTURA antes de CULTURA: uma palavra contém a outra.
  const mapa = [[/AGRICULTURA/, 'AGRICULTURA'], [/GABINETE|PREFEITO/, 'GABINETE DO PREFEITO'], [/ADMINISTRA/, 'ADMINISTRAÇÃO'],
    [/\bCULTURA|TURISMO/, 'CULTURA'], [/FAZENDA/, 'FAZENDA'], [/ESPORTE/, 'ESPORTE E LAZER'], [/TRANSPORTE/, 'TRANSPORTES'],
    [/OBRAS/, 'OBRAS PUBLICAS'], [/MEIO AMBIENTE/, 'MEIO AMBIENTE'], [/LIMPEZA/, 'LIMPEZA URBANA'],
    [/SAUDE/, 'SECRETARIA DE SAÚDE'], [/ACAO SOCIAL|ASSISTENCIA/, 'SEC. AÇÃO SOCIAL']];
  for (const [re, nome] of mapa) if (re.test(s)) return nome;
  return String(secretaria || '').toUpperCase();
}

/* A fonte vai no código curto, como a planilha sempre usou: "1.500.000.0000"
   numa planilha em português vira o número 15.000.000.000. */

/**
 * Linhas da planilha, na ordem dos empenhos. Valores em centavos; quem
 * escreve decide o formato (número para a API, texto pt-BR para colar).
 * `empenhos` é previsao.empenhos (para a secretaria e a conta); `lanc` é o
 * resultado de linhasDeLancamento.
 */
export function linhasDaPlanilha(empenhos = [], lanc = { linhas: [] }) {
  const porId = new Map((empenhos || []).map(e => [e.id, e]));
  let grupo = '';
  return lanc.linhas.map(l => {
    const e = porId.get(l.id) || {};
    const fam = l.ops.filter(o => o.tipo === 'Salário-família');
    const mat = l.ops.filter(o => o.tipo !== 'Salário-família');
    const soma = (xs, k) => xs.reduce((n, o) => n + o[k], 0);
    const rotulo = l.tipo !== grupo ? (GRUPOS_PLANILHA[l.tipo] || String(l.tipo).toUpperCase()) : '';
    grupo = l.tipo;
    const ou = v => (v ? v : null);
    return [
      rotulo, l.numero ?? '', secretariaDaPlanilha(e.secretaria, l.ficha), l.ficha, codigoFonte(l.fonte),
      l.bruto, l.historico, ou(l.desconto),
      ...COLUNAS_DESCONTO.map(c => ou(l.composicao[c.chave])),
      l.ops.map(o => o.numero).filter(Boolean).join(' / '),
      ou(soma(fam, 'valor')), ou(soma(fam, 'desconto')),
      ou(soma(mat, 'valor')), ou(soma(mat, 'desconto')),
      l.calculado, l.resumo,
      l.bateu ? 'BATEU' : 'NÃO BATEU: ' + l.diferencas.join(' ')
    ];
  });
}
/** Índices (0 = coluna A) das colunas de dinheiro em linhasDaPlanilha:
 *  bruto (F), desconto e itens (H–O), OPs (Q–T), líquido (U) e resumo (V). */
export const COLUNAS_DINHEIRO_PLANILHA = new Set([5, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21]);

/** Texto para colar na planilha (Ctrl+V em A4): tabulação e valores em pt-BR. */
export function textoParaColar(linhas = []) {
  const valor = (v, i) => {
    if (v == null || v === '') return '';
    if (COLUNAS_DINHEIRO_PLANILHA.has(i) && typeof v === 'number')
      return (v / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return String(v).replace(/[\t\r\n]+/g, ' ');
  };
  return linhas.map(l => l.map(valor).join('\t')).join('\n');
}
