// SISDIFI — partes comuns das telas
import { estado } from '../estado.js';
import { esc } from '../ui.js';

/** Mostra "carregando" enquanto as coleções necessárias não chegaram. Retorna true se ainda está carregando. */
export function aguardando(el, colecoes) {
  const falta = colecoes.filter(c => !estado.prontos.has(c));
  if (!falta.length) return false;
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
  return [...anos].sort((a, b) => b - a);
}
