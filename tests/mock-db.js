// Substituto em memória do db.js, usado só nos testes automatizados de navegador (sem Firebase real).
const seed = await (await fetch('/__seed.json')).json();
const colecoes = {};
for (const op of seed.operacoes || []) (colecoes[op.colecao] = colecoes[op.colecao] || new Map()).set(op.id, structuredClone(op.dados));
const usuarios = new Map(Object.entries(seed.usuarios || {}));
colecoes.usuarios = new Map([...usuarios].map(([uid, u]) => [uid, u.perfil]));
const ouvintes = [];
let sessao = null, usuarioAtual = null, cbSessao = null, contador = 1000;
window.__mock = { colecoes, logs: [] };

export const configurado = true;
export function definirSessao(s) { sessao = s; }
const lista = c => [...(colecoes[c] || new Map()).entries()].map(([id, d]) => ({ id, ...structuredClone(d) }));
function notificar(c) { setTimeout(() => ouvintes.filter(o => o.c === c).forEach(o => o.cb(o.id ? (colecoes[c]?.has(o.id) ? { id: o.id, ...structuredClone(colecoes[c].get(o.id)) } : null) : lista(c))), 10); }
const garantir = c => (colecoes[c] = colecoes[c] || new Map());

export function aoMudarSessao(cb) { cbSessao = cb; setTimeout(() => cb(usuarioAtual), 20); return () => {}; }
export async function entrar(email, senha) {
  const u = [...usuarios.entries()].find(([, x]) => x.email === email && x.senha === senha);
  if (!u) { const e = new Error('x'); e.code = 'auth/invalid-credential'; throw e; }
  usuarioAtual = { uid: u[0], email }; cbSessao(usuarioAtual);
}
export async function sair() { usuarioAtual = null; cbSessao(null); }
export async function redefinirSenha() {}
export async function alterarMinhaSenha() {}
export async function bootstrapExiste() { return usuarios.size > 0; }
export async function criarPrimeiroAdmin({ nome, email, senha }) {
  usuarios.set('u-admin', { nome, email, senha, perfil: 'admin', ativo: true });
  garantir('usuarios').set('u-admin', { nome, email, perfil: 'admin', ativo: true });
  usuarioAtual = { uid: 'u-admin', email }; cbSessao(usuarioAtual);
}
export async function obterPerfil(uid) { const u = usuarios.get(uid); return u ? { uid, ...u } : null; }
export async function criarUsuario({ nome, email, senha, perfil }) {
  const uid = 'u' + (contador++);
  usuarios.set(uid, { nome, email, senha, perfil, ativo: true });
  garantir('usuarios').set(uid, { nome, email, perfil, ativo: true }); notificar('usuarios'); return uid;
}
export function ouvir(c, cb) {
  if (c === 'usuarios') { colecoes.usuarios = new Map([...usuarios].map(([uid, u]) => [uid, { nome: u.nome, email: u.email, perfil: u.perfil, ativo: u.ativo }])); }
  const o = { c, cb }; ouvintes.push(o); notificar(c); return () => ouvintes.splice(ouvintes.indexOf(o), 1);
}
export function ouvirDoc(c, id, cb) { const o = { c, id, cb }; ouvintes.push(o); notificar(c); return () => ouvintes.splice(ouvintes.indexOf(o), 1); }
export async function lerDoc(c, id) { return colecoes[c]?.has(id) ? { id, ...colecoes[c].get(id) } : null; }
export async function ultimosLogs() { return window.__mock.logs.slice().reverse(); }
export async function salvar(c, id, dados) {
  const m = garantir(c); id = id || ('id' + (contador++));
  m.set(id, { ...(m.get(id) || {}), ...structuredClone(dados) });
  if (c === 'usuarios' && usuarios.has(id)) Object.assign(usuarios.get(id), dados);
  notificar(c); return id;
}
export async function atualizar(c, id, dados) {
  if (!colecoes[c]?.has(id)) throw new Error('não existe');
  return salvar(c, id, dados);
}
export async function excluir(c, id) { colecoes[c]?.delete(id); notificar(c); }
export async function criarSolicitacoes(listaDados) {
  const criadas = [];
  for (const d of listaDados) {
    const ano = Number(String(d.data_solicitacao).slice(0, 4));
    const cont = garantir('contadores');
    const seq = Number(cont.get('solicitacoes-' + ano)?.ultimo || 0) + 1;
    cont.set('solicitacoes-' + ano, { ultimo: seq, ano });
    const id = 'nova' + (contador++);
    const numero = String(seq).padStart(4, '0') + '/' + ano;
    garantir('solicitacoes').set(id, { ...structuredClone(d), numero, ano, sequencia: seq, criado_por: { nome: sessao?.nome } });
    criadas.push({ id, numero });
  }
  notificar('solicitacoes'); return criadas;
}
export async function gravarEmLote(ops, prog) {
  ops.forEach(o => garantir(o.colecao).set(o.id, { ...(colecoes[o.colecao].get(o.id) || {}), ...structuredClone(o.dados) }));
  new Set(ops.map(o => o.colecao)).forEach(notificar); prog && prog(ops.length, ops.length);
}
export async function registrarLog(acao, detalhe) { window.__mock.logs.push({ acao, detalhe, nome: sessao?.nome, em: new Date() }); }
