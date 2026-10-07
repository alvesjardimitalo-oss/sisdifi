// SISDIFI — Servidores: lista, cadastro/edição e perfil
import * as db from '../db.js';
import { estado, pode, porId, secretariaNome, totalReembolsos, ativas, ehSecretaria } from '../estado.js';
import { GRUPOS, formatarCpf, limparCpf, cpfValido, moeda, analisarPix } from '../calculo.js';
import { esc, $, $$, toast, modal, dataBR, numeroBR, normalizar, lerForm, mensagemErro, baixarArquivo, csv, hojeISO } from '../ui.js';
import { aguardando, cabecalho, selo, opcoesSecretarias, anosDisponiveis, MESES } from './comum.js';

const filtros = { busca: '', secretaria: '', status: '1', grupo: '', pix: '', ordem: 'az', pagina: 1 };

export function telaServidores(el) {
  if (aguardando(el, ['servidores', 'secretarias'])) return { viva: true, titulo: 'Servidores' };
  const t = normalizar(filtros.busca), dig = limparCpf(filtros.busca);
  let lista = estado.servidores.filter(s =>
    (filtros.status === '' || String(s.ativo === false ? 0 : 1) === filtros.status) &&
    (!filtros.secretaria || s.secretaria_id === filtros.secretaria) &&
    (!filtros.grupo || s.grupo === filtros.grupo) &&
    (filtros.pix !== 'sem' || !s.chave_pix) &&
    (!t || normalizar(s.nome).includes(t) || normalizar(s.cargo_funcao).includes(t) || (dig.length >= 3 && String(s.cpf).includes(dig))));
  const ord = {
    az: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
    za: (a, b) => b.nome.localeCompare(a.nome, 'pt-BR'),
    cargo: (a, b) => a.cargo_funcao.localeCompare(b.cargo_funcao, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'),
    secretaria: (a, b) => secretariaNome(a.secretaria_id).localeCompare(secretariaNome(b.secretaria_id), 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR')
  };
  lista = [...lista].sort(ord[filtros.ordem] || ord.az);
  const porPagina = 30, paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  filtros.pagina = Math.min(filtros.pagina, paginas);
  const pagina = lista.slice((filtros.pagina - 1) * porPagina, filtros.pagina * porPagina);
  const cpfsInvalidos = estado.servidores.filter(s => s.ativo !== false && !cpfValido(s.cpf)).length;
  const semPix = estado.servidores.filter(s => s.ativo !== false && !s.chave_pix).length;

  el.innerHTML = `
    ${cabecalho('Servidores', `<button class="btn btn-sec" id="exp-sv">⭳ Exportar</button>${pode.editar() ? '<button class="btn" id="novo-sv">＋ Novo servidor</button>' : ''}`)}
    ${semPix ? `<div class="alerta">⚠ ${semPix} servidor(es) ativo(s) sem chave Pix. Use o filtro "Pix" → "Sem chave Pix" e clique em "＋ Pix" para completar.</div>` : ''}
    ${cpfsInvalidos ? `<div class="alerta">⚠ ${cpfsInvalidos} servidor(es) ativo(s) com CPF de dígito verificador inválido. Use o filtro "CPF inválido" para conferir.</div>` : ''}
    <form class="filtros" id="filtros-sv">
      <label class="campo cresce"><span>Buscar</span><input type="search" name="busca" value="${esc(filtros.busca)}" placeholder="Nome, CPF ou cargo"></label>
      <label class="campo"><span>Secretaria</span><select name="secretaria">${opcoesSecretarias(filtros.secretaria, { incluirInativas: true, vazio: 'Todas' })}</select></label>
      <label class="campo"><span>Categoria</span><select name="grupo"><option value="">Todas</option>${Object.entries(GRUPOS).map(([k, v]) => `<option value="${k}" ${filtros.grupo === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label class="campo"><span>Situação</span><select name="status">
        <option value="1" ${filtros.status === '1' ? 'selected' : ''}>Ativos</option><option value="0" ${filtros.status === '0' ? 'selected' : ''}>Inativos</option>
        <option value="" ${filtros.status === '' ? 'selected' : ''}>Todos</option></select></label>
      <label class="campo"><span>Pix</span><select name="pix"><option value="">Todos</option><option value="sem" ${filtros.pix === 'sem' ? 'selected' : ''}>Sem chave Pix</option></select></label>
      <label class="campo"><span>Ordenar</span><select name="ordem">
        ${[['az', 'Nome A-Z'], ['za', 'Nome Z-A'], ['cargo', 'Cargo'], ['secretaria', 'Secretaria']].map(([v, n]) => `<option value="${v}" ${filtros.ordem === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    </form>
    <div class="resumo-linha"><span><strong>${lista.length}</strong> servidor(es)</span></div>
    <div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Nome</th><th>CPF</th><th>Chave Pix</th><th>Cargo/Função</th><th>Categoria</th><th>Secretaria</th><th>Situação</th><th></th></tr></thead>
      <tbody>${pagina.map(s => `<tr class="clicavel" data-id="${esc(s.id)}">
        <td><strong>${esc(s.nome)}</strong></td>
        <td>${esc(formatarCpf(s.cpf))}${cpfValido(s.cpf) ? '' : ' <span class="selo selo-cancelada" title="Dígito verificador inválido">CPF inválido</span>'}</td>
        <td>${s.chave_pix ? esc(s.chave_pix) : `<span class="selo selo-pendente">sem Pix</span>`}${podeAlterarPix(s) ? ` <button class="btn btn-sec btn-peq" data-parar data-pix="${esc(s.id)}" title="${s.chave_pix ? 'Alterar' : 'Adicionar'} chave Pix">${s.chave_pix ? '✎' : '＋ Pix'}</button>` : ''}</td>
        <td>${esc(s.cargo_funcao)}</td><td>${esc(GRUPOS[s.grupo] || '')}</td><td>${esc(secretariaNome(s.secretaria_id) || '—')}</td>
        <td>${s.ativo === false ? '<span class="selo selo-cancelada">Inativo</span>' : '<span class="selo selo-emitida">Ativo</span>'}</td>
        <td class="acoes-linha">${pode.solicitar() && s.ativo !== false ? `<a class="btn btn-peq" data-parar href="#/solicitacoes/nova?servidor=${esc(s.id)}">＋ Diária</a>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="8" class="vazio-linha">Nenhum servidor encontrado.</td></tr>'}</tbody>
    </table></div>
    ${paginas > 1 ? `<div class="paginacao">${Array.from({ length: paginas }, (_, i) => `<button class="btn btn-peq ${i + 1 === filtros.pagina ? '' : 'btn-sec'}" data-pag="${i + 1}">${i + 1}</button>`).join('')}</div>` : ''}`;

  const f = $('#filtros-sv', el);
  let tm;
  f.oninput = () => {
    clearTimeout(tm);
    tm = setTimeout(() => {
      Object.assign(filtros, lerForm(f), { pagina: 1 });
      const ativo = document.activeElement?.name, pos = document.activeElement?.selectionStart;
      telaServidores(el);
      const n = ativo && $(`#filtros-sv [name="${ativo}"]`, el);
      if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch { /* select */ } }
    }, 200);
  };
  f.onsubmit = e => e.preventDefault();
  $$('[data-pag]', el).forEach(b => b.onclick = () => { filtros.pagina = Number(b.dataset.pag); telaServidores(el); });
  $$('tr[data-id]', el).forEach(tr => tr.onclick = e => { if (!e.target.closest('[data-parar]')) location.hash = '#/servidores/' + tr.dataset.id; });
  $('#novo-sv', el)?.addEventListener('click', () => formServidor(null));
  $$('[data-pix]', el).forEach(b => b.onclick = ev => { ev.stopPropagation(); formPix(porId('servidores', b.dataset.pix)); });
  $('#exp-sv', el).onclick = () => baixarArquivo(`servidores-${hojeISO()}.csv`, csv([
    ['Nome', 'CPF', 'Chave Pix', 'Cargo/Função', 'Categoria', 'Secretaria', 'Situação'],
    ...lista.map(s => [s.nome, formatarCpf(s.cpf), s.chave_pix, s.cargo_funcao, GRUPOS[s.grupo], secretariaNome(s.secretaria_id), s.ativo === false ? 'Inativo' : 'Ativo'])]));
  return { viva: true, titulo: 'Servidores' };
}

/**
 * Cadastro/edição de servidor.
 * opcoes.rapido: cadastro feito de dentro da solicitação (não navega; chama aoSalvar(id)).
 * opcoes.secretariaFixa: lotação definida (usuário de Secretaria).
 */
export function formServidor(s, { rapido = false, inicial = {}, secretariaFixa = null, aoSalvar = null } = {}) {
  const v = { ...inicial, ...(s || {}) };
  const fixa = secretariaFixa !== null && secretariaFixa !== '' && !s;
  const m = modal({
    titulo: s ? 'Editar servidor' : 'Cadastrar servidor', largura: 680,
    corpo: `<form id="fsv" class="grade-2" novalidate>
      ${rapido ? '<p class="span-2 muted">O servidor fica cadastrado no banco e é incluído nesta solicitação.</p>' : ''}
      <label class="campo span-2"><span>Nome completo *</span><input name="nome" value="${esc(v.nome || '')}" required maxlength="150"></label>
      <label class="campo"><span>CPF *</span><input name="cpf" value="${esc(formatarCpf(v.cpf || ''))}" inputmode="numeric" maxlength="14" required></label>
      <label class="campo"><span>Chave Pix * <small class="muted" id="pix-tipo"></small></span><input name="chave_pix" value="${esc(v.chave_pix || '')}" maxlength="120" required placeholder="CPF, e-mail, telefone ou chave aleatória"></label>
      <label class="campo"><span>Cargo/Função *</span><input name="cargo_funcao" value="${esc(v.cargo_funcao || '')}" required maxlength="120"></label>
      <label class="campo"><span>Enquadramento do cargo (Anexo I) *</span><select name="grupo" required>
        ${Object.entries(GRUPOS).map(([k, n]) => `<option value="${k}" ${(v.grupo || 'DEMAIS_SERVIDORES') === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      ${fixa
        ? `<input type="hidden" name="secretaria_id" value="${esc(secretariaFixa)}">`
        : `<label class="campo"><span>Secretaria de lotação</span><select name="secretaria_id">${opcoesSecretarias(v.secretaria_id || secretariaFixa || '', { vazio: '— Nenhuma —' })}</select></label>`}
      ${rapido ? '<input type="hidden" name="ativo" value="1">' : `<label class="campo"><span>Situação</span><select name="ativo"><option value="1" ${v.ativo === false ? '' : 'selected'}>Ativo</option><option value="0" ${v.ativo === false ? 'selected' : ''}>Inativo</option></select></label>`}
      <p class="erro-form span-2" id="erro-sv"></p>
      <div class="acoes-form span-2"><button type="button" class="btn btn-sec" data-cancelar>Cancelar</button><button class="btn" type="submit">${rapido ? 'Cadastrar e incluir' : 'Salvar'}</button></div>
    </form>`
  });
  const f = $('#fsv', m.el);
  f.querySelector('[data-cancelar]').onclick = m.fechar;
  f.cpf.addEventListener('input', () => { const c = limparCpf(f.cpf.value).slice(0, 11); f.cpf.value = c.length === 11 ? formatarCpf(c) : c; });
  const tipoPix = () => { const p = analisarPix(f.chave_pix.value); $('#pix-tipo', m.el).textContent = p.ok ? '· ' + p.tipo : ''; };
  f.chave_pix.addEventListener('input', tipoPix); tipoPix();
  f.onsubmit = async e => {
    e.preventDefault();
    const d = lerForm(f);
    const erro = $('#erro-sv', m.el);
    const cpf = limparCpf(d.cpf);
    if (!d.nome || !cpf || !d.cargo_funcao || !d.grupo || !d.chave_pix) return (erro.textContent = 'Preencha os campos obrigatórios (*), inclusive a chave Pix.');
    const pix = analisarPix(d.chave_pix);
    if (!pix.ok) return (erro.textContent = 'Chave Pix inválida. Use CPF, CNPJ, e-mail, telefone com DDD ou chave aleatória.');
    d.chave_pix = pix.valor;
    if (!cpfValido(cpf)) return (erro.textContent = 'CPF inválido: confira os números (dígito verificador não confere).');
    const dup = estado.servidores.find(x => x.cpf === cpf && x.id !== s?.id);
    if (dup) {
      if (rapido && aoSalvar && dup.ativo !== false) { toast(`${dup.nome} já estava cadastrado — incluído na solicitação.`, 'aviso'); m.fechar(); aoSalvar(dup.id); return; }
      return (erro.textContent = `Já existe servidor com este CPF: ${dup.nome}${dup.ativo === false ? ' (inativo — peça à Contabilidade para reativar)' : ''}.`);
    }
    const dados = { nome: d.nome.replace(/\s+/g, ' ').trim(), cpf, chave_pix: d.chave_pix, cargo_funcao: d.cargo_funcao, grupo: d.grupo, secretaria_id: d.secretaria_id || null, ativo: d.ativo === '1' };
    try {
      const id = await db.salvar('servidores', s?.id || null, dados);
      await db.registrarLog(s ? 'servidor.editar' : 'servidor.criar', { nome: dados.nome, ...(s && s.grupo !== dados.grupo ? { categoria_anterior: s.grupo, categoria_nova: dados.grupo } : {}) });
      toast(s ? 'Servidor atualizado.' : 'Servidor cadastrado.');
      m.fechar();
      if (aoSalvar) aoSalvar(id);
      else if (!s) location.hash = '#/servidores/' + id;
    } catch (err) { erro.textContent = mensagemErro(err); }
  };
}

/** Quem pode alterar a chave Pix: Contabilidade/admin sempre; Secretaria se o servidor não tem Pix ou é da secretaria dela. */
export function podeAlterarPix(sv) {
  if (!sv) return false;
  if (pode.editar()) return true;
  return ehSecretaria() && (!sv.chave_pix || sv.secretaria_id === estado.sessao.secretaria_id);
}

/** Janela para incluir/alterar só a chave Pix de um servidor já cadastrado. */
export function formPix(sv, aoSalvar = null) {
  const m = modal({
    titulo: (sv.chave_pix ? 'Alterar' : 'Adicionar') + ' chave Pix', largura: 480,
    corpo: `<form id="fpix" novalidate>
      <p><strong>${esc(sv.nome)}</strong><br><small class="muted">${esc(formatarCpf(sv.cpf))} · ${esc(sv.cargo_funcao)}</small></p>
      ${sv.chave_pix ? `<p class="muted">Chave atual: ${esc(sv.chave_pix)}</p>` : ''}
      <label class="campo"><span>Chave Pix <small class="muted" id="fpix-tipo"></small></span><input name="chave_pix" value="${esc(sv.chave_pix || '')}" maxlength="120" required placeholder="CPF, e-mail, telefone ou chave aleatória"></label>
      <p class="dica">A chave deve estar no nome do próprio servidor.</p>
      <p class="erro-form" id="erro-pix"></p>
      <div class="acoes-form"><button type="button" class="btn btn-sec" data-cancelar>Cancelar</button><button class="btn" type="submit">Salvar</button></div>
    </form>`
  });
  const f = $('#fpix', m.el);
  f.querySelector('[data-cancelar]').onclick = m.fechar;
  const tipo = () => { const p = analisarPix(f.chave_pix.value); $('#fpix-tipo', m.el).textContent = p.ok ? '· ' + p.tipo : ''; };
  f.chave_pix.addEventListener('input', tipo); tipo();
  f.onsubmit = async e => {
    e.preventDefault();
    const p = analisarPix(f.chave_pix.value);
    if (!p.ok) return ($('#erro-pix', m.el).textContent = 'Chave Pix inválida. Use CPF, CNPJ, e-mail, telefone com DDD ou chave aleatória.');
    try {
      await db.atualizar('servidores', sv.id, { chave_pix: p.valor });
      await db.registrarLog('servidor.pix', { nome: sv.nome, antes: sv.chave_pix || '', depois: p.valor });
      toast('Chave Pix salva.');
      m.fechar();
      aoSalvar && aoSalvar(p.valor);
    } catch (err) { $('#erro-pix', m.el).textContent = mensagemErro(err); }
  };
}

// =============================================================
// PERFIL
// =============================================================
const filtroPerfil = { mes: '', ano: '' };

export function telaPerfilServidor(el, { args }) {
  if (aguardando(el, ['servidores', 'secretarias', 'solicitacoes'])) return { viva: true, titulo: 'Servidor' };
  const s = porId('servidores', args[0]);
  if (!s) { el.innerHTML = '<div class="vazio"><h2>Servidor não encontrado</h2><p><a href="#/servidores">Voltar</a></p></div>'; return { viva: true, titulo: 'Servidor' }; }
  const todas = estado.solicitacoes.filter(x => x.servidor_id === s.id);
  const doPeriodo = todas.filter(x =>
    (!filtroPerfil.ano || String(x.data_hora_saida).startsWith(filtroPerfil.ano)) &&
    (!filtroPerfil.mes || String(x.data_hora_saida).slice(5, 7) === filtroPerfil.mes.padStart(2, '0')));
  const validas = ativas(doPeriodo);
  const tDiarias = validas.reduce((t, x) => t + Number(x.valor_total || 0), 0);
  const tReemb = validas.reduce((t, x) => t + totalReembolsos(x), 0);
  const destinos = [...new Set(todas.slice(0, 20).map(x => `${x.destino_cidade}/${x.destino_uf}`))].slice(0, 5);

  el.innerHTML = `
    ${cabecalho(s.nome, `
      ${pode.solicitar() && s.ativo !== false ? `<a class="btn" href="#/solicitacoes/nova?servidor=${esc(s.id)}">＋ Nova solicitação</a>` : ''}
      ${pode.verValores() ? `<a class="btn btn-sec" href="#/imprimir/servidor/${esc(s.id)}?mes=${esc(filtroPerfil.mes)}&ano=${esc(filtroPerfil.ano)}">🖨 Relatório</a>` : ''}
      ${pode.editar() ? '<button class="btn btn-sec" id="editar-sv">✎ Editar cadastro</button>' : ''}`,
      `${s.ativo === false ? '<span class="selo selo-cancelada">Inativo</span> ' : ''}${esc(s.cargo_funcao)} · ${esc(GRUPOS[s.grupo] || '')}`)}
    <div class="grade-detalhe">
      <section class="cartao"><h3>Cadastro</h3><dl class="dl">
        <dt>CPF</dt><dd>${esc(formatarCpf(s.cpf))}${cpfValido(s.cpf) ? '' : ' <span class="selo selo-cancelada">CPF inválido</span>'}</dd>
        <dt>Chave Pix</dt><dd>${esc(s.chave_pix || '—')} ${podeAlterarPix(s) ? `<button class="link link-peq" id="perfil-pix">${s.chave_pix ? 'alterar' : 'adicionar'}</button>` : ''}</dd>
        <dt>Secretaria</dt><dd>${esc(secretariaNome(s.secretaria_id) || '—')}</dd>
        <dt>Últimos destinos</dt><dd>${esc(destinos.join(', ') || '—')}</dd>
      </dl></section>
      <section class="cartao">
        <h3>Período</h3>
        <form class="grade-2" id="filtro-perfil">
          <label class="campo"><span>Mês</span><select name="mes"><option value="">Todos</option>${MESES.map((m, i) => `<option value="${i + 1}" ${String(i + 1) === filtroPerfil.mes ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
          <label class="campo"><span>Ano</span><select name="ano"><option value="">Todos</option>${anosDisponiveis().map(a => `<option ${String(a) === filtroPerfil.ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        </form>
        <div class="kpis kpis-peq">
          <div class="kpi"><span>Viagens</span><strong>${validas.length}</strong></div>
          ${pode.verValores() ? `<div class="kpi"><span>Diárias</span><strong>${moeda(tDiarias)}</strong></div>
          <div class="kpi"><span>Reembolsos</span><strong>${moeda(tReemb)}</strong></div>
          <div class="kpi"><span>Total</span><strong>${moeda(tDiarias + tReemb)}</strong></div>` : ''}
        </div>
      </section>
    </div>
    <section class="cartao">
      <h3>Viagens</h3>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Nº</th><th>Destino</th><th>Saída</th><th>Retorno</th>${pode.verValores() ? '<th class="num">Diárias</th><th class="num">Reemb.</th>' : ''}<th>Empenho</th><th>Situação</th></tr></thead>
        <tbody>${doPeriodo.map(x => `<tr class="clicavel" data-id="${esc(x.id)}">
          <td><strong>${esc(x.numero)}</strong></td><td>${esc(x.destino_cidade)}/${esc(x.destino_uf)}</td>
          <td>${esc(dataBR(x.data_hora_saida))}</td><td>${esc(dataBR(x.data_hora_retorno))}</td>
          ${pode.verValores() ? `<td class="num">${moeda(x.valor_total)}</td><td class="num">${totalReembolsos(x) ? moeda(totalReembolsos(x)) : '—'}</td>` : ''}
          <td>${esc(x.numero_empenho || '—')}</td><td>${selo(x.status)}</td></tr>`).join('') || '<tr><td colspan="8" class="vazio-linha">Nenhuma viagem no período.</td></tr>'}</tbody>
      </table></div>
    </section>`;
  $('#filtro-perfil', el).onchange = e => { Object.assign(filtroPerfil, lerForm(e.currentTarget)); telaPerfilServidor(el, { args }); };
  $$('tr[data-id]', el).forEach(tr => tr.onclick = () => { location.hash = '#/solicitacoes/' + tr.dataset.id; });
  $('#editar-sv', el)?.addEventListener('click', () => formServidor(s));
  $('#perfil-pix', el)?.addEventListener('click', () => formPix(s));
  return { viva: true, titulo: s.nome };
}
