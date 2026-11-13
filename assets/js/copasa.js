// =============================================================
// SISDIFI — Contas de água da COPASA (conta centralizadora por e-mail)
// Lê o arquivo "mat<matrícula>.txt" (CSV ";" que vem no e-mail "Chegou sua conta por e-mail"),
// separa cada imóvel (matrícula do imóvel), identifica o empenho de cada um e totaliza por empenho,
// conferindo com o valor da fatura. Funções puras (valores em centavos).
// =============================================================
import { CSS_DOC, cabecalhoDoc, toolbarDoc, escH } from './doc-a4.js';

/** Contas centralizadoras da Prefeitura (matrícula do cliente → secretaria). */
export const CENTRALIZADORAS = {
  '5649': 'Secretaria de Administração',
  '113863829': 'Secretaria de Educação',
  '113863845': 'Secretaria de Saúde'
};

/**
 * Cadastro inicial (planilha "COPASA CENTRALIZADORA" de out/2026): locais com o empenho de 2026 e a matrícula de cada imóvel.
 * Editável na tela (Cadastro); o que for salvo no Firebase prevalece.
 */
export const LOCAIS_PADRAO = {
  L83: { nome: 'Secretaria de Educação', centralizadora: '113863829', empenhos: { 2026: '83/2026' } },
  L84: { nome: 'Creche Municipal', centralizadora: '113863829', empenhos: { 2026: '84/2026' } },
  L85: { nome: 'Pró-Infância', centralizadora: '113863829', empenhos: { 2026: '85/2026' } },
  L86: { nome: 'Ensino Fundamental', centralizadora: '113863829', empenhos: { 2026: '86/2026' } },
  L87: { nome: 'ESFs e Centro de Saúde', centralizadora: '113863845', empenhos: { 2026: '87/2026' } },
  L88: { nome: 'Vigilância Sanitária', centralizadora: '113863845', empenhos: { 2026: '88/2026' } },
  L89: { nome: 'Consurge / SAMU', centralizadora: '113863845', empenhos: { 2026: '89/2026' } },
  L90: { nome: 'Hospital Municipal', centralizadora: '113863845', empenhos: { 2026: '90/2026' } },
  L91: { nome: 'IMA', centralizadora: '5649', empenhos: { 2026: '91/2026' } },
  L92: { nome: 'Sede da Prefeitura', centralizadora: '5649', empenhos: { 2026: '92/2026' } },
  L93: { nome: 'Praças, Jardim e Cemitério', centralizadora: '5649', empenhos: { 2026: '93/2026' } },
  L94: { nome: 'Campos, Quadras e Centro Olímpico', centralizadora: '5649', empenhos: { 2026: '94/2026' } },
  L95: { nome: 'Conselho Tutelar', centralizadora: '5649', empenhos: { 2026: '95/2026' } },
  L97: { nome: 'CRAS e CREAS', centralizadora: '5649', empenhos: { 2026: '97/2026' } }
};
export const IMOVEIS_PADRAO = {
  // Educação
  7458401: 'L83', 156284693: 'L83', 18320066: 'L84', 19709111: 'L85', 7460988: 'L86', 103222901: 'L86',
  // Saúde
  7459637: 'L87', 7460261: 'L87', 123175305: 'L87', 122126416: 'L87', 172741416: 'L87', 16263626: 'L87', 7457669: 'L87', 7457545: 'L87',
  22260501: 'L88', 7458991: 'L89', 22774718: 'L90', 18176046: 'L90',
  // Administração
  114765588: 'L91', 17082579: 'L92', 7459025: 'L92',
  148743901: 'L93', 112931049: 'L93', 19155590: 'L93', 118511475: 'L93', 175693251: 'L93', 7458444: 'L93',
  7463260: 'L94', 139627987: 'L94', 165530600: 'L94', 161103251: 'L94', 145674053: 'L94', 145676358: 'L94', 144885859: 'L94',
  7457821: 'L95', 7457928: 'L97', 7457731: 'L97', 158557875: 'L97'
};

