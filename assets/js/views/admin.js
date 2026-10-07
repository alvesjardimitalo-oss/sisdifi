// SISDIFI — Administração: parâmetros da lei, usuários, importação do banco antigo, auditoria e minha conta
import * as db from '../db.js';
import { estado, PERFIS, CONFIG_PADRAO, pode, CAMPOS_VALOR } from '../estado.js';
import { GRUPOS, FAIXAS, moeda } from '../calculo.js';
import { esc, $, $$, toast, modal, confirmar, lerForm, mensagemErro, dataBR, baixarArquivo } from '../ui.js';
import { aguardando, cabecalho, opcoesSecretarias } from './comum.js';
import { mapearBancoAntigo } from '../importador.js';

// =============================================================
// PARÂMETROS
// =============================================================
export function telaParametros(el) {
  if (aguardando(el, ['config'])) return { viva: true, titulo: 'Parâmetros' };
  const c = estado.config;
  el.innerHTML = `
    ${cabecalho('Parâmetros da lei', '', 'Valores usados nos novos cálculos. Solicitações já emitidas guardam os valores da época e não mudam.')}
    <form id="fparam">
      <section class="cartao">
        <h3>Identificação</h3>
        <div class="grade-2">
          <label class="campo"><span>Órgão (cabeçalho dos documentos)</span><input name="orgao" value="${esc(c.orgao)}" required></label>
          <label class="campo"><span>Base legal</span><input name="lei" value="${esc(c.lei)}" required></label>
          <label class="campo"><span>Cidade de origem das viagens</span><input name="origem_cidade" value="${esc(c.origem.cidade)}" required></label>
          <label class="campo"><span>UF de origem</span><input name="origem_uf" value="${esc(c.origem.uf)}" maxlength="2" required></label>
        </div>
      </section>
      <section class="cartao">
        <h3>Anexo I — valores das diárias (R$)</h3>
        <div class="tabela-wrap"><table class="tabela tabela-form">
          <thead><tr><th rowspan="2">Categoria</th>${Object.values(FAIXAS).map(f => `<th colspan="2">${esc(f)}</th>`).join('')}</tr>
            <tr>${Object.keys(FAIXAS).map(() => '<th>Simples</th><th>Pernoite</th>').join('')}</tr></thead>
          <tbody>${Object.entries(GRUPOS).map(([g, n]) => `<tr><td>${esc(n)}</td>${Object.keys(FAIXAS).map(f =>
            ['SIMPLES', 'PERNOITE'].map(t => `<td><input type="number" step="0.01" min="0" name="v|${g}|${t}|${f}" value="${c.valores[g][t][f]}" aria-label="${esc(n)} ${t} ${f}"></td>`).join('')).join('')}</tr>`).join('')}</tbody>
        </table></div>
        <label class="campo campo-curto"><span>Etapa alimentação (R$)</span><input type="number" step="0.01" min="0" name="alimentacao" value="${c.alimentacao}"></label>
        <p class="muted">Regra de contagem: cada 24h completas = 1 pernoite; fração final acima de 12h = 1 simples; de 6h a 12h = 1 etapa alimentação; abaixo de 6h = nada.
        Faixas: até 149,99 km; de 150 a 300 km; acima de 300 km.</p>
      </section>
      <section class="cartao">
        <h3>Listas de apoio</h3>
        <div class="grade-3">
          <label class="campo"><span>Contas de pagamento (uma por linha)</span><textarea name="contas" rows="6" placeholder="Ex.: BB 12.345-6 — Tesouro">${esc((c.contas_pagamento || []).join('\n'))}</textarea></label>
          <label class="campo"><span>Fontes de recursos (uma por linha)</span><textarea name="fontes" rows="6" placeholder="Ex.: 1500 — Recursos não vinculados">${esc((c.fontes_recursos || []).join('\n'))}</textarea></label>
          <label class="campo"><span>Tipos de despesa para reembolso</span><textarea name="tipos" rows="6">${esc((c.tipos_despesa || []).join('\n'))}</textarea></label>
        </div>
        <p class="muted">As contas e fontes aparecem como sugestão para o Controle Interno ao aprovar (ele também pode digitar outra).</p>
      </section>
      <div class="acoes-form"><button type="button" class="btn btn-sec" id="restaurar">Restaurar valores da Lei 994/2025</button><button class="btn" type="submit">Salvar parâmetros</button></div>
    </form>`;
  const f = $('#fparam', el);
  $('#restaurar', el).onclick = () => {
    for (const g of Object.keys(GRUPOS)) for (const t of ['SIMPLES', 'PERNOITE']) for (const fx of Object.keys(FAIXAS)) f[`v|${g}|${t}|${fx}`].value = CONFIG_PADRAO.valores[g][t][fx];
    f.alimentacao.value = CONFIG_PADRAO.alimentacao;
    toast('Valores da lei preenchidos. Clique em Salvar para aplicar.', 'aviso');
  };
  f.onsubmit = async e => {
    e.preventDefault();
    const d = lerForm(f);
    const valores = structuredClone(c.valores);
    for (const [k, v] of Object.entries(d)) if (k.startsWith('v|')) {
      const [, g, t, fx] = k.split('|');
      if (!(Number(v) >= 0) || v === '') return toast('Preencha todos os valores.', 'erro');
      valores[g][t][fx] = Math.round(Number(v) * 100) / 100;
    }
    const novo = {
      orgao: d.orgao, lei: d.lei, origem: { cidade: d.origem_cidade, uf: d.origem_uf.toUpperCase() }, valores,
      alimentacao: Math.round(Number(d.alimentacao) * 100) / 100,
      tipos_despesa: d.tipos.split('\n').map(x => x.trim()).filter(Boolean),
      contas_pagamento: d.contas.split('\n').map(x => x.trim()).filter(Boolean),
      fontes_recursos: d.fontes.split('\n').map(x => x.trim()).filter(Boolean)
    };
    if (!(await confirmar('Salvar os parâmetros? Os novos valores valem para as próximas solicitações e edições.'))) return;
    try {
      await db.salvar('config', 'parametros', novo);
      await db.registrarLog('parametros.alterar', { antes: { valores: c.valores, alimentacao: c.alimentacao }, depois: { valores, alimentacao: novo.alimentacao } });
      toast('Parâmetros salvos.');
    } catch (err) { toast(mensagemErro(err), 'erro'); }
  };
  return { titulo: 'Parâmetros' };
}

