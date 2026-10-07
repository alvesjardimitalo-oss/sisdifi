// =============================================================
// SISDIFI — Sistema de Diárias Municipais (versão web)
// Inicialização, login e navegação
// =============================================================
import * as db from './db.js';
import { cargoMotorista } from './privacidade.js';
import { iniciarResponsivo } from './responsivo.js';
import { iniciarTutorial } from './tutorial.js';
import { estado, mesclarConfig, PERFIS, pode, ehSecretaria, acessoRestrito, secretariaNome, CAMPOS_VALOR, etapaDe, definirExercicio, definirHistorico, ehRH } from './estado.js';
import { esc, $, toast, mensagemErro, lerForm } from './ui.js';
import { telaPainel } from './views/painel.js';
import { telaListaSolicitacoes, telaNovaSolicitacao, telaDetalheSolicitacao } from './views/solicitacoes.js';
import { telaServidores, telaPerfilServidor } from './views/servidores.js';
import { telaRelatorioControle } from './views/controle.js';
import { telaSecretarias, juntarFonte } from './views/secretarias.js';
import { telaSimulador } from './views/simulador.js';
import { telaExercicio, anosExercicio } from './views/exercicio.js';
import { telaParametros, telaUsuarios, telaImportar, telaAuditoria, telaConta } from './views/admin.js';
import { telaImprimir } from './views/imprimir.js';
import { telaConferencia } from './views/conferencia.js';
import { telaRelatorio } from './views/relatorio.js';
import { telaOrcamento } from './views/orcamento.js';

const VERSAO = '3.4.0';
const ICONE_GOOGLE = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
const raiz = document.getElementById('app');
let ouvintes = [];
let reivindicando = null; // { nome } durante o primeiro acesso
let limpezaTela = null;

