// =============================================================
// SISDIFI — Camada de dados (Firebase Authentication + Cloud Firestore)
// Todo acesso ao Firebase passa por aqui; as telas usam só estas funções.
// =============================================================
import { firebaseConfig } from './firebase-config.js';
import { separarServidor } from './privacidade.js';
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail,
  createUserWithEmailAndPassword, updatePassword, EmailAuthProvider, reauthenticateWithCredential,
  setPersistence, browserLocalPersistence, GoogleAuthProvider, signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, runTransaction,
  writeBatch, serverTimestamp, addDoc, query, orderBy, limit as limitar, getDocs, where, deleteField
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const configurado = !Object.values(firebaseConfig).some(v => !v || String(v).includes('COLE_AQUI'));

let app, auth, fs;
if (configurado) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  try {
    // Cache local: reduz leituras (e custo) ao reabrir o sistema.
    fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    fs = initializeFirestore(app, {});
  }
}

let sessao = null; // { uid, email, nome, perfil }
export function definirSessao(s) { sessao = s; }
function autor() { return sessao ? { uid: sessao.uid, nome: sessao.nome || sessao.email } : null; }

// ---------------- Autenticação ----------------
export function aoMudarSessao(cb) { return onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email } : null)); }
export const entrar = (email, senha) => signInWithEmailAndPassword(auth, email.trim(), senha);
export const sair = () => signOut(auth);
// Reutiliza a sessão existente para chamadas autenticadas ao módulo de anexos.
export async function tokenAnexos() {
  if (!auth.currentUser) throw Error('Sessão encerrada. Entre novamente no SISDIFI.');
  return auth.currentUser.getIdToken();
}
export const redefinirSenha = email => sendPasswordResetEmail(auth, email.trim());
/** Admin exclui o cadastro de um usuário (as regras impedem excluir a si mesmo). A conta de login
 *  continua existindo no Firebase Auth, mas sem cadastro ela não entra: se tentar, vira pedido de acesso bloqueado. */
export const excluirUsuario = uid => deleteDoc(doc(fs, 'usuarios', uid));

export async function alterarMinhaSenha(atual, nova) {
  const u = auth.currentUser;
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, atual));
  await updatePassword(u, nova);
}

export async function entrarComGoogle() {
  const prov = new GoogleAuthProvider();
  prov.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, prov);
}
/* Permissão para escrever nas planilhas Google da Contabilidade.
   Usa uma instância separada do Firebase, então a conta Google escolhida aqui
   (a que edita a planilha) não troca a sessão do SISDIFI, que pode ser de
   e-mail e senha. Devolve só o token de acesso do Google, que vale ~1 hora e
   fica na memória da página — nada é gravado. */
export async function tokenGooglePlanilhas() {
  const app2 = initializeApp(firebaseConfig, 'planilhas-' + Date.now());
  try {
    const prov = new GoogleAuthProvider();
    prov.addScope('https://www.googleapis.com/auth/spreadsheets');
    prov.setCustomParameters({ prompt: 'select_account' });
    const r = await signInWithPopup(getAuth(app2), prov);
    const token = GoogleAuthProvider.credentialFromResult(r)?.accessToken;
    if (!token) throw Error('O Google não devolveu a permissão para a planilha.');
    return { token, email: r.user?.email || '' };
  } finally {
    deleteApp(app2).catch(() => {});
  }
}
export const criarConta = (email, senha) => createUserWithEmailAndPassword(auth, email.trim(), senha);
export function dadosUsuarioAtual() {
  const u = auth.currentUser;
  return u ? { uid: u.uid, email: u.email, nome: u.displayName || '', provedores: u.providerData.map(p => p.providerId) } : null;
}

/** Primeiro acesso: o usuário logado (Google ou e-mail) vira o administrador. Só funciona uma vez (garantido pelas regras). */
export async function reivindicarAdmin(nome) {
  const u = auth.currentUser;
  const b = writeBatch(fs);
  b.set(doc(fs, 'sistema', 'bootstrap'), { uid: u.uid, criado_em: serverTimestamp() });
  b.set(doc(fs, 'usuarios', u.uid), { nome: nome || u.displayName || u.email, email: (u.email || '').toLowerCase(), perfil: 'admin', ativo: true, criado_em: serverTimestamp() });
  await b.commit();
}

