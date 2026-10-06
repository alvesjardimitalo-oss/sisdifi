// SISDIFI — Secretarias
import * as db from '../db.js';
import { estado, pode, ativas } from '../estado.js';
import { moeda } from '../calculo.js';
import { esc, $, $$, toast, modal, normalizar, lerForm, mensagemErro } from '../ui.js';
import { aguardando, cabecalho } from './comum.js';

export function telaSecretarias(el) {
  if (aguardando(el, ['secretarias', 'servidores', 'solicitacoes'])) return { viva: true, titulo: 'Secretarias' };
  const validas = ativas(estado.solicitacoes);
  el.innerHTML = `
    ${cabecalho('Secretarias', pode.editar() ? '<button class="btn" id="nova-sec">＋ Nova secretaria</button>' : '')}
    <div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Secretaria</th><th class="num">Servidores ativos</th><th class="num">Solicitações</th><th class="num">Valor em diárias</th><th>Situação</th><th></th></tr></thead>
      <tbody>${[...estado.secretarias].sort((a, b) => (b.ativo !== false) - (a.ativo !== false) || a.nome.localeCompare(b.nome, 'pt-BR')).map(s => {
        const sols = validas.filter(x => x.secretaria_id === s.id);
        return `<tr>
          <td><strong>${esc(s.nome)}</strong></td>
          <td class="num">${estado.servidores.filter(x => x.secretaria_id === s.id && x.ativo !== false).length}</td>
          <td class="num">${sols.length}</td>
          <td class="num">${moeda(sols.reduce((t, x) => t + Number(x.valor_total || 0), 0))}</td>
          <td>${s.ativo === false ? '<span class="selo selo-cancelada">Inativa</span>' : '<span class="selo selo-emitida">Ativa</span>'}</td>
          <td class="acoes-linha">${pode.editar() ? `<button class="btn btn-sec btn-peq" data-editar="${esc(s.id)}">✎ Editar</button>` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="6" class="vazio-linha">Nenhuma secretaria cadastrada.</td></tr>'}</tbody>
    </table></div>`;
  $('#nova-sec', el)?.addEventListener('click', () => formSecretaria(null));
  $$('[data-editar]', el).forEach(b => b.onclick = () => formSecretaria(estado.secretarias.find(s => s.id === b.dataset.editar)));
  return { viva: true, titulo: 'Secretarias' };
}

function formSecretaria(s) {
  const m = modal({
    titulo: s ? 'Editar secretaria' : 'Nova secretaria', largura: 480,
    corpo: `<form id="fsec" novalidate>
      <label class="campo"><span>Nome</span><input name="nome" value="${esc(s?.nome || '')}" required maxlength="120"></label>
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
      await db.salvar('secretarias', s?.id || null, { nome: d.nome, ativo: s ? d.ativo === '1' : true });
      await db.registrarLog(s ? 'secretaria.editar' : 'secretaria.criar', { nome: d.nome });
      toast('Secretaria salva.');
      m.fechar();
    } catch (err) { erro.textContent = mensagemErro(err); }
  };
}
