// SISDIFI — Solicitações de diária: lista, nova, detalhe/edição, empenho e reembolsos
import * as db from '../db.js';
import { estado, pode, porId, secretariaNome, totalReembolsos, ativas, ETAPAS, etapaDe, ehSecretaria, separarValores, ETAPAS_EMPENHADAS } from '../estado.js';
import { formServidor, formPix, podeCompletar, pendencias, ehMotorista } from './servidores.js';
import { botoesNota, ligarBotoesNota, lerChave } from '../notas.js';
import { consultarFichas, fichasDaSecretaria, buscarFicha, tituloFicha, rotuloFicha, saldoDaFicha } from './orcamento.js';
import { calcularDiaria, moeda, horasBR, formatarCpf, periodosSobrepostos, GRUPOS, cpfValido } from '../calculo.js';
import { esc, $, $$, toast, modal, confirmar, hojeISO, dataBR, numeroBR, normalizar, lerForm, baixarArquivo, csv, mensagemErro } from '../ui.js';
import { listarUFs, listarMunicipios, calcularDistanciaRodoviaria, chaveDistancia } from '../localidades.js';
import { aguardando, cabecalho, selo, seloEtapa, opcoesSecretarias, anosDisponiveis, MESES } from './comum.js';

// =============================================================
// LISTA
// =============================================================
const filtros = { busca: '', secretaria: '', status: 'emitida', etapa: '', ano: '', mes: '', pagina: 1 };
let filtroDaUrl = '';