/** Quem entra sem cadastro (ex.: conta Google nova) fica registrado como pendente até o admin liberar. */
export async function solicitarAcesso() {
  const u = auth.currentUser;
  await setDoc(doc(fs, 'usuarios', u.uid), {
    nome: u.displayName || u.email, email: (u.email || '').toLowerCase(), perfil: 'consulta', ativo: false, pendente: true, criado_em: serverTimestamp()
  });
}

export async function bootstrapExiste() {
  const s = await getDoc(doc(fs, 'sistema', 'bootstrap'));
  return s.exists();
}

/** Primeiro acesso: cria a conta e a marca como administrador (só funciona uma vez — garantido pelas regras). */
export async function criarPrimeiroAdmin({ nome, email, senha }) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), senha);
  const uid = cred.user.uid;
  const b = writeBatch(fs);
  b.set(doc(fs, 'sistema', 'bootstrap'), { uid, criado_em: serverTimestamp() });
  b.set(doc(fs, 'usuarios', uid), { nome, email: email.trim().toLowerCase(), perfil: 'admin', ativo: true, criado_em: serverTimestamp() });
  await b.commit();
  return uid;
}

/** O próprio usuário marca que já viu o tutorial do primeiro acesso (só esse campo; as regras conferem). */
export async function marcarTutorialVisto() {
  const u = auth.currentUser;
  if (u) await updateDoc(doc(fs, 'usuarios', u.uid), { tutorial_visto: new Date().toISOString() });
}
/** O próprio usuário registra o aceite do termo de responsabilidade sobre dados pessoais. */
export async function aceitarTermo(aceite) {
  const u = auth.currentUser;
  if (u) await updateDoc(doc(fs, 'usuarios', u.uid), { termo_lgpd: aceite });
}
export async function obterPerfil(uid) {
  const s = await getDoc(doc(fs, 'usuarios', uid));
  return s.exists() ? { uid, ...s.data() } : null;
}

/**
 * Admin cria um usuário sem perder a própria sessão:
 * usa uma segunda instância do Firebase só para criar a conta.
 */
export async function criarUsuario({ nome, email, senha, perfil, secretaria_id = null, secretaria_nome = '' }) {
  const sec = initializeApp(firebaseConfig, 'criador-' + Date.now());
  try {
    const cred = await createUserWithEmailAndPassword(getAuth(sec), email.trim(), senha);
    const uid = cred.user.uid;
    await setDoc(doc(fs, 'usuarios', uid), {
      nome, email: email.trim().toLowerCase(), perfil, secretaria_id, secretaria_nome, ativo: true, criado_em: serverTimestamp(), criado_por: autor()
    });
    await signOut(getAuth(sec));
    return uid;
  } finally {
    await deleteApp(sec);
  }
}

