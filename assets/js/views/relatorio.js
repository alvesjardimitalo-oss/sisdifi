// SISDIFI — Relatório mensal: valores por secretaria e por fonte de recursos
// Controle Interno vê apenas as solicitações já empenhadas (as regras do Firestore só liberam esses valores).
import { estado, pode, ETAPAS, etapaDe, ETAPAS_EMPENHADAS, totalReembolsos, ativas, ehSecretaria, ehRH, secretariaNome } from '../estado.js';
import { moeda } from '../calculo.js';
import { esc, $, dataBR, lerForm, baixarArquivo, csv, hojeISO, normalizar } from '../ui.js';
import { aguardando, cabecalho, anosDisponiveis, MESES, opcoesSecretarias } from './comum.js';
import { rotuloFicha } from './orcamento.js';

const tituloDe = s => { const r = rotuloFicha(s); return r.includes(' — ') ? r.split(' — ').slice(1).join(' — ') : ''; };

const hoje = new Date();
const filtro = { ano: String(hoje.getFullYear()), mes: String(hoje.getMonth() + 1), base: '', secretaria: '', fonte: '', situacao: 'empenhadas' };

/** Seleciona as solicitações do relatório conforme os filtros (usado também na impressão). */
export const SITUACOES_REL = {
  empenhadas: 'Empenhadas, liquidadas e pagas',
  apagar: 'A pagar (empenhadas e liquidadas)',
  pagas: 'Pagas'
};
export const BASES_REL = { empenho: 'Data do empenho', pagamento: 'Data do pagamento', viagem: 'Data da viagem (saída)' };
export const situacaoPagamento = s => etapaDe(s) === 'paga' ? 'Paga' : etapaDe(s) === 'liquidada' ? 'Liquidada — aguardando pagamento' : etapaDe(s) === 'empenhada' ? 'Empenhada — aguardando liquidação' : ETAPAS[etapaDe(s)]?.curto || '—';

export function solicitacoesDoRelatorio(f) {
  // Quem não vê todos os valores (Controle Interno, RH, Secretaria) só enxerga o que já foi empenhado.
  // (não altera o filtro da tela: ele continua valendo se outro perfil entrar no mesmo navegador)
  f = { ...f, situacao: !pode.verValores() && f.situacao === 'todas' ? 'empenhadas' : f.situacao };
  if (ehSecretaria()) f.secretaria = estado.sessao.secretaria_id || '-';
  else if (f.secretaria === '-') f.secretaria = '';
  const sit = f.situacao || 'empenhadas';
  const okSit = s => sit === 'todas' ? (s.calculado || !s.etapa)
    : ETAPAS_EMPENHADAS.includes(etapaDe(s)) && s.valor_total !== undefined &&
      (sit === 'pagas' ? etapaDe(s) === 'paga' : sit === 'apagar' ? etapaDe(s) !== 'paga' : true);
  const dataRef = s => String((f.base === 'empenho' ? s.data_empenho : f.base === 'pagamento' ? s.data_pagamento : s.data_hora_saida) || '');
  return ativas(estado.solicitacoes).filter(s => okSit(s) &&
    (!f.ano || dataRef(s).startsWith(f.ano)) &&
    (!f.mes || dataRef(s).slice(5, 7) === String(f.mes).padStart(2, '0')) &&
    (!f.secretaria || s.secretaria_id === f.secretaria) &&
    (!f.fonte || normalizar(s.fonte_recursos) === normalizar(f.fonte)))
    .sort((a, b) => String(a.secretaria_nome).localeCompare(String(b.secretaria_nome), 'pt-BR') || String(a.numero).localeCompare(String(b.numero)));
}

export function agrupar(sols, chave) {
  const g = {};
  for (const s of sols) {
    const k = chave(s) || '— não informado —';
    g[k] = g[k] || { n: 0, d: 0, r: 0 };
    g[k].n++; g[k].d += Number(s.valor_total || 0); g[k].r += totalReembolsos(s);
  }
  return Object.entries(g).sort((a, b) => (b[1].d + b[1].r) - (a[1].d + a[1].r));
}

