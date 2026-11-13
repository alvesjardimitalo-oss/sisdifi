// =============================================================
// SISDIFI — Retenções nas transferências constitucionais (FPM, ITR, IPI, LC 176)
// Funções puras: leitura do CSV do DAF (demonstrativos.apps.bb.com.br/arrecadacao-federal),
// leitura do extrato da conta do FPM (CSV ou OFX), classificação das retenções,
// decêndio, numeração e comprovante de retenção para a liquidação do empenho.
// Valores sempre em CENTAVOS (inteiros).
// =============================================================
import { valorPorExtenso } from './calculo.js';

export const ORIGENS = {
  FPM:   { sigla: 'FPM',    nome: 'FPM — Fundo de Participação dos Municípios', conta: '3261-1' },
  ITR:   { sigla: 'ITR',    nome: 'ITR — Imposto Territorial Rural (cota-parte)', conta: '6729-6' },
  IPI:   { sigla: 'IPI',    nome: 'IPI-Exportação (cota-parte)', conta: '92998-8' },
  LC176: { sigla: 'LC 176', nome: 'ADO 25 / LC nº 176/2020 (auxílio aos municípios)', conta: '' },
  FEP:   { sigla: 'FEP',    nome: 'FEP — Fundo Especial do Petróleo (cota-parte)', conta: '' }
};
/** Código do bloco no DAF do BB ("FPM   - FUNDO DE PARTICIPACAO...") → origem do SISDIFI ('' = fundo sem retenção a lançar). */
export const BLOCOS_DAF = { FPM: 'FPM', ITR: 'ITR', IPM: 'IPI', ADO: 'LC176', FEP: 'FEP' };
/** Conta do extrato → origem. */
const CONTAS_ORIGEM = { '32611': 'FPM', '67296': 'ITR', '929988': 'IPI' };

const TODAS = Object.keys(ORIGENS);
// Rubricas lançadas por empenho. "Fonte" diz de onde a retenção é lançada por padrão:
// o PASEP vem da consulta do DAF (total por fundo); os convênios vêm do extrato da conta do FPM.
export const RUBRICAS = {
  PASEP:            { nome: 'PASEP', credor: 'PASEP — Secretaria Especial da Receita Federal do Brasil', origens: TODAS, aliquota: 0.01, fonte: 'daf',
                      base_legal: 'Lei nº 9.715/1998, art. 2º, III, e art. 8º, III (1% sobre as transferências recebidas)' },
  EMATER:           { nome: 'EMATER', credor: 'EMATER-MG', origens: ['FPM'], fonte: 'extrato' },
  CISDOCE_RATEIO:   { nome: 'CISDOCE — Rateio', credor: 'CISDOCE', origens: ['FPM'], fonte: 'extrato' },
  CISDOCE_SERVICOS: { nome: 'CISDOCE — Serviços', credor: 'CISDOCE', origens: ['FPM'], fonte: 'extrato' },
  ARDOCE:           { nome: 'ARDOCE', credor: 'ARDOCE', origens: ['FPM'], fonte: 'extrato' },
  AMM:              { nome: 'AMM', credor: 'AMM — Associação Mineira de Municípios', origens: ['FPM'], fonte: 'extrato' },
  CNM:              { nome: 'CNM', credor: 'CNM — Confederação Nacional de Municípios', origens: ['FPM'], fonte: 'extrato' },
  RFB_DARF:         { nome: 'RFB — Retenção DARF', credor: 'Secretaria Especial da Receita Federal do Brasil', origens: ['FPM'], fonte: 'opcional' },
  OUTRA:            { nome: 'Outra retenção', credor: '', origens: TODAS, fonte: 'opcional' }
};
export const CODIGOS_RUBRICA = Object.keys(RUBRICAS);

// ---------------- Números e datas ----------------
/**
 * "1.234,56", "R$ 1.234,56 D", "31.072_95C" (DAF do BB), "-1234,56", "1234.56", "(1.234,56)", "1.635,23 €" (OCR do C)
 * → { centavos, sinal: 'C'|'D'|'' } ou null
 */
export function lerValor(texto) {
  let t = String(texto ?? '').trim().replace(/€/g, 'C').replace(/(\d)_(\d{2})(?!\d)/, '$1,$2');
  if (!t) return null;
  let sinal = '';
  const sufixo = /([CD])\s*C?\s*$/i.exec(t);
  if (sufixo && /\d/.test(t)) { sinal = sufixo[1].toUpperCase(); t = t.slice(0, sufixo.index).trim(); }
  if (/^\(.*\)$/.test(t)) { sinal = 'D'; t = t.slice(1, -1); }
  t = t.replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (/^-/.test(t)) { sinal = 'D'; t = t.slice(1); }
  else if (/^\+/.test(t)) { sinal = sinal || 'C'; t = t.slice(1); }
  t = t.replace(/^R\$/i, '');
  let inteiro, dec = '';
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(t) || /^\d+,\d{1,2}$/.test(t)) { [inteiro, dec] = t.split(','); inteiro = inteiro.replace(/\./g, ''); }
  else if (/^\d{1,3}(,\d{3})*\.\d{1,2}$/.test(t) || /^\d+\.\d{1,2}$/.test(t)) { [inteiro, dec] = t.split('.'); inteiro = inteiro.replace(/,/g, ''); }
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) inteiro = t.replace(/\./g, '');
  else if (/^\d+$/.test(t) && t.length <= 12) inteiro = t;
  else return null;
  const centavos = Number(inteiro) * 100 + Number((dec || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos)) return null;
  return { centavos, sinal };
}