// ---------------- Leitura em tempo real ----------------
const cachePrivadoSolicitacao = new Map();
async function hidratarSolicitacao(dados) {
  if (!dados || !dados.id || !sessao || !['admin', 'operador', 'rh', 'secretaria'].includes(sessao.perfil)) return dados;
  try {
    let pendente = cachePrivadoSolicitacao.get(dados.id);
    if (!pendente) {
      pendente = getDoc(doc(fs, 'solicitacoes_privado', dados.id))
        .then(s => s.exists() ? s.data() : null)
        .catch(() => null);
      cachePrivadoSolicitacao.set(dados.id, pendente);
    }
    const privado = await pendente;
    if (!privado) return dados;
    return {
      ...dados,
      servidor: {
        ...(dados.servidor || {}),
        ...(privado.cpf ? { cpf: privado.cpf } : {}),
        ...(privado.cpf_anterior ? { cpf_anterior: privado.cpf_anterior } : {}),
        ...(privado.chave_pix ? { chave_pix: privado.chave_pix } : {})
      }
    };
  } catch { return dados; }
}
async function hidratarLista(colecao, itens) {
  if (colecao !== 'solicitacoes') return itens;
  return Promise.all(itens.map(hidratarSolicitacao));
}
/** filtro opcional: [campo, valor] → só documentos com campo == valor (ex.: solicitações da própria secretaria). */
export function ouvir(colecao, cb, onErro, filtro = null) {
  const filtros = !filtro ? [] : Array.isArray(filtro[0]) ? [...filtro] : [filtro];
  // Regras do Firestore não filtram documentos. A consulta precisa declarar o marcador
  // de migração para que o perfil consulta nunca tente ler snapshots históricos com PII.
  if (['solicitacoes', 'servidores'].includes(colecao) && sessao?.perfil === 'consulta') filtros.push(['privacidade_migrada', true]);
  if (colecao === 'servidores' && sessao?.perfil === 'secretaria'
      && filtros.some(([campo, valor]) => campo === 'motorista' && valor === true)) filtros.push(['privacidade_migrada', true]);
  const alvo = filtros.length ? query(collection(fs, colecao), ...filtros.map(([c, v]) => where(c, '==', v))) : collection(fs, colecao);
  return onSnapshot(alvo,
    snap => { hidratarLista(colecao, snap.docs.map(d => ({ id: d.id, ...d.data() }))).then(cb).catch(e => onErro && onErro(e)); },
    e => onErro && onErro(e));
}
export function ouvirDoc(colecao, id, cb, onErro) {
  return onSnapshot(doc(fs, colecao, id), s => {
    const item = s.exists() ? { id: s.id, ...s.data() } : null;
    if (colecao === 'solicitacoes' && item) hidratarSolicitacao(item).then(cb).catch(e => onErro && onErro(e));
    else cb(item);
  }, e => onErro && onErro(e));
}
export async function lerDoc(colecao, id) {
  const s = await getDoc(doc(fs, colecao, id));
  if (!s.exists()) return null;
  const item = { id: s.id, ...s.data() };
  return colecao === 'solicitacoes' ? hidratarSolicitacao(item) : item;
}
export async function ultimosLogs(n = 200) {
  const snap = await getDocs(query(collection(fs, 'logs'), orderBy('em', 'desc'), limitar(n)));
  return snap.docs.map(d => ({ id: d.id, ...d.data(), em: d.data().em?.toDate?.() || null }));
}

// Migração atômica da versão inicial do Duodécimo: retiramos os registros
// de exercicios/{ano}, que é legível para outros perfis, e movemos para
// duodecimo_anos/{ano}, protegido pelas regras para admin/operador.
// Só começa a escrever quando as regras da coleção privada estiverem publicadas.
export async function migrarDuodecimoLegado() {
  if (!sessao || !['admin','operador'].includes(sessao.perfil)) throw Error('Acesso restrito à Contabilidade e ADM.');
  const snap = await getDocs(collection(fs,'exercicios'));
  let migrados = 0, exerciciosMigrados = 0;
  for (const item of snap.docs) {
    if (!Object.prototype.hasOwnProperty.call(item.data(),'duodecimo')) continue;
    const refOrigem = doc(fs,'exercicios',item.id);
    const refDestino = doc(fs,'duodecimo_anos',item.id);
    const quantidade = await runTransaction(fs,async tx=>{
      const antigo = await tx.get(refOrigem);
      if (!antigo.exists() || !Object.prototype.hasOwnProperty.call(antigo.data(),'duodecimo')) return 0;
      const reservado = await tx.get(refDestino);
      const antigos = antigo.data().duodecimo?.repasses || {};
      const existentes = reservado.exists() ? (reservado.data().repasses || {}) : {};
      // A versão privada prevalece sobre uma cópia antiga se ambas existirem.
      const unificados = { ...antigos, ...existentes };
      tx.set(refDestino,{ano:Number(item.id),repasses:unificados,
        migradoEm:new Date().toISOString()},{merge:true});
      tx.update(refOrigem,{duodecimo:deleteField()});
      return Object.keys(antigos).length;
    });
    exerciciosMigrados++;
    migrados += quantidade;
  }
  return {migrados,exerciciosMigrados};
}

// ---------------- Escrita ----------------
/**
 * Servidores: CPF e chave Pix vão para "servidores_privado"; o índice "cpfs/{cpf}" aponta para o servidor.
 * Devolve as operações [ref, dados] para gravar juntas (lote atômico).
 */
