// SISDIFI — Conferência: aponta possíveis erros nos lançamentos (duplicidades, distâncias divergentes, CPF inválido, empenho pendente)
import { estado, ativas } from '../estado.js';
import { periodosSobrepostos, faixaDistancia, FAIXAS, cpfValido, formatarCpf, moeda, calcularDiaria } from '../calculo.js';
import { esc, dataBR, numeroBR, normalizar, hojeISO } from '../ui.js';
import { aguardando, cabecalho } from './comum.js';

export function analisarPendencias() {
  const sols = ativas(estado.solicitacoes);

  // 1) Mesmo servidor com viagens sobrepostas (agrupadas)
  const porServidor = {};
  sols.forEach(s => (porServidor[s.servidor_id] = porServidor[s.servidor_id] || []).push(s));
  const grupos = [];
  for (const lista of Object.values(porServidor)) {
    const ord = [...lista].sort((a, b) => a.data_hora_saida.localeCompare(b.data_hora_saida));
    const usados = new Set();
    for (let i = 0; i < ord.length; i++) {
      if (usados.has(ord[i].id)) continue;
      const g = [ord[i]];
      for (let j = i + 1; j < ord.length; j++) {
        if (g.some(x => periodosSobrepostos(x.data_hora_saida, x.data_hora_retorno, ord[j].data_hora_saida, ord[j].data_hora_retorno))) { g.push(ord[j]); usados.add(ord[j].id); }
      }
      if (g.length > 1) {
        const maior = Math.max(...g.map(x => x.valor_total));
        grupos.push({ itens: g, excesso: g.reduce((t, x) => t + x.valor_total, 0) - maior });
      }
    }
  }
  grupos.sort((a, b) => b.excesso - a.excesso);

  // 2) Mesmo destino com distâncias divergentes que mudam a faixa (e o valor)
  const porCidade = {};
  sols.forEach(s => { const k = normalizar(s.destino_cidade) + '/' + s.destino_uf; (porCidade[k] = porCidade[k] || []).push(s); });
  const distancias = [];
  for (const lista of Object.values(porCidade)) {
    const kms = lista.map(s => s.distancia_km);
    if (Math.max(...kms) - Math.min(...kms) < 5) continue;
    // referência = distância mais usada para a cidade
    const freq = {};
    kms.forEach(k => (freq[k] = (freq[k] || 0) + 1));
    const ref = Number(Object.entries(freq).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]);
    const divergentes = lista.filter(s => Math.abs(s.distancia_km - ref) >= 5).map(s => {
      const recalculo = calcularDiaria({ grupo: s.servidor?.grupo, km: ref, saida: s.data_hora_saida, retorno: s.data_hora_retorno, parametros: estado.config });
      return { s, mudaFaixa: faixaDistancia(ref) !== faixaDistancia(s.distancia_km), diferenca: recalculo.erro ? 0 : s.valor_total - recalculo.valor_total };
    });
    distancias.push({ cidade: `${lista[0].destino_cidade}/${lista[0].destino_uf}`, ref, divergentes });
  }
  distancias.sort((a, b) => b.divergentes.reduce((t, x) => t + Math.abs(x.diferenca), 0) - a.divergentes.reduce((t, x) => t + Math.abs(x.diferenca), 0));

  // 3) CPF inválido
  const cpfs = estado.servidores.filter(s => s.ativo !== false && !cpfValido(s.cpf));

  // 4) Empenho pendente há mais de 30 dias
  const limite = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const semEmpenho = sols.filter(s => !s.numero_empenho && s.valor_total > 0 && s.data_solicitacao < limite);

  const total = grupos.length + distancias.filter(d => d.divergentes.some(x => x.mudaFaixa)).length + cpfs.length;
  return { grupos, distancias, cpfs, semEmpenho, total };
}

