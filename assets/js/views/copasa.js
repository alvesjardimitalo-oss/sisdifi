// SISDIFI — Contas de água da COPASA por empenho (Contabilidade e ADM).
// Sobe os e-mails "Chegou sua conta por e-mail" (.zip) ou os arquivos mat….txt; o sistema separa cada imóvel no seu empenho.
// Cadastro (locais, empenhos por exercício e matrícula de cada imóvel) em retencoes_config/copasa — mesma regra de acesso das Retenções.
import * as db from '../db.js';
import { estado, pode } from '../estado.js';
import { esc, modal, toast, mensagemErro, baixarArquivo, csv } from '../ui.js';
import { lerContaCopasa, ehArquivoCopasa, cadastroCompleto, separarPorEmpenho, linhasPlanilha, memoriaCopasaHTML, historicoCopasa,
  nomeSecretaria, locaisDaCentralizadora, dinheiroC, CENTRALIZADORAS, anoDaReferencia } from '../copasa.js';

const estilo = '<style>' +
'.cop{max-width:1240px;margin:0 auto;color:#21374d}.cop *{box-sizing:border-box}.cop h1{margin:0 0 4px;color:#153d61;font-size:1.6rem}.cop .c-muted{color:#617384;font-size:.88rem;margin:0}' +
'.cop .c-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:16px 0}.cop .c-box{background:#fff;border:1px solid #d8e3ed;border-radius:12px;padding:14px;margin:14px 0}' +
'.cop .c-cab{display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between;align-items:flex-start}.cop .c-cab h2{margin:0;color:#183e5e;font-size:1.15rem}.cop .c-total{font-size:1.35rem;font-weight:700;color:#236441;white-space:nowrap}' +
'.cop table{border-collapse:collapse;width:100%;min-width:780px}.cop .c-tab{overflow-x:auto;margin-top:10px}.cop th{background:#eef4fa;font-size:.72rem;text-transform:uppercase;color:#506e83;letter-spacing:.3px}.cop td,.cop th{padding:8px;border-bottom:1px solid #e3eaf0;text-align:left;vertical-align:top}' +
'.cop .v{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.cop .c-emp{font-weight:700;color:#174368;white-space:nowrap}.cop .c-hist{display:flex;gap:6px;align-items:center;margin-top:4px;font:600 .72rem/1.3 "Courier New",monospace;color:#1d4f75}' +
'.cop .c-hist button,.cop .c-mini{border:1px solid #b9cbd9;background:#f3f8fc;border-radius:5px;padding:2px 7px;font:600 .72rem Arial;color:#1d4f75;cursor:pointer;white-space:nowrap}' +
'.cop .c-alerta{border-left:4px solid #c88e38;background:#fff8e8;color:#76551e;border-radius:5px;padding:10px 12px;margin:10px 0}.cop .c-ok{color:#276846;font-weight:700}' +
'.cop details{margin-top:4px}.cop summary{cursor:pointer;color:#33607f;font-size:.82rem}.cop .c-imoveis td{font-size:.84rem;padding:5px 8px}.cop select{max-width:260px}' +
'.c-cad table{border-collapse:collapse;width:100%}.c-cad td,.c-cad th{padding:5px;border-bottom:1px solid #e3eaf0;text-align:left}.c-cad input,.c-cad select{width:100%}' +
'</style>';

