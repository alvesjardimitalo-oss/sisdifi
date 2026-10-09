// SISDIFI — cliente para anexos armazenados no Google Drive por backend seguro.
// O backend verifica Firebase ID token e permissões antes de acessar qualquer arquivo.
// Não colocar tokens OAuth ou credenciais de Drive neste módulo.
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const TIPOS = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_BYTES = 10 * 1024 * 1024;

function apiBase() {
  const base = window.SISDIFI_ANEXOS_API_URL;
  if (!base || typeof base !== 'string' || !/^https:\/\//.test(base)) {
    throw new Error('Serviço de anexos ainda não configurado.');
  }
  return base.replace(/\/$/, '');
}

async function requisitar(path, options = {}) {
  const usuario = getAuth().currentUser;
  if (!usuario) throw new Error('Faça login para acessar anexos.');
  const token = await usuario.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', 'Bearer ' + token);
  const res = await fetch(apiBase() + path, { ...options, headers, cache: 'no-store' });
  if (!res.ok) {
    let mensagem = 'Falha ao acessar anexos (' + res.status + ').';
    try { const body = await res.json(); if (typeof body.error === 'string') mensagem = body.error; } catch {}
    throw new Error(mensagem);
  }
  return res;
}

function caminho(id) { return '/solicitacoes/' + encodeURIComponent(id) + '/anexos'; }

export async function listarAnexos(solicitacaoId) {
  const res = await requisitar(caminho(solicitacaoId));
  const dados = await res.json();
  return Array.isArray(dados.anexos) ? dados.anexos : [];
}

export async function enviarAnexo(solicitacaoId, arquivo, categoria = 'outro') {
  if (!TIPOS.has(arquivo.type)) throw new Error('Selecione PDF, JPG ou PNG.');
  if (!arquivo.size || arquivo.size > MAX_BYTES) throw new Error('O arquivo deve ter até 10 MB.');
  if (!['convite', 'inscricao', 'outro'].includes(categoria)) throw new Error('Categoria inválida.');
  const corpo = new FormData();
  corpo.append('arquivo', arquivo, arquivo.name);
  corpo.append('categoria', categoria);
  const res = await requisitar(caminho(solicitacaoId), { method: 'POST', body: corpo });
  return res.json();
}

export async function abrirAnexo(solicitacaoId, anexoId) {
  const res = await requisitar(caminho(solicitacaoId) + '/' + encodeURIComponent(anexoId) + '/conteudo');
  return res.blob();
}
