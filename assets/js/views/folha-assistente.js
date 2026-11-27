// Assistente de preenchimento da folha.
//
// "Iniciar preenchimento" abre uma janela por cima da tela com UM empenho por
// vez e, nele, os campos na ordem em que a Contabilidade digita no sistema
// contábil (passosDoEmpenho): número, ficha, fonte, desdobramento, bruto,
// histórico; data e valor do desconto na liquidação; a distribuição do
// desconto (INSS, IR, consignados) com a ficha extra de cada um; e as ordens
// de pagamento. Cada campo tem um botão COPIAR grande. O campo da vez fica
// destacado: Enter copia e passa para o próximo. No fim, a conferência do
// empenho e "Marcar como lançado e ir para o próximo".
import { esc, toast } from '../ui.js';
import { dinheiroFolha } from '../folha-empenhos.js';
import { passosDoEmpenho, conferirEmpenho, MODELOS_HISTORICO } from '../folha-transcrever.js';

const ESTILO = `
.fa-fundo{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:1000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px}
.fa{background:var(--fundo,#fff);color:var(--texto,#111827);width:min(860px,100%);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden}
.fa-topo{background:#1e3a5f;color:#fff;padding:14px 18px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.fa-topo h2{margin:0;font-size:1.15rem;flex:1;min-width:220px}
.fa-topo small{opacity:.85;display:block;font-weight:400;font-size:.8rem}
.fa-topo button{background:rgba(255,255,255,.15);color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:.95rem}
.fa-barra{height:6px;background:rgba(255,255,255,.2)}.fa-barra i{display:block;height:100%;background:#4ade80}
.fa-corpo{padding:14px 18px 6px}
.fa-grupo{font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;color:#64748b;font-weight:700;margin:14px 0 6px}
.fa-campo{display:grid;grid-template-columns:minmax(120px,190px) 1fr auto;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;border:2px solid transparent;margin-bottom:4px;background:rgba(148,163,184,.08)}
.fa-campo.atual{border-color:#2563eb;background:rgba(37,99,235,.08)}
.fa-campo.feito{opacity:.6}.fa-campo.feito .fa-rot::before{content:"✓ ";color:#16a34a;font-weight:700}
.fa-rot{font-size:.9rem}.fa-rot small{display:block;color:#64748b;font-size:.75rem}
.fa-val{font-size:1.05rem;font-weight:600;font-variant-numeric:tabular-nums;word-break:break-word}
.fa-val.hist{font-size:.85rem;font-weight:500}.fa-val em{color:#b45309;font-weight:500;font-style:normal}
.fa-copiar{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer;min-width:96px;font-size:.9rem}
.fa-copiar:hover{background:#1d4ed8}.fa-campo.feito .fa-copiar{background:#16a34a}
.fa-campo select{font-size:.95rem;padding:6px;border-radius:6px;max-width:100%}
.fa-campo input{font-size:1rem;padding:6px 8px;border:1px solid #94a3b8;border-radius:6px;width:130px}
.fa-conf{margin:14px 0 4px;padding:10px 12px;border-radius:10px;font-size:.95rem}
.fa-conf.ok{background:#dcfce7;color:#14532d}.fa-conf.nao{background:#fee2e2;color:#7f1d1d}
.fa-conf table{width:100%;border-collapse:collapse}.fa-conf td{padding:2px 0}.fa-conf td:last-child{text-align:right;font-variant-numeric:tabular-nums}
.fa-pe{display:flex;gap:10px;justify-content:space-between;align-items:center;padding:12px 18px;border-top:1px solid rgba(148,163,184,.3);flex-wrap:wrap}
.fa-pe button{border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer;border:1px solid #94a3b8;background:transparent;color:inherit}
.fa-pe .fa-prox{background:#16a34a;color:#fff;border-color:#16a34a}
.fa-dica{font-size:.8rem;color:#64748b}
@media(max-width:600px){.fa-campo{grid-template-columns:1fr auto}.fa-rot{grid-column:1/-1}}
@media(prefers-color-scheme:dark){.fa{--fundo:#0f172a;--texto:#e2e8f0}.fa-campo input{background:#1e293b;color:#e2e8f0}}
`;

/**
 * Abre o assistente.
 * `empenhos` e `extras` vêm de prepararEmpenhos; `estado` traz competencia,
 * dataLiquidacao, numerosOP, transcritos, fichasOP, escolhasHistorico e
 * textosHistorico. `aoMudar(patch)` recebe o que mudou ({dataLiquidacao},
 * {numerosOP}, {transcritos}) para a tela gravar.
 */
