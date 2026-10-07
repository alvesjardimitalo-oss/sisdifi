// SISDIFI — Servidores: lista, cadastro/edição e perfil
import * as db from '../db.js';
import { estado, pode, porId, secretariaNome, totalReembolsos, ativas, ehSecretaria, acessoRestrito, etapaDe } from '../estado.js';
import { GRUPOS, formatarCpf, limparCpf, cpfValido, moeda, analisarPix } from '../calculo.js';
import { esc, $, $$, toast, modal, confirmar, dataBR, numeroBR, normalizar, lerForm, mensagemErro, baixarArquivo, csv, hojeISO } from '../ui.js';
import { aguardando, cabecalho, selo, opcoesSecretarias, anosDisponiveis, MESES } from './comum.js';
import { extrairLinhas } from '../orcamento-pdf.js';
import { temPix, cpfOk, cpfExibir, pixExibir, cargoMotorista, pixEhCpf, codigoTipoPix } from '../privacidade.js';
import { analisarFolha, cruzarFolha, cargoDaFolha } from '../folha-pdf.js';
import { analisarRelacaoServidores, compararComCadastro, secretariaDaLotacao, grupoSugerido, nomeProprio, SITUACOES } from '../servidores-pdf.js';

const filtros = { busca: '', secretaria: '', status: '1', grupo: '', pix: '', ordem: 'az', pagina: 1 };