function opsServidor(id, dados, carimbo) {
  const { publico, privado } = separarServidor(dados);
  const temDadosPrivados = Object.keys(privado).some(k => k !== 'secretaria_id');
  const marcador = dados.privacidade_migrada === true || temDadosPrivados ? { privacidade_migrada: true } : {};
  const ops = [[doc(fs, 'servidores', id), { ...publico, ...marcador, ...carimbo }]];
  if (Object.keys(privado).filter(k => k !== 'secretaria_id').length) {
    ops.push([doc(fs, 'servidores_privado', id), privado]);
    if (privado.cpf) ops.push([doc(fs, 'cpfs', privado.cpf), { servidor_id: id }]);
  } else if ('secretaria_id' in publico) {
    // mudou a lotação: a área privada acompanha (a secretaria nova passa a ver CPF e Pix)
    ops.push([doc(fs, 'servidores_privado', id), { secretaria_id: publico.secretaria_id || null }]);
  }
  return ops;
}
async function gravarServidor(id, dados, carimbo) {
  const b = writeBatch(fs);
  for (const [ref, d] of opsServidor(id, dados, carimbo)) b.set(ref, d, { merge: true });
  await b.commit();
}

const COLECOES_COM_AUDITORIA_ATOMICA = new Set([
  'retencoes_config', 'valores', 'duodecimo_anos', 'retencoes_anos'
]);
function incluirLogNaGravacao(batch, acao, detalhe) {
  if (!sessao) throw Error('Sessão encerrada. Entre novamente para registrar a operação auditável.');
  batch.set(doc(collection(fs, 'logs')), {
    acao, detalhe, uid: sessao.uid, nome: String(sessao.nome || sessao.email || sessao.uid), em: serverTimestamp()
  });
}

export async function salvar(colecao, id, dados, auditoria = null) {
  const carimbo = { atualizado_em: serverTimestamp(), atualizado_por: autor() };
  if (colecao === 'servidores') {
    const novoId = id || doc(collection(fs, 'servidores')).id;
    await gravarServidor(novoId, id ? dados : { ...dados, privacidade_migrada: true }, id ? carimbo : { criado_em: serverTimestamp(), criado_por: autor(), ...carimbo });
    return novoId;
  }
  if (COLECOES_COM_AUDITORIA_ATOMICA.has(colecao)) {
    const ref = id ? doc(fs, colecao, id) : doc(collection(fs, colecao));
    const batch = writeBatch(fs);
    const payload = {
      ...dados,
      ...(!id ? { criado_em: serverTimestamp(), criado_por: autor() } : {}),
      ...carimbo
    };
    if (id) batch.set(ref, payload, { merge: true });
    else batch.set(ref, payload);
    incluirLogNaGravacao(batch, auditoria?.acao || colecao + '.salvar', auditoria?.detalhe || {
      documento: ref.id, operacao: id ? 'mesclar' : 'criar',
      campos: Object.keys(dados).slice(0, 20)
    });
    await batch.commit();
    return ref.id;
  }
  if (id) {
    await setDoc(doc(fs, colecao, id), { ...dados, ...carimbo }, { merge: true });
    return id;
  }
  const ref = await addDoc(collection(fs, colecao), { ...dados, criado_em: serverTimestamp(), criado_por: autor(), ...carimbo });
  return ref.id;
}
export async function atualizar(colecao, id, dados) {
  if (colecao === 'servidores') return gravarServidor(id, dados, { atualizado_em: serverTimestamp(), atualizado_por: autor() });
  const carimbo = { atualizado_em: serverTimestamp(), atualizado_por: autor() };
  if (COLECOES_COM_AUDITORIA_ATOMICA.has(colecao)) {
    const batch = writeBatch(fs);
    batch.update(doc(fs, colecao, id), { ...dados, ...carimbo });
    incluirLogNaGravacao(batch, colecao + '.atualizar', { documento: id, campos: Object.keys(dados).slice(0, 20) });
    await batch.commit();
    return;
  }
  await updateDoc(doc(fs, colecao, id), { ...dados, ...carimbo });
}
export async function excluir(colecao, id) {
  if (colecao === 'solicitacoes') {
    const batch = writeBatch(fs);
    batch.delete(doc(fs, 'solicitacoes', id));
    batch.delete(doc(fs, 'solicitacoes_privado', id));
    await batch.commit();
    cachePrivadoSolicitacao.delete(id);
    return;
  }
  if (COLECOES_COM_AUDITORIA_ATOMICA.has(colecao)) {
    const batch = writeBatch(fs);
    batch.delete(doc(fs, colecao, id));
    incluirLogNaGravacao(batch, colecao + '.excluir', { documento: id });
    await batch.commit();
    return;
  }
  await deleteDoc(doc(fs, colecao, id));
}
/** Substitui o documento inteiro (sem mesclar com o que havia), com carimbo de autoria. */
export async function substituir(colecao, id, dados) {
  const carimbo = { atualizado_em: serverTimestamp(), atualizado_por: autor() };
  if (COLECOES_COM_AUDITORIA_ATOMICA.has(colecao)) {
    const batch = writeBatch(fs);
    batch.set(doc(fs, colecao, id), { ...dados, ...carimbo });
    incluirLogNaGravacao(batch, colecao + '.substituir', { documento: id, campos: Object.keys(dados).slice(0, 20) });
    await batch.commit();
    return;
  }
  await setDoc(doc(fs, colecao, id), { ...dados, ...carimbo });
}
/** Marca um campo para ser apagado numa gravação com salvar() (mesclagem). */
export const campoApagado = () => deleteField();
/** Exclui o servidor por completo: cadastro, área privada (CPF/Pix) e índice do CPF. */
export async function excluirServidor(id, cpf) {
  const b = writeBatch(fs);
  b.delete(doc(fs, 'servidores', id));
  b.delete(doc(fs, 'servidores_privado', id));
  const c = String(cpf || '').replace(/\D/g, '');
  if (c.length === 11) b.delete(doc(fs, 'cpfs', c));
  await b.commit();
}