export function telaListaSolicitacoes(el, { query }) {
  if (aguardando(el, ['solicitacoes', 'secretarias'])) return { viva: true, titulo: 'Solicitações' };
  const idsLote = (query.get('ids') || '').split(',').filter(Boolean);

  let lista = estado.solicitacoes;
  if (query.has('etapa') && filtroDaUrl !== location.hash) { filtroDaUrl = location.hash; filtros.etapa = query.get('etapa'); filtros.status = 'emitida'; filtros.busca = ''; }
  if (idsLote.length) {
    lista = lista.filter(s => idsLote.includes(s.id));
  } else {
    const termo = normalizar(filtros.busca);
    lista = lista.filter(s =>
      (!filtros.status || (s.status || 'emitida') === filtros.status) &&
      (!filtros.secretaria || s.secretaria_id === filtros.secretaria) &&
      (!filtros.etapa || etapaDe(s) === filtros.etapa) &&
      (!filtros.ano || String(s.data_hora_saida).startsWith(filtros.ano)) &&
      (!filtros.mes || String(s.data_hora_saida).slice(5, 7) === filtros.mes.padStart(2, '0')) &&
      (!termo || normalizar(`${s.numero} ${s.servidor?.nome} ${s.destino_cidade} ${s.destino_uf} ${s.servidor?.cpf} ${s.numero_empenho || ''}`).includes(termo)));
  }
  const vv = pode.verValores();
  const totalDiarias = lista.reduce((t, s) => t + Number(s.valor_total || 0), 0);
  const totalReemb = lista.reduce((t, s) => t + totalReembolsos(s), 0);
  const porPagina = 50;
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  filtros.pagina = Math.min(filtros.pagina, paginas);
  const pagina = lista.slice((filtros.pagina - 1) * porPagina, filtros.pagina * porPagina);

  el.innerHTML = `
    ${cabecalho(idsLote.length ? 'Solicitações criadas' : 'Solicitações',
      `${idsLote.length ? `${vv ? `<a class="btn" href="#/imprimir/lote/${esc(idsLote.join(','))}">🖨 Imprimir todas</a>` : ''}<a class="btn btn-sec" href="#/solicitacoes">Ver todas</a>` : ''}
       ${vv ? '<button class="btn btn-sec" id="exportar">⭳ Exportar planilha</button>' : ''}
       ${pode.solicitar() ? '<a class="btn" href="#/solicitacoes/nova">＋ Nova solicitação</a>' : ''}`)}
    ${idsLote.length ? '' : `
    <form class="filtros" id="filtros">
      <label class="campo cresce"><span>Buscar</span><input type="search" name="busca" value="${esc(filtros.busca)}" placeholder="Nº, servidor, CPF, destino ou empenho"></label>
      <label class="campo"><span>Ano da viagem</span><select name="ano"><option value="">Todos</option>${anosDisponiveis().map(a => `<option ${String(a) === filtros.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <label class="campo"><span>Mês</span><select name="mes"><option value="">Todos</option>${MESES.map((m, i) => `<option value="${i + 1}" ${String(i + 1) === filtros.mes ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="campo"><span>Situação</span><select name="status">
        <option value="emitida" ${filtros.status === 'emitida' ? 'selected' : ''}>Emitidas</option>
        <option value="cancelada" ${filtros.status === 'cancelada' ? 'selected' : ''}>Canceladas</option>
        <option value="" ${filtros.status === '' ? 'selected' : ''}>Todas</option></select></label>
      ${ehSecretaria() ? '' : `<label class="campo"><span>Secretaria</span><select name="secretaria">${opcoesSecretarias(filtros.secretaria, { incluirInativas: true, vazio: 'Todas' })}</select></label>`}
      <label class="campo"><span>Etapa</span><select name="etapa"><option value="">Todas</option>
        ${Object.entries(ETAPAS).map(([k, v]) => `<option value="${k}" ${filtros.etapa === k ? 'selected' : ''}>${esc(v.curto)}</option>`).join('')}</select></label>
    </form>`}
    <div class="resumo-linha">
      <span><strong>${lista.length}</strong> solicitação(ões)</span>
      ${vv ? `<span>Diárias: <strong>${moeda(totalDiarias)}</strong></span>
      <span>Reembolsos: <strong>${moeda(totalReemb)}</strong></span>` : ''}
    </div>
    <div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Nº</th><th>Servidor</th><th>Destino</th><th>Saída</th><th>Retorno</th>${vv ? '<th class="num">Diárias</th><th class="num">Reemb.</th><th>Empenho</th>' : ''}<th>Etapa</th><th></th></tr></thead>
      <tbody>${pagina.map(s => `
        <tr class="clicavel" data-id="${esc(s.id)}">
          <td><strong>${esc(s.numero)}</strong>${s.interna ? '<small class="muted bloco" title="Lançamento direto da Contabilidade — não aparece para Secretaria, Controle Interno e RH">🔒 direta</small>' : ''}</td>
          <td>${esc(s.servidor?.nome)}<small class="muted bloco">${esc(s.secretaria_nome || secretariaNome(s.secretaria_id))}</small></td>
          <td>${esc(s.destino_cidade)}/${esc(s.destino_uf)}<small class="muted bloco">${numeroBR(s.distancia_km)} km</small></td>
          <td>${esc(dataBR(s.data_hora_saida))}</td>
          <td>${esc(dataBR(s.data_hora_retorno))}</td>
          ${vv ? `<td class="num">${s.etapa && !s.calculado ? '<span class="muted">a calcular</span>' : moeda(s.valor_total)}</td>
          <td class="num">${totalReembolsos(s) ? moeda(totalReembolsos(s)) : '—'}</td>
          <td>${s.numero_empenho ? esc(s.numero_empenho) : '<span class="muted">—</span>'}</td>` : ''}
          <td>${seloEtapa(s)}</td>
          <td class="acoes-linha">${vv ? `<a class="btn btn-sec btn-peq" href="#/imprimir/solicitacao/${esc(s.id)}" title="Imprimir" data-parar>🖨</a>` : ''}</td>
        </tr>`).join('') || '<tr><td colspan="${vv ? 10 : 7}" class="vazio-linha">Nenhuma solicitação encontrada.</td></tr>'}
      </tbody></table></div>
    ${paginas > 1 ? `<div class="paginacao">${Array.from({ length: paginas }, (_, i) => `<button class="btn btn-peq ${i + 1 === filtros.pagina ? '' : 'btn-sec'}" data-pag="${i + 1}">${i + 1}</button>`).join('')}</div>` : ''}`;

  const form = $('#filtros', el);
  if (form) {
    let t;
    form.oninput = () => { clearTimeout(t); t = setTimeout(() => { Object.assign(filtros, lerForm(form), { pagina: 1 }); redesenharMantendoFoco(el, form); }, 250); };
    form.onsubmit = e => e.preventDefault();
  }
  $$('[data-pag]', el).forEach(b => b.onclick = () => { filtros.pagina = Number(b.dataset.pag); telaListaSolicitacoes(el, { query }); });
  $$('tr[data-id]', el).forEach(tr => tr.onclick = e => { if (!e.target.closest('[data-parar]')) location.hash = '#/solicitacoes/' + tr.dataset.id; });
  $('#exportar', el)?.addEventListener('click', () => exportarCSV(lista));
  return { viva: true, titulo: 'Solicitações' };
}

function redesenharMantendoFoco(el, form) {
  const ativo = document.activeElement;
  const nome = ativo && form.contains(ativo) ? ativo.name : null;
  const pos = ativo?.selectionStart;
  window.dispatchEvent(new Event('sisdifi:redesenhar'));
  if (nome) {
    const novo = el.querySelector(`#filtros [name="${nome}"]`);
    if (novo) { novo.focus(); try { novo.setSelectionRange(pos, pos); } catch { /* select */ } }
  }
}

function exportarCSV(lista) {
  const linhas = [['Número', 'Data solicitação', 'Servidor', 'CPF', 'Cargo', 'Categoria', 'Secretaria', 'Destino', 'UF', 'KM', 'Faixa',
    'Saída', 'Retorno', 'Horas', 'Pernoites', 'Simples', 'Alimentação', 'Valor diárias', 'Reembolsos', 'Etapa', 'Analisado por', 'Conta de pagamento', 'Fonte de recursos', 'Autorização Prefeito', 'Ficha', 'Empenho', 'Data empenho', 'Liquidação', 'Pagamento', 'Situação', 'Objetivo']];
  for (const s of lista) linhas.push([s.numero, dataBR(s.data_solicitacao), s.servidor?.nome, formatarCpf(s.servidor?.cpf), s.servidor?.cargo_funcao,
    GRUPOS[s.servidor?.grupo] || '', s.secretaria_nome, s.destino_cidade, s.destino_uf, numeroBR(s.distancia_km), s.faixa_texto,
    dataBR(s.data_hora_saida), dataBR(s.data_hora_retorno), numeroBR(s.horas_total), s.quantidade_pernoite, s.quantidade_simples,
    s.quantidade_alimentacao, numeroBR(s.valor_total), numeroBR(totalReembolsos(s)), ETAPAS[etapaDe(s)].curto, s.analise?.por?.nome || '', s.conta_pagamento || '', s.fonte_recursos || '', dataBR(s.data_autorizacao), s.ficha || '', s.numero_empenho || '', dataBR(s.data_empenho), dataBR(s.data_liquidacao), dataBR(s.data_pagamento),
    s.status === 'cancelada' ? 'Cancelada' : 'Emitida', s.objetivo]);
  baixarArquivo(`solicitacoes-${hojeISO()}.csv`, csv(linhas));
}

// =============================================================
// FORMULÁRIO DA VIAGEM (nova e edição)
// =============================================================
export function telaNovaSolicitacao(el, { query }) {
  if (!pode.solicitar()) { el.innerHTML = '<div class="vazio">Seu perfil é somente consulta.</div>'; return { titulo: 'Nova solicitação' }; }
  if (aguardando(el, ['servidores', 'secretarias', 'solicitacoes', 'config'])) return { viva: true, titulo: 'Nova solicitação' };
  const servidorInicial = query.get('servidor');
  el.innerHTML = cabecalho('Nova solicitação de diária', '', ehSecretaria()
    ? 'Preencha os dados da viagem e envie para análise do Controle Interno. Se o servidor não estiver cadastrado, cadastre-o aqui mesmo. Você pode incluir vários servidores da mesma viagem.'
    : 'O valor é calculado automaticamente enquanto você preenche. Você pode incluir vários servidores da mesma viagem de uma vez.') + '<div id="form-viagem"></div>';
  montarFormularioViagem($('#form-viagem', el), {
    modo: 'nova',
    servidores: servidorInicial && porId('servidores', servidorInicial) ? [servidorInicial] : [],
    aoSalvar: async (dados, ids) => {
      const lista = ids.map(id => montarDadosSolicitacao(dados, porId('servidores', id)));
      const criadas = await db.criarSolicitacoes(lista);
      await db.registrarLog('solicitacao.criar', { numeros: criadas.map(c => c.numero) });
      toast(criadas.length === 1 ? `Solicitação ${criadas[0].numero} criada.` : `${criadas.length} solicitações criadas.`);
      if (ehSecretaria()) { toast('Enviada para análise do Controle Interno.'); location.hash = `#/solicitacoes?ids=${criadas.map(c => c.id).join(',')}`; return; }
      location.hash = criadas.length === 1 ? `#/solicitacoes/${criadas[0].id}` : `#/solicitacoes?ids=${criadas.map(c => c.id).join(',')}`;
    }
  });
  return { titulo: 'Nova solicitação' };
}

function snapshotServidor(sv) {
  return { nome: sv.nome, cpf: sv.cpf, chave_pix: sv.chave_pix || '', cargo_funcao: sv.cargo_funcao, grupo: sv.grupo, categoria_nome: GRUPOS[sv.grupo] };
}

/** Campos do cálculo da diária (feito pela Contabilidade). */
function camposCalculo(viagem, grupo) {
  const calc = calcularDiaria({ grupo, km: viagem.distancia_km, saida: viagem.data_hora_saida, retorno: viagem.data_hora_retorno, dentroMunicipio: !!viagem.dentro_municipio, parametros: estado.config });
  if (calc.erro) return calc;
  const { tipo_resumo, ...campos } = calc;
  return { ...campos, calculado: true };
}

function listaLinks(dados) {
  return [dados.link1, dados.link2, dados.link3].map(x => String(x || '').trim()).filter(Boolean);
}

function montarDadosSolicitacao(dados, sv, existente = null) {
  const base = {
    servidor_id: sv.id,
    servidor: snapshotServidor(sv),
    secretaria_id: dados.secretaria_id,
    secretaria_nome: secretariaNome(dados.secretaria_id),
    destino_uf: dados.destino_uf,
    destino_cidade: dados.destino_cidade,
    distancia_km: Math.round(Number(dados.distancia_km || 0) * 100) / 100,
    dentro_municipio: !!dados.dentro_municipio,
    data_hora_saida: dados.data_hora_saida,
    data_hora_retorno: dados.data_hora_retorno,
    objetivo: dados.objetivo,
    observacoes: dados.observacoes || '',
    links: listaLinks(dados),
    conta_pagamento: dados.conta_pagamento || '',
    fonte_recursos: dados.fonte_recursos || '',
    ficha_sugerida: dados.ficha_sugerida || '',
    ficha_sugerida_titulo: dados.ficha_sugerida ? (dados.ficha_sugerida_titulo || '') : '',
    data_solicitacao: dados.data_solicitacao
  };
  if (!existente) {
    // Lançamento direto da Contabilidade: não passa pelo Controle Interno e não aparece para Secretaria, Controle Interno e RH.
    if (pode.contabil() && dados.tramitacao === 'direta') {
      const agora = new Date().toISOString();
      return { ...base, calculado: false, status: 'emitida', etapa: 'aprovada', interna: true, numero_empenho: '', data_empenho: '', ficha: '',
        analise: { resultado: 'dispensada', por: quem(), em: agora },
        historico: [{ etapa: 'aprovada', em: agora, por: estado.sessao.nome, obs: 'Lançamento direto da Contabilidade (sem Controle Interno)' }] };
    }
    // O valor NÃO é calculado aqui: só a Contabilidade calcula, depois da aprovação do Controle Interno.
    return { ...base, calculado: false, status: 'emitida', etapa: 'analise', numero_empenho: '', data_empenho: '', ficha: '' };
  }
  const r = { ...base };
  // reprovada e corrigida → volta para análise
  if (existente.etapa === 'reprovada') r.etapa = 'analise';
  // já calculada (ou registro antigo): quem pode ver valores recalcula ao editar a viagem
  if ((existente.calculado || !existente.etapa) && pode.verValores()) Object.assign(r, camposCalculo(base, sv.grupo));
  return r;
}

/**
 * Formulário da viagem.
 * opcoes: { modo: 'nova'|'editar', servidores: [ids], solicitacao, aoSalvar(dados, idsServidores) }
 */
function montarFormularioViagem(el, { modo, servidores = [], solicitacao = null, aoSalvar }) {
  const sol = solicitacao || {};
  let selecionados = [...servidores];
  let fonteKm = sol.distancia_km ? 'salva' : '';
  const multiplo = modo === 'nova';

  el.innerHTML = `
  <form class="grade-form" id="fv" novalidate>
    <div class="col-form">
      <section class="cartao">
        <h3>1. Servidor${multiplo ? '(es)' : ''}</h3>
        <div class="busca-servidor">
          <label class="campo"><span>${multiplo ? 'Adicionar servidor (nome ou CPF)' : 'Servidor (nome ou CPF)'}</span>
            <input type="search" id="busca-sv" autocomplete="off" placeholder="Digite ao menos 2 letras…"></label>
          <div class="sugestoes" id="sugestoes" role="listbox"></div>
        </div>
        <div id="sv-selecionados" class="sv-lista"></div>
        ${podeCadastrarServidor() ? '<button type="button" class="btn btn-sec btn-peq" id="novo-sv-rapido">＋ Servidor não cadastrado? Cadastrar agora</button>' : ''}
        ${ehSecretaria()
          ? `<input type="hidden" name="secretaria_id" value="${esc(estado.sessao.secretaria_id || '')}">
             <label class="campo mt"><span>Secretaria solicitante</span><input value="${esc(secretariaNome(estado.sessao.secretaria_id) || estado.sessao.secretaria_nome)}" disabled></label>`
          : `<label class="campo mt"><span>Secretaria responsável</span>
          <select name="secretaria_id" required>${opcoesSecretarias(sol.secretaria_id || '')}</select></label>`}
      </section>

      <section class="cartao">
        <h3>2. Viagem</h3>
        <div class="grade-2">
          <label class="campo"><span>Saída de ${esc(estado.config.origem.cidade)} (data e hora)</span><input type="datetime-local" name="data_hora_saida" value="${esc(sol.data_hora_saida || '')}" required></label>
          <label class="campo"><span>Chegada em ${esc(estado.config.origem.cidade)} (data e hora)</span><input type="datetime-local" name="data_hora_retorno" value="${esc(sol.data_hora_retorno || '')}" required></label>
        </div>
        <div class="grade-3">
          <label class="campo"><span>Estado (UF)</span><select name="destino_uf" id="uf" required><option value="${esc(sol.destino_uf || 'MG')}">${esc(sol.destino_uf || 'MG')}</option></select></label>
          <label class="campo"><span>Município de destino</span><select name="destino_cidade" id="cidade" required>
            <option value="${esc(sol.destino_cidade || '')}">${esc(sol.destino_cidade || 'Carregando municípios…')}</option></select></label>
          <label class="campo"><span>Distância (km) <button type="button" class="link link-peq" id="btn-km">recalcular</button></span>
            <input type="number" name="distancia_km" id="km" step="0.01" min="0.01" value="${esc(sol.distancia_km ?? '')}" required>
            <small class="dica" id="km-fonte"></small></label>
        </div>
        <label class="check"><input type="checkbox" name="dentro_municipio" id="dentro-mun" ${sol.dentro_municipio ? 'checked' : ''}>
          Deslocamento dentro do território do município (distritos/zona rural) — Art. 6º, § 2º: 50% da etapa alimentação</label>
        <label class="campo"><span>Data da solicitação</span><input type="date" name="data_solicitacao" value="${esc(sol.data_solicitacao || hojeISO())}" required ${modo === 'editar' ? 'disabled title="A data da solicitação define a numeração e não pode ser alterada."' : ''}></label>
      </section>

      <section class="cartao">
        <h3>3. Pagamento <small class="muted">(obrigatório)</small></h3>
        <div class="grade-2">
          <label class="campo"><span>Conta para pagamento *</span><input name="conta_pagamento" list="dl-contas-f" value="${esc(sol.conta_pagamento || '')}" required placeholder="Banco, agência e conta da secretaria/fundo"></label>
          <label class="campo"><span>Fonte de recurso *</span><input name="fonte_recursos" list="dl-fontes-f" value="${esc(sol.fonte_recursos || '')}" required placeholder="Ex.: 1500 — Recursos não vinculados"></label>
        </div>
        <input type="hidden" name="ficha_sugerida" value="${esc(sol.ficha_sugerida || '')}">
        <input type="hidden" name="ficha_sugerida_titulo" value="${esc(sol.ficha_sugerida_titulo || '')}">
        <div class="linha-form"><button type="button" class="btn btn-sec btn-peq" id="consultar-fichas">📑 Consultar fichas do orçamento</button>
          <span class="dica" id="ficha-escolhida">${sol.ficha_sugerida ? 'Ficha escolhida: <strong>' + esc(rotuloFicha(sol, 'ficha_sugerida')) + '</strong>' : ''}</span></div>
        <datalist id="dl-contas-f"></datalist><datalist id="dl-fontes-f"></datalist>
      </section>

      <section class="cartao">
        <h3>4. Objetivo da viagem</h3>
        <textarea name="objetivo" rows="3" maxlength="500" required>${esc(sol.objetivo || '')}</textarea>
        <h3 class="mt">5. Observações</h3>
        <textarea name="observacoes" rows="2" maxlength="500">${esc(sol.observacoes || '')}</textarea>
        <h3 class="mt">6. Link do curso, capacitação ou evento <small class="muted">(opcional)</small></h3>
        <p class="dica">Cole o endereço da página do curso, convite, programação ou inscrição. A Contabilidade abre e imprime junto com o formulário.</p>
        ${[0, 1, 2].map(i => `<label class="campo"><span class="sr-only">Link ${i + 1}</span><input type="url" name="link${i + 1}" placeholder="https://…" value="${esc((sol.links || [])[i] || '')}" ${i > 0 && !(sol.links || [])[i] ? 'data-extra hidden' : ''}></label>`).join('')}
        <button type="button" class="link link-peq" id="mais-link">＋ adicionar outro link</button>
      </section>
    </div>

    <aside class="col-resultado">
      <div class="cartao resultado-calc" id="resultado"><p class="muted">Preencha servidor, datas e distância para ver o cálculo.</p></div>
      <div id="avisos"></div>
      ${modo === 'nova' && pode.contabil() ? `<div class="cartao">
        <label class="campo"><span>Tramitação</span><select name="tramitacao" id="tramitacao">
          <option value="direta">Lançamento direto da Contabilidade</option>
          <option value="normal">Normal — enviar ao Controle Interno</option></select></label>
        <p class="dica" id="dica-tramitacao"></p></div>` : ''}
      <p class="erro-form" id="erro-fv" role="alert"></p>
      <div class="acoes-form">
        <button type="button" class="btn btn-sec" id="cancelar-fv">Cancelar</button>
        <button type="submit" class="btn" id="salvar-fv">${modo === 'nova' ? (ehSecretaria() ? 'Enviar para análise' : pode.contabil() ? 'Salvar solicitação' : 'Salvar e enviar para análise') : 'Salvar alterações'}</button>
      </div>
    </aside>
  </form>`;

  const form = $('#fv', el);
  const busca = $('#busca-sv', el), sug = $('#sugestoes', el);
  // Sugestões de conta e fonte: as cadastradas na secretaria + as gerais dos Parâmetros.
  function preencherListasPagamento() {
    const sec = porId('secretarias', form.secretaria_id.value) || {};
    const un = a => [...new Set(a.filter(Boolean))];
    $('#dl-contas-f', el).innerHTML = un([...(sec.contas_pagamento || []), ...(estado.config.contas_pagamento || [])]).map(x => `<option value="${esc(x)}">`).join('');
    $('#dl-fontes-f', el).innerHTML = un([...(sec.fontes_recursos || []), ...(estado.config.fontes_recursos || [])]).map(x => `<option value="${esc(x)}">`).join('');
  }
  preencherListasPagamento();
  form.secretaria_id.addEventListener?.('change', preencherListasPagamento);

  // ---------- Servidores ----------
  function desenharSelecionados() {
    $('#sv-selecionados', el).innerHTML = selecionados.map(id => {
      const s = porId('servidores', id);
      if (!s) return '';
      return `<div class="sv-item"><div><strong>${esc(s.nome)}</strong>
        <small>${esc(formatarCpf(s.cpf))} · ${esc(s.cargo_funcao)} · ${esc(GRUPOS[s.grupo] || '')}${s.chave_pix ? ' · Pix: ' + esc(s.chave_pix) : ''}</small>
        ${pendencias(s).length ? `<small class="erro-txt">⚠ Cadastro sem ${pendencias(s).join(' e ')}.</small>` : ''}
        ${podeCompletar(s) ? `<button type="button" class="link link-peq" data-pix-sv="${esc(id)}">${pendencias(s).length ? '＋ completar ' + pendencias(s).join(' e ') : 'alterar Pix/cargo'}</button>` : ''}</div>
        ${multiplo || selecionados.length > 1 ? `<button type="button" class="btn-icone" data-remover="${esc(id)}" aria-label="Remover">✕</button>` : ''}</div>`;
    }).join('') || '<p class="muted">Nenhum servidor selecionado.</p>';
    $$('[data-remover]', el).forEach(b => b.onclick = () => { selecionados = selecionados.filter(x => x !== b.dataset.remover); desenharSelecionados(); recalcular(); });
    $$('[data-pix-sv]', el).forEach(b => b.onclick = () => formPix(porId('servidores', b.dataset.pixSv), () => setTimeout(() => { desenharSelecionados(); recalcular(); }, 150)));
  }
  function adicionar(id) {
    if (!multiplo) selecionados = [id];
    else if (!selecionados.includes(id)) selecionados.push(id);
    const s = porId('servidores', id);
    if (s?.secretaria_id && !form.secretaria_id.value) form.secretaria_id.value = s.secretaria_id;
    busca.value = ''; sug.innerHTML = ''; sug.classList.remove('aberta');
    desenharSelecionados(); recalcular();
    busca.focus();
  }
  busca.oninput = () => {
    const t = normalizar(busca.value), dig = busca.value.replace(/\D/g, '');
    if (t.length < 2) { sug.innerHTML = ''; sug.classList.remove('aberta'); return; }
    // Secretaria vê os servidores da própria secretaria e os motoristas de todas as secretarias;
    // outros servidores de outras secretarias, só digitando o CPF completo.
    const minha = s => s.secretaria_id === estado.sessao.secretaria_id;
    const daMinha = s => !ehSecretaria() || minha(s) || ehMotorista(s) || (dig.length === 11 && s.cpf === dig);
    const r = estado.servidores.filter(s => s.ativo !== false && !selecionados.includes(s.id) && daMinha(s) &&
      (normalizar(s.nome).includes(t) || normalizar(s.cargo_funcao).includes(t) || (dig.length >= 3 && String(s.cpf).includes(dig))))
      .sort((a, b) => (minha(b) - minha(a)) || a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, 15);
    sug.innerHTML = r.map(s => `<button type="button" role="option" data-id="${esc(s.id)}"><strong>${esc(s.nome)}</strong>
      <small>${esc(formatarCpf(s.cpf))} · ${esc(s.cargo_funcao || 'cargo a informar')} · ${esc(secretariaNome(s.secretaria_id) || 'sem secretaria')}${ehSecretaria() && !minha(s) && ehMotorista(s) ? ' · motorista de outra secretaria' : ''}</small></button>`).join('')
      || `<div class="sem-resultado">Nenhum servidor encontrado.${podeCadastrarServidor() ? ' <button type="button" class="link" data-novo-sv>Cadastrar novo servidor</button>' : ''}${ehSecretaria() ? '<br><small>Motoristas de todas as secretarias aparecem na busca (digite "motorista" para listar). Outro servidor de outra secretaria: digite o CPF completo.</small>' : ''}</div>`;
    sug.querySelector('[data-novo-sv]')?.addEventListener('click', () => cadastrarRapido(busca.value));
    sug.classList.add('aberta');
    $$('button[data-id]', sug).forEach(b => b.onclick = () => adicionar(b.dataset.id));
  };
  busca.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); const p = sug.querySelector('button[data-id]'); p && adicionar(p.dataset.id); }
    if (e.key === 'Escape') { sug.classList.remove('aberta'); }
  };
  document.addEventListener('click', function fecharSug(e) {
    if (!el.isConnected) return document.removeEventListener('click', fecharSug);
    if (!e.target.closest('.busca-servidor')) sug.classList.remove('aberta');
  });

  function cadastrarRapido(texto = '') {
    sug.classList.remove('aberta');
    const dig = String(texto).replace(/\D/g, '');
    formServidor(null, {
      rapido: true,
      inicial: dig.length >= 3 ? { cpf: dig } : { nome: texto },
      secretariaFixa: ehSecretaria() ? estado.sessao.secretaria_id : (form.secretaria_id.value || ''),
      aoSalvar: id => {
        // espera o novo servidor chegar do banco e já o seleciona
        let tentativas = 0;
        const t = setInterval(() => { if (porId('servidores', id) || ++tentativas > 40) { clearInterval(t); if (porId('servidores', id)) adicionar(id); } }, 100);
      }
    });
  }
  $('#novo-sv-rapido', el)?.addEventListener('click', () => cadastrarRapido(''));

  // ---------- UF / município / distância ----------
  // O destino é escolhido na lista oficial de municípios do estado; a distância é calculada
  // automaticamente pela rota rodoviária entre a sede de Frei Inocêncio e a sede do município escolhido.
  const selUF = $('#uf', el), selCidade = $('#cidade', el), inKm = $('#km', el), kmFonte = $('#km-fonte', el);
  const chkDentro = $('#dentro-mun', el);
  const textoFonte = {
    salva: 'Distância salva nesta solicitação.',
    rota: 'Calculada pela rota rodoviária (OpenStreetMap) entre as sedes dos municípios. Pode ajustar se necessário.',
    estimada: 'ESTIMADA (serviço de rotas fora do ar): linha reta × 1,25. Confira antes de salvar.',
    cadastro: 'Serviço de rotas indisponível: usada a distância já registrada para este destino.',
    manual: 'Informada manualmente.'
  };
  let dicaExtra = '';
  const mostrarFonte = () => { kmFonte.textContent = chkDentro.checked ? 'Dentro do município: a distância não altera o valor.' : ((textoFonte[fonteKm] || '') + dicaExtra); };

  async function carregarCidades(desejada) {
    const uf = selUF.value;
    selCidade.innerHTML = '<option value="">Carregando…</option>';
    try {
      const lista = await listarMunicipios(uf);
      const alvo = desejada || '';
      const existe = lista.some(c => normalizar(c) === normalizar(alvo));
      selCidade.innerHTML = '<option value="">Selecione o município</option>'
        + (alvo && !existe ? `<option value="${esc(alvo)}" selected>${esc(alvo)} (registro antigo)</option>` : '')
        + lista.map(c => `<option value="${esc(c)}" ${normalizar(c) === normalizar(alvo) ? 'selected' : ''}>${esc(c)}</option>`).join('');
    } catch (e) {
      selCidade.innerHTML = `<option value="${esc(desejada || '')}">${esc(desejada || 'Lista indisponível')}</option>`;
      toast('Não foi possível carregar a lista de municípios. Recarregue a página.', 'erro');
    }
  }
  const prontoLocalidades = listarUFs().then(async ufs => {
    const atual = selUF.value || 'MG';
    selUF.innerHTML = ufs.map(u => `<option value="${u.sigla}" ${u.sigla === atual ? 'selected' : ''}>${u.sigla} — ${esc(u.nome)}</option>`).join('');
    await carregarCidades(sol.destino_cidade || '');
  }).catch(() => toast('Não foi possível carregar a lista de estados. Recarregue a página.', 'erro'));

  async function buscarDistancia() {
    const cidade = selCidade.value, uf = selUF.value;
    if (!cidade || !uf || chkDentro.checked) return;
    const anterior = estado.distancias[chaveDistancia(cidade, uf)];
    kmFonte.textContent = 'Calculando distância pela rota…';
    inKm.disabled = true;
    try {
      const r = await calcularDistanciaRodoviaria(estado.config.origem, cidade, uf);
      if (r.fonte === 'estimada' && anterior) { inKm.value = anterior.km; fonteKm = 'cadastro'; }
      else { inKm.value = r.km; fonteKm = r.fonte; }
      dicaExtra = anterior && fonteKm !== 'cadastro' && Math.abs(anterior.km - Number(inKm.value)) >= 5
        ? ` Atenção: viagens anteriores para ${cidade} usaram ${String(anterior.km).replace('.', ',')} km.` : '';
    } catch (e) {
      if (anterior) { inKm.value = anterior.km; fonteKm = 'cadastro'; }
      else { fonteKm = 'manual'; toast(`Não foi possível calcular a distância (${e.message}). Informe o km manualmente.`, 'aviso'); }
      dicaExtra = '';
    }
    inKm.disabled = false;
    mostrarFonte(); recalcular();
  }

  function marcarDentroSeMesmoMunicipio() {
    const o = estado.config.origem;
    const mesmo = normalizar(selCidade.value) === normalizar(o.cidade) && selUF.value === o.uf;
    if (mesmo !== chkDentro.checked) { chkDentro.checked = mesmo; aplicarDentro(); }
    return mesmo;
  }
  selUF.addEventListener('change', async () => { await carregarCidades(''); inKm.value = ''; fonteKm = ''; dicaExtra = ''; mostrarFonte(); recalcular(); });
  // A distância só é calculada quando o usuário ESCOLHE o destino (ao abrir uma edição, o km salvo é mantido).
  selCidade.addEventListener('change', () => { if (!marcarDentroSeMesmoMunicipio()) buscarDistancia(); recalcular(); });
  $('#btn-km', el).onclick = () => buscarDistancia();
  inKm.addEventListener('input', () => { fonteKm = 'manual'; dicaExtra = ''; mostrarFonte(); });

  // Deslocamento dentro do município: destino = município de origem, distância não é usada.
  async function aplicarDentro() {
    const on = chkDentro.checked;
    inKm.required = !on;
    if (on) {
      const o = estado.config.origem;
      if (selUF.value !== o.uf) { selUF.value = o.uf; await carregarCidades(o.cidade); }
      else if (normalizar(selCidade.value) !== normalizar(o.cidade)) {
        const opt = [...selCidade.options].find(x => normalizar(x.value) === normalizar(o.cidade));
        if (opt) selCidade.value = opt.value;
      }
    }
    mostrarFonte(); recalcular();
  }
  chkDentro.addEventListener('change', aplicarDentro);
  prontoLocalidades.then(() => { inKm.required = !chkDentro.checked; mostrarFonte(); });

  // ---------- Cálculo ao vivo ----------
  function recalcular() {
    const d = lerForm(form);
    const res = $('#resultado', el), avisos = $('#avisos', el);
    const linhas = [];
    const alertas = [];
    let total = 0;
    for (const id of selecionados) {
      const s = porId('servidores', id);
      if (!s) continue;
      const c = calcularDiaria({ grupo: s.grupo, km: d.distancia_km, saida: d.data_hora_saida, retorno: d.data_hora_retorno, dentroMunicipio: !!d.dentro_municipio, parametros: estado.config });
      if (c.erro) linhas.push({ s, erro: c.erro });
      else { total += c.valor_total; linhas.push({ s, c }); }
      const conflito = ativas(estado.solicitacoes).find(o => o.servidor_id === id && o.id !== sol.id &&
        periodosSobrepostos(o.data_hora_saida, o.data_hora_retorno, d.data_hora_saida, d.data_hora_retorno));
      if (conflito) alertas.push(`${s.nome} já tem a solicitação ${conflito.numero} (${dataBR(conflito.data_hora_saida)} a ${dataBR(conflito.data_hora_retorno)}) em período que se sobrepõe a esta viagem.`);
    }
    avisos.innerHTML = alertas.map(a => `<div class="alerta">⚠ ${esc(a)}</div>`).join('');
    if (!pode.verValores()) {
      // Secretaria não vê valores: mostra só a conferência do que falta preencher.
      const itens = [
        ['Servidor(es)', selecionados.length > 0],
        ['Chave Pix do(s) servidor(es)', selecionados.length > 0 && selecionados.every(id => porId('servidores', id)?.chave_pix)],
        ['Saída e chegada', !!(d.data_hora_saida && d.data_hora_retorno) && !linhas.some(l => l.erro && /retorno|data/i.test(l.erro))],
        ['Destino', !!(d.destino_cidade)],
        ['Conta para pagamento', !!d.conta_pagamento],
        ['Fonte de recurso', !!d.fonte_recursos],
        ['Objetivo', !!d.objetivo]
      ];
      res.innerHTML = `<h3>Conferência do pedido</h3><ul class="checklist">${itens.map(([n, okk]) => `<li class="${okk ? 'ok' : ''}">${okk ? '✓' : '○'} ${esc(n)}</li>`).join('')}</ul>
        <p class="muted">O valor da diária é calculado e conferido pelo Controle Interno após o envio.</p>`;
      return;
    }
    if (!linhas.length) { res.innerHTML = '<p class="muted">Selecione o servidor para ver o cálculo.</p>'; return; }
    const primeiro = linhas.find(l => l.c)?.c;
    res.innerHTML = `
      <h3>Cálculo da diária</h3>
      ${primeiro ? `<dl class="dl-calc">
        <dt>Tempo fora</dt><dd>${horasBR(primeiro.horas_total)} h</dd>
        <dt>Faixa</dt><dd>${esc(primeiro.faixa_texto)}</dd>
        <dt>Composição</dt><dd>${[primeiro.quantidade_pernoite && primeiro.quantidade_pernoite + ' pernoite(s)', primeiro.quantidade_simples && '1 simples', primeiro.quantidade_alimentacao && '1 alimentação'].filter(Boolean).join(' + ') || 'Sem diária'}</dd>
      </dl>` : ''}
      <ul class="calc-servidores">${linhas.map(l => l.erro
        ? `<li><span>${esc(l.s.nome)}</span><span class="erro-txt">${esc(l.erro)}</span></li>`
        : `<li><span>${esc(l.s.nome)}<small>${esc(GRUPOS[l.s.grupo])}</small></span><strong>${moeda(l.c.valor_total)}</strong></li>`).join('')}</ul>
      ${linhas.length > 1 ? `<div class="calc-total"><span>Total da viagem</span><strong>${moeda(total)}</strong></div>` : ''}
      ${primeiro ? `<details><summary>Descritivo do cálculo</summary><ul class="lista-peq">${primeiro.descricao_calculo.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}`;
  }
  form.addEventListener('input', e => { if (e.target !== busca) { recalcular(); $('#erro-fv', el).textContent = ''; } });
  form.addEventListener('change', recalcular);

  const selTram = $('#tramitacao', el);
  if (selTram) {
    const dica = () => { $('#dica-tramitacao', el).textContent = selTram.value === 'direta'
      ? 'A Contabilidade faz tudo: cálculo, ficha, assinatura, empenho e pagamento. Não passa pelo Controle Interno e não aparece para Secretaria, Controle Interno e RH.'
      : 'Vai para o Controle Interno aprovar antes do cálculo (aparece para a secretaria e para o Controle Interno).'; };
    selTram.onchange = dica; dica();
  }
  $('#cancelar-fv', el).onclick = () => history.back();
  $('#consultar-fichas', el).onclick = () => {
    const sec = form.secretaria_id.value;
    if (!sec) return toast('Escolha a secretaria primeiro.', 'erro');
    consultarFichas(sec, f => {
      form.fonte_recursos.value = f.fonte; form.ficha_sugerida.value = f.ficha; form.ficha_sugerida_titulo.value = tituloFicha(f);
      $('#ficha-escolhida', el).innerHTML = `Ficha escolhida: <strong>${esc(f.ficha)} — ${esc(tituloFicha(f))}</strong>${f.descricao ? ' · ' + esc(f.descricao) : ''}`;
      recalcular();
    });
  };
  $('#mais-link', el).onclick = () => { const x = form.querySelector('[data-extra][hidden]'); if (x) { x.hidden = false; x.removeAttribute('data-extra'); x.focus(); } if (!form.querySelector('[data-extra][hidden]')) $('#mais-link', el).hidden = true; };

  form.onsubmit = async e => {
    e.preventDefault();
    const d = lerForm(form);
    if (modo === 'editar') d.data_solicitacao = sol.data_solicitacao;
    d.destino_uf = (d.destino_uf || '').toUpperCase();
    const erro = $('#erro-fv', el);
    const faltando = [];
    if (!selecionados.length) faltando.push('servidor');
    if (!d.secretaria_id) faltando.push('secretaria');
    if (!d.data_hora_saida || !d.data_hora_retorno) faltando.push('saída e retorno');
    if (!d.destino_uf || !d.destino_cidade) faltando.push('destino');
    if (!d.dentro_municipio && !(Number(d.distancia_km) > 0)) faltando.push('distância');
    if (!d.conta_pagamento) faltando.push('conta para pagamento');
    if (!d.fonte_recursos) faltando.push('fonte de recurso');
    if (!d.objetivo) faltando.push('objetivo');
    const linkRuim = listaLinks(d).find(u => !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(u));
    if (linkRuim) { erro.textContent = `Link inválido: "${linkRuim}". Use o endereço completo começando com https://`; return; }
    if (!d.data_solicitacao) faltando.push('data da solicitação');
    if (faltando.length) { erro.textContent = 'Preencha: ' + faltando.join(', ') + '.'; return; }
    const c0 = calcularDiaria({ grupo: 'DEMAIS_SERVIDORES', km: d.distancia_km || 1, saida: d.data_hora_saida, retorno: d.data_hora_retorno, dentroMunicipio: !!d.dentro_municipio, parametros: estado.config });
    if (c0.erro) { erro.textContent = c0.erro; return; }
    if ($('#avisos .alerta', el) && !(await confirmar('Há sobreposição de período com outra solicitação do mesmo servidor. Deseja salvar mesmo assim?', { ok: 'Salvar mesmo assim' }))) return;
    erro.textContent = '';
    const btn = $('#salvar-fv', el);
    btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      // Guarda a distância usada para este destino: próximas viagens para a mesma cidade usam o mesmo km.
      const chave = chaveDistancia(d.destino_cidade, d.destino_uf);
      const km = Math.round(Number(d.distancia_km) * 100) / 100;
      if (!d.dentro_municipio && km > 0 && estado.distancias[chave]?.km !== km) db.salvar('distancias', chave, { cidade: d.destino_cidade, uf: d.destino_uf, km }).catch(() => {});
      await aoSalvar(d, selecionados);
    } catch (err) {
      erro.textContent = mensagemErro(err);
      btn.disabled = false; btn.textContent = modo === 'nova' ? (ehSecretaria() ? 'Enviar para análise' : 'Salvar e enviar para análise') : 'Salvar alterações';
    }
  };

  desenharSelecionados();
  recalcular();
}