// =============================================================
// USUÁRIOS
// =============================================================
export function telaUsuarios(el) {
  if (aguardando(el, ['usuarios'])) return { viva: true, titulo: 'Usuários' };
  const lista = [...estado.usuarios].sort((a, b) => (!!b.pendente - !!a.pendente) || (b.ativo !== false) - (a.ativo !== false) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const pendentes = lista.filter(u => u.pendente && !u.ativo).length;
  el.innerHTML = `
    ${cabecalho('Usuários', '<button class="btn" id="novo-usr">＋ Novo usuário</button>', 'Só entra no sistema quem estiver cadastrado e ativo aqui.')}
    ${pendentes ? `<div class="alerta">${pendentes} pessoa(s) entraram com a conta (ex.: Google) e aguardam liberação. Clique em "Liberar" e escolha o perfil.</div>` : ''}
    <div class="cartao legenda-perfis">
      <span><strong>Administrador:</strong> tudo, inclusive usuários, parâmetros, importação e exclusão definitiva.</span>
      <span><strong>Contabilidade:</strong> cadastra servidores e secretarias, emite solicitações, registra ficha, empenho, liquidação, pagamento e reembolsos.</span>
      <span><strong>Controle Interno:</strong> só analisa: vê o pedido da secretaria (servidor, período, destino, conta e fonte) e aprova ou reprova. Não cria solicitações, não vê valores nem cadastros.</span>
      <span><strong>Secretaria (solicitante):</strong> vinculada a uma secretaria; cadastra servidor e envia solicitações dela para análise, com conta e fonte de recurso. Não vê valores nem pedidos de outras secretarias.</span>
      <span><strong>Somente consulta:</strong> visualiza, imprime e exporta.</span>
    </div>
    <div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th></th></tr></thead>
      <tbody>${lista.map(u => `<tr>
        <td><strong>${esc(u.nome)}</strong>${u.id === estado.sessao.uid ? ' <small class="muted">(você)</small>' : ''}</td><td>${esc(u.email)}</td>
        <td>${esc(PERFIS[u.perfil] || u.perfil)}${u.perfil === 'secretaria' ? `<small class="muted bloco">${esc(u.secretaria_nome || '— sem secretaria —')}</small>` : ''}</td>
        <td>${u.pendente && !u.ativo ? '<span class="selo selo-pendente">Aguardando liberação</span>' : u.ativo === false ? '<span class="selo selo-cancelada">Bloqueado</span>' : '<span class="selo selo-emitida">Ativo</span>'}</td>
        <td class="acoes-linha">${u.id === estado.sessao.uid ? '' : `<button class="btn ${u.pendente && !u.ativo ? '' : 'btn-sec'} btn-peq" data-editar="${esc(u.id)}">${u.pendente && !u.ativo ? '✓ Liberar' : '✎ Editar'}</button>`}
          <button class="btn btn-sec btn-peq" data-reset="${esc(u.email)}" title="Enviar e-mail para criar nova senha">✉ Redefinir senha</button></td></tr>`).join('')}</tbody>
    </table></div>`;
  $('#novo-usr', el).onclick = () => formUsuario(null);
  $$('[data-editar]', el).forEach(b => b.onclick = () => formUsuario(estado.usuarios.find(u => u.id === b.dataset.editar)));
  $$('[data-reset]', el).forEach(b => b.onclick = async () => {
    try { await db.redefinirSenha(b.dataset.reset); toast('E-mail de redefinição enviado para ' + b.dataset.reset); }
    catch (err) { toast(mensagemErro(err), 'erro'); }
  });
  return { viva: true, titulo: 'Usuários' };
}

function formUsuario(u) {
  const m = modal({
    titulo: u ? 'Editar usuário' : 'Novo usuário', largura: 520,
    corpo: `<form id="fusr" novalidate>
      <label class="campo"><span>Nome</span><input name="nome" value="${esc(u?.nome || '')}" required></label>
      ${u ? `<p class="muted">E-mail: ${esc(u.email)}</p>` : `
      <label class="campo"><span>E-mail</span><input type="email" name="email" required></label>
      <label class="campo"><span>Senha provisória (mín. 8 caracteres)</span><input name="senha" minlength="8" required value="${gerarSenha()}"></label>
      <p class="muted">Passe a senha provisória ao usuário. Ele pode trocá-la em "Minha conta".</p>`}
      <label class="campo"><span>Perfil</span><select name="perfil">${Object.entries(PERFIS).map(([k, v]) => `<option value="${k}" ${(u?.perfil || 'operador') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="campo" id="campo-sec-usr"><span>Secretaria do usuário *</span><select name="secretaria_id">${opcoesSecretarias(u?.secretaria_id || '')}</select></label>
      ${u ? `<label class="campo"><span>Situação</span><select name="ativo"><option value="1" ${u.ativo === false && !u.pendente ? '' : 'selected'}>Ativo</option><option value="0" ${u.ativo === false && !u.pendente ? 'selected' : ''}>Bloqueado</option></select></label>` : ''}
      <p class="erro-form" id="erro-usr"></p>
      <div class="acoes-form"><button type="button" class="btn btn-sec" data-cancelar>Cancelar</button><button class="btn" type="submit">Salvar</button></div>
    </form>`
  });
  const f = $('#fusr', m.el);
  f.querySelector('[data-cancelar]').onclick = m.fechar;
  const mostrarSec = () => { $('#campo-sec-usr', m.el).hidden = f.perfil.value !== 'secretaria'; };
  f.perfil.addEventListener('change', mostrarSec); mostrarSec();
  f.onsubmit = async e => {
    e.preventDefault();
    const d = lerForm(f);
    const erro = $('#erro-usr', m.el);
    if (!d.nome) return (erro.textContent = 'Informe o nome.');
    if (d.perfil === 'secretaria' && !d.secretaria_id) return (erro.textContent = 'Escolha a secretaria deste usuário.');
    const vinculo = d.perfil === 'secretaria'
      ? { secretaria_id: d.secretaria_id, secretaria_nome: estado.secretarias.find(x => x.id === d.secretaria_id)?.nome || '' }
      : { secretaria_id: null, secretaria_nome: '' };
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      if (u) {
        await db.salvar('usuarios', u.id, { nome: d.nome, perfil: d.perfil, ativo: d.ativo === '1', pendente: false, ...vinculo });
        await db.registrarLog('usuario.editar', { email: u.email, perfil: d.perfil, ativo: d.ativo === '1' });
      } else {
        if (!d.email) { btn.disabled = false; return (erro.textContent = 'Informe o e-mail.'); }
        if ((d.senha || '').length < 8) { btn.disabled = false; return (erro.textContent = 'A senha provisória precisa ter 8 caracteres ou mais.'); }
        await db.criarUsuario({ nome: d.nome, email: d.email, senha: d.senha, perfil: d.perfil, ...vinculo });
        await db.registrarLog('usuario.criar', { email: d.email, perfil: d.perfil });
      }
      toast('Usuário salvo.');
      m.fechar();
    } catch (err) { erro.textContent = mensagemErro(err); btn.disabled = false; }
  };
}

function gerarSenha() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const a = new Uint32Array(10);
  crypto.getRandomValues(a);
  return [...a].map(n => c[n % c.length]).join('');
}

// =============================================================
// IMPORTAR BANCO ANTIGO
// =============================================================
export function telaImportar(el) {
  el.innerHTML = `
    ${cabecalho('Importar e cópia de segurança', '', 'Importe o banco do SISDIFI desktop ou baixe uma cópia de segurança de todos os dados.')}
    <section class="cartao">
      <h3>Cópia de segurança</h3>
      <p>Baixa um arquivo com todos os servidores, secretarias, solicitações (com reembolsos e tramitação), distâncias e parâmetros.
      Guarde em local seguro: contém CPF e chave Pix dos servidores.</p>
      <div class="acoes-form" style="justify-content:flex-start">
        <button class="btn" id="bkp-json">⭳ Baixar cópia completa (.json)</button>
      </div>
    </section>
    ${(() => {
      const expostos = (estado.solicitacoesBrutas || []).filter(x => CAMPOS_VALOR.some(k => x[k] !== undefined)).length;
      return expostos ? `<section class="cartao"><h3>Proteger valores</h3>
        <div class="alerta">${expostos} solicitação(ões) ainda guardam os valores junto com os dados da viagem (importação anterior). Clique para mover os valores para a área protegida — assim Secretaria e Controle Interno não conseguem lê-los.</div>
        <button class="btn" id="proteger">🔒 Proteger valores agora</button> <span id="prog-proteger"></span></section>` : '';
    })()}
    <h3>Importar banco do SISDIFI antigo</h3>
    <section class="cartao">
      <ol class="passos">
        <li>No computador onde o SISDIFI antigo está instalado, localize o arquivo <code>resources\\app\\database\\sisdifi.sqlite</code> (dentro da pasta de instalação do SISDIFI).</li>
        <li>Selecione o arquivo abaixo. Ele é lido <strong>apenas no seu navegador</strong> e enviado direto ao Firestore — não passa pelo GitHub.</li>
        <li>Confira o resumo e clique em Importar. Pode repetir a importação: os mesmos registros são atualizados, não duplicados.</li>
      </ol>
      <label class="campo"><span>Arquivo sisdifi.sqlite</span><input type="file" id="arq" accept=".sqlite,.db,.sqlite3"></label>
      <div id="previa"></div>
    </section>`;
  $('#bkp-json', el).onclick = async () => {
    const dados = { sistema: 'SISDIFI', gerado_em: new Date().toISOString(), por: estado.sessao.email,
      config: estado.config, secretarias: estado.secretarias, servidores: estado.servidores, solicitacoes: estado.solicitacoes, distancias: Object.values(estado.distancias) };
    baixarArquivo(`sisdifi-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(dados, (k, v) => (v && typeof v.toDate === 'function') ? v.toDate().toISOString() : v, 2), 'application/json');
    await db.registrarLog('backup.baixar', { solicitacoes: estado.solicitacoes.length });
  };
  $('#proteger', el)?.addEventListener('click', async () => {
    const lista = (estado.solicitacoesBrutas || []).map(x => {
      const valores = {};
      for (const k of CAMPOS_VALOR) if (x[k] !== undefined) valores[k] = x[k];
      return { id: x.id, valores };
    }).filter(x => Object.keys(x.valores).length);
    try {
      await db.moverValoresProtegidos(lista, (f, t) => { $('#prog-proteger', el).textContent = `${f}/${t}`; });
      await db.registrarLog('valores.proteger', { quantidade: lista.length });
      toast('Valores protegidos.');
      window.dispatchEvent(new Event('sisdifi:redesenhar'));
    } catch (err) { toast(mensagemErro(err), 'erro'); }
  });
  $('#arq', el).onchange = async e => {
    const arq = e.target.files[0];
    if (!arq) return;
    const previa = $('#previa', el);
    previa.innerHTML = '<div class="carregando"><div class="spinner"></div><p>Lendo o banco…</p></div>';
    try {
      const tabelas = await lerSQLite(arq);
      const r = mapearBancoAntigo(tabelas);
      const existentes = estado.solicitacoes.filter(s => !s.legado_id).length;
      // Registros já importados antes NÃO são sobrescritos (preserva cancelamentos/edições feitas no sistema novo).
      const jaExiste = o => o.colecao === 'distancias' ? !!estado.distancias[o.id]
        : o.colecao === 'valores' ? estado.solicitacoes.some(x => x.id === o.id)
        : estado[o.colecao]?.some?.(x => x.id === o.id);
      const novos = r.operacoes.filter(o => !jaExiste(o));
      const mantidos = r.operacoes.length - novos.length;
      r.operacoes = novos;
      previa.innerHTML = `
        <h3>Resumo</h3>
        <div class="kpis kpis-peq">${Object.entries(r.resumo).map(([k, v]) => `<div class="kpi"><span>${esc(k)}</span><strong>${v}</strong></div>`).join('')}</div>
        <p>Numeração: ${Object.entries(r.contadores).map(([a, n]) => `${a} continua a partir de <strong>${String(n + 1).padStart(4, '0')}/${a}</strong>`).join('; ')}.</p>
        ${r.avisos.length ? `<div class="alerta"><strong>Observações:</strong><ul>${r.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
        ${mantidos ? `<div class="alerta">${mantidos} registro(s) já tinham sido importados e serão mantidos como estão no sistema novo.</div>` : ''}
        ${existentes ? `<div class="alerta">⚠ Já existem ${existentes} solicitações criadas no sistema novo. A numeração vai continuar do maior número (novo ou importado).</div>` : ''}
        <label class="check"><input type="checkbox" id="imp-param" checked> Importar também a tabela de valores e tipos de despesa</label>
        <div class="acoes-form"><button class="btn" id="btn-importar">${r.operacoes.length ? `Importar ${r.operacoes.length} registros novos` : 'Atualizar numeração/parâmetros'}</button></div>
        <div id="progresso"></div>`;
      $('#btn-importar', el).onclick = async () => {
        if (!(await confirmar(`Importar ${r.resumo.servidores} servidores e ${r.resumo.solicitacoes} solicitações para o Firestore?`, { ok: 'Importar' }))) return;
        const btn = $('#btn-importar', el); btn.disabled = true;
        const prog = $('#progresso', el);
        try {
          const falhas = await db.gravarEmLote(r.operacoes, (feito, total) => { prog.innerHTML = `<progress max="${total}" value="${feito}"></progress> ${feito}/${total}`; });
          if (falhas.length) {
            prog.innerHTML = `<div class="alerta"><strong>${r.operacoes.length - falhas.length} registros importados; ${falhas.length} recusado(s):</strong><ul>${falhas.map(f => `<li>${esc(f.colecao)} · ${esc(f.nome)} — ${esc(f.erro)}</li>`).join('')}</ul>
              Se o erro for "permission-denied", confira se as regras do Firestore publicadas são as do arquivo firestore.rules mais recente.</div>`;
            btn.disabled = false;
            return;
          }
          for (const [ano, n] of Object.entries(r.contadores)) {
            const atual = await db.lerDoc('contadores', 'solicitacoes-' + ano);
            await db.salvar('contadores', 'solicitacoes-' + ano, { ano: Number(ano), ultimo: Math.max(n, Number(atual?.ultimo || 0)) });
          }
          if ($('#imp-param', el).checked) await db.salvar('config', 'parametros', r.config);
          await db.registrarLog('importacao.banco_antigo', r.resumo);
          prog.innerHTML = '<p class="ok-txt">✓ Importação concluída. Veja a <a href="#/conferencia">Conferência</a> para revisar possíveis erros do banco antigo.</p>';
          toast('Importação concluída.');
        } catch (err) { prog.innerHTML = `<p class="erro-form">${esc(mensagemErro(err))}</p>`; btn.disabled = false; }
      };
    } catch (err) {
      previa.innerHTML = `<p class="erro-form">Não foi possível ler o arquivo: ${esc(err.message)}</p>`;
    }
  };
  return { titulo: 'Importar banco antigo' };
}

const SQLJS = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/';
function carregarScript(src) {
  return new Promise((ok, falha) => {
    if (window.initSqlJs) return ok();
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => falha(new Error('não foi possível carregar o leitor de SQLite (sem internet?)'));
    document.head.appendChild(s);
  });
}
async function lerSQLite(arquivo) {
  await carregarScript(SQLJS + 'sql-wasm.js');
  const SQL = await window.initSqlJs({ locateFile: f => SQLJS + f });
  const banco = new SQL.Database(new Uint8Array(await arquivo.arrayBuffer()));
  const tabelas = {};
  const nomes = banco.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0]?.values.map(v => v[0]) || [];
  if (!nomes.includes('solicitacoes_diaria') || !nomes.includes('servidores')) throw new Error('este arquivo não parece ser o banco do SISDIFI.');
  for (const n of nomes) {
    const r = banco.exec(`SELECT * FROM "${n.replace(/"/g, '""')}"`)[0];
    tabelas[n] = r ? r.values.map(v => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))) : [];
  }
  banco.close();
  return tabelas;
}

