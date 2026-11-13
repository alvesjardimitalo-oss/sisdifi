// SISDIFI — Blocos do Painel por perfil: Central da Contabilidade (retenções, duodécimo, atalhos) e Administração.
// Os dados das retenções e do duodécimo são ouvidos em tempo real (só ADM/Contabilidade têm acesso pelas regras).
import * as db from '../db.js';
import { estado, pode } from '../estado.js';
import { esc } from '../ui.js';
import { lancamentosAtivos, situacao, dinheiro, dataBR, decendioDe, textoDecendio } from '../retencoes.js';
import { repassesAtivos, resumoDuodecimo, META_MENSAL_PADRAO, MESES_DUODECIMO } from '../duodecimo.js';

let ouvindo = null; // { ano, parar }
const dados = { retencoes: null, duodecimo: null, erroRet: false, erroDuo: false };

function ouvir(ano) {
  if (ouvindo?.ano === ano && ouvindo.uid === estado.sessao?.uid) return;
  ouvindo?.parar();
  dados.retencoes = dados.duodecimo = null; dados.erroRet = dados.erroDuo = false;
  const redesenhar = () => window.dispatchEvent(new Event('sisdifi:redesenhar'));
  const p1 = db.ouvirDoc('retencoes_anos', String(ano), d => { dados.retencoes = d || { lancamentos: {} }; redesenhar(); }, () => { dados.erroRet = true; });
  const p2 = db.ouvirDoc('duodecimo_anos', String(ano), d => { dados.duodecimo = d || { repasses: {} }; redesenhar(); }, () => { dados.erroDuo = true; });
  ouvindo = { ano, uid: estado.sessao?.uid, parar: () => { try { p1(); p2(); } catch { /* encerrado */ } } };
}
window.addEventListener('sisdifi:exercicio', () => { ouvindo?.parar(); ouvindo = null; });