// =============================================================
// DETALHE
// =============================================================
function podeCadastrarServidor() { return pode.editar() || ehSecretaria(); }

function podeEditarViagem(sol) {
  if (sol.status === 'cancelada') return false;
  if (pode.admin()) return true;
  const e = etapaDe(sol);
  if (e === 'legado') return pode.contabil();
  return pode.solicitar() && ['analise', 'reprovada'].includes(e);
}

function podeCancelar(sol) {
  if (sol.status === 'cancelada') return false;
  if (pode.admin() || pode.contabil()) return true;
  return pode.solicitar() && ['analise', 'reprovada', 'aprovada'].includes(etapaDe(sol));
}

const quem = () => ({ uid: estado.sessao.uid, nome: estado.sessao.nome });

/** Grava a solicitação separando os valores (coleção protegida "valores"). */
async function gravarSolicitacao(id, dados) {
  const { base, val } = separarValores(dados);
  // a secretaria vai junto com os valores (Secretaria lê no relatório só os da própria pasta, depois do empenho)
  const secId = dados.secretaria_id || porId('solicitacoes', id)?.secretaria_id;
  if (Object.keys(val).length && secId) val.secretaria_id = secId;
  if (Object.keys(val).length) await db.salvar('valores', id, val);
  if (Object.keys(base).length) await db.atualizar('solicitacoes', id, base);
}