function tabelaGrupo(titulo, linhas) {
  const tot = linhas.reduce((a, [, v]) => ({ n: a.n + v.n, d: a.d + v.d, r: a.r + v.r }), { n: 0, d: 0, r: 0 });
  return `<section class="cartao"><h3>${esc(titulo)}</h3><div class="tabela-wrap"><table class="tabela">
    <thead><tr><th>${esc(titulo.replace('Por ', '').replace(/^./, c => c.toUpperCase()))}</th><th class="num">Solicitações</th><th class="num">Diárias</th><th class="num">Reembolsos</th><th class="num">Total</th></tr></thead>
    <tbody>${linhas.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.n}</td><td class="num">${moeda(v.d)}</td><td class="num">${moeda(v.r)}</td><td class="num"><strong>${moeda(v.d + v.r)}</strong></td></tr>`).join('')
      || '<tr><td colspan="5" class="vazio-linha">Nada no período.</td></tr>'}</tbody>
    ${linhas.length ? `<tfoot><tr><td>Total</td><td class="num">${tot.n}</td><td class="num">${moeda(tot.d)}</td><td class="num">${moeda(tot.r)}</td><td class="num">${moeda(tot.d + tot.r)}</td></tr></tfoot>` : ''}
  </table></div></section>`;
}

/** Resumo por servidor com o extrato individual (para entregar ao servidor ou arquivar no RH). */
function tabelaServidores(sols) {
  const g = {};
  for (const s of sols) {
    const k = s.servidor_id || s.servidor?.nome;
    g[k] = g[k] || { id: s.servidor_id, nome: s.servidor?.nome || '—', n: 0, t: 0, pago: 0 };
    const v = Number(s.valor_total || 0) + totalReembolsos(s);
    g[k].n++; g[k].t += v; if (etapaDe(s) === 'paga') g[k].pago += v;
  }
  const linhas = Object.values(g).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const qs = new URLSearchParams({ mes: filtro.mes, ano: filtro.ano, base: filtro.base }).toString();
  return `<section class="cartao"><h3>Por servidor</h3><div class="tabela-wrap"><table class="tabela">
    <thead><tr><th>Servidor</th><th class="num">Solicitações</th><th class="num">Pago</th><th class="num">A pagar</th><th class="num">Total</th><th></th></tr></thead>
    <tbody>${linhas.map(l => `<tr><td>${esc(l.nome)}</td><td class="num">${l.n}</td><td class="num">${moeda(l.pago)}</td><td class="num">${moeda(l.t - l.pago)}</td><td class="num"><strong>${moeda(l.t)}</strong></td>
      <td class="acoes-linha">${l.id ? `<a class="btn btn-sec btn-peq" href="#/imprimir/extrato/${esc(l.id)}?${esc(qs)}" title="Extrato de diárias do servidor">🖨 Extrato</a>` : ''}</td></tr>`).join('')
      || '<tr><td colspan="6" class="vazio-linha">Nada no período.</td></tr>'}</tbody></table></div></section>`;
}

export function telaRelatorio(el) {
  if (aguardando(el, ['solicitacoes', 'secretarias'])) return { viva: true, titulo: 'Relatório mensal' };
  const restrito = !pode.verValores();
  if (!filtro.base) filtro.base = ehRH() ? 'pagamento' : 'empenho';
  const sols = solicitacoesDoRelatorio(filtro);
  const pagas = sols.filter(s => etapaDe(s) === 'paga');
  const tot = l => l.reduce((t, s) => t + Number(s.valor_total || 0) + totalReembolsos(s), 0);
  const fontes = [...new Set(ativas(estado.solicitacoes).map(s => s.fonte_recursos).filter(Boolean))].sort();
  const qs = new URLSearchParams(filtro).toString();

  el.innerHTML = `
    ${cabecalho('Relatório mensal', `<a class="btn" href="#/imprimir/mensal?${esc(qs)}">🖨 Imprimir</a><button class="btn btn-sec" id="exp-rel">⭳ Exportar planilha</button>`,
      ehSecretaria() ? `Diárias da ${esc(estado.sessao.secretaria_nome || secretariaNome(estado.sessao.secretaria_id))} já empenhadas pela Contabilidade: valores, pagamento e servidores.`
        : ehRH() ? 'Acompanhamento mensal do pagamento das diárias: o que foi pago e o que está a pagar, por servidor.'
        : restrito ? 'Somente solicitações aprovadas pelo Controle Interno e já empenhadas pela Contabilidade.' : 'Valores das diárias e reembolsos por secretaria e por fonte de recursos.')}
    <form class="filtros" id="f-rel">
      <label class="campo"><span>Mês</span><select name="mes"><option value="">Todos</option>${MESES.map((m, i) => `<option value="${i + 1}" ${String(i + 1) === filtro.mes ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="campo"><span>Ano</span><select name="ano"><option value="">Todos</option>${anosDisponiveis().map(a => `<option ${String(a) === filtro.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <label class="campo"><span>Mês de referência</span><select name="base">
        ${Object.entries(BASES_REL).map(([k, v]) => `<option value="${k}" ${filtro.base === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${ehSecretaria() ? '' : `<label class="campo"><span>Secretaria</span><select name="secretaria">${opcoesSecretarias(filtro.secretaria, { incluirInativas: true, vazio: 'Todas' })}</select></label>`}
      <label class="campo"><span>Fonte de recursos</span><select name="fonte"><option value="">Todas</option>${fontes.map(f => `<option ${f === filtro.fonte ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
      <label class="campo"><span>Situação</span><select name="situacao">
        ${Object.entries(SITUACOES_REL).map(([k, v]) => `<option value="${k}" ${filtro.situacao === k ? 'selected' : ''}>${v}</option>`).join('')}
        ${restrito ? '' : `<option value="todas" ${filtro.situacao === 'todas' ? 'selected' : ''}>Todas já calculadas (inclui histórico)</option>`}</select></label>
    </form>
    <div class="kpis">
      <div class="kpi"><span>Solicitações</span><strong>${sols.length}</strong></div>
      <div class="kpi"><span>Diárias</span><strong>${moeda(sols.reduce((t, s) => t + Number(s.valor_total || 0), 0))}</strong></div>
      <div class="kpi"><span>Reembolsos</span><strong>${moeda(sols.reduce((t, s) => t + totalReembolsos(s), 0))}</strong></div>
      <div class="kpi"><span>Total</span><strong>${moeda(tot(sols))}</strong></div>
      <div class="kpi"><span>Pago</span><strong>${moeda(tot(pagas))}</strong><small>${pagas.length} solicitação(ões)</small></div>
      <div class="kpi ${sols.length > pagas.length ? 'kpi-alerta' : ''}"><span>A pagar</span><strong>${moeda(tot(sols) - tot(pagas))}</strong><small>${sols.length - pagas.length} solicitação(ões)</small></div>
    </div>
    ${tabelaGrupo('Por situação do pagamento', agrupar(sols, situacaoPagamento))}
    ${tabelaServidores(sols)}
    ${ehSecretaria() ? '' : tabelaGrupo('Por secretaria', agrupar(sols, s => s.secretaria_nome))}
    ${tabelaGrupo('Por fonte de recursos', agrupar(sols, s => s.fonte_recursos))}
    ${tabelaGrupo('Por conta de pagamento', agrupar(sols, s => s.conta_pagamento))}
    ${tabelaGrupo('Por ficha (ação / atividade)', agrupar(sols, s => rotuloFicha(s)))}
    <section class="cartao"><h3>Solicitações</h3><div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Nº</th><th>Servidor</th><th>Secretaria</th><th>Destino</th><th>Saída</th><th>Fonte</th><th>Ficha</th><th>Empenho</th><th>Pagamento</th><th class="num">Valor</th><th>Etapa</th></tr></thead>
      <tbody>${sols.map(s => `<tr${pode.verValores() ? ` class="clicavel" data-id="${esc(s.id)}"` : ''}><td><strong>${esc(s.numero)}</strong></td><td>${esc(s.servidor?.nome)}</td><td>${esc(s.secretaria_nome)}</td>
        <td>${esc(s.destino_cidade)}/${esc(s.destino_uf)}</td><td>${esc(dataBR(s.data_hora_saida).slice(0, 10))}</td><td>${esc(s.fonte_recursos || '—')}</td>
        <td>${esc(rotuloFicha(s) || '—')}</td><td>${esc(s.numero_empenho || '—')}${s.data_empenho ? `<small class="muted bloco">${esc(dataBR(s.data_empenho))}</small>` : ''}</td>
        <td>${s.data_pagamento ? esc(dataBR(s.data_pagamento)) : '<span class="muted">a pagar</span>'}</td>
        <td class="num">${moeda(Number(s.valor_total || 0) + totalReembolsos(s))}</td><td>${esc(ETAPAS[etapaDe(s)].curto)}</td></tr>`).join('') || '<tr><td colspan="11" class="vazio-linha">Nenhuma solicitação no período.</td></tr>'}</tbody>
    </table></div></section>`;

  $('#f-rel', el).onchange = e => { Object.assign(filtro, lerForm(e.currentTarget)); telaRelatorio(el); };
  el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { location.hash = '#/solicitacoes/' + tr.dataset.id; });
  $('#exp-rel', el).onclick = () => baixarArquivo(`relatorio-diarias-${hojeISO()}.csv`, csv([
    ['Número', 'Servidor', 'Secretaria', 'Destino', 'Saída', 'Conta de pagamento', 'Fonte de recursos', 'Ficha', 'Título da ficha', 'Empenho', 'Data empenho', 'Data pagamento', 'Diárias', 'Reembolsos', 'Total', 'Etapa'],
    ...sols.map(s => [s.numero, s.servidor?.nome, s.secretaria_nome, `${s.destino_cidade}/${s.destino_uf}`, dataBR(s.data_hora_saida), s.conta_pagamento, s.fonte_recursos,
      s.ficha, tituloDe(s), s.numero_empenho, dataBR(s.data_empenho), dataBR(s.data_pagamento), Number(s.valor_total || 0).toFixed(2).replace('.', ','), totalReembolsos(s).toFixed(2).replace('.', ','),
      (Number(s.valor_total || 0) + totalReembolsos(s)).toFixed(2).replace('.', ','), ETAPAS[etapaDe(s)].curto])]));
  return { viva: true, titulo: 'Relatório mensal' };
}
