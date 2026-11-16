// SISDIFI — partes comuns das telas
import { estado, ETAPAS, etapaDe } from '../estado.js';
import { esc } from '../ui.js';

/**
 * Mostra "carregando" enquanto as coleções necessárias não chegaram. Retorna true se ainda está carregando.
 *
 * Quando o carregamento FALHA (permissão, rede, regra do Firestore), não dá para
 * continuar girando: o aviso de erro é um toast que some em segundos e a tela
 * ficaria em "Carregando dados…" para sempre, sem dizer o que houve. Aqui a falha
 * vira um painel que fica na tela, diz qual dado faltou e oferece recarregar.
 */
export function aguardando(el, colecoes) {
  const falta = colecoes.filter(c => !estado.prontos.has(c));
  if (!falta.length) return false;
  const falhou = falta.filter(c => estado.falhas.has(c));
  if (falhou.length) {
    const lista = falhou.map(c => `<li><strong>${esc(c)}</strong> — ${esc(estado.falhas.get(c))}</li>`).join('');
    el.innerHTML = `<div class="aviso-erro" role="alert">
      <h2>Não foi possível carregar esta tela</h2>
      <p>Estes dados não chegaram:</p>
      <ul>${lista}</ul>
      <p class="muted">Se o erro for de permissão, peça ao administrador para conferir seu perfil. Se for de conexão, tente de novo.</p>
      <button type="button" class="btn" data-recarregar>Tentar de novo</button>
    </div>`;
    el.querySelector('[data-recarregar]')?.addEventListener('click', () => location.reload());
    return true;
  }
  el.innerHTML = '<div class="carregando"><div class="spinner"></div><p>Carregando dados…</p></div>';
  return true;
}

export function cabecalho(titulo, acoesHTML = '', subtitulo = '') {
  return `<div class="cab-pagina"><div><h1>${esc(titulo)}</h1>${subtitulo ? `<p class="muted">${subtitulo}</p>` : ''}</div>
    <div class="cab-acoes">${acoesHTML}</div></div>`;
}

export function selo(status) {
  return status === 'cancelada'
    ? '<span class="selo selo-cancelada">Cancelada</span>'
    : '<span class="selo selo-emitida">Emitida</span>';
}

export function opcoesSecretarias(selecionada, { incluirInativas = false, vazio = 'Selecione' } = {}) {
  return `<option value="">${esc(vazio)}</option>` + estado.secretarias
    .filter(s => incluirInativas || s.ativo !== false || s.id === selecionada)
    .map(s => `<option value="${esc(s.id)}" ${s.id === selecionada ? 'selected' : ''}>${esc(s.nome)}${s.ativo === false ? ' (inativa)' : ''}</option>`).join('');
}

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function anosDisponiveis() {
  const anos = new Set(estado.solicitacoes.map(s => Number(String(s.data_hora_saida || '').slice(0, 4))).filter(Boolean));
  anos.add(new Date().getFullYear());
  if (estado.exercicio) anos.add(Number(estado.exercicio));
  return [...anos].sort((a, b) => b - a);
}

/** Selo da etapa de tramitação (considera cancelamento). */
export function seloEtapa(sol) {
  if (sol.status === 'cancelada') return '<span class="selo selo-cancelada">Cancelada</span>';
  const e = etapaDe(sol);
  return `<span class="selo selo-etapa etapa-${e}" title="${esc(ETAPAS[e].nome)}">${esc(ETAPAS[e].curto)}</span>`;
}