/** Texto digitado pelo usuário → centavos (aceita vazio = 0). Lança erro se inválido. */
export function centavosDe(texto) {
  if (String(texto ?? '').trim() === '') return 0;
  const v = lerValor(texto);
  if (!v) throw Error('Valor inválido: ' + texto);
  return v.centavos;
}

export const dinheiro = c => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dataBR = iso => /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';

export function dataValida(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
  const [a, m, d] = iso.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d));
  return x.getUTCFullYear() === a && x.getUTCMonth() + 1 === m && x.getUTCDate() === d;
}

/** "10/11/2026", "10.11.2026", "10-11-26", "2026-11-10", "20261110" → "2026-11-10" ou '' */
export function lerData(texto) {
  const t = String(texto ?? '').trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/.exec(t);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const iso = `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return dataValida(iso) ? iso : '';
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return dataValida(m[0]) ? m[0] : '';
  m = /^(\d{4})(\d{2})(\d{2})/.exec(t);
  if (m) { const iso = `${m[1]}-${m[2]}-${m[3]}`; return dataValida(iso) ? iso : ''; }
  return '';
}

/**
 * Decêndio a que o crédito se refere. Os repasses saem nos dias 10, 20 e 30 (ou no dia útil anterior/seguinte),
 * então a data do crédito é aproximada do decêndio mais próximo:
 * dias 1–5 → 3º decêndio do mês anterior; 6–15 → 1º; 16–25 → 2º; 26–31 → 3º.
 */
export function decendioDe(iso) {
  if (!dataValida(iso)) return null;
  let [a, m, d] = iso.split('-').map(Number);
  let dec;
  if (d <= 5) { dec = 3; m -= 1; if (m === 0) { m = 12; a -= 1; } }
  else if (d <= 15) dec = 1;
  else if (d <= 25) dec = 2;
  else dec = 3;
  return { decendio: dec, competencia: `${a}-${String(m).padStart(2, '0')}` };
}
export const textoDecendio = (dec, comp) => dec && comp ? `${dec}º decêndio de ${comp.slice(5, 7)}/${comp.slice(0, 4)}` : '—';

// ---------------- Classificação ----------------
const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Rubrica a partir do histórico da linha. Retorna código de RUBRICAS, 'FUNDEB', 'BASE', 'IGNORAR' ou ''. */
export function classificar(historico, sinal = '') {
  const t = norm(historico);
  if (!t) return '';
  if (/\bTOTAL\b|SALDO|DEBITO FUNDO|CREDITO FUNDO|DEBITO BENEF|CREDITO BENEF/.test(t)) return 'IGNORAR';
  if (/PASEP/.test(t)) return 'PASEP';
  if (/EMATER/.test(t)) return 'EMATER';
  if (/CISDOCE|CIS ?DOCE/.test(t)) return /SERVIC/.test(t.replace(/PRESTACAO DE SERVICOS/, '')) ? 'CISDOCE_SERVICOS' : 'CISDOCE_RATEIO';
  if (/ARDOCE/.test(t)) return 'ARDOCE';
  if (/\bAMM\b|ASSOCIACAO MIN/.test(t)) return 'AMM';
  if (/\bCNM\b|CONFED/.test(t)) return 'CNM';
  if (/FUNDEB/.test(t)) return 'FUNDEB';
  if (/RFB|REC\.? ?FEDERAL|RET DARF/.test(t)) return 'RFB_DARF';
  if (/TRANSFERENCIA ENVIADA|RESGATE|BB-APLIC|APLIC|PIX|TED\b|TARIFA/.test(t)) return 'IGNORAR';
  if (sinal !== 'D' && /COTA|PARCELA|CREDITO|REPASSE|FPE\/FPM|\bFPM\b|\bITR\b|\bIPI\b|LC ?176|LC ?198|ADO ?25/.test(t)) return 'BASE';
  return '';
}

/** Fundo citado num texto livre (histórico/cabeçalho). '' se não identificar. */
export function origemDe(texto) {
  const t = norm(texto);
  if (/LC ?N?º? ?176|176\/2020|ADO ?25/.test(t)) return 'LC176';
  if (/\bFPM\b|FUNDO DE PARTICIPACAO DOS MUN/.test(t)) return 'FPM';
  if (/\bITR\b|TERRITORIAL RURAL/.test(t)) return 'ITR';
  if (/PETROLEO/.test(t)) return 'FEP';
  if (/\bIPI\b|EXPORTAC/.test(t)) return 'IPI';
  return '';
}

// ---------------- CSV (DAF do BB e extratos em planilha) ----------------
/** Divide CSV respeitando aspas. Detecta ; , ou TAB. */
export function lerCSV(texto) {
  const limpo = String(texto ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const amostra = limpo.split('\n').slice(0, 30).join('\n');
  const conta = c => (amostra.match(new RegExp(c === '\t' ? '\t' : '\\' + c, 'g')) || []).length;
  const sep = [';', '\t', ','].sort((a, b) => conta(b) - conta(a))[0];
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.map(l => l.map(x => x.trim())).filter(l => l.some(x => x));
}

/** Cabeçalho de colunas (Data / Histórico / Valor / D-C) se existir. */
function mapaColunas(linha) {
  if (linha.length < 2) return null;
  const n = linha.map(norm);
  const idx = re => n.findIndex(x => re.test(x));
  const m = { data: idx(/^DATA/), hist: idx(/HISTORICO|LANCAMENTO|DESCRICAO|PARCELA|DETALHE|RUBRICA/), valor: idx(/^VALOR|VALOR DISTRIBUIDO|^QUANTIA/), dc: idx(/^(D\/C|C\/D|TIPO|NATUREZA|DEB|CRED)/) };
  return (m.data >= 0 || m.hist >= 0) && m.valor >= 0 && m.valor !== m.data && m.valor !== m.hist ? m : null;
}

/**
 * Lê o CSV do DAF (blocos por fundo: "FPM   - FUNDO DE PARTICIPACAO...", data só na 1ª linha do dia,
 * "TOTAL POR PARCELA / NATUREZA" no fim de cada bloco) ou um extrato em CSV.
 * Devolve [{ linha, data, origem, historico, centavos, sinal, rubrica }].
 */
export function lerMovimentos(texto, { origemPadrao = '' } = {}) {
  const linhas = lerCSV(texto);
  const saida = [];
  let colunas = null, dataAtual = '', origemAtual = origemPadrao, emResumo = false, temBlocos = false;
  linhas.forEach((cel, i) => {
    const bloco = /^([A-Z]{3})\s+-\s+\S/.exec(cel[0] || '');
    if (bloco && !cel.slice(1).some(c => lerValor(c))) {
      // novo fundo no DAF: só os fundos com retenção a lançar ficam com origem
      temBlocos = true; emResumo = false; dataAtual = '';
      origemAtual = BLOCOS_DAF[bloco[1]] ?? origemDe(cel[0]) ?? '';
      if (!BLOCOS_DAF[bloco[1]]) origemAtual = '-' + bloco[1];
      return;
    }
    const cab = mapaColunas(cel);
    if (cab && !cel.some(c => lerData(c))) { colunas = cab; return; }
    let data = '', hist = '', valor = null, dc = '';
    if (colunas) {
      data = lerData(cel[colunas.data] ?? '');
      hist = [cel[colunas.hist] ?? '', ...cel.filter((c, k) => k !== colunas.data && k !== colunas.hist && k !== colunas.valor && k !== colunas.dc && !lerValor(c) && !lerData(c) && /[A-Za-z]{3}/.test(c))].filter(Boolean).join(' ').trim();
      valor = lerValor(cel[colunas.valor] ?? '');
      dc = norm(cel[colunas.dc] ?? '');
    } else {
      const textos = [];
      for (const c of cel) {
        if (!data && lerData(c)) { data = lerData(c); continue; }
        const v = lerValor(c);
        if (v && /[,._]\d{2}\s*[CD€]?\)?$/i.test(c)) { valor = v; continue; }
        if (/^[CD]$/i.test(c)) { dc = c.toUpperCase(); continue; }
        textos.push(c);
      }
      hist = textos.join(' ').trim();
    }
    if (dc && valor) { if (/^D|DEB|SAIDA/.test(dc)) valor.sinal = 'D'; else if (/^C|CRED|ENTRADA/.test(dc)) valor.sinal = valor.sinal || 'C'; }
    if (!valor) {
      const t = norm(cel.join(' '));
      if (/TOTAL POR PARCELA|TOTAL DISTRIBUIDO/.test(t)) { emResumo = true; return; }
      if (!temBlocos) { const o = origemDe(t); if (o) origemAtual = o; }
      if (data) dataAtual = data;
      return;
    }
    if (data) { dataAtual = data; emResumo = false; }
    if (emResumo || !valor.centavos) return; // totais do bloco repetem os valores do período
    const rubrica = classificar(hist, valor.sinal);
    saida.push({ linha: i + 1, data: dataAtual, origem: origemAtual.startsWith('-') ? '' : origemAtual, bloco: origemAtual.startsWith('-') ? origemAtual.slice(1) : '',
      historico: hist, centavos: valor.centavos, sinal: valor.sinal, rubrica, estorno: /ESTORNO/.test(norm(hist)) });
  });
  return saida;
}

// ---------------- Extrato do BB em PDF (texto do PDF ou OCR do scan) ----------------
const RE_VALOR_EXTRATO = /(\d{1,3}(?:\.\d{3})+|\d+)\s*[,.]\s*(\d{2})\s*([CD€])/gi;
/**
 * Linhas de texto do "Extrato conta corrente" do BB:
 * "10/11/2026 0000 13013 240 Contribuição 11.982 3.221,68 D" + linha seguinte "CISDOCE" (o favorecido).
 * A conta ("Conta corrente 3261-1 ...") define o fundo; sem ela, usa origemPadrao.
 */
export function lerExtratoTexto(linhas, { origemPadrao = 'FPM' } = {}) {
  const saida = [];
  let origem = '', ultimo = null;
  linhas.forEach((bruta, i) => {
    const l = String(bruta || '').replace(/[|¦]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!l) return;
    const conta = /CONTA CORRENTE\s+([\d.]+-?[\dXx])/i.exec(l);
    if (conta) { origem = CONTAS_ORIGEM[conta[1].replace(/\D/g, '')] || origem; return; }
    const m = /^(\d{2}\/\d{2}\/\d{4})\s+(.*)$/.exec(l);
    if (!m) {
      // linha de complemento (favorecido) do lançamento anterior
      if (ultimo && !ultimo.complemento && /[A-Za-z]{3}/.test(l) && !/^https?:|BANCO DO BRASIL|^\d{2}\/\d{2}\/\d{2},/i.test(l)) {
        ultimo.complemento = l; ultimo.historico += ' ' + l;
        ultimo.rubrica = classificar(ultimo.historico.replace(/ESTORNO DE D[EÉ]BITO/i, ''), ultimo.estorno ? 'D' : ultimo.sinal);
      }
      return;
    }
    const data = lerData(m[1]);
    const valores = [...m[2].matchAll(RE_VALOR_EXTRATO)];
    if (!data || !valores.length) { ultimo = null; return; }
    const v = valores[0];
    const centavos = Number(v[1].replace(/\./g, '')) * 100 + Number(v[2]);
    const sinal = /D/i.test(v[3]) ? 'D' : 'C';
    let hist = m[2].slice(0, v.index).trim().replace(/^\d{4}\s+\d{5}\s+/, '').replace(/\s+['’`]?\s*[\d.]{3,}$/, '').trim();
    if (/SALDO/i.test(hist)) { ultimo = null; return; }
    const estorno = /ESTORNO/i.test(hist);
    ultimo = { linha: i + 1, data, origem: '', historico: hist, centavos, sinal, estorno,
      rubrica: classificar(hist.replace(/ESTORNO DE D[EÉ]BITO/i, ''), estorno ? 'D' : sinal) };
    saida.push(ultimo);
  });
  for (const x of saida) { x.origem = origem || origemPadrao; delete x.complemento; }
  return saida;
}