/**
 * Cria uma ou mais solicitações com numeração sequencial por ano (0001/2026...).
 * A numeração é feita em transação: dois usuários salvando ao mesmo tempo nunca recebem o mesmo número.
 */
export async function criarSolicitacoes(lista) {
  const criadas = [];
  for (const dados of lista) {
    const ano = Number(String(dados.data_solicitacao).slice(0, 4));
    const contadorRef = doc(fs, 'contadores', 'solicitacoes-' + ano);
    const novaRef = doc(collection(fs, 'solicitacoes'));
    const servidorOriginal = dados.servidor || {};
    const servidorPublico = { ...servidorOriginal };
    const cpf = String(servidorPublico.cpf || '').replace(/\D/g, '');
    const cpfAnterior = String(servidorPublico.cpf_anterior || '').replace(/\D/g, '');
    const chavePix = String(servidorPublico.chave_pix || '');
    if (cpf && cpf.length !== 11) throw Error('O CPF do servidor está incompleto ou inválido. Confira o cadastro antes de criar a solicitação.');
    if (cpfAnterior && cpfAnterior.length !== 11) throw Error('O CPF anterior está inválido. Confira o cadastro antes de criar a solicitação.');
    if (chavePix.length > 140) throw Error('A chave Pix excede o limite seguro de 140 caracteres. Confira o cadastro.');
    delete servidorPublico.cpf;
    delete servidorPublico.chave_pix;
    delete servidorPublico.cpf_anterior;
    const dadosPublicos = { ...dados, servidor: servidorPublico };
    const numero = await runTransaction(fs, async tx => {
      const c = await tx.get(contadorRef);
      const seq = (c.exists() ? Number(c.data().ultimo || 0) : 0) + 1;
      const numero = String(seq).padStart(4, '0') + '/' + ano;
      tx.set(contadorRef, { ultimo: seq, ano }, { merge: true });
      tx.set(novaRef, {
        ...dadosPublicos, privacidade_migrada: true, numero, ano, sequencia: seq,
        criado_em: serverTimestamp(), criado_por: autor(), atualizado_em: serverTimestamp(), atualizado_por: autor()
      });
      if (cpf || cpfAnterior || chavePix) {
        tx.set(doc(fs, 'solicitacoes_privado', novaRef.id), {
          solicitacao_id: novaRef.id,
          servidor_id: String(dados.servidor_id || ''),
          secretaria_id: dados.secretaria_id || null,
          ...(cpf ? { cpf } : {}),
          ...(cpfAnterior ? { cpf_anterior: cpfAnterior } : {}),
          ...(chavePix ? { chave_pix: chavePix } : {})
        });
      }
      return numero;
    });
    criadas.push({ id: novaRef.id, numero });
  }
  return criadas;
}

