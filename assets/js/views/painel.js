// SISDIFI — Painel (indicadores)
import { estado, pode, totalReembolsos, ativas, secretariaNome, ETAPAS, etapaDe, ehSecretaria, ehRH, definirHistorico } from '../estado.js';
import { telaRelatorio } from './relatorio.js';
import { avisoExercicio } from './exercicio.js';
import { seloEtapa } from './comum.js';
import { moeda } from '../calculo.js';
import { esc, $, $$, dataBR, lerForm } from '../ui.js';
import { aguardando, cabecalho, anosDisponiveis, MESES } from './comum.js';
import { analisarPendencias } from './conferencia.js';

const filtro = { ano: String(new Date().getFullYear()), mes: '' };
window.addEventListener('sisdifi:exercicio', e => { filtro.ano = String(e.detail); filtro.mes = ''; });

export function telaPainel(el) {
  if (aguardando(el, ['solicitacoes', 'servidores', 'secretarias'])) return { viva: true, titulo: 'Painel' };
  if (ehRH()) { const r = telaRelatorio(el); return { ...r, titulo: 'Painel' }; }
  if (!pode.verValores()) return painelSemValores(el);
  // Por padrão o painel mostra só o que foi feito no sistema novo; o histórico importado entra se marcado.
  const base = ativas(estado.solicitacoes);
  const doAno = base.filter(s => !filtro.ano || String(s.data_hora_saida).startsWith(filtro.ano));
  const periodo = doAno.filter(s => !filtro.mes || String(s.data_hora_saida).slice(5, 7) === filtro.mes.padStart(2, '0'));
  const tDiarias = periodo.reduce((t, s) => t + Number(s.valor_total || 0), 0);
  const tReemb = periodo.reduce((t, s) => t + totalReembolsos(s), 0);
  const semEmpenho = periodo.filter(s => ['aprovada', 'calculada', 'autorizada'].includes(etapaDe(s))).length;
  const pagas = periodo.filter(s => etapaDe(s) === 'paga');

  // Por mês (do ano selecionado)
  const porMes = MESES.map((m, i) => {
    const l = doAno.filter(s => Number(String(s.data_hora_saida).slice(5, 7)) === i + 1);
    return { m: m.slice(0, 3), v: l.reduce((t, s) => t + Number(s.valor_total || 0) + totalReembolsos(s), 0), n: l.length };
  });
  const maxMes = Math.max(1, ...porMes.map(x => x.v));

  // Por secretaria
  const mapaSec = {};
  for (const s of periodo) {
    const k = s.secretaria_id || '-';
    mapaSec[k] = mapaSec[k] || { nome: s.secretaria_nome || secretariaNome(k) || '—', n: 0, v: 0 };
    mapaSec[k].n++; mapaSec[k].v += Number(s.valor_total || 0) + totalReembolsos(s);
  }
  const porSec = Object.values(mapaSec).sort((a, b) => b.v - a.v);
  const maxSec = Math.max(1, ...porSec.map(x => x.v));

  // Destinos e servidores mais frequentes
  const contar = (f) => Object.entries(periodo.reduce((a, s) => { const k = f(s); a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const destinos = contar(s => `${s.destino_cidade}/${s.destino_uf}`);
  const servidoresTop = Object.values(periodo.reduce((a, s) => {
    a[s.servidor_id] = a[s.servidor_id] || { nome: s.servidor?.nome, id: s.servidor_id, v: 0, n: 0 };
    a[s.servidor_id].v += Number(s.valor_total || 0) + totalReembolsos(s); a[s.servidor_id].n++; return a;
  }, {})).sort((a, b) => b.v - a.v).slice(0, 5);

  const ultimas = estado.solicitacoes.slice(0, 6);
  const rotulo = filtro.mes ? `${MESES[Number(filtro.mes) - 1]} de ${filtro.ano || 'todos os anos'}` : (filtro.ano ? `Ano de ${filtro.ano}` : 'Todo o período');

  el.innerHTML = `
    ${cabecalho('Painel', pode.solicitar() ? '<a class="btn" href="#/solicitacoes/nova">＋ Nova solicitação</a>' : '', `Olá, ${esc(estado.sessao.nome.split(' ')[0])}. Indicadores pela data de saída da viagem (solicitações canceladas não entram).`)}
    ${(() => { const p = analisarPendencias(); const n = p.grupos.length + p.distancias.length + p.cpfs.length;
      return n ? `<a class="alerta alerta-link" href="#/conferencia">⚠ A conferência automática encontrou ${n} ponto(s) para revisar (${p.grupos.length} viagem(ns) sobreposta(s), ${p.distancias.length} destino(s) com km divergente, ${p.cpfs.length} CPF(s) inválido(s)). Clique para ver.</a>` : ''; })()}
    ${avisoExercicio()}
    ${filaDeTrabalho()}
    <form class="filtros" id="filtro-painel">
      <label class="campo"><span>Ano</span><select name="ano"><option value="">Todos</option>${anosDisponiveis().map(a => `<option ${String(a) === filtro.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <label class="campo"><span>Mês</span><select name="mes"><option value="">Todos</option>${MESES.map((m, i) => `<option value="${i + 1}" ${String(i + 1) === filtro.mes ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      ${ehSecretaria() ? '' : `<label class="check"><input type="checkbox" name="historico" value="1" ${estado.verHistorico ? 'checked' : ''}> Incluir histórico do sistema antigo</label>`}
      <div class="filtro-rotulo">${esc(rotulo)}</div>
      <a class="btn btn-sec btn-peq filtros-fim" href="#/relatorio">Relatório mensal</a>
    </form>
    <div class="kpis">
      <div class="kpi"><span>Viagens</span><strong>${periodo.length}</strong></div>
      <div class="kpi"><span>Diárias</span><strong>${moeda(tDiarias)}</strong></div>
      <div class="kpi"><span>Reembolsos</span><strong>${moeda(tReemb)}</strong></div>
      <div class="kpi"><span>Total pago/a pagar</span><strong>${moeda(tDiarias + tReemb)}</strong></div>
      <div class="kpi"><span>Pagas</span><strong>${pagas.length}</strong><small>${moeda(pagas.reduce((t, s) => t + Number(s.valor_total || 0) + totalReembolsos(s), 0))}</small></div>
      <div class="kpi ${semEmpenho ? 'kpi-alerta' : ''}"><span>Aguardando empenho</span><strong>${semEmpenho}</strong><a href="#/solicitacoes?etapa=autorizada" class="link-peq">ver solicitações</a></div>
    </div>
    <div class="grade-painel">
      <section class="cartao">
        <h3>Gastos por mês ${filtro.ano ? '— ' + esc(filtro.ano) : ''}</h3>
        <div class="barras-mes" role="img" aria-label="Gastos por mês">
          ${porMes.map(x => `<div class="barra-col" title="${esc(x.m)}: ${moeda(x.v)} (${x.n} viagens)">
            <div class="barra-valor">${x.v ? moeda(x.v).replace('R$ ', '') : ''}</div>
            <div class="barra" style="height:${Math.round((x.v / maxMes) * 100)}%"></div><div class="barra-rot">${esc(x.m)}</div></div>`).join('')}
        </div>
      </section>
      <section class="cartao">
        <h3>Por secretaria</h3>
        <div class="lista-barras">
        ${porSec.map(x => `<div class="linha-barra"><div class="linha-barra-txt"><span>${esc(x.nome)}</span><span>${moeda(x.v)} <small>· ${x.n}</small></span></div>
          <div class="linha-barra-trilho"><div style="width:${Math.max(2, Math.round((x.v / maxSec) * 100))}%"></div></div></div>`).join('') || '<p class="muted">Sem viagens no período.</p>'}
        </div>
      </section>
    </div>
    ${blocoDotacao(filtro.ano)}
    <div class="grade-painel-3">
      <section class="cartao">
        <h3>Servidores com mais gastos</h3>
        <ol class="lista-rank numerada">${servidoresTop.map(x => `<li><span class="rank-txt"><a href="#/servidores/${esc(x.id)}">${esc(x.nome)}</a><small>${x.n} ${x.n === 1 ? 'viagem' : 'viagens'}</small></span><span class="rank-val">${moeda(x.v)}</span></li>`).join('') || '<li class="vazio-item">Sem viagens no período.</li>'}</ol>
      </section>
      <section class="cartao">
        <h3>Destinos mais frequentes</h3>
        <ol class="lista-rank numerada">${destinos.map(([d, n]) => `<li><span class="rank-txt"><span>${esc(d)}</span></span><span class="rank-val">${n} <span class="muted" style="font-weight:400">${n === 1 ? 'viagem' : 'viagens'}</span></span></li>`).join('') || '<li class="vazio-item">Sem viagens no período.</li>'}</ol>
      </section>
      <section class="cartao">
        <div class="cab-secao"><h3>Últimas solicitações</h3><a class="link-peq" href="#/solicitacoes">ver todas</a></div>
        <ul class="lista-rank">${ultimas.map(s => `<li><span class="rank-txt"><a href="#/solicitacoes/${esc(s.id)}"><strong>${esc(s.numero)}</strong> · ${esc(s.servidor?.nome)}</a>
          <small>${esc(s.destino_cidade)}/${esc(s.destino_uf)} · ${esc(dataBR(s.data_hora_saida).slice(0, 10))}${s.status === 'cancelada' ? ' · cancelada' : ''}</small></span><span class="rank-val">${moeda(s.valor_total)}</span></li>`).join('') || '<li class="vazio-item">Nenhuma solicitação ainda.</li>'}</ul>
      </section>
    </div>`;
  $('[data-abrir-ano]', el)?.addEventListener('click', e => { const a = Number(e.currentTarget.dataset.abrirAno); if (a !== estado.exercicio) { estado.exercicio = a; try { localStorage.setItem('sisdifi.exercicio', String(a)); } catch { /* */ } } });
  $('#filtro-painel', el).onchange = e => { const d = lerForm(e.currentTarget); Object.assign(filtro, { ano: d.ano, mes: d.mes }); if (!!d.historico !== estado.verHistorico) definirHistorico(!!d.historico); telaPainel(el); };
  return { viva: true, titulo: 'Painel' };
}

/** Pendências da tramitação conforme o perfil de quem está logado. */
function filaDeTrabalho() {
  const sols = ativas(estado.solicitacoes);
  const n = e => sols.filter(s => etapaDe(s) === e).length;
  const itens = [];
  if (pode.analisar()) itens.push(['analise', 'Para analisar (Controle Interno)']);
  if (pode.contabil()) itens.push(['aprovada', 'Calcular e preencher ficha'], ['calculada', 'Aguardando assinatura do Prefeito'], ['autorizada', 'Empenhar'], ['empenhada', 'Liquidar'], ['liquidada', 'Aguardando pagamento']);
  if (pode.solicitar()) itens.push(['reprovada', 'Reprovadas — corrigir']);
  const vistos = new Set();
  const cards = itens.filter(([e]) => !vistos.has(e) && vistos.add(e)).map(([e, t]) => {
    const q = n(e);
    return `<a href="#/solicitacoes?etapa=${e}" title="${esc(ETAPAS[e].nome)}"><div class="kpi ${q ? '' : 'zero'} ${q && e === 'reprovada' ? 'kpi-alerta' : ''}"><span>${esc(t)}</span><strong>${q}</strong></div></a>`;
  });
  return cards.length ? `<h2 class="titulo-secao">Minha fila de trabalho</h2><div class="fila">${cards.join('')}</div>` : '';
}

/** Gasto x dotação prevista por secretaria (ano selecionado). */
function blocoDotacao(ano) {
  const a = ano || String(new Date().getFullYear());
  const linhas = estado.secretarias.filter(s => s.dotacao?.[a]).map(s => {
    const gasto = ativas(estado.solicitacoes).filter(x => x.secretaria_id === s.id && String(x.data_hora_saida).startsWith(a))
      .reduce((t, x) => t + Number(x.valor_total || 0) + totalReembolsos(x), 0);
    const prev = Number(s.dotacao[a]);
    return { nome: s.nome, gasto, prev, pct: prev ? gasto / prev * 100 : 0 };
  }).sort((x, y) => y.pct - x.pct);
  if (!linhas.length) return '';
  return `<section class="cartao"><h3>Dotação para diárias — ${esc(a)}</h3>
    ${linhas.map(l => `<div class="linha-barra"><div class="linha-barra-txt"><span>${esc(l.nome)}</span><span>${moeda(l.gasto)} de ${moeda(l.prev)} · ${Math.round(l.pct)}%</span></div>
      <div class="linha-barra-trilho"><div class="${l.pct > 100 ? 'estouro' : ''}" style="width:${Math.min(100, Math.max(2, l.pct))}%"></div></div></div>`).join('')}
  </section>`;
}

/** Painel de quem não vê valores (Secretaria e Controle Interno): acompanha a tramitação. */
function painelSemValores(el) {
  const sec = ehSecretaria();
  const sols = estado.solicitacoes.filter(s => s.status !== 'cancelada');
  const conta = (...es) => sols.filter(s => es.includes(etapaDe(s))).length;
  const cards = sec ? [
    ['reprovada', 'Reprovadas — corrigir e reenviar', conta('reprovada')],
    ['analise', 'Em análise no Controle Interno', conta('analise')],
    ['aprovada', 'Aprovadas — na Contabilidade', conta('aprovada', 'calculada', 'autorizada', 'empenhada', 'liquidada')],
    ['paga', 'Pagas', conta('paga')]
  ] : [
    ['analise', 'Para analisar', conta('analise')],
    ['reprovada', 'Reprovadas — aguardando correção', conta('reprovada')],
    ['aprovada', 'Aprovadas — na Contabilidade', conta('aprovada')],
    ['calculada', 'Aguardando assinatura do Prefeito', conta('calculada')]
  ];
  const recentes = (sec ? estado.solicitacoes : estado.solicitacoes.filter(s => s.etapa)).slice(0, 15);
  el.innerHTML = `
    ${cabecalho('Painel', pode.solicitar() ? '<a class="btn" href="#/solicitacoes/nova">＋ Nova solicitação</a>' : '',
      `Olá, ${esc(estado.sessao.nome.split(' ')[0])}. ${sec ? 'Solicitações da ' + esc(estado.sessao.secretaria_nome || secretariaNome(estado.sessao.secretaria_id)) + '.' : 'Solicitações para conferência do Controle Interno.'}`)}
    ${sec && !estado.sessao.secretaria_id ? '<div class="alerta">Seu usuário ainda não está vinculado a uma secretaria. Peça ao administrador para ajustar em Usuários.</div>' : ''}
    <div class="fila">${cards.map(([e, t, n]) => `<a href="#/solicitacoes?etapa=${e}"><div class="kpi ${n ? '' : 'zero'} ${(e === 'reprovada' && sec || e === 'analise' && !sec) && n ? 'kpi-alerta' : ''}"><span>${esc(t)}</span><strong>${n}</strong></div></a>`).join('')}</div>
    <section class="cartao"><h3>Últimas solicitações</h3>
      <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Nº</th><th>Servidor</th>${sec ? '' : '<th>Secretaria</th>'}<th>Destino</th><th>Saída</th><th>Etapa</th></tr></thead>
      <tbody>${recentes.map(s => `<tr class="clicavel" data-id="${esc(s.id)}"><td><strong>${esc(s.numero)}</strong></td><td>${esc(s.servidor?.nome)}</td>${sec ? '' : `<td>${esc(s.secretaria_nome)}</td>`}
        <td>${esc(s.destino_cidade)}/${esc(s.destino_uf)}</td><td>${esc(dataBR(s.data_hora_saida))}</td><td>${seloEtapa(s)}</td></tr>`).join('') || `<tr><td colspan="${sec ? 5 : 6}" class="vazio-linha">Nenhuma solicitação ainda.</td></tr>`}</tbody></table></div>
    </section>`;
  el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => { location.hash = '#/solicitacoes/' + tr.dataset.id; });
  return { viva: true, titulo: 'Painel' };
}
