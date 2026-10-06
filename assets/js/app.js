// =============================================================
// SISDIFI — Sistema de Diárias Municipais (versão web)
// Inicialização, login e navegação
// =============================================================
import * as db from './db.js';
import { estado, mesclarConfig, PERFIS, pode } from './estado.js';
import { esc, $, toast, mensagemErro, lerForm } from './ui.js';
import { telaPainel } from './views/painel.js';
import { telaListaSolicitacoes, telaNovaSolicitacao, telaDetalheSolicitacao } from './views/solicitacoes.js';
import { telaServidores, telaPerfilServidor } from './views/servidores.js';
import { telaSecretarias } from './views/secretarias.js';
import { telaSimulador } from './views/simulador.js';
import { telaParametros, telaUsuarios, telaImportar, telaAuditoria, telaConta } from './views/admin.js';
import { telaImprimir } from './views/imprimir.js';
import { telaConferencia } from './views/conferencia.js';

const VERSAO = '2.0.0';
const raiz = document.getElementById('app');
let ouvintes = [];
let limpezaTela = null;

const MENU = [
  { rota: 'painel', icone: '◧', texto: 'Painel' },
  { rota: 'solicitacoes/nova', icone: '＋', texto: 'Nova solicitação', editar: true },
  { rota: 'solicitacoes', icone: '☰', texto: 'Solicitações' },
  { rota: 'servidores', icone: '👤', texto: 'Servidores' },
  { rota: 'secretarias', icone: '🏛', texto: 'Secretarias' },
  { rota: 'conferencia', icone: '✓', texto: 'Conferência' },
  { rota: 'simulador', icone: '∑', texto: 'Simulador' },
  { grupo: 'Administração', admin: true },
  { rota: 'parametros', icone: '⚙', texto: 'Parâmetros da lei', admin: true },
  { rota: 'usuarios', icone: '🔑', texto: 'Usuários', admin: true },
  { rota: 'importar', icone: '⇪', texto: 'Importar banco antigo', admin: true },
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
      const perfil = await db.obterPerfil(usuario.uid);
      if (!perfil || !perfil.ativo) return telaSemAcesso(usuario, perfil);
      estado.sessao = { uid: usuario.uid, email: usuario.email, nome: perfil.nome, perfil: perfil.perfil };
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
      <p>Nenhum administrador foi criado ainda. Crie agora a conta do <strong>administrador do sistema</strong>.
      Depois, os demais usuários serão cadastrados por você em <em>Usuários</em>.</p>
      <label class="campo"><span>Nome completo</span><input name="nome" required></label>
      <label class="campo"><span>E-mail</span><input type="email" name="email" required></label>
      <label class="campo"><span>Senha (mínimo 8 caracteres)</span><input type="password" name="senha" minlength="8" required></label>
      <label class="campo"><span>Confirme a senha</span><input type="password" name="senha2" required></label>
      <p class="erro-form" id="erro-admin" role="alert"></p>
      <button class="btn btn-bloco" type="submit">Criar administrador</button>
    </form></div>`;
  const form = $('#form-admin');
  form.onsubmit = async e => {
    e.preventDefault();
    const d = lerForm(form);
    const erro = $('#erro-admin');
    if (!d.nome || !d.email) return (erro.textContent = 'Preencha nome e e-mail.');
    if (d.senha.length < 8) return (erro.textContent = 'A senha precisa ter pelo menos 8 caracteres.');
    if (d.senha !== d.senha2) return (erro.textContent = 'As senhas não conferem.');
    form.querySelector('[type=submit]').disabled = true;
    try { await db.criarPrimeiroAdmin(d); }
    catch (err) { erro.textContent = mensagemErro(err); form.querySelector('[type=submit]').disabled = false; }
  };
}

function telaSemAcesso(usuario, perfil, detalhe = '') {
  const msg = perfil && !perfil.ativo
    ? 'Seu acesso está desativado. Procure o administrador do sistema.'
    : 'Sua conta ainda não foi liberada pelo administrador do sistema.';
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
  ouvintes.push(db.ouvir('solicitacoes', l => {
    estado.solicitacoes = l.sort((a, b) => (b.ano - a.ano) || (b.sequencia - a.sequencia));
    pronto('solicitacoes');
  }, erro('solicitações')));
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
        <nav>${MENU.filter(m => (!m.admin || pode.admin()) && (!m.editar || pode.editar())).map(m => m.grupo
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
            <a href="#/conta" class="usuario-nome" title="Minha conta">${esc(s.nome)}<small>${esc(PERFIS[s.perfil] || s.perfil)}</small></a>
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
  [/^servidores\/([\w-]+)$/, telaPerfilServidor],
  [/^servidores$/, telaServidores],
  [/^secretarias$/, telaSecretarias],
  [/^simulador$/, telaSimulador],
  [/^conferencia$/, telaConferencia],
  [/^parametros$/, telaParametros, 'admin'],
  [/^usuarios$/, telaUsuarios, 'admin'],
  [/^importar$/, telaImportar, 'admin'],
  [/^auditoria$/, telaAuditoria, 'admin'],
  [/^conta$/, telaConta],
  [/^imprimir\/(.+)$/, telaImprimir]
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
