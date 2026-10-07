// SISDIFI — Relatório do Controle Interno: análises, reprovações por secretaria, motivos e prestação de contas
import { estado, secretariaNome, etapaDe } from '../estado.js';
import { esc, $, dataBR, lerForm, numeroBR } from '../ui.js';
import { aguardando, cabecalho, anosDisponiveis, MESES } from './comum.js';
import { pendentePrestacao } from './solicitacoes.js';

const filtro = { ano: String(new Date().getFullYear()), mes: '', secretaria: '' };
window.addEventListener('sisdifi:exercicio', e => { filtro.ano = String(e.detail); filtro.mes = ''; });

const quando = v => v?.toDate ? v.toDate() : v ? new Date(v) : null;
/** Momento do envio ao Controle Interno: criação da solicitação (ou a data informada, nos registros sem horário). */
const envio = s => quando(s.criado_em) || (s.data_solicitacao ? new Date(s.data_solicitacao + 'T12:00') : null);
/** Primeira decisão do Controle Interno (aprovação ou reprovação). */
const primeiraDecisao = s => (s.historico || []).find(h => ['aprovada', 'reprovada'].includes(h.etapa));
const foiReprovada = s => (s.historico || []).some(h => h.etapa === 'reprovada') || s.analise?.resultado === 'reprovada';
const foiAprovada = s => s.analise?.resultado === 'aprovada' || !['analise', 'reprovada'].includes(etapaDe(s));

function duracao(horas) {
  if (horas == null || !isFinite(horas)) return '—';
  if (horas < 24) return `${numeroBR(Math.max(0, horas), 1)} h`;
  return `${numeroBR(horas / 24, 1)} dia(s)`;
}
const media = l => l.length ? l.reduce((a, b) => a + b, 0) / l.length : null;
const horasAteDecisao = s => { const a = envio(s), d = primeiraDecisao(s); return a && d ? (new Date(d.em) - a) / 36e5 : null; };

function resumo(lista) {
  const decididas = lista.filter(s => primeiraDecisao(s));
  const tempos = decididas.map(horasAteDecisao).filter(h => h != null && h >= 0);
  const reprov = lista.filter(foiReprovada).length;
  return {
    recebidas: lista.length,
    aguardando: lista.filter(s => etapaDe(s) === 'analise').length,
    aprovadas: lista.filter(foiAprovada).length,
    reprovadas: reprov,
    reprovacoes: lista.reduce((t, s) => t + (s.historico || []).filter(h => h.etapa === 'reprovada').length, 0),
    taxa: decididas.length ? reprov / decididas.length * 100 : 0,
    tempo: media(tempos),
    prestacao: lista.filter(pendentePrestacao).length
  };
}

