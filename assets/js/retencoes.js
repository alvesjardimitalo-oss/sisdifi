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
  LC176: { sigla: 'LC 176', nome: 'ADO 25 / LC nº 176/2020 (auxílio aos municípios)', conta: '' }
};

// tipo: 'retencao' entra no lançamento; 'info' só aparece na conferência (não é liquidada por empenho)
export const RUBRICAS = {
  PASEP:            { nome: 'PASEP', credor: 'PASEP — Secretaria Especial da Receita Federal do Brasil', origens: ['FPM', 'ITR', 'IPI', 'LC176'], aliquota: 0.01,
                      base_legal: 'Lei nº 9.715/1998, art. 2º, III, e art. 8º, III (1% sobre as transferências recebidas)' },
  EMATER:           { nome: 'EMATER', credor: 'EMATER-MG', origens: ['FPM'] },
  CISDOCE_RATEIO:   { nome: 'CISDOCE — Rateio', credor: 'CISDOCE', origens: ['FPM'] },
  CISDOCE_SERVICOS: { nome: 'CISDOCE — Serviços', credor: 'CISDOCE', origens: ['FPM'] },
  ARDOCE:           { nome: 'ARDOCE', credor: 'ARDOCE', origens: ['FPM'] },
  AMM:              { nome: 'AMM', credor: 'AMM — Associação Mineira de Municípios', origens: ['FPM'] },
  CNM:              { nome: 'CNM', credor: 'CNM — Confederação Nacional de Municípios', origens: ['FPM'] },
  OUTRA:            { nome: 'Outra retenção', credor: '', origens: ['FPM', 'ITR', 'IPI', 'LC176'] }
};
export const CODIGOS_RUBRICA = Object.keys(RUBRICAS);

// ---------------- Números e datas ----------------
/** "1.234,56", "R$ 1.234,56 D", "-1234,56", "1234.56", "(1.234,56)" → { centavos, sinal: 'C'|'D'|'' } ou null */
export function lerValor(texto) {
  let t = String(texto ?? '').trim();
  if (!t) return null;
  let sinal = '';
  const sufixo = /([CD])\s*$/i.exec(t);
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
 * Decêndio a que o crédito se refere. Os repasses saem nos dias 10, 20 e 30 (ou no dia útil seguinte),
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
  if (/\bTOTAL\b|SALDO|^SUBTOTAL/.test(t)) return 'IGNORAR';
  if (/PASEP/.test(t)) return 'PASEP';
  if (/EMATER/.test(t)) return 'EMATER';
  if (/CISDOCE|CIS ?DOCE/.test(t)) return /SERVIC/.test(t) ? 'CISDOCE_SERVICOS' : 'CISDOCE_RATEIO';
  if (/ARDOCE/.test(t)) return 'ARDOCE';
  if (/\bAMM\b|ASSOCIACAO MINEIRA/.test(t)) return 'AMM';
  if (/\bCNM\b|CONFEDERACAO NACIONAL/.test(t)) return 'CNM';
  if (/FUNDEB/.test(t)) return 'FUNDEB';
  if (sinal !== 'D' && /COTA|PARCELA|CREDITO|REPASSE|TRANSF|\bFPM\b|\bITR\b|\bIPI\b|LC ?176|ADO ?25/.test(t)) return 'BASE';
  return '';
}

/** Fundo/origem citado num texto (cabeçalho do DAF ou histórico). '' se não identificar. */
export function origemDe(texto) {
  const t = norm(texto);
  if (/LC ?N?º? ?176|176\/2020|ADO ?25|AUXILIO .*MUNICIP/.test(t)) return 'LC176';
  if (/\bFPM\b|FUNDO DE PARTICIPACAO DOS MUN/.test(t)) return 'FPM';
  if (/\bITR\b|TERRITORIAL RURAL/.test(t)) return 'ITR';
  if (/\bIPI\b|EXPORTAC/.test(t)) return 'IPI';
  return '';
}

// ---------------- CSV ----------------
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
  const n = linha.map(norm);
  const idx = re => n.findIndex(x => re.test(x));
  const m = { data: idx(/^DATA/), hist: idx(/HISTORICO|LANCAMENTO|DESCRICAO|PARCELA|DETALHE|RUBRICA/), valor: idx(/^VALOR|VALOR DISTRIBUIDO|^QUANTIA/), dc: idx(/^(D\/C|C\/D|TIPO|NATUREZA|DEB|CRED)/) };
  return (m.data >= 0 || m.hist >= 0) && m.valor >= 0 ? m : null;
}

/**
 * Lê CSV do DAF ou do extrato e devolve as linhas com valor:
 * [{ linha, data, origem, historico, centavos, sinal, rubrica }]
 * origemPadrao: origem quando o arquivo não informa (extrato da conta do FPM → 'FPM').
 */
