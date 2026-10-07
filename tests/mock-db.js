// Substituto em memória do db.js, usado só nos testes automatizados de navegador (sem Firebase real).
import { separarServidor } from './privacidade.js';
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
export async function bootstrapExiste() { return [...usuarios.values()].some(u => u.perfil === 'admin'); }
export async function criarPrimeiroAdmin({ nome, email, senha }) {
  usuarios.set('u-admin', { nome, email, senha, perfil: 'admin', ativo: true });
  garantir('usuarios').set('u-admin', { nome, email, perfil: 'admin', ativo: true });
  usuarioAtual = { uid: 'u-admin', email }; cbSessao(usuarioAtual);
}
export async function obterPerfil(uid) { const u = usuarios.get(uid); return u && u.perfil ? { uid, ...u } : null; }
export async function criarUsuario({ nome, email, senha, perfil }) {
  const uid = 'u' + (contador++);
  usuarios.set(uid, { nome, email, senha, perfil, ativo: true });
  garantir('usuarios').set(uid, { nome, email, perfil, ativo: true }); notificar('usuarios'); return uid;
}
export function ouvir(c, cb, _erro, filtro = null) {
  if (c === 'usuarios') { colecoes.usuarios = new Map([...usuarios].filter(([, u]) => u.perfil).map(([uid, { senha, ...u }]) => [uid, u])); }
  const fs = !filtro ? [] : Array.isArray(filtro[0]) ? filtro : [filtro];
  const o = { c, cb: fs.length ? (l => cb(l.filter(x => fs.every(([k, v]) => x[k] === v)))) : cb }; ouvintes.push(o); notificar(c); return () => ouvintes.splice(ouvintes.indexOf(o), 1);
}
export function ouvirDoc(c, id, cb) { const o = { c, id, cb }; ouvintes.push(o); notificar(c); return () => ouvintes.splice(ouvintes.indexOf(o), 1); }
export async function lerDoc(c, id) { return colecoes[c]?.has(id) ? { id, ...colecoes[c].get(id) } : null; }
export async function ultimosLogs() { return window.__mock.logs.slice().reverse(); }
function gravarServidorMock(id, dados) {
  const { publico, privado } = separarServidor(dados);
  const m = garantir('servidores'); m.set(id, { ...(m.get(id) || {}), ...structuredClone(publico) });
  if (Object.keys(privado).filter(k => k !== 'secretaria_id').length || 'secretaria_id' in privado) {
    const p = garantir('servidores_privado'); p.set(id, { ...(p.get(id) || {}), ...structuredClone(privado) });
    if (privado.cpf) garantir('cpfs').set(privado.cpf, { servidor_id: id });
    notificar('servidores_privado');
  }
  notificar('servidores');
}
export async function protegerDadosServidores(lista, prog) {
  for (const sv of lista) {
    const { publico, privado } = separarServidor({ cpf: sv.cpf || '', chave_pix: sv.chave_pix || '', secretaria_id: sv.secretaria_id || null });
    garantir('servidores_privado').set(sv.id, privado);
    if (privado.cpf) garantir('cpfs').set(privado.cpf, { servidor_id: sv.id });
    const m = garantir('servidores'); const atual = { ...m.get(sv.id), cpf_mascara: publico.cpf_mascara || '', cpf_valido: !!publico.cpf_valido, tem_pix: !!publico.tem_pix };
    delete atual.cpf; delete atual.chave_pix; m.set(sv.id, atual);
  }
  notificar('servidores'); notificar('servidores_privado'); prog && prog(lista.length, lista.length);
}
export async function salvar(c, id, dados) {
  if (c === 'servidores') { id = id || ('id' + (contador++)); gravarServidorMock(id, dados); return id; }
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
export async function excluirServidor(id, cpf) { for (const c of ['servidores', 'servidores_privado']) { colecoes[c]?.delete(id); notificar(c); } colecoes.cpfs?.delete(String(cpf || '').replace(/\D/g, '')); }
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
  ops.filter(o => o.colecao === 'servidores').forEach(o => gravarServidorMock(o.id, o.dados));
  ops = ops.filter(o => o.colecao !== 'servidores');
  ops.forEach(o => garantir(o.colecao).set(o.id, { ...(colecoes[o.colecao].get(o.id) || {}), ...structuredClone(o.dados) }));
  new Set(ops.map(o => o.colecao)).forEach(notificar); prog && prog(ops.length, ops.length); return [];
}
export async function registrarLog(acao, detalhe) { window.__mock.logs.push({ acao, detalhe, nome: sessao?.nome, em: new Date() }); }

export async function entrarComGoogle() { usuarioAtual = { uid: 'g1', email: 'google@teste.com' }; cbSessao(usuarioAtual); }
export async function criarConta(email, senha) { const uid = 'u' + (contador++); usuarios.set(uid, { email, senha }); usuarioAtual = { uid, email }; cbSessao(usuarioAtual); }
export function dadosUsuarioAtual() { return usuarioAtual ? { ...usuarioAtual, provedores: ['password'] } : null; }
export async function reivindicarAdmin(nome) { const u = usuarios.get(usuarioAtual.uid) || { email: usuarioAtual.email }; usuarios.set(usuarioAtual.uid, { ...u, nome: nome || u.email, perfil: 'admin', ativo: true }); }
export async function solicitarAcesso() { usuarios.set(usuarioAtual.uid, { nome: usuarioAtual.email, email: usuarioAtual.email, perfil: 'consulta', ativo: false, pendente: true }); }
export async function moverValoresProtegidos(lista) {
  for (const { id, valores } of lista) {
    garantir('valores').set(id, { ...(colecoes.valores.get(id) || {}), ...valores });
    const s = colecoes.solicitacoes.get(id); for (const k of Object.keys(valores)) delete s[k];
  }
  notificar('valores'); notificar('solicitacoes');
}
const pdfs = new Map();
export async function enviarPDF(meta, arquivo, progresso) {
  const id = 'pdf' + (contador++);
  pdfs.set(id, await arquivo.arrayBuffer());
  garantir('orcamentos').set(id, { ...meta, nome_arquivo: arquivo.name, tamanho: arquivo.size, partes: 1, enviado_por: { nome: sessao?.nome }, enviado_em: new Date() });
  progresso && progresso(1, 1); notificar('orcamentos'); return id;
}
export async function baixarPDF(id) { return new Blob([pdfs.get(id) || new ArrayBuffer(0)], { type: 'application/pdf' }); }
export async function excluirPDF(id) { colecoes.orcamentos?.delete(id); pdfs.delete(id); notificar('orcamentos'); }