export function telaRelatorioControle(el) {
  if (aguardando(el, ['solicitacoes', 'secretarias'])) return { viva: true, titulo: 'Relatório do Controle Interno' };
  const base = estado.solicitacoes.filter(s => s.status !== 'cancelada' && !s.interna && s.etapa && etapaDe(s) !== 'legado');
  const lista = base.filter(s => (!filtro.ano || String(s.data_solicitacao).startsWith(filtro.ano))
    && (!filtro.mes || String(s.data_solicitacao).slice(5, 7) === filtro.mes.padStart(2, '0'))
    && (!filtro.secretaria || s.secretaria_id === filtro.secretaria));
  const r = resumo(lista);

  const porSec = {};
  for (const s of lista) (porSec[s.secretaria_id || '-'] = porSec[s.secretaria_id || '-'] || []).push(s);
  const linhasSec = Object.entries(porSec).map(([id, l]) => ({ nome: secretariaNome(id) || l[0].secretaria_nome || '—', ...resumo(l) }))
    .sort((a, b) => b.recebidas - a.recebidas);

  // motivos: cada reprovação conta (com os motivos prontos ou o texto livre de reprovações antigas)
  const motivos = {};
  for (const s of lista) for (const h of (s.historico || []).filter(x => x.etapa === 'reprovada')) {
    const ms = (h.motivos || []).length ? h.motivos : ['Outro (texto livre)'];
    ms.forEach(m => { motivos[m] = (motivos[m] || 0) + 1; });
  }
  const topMotivos = Object.entries(motivos).sort((a, b) => b[1] - a[1]);
  const maxMot = Math.max(1, ...topMotivos.map(x => x[1]));
  const pendPrest = lista.filter(pendentePrestacao).sort((a, b) => String(a.data_hora_retorno).localeCompare(String(b.data_hora_retorno)));
  const aguardando_ = lista.filter(s => etapaDe(s) === 'analise').sort((a, b) => (envio(a) || 0) - (envio(b) || 0));
  const rotulo = (filtro.mes ? `${MESES[Number(filtro.mes) - 1]} de ${filtro.ano || 'todos os anos'}` : filtro.ano ? `Ano de ${filtro.ano}` : 'Todo o período') + (filtro.secretaria ? ` · ${secretariaNome(filtro.secretaria)}` : '');
  const pct = n => `${numeroBR(n, 0)}%`;

  el.innerHTML = `
    ${cabecalho('Relatório do Controle Interno', '<button class="btn btn-sec" id="imprimir-ci">🖨 Imprimir</button>',
      'Solicitações enviadas pelas secretarias no período (pela data da solicitação). Lançamentos diretos da Contabilidade e o histórico do sistema antigo não entram.')}
    <form class="filtros" id="filtro-ci">
      <label class="campo"><span>Ano</span><select name="ano"><option value="">Todos</option>${anosDisponiveis().map(a => `<option ${String(a) === filtro.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <label class="campo"><span>Mês</span><select name="mes"><option value="">Todos</option>${MESES.map((m, i) => `<option value="${i + 1}" ${String(i + 1) === filtro.mes ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="campo"><span>Secretaria</span><select name="secretaria"><option value="">Todas</option>${estado.secretarias.map(s => `<option value="${esc(s.id)}" ${s.id === filtro.secretaria ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></label>
      <div class="filtro-rotulo">${esc(rotulo)}</div>
    </form>
    <div class="kpis">
      <div class="kpi"><span>Recebidas</span><strong>${r.recebidas}</strong></div>
      <div class="kpi ${r.aguardando ? 'kpi-alerta' : ''}"><span>Aguardando análise</span><strong>${r.aguardando}</strong></div>
      <div class="kpi"><span>Aprovadas</span><strong>${r.aprovadas}</strong></div>
      <div class="kpi"><span>Reprovadas ao menos uma vez</span><strong>${r.reprovadas}</strong><small>${pct(r.taxa)} das analisadas · ${r.reprovacoes} reprovação(ões)</small></div>
      <div class="kpi"><span>Tempo médio até a análise</span><strong>${duracao(r.tempo)}</strong></div>
      <div class="kpi ${r.prestacao ? 'kpi-alerta' : ''}"><span>Sem prestação de contas</span><strong>${r.prestacao}</strong><small>viagens já realizadas</small></div>
    </div>

    <section class="cartao">
      <h3>Por secretaria</h3>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Secretaria</th><th class="num">Recebidas</th><th class="num">Aprovadas</th><th class="num">Reprovadas</th><th class="num">% reprovação</th><th class="num">Tempo médio</th><th class="num">Sem prestação de contas</th></tr></thead>
        <tbody>${linhasSec.map(l => `<tr><td><strong>${esc(l.nome)}</strong></td><td class="num">${l.recebidas}</td><td class="num">${l.aprovadas}</td><td class="num">${l.reprovadas}</td>
          <td class="num">${pct(l.taxa)}</td><td class="num">${duracao(l.tempo)}</td><td class="num">${l.prestacao || '—'}</td></tr>`).join('') || '<tr><td colspan="7" class="vazio-linha">Nenhuma solicitação no período.</td></tr>'}</tbody>
        ${linhasSec.length > 1 ? `<tfoot><tr><td>Total</td><td class="num">${r.recebidas}</td><td class="num">${r.aprovadas}</td><td class="num">${r.reprovadas}</td><td class="num">${pct(r.taxa)}</td><td class="num">${duracao(r.tempo)}</td><td class="num">${r.prestacao || '—'}</td></tr></tfoot>` : ''}
      </table></div>
    </section>

    <div class="grade-painel">
      <section class="cartao">
        <h3>Motivos de reprovação mais comuns</h3>
        <div class="lista-barras">${topMotivos.map(([m, n]) => `<div class="linha-barra"><div class="linha-barra-txt"><span title="${esc(m)}">${esc(m)}</span><span>${n}×</span></div>
          <div class="linha-barra-trilho"><div style="width:${Math.max(3, n / maxMot * 100)}%"></div></div></div>`).join('') || '<p class="muted">Nenhuma reprovação no período.</p>'}</div>
      </section>
      <section class="cartao">
        <h3>Aguardando análise</h3>
        <ul class="lista-rank">${aguardando_.slice(0, 8).map(s => `<li><span class="rank-txt"><a href="#/solicitacoes/${esc(s.id)}"><strong>${esc(s.numero)}</strong> · ${esc(s.servidor?.nome)}</a>
          <small>${esc(s.secretaria_nome || secretariaNome(s.secretaria_id))} · viagem em ${esc(dataBR(s.data_hora_saida).slice(0, 10))}</small></span>
          <span class="rank-val">${duracao(envio(s) ? (Date.now() - envio(s)) / 36e5 : null)}<small>na fila</small></span></li>`).join('') || '<li class="vazio-item">Nada aguardando análise.</li>'}</ul>
      </section>
    </div>

    <section class="cartao">
      <h3>Viagens realizadas sem prestação de contas (${pendPrest.length})</h3>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Nº</th><th>Servidor</th><th>Secretaria</th><th>Destino</th><th>Retorno</th><th class="num">Dias desde o retorno</th></tr></thead>
        <tbody>${pendPrest.map(s => `<tr class="clicavel" data-id="${esc(s.id)}"><td><strong>${esc(s.numero)}</strong></td><td>${esc(s.servidor?.nome)}</td><td>${esc(s.secretaria_nome || secretariaNome(s.secretaria_id))}</td>
          <td>${esc(s.destino_cidade)}/${esc(s.destino_uf)}</td><td>${esc(dataBR(s.data_hora_retorno).slice(0, 10))}</td><td class="num">${Math.floor((Date.now() - new Date(s.data_hora_retorno)) / 864e5)}</td></tr>`).join('') || '<tr><td colspan="6" class="vazio-linha">Todas as viagens realizadas têm prestação de contas.</td></tr>'}</tbody>
      </table></div>
    </section>`;
  $('#filtro-ci', el).onchange = e => { Object.assign(filtro, lerForm(e.currentTarget)); telaRelatorioControle(el); };
  $('#imprimir-ci', el).onclick = () => window.print();
  el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { location.hash = '#/solicitacoes/' + tr.dataset.id; });
  return { viva: true, titulo: 'Relatório do Controle Interno' };
}