/** Texto do extrato parece legível? (tem lançamentos com data e valor) */
export const extratoLegivel = linhas => linhas.filter(l => /^\s*\d{2}\/\d{2}\/\d{4}\s.*\d,\d{2}\s*[CD€]/i.test(l)).length >= 2;

// ---------------- OFX (extrato BB) ----------------
export function lerOFX(texto) {
  const t = String(texto ?? '');
  const tag = (bloco, nome) => { const m = new RegExp('<' + nome + '>([^<\\r\\n]*)', 'i').exec(bloco); return m ? m[1].trim() : ''; };
  const saida = [];
  const blocos = t.split(/<STMTTRN>/i).slice(1);
  blocos.forEach((b, i) => {
    const valorTxt = tag(b, 'TRNAMT').replace(',', '.');
    const n = Number(valorTxt);
    if (!Number.isFinite(n) || !n) return;
    const hist = [tag(b, 'MEMO'), tag(b, 'NAME')].filter(Boolean).join(' ');
    const sinal = n < 0 ? 'D' : 'C';
    const estorno = /ESTORNO/i.test(hist);
    saida.push({ linha: i + 1, data: lerData(tag(b, 'DTPOSTED')), origem: '', historico: hist, centavos: Math.round(Math.abs(n) * 100), sinal, estorno,
      rubrica: classificar(hist.replace(/ESTORNO DE D[EÉ]BITO/i, ''), estorno ? 'D' : sinal) });
  });
  return saida;
}

