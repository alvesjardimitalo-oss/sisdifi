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
export const redefinirSenha = email => sendPasswordResetEmail(auth, email.trim());

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
/** filtro opcional: [campo, valor] → só documentos com campo == valor (ex.: solicitações da própria secretaria). */
export function ouvir(colecao, cb, onErro, filtro = null) {
  // filtro: [campo, valor] ou lista de [campo, valor] (todas as condições)
  const filtros = !filtro ? [] : Array.isArray(filtro[0]) ? filtro : [filtro];
  const alvo = filtros.length ? query(collection(fs, colecao), ...filtros.map(([c, v]) => where(c, '==', v))) : collection(fs, colecao);
  return onSnapshot(alvo,
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    e => onErro && onErro(e));
}
export function ouvirDoc(colecao, id, cb, onErro) {
  return onSnapshot(doc(fs, colecao, id), s => cb(s.exists() ? { id: s.id, ...s.data() } : null), e => onErro && onErro(e));
}
export async function lerDoc(colecao, id) {
  const s = await getDoc(doc(fs, colecao, id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export async function ultimosLogs(n = 200) {
  const snap = await getDocs(query(collection(fs, 'logs'), orderBy('em', 'desc'), limitar(n)));
  return snap.docs.map(d => ({ id: d.id, ...d.data(), em: d.data().em?.toDate?.() || null }));
}

// ---------------- Escrita ----------------
/**
 * Servidores: CPF e chave Pix vão para "servidores_privado"; o índice "cpfs/{cpf}" aponta para o servidor.
 * Devolve as operações [ref, dados] para gravar juntas (lote atômico).
 */
function opsServidor(id, dados, carimbo) {
  const { publico, privado } = separarServidor(dados);
  const ops = [[doc(fs, 'servidores', id), { ...publico, ...carimbo }]];
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

export async function salvar(colecao, id, dados) {
  const carimbo = { atualizado_em: serverTimestamp(), atualizado_por: autor() };
  if (colecao === 'servidores') {
    const novoId = id || doc(collection(fs, 'servidores')).id;
    await gravarServidor(novoId, dados, id ? carimbo : { criado_em: serverTimestamp(), criado_por: autor(), ...carimbo });
    return novoId;
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
  await updateDoc(doc(fs, colecao, id), { ...dados, atualizado_em: serverTimestamp(), atualizado_por: autor() });
}
export const excluir = (colecao, id) => deleteDoc(doc(fs, colecao, id));
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
    const numero = await runTransaction(fs, async tx => {
      const c = await tx.get(contadorRef);
      const seq = (c.exists() ? Number(c.data().ultimo || 0) : 0) + 1;
      const numero = String(seq).padStart(4, '0') + '/' + ano;
      tx.set(contadorRef, { ultimo: seq, ano }, { merge: true });
      tx.set(novaRef, {
        ...dados, numero, ano, sequencia: seq,
        criado_em: serverTimestamp(), criado_por: autor(), atualizado_em: serverTimestamp(), atualizado_por: autor()
      });
      return numero;
    });
    criadas.push({ id: novaRef.id, numero });
  }
  return criadas;
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
    try {
      await b.commit();
    } catch (e) {
      // Um registro recusado derruba o lote inteiro: grava um a um para salvar o resto e apontar qual falhou.
      for (const op of parte) {
        try { const b1 = writeBatch(fs); for (const [ref, d] of expandir(op)) b1.set(ref, d, { merge: true }); await b1.commit(); }
        catch (e2) { falhas.push({ colecao: op.colecao, id: op.id, nome: op.dados.nome || op.dados.numero || op.id, erro: e2.code || e2.message }); }
      }
    }
    progresso && progresso(Math.min(i + 100, operacoes.length), operacoes.length);
  }
  return falhas;
}

export async function registrarLog(acao, detalhe = {}) {
  if (!sessao) return;
  try {
    await addDoc(collection(fs, 'logs'), { acao, detalhe, uid: sessao.uid, nome: sessao.nome || sessao.email, em: serverTimestamp() });
  } catch { /* log nunca impede a operação */ }
}

/** Move campos de valor do documento da solicitação para a coleção protegida "valores". lista = [{ id, valores }] */
/** Migração LGPD: tira CPF e Pix do cadastro público e grava na área privada (lista = servidores com cpf no doc público). */
export async function protegerDadosServidores(lista, progresso) {
  for (let i = 0; i < lista.length; i += 120) {
    const b = writeBatch(fs);
    for (const sv of lista.slice(i, i + 120)) {
      const { publico, privado } = separarServidor({ cpf: sv.cpf || '', chave_pix: sv.chave_pix || '', secretaria_id: sv.secretaria_id || null });
      b.set(doc(fs, 'servidores_privado', sv.id), privado, { merge: true });
      if (privado.cpf) b.set(doc(fs, 'cpfs', privado.cpf), { servidor_id: sv.id }, { merge: true });
      b.update(doc(fs, 'servidores', sv.id), { cpf_mascara: publico.cpf_mascara || '', cpf_valido: !!publico.cpf_valido, tem_pix: !!publico.tem_pix, cpf: deleteField(), chave_pix: deleteField() });
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