export function telaCopasa(el) {
  if (!pode.contabil()) return { titulo: 'Acesso restrito' };
  let contas = [], salvo = {}, cadastro = cadastroCompleto(), cancelou = false;
  const $ = s => el.querySelector(s);
  el.innerHTML = estilo + `<section class="cop">
    <h1>Contas de água — COPASA</h1>
    <p class="c-muted">Suba os e-mails "Chegou sua conta por e-mail" (.zip) das contas centralizadoras — Administração (564-9), Educação (11386382-9) e Saúde (11386384-5) — ou os arquivos <b>mat….txt</b>. Cada imóvel é separado no seu empenho pela matrícula, como na planilha.</p>
    <div class="c-bar">
      <button class="btn" id="c-subir">⬆ Contas da COPASA (.zip ou .txt)</button>
      <input type="file" id="c-arquivo" accept=".zip,.txt,.csv" multiple hidden>
      <button class="btn btn-sec" id="c-imprimir" disabled>Imprimir por empenho</button>
      <button class="btn btn-sec" id="c-planilha" disabled>Exportar planilha</button>
      <button class="btn btn-sec" id="c-cadastro">Cadastro de locais e empenhos</button>
      <button class="btn btn-sec" id="c-limpar" disabled>Limpar</button>
    </div>
    <div id="c-lista"><p class="c-muted" style="padding:20px 0">Nenhuma conta carregada.</p></div>
  </section>`;

  const copiar = async (texto, b) => {
    try { await navigator.clipboard.writeText(texto); }
    catch { const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* sem cópia */ } t.remove(); }
    if (b) { const a = b.textContent; b.textContent = 'Copiado ✓'; setTimeout(() => { b.textContent = a; }, 1500); }
  };
  const opcoesLocais = (matCli, sel = '') => `<option value="">— escolher local/empenho —</option>` + locaisDaCentralizadora(cadastro, matCli).map(l =>
    `<option value="${esc(l.id)}" ${l.id === sel ? 'selected' : ''}>${esc((l.empenhos?.[anoAtual()] || '?') + ' · ' + l.nome)}${l.centralizadora !== matCli ? ' (' + esc(CENTRALIZADORAS[l.centralizadora] || l.centralizadora) + ')' : ''}</option>`).join('');
  const anoAtual = () => contas.length ? anoDaReferencia(contas[0].referencia) : Number(estado.exercicio) || new Date().getFullYear();

  function render() {
    if (cancelou) return;
    for (const id of ['c-imprimir', 'c-planilha', 'c-limpar']) $('#' + id).disabled = !contas.length;
    if (!contas.length) { $('#c-lista').innerHTML = '<p class="c-muted" style="padding:20px 0">Nenhuma conta carregada.</p>'; return; }
    $('#c-lista').innerHTML = contas.map((c, ci) => {
      const s = separarPorEmpenho(c, cadastro);
      return `<section class="c-box"><div class="c-cab"><div><h2>${esc(nomeSecretaria(c))}</h2>
        <p class="c-muted">Matrícula ${esc(c.matriculaCliente)} · Fatura ${esc(c.fatura)} · Ref. ${esc(c.referencia)} · Vencimento ${esc(c.vencimento.split('-').reverse().join('/'))} · ${c.imoveis.length} imóveis</p></div>
        <div style="text-align:right"><div class="c-total">${dinheiroC(s.total)}</div><span class="c-ok">${s.pendentes.length ? '' : '✓ todos os imóveis com empenho'}</span></div></div>
        ${s.semEmpenho.length ? `<div class="c-alerta">Sem empenho de ${s.ano} cadastrado para: ${s.semEmpenho.map(esc).join(', ')}. Cadastre em <a href="#" data-abrir-cad>Cadastro de locais e empenhos</a>.</div>` : ''}
        ${s.pendentes.length ? `<div class="c-alerta"><b>${s.pendentes.length} imóvel(is) sem cadastro</b> — escolha o local/empenho (fica gravado para os próximos meses):
          <table style="min-width:0;margin-top:6px"><tbody>${s.pendentes.map(im => `<tr><td>${esc(im.matricula)}</td><td>${esc(im.endereco)}<br><small>${esc(im.nome)}</small></td><td class="v">${dinheiroC(im.valor)}</td>
          <td><select data-atribuir="${esc(im.matricula)}" data-cli="${esc(c.matriculaCliente)}">${opcoesLocais(c.matriculaCliente)}</select></td></tr>`).join('')}</tbody></table></div>` : ''}
        <div class="c-tab"><table><thead><tr><th>Empenho</th><th>Local</th><th>Imóveis</th><th class="v">IRRF</th><th class="v">Valor a liquidar</th></tr></thead><tbody>${
          s.grupos.map((g, gi) => `<tr><td class="c-emp">${esc(g.empenho || '—')}</td><td>${esc(g.nome)}
            <div class="c-hist"><span>${esc(historicoCopasa(c, g))}</span><button type="button" data-copiar="${ci}:${gi}">Copiar</button></div>
            <details><summary>${g.imoveis.length} imóvel(is)</summary><table class="c-imoveis" style="min-width:0"><tbody>${g.imoveis.map(im => `<tr><td>${esc(im.matricula)}</td><td>${esc(im.endereco)}</td><td class="v">${dinheiroC(im.valor)}</td>
              <td><select class="c-mini" data-atribuir="${esc(im.matricula)}" data-cli="${esc(c.matriculaCliente)}" title="Mudar o local/empenho deste imóvel">${opcoesLocais(c.matriculaCliente, cadastro.imoveis[im.matricula])}</select></td></tr>`).join('')}</tbody></table></details></td>
            <td>${g.imoveis.length}</td><td class="v">${g.irrf ? dinheiroC(g.irrf) : ''}</td><td class="v"><b>${dinheiroC(g.total)}</b></td></tr>`).join('')
        }</tbody><tfoot><tr><td colspan="3"><b>TOTAL DA FATURA</b></td><td class="v">${s.irrf ? dinheiroC(s.irrf) : ''}</td><td class="v"><b>${dinheiroC(s.total)}</b></td></tr></tfoot></table></div></section>`;
    }).join('');
    el.querySelectorAll('[data-copiar]').forEach(b => b.onclick = () => {
      const [ci, gi] = b.dataset.copiar.split(':').map(Number); const c = contas[ci];
      copiar(historicoCopasa(c, separarPorEmpenho(c, cadastro).grupos[gi]), b);
    });
    el.querySelectorAll('[data-atribuir]').forEach(s => s.onchange = () => atribuir(s.dataset.atribuir, s.value));
    el.querySelectorAll('[data-abrir-cad]').forEach(a => a.onclick = e => { e.preventDefault(); abrirCadastro(); });
  }

  async function atribuir(matricula, local) {
    if (!local) return;
    try {
      await db.salvar('retencoes_config', 'copasa', { imoveis: { [matricula]: local } });
      db.registrarLog('copasa.imovel', { matricula, local }).catch(() => {});
      toast(`Imóvel ${matricula} → ${cadastro.locais[local]?.nome || local}.`);
    } catch (e) { toast(mensagemErro(e), 'erro'); }
  }

  // ---------- leitura dos arquivos ----------
  $('#c-subir').onclick = () => { $('#c-arquivo').value = ''; $('#c-arquivo').click(); };
  $('#c-arquivo').onchange = async e => {
    const arquivos = [...(e.target.files || [])]; if (!arquivos.length) return;
    const textos = [], erros = [];
    const decodificar = b => new TextDecoder('windows-1252').decode(b);
    for (const f of arquivos) {
      try {
        if (/\.zip$/i.test(f.name)) {
          const { abrirZip } = await import('../xlsx-leitor.js?v=3.20.0');
          const zip = await abrirZip(new Uint8Array(await f.arrayBuffer()));
          let achou = false;
          for (const n of zip.nomes.filter(n => /\.(txt|csv)$/i.test(n))) { const t = decodificar(await zip.ler(n)); if (ehArquivoCopasa(t)) { textos.push(t); achou = true; } }
          if (!achou) throw Error('o .zip não tem o arquivo mat….txt da COPASA');
        } else {
          const t = decodificar(new Uint8Array(await f.arrayBuffer()));
          if (!ehArquivoCopasa(t)) { if (/^mat/i.test(f.name)) continue; throw Error('não é o detalhamento da COPASA (use o mat….txt que começa com "Mat. Cliente")'); }
          textos.push(t);
        }
      } catch (err) { erros.push(`${f.name}: ${mensagemErro(err)}`); }
    }
    for (const t of textos) {
      try {
        const c = lerContaCopasa(t);
        contas = contas.filter(x => x.fatura !== c.fatura); contas.push(c);
      } catch (err) { erros.push(mensagemErro(err)); }
    }
    contas.sort((a, b) => Object.keys(CENTRALIZADORAS).indexOf(a.matriculaCliente) - Object.keys(CENTRALIZADORAS).indexOf(b.matriculaCliente));
    if (erros.length) toast('Não li: ' + erros.join(' · '), 'erro');
    if (textos.length) { toast(`${textos.length} conta(s) da COPASA lida(s).`); db.registrarLog('copasa.ler', { faturas: contas.map(c => c.fatura) }).catch(() => {}); }
    render();
  };

  // ---------- saídas ----------
  $('#c-limpar').onclick = () => { contas = []; render(); };
  $('#c-planilha').onclick = () => baixarArquivo(`copasa-${(contas[0]?.referencia || '').replace('/', '-')}.csv`, csv(linhasPlanilha(contas, cadastro)));
  $('#c-imprimir').onclick = () => {
    const w = window.open('', '_blank'); if (!w) return toast('Libere o pop-up para imprimir.', 'erro');
    w.opener = null;
    w.document.write(memoriaCopasaHTML(contas, cadastro, { orgao: estado.config?.orgao, logo: new URL('assets/img/brasao.png', document.baseURI).href,
      geradoEm: new Date().toLocaleString('pt-BR'), geradoPor: estado.sessao?.nome }));
    w.document.close();
    w.document.getElementById('doc-imprimir')?.addEventListener('click', () => w.print());
    w.document.getElementById('doc-fechar')?.addEventListener('click', () => w.close());
    const logo = w.document.querySelector('img.doc-logo'); let feito = false;
    const imprimir = () => { if (feito) return; feito = true; try { w.focus(); w.print(); } catch { /* fechada */ } };
    if (logo && !logo.complete) { logo.addEventListener('load', imprimir, { once: true }); logo.addEventListener('error', imprimir, { once: true }); setTimeout(imprimir, 1800); } else setTimeout(imprimir, 200);
  };

  // ---------- cadastro ----------
  function abrirCadastro() {
    let ano = anoAtual();
    const m = modal({ titulo: 'Cadastro de locais e empenhos — COPASA', largura: 900, corpo: '<div class="c-cad" id="cc"></div>' });
    const desenhar = () => {
      const locais = Object.entries(cadastro.locais).sort((a, b) => (parseInt(a[1].empenhos?.[ano], 10) || 1e9) - (parseInt(b[1].empenhos?.[ano], 10) || 1e9));
      const qtd = id => Object.values(cadastro.imoveis).filter(v => v === id).length;
      m.el.querySelector('#cc').innerHTML = `<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px">
        <label class="campo"><span>Exercício dos empenhos</span><input type="number" id="cc-ano" value="${ano}" min="2020" max="2100" style="max-width:110px"></label>
        <p class="dica" style="margin:0">Cada exercício tem os seus empenhos. Na virada do ano, troque o exercício aqui e informe os novos números.</p></div>
        <table><thead><tr><th>Local</th><th>Conta centralizadora</th><th style="width:130px">Empenho ${ano}</th><th>Imóveis</th></tr></thead><tbody>${
          locais.map(([id, l]) => `<tr data-id="${esc(id)}"><td><input data-k="nome" value="${esc(l.nome)}" maxlength="80"></td>
            <td><select data-k="centralizadora">${Object.entries(CENTRALIZADORAS).map(([k, n]) => `<option value="${k}" ${k === l.centralizadora ? 'selected' : ''}>${esc(n)} (${k})</option>`).join('')}</select></td>
            <td><input data-k="empenho" value="${esc(l.empenhos?.[ano] || '')}" placeholder="nº/${ano}" maxlength="20"></td><td>${qtd(id)}</td></tr>`).join('')
        }</tbody></table>
        <div class="acoes-form" style="justify-content:space-between"><button class="btn btn-sec" type="button" id="cc-novo">+ Novo local</button>
          <span><button class="btn btn-sec" type="button" id="cc-cancelar">Fechar</button> <button class="btn" type="button" id="cc-salvar">Salvar</button></span></div>`;
      m.el.querySelector('#cc-ano').onchange = e => { ano = Number(e.target.value) || ano; desenhar(); };
      m.el.querySelector('#cc-cancelar').onclick = () => m.fechar();
      m.el.querySelector('#cc-novo').onclick = () => {
        const id = 'L' + Date.now().toString(36);
        cadastro.locais[id] = { nome: 'Novo local', centralizadora: contas[0]?.matriculaCliente || '5649', empenhos: {} };
        desenhar();
      };
      m.el.querySelector('#cc-salvar').onclick = async () => {
        const locais = {};
        for (const tr of m.el.querySelectorAll('tr[data-id]')) {
          const v = k => tr.querySelector(`[data-k="${k}"]`).value.trim();
          if (!v('nome')) return toast('Informe o nome de todos os locais.', 'erro');
          locais[tr.dataset.id] = { nome: v('nome'), centralizadora: v('centralizadora'), empenhos: { [ano]: v('empenho') } };
        }
        try {
          await db.salvar('retencoes_config', 'copasa', { locais });
          db.registrarLog('copasa.cadastro', { ano, locais: Object.keys(locais).length }).catch(() => {});
          toast('Cadastro da COPASA salvo.'); m.fechar();
        } catch (e) { toast(mensagemErro(e), 'erro'); }
      };
    };
    desenhar();
  }
  $('#c-cadastro').onclick = abrirCadastro;

  const des = db.ouvirDoc('retencoes_config', 'copasa', d => { salvo = d || {}; cadastro = cadastroCompleto(salvo); render(); },
    e => toast('Não foi possível abrir o cadastro da COPASA: ' + mensagemErro(e), 'erro'));
  render();
  return { titulo: 'Contas de água (COPASA)', limpar: () => { cancelou = true; des?.(); } };
}