export function telaServidores(el) {
  if (aguardando(el, ['servidores', 'secretarias'])) return { viva: true, titulo: 'Servidores' };
  const t = normalizar(filtros.busca), dig = limparCpf(filtros.busca);
  let lista = estado.servidores.filter(s =>
    (filtros.status === '' || String(s.ativo === false ? 0 : 1) === filtros.status) &&
    (!filtros.secretaria || s.secretaria_id === filtros.secretaria) &&
    (!filtros.grupo || s.grupo === filtros.grupo) &&
    (filtros.pix !== 'sem' || !temPix(s)) && (filtros.pix !== 'semcargo' || !s.cargo_funcao) &&
    (!t || normalizar(s.nome).includes(t) || normalizar(s.cargo_funcao).includes(t) || (dig.length >= 3 && String(s.cpf || '').includes(dig))));
  const ord = {
    az: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
    za: (a, b) => b.nome.localeCompare(a.nome, 'pt-BR'),
    cargo: (a, b) => String(a.cargo_funcao || '').localeCompare(b.cargo_funcao, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'),
    secretaria: (a, b) => secretariaNome(a.secretaria_id).localeCompare(secretariaNome(b.secretaria_id), 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR')
  };
  lista = [...lista].sort(ord[filtros.ordem] || ord.az);
  const porPagina = 30, paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  filtros.pagina = Math.min(filtros.pagina, paginas);
  const pagina = lista.slice((filtros.pagina - 1) * porPagina, filtros.pagina * porPagina);
  const cpfsInvalidos = estado.servidores.filter(s => s.ativo !== false && !cpfOk(s)).length;
  const semPix = estado.servidores.filter(s => s.ativo !== false && !temPix(s)).length;
  const semCargo = estado.servidores.filter(s => s.ativo !== false && !s.cargo_funcao).length;

  el.innerHTML = `
    ${cabecalho('Servidores', `${ehSecretaria() ? '' : '<button class="btn btn-sec" id="exp-sv">⭳ Exportar</button>'}${pode.editar() ? '<button class="btn btn-sec" id="revisar-cat">⚖ Revisar categorias</button><button class="btn btn-sec" id="importar-rel">📄 Importar relação (PDF)</button><button class="btn btn-sec" id="importar-folha">📄 Atualizar pela folha (PDF)</button>' : ''}${pode.solicitar() ? '<button class="btn" id="novo-sv">＋ Novo servidor</button>' : ''}`,
      ehSecretaria() ? 'Aqui aparecem os servidores da sua secretaria e os motoristas de todas as secretarias. Complete a chave Pix e o cargo de quem estiver pendente, ou cadastre um servidor novo.' : '')}
    ${semPix ? `<div class="alerta">⚠ ${semPix} servidor(es) ativo(s) sem chave Pix. Use o filtro "Pendências" → "Sem chave Pix" e clique no botão "＋" da linha para completar.${pode.editar() ? ' <button type="button" class="btn btn-sec btn-peq" id="pix-cpf-lote">Usar o CPF como chave Pix</button>' : ''}</div>` : ''}
    ${semCargo ? `<div class="alerta">⚠ ${semCargo} servidor(es) ativo(s) sem cargo/função informado. Use o filtro "Pendências" → "Sem cargo" e clique no botão "＋" da linha.${pode.editar() ? ' <button type="button" class="btn btn-sec btn-peq" id="inativar-sem-cargo">Inativar os sem cargo</button>' : ''}</div>` : ''}
    ${cpfsInvalidos && !ehSecretaria() ? `<div class="alerta">⚠ ${cpfsInvalidos} servidor(es) ativo(s) com CPF de dígito verificador inválido. Eles aparecem marcados como "CPF inválido" na lista.</div>` : ''}
    <form class="filtros" id="filtros-sv">
      <label class="campo cresce"><span>Buscar</span><input type="search" name="busca" value="${esc(filtros.busca)}" placeholder="Nome, CPF ou cargo"></label>
      <label class="campo"><span>Secretaria</span><select name="secretaria">${opcoesSecretarias(filtros.secretaria, { incluirInativas: true, vazio: 'Todas' })}</select></label>
      <label class="campo"><span>Categoria</span><select name="grupo"><option value="">Todas</option>${Object.entries(GRUPOS).map(([k, v]) => `<option value="${k}" ${filtros.grupo === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label class="campo"><span>Situação</span><select name="status">
        <option value="1" ${filtros.status === '1' ? 'selected' : ''}>Ativos</option><option value="0" ${filtros.status === '0' ? 'selected' : ''}>Inativos</option>
        <option value="" ${filtros.status === '' ? 'selected' : ''}>Todos</option></select></label>
      <label class="campo"><span>Pendências</span><select name="pix"><option value="">Todos</option><option value="sem" ${filtros.pix === 'sem' ? 'selected' : ''}>Sem chave Pix</option><option value="semcargo" ${filtros.pix === 'semcargo' ? 'selected' : ''}>Sem cargo</option></select></label>
      <label class="campo"><span>Ordenar</span><select name="ordem">
        ${[['az', 'Nome A-Z'], ['za', 'Nome Z-A'], ['cargo', 'Cargo'], ['secretaria', 'Secretaria']].map(([v, n]) => `<option value="${v}" ${filtros.ordem === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    </form>
    <div class="resumo-linha"><span><strong>${lista.length}</strong> servidor(es)</span></div>
    <div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Nome</th><th>CPF</th><th>Chave Pix</th><th>Cargo/Função</th><th>Categoria</th><th>Secretaria</th><th>Situação</th><th></th></tr></thead>
      <tbody>${pagina.map(s => `<tr class="clicavel" data-id="${esc(s.id)}">
        <td><strong>${esc(s.nome)}</strong></td>
        <td>${esc(cpfExibir(s))}${cpfOk(s) ? '' : ' <span class="selo selo-cancelada" title="Dígito verificador inválido">CPF inválido</span>'}</td>
        <td>${temPix(s) ? esc(pixExibir(s)) : `<span class="selo selo-pendente">sem Pix</span>`}</td>
        <td>${s.cargo_funcao ? esc(s.cargo_funcao) : '<span class="selo selo-pendente">a informar</span>'}${s.vinculo ? `<small class="muted bloco">${esc(nomeProprio(s.vinculo))}</small>` : ''}</td><td>${esc(GRUPOS[s.grupo] || '')}</td><td>${esc(secretariaNome(s.secretaria_id) || '—')}</td>
        <td>${s.ativo === false ? '<span class="selo selo-cancelada">Inativo</span>' : '<span class="selo selo-emitida">Ativo</span>'}</td>
        <td class="acoes-linha">${podeCompletar(s) ? `<button class="btn ${pendencias(s).length ? '' : 'btn-sec'} btn-peq" data-parar data-pix="${esc(s.id)}" title="Chave Pix e cargo">${pendencias(s).length ? '＋ ' + pendencias(s).join(' e ') : '✎ Pix/cargo'}</button>` : ''}${pode.solicitar() && s.ativo !== false ? `<a class="btn btn-peq" data-parar href="#/solicitacoes/nova?servidor=${esc(s.id)}">＋ Diária</a>` : ''}</td>
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
  $$('tr[data-id]', el).forEach(tr => tr.onclick = e => {
    if (e.target.closest('[data-parar]')) return;
    if (!acessoRestrito()) location.hash = '#/servidores/' + tr.dataset.id;
    else { const sv = porId('servidores', tr.dataset.id); if (podeCompletar(sv)) formPix(sv); }
  });
  $('#novo-sv', el)?.addEventListener('click', () => ehSecretaria()
    ? formServidor(null, { secretariaFixa: estado.sessao.secretaria_id, aoSalvar: () => {} })
    : formServidor(null));
  $('#importar-rel', el)?.addEventListener('click', () => importarRelacao());
  $('#importar-folha', el)?.addEventListener('click', () => importarFolha());
  $('#revisar-cat', el)?.addEventListener('click', () => revisarCategorias());
  $('#inativar-sem-cargo', el)?.addEventListener('click', () => inativarSemCargo());
  $('#pix-cpf-lote', el)?.addEventListener('click', () => pixCpfEmLote());
  $$('[data-pix]', el).forEach(b => b.onclick = ev => { ev.stopPropagation(); formPix(porId('servidores', b.dataset.pix)); });
  if ($('#exp-sv', el)) $('#exp-sv', el).onclick = () => baixarArquivo(`servidores-${hojeISO()}.csv`, csv([
    ['Nome', 'CPF', 'Matrícula', 'Chave Pix', 'Cargo/Função', 'Vínculo', 'Categoria', 'Secretaria', 'Situação'],
    ...lista.map(s => [s.nome, formatarCpf(s.cpf), (s.matriculas || [s.matricula]).filter(Boolean).join(' / '), s.chave_pix, s.cargo_funcao, s.vinculo || '', GRUPOS[s.grupo], secretariaNome(s.secretaria_id), s.ativo === false ? 'Inativo' : 'Ativo'])]));
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
      <label class="campo"><span>Chave Pix <small class="muted" id="pix-tipo"></small></span><input name="chave_pix" value="${esc(v.chave_pix || '')}" maxlength="120" placeholder="Em branco = o CPF do servidor"></label>
      <label class="campo"><span>Cargo/Função *</span><input name="cargo_funcao" value="${esc(v.cargo_funcao || '')}" required maxlength="120"></label>
      ${pode.editar() ? `<label class="campo"><span>Enquadramento do cargo (Anexo I) *</span><select name="grupo" required>
        ${Object.entries(GRUPOS).map(([k, n]) => `<option value="${k}" ${(v.grupo || 'DEMAIS_SERVIDORES') === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`
        : `<input type="hidden" name="grupo" value="DEMAIS_SERVIDORES"><div class="campo"><span>Enquadramento do cargo (Anexo I)</span><input value="${esc(GRUPOS.DEMAIS_SERVIDORES)}" disabled><small class="dica">Só a Contabilidade altera a categoria (ex.: agentes políticos).</small></div>`}
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
    if (!d.chave_pix && cpfValido(cpf)) d.chave_pix = cpf; // padrão: o CPF é a chave Pix
    if (!d.nome || !cpf || !d.cargo_funcao || !d.grupo || !d.chave_pix) return (erro.textContent = 'Preencha os campos obrigatórios (*).');
    const pix = analisarPix(d.chave_pix);
    if (!pix.ok) return (erro.textContent = 'Chave Pix inválida. Use CPF, CNPJ, e-mail, telefone com DDD ou chave aleatória.');
    d.chave_pix = pix.valor;
    if (!cpfValido(cpf)) return (erro.textContent = 'CPF inválido: confira os números (dígito verificador não confere).');
    let dup = estado.servidores.find(x => x.cpf === cpf && x.id !== s?.id);
    if (!dup) {
      // a secretaria não vê o CPF de servidores de outras pastas: confere no índice de CPFs
      try { const idx = await db.lerDoc('cpfs', cpf); if (idx && idx.servidor_id !== s?.id) dup = porId('servidores', idx.servidor_id) || { id: idx.servidor_id, nome: '', oculto: true }; } catch { /* sem acesso: segue */ }
    }
    if (dup?.oculto) return (erro.textContent = 'Este CPF já está cadastrado em outra secretaria. Para pedir diária para ele, peça à Contabilidade a transferência do servidor (motoristas aparecem para todas as secretarias).');
    if (dup) {
      if (rapido && aoSalvar && dup.ativo !== false) { toast(`${dup.nome} já estava cadastrado — incluído na solicitação.`, 'aviso'); m.fechar(); aoSalvar(dup.id); return; }
      return (erro.textContent = `Já existe servidor com este CPF: ${dup.nome}${dup.ativo === false ? ' (inativo — peça à Contabilidade para reativar)' : ''}.`);
    }
    const dados = { nome: d.nome.replace(/\s+/g, ' ').trim(), cpf, chave_pix: d.chave_pix, cargo_funcao: d.cargo_funcao, grupo: pode.editar() ? d.grupo : 'DEMAIS_SERVIDORES', secretaria_id: d.secretaria_id || null, ativo: d.ativo === '1' };
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
  return ehSecretaria() && (!temPix(sv) || pixEhCpf(sv) || sv.secretaria_id === estado.sessao.secretaria_id);
}
/** Quem pode informar o cargo: Contabilidade/admin sempre; Secretaria se está em branco ou o servidor é da secretaria dela. */
export function podeAlterarCargo(sv) {
  if (!sv) return false;
  if (pode.editar()) return true;
  return ehSecretaria() && (!sv.cargo_funcao || sv.secretaria_id === estado.sessao.secretaria_id);
}
export const podeCompletar = sv => podeAlterarPix(sv) || podeAlterarCargo(sv);
/** Motoristas podem receber diárias de qualquer secretaria. */
export const ehMotorista = sv => !!sv && (sv.motorista === true || cargoMotorista(sv.cargo_funcao));
export const pendencias = sv => [!temPix(sv) && 'Pix', !sv.cargo_funcao && 'cargo'].filter(Boolean);

// ---------- Chave Pix por tipo (CPF é o padrão) ----------
export const TIPOS_PIX_FORM = {
  cpf: { nome: 'CPF', dica: 'o CPF do próprio servidor' },
  email: { nome: 'E-mail', dica: 'ex.: nome@exemplo.com', ph: 'nome@exemplo.com', tipo: 'email', max: 77 },
  telefone: { nome: 'Telefone', dica: 'celular com DDD', ph: '(33) 99999-9999', tipo: 'tel', max: 15 },
  aleatoria: { nome: 'Chave aleatória', dica: '32 letras e números com hífens', ph: '1a2b3c4d-1a2b-1a2b-1a2b-1a2b3c4d5e6f', tipo: 'text', max: 36 }
};
const mascaraTelefone = v => {
  const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return d.length <= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
/** Valida a chave conforme o tipo escolhido. Devolve { ok, valor, exibir, erro }. */
export function validarPixPorTipo(tipo, texto, sv) {
  const v = String(texto || '').trim();
  if (tipo === 'cpf') {
    const c = limparCpf(sv?.cpf || '');
    return cpfValido(c) ? { ok: true, valor: c, exibir: formatarCpf(c) } : { ok: false, erro: 'O CPF do servidor não é válido. Corrija o CPF no cadastro ou escolha outro tipo de chave.' };
  }
  if (tipo === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? { ok: true, valor: v.toLowerCase(), exibir: v.toLowerCase() } : { ok: false, erro: 'E-mail inválido. Confira se tem @ e o domínio (ex.: nome@gmail.com).' };
  if (tipo === 'telefone') {
    const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    return (d.length === 11 && d[2] === '9') || d.length === 10 ? { ok: true, valor: '+55' + d, exibir: mascaraTelefone(d) } : { ok: false, erro: 'Telefone inválido. Informe o DDD e o número (ex.: (33) 99999-9999).' };
  }
  if (tipo === 'aleatoria') return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? { ok: true, valor: v.toLowerCase(), exibir: v.toLowerCase() } : { ok: false, erro: 'Chave aleatória inválida. Ela tem 36 caracteres no formato 8-4-4-4-12 (copie do aplicativo do banco).' };
  return { ok: false, erro: 'Escolha o tipo de chave.' };
}
const tipoAtualPix = sv => {
  if (!temPix(sv)) return 'cpf';
  if (pixEhCpf(sv)) return 'cpf';
  const t = sv.chave_pix ? codigoTipoPix(analisarPix(sv.chave_pix).tipo) : sv.pix_tipo;
  return TIPOS_PIX_FORM[t] ? t : 'cpf';
};
const valorInicialPix = (sv, tipo) => !sv.chave_pix || tipo === 'cpf' ? '' : tipo === 'telefone' ? mascaraTelefone(sv.chave_pix) : sv.chave_pix;

/** Janela "Completar cadastro": chave Pix (por tipo) e cargo/função de um servidor já cadastrado. */
export function formPix(sv, aoSalvar = null, { soPix = false } = {}) {
  const pixOk = podeAlterarPix(sv), cargoOk = !soPix && podeAlterarCargo(sv);
  let tipo = tipoAtualPix(sv);
  const m = modal({
    titulo: soPix ? 'Alterar a chave Pix do servidor' : 'Completar cadastro do servidor', largura: 520,
    corpo: `<form id="fpix" novalidate>
      <p><strong>${esc(sv.nome)}</strong><br><small class="muted">${esc(cpfExibir(sv))} · ${esc(secretariaNome(sv.secretaria_id) || 'sem secretaria')}</small></p>
      ${pixOk ? `<fieldset class="pix-tipos"><legend>Tipo da chave Pix${temPix(sv) ? '' : ' (pendente)'}</legend>
          ${Object.entries(TIPOS_PIX_FORM).map(([k, t]) => `<label class="check"><input type="radio" name="tipo_pix" value="${k}" ${k === tipo ? 'checked' : ''}> ${esc(t.nome)}</label>`).join('')}
        </fieldset>
        <label class="campo"><span id="fpix-rotulo"></span><input name="chave_pix" maxlength="77" autocomplete="off"><small class="dica" id="fpix-dica"></small></label>
        <p class="dica">A chave deve estar no nome do próprio servidor. Ela é a forma de pagamento da diária.</p>`
        : `<p class="muted">Chave Pix: ${esc(pixExibir(sv))} <small>(só a secretaria do servidor ou a Contabilidade altera)</small></p>`}
      ${cargoOk ? `<label class="campo"><span>Cargo/Função${sv.cargo_funcao ? '' : ' (a informar)'}</span><input name="cargo_funcao" value="${esc(sv.cargo_funcao || '')}" maxlength="120" placeholder="Ex.: Motorista, Técnico de enfermagem"></label>`
        : soPix ? '' : `<p class="muted">Cargo/Função: ${esc(sv.cargo_funcao)}</p>`}
      <p class="erro-form" id="erro-pix"></p>
      <div class="acoes-form"><button type="button" class="btn btn-sec" data-cancelar>Cancelar</button><button class="btn" type="submit">Salvar</button></div>
    </form>`
  });
  const f = $('#fpix', m.el);
  f.querySelector('[data-cancelar]').onclick = m.fechar;
  const campo = f.chave_pix;
  let mexeuPix = !temPix(sv); // só grava a chave se ela estava pendente ou se o usuário mexeu no tipo/campo
  const ajustarCampo = (inicial = false) => {
    const t = TIPOS_PIX_FORM[tipo];
    $('#fpix-rotulo', m.el).textContent = tipo === 'cpf' ? 'Chave Pix (CPF do servidor)' : `Chave Pix — ${t.nome}`;
    $('#fpix-dica', m.el).textContent = t.dica;
    campo.type = t.tipo || 'text';
    campo.readOnly = tipo === 'cpf';
    campo.placeholder = t.ph || '';
    campo.maxLength = t.max || 77;
    campo.inputMode = tipo === 'telefone' ? 'tel' : tipo === 'email' ? 'email' : 'text';
    campo.value = tipo === 'cpf' ? (sv.cpf ? formatarCpf(sv.cpf) : cpfExibir(sv)) : inicial ? valorInicialPix(sv, tipo) : '';
    $('#erro-pix', m.el).textContent = '';
  };
  if (campo) {
    ajustarCampo(true);
    $$('[name=tipo_pix]', f).forEach(r => r.onchange = () => { tipo = r.value; mexeuPix = true; ajustarCampo(); if (tipo !== 'cpf') campo.focus(); });
    campo.addEventListener('input', () => { mexeuPix = true; if (tipo === 'telefone') campo.value = mascaraTelefone(campo.value); });
  }
  f.onsubmit = async e => {
    e.preventDefault();
    const erro = $('#erro-pix', m.el);
    const mud = {};
    let pixNovo = null;
    if (campo && (mexeuPix || soPix)) {
      if (tipo === 'cpf' && !sv.cpf && pixEhCpf(sv)) pixNovo = null; // já é o CPF (secretaria sem acesso ao número)
      else {
        const p = validarPixPorTipo(tipo, campo.value, sv);
        if (!p.ok) return (erro.textContent = p.erro);
        if (p.valor !== (sv.chave_pix || '') || !temPix(sv)) { mud.chave_pix = p.valor; pixNovo = p; }
      }
    }
    if (f.cargo_funcao) {
      const cargo = f.cargo_funcao.value.replace(/\s+/g, ' ').trim();
      if (!cargo && sv.cargo_funcao) return (erro.textContent = 'Informe o cargo/função.');
      if (cargo && cargo !== (sv.cargo_funcao || '')) mud.cargo_funcao = cargo;
    }
    if (!Object.keys(mud).length) { m.fechar(); aoSalvar && aoSalvar(sv.chave_pix); return; }
    if (pixNovo && !(await confirmar(`Confira a chave Pix de ${sv.nome} antes de salvar.\n\nTipo: ${TIPOS_PIX_FORM[tipo].nome}\nChave: ${pixNovo.exibir}\n\nEla será a forma de pagamento da diária. Uma chave errada pode causar erro ou atraso no pagamento.`,
      { titulo: 'Conferir a chave Pix', ok: 'Está correta, salvar', nao: 'Voltar e corrigir' }))) return;
    try {
      await db.atualizar('servidores', sv.id, mud);
      if (mud.chave_pix) await db.registrarLog('servidor.pix', { nome: sv.nome, tipo, antes: sv.chave_pix || '', depois: mud.chave_pix });
      if (mud.cargo_funcao) await db.registrarLog('servidor.cargo', { nome: sv.nome, antes: sv.cargo_funcao || '', depois: mud.cargo_funcao });
      toast('Cadastro atualizado.');
      m.fechar();
      aoSalvar && aoSalvar(mud.chave_pix || sv.chave_pix);
    } catch (err) { erro.textContent = mensagemErro(err); }
  };
}

/** Na solicitação: avisa que o CPF é a chave Pix padrão e oferece trocar. */
export async function avisoPixCpf(sv, aoAlterar = null) {
  if (!sv || !pixEhCpf(sv)) return;
  const alterar = await confirmar(`${sv.nome}: como padrão, o sistema usa o CPF como chave Pix. Deseja alterar para outra chave?`,
    { titulo: 'Chave Pix do servidor', ok: 'Alterar chave', nao: 'Manter o CPF' });
  if (!alterar) return;
  if (!podeAlterarPix(sv)) { toast('Só a secretaria do servidor ou a Contabilidade pode alterar a chave Pix dele.', 'aviso'); return; }
  formPix(sv, aoAlterar, { soPix: true });
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
      ${pode.verValores() ? `<a class="btn btn-sec" href="#/imprimir/extrato/${esc(s.id)}?mes=${esc(filtroPerfil.mes)}&ano=${esc(filtroPerfil.ano)}&base=pagamento" title="O que recebeu e o que tem a receber, pela data do pagamento">🖨 Extrato de diárias</a>` : ''}
      ${pode.editar() ? '<button class="btn btn-sec" id="editar-sv">✎ Editar cadastro</button>' : ''}`,
      `${s.ativo === false ? '<span class="selo selo-cancelada">Inativo</span> ' : ''}${esc(s.cargo_funcao)} · ${esc(GRUPOS[s.grupo] || '')}`)}
    <div class="grade-detalhe">
      <section class="cartao"><h3>Cadastro</h3><dl class="dl">
        <dt>CPF</dt><dd>${esc(cpfExibir(s))}${cpfOk(s) ? '' : ' <span class="selo selo-cancelada">CPF inválido</span>'}</dd>
        <dt>Chave Pix</dt><dd>${esc(pixExibir(s) || '—')} ${podeAlterarPix(s) ? `<button class="link link-peq" id="perfil-pix">${s.chave_pix ? 'alterar' : 'adicionar'}</button>` : ''}</dd>
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

// ---------- Importação em massa: "Relação de servidores" (Cadastro de Pessoal por Lotação) ----------
const CPF_ID = cpf => 'sv-' + cpf;

export function importarRelacao() {
  const m = modal({
    titulo: 'Importar relação de servidores', largura: 1080,
    corpo: `<p>Escolha o PDF do <strong>Cadastro de Pessoal por Lotação</strong>. O sistema confere cada CPF com o cadastro e
      <strong>não cria duplicidade</strong>: quem já está cadastrado é mantido (só completa matrícula e lotação que faltarem).
      Os novos entram com a <strong>chave Pix pendente</strong> e o cargo a informar — a secretaria completa ao pedir a diária.</p>
      <label class="campo"><span>Arquivo PDF</span><input type="file" id="rel-arq" accept="application/pdf,.pdf"></label>
      <div id="rel-prev"></div>
      <p class="erro-form" id="rel-erro"></p><div id="rel-prog"></div>
      <div class="acoes-form"><button type="button" class="btn btn-sec" data-cancelar>Cancelar</button><button class="btn" id="rel-importar" disabled>Importar</button></div>`
  });
  m.el.querySelector('[data-cancelar]').onclick = m.fechar;
  let pessoas = [], lotacoes = new Map(), filtroSit = 'novo';
  const ativasSec = () => estado.secretarias.filter(x => x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const desenhar = () => {
    if (!pessoas.length) { $('#rel-prev', m.el).innerHTML = ''; return; }
    const cont = {}; pessoas.forEach(p => cont[p.situacao] = (cont[p.situacao] || 0) + 1);
    const marcados = pessoas.filter(p => p.marcado).length;
    const vis = pessoas.filter(p => !filtroSit || p.situacao === filtroSit);
    $('#rel-prev', m.el).innerHTML = `
      <div class="kpis">${Object.entries(SITUACOES).map(([k, v]) => `<button type="button" class="kpi ${filtroSit === k ? 'kpi-ativo' : ''}" data-sit="${k}"><span>${esc(v.nome)}</span><strong>${cont[k] || 0}</strong><small class="muted">${esc(v.dica)}</small></button>`).join('')}
        <button type="button" class="kpi ${!filtroSit ? 'kpi-ativo' : ''}" data-sit=""><span>Todos</span><strong>${pessoas.length}</strong><small class="muted">${marcados} marcado(s)</small></button></div>
      <details ${[...lotacoes.values()].some(l => !l.sec) ? 'open' : ''}><summary>Lotação → secretaria (${lotacoes.size} lotações${[...lotacoes.values()].some(l => !l.sec) ? ', confira as sem secretaria' : ''})</summary>
        <div class="tabela-wrap"><table class="tabela tabela-peq"><thead><tr><th>Lotação na relação</th><th class="num">Pessoas</th><th>Secretaria no sistema</th></tr></thead>
        <tbody>${[...lotacoes.entries()].map(([k, l], i) => `<tr><td>${esc(k)}</td><td class="num">${l.n}</td>
          <td><select data-lot="${i}"><option value="">— sem secretaria —</option>${ativasSec().map(x => `<option value="${esc(x.id)}" ${x.id === l.sec ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}
            ${l.proposto ? `<option value="__nova" ${l.sec === '__nova' ? 'selected' : ''}>＋ Criar secretaria "${esc(l.proposto)}"</option>` : ''}</select></td></tr>`).join('')}</tbody></table></div></details>
      <div class="tabela-wrap tabela-rolagem"><table class="tabela tabela-peq">
        <thead><tr><th><input type="checkbox" id="rel-todos" title="Marcar/desmarcar os visíveis"></th><th>Nome</th><th>CPF</th><th>Matrícula</th><th>Lotação / vínculo</th><th>Situação</th></tr></thead>
        <tbody>${vis.map(p => `<tr>
          <td><input type="checkbox" data-p="${pessoas.indexOf(p)}" ${p.marcado ? 'checked' : ''} ${p.situacao === 'existe' ? 'disabled' : ''}></td>
          <td><strong>${esc(nomeProprio(p.nome))}</strong></td><td>${esc(formatarCpf(p.cpf))}</td><td>${esc(p.matriculas.join(' / '))}</td>
          <td>${esc(nomeSecLot(lotacoes.get(p.secretaria_texto)) || p.secretaria_texto)}<small class="muted bloco">${esc(nomeProprio(p.vinculo || p.lotacao.slice(-1)[0] || ''))}</small></td>
          <td>${situacaoTxt(p)}</td></tr>`).join('') || '<tr><td colspan="6" class="vazio-linha">Ninguém nesta situação.</td></tr>'}</tbody></table></div>`;
    $$('[data-sit]', m.el).forEach(b => b.onclick = () => { filtroSit = b.dataset.sit; desenhar(); });
    $$('[data-lot]', m.el).forEach(sel => sel.onchange = () => { [...lotacoes.values()][sel.dataset.lot].sec = sel.value; desenhar(); });
    $$('[data-p]', m.el).forEach(c => c.onchange = () => { pessoas[c.dataset.p].marcado = c.checked; desenhar(); });
    $('#rel-todos', m.el).onchange = e => { vis.forEach(p => { if (p.situacao !== 'existe') p.marcado = e.target.checked; }); desenhar(); };
    const nAcao = pessoas.filter(p => p.marcado).length + pessoas.filter(p => p.situacao === 'existe' && completar(p)).length;
    $('#rel-importar', m.el).disabled = !nAcao;
    $('#rel-importar', m.el).textContent = `Importar (${pessoas.filter(p => p.marcado && p.situacao !== 'nome').length} novo(s)${pessoas.some(p => p.marcado && p.situacao === 'nome') ? `, ${pessoas.filter(p => p.marcado && p.situacao === 'nome').length} CPF corrigido(s)` : ''})`;
  };
  const nomeSecLot = l => !l ? '' : l.sec === '__nova' ? l.proposto + ' (nova)' : secretariaNome(l.sec);
  const situacaoTxt = p => {
    const cls = { novo: 'selo-emitida', existe: 'selo-info', nome: 'selo-pendente', cpf_invalido: 'selo-cancelada', inativo: 'selo-cancelada' }[p.situacao];
    let extra = '';
    if (p.situacao === 'existe') extra = `cadastrado como ${esc(p.existente.nome)}${completar(p) ? ' · completa matrícula/lotação' : ''}`;
    if (p.situacao === 'nome') extra = `cadastro existente com CPF ${esc(formatarCpf(p.existente.cpf))}. Marque para <strong>corrigir o CPF</strong> desse cadastro (não cria outro).`;
    if (p.situacao === 'cpf_invalido') extra = 'marque só se conferir o CPF';
    if (p.matriculas.length > 1) extra += (extra ? ' · ' : '') + `${p.matriculas.length} matrículas, um cadastro`;
    return `<span class="selo ${cls}">${esc(SITUACOES[p.situacao].nome)}</span>${extra ? `<small class="muted bloco">${extra}</small>` : ''}`;
  };
  // dados que só completam o que falta num cadastro existente (nunca troca Pix, cargo, nome ou categoria)
  const completar = p => {
    const e = p.existente, sec = lotacoes.get(p.secretaria_texto)?.sec, d = {};
    if (!e.matricula) { d.matricula = p.matriculas[0]; d.matriculas = p.matriculas; }
    if (!e.lotacao) d.lotacao = p.lotacao.join(' / ');
    if (!e.vinculo && p.vinculo) d.vinculo = p.vinculo;
    if (!e.secretaria_id && sec && sec !== '__nova') d.secretaria_id = sec;
    return Object.keys(d).length ? d : null;
  };

  $('#rel-arq', m.el).onchange = async e => {
    const arq = e.target.files[0];
    pessoas = []; lotacoes = new Map(); $('#rel-erro', m.el).textContent = ''; desenhar();
    if (!arq) return;
    $('#rel-prog', m.el).textContent = 'Lendo o PDF…';
    try {
      const lista = analisarRelacaoServidores(await extrairLinhas(await arq.arrayBuffer()));
      if (!lista.length) throw new Error('Não encontrei servidores neste PDF (é o "Cadastro de Pessoal por Lotação"?).');
      pessoas = compararComCadastro(lista, estado.servidores).map(p => ({ ...p, marcado: SITUACOES[p.situacao].marcar }));
      for (const p of pessoas) {
        if (!lotacoes.has(p.secretaria_texto)) {
          const proposto = /SECRETARIA/i.test(p.secretaria_texto) ? nomeProprio(p.secretaria_texto.replace(/^SECRETARIA\s+(MUNIC(IPAL|\.)?\s+)?(D[AEO]S?\s+)?/i, '').replace(/[,.\s]+$/, '')) : '';
          lotacoes.set(p.secretaria_texto, { n: 0, proposto, sec: secretariaDaLotacao(p.secretaria_texto, estado.secretarias) || (proposto ? '__nova' : '') });
        }
        lotacoes.get(p.secretaria_texto).n++;
      }
      $('#rel-prog', m.el).textContent = `${lista.length} linha(s) lida(s), ${pessoas.length} pessoa(s) diferente(s).`;
    } catch (err) {
      $('#rel-prog', m.el).textContent = '';
      $('#rel-erro', m.el).textContent = /import|fetch|module/i.test(String(err?.message)) ? 'Não foi possível carregar o leitor de PDF (verifique a internet).' : (err?.message || String(err));
    }
    desenhar();
  };

  $('#rel-importar', m.el).onclick = async () => {
    const btn = $('#rel-importar', m.el); btn.disabled = true;
    const agora = new Date().toISOString(), por = { uid: estado.sessao.uid, nome: estado.sessao.nome };
    const jaTem = new Set(estado.servidores.filter(x => x.cpf).map(x => String(x.cpf).replace(/\D/g, '').padStart(11, '0')));
    const ops = [];
    let novos = 0, completados = 0, corrigidos = 0;
    try {
      // cria as secretarias que ainda não existem (uma por nome)
      const criadas = new Map();
      for (const l of lotacoes.values()) {
        if (l.sec !== '__nova') continue;
        const chave = normalizar(l.proposto);
        let id = criadas.get(chave) || estado.secretarias.find(x => normalizar(x.nome) === chave)?.id;
        if (!id) { id = await db.salvar('secretarias', null, { nome: l.proposto, ativo: true }); criadas.set(chave, id); await db.registrarLog('secretaria.criar', { nome: l.proposto, origem: 'relação de servidores' }); }
        l.sec = id;
      }
    } catch (err) { $('#rel-erro', m.el).textContent = mensagemErro(err); btn.disabled = false; return; }
    for (const p of pessoas) {
      const sec = lotacoes.get(p.secretaria_texto)?.sec || null;
      const lot = { matricula: p.matriculas[0], matriculas: p.matriculas, lotacao: p.lotacao.join(' / '), vinculo: p.vinculo || '' };
      if (p.situacao === 'existe') {
        const d = completar(p);
        if (d) { ops.push({ colecao: 'servidores', id: p.existente.id, dados: { ...d, atualizado_em: agora } }); completados++; }
      } else if (p.marcado && p.situacao === 'nome') {
        ops.push({ colecao: 'servidores', id: p.existente.id, dados: { cpf: p.cpf, cpf_anterior: p.existente.cpf, ...lot, ...(p.existente.secretaria_id ? {} : { secretaria_id: sec }), atualizado_em: agora } });
        jaTem.add(p.cpf); corrigidos++;
      } else if (p.marcado && !jaTem.has(p.cpf)) {
        ops.push({ colecao: 'servidores', id: CPF_ID(p.cpf), dados: {
          nome: nomeProprio(p.nome), cpf: p.cpf, chave_pix: cpfValido(p.cpf) ? p.cpf : '', cargo_funcao: '', grupo: grupoSugerido(p.vinculo),
          secretaria_id: sec, ativo: true, ...lot, origem: 'relacao_pessoal', importado_em: agora, criado_por: por
        } });
        jaTem.add(p.cpf); novos++;
      }
    }
    try {
      const falhas = await db.gravarEmLote(ops, (i, n) => { $('#rel-prog', m.el).innerHTML = `<progress max="${n}" value="${i}"></progress> ${i}/${n}`; });
      await db.registrarLog('servidor.importar_relacao', { novos, completados, cpf_corrigidos: corrigidos, falhas: falhas.length });
      if (falhas.length) {
        $('#rel-erro', m.el).innerHTML = `${falhas.length} registro(s) não foram gravados: ${falhas.slice(0, 5).map(f => esc(f.nome) + ' (' + esc(f.erro) + ')').join(', ')}`;
        btn.disabled = false; return;
      }
      toast(`${novos} servidor(es) cadastrado(s) com Pix pendente${completados ? `, ${completados} cadastro(s) completado(s)` : ''}${corrigidos ? `, ${corrigidos} CPF(s) corrigido(s)` : ''}. Nenhuma duplicidade criada.`);
      m.fechar();
    } catch (err) { $('#rel-erro', m.el).textContent = mensagemErro(err); btn.disabled = false; }
  };
}

// ---------- Atualização pela Folha de Pagamento (cargo, vínculo e secretaria) ----------
// A folha não tem CPF: o cruzamento é pela matrícula (e pelo nome, se faltar). Salários e descontos são ignorados.
const GRUPOS_FOLHA = {
  preencher: { nome: 'Cargo a preencher', dica: 'sem cargo no cadastro' },
  cargo: { nome: 'Cargo diferente', dica: 'confira antes de trocar' },
  secretaria: { nome: 'Mudou de secretaria', dica: 'lotação atual na folha' },
  fora: { nome: 'Fora da folha', dica: 'ativos que não estão nela' },
  sem: { nome: 'Sem cadastro', dica: 'importe a relação de pessoal (tem CPF)' }
};
export function importarFolha() {
  const m = modal({
    titulo: 'Atualizar servidores pela folha de pagamento', largura: 1120,
    corpo: `<p>Escolha o PDF da <strong>Folha de Pagamento</strong> (ordem lotação/alfabética). O sistema cruza cada servidor pela
      <strong>matrícula</strong> e atualiza <strong>cargo, vínculo e secretaria</strong>. Salários e descontos não são lidos nem guardados.
      Nada é criado: quem não tem cadastro aparece para você importar pela relação de pessoal, que traz o CPF.</p>
      <label class="campo"><span>Arquivo PDF</span><input type="file" id="fl-arq" accept="application/pdf,.pdf"></label>
      <div id="fl-prev"></div>
      <p class="erro-form" id="fl-erro"></p><div id="fl-prog"></div>
      <div class="acoes-form"><button type="button" class="btn btn-sec" data-cancelar>Cancelar</button><button class="btn" id="fl-aplicar" disabled>Aplicar</button></div>`
  });
  m.el.querySelector('[data-cancelar]').onclick = m.fechar;
  let r = null, filtro = 'preencher', ref = '';
  const linhasDe = g => !r ? [] : g === 'fora' ? r.fora : g === 'sem' ? r.itens.filter(i => !i.servidor)
    : g === 'preencher' ? r.itens.filter(i => i.mudancas.cargo_funcao && !i.servidor.cargo_funcao)
    : g === 'cargo' ? r.itens.filter(i => i.mudancas.cargo_funcao && i.servidor.cargo_funcao)
    : r.itens.filter(i => i.mudancas.secretaria_id);

  const desenhar = () => {
    if (!r) { $('#fl-prev', m.el).innerHTML = ''; return; }
    const vis = linhasDe(filtro);
    const nVinc = r.itens.filter(i => i.mudancas.vinculo).length;
    const col = filtro === 'secretaria' ? 'sec' : filtro === 'fora' ? 'inativar' : 'cargo';
    const marcado = x => filtro === 'fora' ? !!x.inativar : filtro === 'secretaria' ? x.usarSec : x.usarCargo;
    $('#fl-prev', m.el).innerHTML = `
      <div class="kpis kpis-peq">${Object.entries(GRUPOS_FOLHA).map(([k, v]) => `<button type="button" class="kpi ${filtro === k ? 'kpi-ativo' : ''}" data-g="${k}"><span>${esc(v.nome)}</span><strong>${linhasDe(k).length}</strong><small class="muted">${esc(v.dica)}</small></button>`).join('')}</div>
      <p class="muted">${r.itens.length} pessoa(s) na folha${ref ? ` de ${esc(ref)}` : ''} · ${r.itens.filter(i => i.por === 'matricula').length} encontradas pela matrícula, ${r.itens.filter(i => i.por === 'nome').length} pelo nome ·
        ${nVinc} vínculo(s) (efetivo, contratado, agente político…) serão atualizados.</p>
      ${filtro === 'cargo' ? '<p class="dica">A folha traz o cargo oficial (às vezes abreviado). Desmarque quem deve manter o cargo do cadastro, por exemplo uma função mais específica.</p>' : ''}
      ${filtro === 'fora' ? '<p class="dica">Podem ser servidores que saíram, aposentados e pensionistas, ou cadastros antigos. Marque só quem deve ficar inativo: ele some das novas solicitações, e o histórico continua.</p>' : ''}
      <div class="tabela-wrap tabela-rolagem"><table class="tabela tabela-peq">
        <thead><tr>${filtro === 'sem' ? '' : `<th><input type="checkbox" id="fl-todos" title="Marcar/desmarcar todos"></th>`}<th>Servidor</th><th>Matrícula</th>
          ${filtro === 'fora' ? '<th>Cargo</th><th>Secretaria</th>' : filtro === 'sem' ? '<th>Cargo na folha</th><th>Lotação</th>' : filtro === 'secretaria' ? '<th>Secretaria hoje</th><th>Na folha</th>' : '<th>Cargo hoje</th><th>Na folha</th>'}</tr></thead>
        <tbody>${vis.map(x => {
          const idx = filtro === 'fora' ? r.fora.indexOf(x) : r.itens.indexOf(x);
          if (filtro === 'fora') return `<tr><td><input type="checkbox" data-x="${idx}" ${marcado(x) ? 'checked' : ''}></td><td><strong>${esc(x.nome)}</strong><small class="muted bloco">${esc(nomeProprio(x.vinculo || '') || 'sem vínculo')}</small></td>
            <td>${esc(x.matricula || '—')}</td><td>${esc(x.cargo_funcao || '—')}</td><td>${esc(secretariaNome(x.secretaria_id) || '—')}</td></tr>`;
          const f = x.folha;
          if (filtro === 'sem') return `<tr><td><strong>${esc(nomeProprio(f.nome))}</strong><small class="muted bloco">${esc(nomeProprio(f.situacao))}</small></td><td>${esc(f.matricula)}</td><td>${esc(cargoDaFolha(f.funcao))}</td><td>${esc(f.secretaria_texto)}</td></tr>`;
          const sv = x.servidor;
          const [hoje, folha] = filtro === 'secretaria' ? [secretariaNome(sv.secretaria_id) || '—', secretariaNome(x.mudancas.secretaria_id)] : [sv.cargo_funcao || '—', x.mudancas.cargo_funcao];
          return `<tr><td><input type="checkbox" data-x="${idx}" ${marcado(x) ? 'checked' : ''}></td>
            <td><strong>${esc(sv.nome)}</strong><small class="muted bloco">${esc(nomeProprio(f.situacao))}${x.por === 'nome' ? ' · achado pelo nome' : ''}</small></td><td>${esc(f.matricula)}</td>
            <td>${esc(hoje)}</td><td><strong>${esc(folha)}</strong>${filtro === 'secretaria' ? `<small class="muted bloco">${esc(nomeProprio(f.lotacao.slice(1).join(' / ')))}</small>` : ''}</td></tr>`;
        }).join('') || `<tr><td colspan="5" class="vazio-linha">Ninguém nesta situação.</td></tr>`}</tbody></table></div>`;
    $$('[data-g]', m.el).forEach(b => b.onclick = () => { filtro = b.dataset.g; desenhar(); });
    const marcar = (x, v) => { if (filtro === 'fora') x.inativar = v; else if (filtro === 'secretaria') x.usarSec = v; else x.usarCargo = v; };
    const lista = filtro === 'fora' ? r.fora : r.itens;
    $$('[data-x]', m.el).forEach(c => c.onchange = () => { marcar(lista[c.dataset.x], c.checked); contar(); });
    $('#fl-todos', m.el)?.addEventListener('change', e => { vis.forEach(x => marcar(x, e.target.checked)); desenhar(); });
    contar();
  };
  const montarOps = () => {
    const agora = new Date().toISOString(), ops = [];
    for (const it of r.itens) {
      if (!it.servidor) continue;
      const d = {}, md = it.mudancas;
      if (md.vinculo) d.vinculo = md.vinculo;
      if (md.matricula) d.matricula = md.matricula;
      if (md.cargo_funcao && it.usarCargo) { d.cargo_funcao = md.cargo_funcao; if (it.servidor.cargo_funcao) d.cargo_anterior = it.servidor.cargo_funcao; }
      if (md.secretaria_id && it.usarSec) d.secretaria_id = md.secretaria_id;
      if (Object.keys(d).length) ops.push({ colecao: 'servidores', id: it.servidor.id, dados: { ...d, folha_referencia: ref || null, atualizado_em: agora } });
    }
    for (const s of r.fora) if (s.inativar) ops.push({ colecao: 'servidores', id: s.id, dados: { ativo: false, inativado_motivo: `fora da folha ${ref}`.trim(), atualizado_em: agora } });
    return ops;
  };
  const contar = () => {
    const ops = montarOps(), btn = $('#fl-aplicar', m.el);
    const n = k => ops.filter(o => k in o.dados).length;
    btn.disabled = !ops.length;
    btn.textContent = `Aplicar (${n('cargo_funcao')} cargo(s), ${n('secretaria_id')} secretaria(s), ${n('vinculo')} vínculo(s)${n('ativo') ? `, ${n('ativo')} inativado(s)` : ''})`;
  };

  $('#fl-arq', m.el).onchange = async e => {
    const arq = e.target.files[0];
    r = null; ref = ''; $('#fl-erro', m.el).textContent = ''; desenhar();
    if (!arq) return;
    $('#fl-prog', m.el).textContent = 'Lendo o PDF…';
    try {
      const linhas = await extrairLinhas(await arq.arrayBuffer());
      ref = (linhas.join(' ').match(/REFER[EÊ]NCIA:\s*([A-ZÇ]+\/\d{4})/i) || [])[1] || '';
      const folha = analisarFolha(linhas);
      if (!folha.length) throw new Error('Não encontrei servidores neste PDF (é a "Folha de Pagamento" em ordem de lotação?).');
      r = cruzarFolha(folha, estado.servidores, estado.secretarias);
      r.itens.forEach(i => { i.usarCargo = true; i.usarSec = true; });
      filtro = Object.keys(GRUPOS_FOLHA).find(g => linhasDe(g).length) || 'preencher';
      $('#fl-prog', m.el).textContent = '';
    } catch (err) {
      $('#fl-prog', m.el).textContent = '';
      $('#fl-erro', m.el).textContent = /import|fetch|module/i.test(String(err?.message)) ? 'Não foi possível carregar o leitor de PDF (verifique a internet).' : (err?.message || String(err));
    }
    desenhar();
  };

  $('#fl-aplicar', m.el).onclick = async () => {
    const btn = $('#fl-aplicar', m.el); btn.disabled = true;
    const ops = montarOps();
    try {
      const falhas = await db.gravarEmLote(ops, (i, n) => { $('#fl-prog', m.el).innerHTML = `<progress max="${n}" value="${i}"></progress> ${i}/${n}`; });
      const n = k => ops.filter(o => k in o.dados).length;
      await db.registrarLog('servidor.atualizar_folha', { referencia: ref, cargos: n('cargo_funcao'), secretarias: n('secretaria_id'), vinculos: n('vinculo'), inativados: n('ativo'), falhas: falhas.length });
      if (falhas.length) {
        $('#fl-erro', m.el).innerHTML = `${falhas.length} registro(s) não foram gravados: ${falhas.slice(0, 5).map(f => esc(f.nome) + ' (' + esc(f.erro) + ')').join(', ')}`;
        btn.disabled = false; return;
      }
      m.fechar();
      toast(`Folha ${ref} aplicada: ${n('cargo_funcao')} cargo(s), ${n('secretaria_id')} secretaria(s) e ${n('vinculo')} vínculo(s) atualizados.`);
      // com o vínculo novo, os agentes políticos ficam identificados: abre a revisão das categorias se houver ajuste
      setTimeout(() => { if (estado.servidores.some(s => s.ativo !== false && categoriaEsperada(s) !== s.grupo)) revisarCategorias(); }, 800);
    } catch (err) { $('#fl-erro', m.el).textContent = mensagemErro(err); btn.disabled = false; }
  };
}

// ---------- Chave Pix padrão: o CPF de quem está sem chave ----------
export async function pixCpfEmLote() {
  const sem = estado.servidores.filter(s => s.ativo !== false && !temPix(s));
  const comCpf = sem.filter(s => cpfValido(limparCpf(s.cpf || '')));
  if (!comCpf.length) return toast('Nenhum servidor sem Pix com CPF válido.', 'aviso');
  const resto = sem.length - comCpf.length;
  if (!(await confirmar(`${comCpf.length} servidor(es) sem chave Pix passam a usar o próprio CPF como chave.${resto ? `\n${resto} com CPF inválido continuam pendentes (corrija o CPF).` : ''}\n\nAo preencher uma diária, o sistema avisa que a chave é o CPF e pergunta se quer trocar.`, { titulo: 'Usar o CPF como chave Pix', ok: 'Usar o CPF' }))) return;
  try {
    const falhas = await db.gravarEmLote(comCpf.map(s => ({ colecao: 'servidores', id: s.id, dados: { chave_pix: limparCpf(s.cpf), cpf: limparCpf(s.cpf) } })));
    await db.registrarLog('servidor.pix_cpf_lote', { quantidade: comCpf.length - falhas.length });
    toast(falhas.length ? `${falhas.length} não foram gravados.` : `${comCpf.length} chave(s) Pix preenchida(s) com o CPF.`, falhas.length ? 'erro' : undefined);
  } catch (err) { toast(mensagemErro(err), 'erro'); }
}

// ---------- Inativar em lote os servidores ativos sem cargo ----------
export function inativarSemCargo() {
  const lista = estado.servidores.filter(s => s.ativo !== false && !String(s.cargo_funcao || '').trim())
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const emAndamento = new Set(ativas(estado.solicitacoes).filter(x => !['paga', 'legado', 'reprovada'].includes(etapaDe(x))).map(x => x.servidor_id));
  const m = modal({
    titulo: `Inativar servidores sem cargo (${lista.length})`, largura: 900,
    corpo: `<p>Os marcados ficam <strong>inativos</strong>: deixam de aparecer na busca das novas solicitações. O histórico continua e dá para reativar no cadastro do servidor.</p>
      ${emAndamento.size && lista.some(s => emAndamento.has(s.id)) ? '<p class="dica">Quem tem solicitação em andamento vem desmarcado.</p>' : ''}
      <div class="tabela-wrap tabela-rolagem"><table class="tabela tabela-peq">
        <thead><tr><th><input type="checkbox" id="isc-todos" checked></th><th>Servidor</th><th>Vínculo</th><th>Secretaria</th></tr></thead>
        <tbody>${lista.map((s, i) => `<tr><td><input type="checkbox" data-isc="${i}" ${emAndamento.has(s.id) ? '' : 'checked'}></td>
          <td><strong>${esc(s.nome)}</strong>${emAndamento.has(s.id) ? '<small class="muted bloco">solicitação em andamento</small>' : ''}</td>
          <td>${esc(nomeProprio(s.vinculo || '') || '—')}</td><td>${esc(secretariaNome(s.secretaria_id) || '—')}</td></tr>`).join('')}</tbody></table></div>
      <p class="erro-form" id="isc-erro"></p><div id="isc-prog"></div>
      <div class="acoes-form"><button type="button" class="btn btn-sec" data-cancelar>Cancelar</button><button class="btn btn-perigo" id="isc-aplicar">Inativar marcados</button></div>`
  });
  m.el.querySelector('[data-cancelar]').onclick = m.fechar;
  const marcados = () => $$('[data-isc]', m.el).filter(c => c.checked).map(c => lista[c.dataset.isc]);
  const contar = () => { const n = marcados().length; $('#isc-aplicar', m.el).textContent = `Inativar ${n} servidor(es)`; $('#isc-aplicar', m.el).disabled = !n; };
  $('#isc-todos', m.el).onchange = e => { $$('[data-isc]', m.el).forEach(c => { c.checked = e.target.checked; }); contar(); };
  $$('[data-isc]', m.el).forEach(c => c.onchange = contar);
  contar();
  $('#isc-aplicar', m.el).onclick = async () => {
    const sel = marcados(); if (!sel.length) return;
    const btn = $('#isc-aplicar', m.el); btn.disabled = true;
    const agora = new Date().toISOString();
    try {
      const falhas = await db.gravarEmLote(sel.map(s => ({ colecao: 'servidores', id: s.id, dados: { ativo: false, inativado_motivo: 'sem cargo', inativado_em: agora } })),
        (i, n) => { $('#isc-prog', m.el).innerHTML = `<progress max="${n}" value="${i}"></progress> ${i}/${n}`; });
      await db.registrarLog('servidor.inativar_sem_cargo', { quantidade: sel.length - falhas.length });
      if (falhas.length) { $('#isc-erro', m.el).textContent = `${falhas.length} não foram gravados.`; btn.disabled = false; return; }
      toast(`${sel.length} servidor(es) sem cargo inativado(s).`);
      m.fechar();
    } catch (err) { $('#isc-erro', m.el).textContent = mensagemErro(err); btn.disabled = false; }
  };
}

// ---------- Revisão das categorias (Anexo I) ----------
// Regra da Prefeitura: todos são "Demais Servidores", exceto agentes políticos (secretários) e vice-prefeito,
// identificados pelo vínculo da relação de pessoal; o Prefeito mantém a própria categoria.
const CARGO_POLITICO = /^\s*(secret[aá]ri[oa](\s+(municipal|adjunt[oa]|de|da|do)\b.*)?|vice[- ]?prefeit[oa])\s*$/i;
export function categoriaEsperada(sv) {
  if (sv.grupo === 'PREFEITO') return 'PREFEITO';
  if (/AGENTES? POL/i.test(sv.vinculo || '') && /^\s*prefeit[oa]\s*$/i.test(sv.cargo_funcao || '')) return 'PREFEITO';
  if (/AGENTES? POL|VICE[- ]?PREFEITO/i.test(sv.vinculo || '')) return 'VICE_SECRETARIO_JURIDICO';
  // sem o vínculo da relação de pessoal, o cargo "Secretário(a) …" ou "Vice-Prefeito" indica agente político
  if (!sv.vinculo && CARGO_POLITICO.test(sv.cargo_funcao || '')) return 'VICE_SECRETARIO_JURIDICO';
  return 'DEMAIS_SERVIDORES';
}

export function revisarCategorias() {
  const lista = estado.servidores.filter(s => s.ativo !== false && categoriaEsperada(s) !== s.grupo)
    .map(s => ({ s, nova: categoriaEsperada(s), conferir: !s.vinculo }))
    .sort((a, b) => (a.conferir - b.conferir) || a.s.nome.localeCompare(b.s.nome, 'pt-BR'));
  const politicos = estado.servidores.filter(s => s.ativo !== false && categoriaEsperada(s) === 'VICE_SECRETARIO_JURIDICO');
  const m = modal({
    titulo: 'Revisar categorias dos servidores', largura: 900,
    corpo: `<p>Regra: todos ficam em <strong>${esc(GRUPOS.DEMAIS_SERVIDORES)}</strong>, exceto os <strong>agentes políticos</strong> e o vice-prefeito
      (pelo vínculo da relação de pessoal), que ficam em <strong>${esc(GRUPOS.VICE_SECRETARIO_JURIDICO)}</strong>. O Prefeito não é alterado.</p>
      <details><summary>Agentes políticos identificados (${politicos.length})</summary>
        <p class="muted">${politicos.map(s => esc(s.nome) + ' · ' + esc(secretariaNome(s.secretaria_id) || '—')).join('<br>') || 'Nenhum — importe a relação de servidores para trazer o vínculo.'}</p></details>
      ${lista.length ? `<div class="tabela-wrap tabela-rolagem"><table class="tabela tabela-peq">
        <thead><tr><th><input type="checkbox" id="cat-todos"></th><th>Servidor</th><th>Vínculo</th><th>Categoria atual</th><th>Passa a ser</th></tr></thead>
        <tbody>${lista.map((x, i) => `<tr><td><input type="checkbox" data-cat="${i}" ${x.conferir ? '' : 'checked'}></td>
          <td><strong>${esc(x.s.nome)}</strong><small class="muted bloco">${esc(x.s.cargo_funcao || 'cargo a informar')} · ${esc(secretariaNome(x.s.secretaria_id) || '—')}</small></td>
          <td>${x.s.vinculo ? esc(nomeProprio(x.s.vinculo)) : '<span class="selo selo-pendente">sem vínculo — confira</span>'}</td>
          <td>${esc(GRUPOS[x.s.grupo] || x.s.grupo)}</td><td><strong>${esc(GRUPOS[x.nova])}</strong></td></tr>`).join('')}</tbody></table></div>
        <p class="dica">Quem está "sem vínculo" não veio na relação de pessoal: fica desmarcado para você conferir.</p>`
        : '<p class="ok-txt">✓ Todas as categorias já seguem a regra.</p>'}
      <p class="erro-form" id="cat-erro"></p>
      <div class="acoes-form"><button type="button" class="btn btn-sec" data-cancelar>Fechar</button>${lista.length ? '<button class="btn" id="cat-aplicar">Aplicar nas marcadas</button>' : ''}</div>`
  });
  m.el.querySelector('[data-cancelar]').onclick = m.fechar;
  $('#cat-todos', m.el)?.addEventListener('change', e => $$('[data-cat]', m.el).forEach(c => { c.checked = e.target.checked; }));
  $('#cat-aplicar', m.el)?.addEventListener('click', async () => {
    const marcados = $$('[data-cat]', m.el).filter(c => c.checked).map(c => lista[c.dataset.cat]);
    if (!marcados.length) return ($('#cat-erro', m.el).textContent = 'Marque ao menos um servidor.');
    try {
      const falhas = await db.gravarEmLote(marcados.map(x => ({ colecao: 'servidores', id: x.s.id, dados: { grupo: x.nova, categoria_anterior: x.s.grupo } })));
      await db.registrarLog('servidor.categorias', { alterados: marcados.length - falhas.length });
      if (falhas.length) return ($('#cat-erro', m.el).textContent = `${falhas.length} não foram gravados.`);
      toast(`${marcados.length} categoria(s) ajustada(s). Solicitações ainda não calculadas usam a nova categoria.`);
      m.fechar();
    } catch (err) { $('#cat-erro', m.el).textContent = mensagemErro(err); }
  });
}