/** Detecta o formato (OFX, texto de extrato ou CSV) e devolve os movimentos. */
export function lerArquivo(texto, opcoes = {}) {
  const linhasTexto = String(texto ?? '').split(/\r?\n/);
  const lista = /<OFX>|<STMTTRN>/i.test(texto) ? lerOFX(texto)
    : (!/[;,]\s*VALOR|_\d{2}[CD]/i.test(texto) && extratoLegivel(linhasTexto)) ? lerExtratoTexto(linhasTexto, opcoes)
    : lerMovimentos(texto, opcoes);
  if (opcoes.origemPadrao) for (const m of lista) if (!m.origem && !m.bloco) m.origem = opcoes.origemPadrao;
  return lista;
}

export const chaveDuplicidade = r => [r.data, r.origem, r.rubrica, r.centavos].join('|');

/**
 * Transforma movimentos lidos em propostas de lançamento.
 * fonte: 'daf' (consulta do DAF) ou 'extrato' (extrato da conta do FPM).
 * - vêm marcadas só as rubricas lançadas por aquela fonte (PASEP pelo DAF; convênios pelo extrato);
 * - estorno de débito anula o débito de mesmo favorecido e valor no mesmo dia;
 * - PASEP é conferido contra 1% da cota (bruta, ou líquida do FUNDEB, como no ITR);
 * - CISDOCE: valor igual ao do rateio (padrão R$ 3.221,68, todo decêndio) = rateio; qualquer outro valor = serviços (dia 10);
 * - linhas já lançadas (mesma data, fundo, rubrica e valor, contando repetições) ficam desmarcadas.
 */