const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Datas de repasse do FPM (10, 20 e último dia/30) entre o início do ano e hoje + o próximo. */
export function decendiosDoAno(ano, hoje = hojeISO()) {
  const datas = [];
  for (let m = 1; m <= 12; m++) {
    const ult = new Date(Date.UTC(ano, m, 0)).getUTCDate();
    for (const d of [10, 20, Math.min(30, ult)]) datas.push(`${ano}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return { passados: datas.filter(d => d <= hoje), proximo: datas.find(d => d > hoje) || null };
}

/** Decêndios (já passados, com 3 dias de folga) sem nenhuma retenção do FPM lançada. */
export function decendiosSemLancamento(lancamentos, ano, hoje = hojeISO()) {
  const fpm = lancamentos.filter(r => !r.anulado && r.origem === 'FPM').map(r => {
    const d = decendioDe(r.data); return d ? d.competencia + '|' + d.decendio : '';
  });
  const tem = new Set(fpm);
  const limite = new Date(hoje + 'T12:00:00'); limite.setDate(limite.getDate() - 3);
  const lim = limite.toISOString().slice(0, 10);
  const primeiro = lancamentos.filter(r => !r.anulado).map(r => r.data).sort()[0];
  return decendiosDoAno(ano, hoje).passados.filter(d => d <= lim && (!primeiro || d >= primeiro))
    .filter(d => { const x = decendioDe(d); return x && !tem.has(x.competencia + '|' + x.decendio); });
}

const card = (href, rotulo, valor, extra = '', alerta = false) =>
  `<a href="${href}"><div class="kpi ${alerta ? 'kpi-alerta' : ''}"><span style="min-width:0;flex:1">${rotulo}${extra ? `<small style="display:block;color:var(--muted);font-weight:400">${extra}</small>` : ''}</span><strong${String(valor).length > 6 ? ' style="font-size:16px;white-space:nowrap;flex-shrink:0"' : ''}>${valor}</strong></div></a>`;

/** Central da Contabilidade: retenções pendentes, decêndios sem lançamento, duodécimo do mês e atalhos. */
export function blocoContabilidade() {
  if (!pode.contabil()) return '';
  const ano = Number(estado.exercicio) || new Date().getFullYear();
  ouvir(ano);
  const cards = [];
  let alertas = '';
  if (dados.retencoes) {
    const lista = lancamentosAtivos(dados.retencoes).filter(r => !r.anulado);
    const pend = lista.filter(r => situacao(r) !== 'Liquidado');
    const semEmp = lista.filter(r => !r.empenho);
    cards.push(card('#/retencoes', 'Retenções pendentes de liquidação', pend.length, dinheiro(pend.reduce((s, r) => s + r.centavos, 0)), pend.length > 0));
    if (semEmp.length) cards.push(card('#/retencoes', 'Retenções sem empenho', semEmp.length, 'abra Retenções para completar', true));
    const faltam = decendiosSemLancamento(lista, ano);
    if (faltam.length) alertas += `<a class="alerta alerta-link" href="#/retencoes">⚠ Decêndio(s) sem retenções do FPM lançadas: ${faltam.slice(-4).map(d => esc(textoDecendio(decendioDe(d).decendio, decendioDe(d).competencia))).join(', ')}${faltam.length > 4 ? ` e mais ${faltam.length - 4}` : ''}. Suba o extrato do FPM, o DAF e a planilha do IPI.</a>`;
  } else if (dados.erroRet) alertas += '<div class="alerta">Não foi possível ler as retenções (confira se as regras do Firebase estão publicadas).</div>';
  const prox = decendiosDoAno(ano).proximo;
  if (prox) cards.push(card('#/retencoes', 'Próximo repasse do FPM', dataBR(prox).slice(0, 5), textoDecendio(decendioDe(prox).decendio, decendioDe(prox).competencia)));
  if (dados.duodecimo) {
    const mesAtual = new Date().getMonth();
    const r = resumoDuodecimo(repassesAtivos(dados.duodecimo), META_MENSAL_PADRAO, ano).meses[mesAtual];
    cards.push(card('#/duodecimo', `Duodécimo de ${MESES_DUODECIMO[mesAtual].toLowerCase()}`, r.situacao === 'Integral' ? '✓' : dinheiro(r.saldo),
      r.situacao === 'Integral' ? 'repassado integralmente' : `falta repassar · pago ${dinheiro(r.pago)}`, r.situacao !== 'Integral' && new Date().getDate() >= 20));
  }
  const atalhos = [['#/retencoes', 'Retenções FPM/ITR/IPI'], ['#/copasa', 'Contas COPASA'], ['#/fiscal', 'Conferência fiscal'], ['#/consignacoes', 'Consignações'],
    ['#/folha-empenhos', 'Folha de pagamentos'], ['#/duodecimo', 'Duodécimo']];
  return `<h2 class="titulo-secao">Central da Contabilidade · ${ano}</h2>
    ${alertas}
    <div class="fila">${cards.join('')}</div>
    <div class="atalhos-painel">${atalhos.map(([h, t]) => `<a class="btn btn-sec btn-peq" href="${h}">${esc(t)}</a>`).join('')}</div>`;
}

/** Administração: usuários aguardando liberação e atalhos. */
export function blocoAdministracao() {
  if (!pode.admin()) return '';
  const pend = (estado.usuarios || []).filter(u => u.pendente && !u.ativo).length;
  return `${pend ? `<a class="alerta alerta-link" href="#/usuarios">👤 ${pend} pessoa(s) aguardando liberação de acesso. Clique para liberar.</a>` : ''}
    <div class="atalhos-painel"><span class="muted">Administração:</span>${[['#/usuarios', 'Usuários'], ['#/auditoria', 'Auditoria'], ['#/importar', 'Backup'], ['#/parametros', 'Parâmetros da lei']]
      .map(([h, t]) => `<a class="btn btn-sec btn-peq" href="${h}">${esc(t)}</a>`).join('')}</div>`;
}
