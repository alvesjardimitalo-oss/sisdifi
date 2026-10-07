// =============================================================
// SISDIFI — Sistema de Diárias Municipais (versão web)
// Inicialização, login e navegação
// =============================================================
import * as db from './db.js';
import { estado, mesclarConfig, PERFIS, pode, ehSecretaria, secretariaNome } from './estado.js';
import { esc, $, toast, mensagemErro, lerForm } from './ui.js';
import { telaPainel } from './views/painel.js';
import { telaListaSolicitacoes, telaNovaSolicitacao, telaDetalheSolicitacao } from './views/solicitacoes.js';
import { telaServidores, telaPerfilServidor } from './views/servidores.js';
import { telaSecretarias } from './views/secretarias.js';
import { telaSimulador } from './views/simulador.js';
import { telaParametros, telaUsuarios, telaImportar, telaAuditoria, telaConta } from './views/admin.js';
import { telaImprimir } from './views/imprimir.js';
import { telaConferencia } from './views/conferencia.js';

const VERSAO = '2.1.0';
const ICONE_GOOGLE = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
const raiz = document.getElementById('app');
let ouvintes = [];
let reivindicando = null; // { nome } durante o primeiro acesso
let limpezaTela = null;

const MENU = [
  { rota: 'painel', icone: '◧', texto: 'Painel' },
  { rota: 'solicitacoes/nova', icone: '＋', texto: 'Nova solicitação', editar: true },
  { rota: 'solicitacoes', icone: '☰', texto: 'Solicitações' },
  { rota: 'servidores', icone: '👤', texto: 'Servidores', interno: true },
  { rota: 'secretarias', icone: '🏛', texto: 'Secretarias', interno: true },
  { rota: 'conferencia', icone: '✓', texto: 'Conferência', interno: true },
  { rota: 'simulador', icone: '∑', texto: 'Simulador', interno: true },
  { grupo: 'Administração', admin: true },
  { rota: 'parametros', icone: '⚙', texto: 'Parâmetros da lei', admin: true },
  { rota: 'usuarios', icone: '🔑', texto: 'Usuários', admin: true },
  { rota: 'importar', icone: '⇪', texto: 'Importar / Backup', admin: true },
  { rota: 'auditoria', icone: '🕘', texto: 'Auditoria', admin: true }
];

// ---------------- Inicialização ----------------
if (!db.configurado) {
  telaSemConfiguracao();
} else {
  raiz.innerHTML = '<div class="carregando-tela"><div class="spinner"></div><p>Carregando SISDIFI…</p></div>';
  db.aoMudarSessao(async usuario => {
    pararOuvintes();
    if (!usuario) {
      estado.sessao = null; db.definirSessao(null);
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      return telaLogin();
    }
    try {
      let perfil = await db.obterPerfil(usuario.uid);
      if (!perfil && reivindicando) {
        // Veio da tela "Primeiro acesso": este usuário vira o administrador.
        await db.reivindicarAdmin(reivindicando.nome);
        reivindicando = null;
        perfil = await db.obterPerfil(usuario.uid);
      } else if (!perfil) {
        try { await db.solicitarAcesso(); perfil = await db.obterPerfil(usuario.uid); } catch { /* sem permissão: segue como não liberado */ }
      }
      if (!perfil || !perfil.ativo) return telaSemAcesso(usuario, perfil);
      estado.sessao = { uid: usuario.uid, email: usuario.email, nome: perfil.nome, perfil: perfil.perfil, secretaria_id: perfil.secretaria_id || null, secretaria_nome: perfil.secretaria_nome || '' };
      db.definirSessao(estado.sessao);
      iniciarDados();
      montarLayout();
      navegar();
    } catch (e) {
      telaSemAcesso(usuario, null, mensagemErro(e));
    }
  });
}

function telaSemConfiguracao() {
  raiz.innerHTML = `
    <div class="login-fundo"><div class="login-caixa">
      ${marca()}
      <h2>Configuração pendente</h2>
      <p>O arquivo <code>assets/js/firebase-config.js</code> ainda não tem os dados do seu projeto Firebase.</p>
      <ol class="passos">
        <li>No GitHub, abra <code>assets/js/firebase-config.js</code> e clique no lápis (editar).</li>
        <li>Troque cada <code>COLE_AQUI</code> pelos valores do <em>firebaseConfig</em> do Console Firebase.</li>
        <li>Clique em <strong>Commit changes</strong> e recarregue esta página em 1 minuto.</li>
      </ol>
    </div></div>`;
}

