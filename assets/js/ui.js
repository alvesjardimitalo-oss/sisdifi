// SISDIFI — utilitários de interface

/** Escapa texto para HTML (evita injeção de código vinda de nomes, destinos etc.). */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function toast(msg, tipo = 'ok') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast toast-' + tipo;
  t.setAttribute('role', 'status');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.classList.add('sair'), 3800);
  setTimeout(() => t.remove(), 4300);
}

/** Modal simples. Retorna o elemento do corpo; fechar() remove. */
export function modal({ titulo, corpo, largura = 640, aoFechar }) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" style="max-width:${largura}px">
      <div class="modal-topo"><h3>${esc(titulo)}</h3><button type="button" class="btn-icone" data-fechar aria-label="Fechar">✕</button></div>
      <div class="modal-corpo">${corpo}</div>
    </div>`;
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc_); aoFechar && aoFechar(); };
  const esc_ = e => { if (e.key === 'Escape') fechar(); };
  fundo.addEventListener('mousedown', e => { if (e.target === fundo) fechar(); });
  fundo.querySelector('[data-fechar]').onclick = fechar;
  document.addEventListener('keydown', esc_);
  document.body.appendChild(fundo);
  const primeiro = fundo.querySelector('input,select,textarea');
  primeiro && setTimeout(() => primeiro.focus(), 30);
  return { el: fundo.querySelector('.modal-corpo'), fechar };
}

export function confirmar(mensagem, { titulo = 'Confirmar', ok = 'Confirmar', nao = 'Cancelar', perigo = false, pedirTexto = null } = {}) {
  return new Promise(resolve => {
    let resolvido = false;
    const m = modal({
      titulo, largura: 460,
      corpo: `<p class="confirm-msg">${esc(mensagem)}</p>
        ${pedirTexto ? `<label class="campo"><span>${esc(pedirTexto)}</span><textarea data-texto rows="3" required></textarea></label>` : ''}
        <div class="acoes-form"><button type="button" class="btn btn-sec" data-nao>${esc(nao)}</button>
        <button type="button" class="btn ${perigo ? 'btn-perigo' : ''}" data-sim>${esc(ok)}</button></div>`,
      aoFechar: () => { if (!resolvido) resolve(false); }
    });
    m.el.querySelector('[data-nao]').onclick = () => m.fechar();
    m.el.querySelector('[data-sim]').onclick = () => {
      let valor = true;
      if (pedirTexto) {
        valor = m.el.querySelector('[data-texto]').value.trim();
        if (!valor) { toast('Preencha o campo para continuar.', 'erro'); return; }
      }
      resolvido = true; resolve(valor); m.fechar();
    };
  });
}

export function hojeISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dataBR(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(iso || ''));
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}` + (m[4] ? ` ${m[4]}:${m[5]}` : '');
}

export function numeroBR(v, casas = 2) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function normalizar(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function lerForm(form) {
  const dados = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') dados[el.name] = el.checked;
    else dados[el.name] = typeof el.value === 'string' ? el.value.trim() : el.value;
  }
  return dados;
}

export function baixarArquivo(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob([conteudo], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function csv(linhas) {
  // Separador ";" e BOM para abrir corretamente no Excel em português.
  const cel = v => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n');
}

export function mensagemErro(e) {
  const c = e?.code || '';
  const mapa = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/requires-recent-login': 'Por segurança, saia e entre de novo antes desta operação.',
    'permission-denied': 'Seu usuário não tem permissão para esta operação.',
    'unavailable': 'Sem conexão com o servidor. Verifique a internet.'
  };
  return mapa[c] || e?.message || String(e);
}
