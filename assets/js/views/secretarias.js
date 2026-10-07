// SISDIFI — Secretarias
import * as db from '../db.js';
import { estado, pode, ativas } from '../estado.js';
import { moeda } from '../calculo.js';
import { esc, $, $$, toast, modal, normalizar, lerForm, mensagemErro } from '../ui.js';
import { aguardando, cabecalho } from './comum.js';

export function telaSecretarias(el) {
  if (aguardando(el, ['secretarias', 'servidores', 'solicitacoes'])) return { viva: true, titulo: 'Secretarias' };
  const validas = ativas(estado.solicitacoes);
  const vv = pode.verValores();
  el.innerHTML = `
    ${cabecalho('Secretarias', pode.editar() ? '<button class="btn btn-sec" id="fonte-lote">＋ Fonte em várias secretarias</button><button class="btn" id="nova-sec">＋ Nova secretaria</button>' : '')}
    <div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Secretaria</th><th>Fontes de recurso</th><th class="num">Servidores ativos</th><th class="num">Solicitações</th>${vv ? `<th class="num">Valor em diárias</th><th class="num">Dotação ${new Date().getFullYear()}</th>` : ''}<th>Situação</th><th></th></tr></thead>
      <tbody>${[...estado.secretarias].sort((a, b) => (b.ativo !== false) - (a.ativo !== false) || a.nome.localeCompare(b.nome, 'pt-BR')).map(s => {
        const sols = validas.filter(x => x.secretaria_id === s.id);
        return `<tr>
          <td><strong>${esc(s.nome)}</strong></td>
          <td>${(s.fontes_recursos || []).length ? `<small class="lista-fontes">${(s.fontes_recursos || []).map(esc).join('<br>')}</small>` : '<span class="muted">—</span>'}</td>
          <td class="num">${estado.servidores.filter(x => x.secretaria_id === s.id && x.ativo !== false).length}</td>
          <td class="num">${sols.length}</td>
          ${vv ? `<td class="num">${moeda(sols.reduce((t, x) => t + Number(x.valor_total || 0), 0))}</td>
          <td class="num">${s.dotacao?.[new Date().getFullYear()] ? moeda(s.dotacao[new Date().getFullYear()]) : '—'}</td>` : ''}
          <td>${s.ativo === false ? '<span class="selo selo-cancelada">Inativa</span>' : '<span class="selo selo-emitida">Ativa</span>'}</td>
          <td class="acoes-linha">${pode.editar() ? `<button class="btn btn-sec btn-peq" data-editar="${esc(s.id)}">✎ Editar</button>` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="8" class="vazio-linha">Nenhuma secretaria cadastrada.</td></tr>'}</tbody>
    </table></div>`;
  $('#nova-sec', el)?.addEventListener('click', () => formSecretaria(null));
  $('#fonte-lote', el)?.addEventListener('click', () => fonteEmLote());
  $$('[data-editar]', el).forEach(b => b.onclick = () => formSecretaria(estado.secretarias.find(s => s.id === b.dataset.editar)));
  return { viva: true, titulo: 'Secretarias' };
}

function formSecretaria(s) {
  const m = modal({
    titulo: s ? 'Editar secretaria' : 'Nova secretaria', largura: 560,
    corpo: `<form id="fsec" novalidate>
      <label class="campo"><span>Nome</span><input name="nome" value="${esc(s?.nome || '')}" required maxlength="120"></label>
      <label class="campo"><span>Dotação prevista para diárias em ${new Date().getFullYear()} (R$, opcional)</span>
        <input type="number" step="0.01" min="0" name="dotacao" value="${esc(s?.dotacao?.[new Date().getFullYear()] ?? '')}"></label>
      <label class="campo"><span>Contas para pagamento desta secretaria (uma por linha)</span><textarea name="contas" rows="3">${esc((s?.contas_pagamento || []).join('\n'))}</textarea></label>
      <label class="campo"><span>Fontes de recurso desta secretaria (uma por linha)</span><textarea name="fontes" rows="3">${esc((s?.fontes_recursos || []).join('\n'))}</textarea></label>
      ${s ? `<label class="campo"><span>Situação</span><select name="ativo"><option value="1" ${s.ativo === false ? '' : 'selected'}>Ativa</option><option value="0" ${s.ativo === false ? 'selected' : ''}>Inativa</option></select></label>` : ''}
      <p class="erro-form" id="erro-sec"></p>
      <div class="acoes-form"><button type="button" class="btn btn-sec" data-cancelar>Cancelar</button><button class="btn" type="submit">Salvar</button></div>
    </form>`
  });
  const f = $('#fsec', m.el);
  f.querySelector('[data-cancelar]').onclick = m.fechar;
  f.onsubmit = async e => {
    e.preventDefault();
    const d = lerForm(f);
    const erro = $('#erro-sec', m.el);
    if (!d.nome) return (erro.textContent = 'Informe o nome.');
    const dup = estado.secretarias.find(x => normalizar(x.nome) === normalizar(d.nome) && x.id !== s?.id);
    if (dup) return (erro.textContent = `Já existe a secretaria "${dup.nome}"${dup.ativo === false ? ' (inativa — edite-a para reativar)' : ''}.`);
    try {
      const ano = String(new Date().getFullYear());
      const lista = t => String(t || '').split('\n').map(x => x.trim()).filter(Boolean);
      const dados = { nome: d.nome, ativo: s ? d.ativo === '1' : true, contas_pagamento: lista(d.contas), fontes_recursos: lista(d.fontes) };
      if (d.dotacao !== '') dados.dotacao = { ...(s?.dotacao || {}), [ano]: Math.round(Number(d.dotacao) * 100) / 100 };
      await db.salvar('secretarias', s?.id || null, dados);
      await db.registrarLog(s ? 'secretaria.editar' : 'secretaria.criar', { nome: d.nome });
      toast('Secretaria salva.');
      m.fechar();
    } catch (err) { erro.textContent = mensagemErro(err); }
  };
}

// ---------- Fonte de recurso em várias secretarias de uma vez ----------
const codigoFonte = f => (String(f).match(/^\s*(\d{3,4})/) || [])[1] || normalizar(f);
/** Junta a fonte à lista, se ainda não houver uma com o mesmo código. */
export function juntarFonte(lista, fonte) {
  const atual = lista || [];
  return atual.some(x => codigoFonte(x) === codigoFonte(fonte)) ? atual : [...atual, fonte];
}

function fonteEmLote() {
  const secs = estado.secretarias.filter(s => s.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const m = modal({
    titulo: 'Adicionar fonte de recurso em várias secretarias', largura: 620,
    corpo: `<form id="ffl" novalidate>
      <label class="campo"><span>Fonte de recurso</span><input name="fonte" maxlength="120" placeholder="Ex.: 1720 — FEP" required></label>
      <p class="dica">Quem já tem uma fonte com o mesmo código não recebe outra igual.</p>
      <div class="cab-secao"><strong>Secretarias</strong><span><button type="button" class="link link-peq" id="ffl-todas">marcar todas</button> · <button type="button" class="link link-peq" id="ffl-nenhuma">desmarcar</button></span></div>
      <div class="motivos">${secs.map(s => `<label class="check"><input type="checkbox" name="sec" value="${esc(s.id)}" checked> ${esc(s.nome)}</label>`).join('')}</div>
      <p class="erro-form" id="ffl-erro"></p>
      <div class="acoes-form"><button type="button" class="btn btn-sec" data-cancelar>Cancelar</button><button class="btn" type="submit">Adicionar</button></div></form>`
  });
  const f = $('#ffl', m.el);
  f.querySelector('[data-cancelar]').onclick = m.fechar;
  $('#ffl-todas', m.el).onclick = () => $$('[name=sec]', f).forEach(c => { c.checked = true; });
  $('#ffl-nenhuma', m.el).onclick = () => $$('[name=sec]', f).forEach(c => { c.checked = false; });
  f.onsubmit = async e => {
    e.preventDefault();
    const fonte = f.fonte.value.replace(/\s+/g, ' ').trim();
    const ids = $$('[name=sec]:checked', f).map(c => c.value);
    const erro = $('#ffl-erro', m.el);
    if (!fonte) return (erro.textContent = 'Informe a fonte de recurso.');
    if (!ids.length) return (erro.textContent = 'Marque ao menos uma secretaria.');
    const ops = ids.map(id => estado.secretarias.find(s => s.id === id))
      .filter(s => juntarFonte(s.fontes_recursos, fonte) !== (s.fontes_recursos || []))
      .map(s => ({ colecao: 'secretarias', id: s.id, dados: { nome: s.nome, fontes_recursos: juntarFonte(s.fontes_recursos, fonte) } }));
    if (!ops.length) { toast('Todas as secretarias marcadas já têm essa fonte.', 'aviso'); m.fechar(); return; }
    try {
      const falhas = await db.gravarEmLote(ops);
      await db.registrarLog('secretaria.fonte_lote', { fonte, secretarias: ops.length - falhas.length });
      if (falhas.length) return (erro.textContent = `${falhas.length} não foram gravadas.`);
      toast(`Fonte "${fonte}" adicionada em ${ops.length} secretaria(s).`);
      m.fechar();
    } catch (err) { erro.textContent = mensagemErro(err); }
  };
}