// =============================================================
// AUDITORIA
// =============================================================
const NOMES_ACAO = {
  'solicitacao.criar': 'Criou solicitação', 'solicitacao.editar': 'Editou solicitação', 'solicitacao.cancelar': 'Cancelou solicitação',
  'solicitacao.reativar': 'Reativou solicitação', 'solicitacao.excluir': 'Excluiu solicitação', 'solicitacao.empenho': 'Registrou empenho',
  'reembolso.lancar': 'Lançou reembolso', 'reembolso.editar': 'Editou reembolso', 'reembolso.excluir': 'Excluiu reembolso',
  'servidor.criar': 'Cadastrou servidor', 'servidor.editar': 'Editou servidor', 'secretaria.criar': 'Cadastrou secretaria',
  'secretaria.editar': 'Editou secretaria', 'parametros.alterar': 'Alterou parâmetros', 'usuario.criar': 'Criou usuário',
  'usuario.editar': 'Editou usuário', 'importacao.banco_antigo': 'Importou banco antigo', 'solicitacao.etapa': 'Tramitou solicitação', 'backup.baixar': 'Baixou cópia de segurança', 'servidor.pix': 'Alterou chave Pix', 'valores.proteger': 'Protegeu valores'
};
export function telaAuditoria(el) {
  el.innerHTML = cabecalho('Auditoria', '', 'Últimas 300 ações registradas no sistema.') + '<div id="logs" class="carregando"><div class="spinner"></div></div>';
  db.ultimosLogs(300).then(logs => {
    $('#logs', el).outerHTML = `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Detalhes</th></tr></thead>
      <tbody>${logs.map(l => `<tr><td>${l.em ? esc(l.em.toLocaleString('pt-BR')) : '—'}</td><td>${esc(l.nome)}</td><td>${esc(NOMES_ACAO[l.acao] || l.acao)}</td>
        <td><small>${esc(resumoDetalhe(l.detalhe))}</small></td></tr>`).join('') || '<tr><td colspan="4" class="vazio-linha">Nenhum registro.</td></tr>'}</tbody></table></div>`;
  }).catch(err => { const d = $('#logs', el); if (d) d.outerHTML = `<p class="erro-form">${esc(mensagemErro(err))}</p>`; });
  return { titulo: 'Auditoria' };
}
function resumoDetalhe(d) {
  if (!d) return '';
  return Object.entries(d).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ').slice(0, 300);
}

