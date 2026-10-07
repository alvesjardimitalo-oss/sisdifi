// SISDIFI — Ajustes para celular, aplicados a qualquer tela desenhada (inclusive janelas):
//  • tabelas viram cartões: cada célula ganha o rótulo da coluna (data-label), usado pelo CSS no celular;
//  • filtros recolhidos: no celular aparece só o primeiro campo e o botão "Filtros" mostra os demais.
const CELULAR = window.matchMedia('(max-width: 820px)');
const filtrosAbertos = new Set(); // lembra, por formulário, se o usuário abriu os filtros (as telas se redesenham)

function rotularTabela(t) {
  if (t.classList.contains('tabela-form') || t.closest('.doc, .documento')) return;
  const ths = [...t.querySelectorAll('thead th')];
  if (!ths.length) return;
  const rotulos = [];
  ths.forEach(th => { const n = Number(th.getAttribute('colspan') || 1); for (let i = 0; i < n; i++) rotulos.push(th.textContent.trim()); });
  t.classList.add('tabela-cartoes');
  t.querySelectorAll('tbody tr').forEach(tr => {
    let col = 0;
    for (const td of tr.children) {
      if (td.hasAttribute('colspan') && Number(td.getAttribute('colspan')) > 1) { td.dataset.label = ''; col += Number(td.getAttribute('colspan')); continue; }
      const r = rotulos[col] || '';
      if (td.dataset.label === undefined) td.dataset.label = r;
      if (!r || td.querySelector('input[type=checkbox]') && !td.textContent.trim()) td.classList.add('sem-rotulo');
      col++;
    }
  });
}

function prepararFiltros(f) {
  if (f.dataset.recolhivel) return;
  const campos = [...f.children].filter(c => c.matches('.campo, .check, .filtro-rotulo, a, button'));
  if (campos.length < 3) return;
  f.dataset.recolhivel = '1';
  const chave = f.id || f.closest('main')?.querySelector('h1')?.textContent || 'filtros';
  const ativos = [...f.querySelectorAll('select')].filter(s => s.value && s.selectedIndex > 0 && s.name !== 'ordem').length;
  const bt = document.createElement('button');
  bt.type = 'button'; bt.className = 'btn btn-sec btn-peq filtros-alternar';
  const desenhar = () => { const aberto = filtrosAbertos.has(chave); f.classList.toggle('filtros-abertos', aberto); bt.setAttribute('aria-expanded', aberto); bt.textContent = aberto ? 'Menos filtros' : `Filtros${ativos ? ` (${ativos})` : ''}`; };
  bt.onclick = () => { filtrosAbertos.has(chave) ? filtrosAbertos.delete(chave) : filtrosAbertos.add(chave); desenhar(); };
  f.appendChild(bt);
  desenhar();
}

let agendado = false;
function processar() {
  agendado = false;
  document.querySelectorAll('table.tabela:not(.tabela-cartoes)').forEach(rotularTabela);
  // tabelas redesenhadas por dentro (tbody novo): rotula as linhas sem rótulo
  document.querySelectorAll('table.tabela-cartoes tbody tr td:not([data-label])').forEach(td => { const t = td.closest('table'); t.classList.remove('tabela-cartoes'); rotularTabela(t); });
  document.querySelectorAll('form.filtros').forEach(prepararFiltros);
}

export function iniciarResponsivo() {
  new MutationObserver(() => { if (!agendado) { agendado = true; requestAnimationFrame(processar); } })
    .observe(document.body, { childList: true, subtree: true });
  processar();
  CELULAR.addEventListener?.('change', processar);
}