function marca() {
  return `<div class="marca"><img src="assets/img/brasao.png" alt="" width="44" height="44">
    <div><strong>SISDIFI</strong><span>Sistema de Diárias Municipais</span></div></div>`;
}

async function telaLogin() {
  let primeiroAcesso = false;
  try { primeiroAcesso = !(await db.bootstrapExiste()); } catch { /* offline: mostra login normal */ }
  if (primeiroAcesso) return telaPrimeiroAdmin();
  raiz.innerHTML = `
    <div class="login-fundo"><form class="login-caixa" id="form-login" novalidate>
      ${marca()}
      <h2>Entrar</h2>
      <label class="campo"><span>E-mail</span><input type="email" name="email" autocomplete="username" required></label>
      <label class="campo"><span>Senha</span><input type="password" name="senha" autocomplete="current-password" required></label>
      <p class="erro-form" id="erro-login" role="alert"></p>
      <button class="btn btn-bloco" type="submit">Entrar</button>
      <div class="ou"><span>ou</span></div>
      <button class="btn btn-sec btn-bloco btn-google" type="button" id="google">${ICONE_GOOGLE} Entrar com Google</button>
      <button class="link" type="button" id="esqueci">Esqueci minha senha</button>
      <p class="rodape-login">Acesso restrito a usuários autorizados pela administração.</p>
    </form></div>`;
  const form = $('#form-login');
  form.onsubmit = async e => {
    e.preventDefault();
    const { email, senha } = lerForm(form);
    const erro = $('#erro-login');
    if (!email || !senha) { erro.textContent = 'Informe e-mail e senha.'; return; }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Entrando…'; erro.textContent = '';
    try { await db.entrar(email, senha); }
    catch (err) { erro.textContent = mensagemErro(err); btn.disabled = false; btn.textContent = 'Entrar'; }
  };
  $('#google').onclick = async () => {
    try { await db.entrarComGoogle(); }
    catch (err) { if (err?.code !== 'auth/popup-closed-by-user') $('#erro-login').textContent = mensagemErro(err); }
  };
  $('#esqueci').onclick = async () => {
    const email = form.email.value.trim();
    if (!email) { $('#erro-login').textContent = 'Digite seu e-mail acima e clique novamente em "Esqueci minha senha".'; return; }
    try { await db.redefinirSenha(email); toast('Se o e-mail estiver cadastrado, você receberá o link para criar nova senha.'); }
    catch (err) { $('#erro-login').textContent = mensagemErro(err); }
  };
}

function telaPrimeiroAdmin() {
  raiz.innerHTML = `
    <div class="login-fundo"><form class="login-caixa" id="form-admin" novalidate>
      ${marca()}
      <h2>Primeiro acesso</h2>
      <p>Nenhum administrador foi definido ainda. Entre com a conta que será o <strong>administrador do sistema</strong>.
      Depois, os demais usuários são liberados por você em <em>Usuários</em>.</p>
      <button class="btn btn-sec btn-bloco btn-google" type="button" id="google-admin">${ICONE_GOOGLE} Entrar com Google e tornar-me administrador</button>
      <div class="ou"><span>ou com e-mail e senha</span></div>
      <label class="campo"><span>Nome completo</span><input name="nome" autocomplete="name"></label>
      <label class="campo"><span>E-mail</span><input type="email" name="email" autocomplete="username" required></label>
      <label class="campo"><span>Senha</span><input type="password" name="senha" autocomplete="current-password" required></label>
      <p class="dica">Se a conta já existe no Firebase, use a senha dela. Se não existe, ela será criada (mínimo 8 caracteres).</p>
      <p class="erro-form" id="erro-admin" role="alert"></p>
      <button class="btn btn-bloco" type="submit">Entrar e tornar-me administrador</button>
    </form></div>`;
  const form = $('#form-admin');
  const erro = $('#erro-admin');
  $('#google-admin').onclick = async () => {
    reivindicando = { nome: form.nome.value.trim() };
    try { await db.entrarComGoogle(); }
    catch (err) { reivindicando = null; if (err?.code !== 'auth/popup-closed-by-user') erro.textContent = mensagemErro(err); }
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const d = lerForm(form);
    if (!d.email || !d.senha) return (erro.textContent = 'Informe e-mail e senha.');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; erro.textContent = '';
    reivindicando = { nome: d.nome };
    try {
      try { await db.entrar(d.email, d.senha); }
      catch (err) {
        // Conta ainda não existe: cria.
        if (!['auth/invalid-credential', 'auth/user-not-found'].includes(err?.code)) throw err;
        if (d.senha.length < 8) throw Object.assign(new Error('Senha incorreta — ou, para criar a conta, use pelo menos 8 caracteres.'), {});
        try { await db.criarConta(d.email, d.senha); }
        catch (e2) { if (e2?.code === 'auth/email-already-in-use') throw Object.assign(new Error('Este e-mail já tem conta no Firebase, mas a senha não confere. Use a senha correta ou "Entrar com Google".'), {}); throw e2; }
      }
    } catch (err) {
      reivindicando = null; erro.textContent = mensagemErro(err); btn.disabled = false;
    }
  };
}