/** Junta o cadastro do código com o salvo ({ locais, imoveis }). */
export function cadastroCompleto(salvo = {}) {
  const locais = {};
  for (const [id, l] of Object.entries(LOCAIS_PADRAO)) locais[id] = { ...l, empenhos: { ...l.empenhos } };
  for (const [id, l] of Object.entries(salvo.locais || {})) {
    if (l === null) { delete locais[id]; continue; }
    locais[id] = { ...(locais[id] || {}), ...l, empenhos: { ...(locais[id]?.empenhos || {}), ...(l.empenhos || {}) } };
  }
  const imoveis = { ...Object.fromEntries(Object.entries(IMOVEIS_PADRAO).map(([k, v]) => [String(k), v])), ...(salvo.imoveis || {}) };
  return { locais, imoveis };
}

// ---------------- leitura ----------------
const cent = t => {
  const s = String(t ?? '').trim().replace(/\s/g, '');
  if (!s) return 0;
  const neg = /^-/.test(s);
  const n = s.replace(/^-/, '').replace(/\./g, '').replace(',', '.');
  const v = Math.round(Number(n) * 100);
  return Number.isFinite(v) ? (neg ? -v : v) : 0;
};
const tira0 = t => String(t ?? '').trim().replace(/^0+(?=\d)/, '');
const dataISO = t => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(t || '').trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };

/** É o arquivo detalhado da conta centralizadora (cabeçalho "Mat. Cliente;Nome Cliente;...")? */
export const ehArquivoCopasa = texto => /^﻿?Mat\. Cliente;Nome Cliente;/.test(String(texto || '').trimStart());

/**
 * Lê o mat<nº>.txt. Retorna { matriculaCliente, cliente, fatura, referencia, emissao, vencimento, imoveis:[...] , total }
 * Cada imóvel: { matricula, idUsuario, nome, endereco, valor (centavos, já líquido), irrf, lancamentos:[{codigo, descricao, valor}] }.
 */
export function lerContaCopasa(texto) {
  const linhas = String(texto || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length || !ehArquivoCopasa(linhas[0])) throw Error('Não é o arquivo de detalhamento da COPASA (mat….txt com "Mat. Cliente;Nome Cliente;…").');
  const cab = linhas[0].split(';').map(c => c.trim());
  const i = n => { const k = cab.indexOf(n); if (k < 0) throw Error('Coluna ausente no arquivo da COPASA: ' + n); return k; };
  const C = { cli: i('Mat. Cliente'), nomeCli: i('Nome Cliente'), fat: i('Num. Fatura'), ref: i('Ref.'), emi: i('Data Emissao'), venc: i('Data Vencto.'),
    mat: i('Mat. Imovel'), id: i('Id. Usuario'), nome: i('Nome Cliente Pre-fatura'), end: i('Endereco Imovel'),
    cod: i('Cod. Lancto.'), desc: i('Descricao Lancamento'), vl: i('Valor Lancto.'), vp: i('Valor Pre-fatura') };
  const conta = { matriculaCliente: '', cliente: '', fatura: '', referencia: '', emissao: '', vencimento: '', imoveis: [], total: 0 };
  let atual = null;
  for (const l of linhas.slice(1)) {
    const c = l.split(';');
    if (c.length <= C.vp) continue;
    if (!conta.fatura && c[C.fat]?.trim()) Object.assign(conta, {
      matriculaCliente: tira0(c[C.cli]), cliente: c[C.nomeCli].trim(), fatura: tira0(c[C.fat]), referencia: c[C.ref].trim(),
      emissao: dataISO(c[C.emi]), vencimento: dataISO(c[C.venc]) });
    if (c[C.mat]?.trim()) {
      atual = { matricula: tira0(c[C.mat]), idUsuario: tira0(c[C.id]), nome: c[C.nome].trim(), endereco: c[C.end].trim().replace(/\s+/g, ' '), valor: 0, irrf: 0, lancamentos: [] };
      conta.imoveis.push(atual);
    }
    if (!atual) continue;
    const desc = (c[C.desc] || '').trim().replace(/\s+/g, ' ');
    if (desc) {
      const codigo = c[C.cod].trim(), valor = cent(c[C.vl]);
      atual.lancamentos.push({ codigo, descricao: desc, valor });
      if (codigo === '426' || /RETENCAO IRRF/.test(desc)) atual.irrf += valor;
    }
    if (c[C.vp]?.trim()) atual.valor = cent(c[C.vp]);
  }
  conta.total = conta.imoveis.reduce((s, x) => s + x.valor, 0);
  if (!conta.imoveis.length) throw Error('O arquivo da COPASA não tem imóveis.');
  return conta;
}

/** Ano do exercício a partir da referência "10/2026". */
export const anoDaReferencia = ref => Number(String(ref || '').split('/')[1]) || new Date().getFullYear();