/**
 * Retenções nas transferências (FPM, ITR, IPI, LC 176): grava novos lançamentos em retencoes_anos/{ano}
 * com numeração sequencial (RET 0001/2026...) feita em transação — nunca repete número.
 * lista = registros já validados (sem número). Retorna os registros com id, seq e numero.
 */
export async function lancarRetencoes(ano, lista, meta = {}) {
  if (!sessao || !['admin', 'operador'].includes(sessao.perfil)) throw Error('Acesso restrito à Contabilidade e ADM.');
  const ref = doc(fs, 'retencoes_anos', String(ano));
  const logRef = doc(collection(fs, 'logs'));
  return runTransaction(fs, async tx => {
    const atual = await tx.get(ref);
    let seq = atual.exists() ? Number(atual.data().ultimo || 0) : 0;
    const agora = new Date().toISOString(), quem = sessao.nome || sessao.email;
    const novos = {}, saida = [];
    for (const r of lista) {
      seq += 1;
      const id = crypto.randomUUID();
      const numero = 'RET ' + String(seq).padStart(4, '0') + '/' + ano;
      novos[id] = { ...r, seq, numero, anulado: false, criadoEm: agora, criadoPor: quem, atualizadoEm: agora, atualizadoPor: quem };
      saida.push({ id, ...novos[id] });
    }
    tx.set(ref, { ano: Number(ano), ultimo: seq, lancamentos: novos, atualizado_em: serverTimestamp(), atualizado_por: autor() }, { merge: true });
    tx.set(logRef, {
      acao: 'retencoes.lancar',
      detalhe: { ano: Number(ano), origem: String(meta.origem || 'manual'), quantidade: saida.length, total_centavos: saida.reduce((s, r) => s + Number(r.centavos || 0), 0), numeros: saida.map(r => r.numero) },
      uid: sessao.uid, nome: sessao.nome || sessao.email, em: serverTimestamp()
    });
    return saida;
  });
}
/**
 * Renumera as retenções do ano (em transação). calcular(lancamentos) devolve { mudancas: { id: { seq, numero } }, ultimo }.
 */
export async function renumerarRetencoes(ano, calcular) {
  if (!sessao || !['admin', 'operador'].includes(sessao.perfil)) throw Error('Acesso restrito à Contabilidade e ADM.');
  const ref = doc(fs, 'retencoes_anos', String(ano));
  const logRef = doc(collection(fs, 'logs'));
  return runTransaction(fs, async tx => {
    const atual = await tx.get(ref);
    if (!atual.exists()) return 0;
    const { mudancas, ultimo } = calcular(atual.data().lancamentos || {});
    const n = Object.keys(mudancas).length;
    if (n) {
      tx.set(ref, { ultimo, lancamentos: mudancas, atualizado_em: serverTimestamp(), atualizado_por: autor() }, { merge: true });
      tx.set(logRef, {
        acao: 'retencoes.renumerar',
        detalhe: { ano: Number(ano), quantidade: n },
        uid: sessao.uid, nome: sessao.nome || sessao.email, em: serverTimestamp()
      });
    }
    return n;
  });
}
/** Gravação em lote (importação). operacoes = [{ colecao, id, dados }] */
export async function gravarEmLote(operacoes, progresso) {
  const falhas = [];
  // cada operação vira uma ou mais gravações (servidores: público + privado + índice do CPF)
  const expandir = op => op.colecao === 'servidores' ? opsServidor(op.id, op.dados, {}) : [[doc(fs, op.colecao, op.id), op.dados]];
  for (let i = 0; i < operacoes.length; i += 100) {
    const parte = operacoes.slice(i, i + 100);
    const b = writeBatch(fs);
    for (const op of parte) for (const [ref, d] of expandir(op)) b.set(ref, d, { merge: true });
    const auditaveis = parte.filter(op => COLECOES_COM_AUDITORIA_ATOMICA.has(op.colecao));
    if (auditaveis.length) incluirLogNaGravacao(b, 'financeiro.lote', {
      colecoes: [...new Set(auditaveis.map(op => op.colecao))],
      quantidade: auditaveis.length,
      documentos: auditaveis.map(op => op.id).slice(0, 100)
    });
    try {
      await b.commit();
    } catch (e) {
      // Um registro recusado derruba o lote inteiro: grava um a um para salvar o resto e apontar qual falhou.
      for (const op of parte) {
        try {
          const b1 = writeBatch(fs);
          for (const [ref, d] of expandir(op)) b1.set(ref, d, { merge: true });
          if (COLECOES_COM_AUDITORIA_ATOMICA.has(op.colecao)) incluirLogNaGravacao(b1, 'financeiro.lote', {
            colecoes: [op.colecao], quantidade: 1, documentos: [op.id]
          });
          await b1.commit();
        } catch (e2) { falhas.push({ colecao: op.colecao, id: op.id, nome: op.dados.nome || op.dados.numero || op.id, erro: e2.code || e2.message }); }
      }
    }
    progresso && progresso(Math.min(i + 100, operacoes.length), operacoes.length);
  }
  return falhas;
}