export function lerMovimentos(texto, { origemPadrao = '' } = {}) {
  const linhas = lerCSV(texto);
  const saida = [];
  let colunas = null, dataAtual = '', origemAtual = origemPadrao;
  linhas.forEach((cel, i) => {
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
        if (v && /[,.]\d{2}\s*[CD]?\)?$/i.test(c)) { valor = v; continue; }
        if (/^[CD]$/i.test(c)) { dc = c.toUpperCase(); continue; }
        textos.push(c);
      }
      hist = textos.join(' ').trim();
    }
    if (dc && valor) { if (/^D|DEB|SAIDA/.test(dc)) valor.sinal = 'D'; else if (/^C|CRED|ENTRADA/.test(dc)) valor.sinal = valor.sinal || 'C'; }
    const o = origemDe(hist);
    if (!valor) {
      // linha de cabeçalho/título: troca o fundo atual (ex.: "FPM - FUNDO DE PARTICIPACAO")
      const oLinha = origemDe(cel.join(' '));
      if (oLinha) origemAtual = oLinha;
      if (data) dataAtual = data;
      return;
    }
    if (data) dataAtual = data;
    const rubrica = classificar(hist, valor.sinal);
    if (o && rubrica === 'BASE') origemAtual = o;
    if (!valor.centavos) return;
    saida.push({ linha: i + 1, data: dataAtual, origem: (rubrica === 'BASE' ? o : '') || origemAtual || o || '', historico: hist, centavos: valor.centavos, sinal: valor.sinal, rubrica });
  });
  return saida;
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
    saida.push({ linha: i + 1, data: lerData(tag(b, 'DTPOSTED')), origem: '', historico: hist, centavos: Math.round(Math.abs(n) * 100), sinal, rubrica: classificar(hist, sinal) });
  });
  return saida;
}

/** Detecta o formato e devolve os movimentos. */
export function lerArquivo(texto, opcoes = {}) {
  const lista = /<OFX>|<STMTTRN>/i.test(texto) ? lerOFX(texto) : lerMovimentos(texto, opcoes);
  if (opcoes.origemPadrao) for (const m of lista) if (!m.origem) m.origem = opcoes.origemPadrao;
  return lista;
}

export const chaveDuplicidade = r => [r.data, r.origem, r.rubrica, r.centavos].join('|');

/**
 * Transforma movimentos lidos em propostas de lançamento:
 * - só as rubricas de retenção (PASEP, EMATER...) vêm marcadas;
 * - PASEP é conferido contra 1% da cota bruta (linha "BASE") do mesmo dia e fundo;
 * - marca duplicidade com o que já está lançado.
 */
export function proporLancamentos(movimentos, existentes = []) {
  const ja = new Set(existentes.filter(e => !e.anulado).map(chaveDuplicidade));
  const bases = {};
  for (const m of movimentos) if (m.rubrica === 'BASE' && m.sinal !== 'D') {
    const k = m.data + '|' + m.origem; bases[k] = (bases[k] || 0) + m.centavos;
  }
  const vistos = new Set();
  return movimentos.filter(m => m.rubrica !== 'BASE' && m.rubrica !== 'IGNORAR').map(m => {
    const retencao = !!RUBRICAS[m.rubrica];
    const base = bases[m.data + '|' + m.origem] || 0;
    const avisos = [];
    if (!m.data) avisos.push('Sem data na linha: informe a data.');
    if (!m.origem) avisos.push('Fundo não identificado: escolha FPM, ITR, IPI ou LC 176.');
    if (m.rubrica === 'FUNDEB') avisos.push('Dedução do FUNDEB: é dedução de receita, normalmente não se liquida por empenho.');
    if (!m.rubrica) avisos.push('Histórico não reconhecido: escolha a rubrica se for uma retenção.');
    if (retencao && m.sinal === 'C') avisos.push('Lançamento a crédito: confira se é mesmo uma retenção.');
    let base_centavos = 0;
    if (m.rubrica === 'PASEP' && base) {
      base_centavos = base;
      const esperado = Math.round(base * RUBRICAS.PASEP.aliquota);
      if (Math.abs(esperado - m.centavos) > 5) avisos.push(`PASEP diferente de 1% da cota (${dinheiro(esperado)} sobre ${dinheiro(base)}).`);
    }
    const proposta = { ...m, base_centavos, avisos, duplicado: false };
    const k = chaveDuplicidade(proposta);
    if (retencao && (ja.has(k) || vistos.has(k))) { proposta.duplicado = true; avisos.push('Já lançado no SISDIFI (mesma data, fundo, rubrica e valor).'); }
    vistos.add(k);
    proposta.marcado = retencao && !proposta.duplicado && !!m.data && !!m.origem && m.sinal !== 'C';
    return proposta;
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