/**
 * Separa os imóveis da conta por empenho (local). Imóvel sem cadastro fica em "pendentes".
 * Retorna { grupos:[{ local, nome, empenho, imoveis, total, irrf }], pendentes:[imóvel], total, irrf, semEmpenho:[local] }.
 */
export function separarPorEmpenho(conta, cadastro) {
  const ano = anoDaReferencia(conta.referencia);
  const porLocal = new Map(), pendentes = [];
  for (const im of conta.imoveis) {
    const id = cadastro.imoveis[im.matricula];
    const local = id && cadastro.locais[id];
    if (!local) { pendentes.push(im); continue; }
    if (!porLocal.has(id)) porLocal.set(id, { local: id, nome: local.nome, empenho: String(local.empenhos?.[ano] || '').trim(), imoveis: [], total: 0, irrf: 0 });
    const g = porLocal.get(id);
    g.imoveis.push(im); g.total += im.valor; g.irrf += im.irrf;
  }
  const ordem = g => { const n = parseInt(g.empenho, 10); return Number.isFinite(n) ? n : 1e9; };
  const grupos = [...porLocal.values()].sort((a, b) => ordem(a) - ordem(b) || a.nome.localeCompare(b.nome, 'pt-BR'));
  return { grupos, pendentes, total: conta.total, irrf: conta.imoveis.reduce((s, x) => s + x.irrf, 0),
    semEmpenho: grupos.filter(g => !g.empenho).map(g => g.nome), ano };
}