// A revisão fiscal e seu registro devem ser confirmados na mesma transação.
export async function salvarConfiguracaoFiscal(dados, campos, acao, detalhe) {
  const ref = doc(fs, 'config', 'fiscal');
  const log = doc(collection(fs, 'logs'));
  return runTransaction(fs, async tx => {
    const atual = (await tx.get(ref)).data() || {};
    const carimbo = { atualizado_em: serverTimestamp(), atualizado_por: autor() };
    tx.set(ref, { ...dados, ...carimbo }, { mergeFields: [...campos, ...Object.keys(carimbo)] });
    const registro = { ...detalhe };
    if (acao === 'fiscal.aliquotas') {
      registro.antes = { issPadrao: atual.issPadrao ?? null, issPorCodigo: atual.issPorCodigo || {} };
      registro.depois = dados;
    }
    tx.set(log, { acao, detalhe: registro, uid: sessao.uid, nome: String(sessao.nome || sessao.email || sessao.uid), em: serverTimestamp() });
  });
}

export async function registrarLog(acao, detalhe = {}) {
  if (!sessao) return;
  try {
    await addDoc(collection(fs, 'logs'), { acao, detalhe, uid: sessao.uid, nome: String(sessao.nome || sessao.email || sessao.uid), em: serverTimestamp() });
  } catch { /* log nunca impede a operação */ }
}

/**
 * Migra CPF/Pix dos snapshots históricos de solicitações para uma coleção privada.
 * A execução é manual e restrita à Contabilidade/ADM; não apaga nem altera outros campos do processo.
 */
export async function protegerDadosSolicitacoes(progresso) {
  if (!sessao || !['admin', 'operador'].includes(sessao.perfil)) throw Error('Acesso restrito à Contabilidade e ADM.');
  const snap = await getDocs(collection(fs, 'solicitacoes'));
  const pendentes = snap.docs.filter(s => {
    const servidor = s.data().servidor || {};
    return s.data().privacidade_migrada !== true || ['cpf', 'chave_pix', 'cpf_anterior'].some(k => Object.prototype.hasOwnProperty.call(servidor, k));
  });
  let migrados = 0, ignorados = 0;
  for (let i = 0; i < pendentes.length; i += 120) {
    const lote = pendentes.slice(i, i + 120);
    const b = writeBatch(fs);
    const migradosAntes = migrados;
    for (const item of lote) {
      const dados = item.data(), servidor = { ...(dados.servidor || {}) };
      const cpf = String(servidor.cpf || '').replace(/\D/g, '');
      const cpfAnterior = String(servidor.cpf_anterior || '').replace(/\D/g, '');
      const chavePix = String(servidor.chave_pix || '');
      const servidorId = String(dados.servidor_id || '');
      if ((cpf && cpf.length !== 11) || (cpfAnterior && cpfAnterior.length !== 11)
          || chavePix.length > 140
          || ((cpf || cpfAnterior || chavePix) && (!servidorId || !dados.secretaria_id))) {
        ignorados++;
        continue;
      }
      delete servidor.cpf;
      delete servidor.chave_pix;
      delete servidor.cpf_anterior;
      if (cpf || cpfAnterior || chavePix) {
        b.set(doc(fs, 'solicitacoes_privado', item.id), {
          solicitacao_id: item.id, servidor_id: servidorId, secretaria_id: dados.secretaria_id,
          ...(cpf ? { cpf } : {}),
          ...(cpfAnterior ? { cpf_anterior: cpfAnterior } : {}),
          ...(chavePix ? { chave_pix: chavePix } : {})
        }, { merge: true });
      }
      b.update(doc(fs, 'solicitacoes', item.id), {
        servidor, privacidade_migrada: true, atualizado_em: serverTimestamp(), atualizado_por: autor()
      });
      migrados++;
    }
    if (migrados > migradosAntes) await b.commit();
    progresso && progresso(Math.min(i + 120, pendentes.length), pendentes.length);
  }
  await registrarLog('privacidade.solicitacoes_migrar', { migrados, ignorados });
  return { migrados, ignorados, total: pendentes.length };
}