function telaSemAcesso(usuario, perfil, detalhe = '') {
  const msg = perfil && !perfil.ativo && !perfil.pendente
    ? 'Seu acesso está desativado. Procure o administrador do sistema.'
    : 'Seu pedido de acesso foi registrado. Aguarde o administrador liberar sua conta em Usuários e entre novamente.';
  raiz.innerHTML = `
    <div class="login-fundo"><div class="login-caixa">
      ${marca()}
      <h2>Acesso não liberado</h2>
      <p>${esc(msg)}</p>
      <p class="muted">${esc(usuario.email)}</p>
      ${detalhe ? `<p class="erro-form">${esc(detalhe)}</p>` : ''}
      <button class="btn btn-bloco" id="sair">Sair</button>
    </div></div>`;
  $('#sair').onclick = () => db.sair();
}

// ---------------- Dados em tempo real ----------------
function iniciarDados() {
  estado.prontos.clear();
  const pronto = nome => { estado.prontos.add(nome); atualizarTelaViva(nome); };
  const erro = nome => e => toast(`Erro ao carregar ${nome}: ${mensagemErro(e)}`, 'erro');
  ouvintes.push(db.ouvir('servidores', l => { estado.servidores = l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); pronto('servidores'); }, erro('servidores')));
  ouvintes.push(db.ouvir('secretarias', l => { estado.secretarias = l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); pronto('secretarias'); }, erro('secretarias')));
  // Secretaria só recebe as solicitações da própria secretaria (as regras do Firestore também garantem isso).
  ouvintes.push(db.ouvir('solicitacoes', l => {
    estado.solicitacoes = l.sort((a, b) => (b.ano - a.ano) || (b.sequencia - a.sequencia));
    pronto('solicitacoes');
  }, erro('solicitações'), ehSecretaria() ? ['secretaria_id', estado.sessao.secretaria_id || '-'] : null));
  ouvintes.push(db.ouvir('distancias', l => { estado.distancias = Object.fromEntries(l.map(d => [d.id, d])); pronto('distancias'); }, () => {}));
  ouvintes.push(db.ouvirDoc('config', 'parametros', d => { estado.config = mesclarConfig(d); pronto('config'); }, erro('parâmetros')));
  if (pode.admin()) ouvintes.push(db.ouvir('usuarios', l => { estado.usuarios = l; pronto('usuarios'); }, erro('usuários')));
}

function pararOuvintes() {
  ouvintes.forEach(u => { try { u(); } catch { /* já encerrado */ } });
  ouvintes = [];
}

let telaAtual = null;
let pendenteRender = null;
function atualizarTelaViva() {
  // Re-desenha telas de consulta quando os dados mudam. Formulários não são redesenhados para não perder o que está sendo digitado.
  if (!telaAtual || !telaAtual.viva) return;
  clearTimeout(pendenteRender);
  pendenteRender = setTimeout(() => desenharTela(true), 120);
}

