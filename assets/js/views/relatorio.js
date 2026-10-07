// SISDIFI — Relatório mensal: valores por secretaria e por fonte de recursos
// Controle Interno vê apenas as solicitações já empenhadas (as regras do Firestore só liberam esses valores).
import { estado, pode, ETAPAS, etapaDe, ETAPAS_EMPENHADAS, totalReembolsos, ativas } from '../estado.js';
import { moeda } from '../calculo.js';
import { esc, $, dataBR, lerForm, baixarArquivo, csv, hojeISO, normalizar } from '../ui.js';
import { aguardando, cabecalho, anosDisponiveis, MESES, opcoesSecretarias } from './comum.js';

const hoje = new Date();
const filtro = { ano: String(hoje.getFullYear()), mes: String(hoje.getMonth() + 1), base: 'empenho', secretaria: '', fonte: '', situacao: 'empenhadas' };

/** Seleciona as solicitações do relatório conforme os filtros (usado também na impressão). */
export function solicitacoesDoRelatorio(f) {
  const soEmpenhadas = !pode.verValores() || f.situacao === 'empenhadas';
  const dataRef = s => f.base === 'empenho' ? String(s.data_empenho || '') : String(s.data_hora_saida || '');
  return ativas(estado.solicitacoes).filter(s =>
    (soEmpenhadas ? ETAPAS_EMPENHADAS.includes(etapaDe(s)) && s.valor_total !== undefined : (s.calculado || !s.etapa)) &&
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

export function telaRelatorio(el) {
  if (aguardando(el, ['solicitacoes', 'secretarias'])) return { viva: true, titulo: 'Relatório mensal' };
  const ci = !pode.verValores();
  if (ci) filtro.situacao = 'empenhadas';
  const sols = solicitacoesDoRelatorio(filtro);
  const fontes = [...new Set(ativas(estado.solicitacoes).map(s => s.fonte_recursos).filter(Boolean))].sort();
  const qs = new URLSearchParams(filtro).toString();

  el.innerHTML = `
    ${cabecalho('Relatório mensal', `<a class="btn" href="#/imprimir/mensal?${esc(qs)}">🖨 Imprimir</a><button class="btn btn-sec" id="exp-rel">⭳ Exportar planilha</button>`,
      ci ? 'Somente solicitações aprovadas pelo Controle Interno e já empenhadas pela Contabilidade.' : 'Valores das diárias e reembolsos por secretaria e por fonte de recursos.')}
    <form class="filtros" id="f-rel">
      <label class="campo"><span>Mês</span><select name="mes"><option value="">Todos</option>${MESES.map((m, i) => `<option value="${i + 1}" ${String(i + 1) === filtro.mes ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="campo"><span>Ano</span><select name="ano"><option value="">Todos</option>${anosDisponiveis().map(a => `<option ${String(a) === filtro.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <label class="campo"><span>Mês de referência</span><select name="base">
        <option value="empenho" ${filtro.base === 'empenho' ? 'selected' : ''}>Data do empenho</option>
        <option value="viagem" ${filtro.base === 'viagem' ? 'selected' : ''}>Data da viagem (saída)</option></select></label>
      <label class="campo"><span>Secretaria</span><select name="secretaria">${opcoesSecretarias(filtro.secretaria, { incluirInativas: true, vazio: 'Todas' })}</select></label>
      <label class="campo"><span>Fonte de recursos</span><select name="fonte"><option value="">Todas</option>${fontes.map(f => `<option ${f === filtro.fonte ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
      ${ci ? '' : `<label class="campo"><span>Situação</span><select name="situacao">
        <option value="empenhadas" ${filtro.situacao === 'empenhadas' ? 'selected' : ''}>Empenhadas, liquidadas e pagas</option>
        <option value="todas" ${filtro.situacao === 'todas' ? 'selected' : ''}>Todas já calculadas (inclui histórico)</option></select></label>`}
    </form>
    <div class="kpis">
      <div class="kpi"><span>Solicitações</span><strong>${sols.length}</strong></div>
      <div class="kpi"><span>Diárias</span><strong>${moeda(sols.reduce((t, s) => t + Number(s.valor_total || 0), 0))}</strong></div>
      <div class="kpi"><span>Reembolsos</span><strong>${moeda(sols.reduce((t, s) => t + totalReembolsos(s), 0))}</strong></div>
      <div class="kpi"><span>Total</span><strong>${moeda(sols.reduce((t, s) => t + Number(s.valor_total || 0) + totalReembolsos(s), 0))}</strong></div>
    </div>
    ${tabelaGrupo('Por secretaria', agrupar(sols, s => s.secretaria_nome))}
    ${tabelaGrupo('Por fonte de recursos', agrupar(sols, s => s.fonte_recursos))}
    ${tabelaGrupo('Por conta de pagamento', agrupar(sols, s => s.conta_pagamento))}
    <section class="cartao"><h3>Solicitações</h3><div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Nº</th><th>Servidor</th><th>Secretaria</th><th>Destino</th><th>Saída</th><th>Fonte</th><th>Ficha</th><th>Empenho</th><th class="num">Valor</th><th>Etapa</th></tr></thead>
      <tbody>${sols.map(s => `<tr${pode.verValores() ? ` class="clicavel" data-id="${esc(s.id)}"` : ''}><td><strong>${esc(s.numero)}</strong></td><td>${esc(s.servidor?.nome)}</td><td>${esc(s.secretaria_nome)}</td>
        <td>${esc(s.destino_cidade)}/${esc(s.destino_uf)}</td><td>${esc(dataBR(s.data_hora_saida).slice(0, 10))}</td><td>${esc(s.fonte_recursos || '—')}</td>
        <td>${esc(s.ficha || '—')}</td><td>${esc(s.numero_empenho || '—')}${s.data_empenho ? `<small class="muted bloco">${esc(dataBR(s.data_empenho))}</small>` : ''}</td>
        <td class="num">${moeda(Number(s.valor_total || 0) + totalReembolsos(s))}</td><td>${esc(ETAPAS[etapaDe(s)].curto)}</td></tr>`).join('') || '<tr><td colspan="10" class="vazio-linha">Nenhuma solicitação no período.</td></tr>'}</tbody>
    </table></div></section>`;

  $('#f-rel', el).onchange = e => { Object.assign(filtro, lerForm(e.currentTarget)); telaRelatorio(el); };
  el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { location.hash = '#/solicitacoes/' + tr.dataset.id; });
  $('#exp-rel', el).onclick = () => baixarArquivo(`relatorio-diarias-${hojeISO()}.csv`, csv([
    ['Número', 'Servidor', 'Secretaria', 'Destino', 'Saída', 'Conta de pagamento', 'Fonte de recursos', 'Ficha', 'Empenho', 'Data empenho', 'Diárias', 'Reembolsos', 'Total', 'Etapa'],
    ...sols.map(s => [s.numero, s.servidor?.nome, s.secretaria_nome, `${s.destino_cidade}/${s.destino_uf}`, dataBR(s.data_hora_saida), s.conta_pagamento, s.fonte_recursos,
      s.ficha, s.numero_empenho, dataBR(s.data_empenho), Number(s.valor_total || 0).toFixed(2).replace('.', ','), totalReembolsos(s).toFixed(2).replace('.', ','),
      (Number(s.valor_total || 0) + totalReembolsos(s)).toFixed(2).replace('.', ','), ETAPAS[etapaDe(s)].curto])]));
  return { viva: true, titulo: 'Relatório mensal' };
}