export function telaConferencia(el) {
  if (aguardando(el, ['solicitacoes', 'servidores', 'config'])) return { viva: true, titulo: 'Conferência' };
  const { grupos, distancias, cpfs, semEmpenho } = analisarPendencias();
  const excessoTotal = grupos.reduce((t, g) => t + g.excesso, 0);
  const impactoDist = distancias.flatMap(d => d.divergentes).reduce((t, x) => t + x.diferenca, 0);
  const link = s => `<a href="#/solicitacoes/${esc(s.id)}">${esc(s.numero)}</a>`;

  el.innerHTML = `
    ${cabecalho('Conferência de lançamentos', '', 'O sistema confere automaticamente as solicitações emitidas. Itens aqui são <strong>indícios</strong> para revisão — confira cada caso antes de cancelar.')}
    <div class="kpis">
      <div class="kpi ${grupos.length ? 'kpi-alerta' : ''}"><span>Viagens sobrepostas</span><strong>${grupos.length}</strong><small>${moeda(excessoTotal)} possivelmente em duplicidade</small></div>
      <div class="kpi ${distancias.length ? 'kpi-alerta' : ''}"><span>Destinos com km divergente</span><strong>${distancias.length}</strong><small>impacto ${moeda(impactoDist)}</small></div>
      <div class="kpi ${cpfs.length ? 'kpi-alerta' : ''}"><span>CPF inválido</span><strong>${cpfs.length}</strong></div>
      <div class="kpi"><span>Sem empenho &gt; 30 dias</span><strong>${semEmpenho.length}</strong></div>
    </div>

    <section class="cartao"><h3>1. Mesmo servidor com viagens no mesmo período</h3>
      <p class="muted">Um servidor não pode estar em duas viagens ao mesmo tempo. Geralmente é solicitação lançada mais de uma vez.</p>
      ${grupos.map(g => `<div class="pendencia">
        <div class="pendencia-cab"><strong>${esc(g.itens[0].servidor?.nome)}</strong> — ${g.itens.length} solicitações sobrepostas · excesso ${moeda(g.excesso)}</div>
        <div class="pendencia-itens">${g.itens.map(s => `<span>${link(s)} ${esc(s.destino_cidade)} · ${esc(dataBR(s.data_hora_saida))} → ${esc(dataBR(s.data_hora_retorno))} · ${moeda(s.valor_total)}</span>`).join('')}</div>
      </div>`).join('') || '<p class="ok-txt">✓ Nenhuma sobreposição encontrada.</p>'}
    </section>

    <section class="cartao"><h3>2. Mesmo destino com distâncias diferentes</h3>
      <p class="muted">Distância de referência = a mais usada para o destino. Quando a diferença muda a faixa, o valor da diária muda.
      A partir de agora o sistema reaproveita a distância já usada para cada cidade.</p>
      ${distancias.map(d => `<div class="pendencia"><div class="pendencia-cab"><strong>${esc(d.cidade)}</strong> — referência ${numeroBR(d.ref)} km (${esc(FAIXAS[faixaDistancia(d.ref)])})</div>
        <div class="pendencia-itens">${d.divergentes.map(x => `<span>${link(x.s)} ${numeroBR(x.s.distancia_km)} km${x.mudaFaixa ? ` · <strong class="erro-txt">muda a faixa</strong> · diferença ${moeda(x.diferenca)}` : ' · mesma faixa, sem impacto no valor'}</span>`).join('')}</div></div>`).join('') || '<p class="ok-txt">✓ Distâncias consistentes.</p>'}
    </section>

    <section class="cartao"><h3>3. Servidores ativos com CPF inválido</h3>
      ${cpfs.map(s => `<div class="pendencia-itens"><span><a href="#/servidores/${esc(s.id)}">${esc(s.nome)}</a> · ${esc(formatarCpf(s.cpf))}</span></div>`).join('') || '<p class="ok-txt">✓ Todos os CPFs conferem.</p>'}
    </section>

    <section class="cartao"><h3>4. Solicitações sem empenho há mais de 30 dias</h3>
      ${semEmpenho.length ? `<div class="pendencia-itens">${semEmpenho.slice(0, 200).map(s => `<span>${link(s)} ${esc(s.servidor?.nome)} · emitida em ${esc(dataBR(s.data_solicitacao))} · ${moeda(s.valor_total)}</span>`).join('')}</div>` : '<p class="ok-txt">✓ Nenhuma pendência.</p>'}
    </section>
    <p class="muted">Conferência gerada em ${esc(dataBR(hojeISO()))}.</p>`;
  return { viva: true, titulo: 'Conferência' };
}