// ---------------- Layout e rotas ----------------
function montarLayout() {
  const s = estado.sessao;
  raiz.innerHTML = `
    <div class="layout">
      <aside class="lateral" id="lateral">
        ${marca()}
        <nav>${MENU.filter(m => (!m.admin || pode.admin()) && (!m.editar || pode.solicitar()) && (!m.interno || !ehSecretaria())).map(m => m.grupo
          ? `<div class="menu-grupo">${esc(m.grupo)}</div>`
          : `<a href="#/${m.rota}" data-rota="${m.rota}"><span class="ico" aria-hidden="true">${m.icone}</span>${esc(m.texto)}</a>`).join('')}
        </nav>
        <div class="versao">v${VERSAO}</div>
      </aside>
      <div class="principal">
        <header class="topo">
          <button class="btn-icone menu-mobile" id="abrir-menu" aria-label="Menu">☰</button>
          <div class="topo-titulo" id="topo-titulo"></div>
          <div class="usuario">
            <a href="#/conta" class="usuario-nome" title="Minha conta">${esc(s.nome)}<small>${esc(PERFIS[s.perfil] || s.perfil)}${s.perfil === 'secretaria' ? ' · ' + esc(s.secretaria_nome || 'sem secretaria') : ''}</small></a>
            <button class="btn btn-sec btn-peq" id="btn-sair">Sair</button>
          </div>
        </header>
        <main id="conteudo" tabindex="-1"></main>
      </div>
    </div>`;
  $('#btn-sair').onclick = () => db.sair();
  $('#abrir-menu').onclick = () => $('#lateral').classList.toggle('aberta');
}

const ROTAS = [
  [/^painel$/, telaPainel],
  [/^solicitacoes\/nova$/, telaNovaSolicitacao],
  [/^solicitacoes\/([\w-]+)$/, telaDetalheSolicitacao],
  [/^solicitacoes$/, telaListaSolicitacoes],
  [/^servidores\/([\w-]+)$/, telaPerfilServidor, 'interno'],
  [/^servidores$/, telaServidores, 'interno'],
  [/^secretarias$/, telaSecretarias, 'interno'],
  [/^simulador$/, telaSimulador, 'interno'],
  [/^conferencia$/, telaConferencia, 'interno'],
  [/^parametros$/, telaParametros, 'admin'],
  [/^usuarios$/, telaUsuarios, 'admin'],
  [/^importar$/, telaImportar, 'admin'],
  [/^auditoria$/, telaAuditoria, 'admin'],
  [/^conta$/, telaConta],
  [/^imprimir\/(.+)$/, telaImprimir, 'interno']
];

function rotaAtual() {
  const h = location.hash.replace(/^#\/?/, '');
  const [caminho, qs] = h.split('?');
  return { caminho: caminho || 'painel', query: new URLSearchParams(qs || '') };
}

function navegar() {
  if (!estado.sessao) return;
  desenharTela(false);
}

function desenharTela(atualizacao) {
  const { caminho, query } = rotaAtual();
  let alvo = null, args = [];
  for (const [re, fn, req] of ROTAS) {
    const m = caminho.match(re);
    if (m) {
      if (req === 'admin' && !pode.admin()) break;
      if (req === 'interno' && ehSecretaria()) break;
      alvo = fn; args = m.slice(1); break;
    }
  }
  const conteudo = $('#conteudo');
  if (!conteudo) return;
  document.body.classList.toggle('modo-impressao', caminho.startsWith('imprimir/'));
  if (!atualizacao && limpezaTela) { try { limpezaTela(); } catch { /* ignora */ } limpezaTela = null; }
  if (!alvo) {
    conteudo.innerHTML = `<div class="vazio"><h2>Página não encontrada</h2><p><a href="#/painel">Voltar ao painel</a></p></div>`;
    telaAtual = null; return;
  }
  const rolagem = atualizacao ? window.scrollY : 0;
  const ret = alvo(conteudo, { args, query, atualizacao }) || {};
  telaAtual = { viva: !!ret.viva };
  if (ret.limpar) limpezaTela = ret.limpar;
  $('#topo-titulo').textContent = ret.titulo || '';
  document.title = (ret.titulo ? ret.titulo + ' · ' : '') + 'SISDIFI';
  document.querySelectorAll('.lateral nav a').forEach(a => {
    const r = a.dataset.rota;
    a.classList.toggle('ativo', caminho === r || (r !== 'solicitacoes/nova' && caminho.startsWith(r + '/') && !caminho.startsWith('solicitacoes/nova')));
  });
  $('#lateral')?.classList.remove('aberta');
  if (atualizacao) window.scrollTo(0, rolagem); else window.scrollTo(0, 0);
}

window.addEventListener('hashchange', navegar);
window.addEventListener('sisdifi:redesenhar', () => desenharTela(true));