// =============================================================
// MINHA CONTA
// =============================================================
export function telaConta(el) {
  const s = estado.sessao;
  const soGoogle = !(db.dadosUsuarioAtual()?.provedores || []).includes('password');
  el.innerHTML = `
    ${cabecalho('Minha conta')}
    <section class="cartao estreito">
      <dl class="dl"><dt>Nome</dt><dd>${esc(s.nome)}</dd><dt>E-mail</dt><dd>${esc(s.email)}</dd><dt>Perfil</dt><dd>${esc(PERFIS[s.perfil])}</dd></dl>
      ${soGoogle ? '<p class="muted mt">Você entra com a conta Google — a senha é gerenciada pelo Google.</p>' : ''}
      <h3 class="mt" ${soGoogle ? 'hidden' : ''}>Alterar senha</h3>
      <form id="fsenha" novalidate ${soGoogle ? 'hidden' : ''}>
        <label class="campo"><span>Senha atual</span><input type="password" name="atual" autocomplete="current-password" required></label>
        <label class="campo"><span>Nova senha (mín. 8 caracteres)</span><input type="password" name="nova" autocomplete="new-password" minlength="8" required></label>
        <label class="campo"><span>Repita a nova senha</span><input type="password" name="nova2" autocomplete="new-password" required></label>
        <p class="erro-form" id="erro-senha"></p>
        <div class="acoes-form"><button class="btn" type="submit">Alterar senha</button></div>
      </form>
    </section>`;
  const f = $('#fsenha', el);
  f.onsubmit = async e => {
    e.preventDefault();
    const d = lerForm(f), erro = $('#erro-senha', el);
    if (d.nova.length < 8) return (erro.textContent = 'A nova senha precisa ter 8 caracteres ou mais.');
    if (d.nova !== d.nova2) return (erro.textContent = 'As senhas não conferem.');
    try { await db.alterarMinhaSenha(d.atual, d.nova); f.reset(); erro.textContent = ''; toast('Senha alterada.'); }
    catch (err) { erro.textContent = mensagemErro(err); }
  };
  return { titulo: 'Minha conta' };
}