/** Locais oferecidos para um imóvel novo (os da mesma conta centralizadora primeiro). */
export function locaisDaCentralizadora(cadastro, matriculaCliente) {
  return Object.entries(cadastro.locais).map(([id, l]) => ({ id, ...l }))
    .sort((a, b) => (b.centralizadora === matriculaCliente) - (a.centralizadora === matriculaCliente) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// ---------------- saídas ----------------
export const dinheiroC = c => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numBR = c => (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBR = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—';
const MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
export const nomeSecretaria = conta => CENTRALIZADORAS[conta.matriculaCliente] || conta.cliente;

/** "REFERENTE A CONTA DE AGUA DO MES DE OUTUBRO/2026 - ENSINO FUNDAMENTAL, FATURA 126851617051." */
export function historicoCopasa(conta, grupo) {
  const [m, a] = String(conta.referencia || '').split('/');
  const mes = MESES[Number(m) - 1] || m;
  return `REFERENTE A CONTA DE AGUA DO MES DE ${mes}/${a} - ${String(grupo.nome || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}, FATURA ${conta.fatura}.`;
}

/** Linhas no formato da planilha (EMP | LOCAL | ENDEREÇO | VALOR | TOTAL). */
export function linhasPlanilha(contas, cadastro) {
  const linhas = [['Secretaria', 'Fatura', 'Referência', 'Vencimento', 'EMP', 'LOCAL', 'Matrícula do imóvel', 'ENDEREÇO', 'VALOR', 'IRRF', 'TOTAL DO EMPENHO']];
  for (const conta of contas) {
    const s = separarPorEmpenho(conta, cadastro);
    for (const g of s.grupos) g.imoveis.forEach((im, k) => linhas.push([nomeSecretaria(conta), conta.fatura, conta.referencia, dataBR(conta.vencimento),
      k ? '' : g.empenho, k ? '' : g.nome, im.matricula, im.endereco, numBR(im.valor), im.irrf ? numBR(im.irrf) : '', k === g.imoveis.length - 1 ? numBR(g.total) : '']));
    for (const im of s.pendentes) linhas.push([nomeSecretaria(conta), conta.fatura, conta.referencia, dataBR(conta.vencimento), '?', 'SEM CADASTRO', im.matricula, im.endereco, numBR(im.valor), im.irrf ? numBR(im.irrf) : '', '']);
    linhas.push([nomeSecretaria(conta), conta.fatura, conta.referencia, dataBR(conta.vencimento), '', 'TOTAL DA FATURA', '', '', numBR(conta.total), '', '']);
  }
  return linhas;
}

/** Memória por empenho de uma ou mais faturas — uma folha A4 por fatura, no padrão dos documentos do SISDIFI. */
export function memoriaCopasaHTML(contas, cadastro, cfg = {}) {
  const paginas = contas.map(conta => {
    const s = separarPorEmpenho(conta, cadastro);
    const blocos = s.grupos.map(g => `<section class="bloco"><div class="bloco-cab"><div><span class="rotulo">Empenho</span><h2>${escH(g.empenho || 'SEM EMPENHO')} · ${escH(g.nome)}</h2>
      <p>${g.imoveis.length} imóvel(is)${g.irrf ? ' · IRRF retido ' + dinheiroC(g.irrf) : ''}</p></div><div style="text-align:right"><span class="rotulo">Valor a liquidar</span><h2>${dinheiroC(g.total)}</h2></div></div>
      <table class="tab lista"><thead><tr><th>Matrícula</th><th>Endereço do imóvel</th><th class="v">Valor</th></tr></thead><tbody>${
        g.imoveis.map(im => `<tr><td>${escH(im.matricula)}</td><td>${escH(im.endereco)}${im.irrf ? ` <small>(IRRF ${dinheiroC(im.irrf)})</small>` : ''}</td><td class="v">${dinheiroC(im.valor)}</td></tr>`).join('')
      }</tbody></table><div class="historico" style="margin:0;border:0;border-top:1px dashed #9db6c8;border-radius:0"><small>HISTÓRICO</small><p>${escH(historicoCopasa(conta, g))}</p></div></section>`).join('');
    const pend = s.pendentes.length ? `<section class="bloco" style="border-color:#e0b25c"><div class="bloco-cab" style="background:#fff7e6"><div><span class="rotulo">Imóveis sem cadastro</span><h2>Definir o empenho</h2></div></div>
      <table class="tab lista"><tbody>${s.pendentes.map(im => `<tr><td>${escH(im.matricula)}</td><td>${escH(im.endereco)}</td><td class="v">${dinheiroC(im.valor)}</td></tr>`).join('')}</tbody></table></section>` : '';
    const resumoEmp = `<section class="bloco"><div class="bloco-cab"><div><span class="rotulo">Resumo por empenho</span></div></div><table class="tab lista"><thead><tr><th>Empenho</th><th>Local</th><th class="v">Valor</th></tr></thead><tbody>${
      s.grupos.map(g => `<tr><td>${escH(g.empenho || '—')}</td><td>${escH(g.nome)}</td><td class="v">${dinheiroC(g.total)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">TOTAL DA FATURA</td><td class="v">${dinheiroC(s.total)}</td></tr></tfoot></table></section>`;
    return `<main class="paper">${cabecalhoDoc(cfg, 'Contas de água · COPASA')}
  <div class="titulo"><h1>CONTAS DE ÁGUA — COPASA</h1><p>DISTRIBUIÇÃO DA FATURA POR EMPENHO · ${escH(nomeSecretaria(conta).toUpperCase())}</p></div>
  <div class="resumo"><div class="item"><small>MATRÍCULA CENTRALIZADORA</small><strong>${escH(conta.matriculaCliente)}</strong></div>
    <div class="item"><small>FATURA · REFERÊNCIA</small><strong>${escH(conta.fatura)}<br>${escH(conta.referencia)}</strong></div>
    <div class="item"><small>EMISSÃO · VENCIMENTO</small><strong>${dataBR(conta.emissao)}<br>${dataBR(conta.vencimento)}</strong></div>
    <div class="item total"><small>TOTAL DA FATURA</small><strong>${dinheiroC(s.total)}</strong></div></div>
  ${resumoEmp}${blocos}${pend}
  <div class="quadro-total"><span>TOTAL DA FATURA${s.irrf ? `<em>IRRF retido pela COPASA na fatura: ${dinheiroC(s.irrf)}</em>` : ''}</span><strong>${dinheiroC(s.total)}</strong></div>
  <div class="assinaturas"><span>Responsável pela conferência</span><span>${escH(cfg.responsavel || 'Setor de Contabilidade')}</span><span>Ordenador(a) da despesa</span></div>
  <footer class="rodape"><span>Prefeitura Municipal · SISDIFI</span><span>Emitido em ${escH(cfg.geradoEm || '')}${cfg.geradoPor ? ' por ' + escH(cfg.geradoPor) : ''}</span></footer></main>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contas COPASA por empenho</title><style>${CSS_DOC}.paper{min-height:0}.tab small{color:#6b7f90}</style></head><body>${toolbarDoc('Contas da COPASA por empenho (uma folha por fatura)')}${paginas}</body></html>`;
}