export const VALOR_RATEIO_CISDOCE = 322168;
export function proporLancamentos(movimentos, existentes = [], { fonte = '', valorRateioCisdoce = VALOR_RATEIO_CISDOCE } = {}) {
  const ativos = existentes.filter(e => !e.anulado);
  const restantes = new Map();
  for (const e of ativos) { const k = chaveDuplicidade(e); restantes.set(k, (restantes.get(k) || 0) + 1); }
  const bases = {}, fundeb = {}, pasepDia = {};
  for (const m of movimentos) {
    const k = m.data + '|' + m.origem;
    if (m.rubrica === 'PASEP' && m.sinal === 'D') pasepDia[k] = (pasepDia[k] || 0) + m.centavos;
    if (m.rubrica === 'BASE' && m.sinal !== 'D') bases[k] = (bases[k] || 0) + m.centavos;
    if (m.rubrica === 'FUNDEB' && m.sinal === 'D') fundeb[k] = (fundeb[k] || 0) + m.centavos;
  }
  // estornos: cada crédito de estorno consome um débito igual (mesmo dia, favorecido e valor)
  const estornado = new Set();
  movimentos.forEach((e, i) => {
    if (!e.estorno) return;
    const j = movimentos.findIndex((d, k) => k !== i && !d.estorno && !estornado.has(k) && d.sinal === 'D' && d.data === e.data && d.rubrica === e.rubrica && d.centavos === e.centavos);
    estornado.add(i); if (j >= 0) estornado.add(j);
  });
  // CISDOCE: o rateio é um valor fixo cobrado em todo decêndio; qualquer outro valor é serviço (cobrado só no 1º decêndio, dia 10)
  const rateioDia = {};
  return movimentos.map((m, i) => ({ m, i })).filter(({ m }) => m.rubrica !== 'BASE' && m.rubrica !== 'IGNORAR' && !(m.bloco && !RUBRICAS[m.rubrica])).map(({ m, i }) => {
    const p = { ...m, avisos: [], base_centavos: 0, duplicado: false };
    if (/^CISDOCE_/.test(p.rubrica) && !/RATEIO|SERVIC/i.test(p.historico.replace(/PRESTA[CÇ][AÃ]O DE SERVI[CÇ]OS/i, ''))) {
      p.rubrica = p.centavos === valorRateioCisdoce ? 'CISDOCE_RATEIO' : 'CISDOCE_SERVICOS';
      if (p.rubrica === 'CISDOCE_RATEIO' && !p.estorno && !estornado.has(i)) {
        rateioDia[p.data] = (rateioDia[p.data] || 0) + 1;
        if (rateioDia[p.data] > 1) p.avisos.push('Mais de um rateio do CISDOCE no mesmo dia — confira se não é serviço de mesmo valor.');
      }
      if (p.rubrica === 'CISDOCE_SERVICOS' && decendioDe(p.data)?.decendio !== 1) p.avisos.push('CISDOCE serviços normalmente só é descontado no dia 10 — confira.');
    }
    const rb = RUBRICAS[p.rubrica];
    if (estornado.has(i)) p.avisos.push(p.estorno ? 'Estorno de débito: anula o débito igual do mesmo dia.' : 'Débito estornado no mesmo dia: não lançar.');
    if (p.bloco) p.avisos.push(`Fundo ${p.bloco} do DAF: escolha a qual transferência lançar.`);
    else if (!p.origem) p.avisos.push('Fundo não identificado: escolha FPM, ITR, IPI, LC 176 ou FEP.');
    if (!p.data) p.avisos.push('Sem data na linha: informe a data.');
    if (p.rubrica === 'FUNDEB') p.avisos.push('Dedução do FUNDEB: é dedução de receita, não se liquida por empenho.');
    if (!p.rubrica) p.avisos.push('Histórico não reconhecido: escolha a rubrica se for uma retenção.');
    if (rb && fonte && rb.fonte !== fonte) p.avisos.push(rb.fonte === 'daf' ? 'O PASEP é lançado pela consulta do DAF (traz o total por fundo).'
      : rb.fonte === 'extrato' ? 'Esta retenção é lançada pelo extrato do FPM.' : 'Confira se esta retenção é liquidada por empenho antes de marcar.');
    if (rb && !p.estorno && p.sinal === 'C') p.avisos.push('Lançamento a crédito: confira se é mesmo uma retenção.');
    const k = p.data + '|' + p.origem;
    if (p.rubrica === 'PASEP' && bases[k]) {
      p.base_centavos = bases[k];
      // no extrato o PASEP do dia vem em mais de uma linha: confere a soma do dia
      const total = pasepDia[k] || p.centavos;
      const bruto = Math.round(bases[k] * 0.01), liquido = Math.round((bases[k] - (fundeb[k] || 0)) * 0.01);
      if (Math.abs(bruto - total) <= 5) { /* 1% da cota bruta */ }
      else if (fundeb[k] && Math.abs(liquido - total) <= 5) p.base_centavos = bases[k] - fundeb[k];
      else p.avisos.push(`PASEP do dia (${dinheiro(total)}) diferente de 1% da cota (${dinheiro(bruto)} sobre ${dinheiro(bases[k])}).`);
      if (total !== p.centavos) p.base_centavos = 0; // base só faz sentido quando a linha é o PASEP inteiro do dia
    }
    const kd = chaveDuplicidade(p);
    if (rb && !estornado.has(i) && !p.estorno && restantes.get(kd) > 0) { restantes.set(kd, restantes.get(kd) - 1); p.duplicado = true; p.avisos.push('Já lançado no SISDIFI (mesma data, fundo, rubrica e valor).'); }
    p.marcado = !!rb && !p.duplicado && !estornado.has(i) && !p.estorno && !!p.data && !!p.origem && p.sinal !== 'C'
      && (!fonte || rb.fonte === fonte);
    return p;
  });
}