export function abrirAssistente({ empenhos = [], extras = [], estado = {}, inicio = null, aoMudar = () => {} }) {
  if (!empenhos.length) { toast('Envie o Resumo de Verbas antes de iniciar o preenchimento.', 'erro'); return; }
  let st = { ...estado, numerosOP: { ...(estado.numerosOP || {}) }, transcritos: [...(estado.transcritos || [])] };
  const feitos = () => new Set(st.transcritos);
  // Começa no primeiro empenho ainda não lançado.
  let i = inicio ?? Math.max(0, empenhos.findIndex(e => !feitos().has(e.id)));
  if (i < 0) i = 0;
  let copiados = new Set(), atual = 0;
  const opsDe = e => extras.filter(x => x.empenhoReferencia === e.empenho);

  if (!document.getElementById('fa-estilo')) {
    const s = document.createElement('style'); s.id = 'fa-estilo'; s.textContent = ESTILO; document.head.appendChild(s);
  }
  const fundo = document.createElement('div');
  fundo.className = 'fa-fundo';
  document.body.appendChild(fundo);
  const anteriorFoco = document.activeElement;

  const fechar = () => { document.removeEventListener('keydown', teclas, true); fundo.remove(); anteriorFoco?.focus?.(); };
  const copiar = async (texto, k) => {
    try { await navigator.clipboard.writeText(texto); }
    catch (e) { toast('O navegador não deixou copiar.', 'erro'); return; }
    copiados.add(k);
    toast('Copiado: ' + (texto.length > 50 ? texto.slice(0, 50) + '…' : texto));
    desenhar(k + 1);
  };
  const ir = (n) => { i = Math.max(0, Math.min(empenhos.length - 1, n)); copiados = new Set(); desenhar(0); fundo.scrollTop = 0; };
  const marcarLancado = () => {
    const f = feitos(); f.add(empenhos[i].id);
    st.transcritos = [...f]; aoMudar({ transcritos: st.transcritos });
    if (i < empenhos.length - 1) ir(i + 1);
    else { toast('Todos os empenhos foram lançados.'); desenhar(atual); }
  };

  function desenhar(proximo = atual) {
    const e = empenhos[i], ops = opsDe(e);
    const passos = passosDoEmpenho(e, ops, st);
    const conf = conferirEmpenho(e, ops);
    // Só os campos com valor ou que pedem informação entram na fila de copiar.
    const fila = passos.map((p, k) => ({ ...p, k })).filter(p => p.valor || p.chaveOP != null || p.informar);
    const copiaveis = fila.filter(p => p.valor && p.chaveOP == null).map(p => p.k);
    atual = copiaveis.find(k => k >= proximo && !copiados.has(k)) ?? copiaveis.find(k => !copiados.has(k)) ?? -1;
    const total = empenhos.length, lancados = feitos().size;
    let grupo = '';
    const linhas = fila.map(p => {
      const cab = p.grupo !== grupo ? '<div class="fa-grupo">' + esc(p.grupo) + '</div>' : ''; grupo = p.grupo;
      const nota = p.nota ? '<small>' + esc(p.nota) + '</small>' : '';
      let val, acao = '';
      if (p.chaveOP != null) {
        val = '<input data-op="' + esc(p.chaveOP) + '" placeholder="nº da OP" value="' + esc(st.numerosOP[p.chaveOP] || '') + '">';
        acao = '<span class="fa-dica">o sistema contábil dá o número</span>';
      } else if (p.valor) {
        val = esc(p.valor);
        acao = '<button type="button" class="fa-copiar" data-k="' + p.k + '">' + (copiados.has(p.k) ? 'COPIADO' : 'COPIAR') + '</button>';
      } else if (p.rotulo === 'Histórico') {
        // Vínculo que o sistema não reconhece (o Prefeito, por exemplo): escolhe-se uma vez e fica guardado.
        val = '<select data-modelo><option value="">— escolher o modelo —</option>' +
          MODELOS_HISTORICO.map(m => '<option value="' + m.chave + '">' + esc(m.rotulo) + '</option>').join('') + '</select>';
        acao = '<span class="fa-dica">vale para os próximos meses</span>';
      } else {
        val = '<em>a informar</em>';
      }
      const cls = 'fa-campo' + (p.k === atual ? ' atual' : '') + (copiados.has(p.k) ? ' feito' : '');
      return cab + '<div class="' + cls + '" data-campo="' + p.k + '"><div class="fa-rot">' + esc(p.rotulo) + nota + '</div>' +
        '<div class="fa-val' + (p.rotulo === 'Histórico' || /histórico/.test(p.rotulo) ? ' hist' : '') + '">' + val + '</div><div>' + acao + '</div></div>';
    }).join('');
    const tabela = conf.linhas.map(l => '<tr><td>' + (l.total ? '<strong>' : '') + esc(l.rotulo) + (l.total ? '</strong>' : '') +
      '</td><td>' + (l.total ? '<strong>' : '') + dinheiroFolha(l.valor) + (l.total ? '</strong>' : '') + '</td></tr>').join('') +
      (conf.daFolha != null ? '<tr><td>Resumo de Verbas (RH)</td><td>' + dinheiroFolha(conf.daFolha) + '</td></tr>' : '');
    const jaLancado = feitos().has(e.id);
    fundo.innerHTML = '<div class="fa" role="dialog" aria-modal="true" aria-label="Assistente de preenchimento">' +
      '<div class="fa-topo"><h2>Empenho ' + esc(String(e.empenho)) + '/' + esc(String(st.competencia || '').slice(0, 4)) +
        '<small>' + esc(e.secretaria || '') + ' · ' + esc(e.vinculo || '') + ' · ' + (i + 1) + ' de ' + total + ' · ' + lancados + ' lançado' + (lancados === 1 ? '' : 's') +
        (jaLancado ? ' · este já foi lançado' : '') + '</small></h2>' +
        '<button type="button" data-ir="-1" title="Empenho anterior">←</button><button type="button" data-ir="1" title="Próximo empenho">→</button>' +
        '<button type="button" data-fechar title="Fechar (Esc)">✕ Fechar</button></div>' +
      '<div class="fa-barra"><i style="width:' + Math.round(lancados / total * 100) + '%"></i></div>' +
      '<div class="fa-corpo">' +
        (st.dataLiquidacao ? '' : '<div class="fa-campo atual"><div class="fa-rot">Data da liquidação<small>vale para todos os empenhos</small></div>' +
          '<div><input data-liq placeholder="dd/mm/aaaa"></div><div></div></div>') +
        linhas +
        '<div class="fa-conf ' + (conf.bateu ? 'ok' : 'nao') + '"><strong>' + (conf.bateu ? '✓ Bateu com a folha' : '✗ Não bateu') + '</strong>' +
          '<table>' + tabela + '</table>' + conf.problemas.map(x => '<div>' + esc(x) + '</div>').join('') + '</div>' +
      '</div>' +
      '<div class="fa-pe"><span class="fa-dica">Enter copia o campo destacado e passa para o próximo · Esc fecha</span>' +
        '<span><button type="button" data-ir="-1">← Anterior</button> ' +
        '<button type="button" class="fa-prox" data-lancado>' + (i < total - 1 ? 'Lançado ✓ — próximo empenho →' : 'Lançado ✓') + '</button></span></div>' +
    '</div>';

    fundo.querySelectorAll('.fa-copiar').forEach(b => b.onclick = () => {
      // Dinheiro vai sem o "R$": no sistema contábil se digita só o número.
      const p = passos[Number(b.dataset.k)]; copiar(String(p.valor).replace(/^-?R\$\s*/u, m => m.startsWith('-') ? '-' : ''), Number(b.dataset.k));
    });
    fundo.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => ir(i + Number(b.dataset.ir)));
    fundo.querySelector('[data-fechar]').onclick = fechar;
    fundo.querySelector('[data-lancado]').onclick = marcarLancado;
    fundo.querySelectorAll('[data-op]').forEach(inp => inp.onchange = () => {
      const v = inp.value.trim();
      if (v) st.numerosOP[inp.dataset.op] = v; else delete st.numerosOP[inp.dataset.op];
      aoMudar({ numerosOP: { ...st.numerosOP } }); desenhar(atual);
    });
    const modelo = fundo.querySelector('[data-modelo]');
    if (modelo) modelo.onchange = () => {
      if (!modelo.value) return;
      st.escolhasHistorico = { ...(st.escolhasHistorico || {}), [e.lotacao]: modelo.value };
      aoMudar({ escolhasHistorico: st.escolhasHistorico }); desenhar(atual);
    };
    const liq = fundo.querySelector('[data-liq]');
    if (liq) liq.onchange = () => { st.dataLiquidacao = liq.value.trim(); aoMudar({ dataLiquidacao: st.dataLiquidacao }); desenhar(0); };
    fundo.querySelector('.fa-campo.atual')?.scrollIntoView({ block: 'nearest' });
  }

  function teclas(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); fechar(); return; }
    if (ev.target.tagName === 'INPUT') return;
    if (ev.key === 'Enter' && atual >= 0) {
      ev.preventDefault();
      fundo.querySelector('.fa-copiar[data-k="' + atual + '"]')?.click();
    }
  }
  fundo.addEventListener('click', ev => { if (ev.target === fundo) fechar(); });
  document.addEventListener('keydown', teclas, true);
  desenhar(0);
}
