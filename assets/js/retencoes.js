// =============================================================
// SISDIFI — Retenções nas transferências constitucionais (FPM, ITR, IPI, LC 176)
// Funções puras: leitura do CSV do DAF (demonstrativos.apps.bb.com.br/arrecadacao-federal),
// leitura do extrato da conta do FPM (CSV ou OFX), classificação das retenções,
// decêndio, numeração e comprovante de retenção para a liquidação do empenho.
// Valores sempre em CENTAVOS (inteiros).
// =============================================================
import { valorPorExtenso } from './calculo.js';
import { CSS_DOC, cabecalhoDoc, toolbarDoc } from './doc-a4.js';

export const ORIGENS = {
  FPM:   { sigla: 'FPM',    nome: 'FPM — Fundo de Participação dos Municípios', conta: '3261-1' },
  ITR:   { sigla: 'ITR',    nome: 'ITR — Imposto Territorial Rural (cota-parte)', conta: '6729-6' },
  IPI:   { sigla: 'IPI',    nome: 'IPI-Exportação (cota-parte)', conta: '92998-0' },
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

// ---------------- Planilha decendial do IPI (SEF/MG) ----------------
/**
 * Linhas da planilha "REPASSE DE RECEITA DO IPI AOS MUNICÍPIOS PARA O DIA 20/10/2026 - ÍNDICE OUTUBRO"
 * (colunas: Código Portaria | Município | Índice | Valor Bruto | Valor FUNDEB | Valor PASEP | Valor Dedução Saúde | Valor Líquido).
 * Devolve a linha do município ou lança erro.
 */
export function lerPlanilhaIPI(linhas, municipio = 'FREI INOCENCIO') {
  const titulo = (linhas.find(l => l.some(c => /REPASSE .*IPI/i.test(String(c ?? '')))) || []).find(c => /REPASSE/i.test(String(c ?? ''))) || '';
  const data = lerData((/DIA\s+(\d{2}\/\d{2}\/\d{4})/i.exec(titulo) || [])[1] || '');
  const iCab = linhas.findIndex(l => l.some(c => /MUNIC/i.test(String(c ?? ''))) && l.some(c => /PASEP/i.test(String(c ?? ''))));
  if (iCab < 0) throw Error('Não encontrei o cabeçalho da planilha do IPI (Município / Valor PASEP).');
  const cab = linhas[iCab].map(c => norm(c));
  const col = re => cab.findIndex(c => re.test(c));
  const c = { mun: col(/MUNIC/), indice: col(/INDICE/), bruto: col(/BRUTO/), fundeb: col(/FUNDEB/), pasep: col(/PASEP/), saude: col(/SAUDE/), liquido: col(/LIQUIDO/) };
  const alvo = norm(municipio);
  const linha = linhas.slice(iCab + 1).find(l => norm(l[c.mun]) === alvo);
  if (!linha) throw Error(`Município ${municipio} não encontrado na planilha.`);
  const cent = v => typeof v === 'number' ? Math.round(v * 100) : (lerValor(v)?.centavos || 0);
  return {
    data, titulo: String(titulo).trim(), indice: typeof linha[c.indice] === 'number' ? linha[c.indice] : Number(linha[c.indice]) || 0,
    bruto: cent(linha[c.bruto]), fundeb: cent(linha[c.fundeb]), pasep: cent(linha[c.pasep]),
    saude: c.saude >= 0 ? cent(linha[c.saude]) : 0, liquido: cent(linha[c.liquido])
  };
}

/** Linha do IPI → movimentos (cota líquida do FUNDEB como base + PASEP), para a mesma conferência dos outros arquivos. */
export function movimentosIPI(ipi) {
  if (!ipi.data) throw Error('A planilha não informa a data do repasse no título.');
  const detalhe_ipi = { titulo: ipi.titulo, indice: ipi.indice, bruto: ipi.bruto, fundeb: ipi.fundeb, pasep: ipi.pasep, saude: ipi.saude, liquido: ipi.liquido };
  return [
    { linha: 1, data: ipi.data, origem: 'IPI', historico: 'Valor bruto menos FUNDEB (planilha SEF/MG)', centavos: ipi.bruto - ipi.fundeb, sinal: 'C', rubrica: 'BASE', estorno: false },
    { linha: 2, data: ipi.data, origem: 'IPI', historico: `PASEP — repasse IPI-Exportação SEF/MG de ${dataBR(ipi.data)}`, centavos: ipi.pasep, sinal: 'D', rubrica: 'PASEP', estorno: false, detalhe_ipi }
  ].filter(m => m.centavos > 0);
}

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
  const estornosRateio = movimentos.filter(m => m.estorno && /^CISDOCE_/.test(m.rubrica) && m.centavos === valorRateioCisdoce).map(m => m.data).sort();
  return movimentos.map((m, i) => ({ m, i })).filter(({ m }) => !['BASE', 'IGNORAR', 'FUNDEB'].includes(m.rubrica) && !(m.bloco && !RUBRICAS[m.rubrica])).map(({ m, i }) => {
    const p = { ...m, avisos: [], base_centavos: 0, duplicado: false };
    if (/^CISDOCE_/.test(p.rubrica) && !/RATEIO|SERVIC/i.test(p.historico.replace(/PRESTA[CÇ][AÃ]O DE SERVI[CÇ]OS/i, ''))) {
      p.rubrica = p.centavos === valorRateioCisdoce ? 'CISDOCE_RATEIO' : 'CISDOCE_SERVICOS';
      if (p.rubrica === 'CISDOCE_RATEIO' && !p.estorno && !estornado.has(i)) {
        rateioDia[p.data] = (rateioDia[p.data] || 0) + 1;
        if (rateioDia[p.data] > 1) {
          // rateio estornado volta a ser cobrado no decêndio seguinte, junto com o rateio do próprio decêndio
          const est = estornosRateio.filter(d => d < p.data).pop();
          p.observacao = 'Rateio CISDOCE do decêndio anterior' + (est ? `, estornado em ${dataBR(est)}` : ' (estornado)') + ', cobrado novamente neste decêndio.';
          p.avisos.push(est ? `Rateio a mais: é o estornado em ${dataBR(est)}, cobrado de novo agora.` : 'Rateio a mais no dia: deve ser o do decêndio anterior, estornado — confira.');
        }
      }
      if (p.rubrica === 'CISDOCE_SERVICOS' && decendioDe(p.data)?.decendio !== 1) p.avisos.push('CISDOCE serviços normalmente só é descontado no dia 10 — confira.');
    }
    const rb = RUBRICAS[p.rubrica];
    if (estornado.has(i)) p.avisos.push(p.estorno ? 'Estorno de débito: anula o débito igual do mesmo dia.' : 'Débito estornado no mesmo dia: não lançar.');
    if (p.bloco) p.avisos.push(`Fundo ${p.bloco} do DAF: escolha a qual transferência lançar.`);
    else if (!p.origem) p.avisos.push('Fundo não identificado: escolha FPM, ITR, IPI, LC 176 ou FEP.');
    if (!p.data) p.avisos.push('Sem data na linha: informe a data.');
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

// ---------------- Empenhos anuais (estimativos) ----------------
/**
 * Empenho padrão de cada retenção por exercício. Chave "RUBRICA" ou "RUBRICA:ORIGEM" (a mais específica vale).
 * Valores informados pela Contabilidade para 2026; editáveis em Configurar.
 */
export const EMPENHOS_PADRAO = {
  2026: { PASEP: '2/2026', 'PASEP:FEP': '4/2026', CISDOCE_RATEIO: '5/2026', CISDOCE_SERVICOS: '6/2026',
          ARDOCE: '7/2026', EMATER: '8/2026', AMM: '9/2026', CNM: '32/2026' }
};
/** Campos de empenho exibidos em Configurar (rubrica[:origem], rótulo). */
export const CHAVES_EMPENHO = [
  ['PASEP', 'PASEP — FPM, ITR, IPI e LC 176'], ['PASEP:FEP', 'PASEP — FEP'], ['EMATER', 'EMATER'], ['ARDOCE', 'ARDOCE'],
  ['CISDOCE_RATEIO', 'CISDOCE — Rateio'], ['CISDOCE_SERVICOS', 'CISDOCE — Serviços'], ['AMM', 'AMM'], ['CNM', 'CNM'],
  ['RFB_DARF', 'RFB — Retenção DARF']
];
/** empenhos: { '2026': { chave: 'nº' } } (configuração salva); cai no padrão do código quando não houver. */
export function empenhoPadrao(empenhos, rubrica, origem, data) {
  const ano = String(data || '').slice(0, 4);
  const tabela = { ...(EMPENHOS_PADRAO[ano] || {}), ...((empenhos || {})[ano] || {}) };
  return String(tabela[rubrica + ':' + origem] || tabela[rubrica] || '').trim();
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
    historico: txt(d.historico, 300), observacao: txt(d.observacao, 500), arquivo: txt(d.arquivo, 120),
    ...(d.detalhe_ipi && typeof d.detalhe_ipi === 'object' ? { detalhe_ipi: {
      titulo: txt(d.detalhe_ipi.titulo, 200), indice: Number(d.detalhe_ipi.indice) || 0,
      ...Object.fromEntries(['bruto', 'fundeb', 'pasep', 'saude', 'liquido'].map(k => [k, Math.round(Number(d.detalhe_ipi[k]) || 0)])) } } : {})
  };
}

export const numeroRetencao = (seq, ano) => 'RET ' + String(seq).padStart(4, '0') + '/' + ano;

/** Ordem da numeração: data do desconto (= data da liquidação), depois fundo e retenção. */
const ORDEM_ORIGEM = ['FPM', 'ITR', 'IPI', 'LC176', 'FEP'];
export function ordemCronologica(a, b) {
  const o = x => { const i = ORDEM_ORIGEM.indexOf(x.origem); return i < 0 ? 99 : i; };
  const r = x => { const i = CODIGOS_RUBRICA.indexOf(x.rubrica); return i < 0 ? 99 : i; };
  return String(a.data).localeCompare(String(b.data)) || o(a) - o(b) || r(a) - r(b) || (a.seq || 0) - (b.seq || 0) || (a.centavos || 0) - (b.centavos || 0);
}
/** Nova numeração de todos os lançamentos do ano pela data: { id: { seq, numero } } (só os que mudam) e o último número. */
export function renumerarPorData(lancamentos, ano) {
  const lista = Object.entries(lancamentos || {}).map(([id, r]) => ({ id, ...r })).sort(ordemCronologica);
  const mudancas = {};
  lista.forEach((r, i) => { const seq = i + 1; if (r.seq !== seq) mudancas[r.id] = { seq, numero: numeroRetencao(seq, ano) }; });
  return { mudancas, ultimo: lista.length };
}
/** Os novos lançamentos ficaram com data anterior a algum já existente (numeração fora da ordem)? */
export const foraDeOrdem = lancamentos => {
  const l = Object.values(lancamentos || {}).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  return l.some((r, i) => i && ordemCronologica(l[i - 1], r) > 0);
};

export function situacao(r) {
  if (r.anulado) return 'Anulado';
  if (r.liquidacao) return 'Liquidado';
  if (r.empenho) return 'Empenhado';
  return 'Aguardando empenho';
}

export function lancamentosAtivos(doc) {
  return Object.entries(doc?.lancamentos || {}).map(([id, r]) => ({ id, ...r }))
    .sort(ordemCronologica); // como um extrato: da data mais antiga para a mais nova
}

/**
 * Linhas no formato de extrato: cada retenção com o saldo acumulado e, ao fim de cada dia, o total do dia.
 * Anuladas aparecem, mas não somam. [{ tipo: 'mov', r, acumulado } | { tipo: 'dia', data, total, quantidade, acumulado }]
 */
export function linhasExtrato(lista) {
  const saida = []; let acumulado = 0, dia = null, totalDia = 0, qtd = 0;
  const fechar = () => { if (dia !== null) saida.push({ tipo: 'dia', data: dia, total: totalDia, quantidade: qtd, acumulado }); };
  for (const r of [...lista].sort(ordemCronologica)) {
    if (r.data !== dia) { fechar(); dia = r.data; totalDia = 0; qtd = 0; }
    if (!r.anulado) { acumulado += r.centavos; totalDia += r.centavos; qtd++; }
    saida.push({ tipo: 'mov', r, acumulado });
  }
  fechar();
  return saida;
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

// ---------------- Histórico contábil ----------------
const ORDINAIS = ['PRIMEIRO', 'SEGUNDO', 'TERCEIRO'];
const MESES_HIST = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
/** "REFERENTE AO PRIMEIRO DECENDIO DO MES DE NOVEMBRO, FPM 3261-1." — texto para colar no histórico do empenho/liquidação. */
export function historicoContabil(r, conta = '') {
  const dec = Number(r.decendio) || decendioDe(r.data)?.decendio;
  const comp = r.competencia || decendioDe(r.data)?.competencia || '';
  const mes = MESES_HIST[Number(comp.slice(5, 7)) - 1];
  if (!dec || !mes) return '';
  const fundo = [ORIGENS[r.origem]?.sigla || r.origem, conta || r.conta || ''].filter(Boolean).join(' ');
  return `REFERENTE AO ${ORDINAIS[dec - 1]} DECENDIO DO MES DE ${mes}, ${fundo}.`;
}

// ---------------- Comprovante ----------------
const escH = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** HTML (uma folha A4 por retenção) do Comprovante de Retenção. cfg: { orgao, cnpj, responsavel, cargo, logo, banco, geradoEm, geradoPor } */
export function comprovanteHTML(lista, cfg = {}) {
  const paginas = lista.map(r => {
    const o = ORIGENS[r.origem] || { nome: r.origem, sigla: r.origem };
    const rb = RUBRICAS[r.rubrica] || { nome: r.rubrica };
    const credor = r.credor || rb.credor || rb.nome;
    const conta = r.conta || o.conta || '';
    const hist = historicoContabil(r, conta);
    const ipi = r.detalhe_ipi;
    const linhas = [
      ['Transferência', escH(o.nome)],
      ['Conta bancária', `${escH(cfg.banco || 'Banco do Brasil')} · conta ${escH(conta || '—')}`],
      ['Data do desconto / liquidação', `${dataBR(r.data)} · ${escH(textoDecendio(r.decendio, r.competencia))}`],
      ['Credor', escH(credor)],
      r.base_centavos ? ['Base de cálculo (cota)', `${dinheiro(r.base_centavos)}${rb.aliquota ? ` · alíquota ${String(rb.aliquota * 100).replace('.', ',')}%` : ''}`] : null,
      ['Empenho / ficha', `${escH(r.empenho || '____________')}${r.ficha ? ' · ficha ' + escH(r.ficha) : ''}${r.liquidacao ? ' · liquidação ' + escH(r.liquidacao) : ''}`],
      ['Histórico no demonstrativo', escH(r.historico || '—')],
      ipi ? ['Planilha SEF/MG', `${escH(ipi.titulo)}<br>Índice ${String(ipi.indice).replace('.', ',')} · Bruto ${dinheiro(ipi.bruto)} · FUNDEB ${dinheiro(ipi.fundeb)} · <b>PASEP ${dinheiro(ipi.pasep)}</b> · Saúde ${dinheiro(ipi.saude)} · Líquido ${dinheiro(ipi.liquido)}`] : null,
      rb.base_legal ? ['Fundamento', escH(rb.base_legal)] : null,
      r.observacao ? ['Observação', escH(r.observacao)] : null
    ].filter(Boolean).map(([t, v]) => `<tr><th>${t}</th><td>${v}</td></tr>`).join('');
    const fonte = ipi ? 'planilha de repasse decendial do IPI aos municípios (Secretaria de Estado de Fazenda de Minas Gerais)'
      : 'Demonstrativo de Distribuição da Arrecadação Federal (Banco do Brasil)';
    return `<main class="paper">${cabecalhoDoc(cfg, 'Retenções nas transferências')}
  <div class="titulo"><h1>COMPROVANTE DE RETENÇÃO</h1><p>TRANSFERÊNCIA CONSTITUCIONAL · RETENÇÃO NA FONTE</p></div>
  <div class="resumo"><div class="item"><small>Nº DO COMPROVANTE</small><strong>${escH(r.numero || '—')}</strong></div>
    <div class="item"><small>DATA DO DESCONTO / LIQUIDAÇÃO</small><strong>${dataBR(r.data)}<br>${escH(textoDecendio(r.decendio, r.competencia))}</strong></div>
    <div class="item"><small>TRANSFERÊNCIA / CONTA</small><strong>${escH(o.sigla)}${conta ? ' · ' + escH(conta) : ''}</strong></div>
    <div class="item total"><small>VALOR RETIDO</small><strong>${dinheiro(r.centavos)}</strong></div></div>
  <section class="bloco"><div class="bloco-cab"><div><span class="rotulo">Identificação da retenção</span><h2>${escH(rb.nome)}</h2><p>${escH(credor)}</p></div>
    <div style="text-align:right"><span class="rotulo">Empenho</span><h2>${escH(r.empenho || '—')}</h2></div></div>
    <table class="tab"><tbody>${linhas}</tbody></table></section>
  <div class="quadro-total"><span>VALOR RETIDO A LIQUIDAR<em>${escH(valorPorExtenso(r.centavos / 100))}</em></span><strong>${dinheiro(r.centavos)}</strong></div>
  ${hist ? `<div class="historico"><small>HISTÓRICO CONTÁBIL</small><p>${escH(hist)}</p></div>` : ''}
  <p class="nota">Declaramos, para instruir a liquidação da despesa, que o valor acima foi <b>retido/descontado na fonte</b> pelo agente financeiro no repasse da transferência indicada, sem saída de numerário da conta do Município, devendo ser empenhado e liquidado em favor do credor e baixado contra a própria conta da transferência. Fonte: ${fonte} e extrato da conta da transferência${r.arquivo ? ' (arquivo ' + escH(r.arquivo) + ')' : ''}.</p>
  <div class="assinaturas"><span>Responsável pela conferência</span><span>${escH(cfg.responsavel || 'Setor de Contabilidade')}<br>${escH(cfg.cargo || 'Contador(a)')}</span><span>Ordenador(a) da despesa</span></div>
  <footer class="rodape"><span>Prefeitura Municipal · SISDIFI · código de verificação <b>${codigoVerificacao(r)}</b></span><span>Emitido em ${escH(cfg.geradoEm || '')}${cfg.geradoPor ? ' por ' + escH(cfg.geradoPor) : ''}</span></footer>
</main>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comprovante de retenção${lista.length === 1 ? ' ' + escH(lista[0].numero || '') : 's'}</title><style>${CSS_DOC}</style></head><body>${toolbarDoc(lista.length === 1 ? 'Comprovante de retenção' : lista.length + ' comprovantes de retenção (uma folha cada)')}${paginas}</body></html>`;
}

/** Demonstrativo (uma folha) das retenções de um período, para conferência ou anexo único. */
export function demonstrativoHTML(lista, cfg = {}, titulo = '') {
  const ativos = lista.filter(r => !r.anulado);
  const r = resumo(ativos);
  const linhas = linhasExtrato(ativos).map(l => l.tipo === 'dia'
    ? `<tr class="dia"><td colspan="5">Total do dia ${dataBR(l.data)} (${l.quantidade})</td><td class="v">${dinheiro(l.total)}</td><td class="v">${dinheiro(l.acumulado)}</td></tr>`
    : `<tr><td>${escH(l.r.numero)}</td><td>${dataBR(l.r.data)}</td><td>${escH(ORIGENS[l.r.origem]?.sigla || l.r.origem)}${l.r.conta ? ' ' + escH(l.r.conta) : ''}</td><td>${escH(RUBRICAS[l.r.rubrica]?.nome || l.r.rubrica)}</td><td>${escH(l.r.empenho || '—')}</td><td class="v">${dinheiro(l.r.centavos)}</td><td class="v">${dinheiro(l.acumulado)}</td></tr>`).join('');
  const porRub = Object.entries(r.porRubrica).map(([k, v]) => `<tr><td>${escH(RUBRICAS[k]?.nome || k)}</td><td>${escH([...new Set(ativos.filter(a => a.rubrica === k).map(a => a.empenho).filter(Boolean))].join(', ') || '—')}</td><td class="v">${dinheiro(v)}</td></tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Extrato das retenções</title><style>${CSS_DOC}.lista tr.dia td{background:#f2f8f3;font-weight:700;color:#1b5c39;font-size:11px}</style></head><body>${toolbarDoc('Extrato das retenções')}
<main class="paper">${cabecalhoDoc(cfg, 'Retenções nas transferências')}
<div class="titulo"><h1>EXTRATO DAS RETENÇÕES</h1><p>TRANSFERÊNCIAS CONSTITUCIONAIS${titulo ? ' · ' + escH(titulo).toUpperCase() : ''}</p></div>
<section class="bloco"><table class="tab lista"><thead><tr><th>Nº</th><th>Data</th><th>Fundo / conta</th><th>Retenção</th><th>Empenho</th><th class="v">Valor</th><th class="v">Acumulado</th></tr></thead><tbody>${linhas || '<tr><td colspan="7">Nenhuma retenção no período.</td></tr>'}</tbody>
<tfoot><tr><td colspan="5">TOTAL (${r.quantidade} retenção(ões))</td><td class="v">${dinheiro(r.total)}</td><td class="v">${dinheiro(r.total)}</td></tr></tfoot></table></section>
<section class="bloco"><div class="bloco-cab"><div><span class="rotulo">Resumo por retenção</span></div></div><table class="tab lista"><tbody>${porRub}</tbody></table></section>
<div class="quadro-total"><span>TOTAL RETIDO NO PERÍODO</span><strong>${dinheiro(r.total)}</strong></div>
<div class="assinaturas"><span>Responsável pela conferência</span><span>${escH(cfg.responsavel || 'Setor de Contabilidade')}</span><span>Ordenador(a) da despesa</span></div>
<footer class="rodape"><span>Prefeitura Municipal · SISDIFI</span><span>Emitido em ${escH(cfg.geradoEm || '')}</span></footer></main></body></html>`;
}

/** CSV para planilha. */
export function linhasCSV(lista) {
  return [['Número', 'Data', 'Decêndio', 'Competência', 'Fundo', 'Conta', 'Retenção', 'Credor', 'Valor', 'Acumulado', 'Base (cota bruta)', 'Empenho', 'Ficha', 'Liquidação', 'Situação', 'Histórico contábil', 'Histórico no demonstrativo', 'Observação'],
    ...linhasExtrato(lista).filter(l => l.tipo === 'mov').map(({ r, acumulado }) => [r.numero, dataBR(r.data), r.decendio + 'º', r.competencia, ORIGENS[r.origem]?.sigla || r.origem, r.conta, RUBRICAS[r.rubrica]?.nome || r.rubrica,
      r.credor || RUBRICAS[r.rubrica]?.credor || '', (r.centavos / 100).toFixed(2).replace('.', ','), (acumulado / 100).toFixed(2).replace('.', ','), r.base_centavos ? (r.base_centavos / 100).toFixed(2).replace('.', ',') : '',
      r.empenho, r.ficha, r.liquidacao, situacao(r), historicoContabil(r), r.historico, r.observacao])];
}