// ---------------- Validação e numeração ----------------
export function validarLancamento(d) {
  if (!dataValida(d.data)) throw Error('Informe a data do desconto/crédito.');
  if (!ORIGENS[d.origem]) throw Error('Escolha o fundo (FPM, ITR, IPI ou LC 176).');
  if (!RUBRICAS[d.rubrica]) throw Error('Escolha a rubrica da retenção.');
  const centavos = Number(d.centavos);
  if (!Number.isSafeInteger(centavos) || centavos <= 0) throw Error('Valor da retenção deve ser maior que zero.');
  const dec = decendioDe(d.data);
  const decendio = [1, 2, 3].includes(Number(d.decendio)) ? Number(d.decendio) : dec.decendio;
  const competencia = /^\d{4}-(0[1-9]|1[0-2])$/.test(d.competencia || '') ? d.competencia : dec.competencia;
  const txt = (v, n) => String(v ?? '').trim().slice(0, n);
  if (d.rubrica === 'OUTRA' && !txt(d.credor, 160)) throw Error('Informe o credor da retenção.');
  return {
    data: d.data, origem: d.origem, conta: txt(d.conta, 30), rubrica: d.rubrica, credor: txt(d.credor, 160),
    centavos, base_centavos: Number.isSafeInteger(Number(d.base_centavos)) && Number(d.base_centavos) > 0 ? Number(d.base_centavos) : 0,
    decendio, competencia, empenho: txt(d.empenho, 40), ficha: txt(d.ficha, 40), liquidacao: txt(d.liquidacao, 40),
    historico: txt(d.historico, 300), observacao: txt(d.observacao, 500), arquivo: txt(d.arquivo, 120)
  };
}

export const numeroRetencao = (seq, ano) => 'RET ' + String(seq).padStart(4, '0') + '/' + ano;

export function situacao(r) {
  if (r.anulado) return 'Anulado';
  if (r.liquidacao) return 'Liquidado';
  if (r.empenho) return 'Empenhado';
  return 'Aguardando empenho';
}

export function lancamentosAtivos(doc) {
  return Object.entries(doc?.lancamentos || {}).map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || (b.seq || 0) - (a.seq || 0));
}

/** Totais por rubrica e por fundo de uma lista (ignora anulados). */
export function resumo(lista) {
  const ativos = lista.filter(r => !r.anulado);
  const porRubrica = {}, porOrigem = {};
  for (const r of ativos) {
    porRubrica[r.rubrica] = (porRubrica[r.rubrica] || 0) + r.centavos;
    porOrigem[r.origem] = (porOrigem[r.origem] || 0) + r.centavos;
  }
  return { total: ativos.reduce((s, r) => s + r.centavos, 0), quantidade: ativos.length,
    pendentes: ativos.filter(r => !r.empenho).length, porRubrica, porOrigem };
}