/** Registra mudança de etapa com histórico (quem, quando, observação). */
async function tramitar(sol, etapa, campos = {}, obs = '') {
  const historico = [...(sol.historico || []), { etapa, em: new Date().toISOString(), por: estado.sessao.nome, obs }];
  // Após o empenho, os valores ficam visíveis para o relatório do Controle Interno.
  const liberar = ETAPAS_EMPENHADAS.includes(etapa);
  // Lançamento direto (interno) nunca é liberado para Controle Interno, RH ou Secretaria.
  const liberarFinal = liberar && !sol.interna;
  if (pode.contabil() && liberarFinal !== !!sol.liberado_ci) campos = { ...campos, liberado_ci: liberarFinal };
  await gravarSolicitacao(sol.id, { ...campos, etapa, historico });
  await db.registrarLog('solicitacao.etapa', { numero: sol.numero, etapa, obs });
}

function datalist(id, itens) {
  return `<datalist id="${id}">${(itens || []).map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
}

/** Verificações do Controle Interno sobre o servidor (sem valores). */
function checklistServidor(sol) {
  const sv = porId('servidores', sol.servidor_id);
  const itens = [
    ['Servidor cadastrado no sistema', !!sv],
    ['Cadastro ativo', !!sv && sv.ativo !== false],
    ['CPF válido', !!sv && cpfValido(sv.cpf)],
    ['Chave Pix informada', !!(sv?.chave_pix || sol.servidor?.chave_pix)],
    ['Cargo/função informado', !!(sv?.cargo_funcao)],
    sv && sv.secretaria_id && sol.secretaria_id && sv.secretaria_id !== sol.secretaria_id
      ? [ehMotorista(sv) ? `Motorista lotado em ${secretariaNome(sv.secretaria_id)} — pode atender outras secretarias` : `Servidor lotado em outra secretaria (${secretariaNome(sv.secretaria_id)}) — confira`, ehMotorista(sv)]
      : null,
    ['Conta para pagamento e fonte de recurso informadas', !!(sol.conta_pagamento && sol.fonte_recursos)]
  ].filter(Boolean);
  const conflito = ativas(estado.solicitacoes).find(o => o.servidor_id === sol.servidor_id && o.id !== sol.id &&
    periodosSobrepostos(o.data_hora_saida, o.data_hora_retorno, sol.data_hora_saida, sol.data_hora_retorno));
  itens.push([conflito ? `Sem outra viagem no mesmo período — CONFLITO com ${conflito.numero}` : 'Sem outra viagem no mesmo período', !conflito]);
  return `<div class="verificacao">
    <p><strong>${esc(sol.servidor?.nome)}</strong> · ${esc(formatarCpf(sol.servidor?.cpf))} · ${esc(sol.servidor?.cargo_funcao)} · enquadramento <strong>${esc(GRUPOS[sv?.grupo || sol.servidor?.grupo] || '')}</strong>
      · lotação ${esc(secretariaNome(sv?.secretaria_id) || '—')}${sol.criado_por?.nome ? ` · enviado por ${esc(sol.criado_por.nome)}` : ''}</p>
    <ul class="checklist">${itens.map(([t, okk]) => `<li class="${okk ? 'ok' : 'falha'}">${okk ? '✓' : '✕'} ${esc(t)}</li>`).join('')}</ul>
  </div>`;
}

function blocoLinks(sol) {
  const links = sol.links || [];
  if (!links.length) return '';
  return `<div class="links-curso"><strong>Link do curso/evento:</strong> ${links.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`).join(' · ')}</div>`;
}

function blocoTramitacao(sol) {
  const e = etapaDe(sol);
  const cancelada = sol.status === 'cancelada';
  const passos = ['analise', 'aprovada', 'calculada', 'autorizada', 'empenhada', 'liquidada', 'paga'];
  const rotulos = { analise: sol.interna ? 'Lançamento direto' : 'Controle Interno', aprovada: 'Cálculo e ficha', calculada: 'Assinatura do Prefeito', autorizada: 'Empenho', empenhada: 'Liquidação', liquidada: 'Pagamento', paga: 'Concluída' };
  const atual = ETAPAS[e].ordem;
  const linhaTempo = e === 'legado' ? '' : `<ol class="etapas etapas-7">${passos.map(p => {
    const feito = (e !== 'reprovada' && ETAPAS[p].ordem < atual) || e === 'paga';
    const agora = p === e || (e === 'reprovada' && p === 'analise');
    return `<li class="${feito ? 'feito' : ''} ${agora ? 'agora' : ''} ${agora && e === 'reprovada' ? 'reprovada' : ''}">${esc(rotulos[p])}</li>`;
  }).join('')}</ol>`;

  let acao = '';
  if (!cancelada) {
    if (e === 'analise' && pode.analisar()) {
      acao = `${checklistServidor(sol)}
      <form id="f-analise">
        <label class="campo"><span>Parecer / observação do Controle Interno (opcional)</span><textarea name="parecer" rows="2" maxlength="500">${esc(sol.analise?.parecer || '')}</textarea></label>
        <p class="dica">Se a conta, a fonte, o período ou o cadastro estiverem errados, reprove informando o motivo — a secretaria corrige e reenvia.</p>
        <div class="acoes-form"><button type="button" class="btn btn-perigo" id="reprovar">✕ Reprovar</button><button class="btn" type="submit">✓ Aprovar e enviar à Contabilidade</button></div>
      </form>`;
    } else if (e === 'aprovada' && pode.contabil()) {
      const sv = porId('servidores', sol.servidor_id);
      const grupo = sv?.grupo || sol.servidor?.grupo;
      const c = camposCalculo(sol, grupo);
      acao = c.erro ? `<div class="alerta">Não foi possível calcular: ${esc(c.erro)}. Corrija a viagem em "Editar viagem".</div>` : `
        <div class="calculo-contab">
          <dl class="dl-calc">
            <dt>Enquadramento</dt><dd>${esc(GRUPOS[grupo])}</dd>
            <dt>Faixa</dt><dd>${esc(c.faixa_texto)} (${numeroBR(c.distancia_km)} km)</dd>
            <dt>Tempo fora</dt><dd>${horasBR(c.horas_total)} h</dd>
            <dt>Pernoite</dt><dd>${c.quantidade_pernoite} × ${moeda(c.valor_pernoite)}</dd>
            <dt>Simples</dt><dd>${c.quantidade_simples} × ${moeda(c.valor_simples)}</dd>
            <dt>Alimentação</dt><dd>${c.quantidade_alimentacao} × ${moeda(c.valor_alimentacao)}</dd>
          </dl>
          <div class="calc-total grande"><span>Valor da diária</span><strong>${moeda(c.valor_total)}</strong></div>
          <details><summary>Descritivo do cálculo</summary><ul class="lista-peq">${c.descricao_calculo.map(x => `<li>${esc(x)}</li>`).join('')}${c.justificativa_legal.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>
        </div>
        <form id="f-calculo" class="linha-form">
          <label class="campo"><span>Ficha${sol.ficha_sugerida ? ' (sugerida pela secretaria)' : ''}</span><input name="ficha" value="${esc(sol.ficha || sol.ficha_sugerida || '')}" required data-titulo-ficha>
            <small class="dica" data-titulo-de-ficha></small></label>
          <button class="btn" type="submit">✓ Confirmar cálculo e ficha</button>
        </form>`;
    } else if (e === 'calculada' && pode.contabil()) {
      acao = `<p>Imprima o formulário${(sol.links || []).length ? ' e o conteúdo do link do curso' : ''}, colha a assinatura do Prefeito e registre a autorização.</p>
        ${(() => { const irmas = mesmoServidorNaEtapa(sol, 'calculada'); return irmas.length ? `<div class="empenho-itens" id="conjunto-prefeito">
          <p class="titulo-secao">Formulário único para o Prefeito</p>
          <p class="dica">Outras viagens de <strong>${esc(sol.servidor?.nome)}</strong> aguardando assinatura — marque para imprimir tudo numa folha só e registrar a assinatura de uma vez:</p>
          ${irmas.map(o => `<label class="check"><input type="checkbox" name="junto" value="${esc(o.id)}" checked> <span><strong>${esc(o.numero)}</strong> · ${esc(o.destino_cidade)}/${esc(o.destino_uf)} · ${esc(dataBR(o.data_hora_saida).slice(0, 10))} — ${moeda(totalGeral(o))}</span></label>`).join('')}
          <a class="btn btn-sec btn-peq" id="imp-conjunto" href="#">🖨 Imprimir formulário único</a></div>` : ''; })()}
        <form id="f-prefeito" class="linha-form">
          ${pode.verValores() ? `<a class="btn btn-sec" href="#/imprimir/solicitacao/${esc(sol.id)}">🖨 Imprimir formulário</a>` : ''}
          <label class="campo"><span>Data da assinatura do Prefeito</span><input type="date" name="data_autorizacao" value="${hojeISO()}" required></label>
          <button class="btn" type="submit">✓ Autorizada pelo Prefeito</button>
        </form>`;
    } else if (e === 'autorizada' && pode.contabil()) {
      const irmas = outrasParaEmpenhar(sol);
      acao = `<form id="f-empenho">
        <div class="grade-3">
        <label class="campo"><span>Ficha</span><input name="ficha" value="${esc(sol.ficha || '')}" required data-titulo-ficha><small class="dica" data-titulo-de-ficha></small></label>
        <label class="campo"><span>Nº do empenho</span><input name="numero_empenho" value="${esc(sol.numero_empenho || '')}" required></label>
        <label class="campo"><span>Data do empenho</span><input type="date" name="data_empenho" value="${esc(sol.data_empenho || hojeISO())}" required></label>
        </div>
        <div class="empenho-itens">
          <p class="titulo-secao">Composição do empenho</p>
          <label class="check"><input type="checkbox" checked disabled> <span><strong>${esc(sol.numero)}</strong> — diárias ${moeda(sol.valor_total)}${totalReembolsos(sol) ? ` + reembolsos ${moeda(totalReembolsos(sol))}` : ''}</span></label>
          ${totalReembolsos(sol) ? `<label class="check"><input type="checkbox" name="com_reembolsos" checked> <span>Incluir os reembolsos desta viagem no mesmo empenho</span></label>` : ''}
          ${irmas.length ? `<p class="dica">Outras solicitações de <strong>${esc(sol.servidor?.nome)}</strong> autorizadas e sem empenho — marque para unificar no mesmo empenho:</p>
            ${irmas.map(o => `<label class="check"><input type="checkbox" name="unir" value="${esc(o.id)}"> <span><strong>${esc(o.numero)}</strong> · ${esc(o.destino_cidade)}/${esc(o.destino_uf)} · ${esc(dataBR(o.data_hora_saida).slice(0, 10))} — ${moeda(totalGeral(o))}${o.ficha && o.ficha !== sol.ficha ? ` <span class="selo selo-pendente">ficha ${esc(o.ficha)}</span>` : ''}</span></label>`).join('')}` : ''}
          <div class="calc-total"><span>Total geral a empenhar</span><strong id="total-empenho">${moeda(totalGeral(sol))}</strong></div>
        </div>
        <div class="acoes-form"><button class="btn" type="submit">✓ Registrar empenho</button></div></form>`;
    } else if (e === 'empenhada' && pode.contabil()) {
      acao = `<form id="f-liquidacao" class="linha-form">
        <label class="campo"><span>Data da liquidação</span><input type="date" name="data_liquidacao" value="${hojeISO()}" required></label>
        <button class="btn" type="submit">✓ Liquidada — enviar ao Financeiro</button></form>`;
    } else if (e === 'liquidada' && pode.contabil()) {
      acao = `<form id="f-pagamento" class="linha-form">
        <label class="campo"><span>Data do pagamento</span><input type="date" name="data_pagamento" value="${hojeISO()}" required></label>
        <button class="btn" type="submit">✓ Paga pelo Financeiro</button></form>`;
    } else if (e === 'reprovada') {
      acao = `<div class="alerta">Reprovada por ${esc(sol.analise?.por?.nome || '')} em ${esc(dataBR(sol.analise?.em))}: ${esc(sol.analise?.motivo || '')}<br>
        ${pode.solicitar() ? 'Corrija a viagem em "Editar viagem" e salve: ela volta para análise do Controle Interno.' : ''}</div>`;
    } else if (e === 'legado' && pode.contabil()) {
      acao = `<form id="f-legado" class="grade-3">
        <label class="campo"><span>Ficha</span><input name="ficha" value="${esc(sol.ficha || '')}" data-titulo-ficha><small class="dica" data-titulo-de-ficha></small></label>
        <label class="campo"><span>Nº do empenho</span><input name="numero_empenho" value="${esc(sol.numero_empenho || '')}"></label>
        <label class="campo"><span>Data do empenho</span><input type="date" name="data_empenho" value="${esc(sol.data_empenho || '')}"></label>
        <div class="acoes-form span-3"><button class="btn btn-peq" type="submit">Salvar</button></div></form>`;
    } else {
      acao = `<p class="muted">${esc(ETAPAS[e].nome)}.</p>`;
    }
  }

  const dados = [
    sol.analise?.resultado === 'aprovada' ? ['Aprovado pelo Controle Interno', `${sol.analise.por?.nome || ''} em ${dataBR(sol.analise.em)}`] : null,
    sol.interna ? ['Lançamento direto', `Contabilidade (${sol.analise?.por?.nome || ''}) — sem Controle Interno; não aparece para Secretaria, Controle Interno e RH`] : null,
    sol.conta_pagamento ? ['Conta de pagamento', sol.conta_pagamento] : null,
    sol.fonte_recursos ? ['Fonte de recursos', sol.fonte_recursos] : null,
    sol.ficha_sugerida && !sol.ficha ? ['Ficha sugerida pela secretaria', rotuloFicha(sol, 'ficha_sugerida')] : null,
    sol.analise?.parecer ? ['Parecer', sol.analise.parecer] : null,
    sol.calculado && sol.calculo_por ? ['Calculado pela Contabilidade', `${sol.calculo_por.nome} em ${dataBR(sol.calculo_em)}`] : null,
    sol.ficha ? ['Ficha', rotuloFicha(sol)] : null,
    sol.data_autorizacao ? ['Autorização do Prefeito', dataBR(sol.data_autorizacao)] : null,
    pode.verValores() && sol.calculado ? ['Total geral (diárias + reembolsos)', `${moeda(totalGeral(sol))}${totalReembolsos(sol) ? ` (diárias ${moeda(sol.valor_total)} + reembolsos ${moeda(totalReembolsos(sol))})` : ''}`] : null,
    sol.numero_empenho ? ['Empenho', `${sol.numero_empenho}${sol.data_empenho ? ' de ' + dataBR(sol.data_empenho) : ''}${(sol.empenho_conjunto || []).length > 1 ? ` · conjunto com ${sol.empenho_conjunto.filter(n => n !== sol.numero).join(', ')}` : ''}`] : null,
    sol.data_liquidacao ? ['Liquidação', dataBR(sol.data_liquidacao)] : null,
    sol.data_pagamento ? ['Pagamento', dataBR(sol.data_pagamento)] : null
  ].filter(Boolean);
  const corrigirContabil = pode.contabil() && !cancelada && ['calculada', 'autorizada', 'empenhada', 'liquidada', 'paga'].includes(e);

  return `<section class="cartao tramitacao">
    <div class="cab-secao"><h3>Tramitação</h3><span>${esc(cancelada ? 'Cancelada' : ETAPAS[e].nome)}</span></div>
    ${linhaTempo}
    ${blocoLinks(sol)}
    ${dados.length ? `<dl class="dl dl-tramite">${dados.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
    ${acao}
    ${sol.numero_empenho && pode.verValores() ? `<a class="btn btn-sec btn-peq" href="#/imprimir/empenho/${esc(sol.id)}">🖨 Resumo do empenho${(sol.empenho_conjunto || []).length > 1 ? ' conjunto' : ''}</a> ` : ''}
    ${corrigirContabil ? '<button class="link link-peq" id="corrigir-contabil">Corrigir ficha/empenho</button>' : ''}
    ${pode.admin() && !cancelada && !['analise', 'legado'].includes(e) ? '<button class="link link-peq" id="voltar-etapa">Voltar uma etapa (administrador)</button>' : ''}
    ${(sol.historico || []).length ? `<details><summary>Histórico (${sol.historico.length})</summary><ul class="lista-peq">${sol.historico.map(h =>
      `<li>${esc(new Date(h.em).toLocaleString('pt-BR'))} — ${esc(ETAPAS[h.etapa]?.curto || h.etapa)} — ${esc(h.por)}${h.obs ? ': ' + esc(h.obs) : ''}</li>`).join('')}</ul></details>` : ''}
  </section>`;
}

/** Diárias + reembolsos de uma solicitação. */
export const totalGeral = s => Math.round((Number(s.valor_total || 0) + totalReembolsos(s)) * 100) / 100;

/** Outras solicitações do mesmo servidor na mesma etapa (formulário único para o Prefeito). */
function mesmoServidorNaEtapa(sol, etapa) {
  return ativas(estado.solicitacoes).filter(o => o.id !== sol.id && o.servidor_id === sol.servidor_id && etapaDe(o) === etapa)
    .sort((a, b) => String(a.data_hora_saida).localeCompare(String(b.data_hora_saida)));
}

/** Outras solicitações do mesmo servidor autorizadas e ainda sem empenho (para empenho conjunto). */
function outrasParaEmpenhar(sol) {
  return ativas(estado.solicitacoes).filter(o => o.id !== sol.id && o.servidor_id === sol.servidor_id && etapaDe(o) === 'autorizada' && !o.numero_empenho)
    .sort((a, b) => String(a.data_hora_saida).localeCompare(String(b.data_hora_saida)));
}

/** Título da ficha para gravar na solicitação: do orçamento ou, se for a mesma ficha, o que a secretaria escolheu. */
function tituloDaFicha(sol, numero) {
  if (!numero) return '';
  const f = buscarFicha(sol.secretaria_id, numero, sol.fonte_recursos);
  if (f) return tituloFicha(f);
  if (String(numero).trim() === String(sol.ficha || '').trim() && sol.ficha_titulo) return sol.ficha_titulo;
  if (String(numero).trim() === String(sol.ficha_sugerida || '').trim()) return sol.ficha_sugerida_titulo || '';
  return '';
}

/** Mostra o título (ação/atividade) embaixo do campo "Ficha" enquanto a Contabilidade digita. */
function ligarTituloFicha(raiz, sol) {
  raiz.querySelectorAll('[data-titulo-ficha]').forEach(inp => {
    const dica = inp.parentElement.querySelector('[data-titulo-de-ficha]');
    const campoData = inp.form?.querySelector('[name=data_empenho]');
    const mostrar = () => {
      const t = tituloDaFicha(sol, inp.value);
      const f = buscarFicha(sol.secretaria_id, inp.value, sol.fonte_recursos);
      let txt = !inp.value ? '' : t ? t + (f?.descricao ? ' · ' + f.descricao : '') : 'Ficha não encontrada no orçamento desta secretaria.';
      const ano = String(campoData?.value || hojeISO()).slice(0, 4);
      const sd = inp.value && pode.verValores() ? saldoDaFicha(sol.secretaria_id, inp.value, ano, sol.fonte_recursos, sol.id) : null;
      if (sd) txt += ` · saldo ${ano}: ${moeda(sd.saldo)} de ${moeda(sd.autorizado)}${sd.fonte ? ` (fonte ${String(sd.fonte.nome).split(' — ')[0]}: ${moeda(sd.fonte.saldo)})` : ''}`;
      dica.textContent = txt;
      dica.classList.toggle('erro-txt', !!sd && (sd.saldo < totalGeral(sol) || (sd.fonte && sd.fonte.saldo < totalGeral(sol))));
    };
    inp.addEventListener('input', mostrar); campoData?.addEventListener('change', mostrar); mostrar();
  });
}

function ligarTramitacao(el, sol) {
  const erro = err => toast(mensagemErro(err), 'erro');
  ligarTituloFicha(el, sol);
  const fa = $('#f-analise', el);
  if (fa) {
    fa.onsubmit = async e => {
      e.preventDefault();
      const d = lerForm(fa);
      if (!sol.conta_pagamento || !sol.fonte_recursos) return toast('A solicitação está sem conta de pagamento ou fonte de recursos: reprove para a secretaria completar.', 'erro');
      const falhas = [...el.querySelectorAll('.verificacao .falha')].length;
      if (!(await confirmar(falhas ? `Há ${falhas} item(ns) da verificação do servidor não atendido(s). Aprovar mesmo assim?` : `Aprovar a solicitação ${sol.numero} e enviar à Contabilidade para cálculo?`, { ok: 'Aprovar', perigo: !!falhas }))) return;
      try {
        await tramitar(sol, 'aprovada', {
          analise: { resultado: 'aprovada', parecer: d.parecer, por: quem(), em: new Date().toISOString() }
        }, d.parecer);
        toast('Solicitação aprovada e enviada à Contabilidade.');
      } catch (err) { erro(err); }
    };
    $('#reprovar', el).onclick = async () => {
      const motivo = await confirmar(`Reprovar a solicitação ${sol.numero}? Quem lançou poderá corrigir e reenviar.`, { titulo: 'Reprovar', ok: 'Reprovar', perigo: true, pedirTexto: 'Motivo da reprovação' });
      if (!motivo) return;
      try {
        await tramitar(sol, 'reprovada', { analise: { resultado: 'reprovada', motivo, parecer: fa.parecer.value.trim(), por: quem(), em: new Date().toISOString() } }, motivo);
        toast('Solicitação reprovada.');
      } catch (err) { erro(err); }
    };
  }
  const fc = $('#f-calculo', el);
  if (fc) fc.onsubmit = async e => {
    e.preventDefault();
    const d = lerForm(fc);
    if (!d.ficha) return toast('Informe a ficha.', 'erro');
    const sv = porId('servidores', sol.servidor_id);
    const grupo = sv?.grupo || sol.servidor?.grupo;
    const c = camposCalculo(sol, grupo);
    if (c.erro) return toast(c.erro, 'erro');
    try {
      await tramitar(sol, 'calculada', { ...c, ficha: d.ficha, ficha_titulo: tituloDaFicha(sol, d.ficha), calculo_por: quem(), calculo_em: new Date().toISOString(),
        servidor: { ...(sol.servidor || {}), ...(sv ? { grupo: sv.grupo, categoria_nome: GRUPOS[sv.grupo], chave_pix: sv.chave_pix || '', cargo_funcao: sv.cargo_funcao } : {}) } },
        `valor ${moeda(c.valor_total)} · ficha ${d.ficha}`);
      toast('Cálculo e ficha registrados. Imprima o formulário para a assinatura do Prefeito.');
      location.hash = '#/imprimir/solicitacao/' + sol.id;
    } catch (err) { erro(err); }
  };
  const fp = $('#f-prefeito', el);
  const juntas = () => [...el.querySelectorAll('#conjunto-prefeito [name=junto]:checked')].map(c => porId('solicitacoes', c.value)).filter(Boolean);
  $('#imp-conjunto', el)?.addEventListener('click', ev => { ev.preventDefault(); location.hash = '#/imprimir/autorizacao/' + [sol, ...juntas()].map(x => x.id).join(','); });
  if (fp) fp.onsubmit = async e => {
    e.preventDefault();
    const d = lerForm(fp);
    if (!d.data_autorizacao) return toast('Informe a data da assinatura.', 'erro');
    const lista = [sol, ...juntas()];
    try {
      for (const x of lista) await tramitar(x, 'autorizada', { data_autorizacao: d.data_autorizacao, autorizacao_registrada_por: quem(), ...(lista.length > 1 ? { autorizacao_conjunta: lista.map(y => y.numero) } : {}) });
      toast(lista.length > 1 ? `Autorização registrada em ${lista.length} solicitações (${lista.map(y => y.numero).join(', ')}).` : 'Autorização do Prefeito registrada.');
    } catch (err) { erro(err); }
  };
  const fe = $('#f-empenho', el);
  if (fe) {
    const selecionadas = () => [sol, ...[...fe.querySelectorAll('[name=unir]:checked')].map(c => porId('solicitacoes', c.value)).filter(Boolean)];
    const comReemb = () => !fe.com_reembolsos || fe.com_reembolsos.checked;
    const atualizarTotal = () => {
      const t = selecionadas().reduce((a, x) => a + Number(x.valor_total || 0) + (x === sol && !comReemb() ? 0 : totalReembolsos(x)), 0);
      $('#total-empenho', el).textContent = moeda(t);
    };
    fe.addEventListener('change', atualizarTotal);
    fe.onsubmit = async e => {
      e.preventDefault();
      const d = { ficha: fe.ficha.value.trim(), numero_empenho: fe.numero_empenho.value.trim(), data_empenho: fe.data_empenho.value };
      if (!d.ficha || !d.numero_empenho || !d.data_empenho) return toast('Preencha ficha, nº e data do empenho.', 'erro');
      const lista = selecionadas();
      const fichasDif = lista.filter(x => x.ficha && x.ficha !== d.ficha);
      if (fichasDif.length && !(await confirmar(`${fichasDif.map(x => x.numero).join(', ')} estava(m) com outra ficha. Todas ficarão com a ficha ${d.ficha} neste empenho. Continuar?`, { ok: 'Continuar' }))) return;
      const numeros = lista.map(x => x.numero);
      const total = lista.reduce((a, x) => a + Number(x.valor_total || 0) + (x === sol && !comReemb() ? 0 : totalReembolsos(x)), 0);
      const sd = saldoDaFicha(sol.secretaria_id, d.ficha, d.data_empenho.slice(0, 4), sol.fonte_recursos, sol.id);
      if (sd && total > (sd.fonte ? Math.min(sd.saldo, sd.fonte.saldo) : sd.saldo) + 0.004 &&
        !(await confirmar(`O empenho (${moeda(total)}) passa do saldo da ficha ${d.ficha} em ${d.data_empenho.slice(0, 4)}: saldo ${moeda(sd.saldo)}${sd.fonte ? `, na fonte ${moeda(sd.fonte.saldo)}` : ''}. Verifique a dotação (suplementação). Empenhar mesmo assim?`, { ok: 'Empenhar mesmo assim', perigo: true }))) return;
      try {
        for (const x of lista) {
          await tramitar(x, 'empenhada', { ...d, ficha_titulo: tituloDaFicha(x, d.ficha), empenho_conjunto: numeros.length > 1 ? numeros : [] },
            `empenho ${d.numero_empenho}${numeros.length > 1 ? ' (conjunto: ' + numeros.join(', ') + ')' : ''}`);
          // reembolsos sem empenho próprio entram no mesmo empenho
          if ((x !== sol || comReemb()) && (x.reembolsos || []).some(r => !r.numero_empenho)) {
            const rs = x.reembolsos.map(r => r.numero_empenho ? r : { ...r, numero_empenho: d.numero_empenho, data_empenho: d.data_empenho });
            await db.salvar('valores', x.id, { reembolsos: rs, total_reembolsos: soma(rs) });
          }
        }
        await db.salvar('valores', sol.id, { total_empenho: Math.round(total * 100) / 100 });
        toast(numeros.length > 1 ? `Empenho ${d.numero_empenho} registrado para ${numeros.length} solicitações (${moeda(total)}).` : `Empenho registrado (${moeda(total)}).`);
      } catch (err) { erro(err); }
    };
  }
  // No empenho conjunto, liquidação e pagamento valem para todas as solicitações do mesmo empenho.
  const doMesmoEmpenho = etapa => [sol, ...ativas(estado.solicitacoes).filter(o => o.id !== sol.id && sol.numero_empenho && o.servidor_id === sol.servidor_id &&
    o.numero_empenho === sol.numero_empenho && o.data_empenho === sol.data_empenho && etapaDe(o) === etapa)];
  const fl = $('#f-liquidacao', el);
  if (fl) fl.onsubmit = async e => {
    e.preventDefault();
    const lista = doMesmoEmpenho('empenhada');
    try { for (const x of lista) await tramitar(x, 'liquidada', lerForm(fl)); toast(`Liquidação registrada${lista.length > 1 ? ` (${lista.length} solicitações do empenho ${sol.numero_empenho})` : ''}. Enviada ao Financeiro.`); } catch (err) { erro(err); }
  };
  const fg = $('#f-pagamento', el);
  if (fg) fg.onsubmit = async e => {
    e.preventDefault();
    const lista = doMesmoEmpenho('liquidada');
    try { for (const x of lista) await tramitar(x, 'paga', lerForm(fg)); toast(`Pagamento registrado${lista.length > 1 ? ` (${lista.length} solicitações do empenho ${sol.numero_empenho})` : ''}.`); } catch (err) { erro(err); }
  };
  const fleg = $('#f-legado', el);
  if (fleg) fleg.onsubmit = async e => {
    e.preventDefault();
    try { const d = lerForm(fleg); await db.atualizar('solicitacoes', sol.id, { ...d, ficha_titulo: tituloDaFicha(sol, d.ficha) }); await db.registrarLog('solicitacao.empenho', { numero: sol.numero }); toast('Dados salvos.'); } catch (err) { erro(err); }
  };
  $('#corrigir-contabil', el)?.addEventListener('click', () => {
    const m = modal({ titulo: 'Corrigir dados da Contabilidade', largura: 560, corpo: `<form id="fcc" class="grade-2">
      <label class="campo"><span>Ficha</span><input name="ficha" value="${esc(sol.ficha || '')}" data-titulo-ficha><small class="dica" data-titulo-de-ficha></small></label>
      <label class="campo"><span>Nº do empenho</span><input name="numero_empenho" value="${esc(sol.numero_empenho || '')}"></label>
      <label class="campo"><span>Data do empenho</span><input type="date" name="data_empenho" value="${esc(sol.data_empenho || '')}"></label>
      <label class="campo"><span>Data da liquidação</span><input type="date" name="data_liquidacao" value="${esc(sol.data_liquidacao || '')}"></label>
      <label class="campo"><span>Data do pagamento</span><input type="date" name="data_pagamento" value="${esc(sol.data_pagamento || '')}"></label>
      <div class="acoes-form span-2"><button class="btn" type="submit">Salvar</button></div></form>` });
    ligarTituloFicha(m.el, sol);
    $('#fcc', m.el).onsubmit = async e => {
      e.preventDefault();
      try { const d = lerForm(e.target); await db.atualizar('solicitacoes', sol.id, { ...d, ficha_titulo: tituloDaFicha(sol, d.ficha) }); await db.registrarLog('solicitacao.empenho', { numero: sol.numero, correcao: true }); toast('Corrigido.'); m.fechar(); } catch (err) { erro(err); }
    };
  });
  $('#voltar-etapa', el)?.addEventListener('click', async () => {
    const ordem = ['analise', 'aprovada', 'calculada', 'autorizada', 'empenhada', 'liquidada', 'paga'];
    const e = etapaDe(sol);
    const anterior = e === 'reprovada' ? 'analise' : ordem[Math.max(0, ordem.indexOf(e) - 1)];
    const motivo = await confirmar(`Voltar de "${ETAPAS[e].curto}" para "${ETAPAS[anterior].curto}"?`, { ok: 'Voltar etapa', pedirTexto: 'Motivo' });
    if (!motivo) return;
    try { await tramitar(sol, anterior, {}, 'retorno: ' + motivo); } catch (err) { erro(err); }
  });
}

export function telaDetalheSolicitacao(el, { args, query }) {
  if (aguardando(el, ['solicitacoes', 'servidores', 'secretarias', 'config'])) return { viva: true, titulo: 'Solicitação' };
  const sol = porId('solicitacoes', args[0]);
  if (!sol) { el.innerHTML = '<div class="vazio"><h2>Solicitação não encontrada</h2><p><a href="#/solicitacoes">Voltar</a></p></div>'; return { viva: true, titulo: 'Solicitação' }; }
  const editavel = podeEditarViagem(sol);

  if (query.get('editar') === '1' && editavel) {
    el.innerHTML = cabecalho(`Editar solicitação ${sol.numero}`, `<a class="btn btn-sec" href="#/solicitacoes/${esc(sol.id)}">Voltar</a>`,
      'Ao salvar, o valor é recalculado com os parâmetros atuais da lei.' + (etapaDe(sol) === 'reprovada' ? ' A solicitação volta para análise do Controle Interno.' : '')) + '<div id="form-viagem"></div>';
    montarFormularioViagem($('#form-viagem', el), {
      modo: 'editar', servidores: porId('servidores', sol.servidor_id) ? [sol.servidor_id] : [], solicitacao: sol,
      aoSalvar: async (dados, ids) => {
        const sv = porId('servidores', ids[0]);
        const novo = montarDadosSolicitacao(dados, sv, sol);
        if (Math.abs(novo.valor_total - sol.valor_total) >= 0.005 &&
          !(await confirmar(`O valor da diária vai mudar de ${moeda(sol.valor_total)} para ${moeda(novo.valor_total)}. Confirmar?`, { ok: 'Confirmar alteração' }))) {
          throw new Error('Alteração cancelada.');
        }
        if (etapaDe(sol) === 'reprovada') novo.historico = [...(sol.historico || []), { etapa: 'analise', em: new Date().toISOString(), por: estado.sessao.nome, obs: 'corrigida e reenviada' }];
        await gravarSolicitacao(sol.id, novo);
        await db.registrarLog('solicitacao.editar', { numero: sol.numero, valor_anterior: sol.valor_total, valor_novo: novo.valor_total });
        toast(`Solicitação ${sol.numero} atualizada.`);
        location.hash = '#/solicitacoes/' + sol.id;
      }
    });
    return { titulo: 'Editar ' + sol.numero };
  }

  const reemb = sol.reembolsos || [];
  el.innerHTML = `
    ${cabecalho(`Solicitação ${sol.numero}`, `
      ${pode.verValores() && (sol.calculado || !sol.etapa) ? `<a class="btn" href="#/imprimir/solicitacao/${esc(sol.id)}">🖨 Imprimir</a>` : ''}
      ${editavel ? `<a class="btn btn-sec" href="#/solicitacoes/${esc(sol.id)}?editar=1">✎ Editar viagem</a>` : ''}
      ${podeCancelar(sol) ? '<button class="btn btn-sec" id="cancelar-sol">Cancelar solicitação</button>' : ''}
      ${pode.admin() && sol.status === 'cancelada' ? '<button class="btn btn-sec" id="reativar-sol">Reativar</button>' : ''}
      ${pode.admin() ? '<button class="btn btn-perigo" id="excluir-sol">Excluir</button>' : ''}`,
      `${seloEtapa(sol)} &nbsp; Emitida em ${esc(dataBR(sol.data_solicitacao))}${sol.criado_por?.nome ? ' por ' + esc(sol.criado_por.nome) : ''}`)}
    ${sol.status === 'cancelada' ? `<div class="alerta">Solicitação cancelada${sol.motivo_cancelamento ? ': ' + esc(sol.motivo_cancelamento) : ''}.</div>` : ''}
    ${blocoTramitacao(sol)}
    <div class="grade-detalhe">
      <section class="cartao">
        <h3>Servidor</h3>
        <dl class="dl">
          <dt>Nome</dt><dd>${pode.editar() || pode.verValores() ? `<a href="#/servidores/${esc(sol.servidor_id)}">${esc(sol.servidor?.nome)}</a>` : esc(sol.servidor?.nome)}</dd>
          <dt>CPF</dt><dd>${esc(formatarCpf(sol.servidor?.cpf))}</dd>
          <dt>Cargo/Função</dt><dd>${esc(sol.servidor?.cargo_funcao)}</dd>
          <dt>Categoria</dt><dd>${esc(GRUPOS[sol.servidor?.grupo] || '')}</dd>
          <dt>Chave Pix</dt><dd>${esc(sol.servidor?.chave_pix || '—')}</dd>
          <dt>Secretaria</dt><dd>${esc(sol.secretaria_nome)}</dd>
        </dl>
      </section>
      <section class="cartao">
        <h3>Viagem</h3>
        <dl class="dl">
          <dt>Destino</dt><dd>${esc(sol.destino_cidade)}/${esc(sol.destino_uf)} · ${numeroBR(sol.distancia_km)} km</dd>
          <dt>Saída de ${esc(estado.config.origem.cidade)}</dt><dd>${esc(dataBR(sol.data_hora_saida))}</dd>
          <dt>Chegada em ${esc(estado.config.origem.cidade)}</dt><dd>${esc(dataBR(sol.data_hora_retorno))}</dd>
          <dt>Tempo fora</dt><dd>${horasBR(sol.horas_total ?? (calcularDiaria({ grupo: 'DEMAIS_SERVIDORES', km: 1, saida: sol.data_hora_saida, retorno: sol.data_hora_retorno }).horas_total || 0))} h</dd>
          <dt>Objetivo</dt><dd class="pre">${esc(sol.objetivo)}</dd>
          ${sol.observacoes ? `<dt>Observações</dt><dd class="pre">${esc(sol.observacoes)}</dd>` : ''}
        </dl>
      </section>
      ${pode.verValores() && sol.etapa && !sol.calculado ? `<section class="cartao span-detalhe"><h3>Cálculo</h3>
        <p class="muted">Ainda não calculado. O valor é calculado pela Contabilidade depois da aprovação do Controle Interno.</p></section>` : ''}
      ${pode.verValores() && (sol.calculado || !sol.etapa) ? `<section class="cartao span-detalhe">
        <h3>Cálculo</h3>
        <dl class="dl">
          <dt>Faixa</dt><dd>${esc(sol.faixa_texto)}</dd>
          <dt>Pernoite</dt><dd>${sol.quantidade_pernoite} × ${moeda(sol.valor_pernoite)}</dd>
          <dt>Simples</dt><dd>${sol.quantidade_simples} × ${moeda(sol.valor_simples)}</dd>
          <dt>Alimentação</dt><dd>${sol.quantidade_alimentacao} × ${moeda(sol.valor_alimentacao)}</dd>
          <dt>Total diárias</dt><dd><strong>${moeda(sol.valor_total)}</strong></dd>
          <dt>Reembolsos</dt><dd>${moeda(totalReembolsos(sol))}</dd>
          <dt>Total geral a empenhar</dt><dd><strong class="valor-destaque">${moeda(totalGeral(sol))}</strong></dd>
        </dl>
        <details><summary>Descritivo e justificativa legal</summary>
          <ul class="lista-peq">${(sol.descricao_calculo || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          <ul class="lista-peq">${(sol.justificativa_legal || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        </details>
      </section>` : ''}

    </div>

    ${pode.verValores() ? '' : '<!--'}<section class="cartao">
      <div class="cab-secao"><h3>Reembolsos da viagem</h3>
        ${pode.contabil() ? '<button class="btn btn-peq" id="add-reemb">＋ Lançar reembolso</button>' : ''}</div>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Tipo</th><th>Nota (nº/série)</th><th>Data</th><th class="num">Valor</th><th>Empenho</th><th>Descrição</th><th></th></tr></thead>
        <tbody>${reemb.map(r => `<tr>
          <td>${esc(r.tipo)}</td><td>${esc(r.numero_nota || '—')}${r.serie_nota ? ' / ' + esc(r.serie_nota) : ''}${r.chave_nota ? `<small class="muted bloco chave-nota" title="Chave da nota">${esc(r.chave_nota)}</small>${botoesNota(r.chave_nota)}` : ''}</td>
          <td>${esc(dataBR(r.data_nota))}</td><td class="num">${moeda(r.valor)}</td>
          <td>${esc(r.numero_empenho || '—')}${r.data_empenho ? `<small class="muted bloco">${esc(dataBR(r.data_empenho))}</small>` : ''}</td>
          <td>${esc(r.descricao || '')}</td>
          <td class="acoes-linha">
            <a class="btn btn-sec btn-peq" href="#/imprimir/reembolso/${esc(sol.id)}/${esc(r.id)}" title="Imprimir formulário">🖨</a>
            ${pode.contabil() ? `<button class="btn btn-sec btn-peq" data-editar-r="${esc(r.id)}" title="Editar">✎</button>
            <button class="btn btn-perigo btn-peq" data-excluir-r="${esc(r.id)}" title="Excluir">✕</button>` : ''}
          </td></tr>`).join('') || '<tr><td colspan="7" class="vazio-linha">Nenhum reembolso lançado nesta viagem.</td></tr>'}</tbody>
        ${reemb.length ? `<tfoot><tr><td colspan="3">Total dos reembolsos</td><td class="num"><strong>${moeda(totalReembolsos(sol))}</strong></td><td colspan="3"></td></tr>
          ${sol.calculado || !sol.etapa ? `<tr><td colspan="3">Total geral (diárias ${moeda(sol.valor_total)} + reembolsos)</td><td class="num"><strong>${moeda(totalGeral(sol))}</strong></td><td colspan="3"></td></tr>` : ''}</tfoot>` : ''}
      </table></div>
    </section>${pode.verValores() ? '' : '-->'}`;

  ligarTramitacao(el, sol);
  ligarBotoesNota(el);
  $('#add-reemb', el)?.addEventListener('click', () => formReembolso(sol, null));
  $$('[data-editar-r]', el).forEach(b => b.onclick = () => formReembolso(sol, reemb.find(r => r.id === b.dataset.editarR)));
  $$('[data-excluir-r]', el).forEach(b => b.onclick = async () => {
    const r = reemb.find(x => x.id === b.dataset.excluirR);
    if (!(await confirmar(`Excluir o reembolso de ${r.tipo} (${moeda(r.valor)})?`, { perigo: true, ok: 'Excluir' }))) return;
    const lista = reemb.filter(x => x.id !== r.id);
    try {
      await db.salvar('valores', sol.id, { reembolsos: lista, total_reembolsos: soma(lista) });
      await db.registrarLog('reembolso.excluir', { numero: sol.numero, tipo: r.tipo, valor: r.valor });
      toast('Reembolso excluído.');
    } catch (err) { toast(mensagemErro(err), 'erro'); }
  });
  $('#cancelar-sol', el)?.addEventListener('click', async () => {
    const motivo = await confirmar(`Cancelar a solicitação ${sol.numero}? Ela continua registrada (o número não é reutilizado), mas deixa de contar nos totais.`, { titulo: 'Cancelar solicitação', ok: 'Cancelar solicitação', perigo: true, pedirTexto: 'Motivo do cancelamento' });
    if (!motivo) return;
    try {
      await db.atualizar('solicitacoes', sol.id, { status: 'cancelada', motivo_cancelamento: motivo, historico: [...(sol.historico || []), { etapa: etapaDe(sol), em: new Date().toISOString(), por: estado.sessao.nome, obs: 'CANCELADA: ' + motivo }] });
      await db.registrarLog('solicitacao.cancelar', { numero: sol.numero, motivo });
      toast('Solicitação cancelada.');
    } catch (err) { toast(mensagemErro(err), 'erro'); }
  });
  $('#reativar-sol', el)?.addEventListener('click', async () => {
    try {
      await db.atualizar('solicitacoes', sol.id, { status: 'emitida', motivo_cancelamento: '' });
      await db.registrarLog('solicitacao.reativar', { numero: sol.numero });
      toast('Solicitação reativada.');
    } catch (err) { toast(mensagemErro(err), 'erro'); }
  });
  $('#excluir-sol', el)?.addEventListener('click', async () => {
    if (!(await confirmar(`Excluir DEFINITIVAMENTE a solicitação ${sol.numero} e seus reembolsos? Prefira "Cancelar" para manter o histórico.`, { perigo: true, ok: 'Excluir definitivamente' }))) return;
    try {
      await db.excluir('solicitacoes', sol.id);
      await db.registrarLog('solicitacao.excluir', { numero: sol.numero, servidor: sol.servidor?.nome, valor: sol.valor_total });
      toast('Solicitação excluída.');
      location.hash = '#/solicitacoes';
    } catch (err) { toast(mensagemErro(err), 'erro'); }
  });
  return { viva: true, titulo: 'Solicitação ' + sol.numero };
}

const soma = lista => Math.round(lista.reduce((t, r) => t + Number(r.valor || 0), 0) * 100) / 100;

function formReembolso(sol, r) {
  const tipos = estado.config.tipos_despesa || [];
  const m = modal({
    titulo: r ? 'Editar reembolso' : 'Lançar reembolso', largura: 720,
    corpo: `<form id="fr" class="grade-2" novalidate>
      <label class="campo"><span>Tipo de despesa</span><select name="tipo" required><option value="">Selecione</option>
        ${[...new Set([...tipos, ...(r && !tipos.includes(r.tipo) ? [r.tipo] : [])])].map(t => `<option ${r?.tipo === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label class="campo"><span>Valor (R$)</span><input type="number" step="0.01" min="0.01" name="valor" value="${esc(r?.valor ?? '')}" required></label>
      <label class="campo span-2"><span>Chave de acesso da nota (44 dígitos) — NF-e, NFC-e (modelo 65), CT-e…</span><input name="chave_nota" maxlength="400" inputmode="numeric" value="${esc(r?.chave_nota || '')}" placeholder="Digite ou cole a chave (ou leia o QR Code do cupom)">
        <span class="dica" id="info-chave"></span></label>
      <label class="campo"><span>Nº da nota</span><input name="numero_nota" value="${esc(r?.numero_nota || '')}"></label>
      <label class="campo"><span>Série</span><input name="serie_nota" value="${esc(r?.serie_nota || '')}"></label>
      <label class="campo"><span>Data da nota</span><input type="date" name="data_nota" value="${esc(r?.data_nota || '')}"></label>
      <span></span>
      <label class="campo"><span>Nº do empenho</span><input name="numero_empenho" value="${esc(r?.numero_empenho || '')}"></label>
      <label class="campo"><span>Data do empenho</span><input type="date" name="data_empenho" value="${esc(r?.data_empenho || '')}"></label>
      <label class="campo span-2"><span>Descrição</span><input name="descricao" maxlength="300" value="${esc(r?.descricao || '')}"></label>
      <p class="erro-form span-2" id="erro-fr"></p>
      <div class="acoes-form span-2"><button type="button" class="btn btn-sec" data-cancelar>Cancelar</button><button class="btn" type="submit">Salvar</button></div>
    </form>`
  });
  const f = $('#fr', m.el);
  f.querySelector('[data-cancelar]').onclick = m.fechar;
  // Preenche nº/série a partir da chave da NF-e (posições 23-25 série, 26-34 número).
  const mostrarChave = () => {
    // aceita também o link do QR Code da NFC-e (p=CHAVE|...)
    const bruto = f.chave_nota.value, doQr = bruto.match(/[?&]p=(\d{44})/);
    const ch = doQr ? doQr[1] : bruto.replace(/\D/g, '');
    const info = lerChave(ch);
    const alvo = $('#info-chave', m.el);
    if (!ch) { alvo.innerHTML = ''; return; }
    if (!info) { alvo.textContent = `${ch.length} de 44 dígitos.`; return; }
    if (f.chave_nota.value !== ch) f.chave_nota.value = ch;
    if (!f.serie_nota.value) f.serie_nota.value = info.serie;
    if (!f.numero_nota.value) f.numero_nota.value = info.numero;
    alvo.innerHTML = `${info.valida ? '✓' : '⚠'} ${esc(info.modeloNome)} nº ${esc(info.numero)} série ${esc(info.serie)} · emitida em ${esc(info.emissao)} · CNPJ ${esc(info.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'))}
      ${info.valida ? '' : '<strong class="erro-txt"> — dígito verificador não confere, confira a chave</strong>'}<br>${botoesNota(ch)}`;
    ligarBotoesNota(alvo);
  };
  f.chave_nota.addEventListener('input', mostrarChave);
  mostrarChave();
  f.onsubmit = async e => {
    e.preventDefault();
    const d = lerForm(f);
    const erro = $('#erro-fr', m.el);
    if (!d.tipo) return (erro.textContent = 'Selecione o tipo de despesa.');
    if (!(Number(d.valor) > 0)) return (erro.textContent = 'Informe um valor maior que zero.');
    if (d.chave_nota && d.chave_nota.replace(/\D/g, '').length !== 44) return (erro.textContent = 'A chave da nota deve ter 44 dígitos (ou deixe em branco).');
    const item = { ...d, valor: Math.round(Number(d.valor) * 100) / 100, chave_nota: d.chave_nota.replace(/\D/g, ''), id: r?.id || ('r' + Date.now().toString(36)), lancado_em: r?.lancado_em || new Date().toISOString() };
    const lista = r ? (sol.reembolsos || []).map(x => x.id === r.id ? item : x) : [...(sol.reembolsos || []), item];
    try {
      await db.salvar('valores', sol.id, { reembolsos: lista, total_reembolsos: soma(lista) });
      await db.registrarLog(r ? 'reembolso.editar' : 'reembolso.lancar', { numero: sol.numero, tipo: item.tipo, valor: item.valor });
      toast(r ? 'Reembolso atualizado.' : 'Reembolso lançado.');
      m.fechar();
    } catch (err) { erro.textContent = mensagemErro(err); }
  };
}