const ICONES = {
  painel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  nova: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  pessoas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.7 2.8 2.4 3 5.2"/>',
  predio: '<path d="M3 21h18M5 21V10M19 21V10M9 21v-6h6v6M12 3 3 8h18z"/>',
  confere: '<path d="M9 11.5 11.5 14 16 9"/><rect x="3" y="3" width="18" height="18" rx="3"/>',
  calc: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8 6.5h8M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>',
  relatorio: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  orcamento: '<path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5z"/><path d="M14 2.5v5h5M9 13h6M9 17h6"/>',
  parametros: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  chave: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14.5 8.5l2.5 2.5"/>',
  importar: '<path d="M12 3v12M7 10l5 5 5-5M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/>',
  historico: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  calendario: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'
};
const icone = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES[n] || ''}</svg>`;

const MENU = [
  { rota: 'painel', icone: 'painel', texto: 'Painel' },
  { rota: 'solicitacoes/nova', icone: 'nova', texto: 'Nova solicitação', editar: true },
  { rota: 'solicitacoes', icone: 'lista', texto: 'Solicitações' },
  { rota: 'servidores', icone: 'pessoas', texto: 'Servidores', servidores: true },
  { rota: 'secretarias', icone: 'predio', texto: 'Secretarias', interno: true },
  { rota: 'conferencia', icone: 'confere', texto: 'Conferência', interno: true, valores: true },
  { rota: 'simulador', icone: 'calc', texto: 'Simulador', simulador: true },
  { rota: 'relatorio', icone: 'relatorio', texto: 'Relatório mensal', relatorio: true },
  { rota: 'controle', icone: 'confere', texto: 'Relatório do Controle', controle: true },
  { rota: 'orcamento', icone: 'orcamento', texto: 'Orçamento', orcamento: true },
  { rota: 'exercicio', icone: 'calendario', texto: 'Exercícios', contabil: true },
  { grupo: 'Administração', admin: true },
  { rota: 'parametros', icone: 'parametros', texto: 'Parâmetros da lei', admin: true },
  { rota: 'usuarios', icone: 'chave', texto: 'Usuários', admin: true },
  { rota: 'importar', icone: 'importar', texto: 'Importar / Backup', admin: true },
  { rota: 'auditoria', icone: 'historico', texto: 'Auditoria', admin: true }
];

iniciarResponsivo();

// Atalhos da barra inferior no celular (os 4 primeiros que o perfil pode usar) + "Menu"
const ABAS = [['painel', 'Painel'], ['solicitacoes/nova', 'Nova'], ['solicitacoes', 'Solicitações'], ['servidores', 'Servidores'], ['relatorio', 'Relatório'], ['controle', 'Controle']];

// ---------------- Inicialização ----------------
if (!db.configurado) {
  telaSemConfiguracao();
} else {
  raiz.innerHTML = '<div class="carregando-tela"><div class="spinner"></div><p>Carregando SISDIFI…</p></div>';
  db.aoMudarSessao(async usuario => {
    pararOuvintes();
    if (!usuario) {
      estado.sessao = null; db.definirSessao(null);
      document.getElementById('toasts')?.remove();
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
      estado.sessao = { uid: usuario.uid, email: usuario.email, nome: perfil.nome, perfil: perfil.perfil, secretaria_id: perfil.secretaria_id || null, secretaria_nome: perfil.secretaria_nome || '', termo_lgpd: perfil.termo_lgpd || null };
      db.definirSessao(estado.sessao);
      iniciarDados();
      montarLayout();
      navegar();
      // primeiro acesso: abre o tutorial depois que a tela carregar
      let visto = !!perfil.tutorial_visto;
      try { visto = visto || localStorage.getItem('sisdifi.tutorial.' + usuario.uid) === '1'; } catch { /* sem armazenamento */ }
      if (!visto) setTimeout(() => { if (estado.sessao?.uid === usuario.uid) abrirTutorial(); }, 1200);
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
    <div class="login-fundo com-capa"><div class="login-capa"><img src="assets/img/brasao.png" alt="" width="88" height="88"><div><strong>SISDIFI</strong><p>Diárias de viagem dos servidores municipais: da solicitação ao pagamento, num só lugar.</p></div></div><form class="login-caixa" id="form-login" novalidate>
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

// Os valores liberados precisam saber a secretaria (a Secretaria só lê os da própria pasta).
// A Contabilidade completa automaticamente os registros antigos que ainda não têm esse campo.
let completouSecretaria = false;
function completarSecretariaNosValores(base, valores) {
  if (completouSecretaria || !pode.contabil()) return;
  completouSecretaria = true;
  const ops = base.filter(s => valores[s.id]?.liberado_ci && s.secretaria_id && valores[s.id].secretaria_id !== s.secretaria_id)
    .map(s => ({ colecao: 'valores', id: s.id, dados: { secretaria_id: s.secretaria_id } }));
  if (ops.length) db.gravarEmLote(ops).catch(() => { completouSecretaria = false; });
}

// CPF e Pix: Contabilidade, consulta e RH leem todos; a Secretaria, os da própria pasta; o Controle Interno não lê.
const lePrivado = () => pode.verValores() || ehRH() || ehSecretaria();

// Migração LGPD (uma vez): a Contabilidade/admin move CPF e Pix que ainda estão no cadastro público para a área privada,
// e marca a visibilidade das solicitações antigas.
let protegeuDados = false;
function protegerDadosAntigos(publicos) {
  if (protegeuDados || !pode.contabil()) return;
  protegeuDados = true;
  const comDado = publicos.filter(s => 'cpf' in s || 'chave_pix' in s);
  if (comDado.length) db.protegerDadosServidores(comDado).then(() => db.registrarLog('servidores.proteger_dados', { quantidade: comDado.length }))
    .catch(() => { protegeuDados = false; });
}
// Indicador "motorista" no cadastro público (as secretarias veem os motoristas de todas as pastas): a Contabilidade completa.
let marcouMotoristas = false;
function marcarMotoristas(publicos) {
  if (marcouMotoristas || !pode.contabil()) return;
  marcouMotoristas = true;
  const ops = publicos.filter(s => s.motorista !== cargoMotorista(s.cargo_funcao))
    .map(s => ({ colecao: 'servidores', id: s.id, dados: { motorista: cargoMotorista(s.cargo_funcao) } }));
  if (ops.length) db.gravarEmLote(ops).catch(() => { marcouMotoristas = false; });
}
// Ajustes de cadastro pedidos pela Contabilidade, aplicados uma única vez em cada secretaria (marcados em "ajustes").
const AJUSTES_SECRETARIAS = [
  { id: 'fontes-2026-10', fontes: s => ['1720 — FEP', ...(/educa/i.test(s.nome) ? ['1550 — QESE - Salário-Educação'] : [])] }
];
let ajustouSecretarias = false;
function ajustarSecretarias() {
  if (ajustouSecretarias || !pode.contabil() || !estado.secretarias.length) return;
  ajustouSecretarias = true;
  const ops = [];
  for (const s of estado.secretarias.filter(x => x.ativo !== false)) {
    const feitos = s.ajustes || [];
    const novos = AJUSTES_SECRETARIAS.filter(a => !feitos.includes(a.id));
    if (!novos.length) continue;
    let fontes = s.fontes_recursos || [];
    for (const a of novos) for (const f of a.fontes(s)) fontes = juntarFonte(fontes, f);
    ops.push({ colecao: 'secretarias', id: s.id, dados: { nome: s.nome, fontes_recursos: fontes, ajustes: [...feitos, ...novos.map(a => a.id)] } });
  }
  if (ops.length) db.gravarEmLote(ops).then(() => db.registrarLog('secretaria.ajuste_fontes', { ajustes: AJUSTES_SECRETARIAS.map(a => a.id), secretarias: ops.length }))
    .catch(() => { ajustouSecretarias = false; });
}
let marcouVisibilidade = false;
function marcarVisibilidade(base) {
  if (marcouVisibilidade || !pode.contabil()) return;
  marcouVisibilidade = true;
  const ops = base.filter(s => typeof s.interna !== 'boolean' || typeof s.visivel_secretaria !== 'boolean')
    .map(s => ({ colecao: 'solicitacoes', id: s.id, dados: { interna: !!s.interna, visivel_secretaria: !s.interna && etapaDe(s) !== 'legado' } }));
  if (ops.length) db.gravarEmLote(ops).catch(() => { marcouVisibilidade = false; });
}

// ---------------- Dados em tempo real ----------------
function iniciarDados() {
  estado.prontos.clear();
  completouSecretaria = false; protegeuDados = false; marcouVisibilidade = false; marcouMotoristas = false; ajustouSecretarias = false;
  definirExercicio(estado.exercicio); // sincroniza os filtros das telas com o exercício salvo
  const pronto = nome => { estado.prontos.add(nome); atualizarTelaViva(nome); };
  const erro = nome => e => toast(`Erro ao carregar ${nome}: ${mensagemErro(e)}`, 'erro');
  // Servidores: cadastro público + CPF/Pix da área privada (só para quem pode ler; a secretaria só os da própria pasta).
  let svPublico = null, svPrivado = lePrivado() ? null : {};
  const juntarServidores = () => {
    if (!svPublico || !svPrivado) return;
    estado.servidores = svPublico.map(s => svPrivado[s.id] ? { ...s, cpf: svPrivado[s.id].cpf ?? s.cpf, chave_pix: svPrivado[s.id].chave_pix ?? s.chave_pix } : s)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    pronto('servidores');
    protegerDadosAntigos(svPublico);
    marcarMotoristas(svPublico);
  };
  if (ehSecretaria()) {
    // Secretaria: só os servidores da própria pasta e os motoristas de todas (as regras do Firestore também garantem)
    const partes = { minha: null, motoristas: null };
    const unir = () => { if (!partes.minha || !partes.motoristas) return; const m = new Map([...partes.motoristas, ...partes.minha].map(s => [s.id, s])); svPublico = [...m.values()]; juntarServidores(); };
    ouvintes.push(db.ouvir('servidores', l => { partes.minha = l; unir(); }, erro('servidores'), ['secretaria_id', estado.sessao.secretaria_id || '-']));
    ouvintes.push(db.ouvir('servidores', l => { partes.motoristas = l; unir(); }, () => { partes.motoristas = []; unir(); }, ['motorista', true]));
  } else ouvintes.push(db.ouvir('servidores', l => { svPublico = l; juntarServidores(); }, erro('servidores')));
  if (lePrivado()) ouvintes.push(db.ouvir('servidores_privado', l => { svPrivado = Object.fromEntries(l.map(p => [p.id, p])); juntarServidores(); },
    () => { svPrivado = {}; juntarServidores(); }, ehSecretaria() ? ['secretaria_id', estado.sessao.secretaria_id || '-'] : null));
  ouvintes.push(db.ouvir('secretarias', l => { estado.secretarias = l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')); pronto('secretarias'); ajustarSecretarias(); }, erro('secretarias')));
  // Secretaria só recebe as solicitações da própria secretaria (as regras do Firestore também garantem isso).
  // Os valores ficam na coleção protegida "valores" e só são lidos por quem pode vê-los.
  let base = null, valores = pode.verValores() ? null : {};
  const juntar = () => {
    if (!base || !valores) return;
    // Lançamentos diretos da Contabilidade não aparecem para Secretaria, Controle Interno e RH.
    // A Secretaria também não vê o histórico importado do sistema antigo (etapa "legado").
    const visiveis = acessoRestrito() ? base.filter(s => !s.interna && !(ehSecretaria() && etapaDe(s) === 'legado')) : base;
    estado.solicitacoesBrutas = visiveis;
    // O histórico do sistema antigo fica escondido em todas as telas, a não ser que o usuário ligue "Histórico antigo".
    const emUso = estado.verHistorico && !ehSecretaria() ? visiveis : visiveis.filter(s => etapaDe(s) !== 'legado');
    estado.solicitacoes = emUso.map(s => {
      const v = valores[s.id];
      if (!v) return s;
      const extra = {};
      for (const k of CAMPOS_VALOR) if (v[k] !== undefined) extra[k] = v[k];
      return { ...s, ...extra };
    }).sort((a, b) => (b.ano - a.ano) || (b.sequencia - a.sequencia));
    pronto('solicitacoes');
    completarSecretariaNosValores(base, valores);
  };
  // As regras do Firestore só entregam à Secretaria o que é visível para ela, e ao Controle Interno/RH o que não é lançamento interno.
  const filtroSol = ehSecretaria() ? [['secretaria_id', estado.sessao.secretaria_id || '-'], ['visivel_secretaria', true]]
    : acessoRestrito() ? ['interna', false] : null;
  ouvintes.push(db.ouvir('solicitacoes', l => { base = l; juntar(); marcarVisibilidade(l); }, erro('solicitações'), filtroSol));
  rejuntarSolicitacoes = juntar;
  if (pode.verValores()) ouvintes.push(db.ouvir('valores', l => { valores = Object.fromEntries(l.map(v => [v.id, v])); juntar(); }, erro('valores')));
  // Controle Interno, RH e Secretaria: recebem só os valores já liberados (solicitações empenhadas), para o relatório.
  // A Secretaria recebe apenas os da própria pasta.
  else if (pode.relatorio()) {
    valores = null;
    const filtroV = ehSecretaria() ? [['liberado_ci', true], ['secretaria_id', estado.sessao.secretaria_id || '-']] : ['liberado_ci', true];
    ouvintes.push(db.ouvir('valores', l => { valores = Object.fromEntries(l.map(v => [v.id, v])); juntar(); }, erro('valores'), filtroV));
  }
  // Orçamento: Secretaria só recebe os documentos e fichas da própria pasta.
  if (pode.orcamento() || pode.solicitar()) {
    const filtroSec = ehSecretaria() ? ['secretaria_id', estado.sessao.secretaria_id || '-'] : null;
    ouvintes.push(db.ouvir('fichas', l => { estado.fichas = l; pronto('fichas'); }, () => pronto('fichas'), filtroSec));
    ouvintes.push(db.ouvir('orcamentos', l => { estado.orcamentos = l; pronto('orcamentos'); }, () => pronto('orcamentos'), filtroSec));
  }
  ouvintes.push(db.ouvir('distancias', l => { estado.distancias = Object.fromEntries(l.map(d => [d.id, d])); pronto('distancias'); }, () => {}));
  ouvintes.push(db.ouvir('exercicios', l => { estado.exercicios = l; pronto('exercicios'); preencherExercicios(); }, () => pronto('exercicios')));
  ouvintes.push(db.ouvirDoc('config', 'parametros', d => { estado.config = mesclarConfig(d); pronto('config'); }, erro('parâmetros')));
  if (pode.admin()) ouvintes.push(db.ouvir('usuarios', l => { estado.usuarios = l; pronto('usuarios'); }, erro('usuários')));
}

function pararOuvintes() {
  ouvintes.forEach(u => { try { u(); } catch { /* já encerrado */ } });
  ouvintes = [];
}

let telaAtual = null;
let pendenteRender = null;
function preencherExercicios() {
  const sel = $('#sel-exercicio');
  if (!sel) return;
  const anos = anosExercicio();
  if (!anos.includes(estado.exercicio)) anos.push(estado.exercicio);
  sel.innerHTML = anos.sort((a, b) => b - a).map(a => `<option ${a === estado.exercicio ? 'selected' : ''}>${a}</option>`).join('');
}
let rejuntarSolicitacoes = null;
window.addEventListener('sisdifi:historico', () => {
  const c = $('#chk-historico'); if (c) c.checked = estado.verHistorico;
  if (rejuntarSolicitacoes) rejuntarSolicitacoes();
});
window.addEventListener('sisdifi:exercicio', () => { preencherExercicios(); if (telaAtual && estado.sessao && $('#conteudo')) desenharTela(true); });

function atualizarTelaViva() {
  // Re-desenha telas de consulta quando os dados mudam. Formulários não são redesenhados para não perder o que está sendo digitado.
  if (!telaAtual || !telaAtual.viva) return;
  clearTimeout(pendenteRender);
  pendenteRender = setTimeout(() => desenharTela(true), 120);
}

/** Abre o tutorial e, ao terminar ou pular, marca como visto (no cadastro do usuário e neste navegador). */
export function abrirTutorial() {
  if (location.hash !== '#/painel') location.hash = '#/painel';
  setTimeout(() => iniciarTutorial(() => {
    const uid = estado.sessao?.uid; if (!uid) return;
    try { localStorage.setItem('sisdifi.tutorial.' + uid, '1'); } catch { /* sem armazenamento */ }
    db.marcarTutorialVisto().catch(() => {});
  }), location.hash === '#/painel' ? 50 : 500);
}

// ---------------- Layout e rotas ----------------
function montarLayout() {
  const s = estado.sessao;
  const itensMenu = MENU.filter(m => (!m.admin || pode.admin()) && (!m.editar || pode.solicitar()) && (!m.interno || !acessoRestrito()) && (!m.servidores || !acessoRestrito() || ehSecretaria()) && (!m.valores || pode.verValores()) && (!m.simulador || pode.simular()) && (!m.relatorio || pode.relatorio()) && (!m.orcamento || pode.orcamento()) && (!m.contabil || pode.contabil()) && (!m.controle || pode.controle()));
  const abas = ABAS.map(([r, t]) => [itensMenu.find(m => m.rota === r), t]).filter(([m]) => m).slice(0, 4);
  raiz.innerHTML = `
    <div class="layout">
      <aside class="lateral" id="lateral">
        ${marca()}
        <nav>${itensMenu.map(m => m.grupo
          ? `<div class="menu-grupo">${esc(m.grupo)}</div>`
          : `<a href="#/${m.rota}" data-rota="${m.rota}"><span class="ico" aria-hidden="true">${icone(m.icone)}</span>${esc(m.texto)}</a>`).join('')}
        </nav>
        <div class="lateral-usuario"><a href="#/conta">${esc(s.nome)}<small>${esc(PERFIS[s.perfil] || s.perfil)}</small></a></div>
        <div class="versao">v${VERSAO}</div>
      </aside>
      <div class="veu" id="veu" hidden></div>
      <div class="principal">
        <header class="topo">
          <button class="btn-icone menu-mobile" id="abrir-menu" aria-label="Menu">☰</button>
          <div class="topo-titulo" id="topo-titulo"></div>
          <label class="topo-exercicio" title="Exercício (ano) em uso: painel, solicitações, relatório e orçamento mostram este ano"><span>Exercício</span>
            <select id="sel-exercicio"></select></label>
          ${s.perfil === 'secretaria' ? '' : `<label class="topo-historico" title="Mostra as diárias importadas do sistema antigo em todas as telas"><input type="checkbox" id="chk-historico" ${estado.verHistorico ? 'checked' : ''}> <span>Histórico antigo</span></label>`}
          <button type="button" class="btn-icone topo-ajuda" id="abrir-tutorial" title="Tutorial: como usar o sistema" aria-label="Abrir o tutorial">?</button>
          <div class="usuario">
            <a href="#/conta" class="usuario-nome" title="Minha conta">${esc(s.nome)}<small>${esc(PERFIS[s.perfil] || s.perfil)}${s.perfil === 'secretaria' ? ' · ' + esc(s.secretaria_nome || 'sem secretaria') : ''}</small></a>
            <button class="btn btn-sec btn-peq" id="btn-sair">Sair</button>
          </div>
        </header>
        <main id="conteudo" tabindex="-1"></main>
      </div>
      <nav class="abas-mobile" aria-label="Atalhos">
        ${abas.map(([m, t]) => `<a href="#/${m.rota}" data-aba="${m.rota}"><span class="ico" aria-hidden="true">${icone(m.icone)}</span>${esc(t)}</a>`).join('')}
        <button type="button" id="abas-menu"><span class="ico" aria-hidden="true">${icone('menu')}</span>Menu</button>
      </nav>
    </div>`;
  $('#btn-sair').onclick = () => db.sair();
  $('#abrir-tutorial').onclick = () => abrirTutorial();
  $('#sel-exercicio').onchange = e => definirExercicio(e.target.value);
  $('#chk-historico')?.addEventListener('change', e => definirHistorico(e.target.checked));
  preencherExercicios();
  const menu = abrir => { $('#lateral').classList.toggle('aberta', abrir); $('#veu').hidden = !abrir; document.body.classList.toggle('sem-rolagem', abrir); };
  $('#abrir-menu').onclick = () => menu(!$('#lateral').classList.contains('aberta'));
  $('#abas-menu').onclick = () => menu(true);
  $('#veu').onclick = () => menu(false);
}

const ROTAS = [
  [/^painel$/, telaPainel],
  [/^solicitacoes\/nova$/, telaNovaSolicitacao],
  [/^solicitacoes\/([\w-]+)$/, telaDetalheSolicitacao],
  [/^solicitacoes$/, telaListaSolicitacoes],
  [/^servidores\/([\w-]+)$/, telaPerfilServidor, 'interno'],
  [/^servidores$/, telaServidores, 'servidores'],
  [/^secretarias$/, telaSecretarias, 'interno'],
  [/^simulador$/, telaSimulador, 'simular'],
  [/^exercicio$/, telaExercicio, 'contabil'],
  [/^imprimir\/(simulacao)$/, telaImprimir, 'simular'],
  [/^conferencia$/, telaConferencia, 'valores'],
  [/^parametros$/, telaParametros, 'admin'],
  [/^usuarios$/, telaUsuarios, 'admin'],
  [/^importar$/, telaImportar, 'admin'],
  [/^auditoria$/, telaAuditoria, 'admin'],
  [/^conta$/, telaConta],
  [/^relatorio$/, telaRelatorio, 'relatorio'],
  [/^controle$/, telaRelatorioControle, 'controle'],
  [/^orcamento$/, telaOrcamento, 'orcamento'],
  [/^imprimir\/(mensal)$/, telaImprimir, 'relatorio'],
  [/^imprimir\/(extrato\/[\w-]+)$/, telaImprimir, 'relatorio'],
  [/^imprimir\/(.+)$/, telaImprimir, 'valores']
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
      if (req === 'interno' && acessoRestrito()) break;
      if (req === 'servidores' && acessoRestrito() && !ehSecretaria()) break;
      if (req === 'valores' && (ehSecretaria() || !pode.verValores())) break;
      if (req === 'relatorio' && !pode.relatorio()) break;
      if (req === 'simular' && !pode.simular()) break;
      if (req === 'contabil' && !pode.contabil()) break;
      if (req === 'controle' && !pode.controle()) break;
      if (req === 'orcamento' && !pode.orcamento()) break;
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
  document.querySelectorAll('.abas-mobile a').forEach(a => {
    const r = a.dataset.aba;
    a.classList.toggle('ativo', caminho === r || (r === 'solicitacoes' && /^solicitacoes\/(?!nova)/.test(caminho)) || (r !== 'solicitacoes/nova' && r !== 'solicitacoes' && caminho.startsWith(r + '/')));
  });
  $('#lateral')?.classList.remove('aberta');
  if ($('#veu')) $('#veu').hidden = true;
  document.body.classList.remove('sem-rolagem');
  if (atualizacao) window.scrollTo(0, rolagem); else window.scrollTo(0, 0);
}

window.addEventListener('hashchange', navegar);
window.addEventListener('sisdifi:redesenhar', () => desenharTela(true));