/** Código de verificação curto (FNV-1a) dos dados essenciais do comprovante. */
export function codigoVerificacao(r) {
  const s = [r.numero, r.data, r.origem, r.rubrica, r.centavos, r.empenho || ''].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).toUpperCase().padStart(8, '0').replace(/(.{4})(.{4})/, '$1-$2');
}

// ---------------- Comprovante ----------------
const escH = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** HTML (uma página A4 por retenção) do Comprovante de Retenção. cfg: { orgao, cnpj, responsavel, cargo, logo, banco } */
export function comprovanteHTML(lista, cfg = {}) {
  const orgao = cfg.orgao || 'PREFEITURA MUNICIPAL DE FREI INOCÊNCIO';
  const paginas = lista.map(r => {
    const o = ORIGENS[r.origem] || { nome: r.origem, sigla: r.origem };
    const rb = RUBRICAS[r.rubrica] || { nome: r.rubrica };
    const credor = r.credor || rb.credor || rb.nome;
    const linhaBase = r.base_centavos ? `<tr><th>Valor bruto da cota</th><td>${dinheiro(r.base_centavos)}${rb.aliquota ? ` · alíquota ${String(rb.aliquota * 100).replace('.', ',')}%` : ''}</td></tr>` : '';
    return `<section class="pagina">
  <header><img src="${escH(cfg.logo || '')}" alt=""><div><strong>${escH(orgao)}</strong>${cfg.cnpj ? `<br>CNPJ ${escH(cfg.cnpj)}` : ''}<br>Setor de Contabilidade</div><div class="num"><small>Nº</small><b>${escH(r.numero || '')}</b></div></header>
  <h1>COMPROVANTE DE RETENÇÃO EM TRANSFERÊNCIA CONSTITUCIONAL</h1>
  <p class="intro">Declaramos, para instruir a liquidação da despesa, que o valor abaixo foi <b>retido/descontado na fonte</b> pelo agente financeiro no repasse da transferência indicada, sem saída de numerário da conta do Município, devendo ser empenhado e liquidado em favor do credor e baixado contra a própria conta da transferência.</p>
  <table>
    <tr><th>Transferência</th><td>${escH(o.nome)}</td></tr>
    <tr><th>Conta bancária</th><td>${escH(cfg.banco || 'Banco do Brasil')} · conta ${escH(r.conta || o.conta || '—')}</td></tr>
    <tr><th>Data do crédito/desconto</th><td>${dataBR(r.data)} · ${textoDecendio(r.decendio, r.competencia)}</td></tr>
    <tr><th>Retenção</th><td><b>${escH(rb.nome)}</b></td></tr>
    <tr><th>Credor</th><td>${escH(credor)}</td></tr>
    ${linhaBase}
    <tr class="destaque"><th>Valor retido</th><td><b>${dinheiro(r.centavos)}</b></td></tr>
    <tr><th>Por extenso</th><td><em>${escH(valorPorExtenso(r.centavos / 100))}</em></td></tr>
    <tr><th>Empenho / ficha</th><td>${escH(r.empenho || '____________')}${r.ficha ? ' · ficha ' + escH(r.ficha) : ''}${r.liquidacao ? ' · liquidação ' + escH(r.liquidacao) : ''}</td></tr>
    <tr><th>Histórico no demonstrativo</th><td>${escH(r.historico || '—')}</td></tr>
    ${rb.base_legal ? `<tr><th>Fundamento</th><td>${escH(rb.base_legal)}</td></tr>` : ''}
    ${r.observacao ? `<tr><th>Observação</th><td>${escH(r.observacao)}</td></tr>` : ''}
  </table>
  <p class="fonte">Fonte: ${r.arquivo ? 'arquivo ' + escH(r.arquivo) + ' — ' : ''}Demonstrativo de Distribuição da Arrecadação Federal (Banco do Brasil) e extrato da conta da transferência.</p>
  <div class="assin"><span>${escH(cfg.responsavel || 'Responsável pela Contabilidade')}<br><small>${escH(cfg.cargo || 'Contador(a)')}</small></span><span>Ordenador(a) da despesa</span></div>
  <footer>Gerado pelo SISDIFI em ${escH(cfg.geradoEm || '')}${cfg.geradoPor ? ' por ' + escH(cfg.geradoPor) : ''} · código de verificação <b>${codigoVerificacao(r)}</b></footer>
</section>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Comprovante de retenção${lista.length === 1 ? ' ' + escH(lista[0].numero || '') : 's'}</title><style>
@page{size:A4;margin:14mm}body{font:12px Arial,sans-serif;color:#18324a;margin:0}
.pagina{break-after:page;min-height:250mm;display:flex;flex-direction:column}.pagina:last-child{break-after:auto}
header{display:flex;gap:12px;align-items:center;border-bottom:3px solid #1d5d8a;padding-bottom:10px}header img{width:62px;height:62px;object-fit:contain}
header div{flex:1}.num{flex:0 0 auto;text-align:right;border:1px solid #9fb6c8;padding:6px 10px;border-radius:6px}.num small{display:block;color:#5b7083}.num b{font-size:15px}
h1{font-size:15px;text-align:center;margin:18px 0 8px;letter-spacing:.3px}.intro{text-align:justify;line-height:1.5}
table{width:100%;border-collapse:collapse;margin-top:10px}th,td{text-align:left;padding:8px;border:1px solid #cfdbe5;vertical-align:top}th{width:32%;background:#eef4f9;font-weight:600}
tr.destaque td{font-size:16px;background:#f2f8f3}.fonte{color:#566b7d;font-size:10.5px;margin-top:10px}
.assin{display:flex;gap:30px;margin-top:auto;padding-top:60px}.assin span{flex:1;border-top:1px solid #7c90a3;text-align:center;padding-top:6px}
footer{margin-top:22px;color:#5d7183;font-size:10px;text-align:center;border-top:1px dashed #b9c9d6;padding-top:6px}
</style></head><body>${paginas}</body></html>`;
}

/** Demonstrativo (uma página) das retenções de um período, para conferência ou anexo único. */
export function demonstrativoHTML(lista, cfg = {}, titulo = '') {
  const ativos = lista.filter(r => !r.anulado);
  const r = resumo(ativos);
  const linhas = ativos.map(x => `<tr><td>${escH(x.numero)}</td><td>${dataBR(x.data)}</td><td>${escH(ORIGENS[x.origem]?.sigla || x.origem)}</td><td>${escH(RUBRICAS[x.rubrica]?.nome || x.rubrica)}</td><td>${escH(x.empenho || '—')}</td><td class="v">${dinheiro(x.centavos)}</td></tr>`).join('');
  const porRub = Object.entries(r.porRubrica).map(([k, v]) => `<tr><td>${escH(RUBRICAS[k]?.nome || k)}</td><td class="v">${dinheiro(v)}</td></tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Demonstrativo de retenções</title><style>
@page{size:A4;margin:13mm}body{font:11px Arial,sans-serif;color:#18324a}header{display:flex;gap:12px;align-items:center;border-bottom:3px solid #1d5d8a;padding-bottom:8px}header img{width:52px;height:52px;object-fit:contain}
h1{font-size:15px}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{padding:6px;border-bottom:1px solid #d5e0e8;text-align:left}th{background:#eef4f9}.v{text-align:right;white-space:nowrap}tfoot td{font-weight:700;background:#f2f8f3}
.assin{display:flex;gap:25px;margin-top:50px}.assin span{flex:1;border-top:1px solid #7c90a3;text-align:center;padding-top:6px}</style></head><body>
<header><img src="${escH(cfg.logo || '')}" alt=""><div><strong>${escH(cfg.orgao || 'PREFEITURA MUNICIPAL DE FREI INOCÊNCIO')}</strong><br>Setor de Contabilidade · SISDIFI</div></header>
<h1>DEMONSTRATIVO DAS RETENÇÕES NAS TRANSFERÊNCIAS${titulo ? ' — ' + escH(titulo) : ''}</h1>
<table><thead><tr><th>Nº</th><th>Data</th><th>Fundo</th><th>Retenção</th><th>Empenho</th><th class="v">Valor</th></tr></thead><tbody>${linhas || '<tr><td colspan="6">Nenhuma retenção no período.</td></tr>'}</tbody>
<tfoot><tr><td colspan="5">TOTAL (${r.quantidade})</td><td class="v">${dinheiro(r.total)}</td></tr></tfoot></table>
<h2 style="font-size:13px">Resumo por retenção</h2><table><tbody>${porRub}</tbody></table>
<div class="assin"><span>${escH(cfg.responsavel || 'Responsável pela Contabilidade')}</span><span>Ordenador(a) da despesa</span></div></body></html>`;
}

/** CSV para planilha. */
export function linhasCSV(lista) {
  return [['Número', 'Data', 'Decêndio', 'Competência', 'Fundo', 'Conta', 'Retenção', 'Credor', 'Valor', 'Base (cota bruta)', 'Empenho', 'Ficha', 'Liquidação', 'Situação', 'Histórico', 'Observação'],
    ...lista.map(r => [r.numero, dataBR(r.data), r.decendio + 'º', r.competencia, ORIGENS[r.origem]?.sigla || r.origem, r.conta, RUBRICAS[r.rubrica]?.nome || r.rubrica,
      r.credor || RUBRICAS[r.rubrica]?.credor || '', (r.centavos / 100).toFixed(2).replace('.', ','), r.base_centavos ? (r.base_centavos / 100).toFixed(2).replace('.', ',') : '',
      r.empenho, r.ficha, r.liquidacao, situacao(r), r.historico, r.observacao])];
}