/** Move campos de valor do documento da solicitação para a coleção protegida "valores". lista = [{ id, valores }] */
/** Migração LGPD: tira CPF e Pix do cadastro público e grava na área privada (lista = servidores com cpf no doc público). */
export async function protegerDadosServidores(lista, progresso) {
  for (let i = 0; i < lista.length; i += 120) {
    const b = writeBatch(fs);
    for (const sv of lista.slice(i, i + 120)) {
      const { publico, privado } = separarServidor({ cpf: sv.cpf || '', cpf_anterior: sv.cpf_anterior || '', chave_pix: sv.chave_pix || '', secretaria_id: sv.secretaria_id || null });
      b.set(doc(fs, 'servidores_privado', sv.id), privado, { merge: true });
      if (privado.cpf) b.set(doc(fs, 'cpfs', privado.cpf), { servidor_id: sv.id }, { merge: true });
      b.update(doc(fs, 'servidores', sv.id), { cpf_mascara: publico.cpf_mascara || sv.cpf_mascara || '', cpf_valido: 'cpf_valido' in publico ? !!publico.cpf_valido : !!sv.cpf_valido, tem_pix: 'tem_pix' in publico ? !!publico.tem_pix : !!sv.tem_pix, privacidade_migrada: true, cpf: deleteField(), cpf_anterior: deleteField(), chave_pix: deleteField() });
    }
    await b.commit();
    progresso && progresso(Math.min(i + 120, lista.length), lista.length);
  }
}

export async function moverValoresProtegidos(lista, progresso) {
  for (let i = 0; i < lista.length; i += 200) {
    const b = writeBatch(fs);
    for (const { id, valores } of lista.slice(i, i + 200)) {
      b.set(doc(fs, 'valores', id), valores, { merge: true });
      b.update(doc(fs, 'solicitacoes', id), Object.fromEntries(Object.keys(valores).map(k => [k, deleteField()])));
    }
    await b.commit();
    progresso && progresso(Math.min(i + 200, lista.length), lista.length);
  }
}

// ---------------- PDFs do orçamento (guardados em partes no Firestore, sem custo de Storage) ----------------
const TAM_PARTE = 700000; // caracteres base64 por documento (limite do Firestore é 1 MB por documento)

function paraBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Envia um PDF: cria o registro em "orcamentos" e grava o conteúdo em partes na subcoleção "partes". */
export async function enviarPDF(meta, arquivo, progresso) {
  const b64 = paraBase64(await arquivo.arrayBuffer());
  const partes = Math.ceil(b64.length / TAM_PARTE);
  const ref = doc(collection(fs, 'orcamentos'));
  for (let i = 0; i < partes; i++) {
    await setDoc(doc(fs, 'orcamentos', ref.id, 'partes', String(i)), { i, dados: b64.slice(i * TAM_PARTE, (i + 1) * TAM_PARTE), secretaria_id: meta.secretaria_id });
    progresso && progresso(i + 1, partes);
  }
  // o registro só aparece para as secretarias depois que todas as partes foram gravadas
  await setDoc(ref, { ...meta, nome_arquivo: arquivo.name, tamanho: arquivo.size, partes, enviado_por: autor(), enviado_em: serverTimestamp() });
  return ref.id;
}

export async function baixarPDF(id, partes = 1) {
  // lê parte por parte pelo id (assim as regras conferem a secretaria de cada documento)
  const docs = await Promise.all(Array.from({ length: partes }, (_, i) => getDoc(doc(fs, 'orcamentos', id, 'partes', String(i)))));
  const b64 = docs.map(d => d.data().dados).join('');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}

export async function excluirPDF(id, partes) {
  for (let i = 0; i < partes; i++) await deleteDoc(doc(fs, 'orcamentos', id, 'partes', String(i)));
  await deleteDoc(doc(fs, 'orcamentos', id));
}
