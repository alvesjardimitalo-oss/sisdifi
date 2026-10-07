// SISDIFI — Exercícios: cada ano tem o seu orçamento; a abertura confere o que mudou (agentes políticos, lei, contas…)
import * as db from '../db.js';
import { estado, pode, exercicioDoc, definirExercicio, ativas } from '../estado.js';
import { GRUPOS } from '../calculo.js';
import { esc, $, $$, toast, confirmar, mensagemErro, dataBR } from '../ui.js';
import { aguardando, cabecalho, anosDisponiveis } from './comum.js';
import { importarPDFsOrcamento } from './orcamento.js';
import { importarRelacao, revisarCategorias, categoriaEsperada } from './servidores.js';

/** Perguntas da abertura do exercício: [chave, pergunta, o que fazer se mudou]. */
export const PERGUNTAS = [
  ['agentes', 'Houve alteração nos agentes políticos (secretários, vice-prefeito)?', 'Importe a relação de servidores atualizada e rode "Revisar categorias".'],
  ['lei', 'Houve alteração na lei das diárias ou nos valores?', 'Atualize os valores e a lei em Parâmetros da lei.'],
  ['contas', 'Mudaram as contas de pagamento ou as fontes de recursos das secretarias?', 'Atualize em Secretarias (contas e fontes de cada uma).'],
  ['usuarios', 'Mudaram os responsáveis das secretarias ou do Controle Interno (usuários de acesso)?', 'Ajuste em Usuários: crie os novos e desative quem saiu.']
];

export const anoAtual = () => new Date().getFullYear();
export const exercicioAberto = ano => exercicioDoc(ano)?.status === 'aberto';

function anosExercicio() {
  const anos = new Set([...anosDisponiveis(), ...estado.exercicios.map(e => Number(e.ano)), anoAtual(), anoAtual() + 1, ...estado.fichas.map(f => Number(f.ano)).filter(Boolean)]);
  return [...anos].sort((a, b) => b - a);
}
export { anosExercicio };

export function telaExercicio(el) {
  if (aguardando(el, ['secretarias', 'servidores', 'fichas', 'solicitacoes'])) return { viva: true, titulo: 'Exercícios' };
  const ano = estado.exercicio;
  const doc = exercicioDoc(ano) || { ano, respostas: {} };
  const resp = doc.respostas || {};
  const fichasAno = estado.fichas.filter(f => Number(f.ano) === ano);
  const secsComOrc = new Set(fichasAno.map(f => f.secretaria_id));
  const politicos = estado.servidores.filter(s => s.ativo !== false && s.grupo === 'VICE_SECRETARIO_JURIDICO');
  const foraDaRegra = estado.servidores.filter(s => s.ativo !== false && categoriaEsperada(s) !== s.grupo).length;
  const solsAno = ativas(estado.solicitacoes).filter(s => String(s.data_hora_saida || '').startsWith(String(ano))).length;
  const respondidas = PERGUNTAS.every(([k]) => resp[k]);
  const okOrc = fichasAno.length > 0;

  el.innerHTML = `
    ${cabecalho('Exercícios', '', 'Cada exercício (ano) tem o seu orçamento. Na abertura, o sistema confere o que mudou em relação ao ano anterior.')}
    <section class="cartao">
      <div class="cab-secao"><h3>Exercícios</h3></div>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>Exercício</th><th>Situação</th><th class="num">Fichas no orçamento</th><th class="num">Solicitações</th><th>Aberto por</th><th></th></tr></thead>
        <tbody>${anosExercicio().map(a => {
          const d = exercicioDoc(a);
          const nf = estado.fichas.filter(f => Number(f.ano) === a).length;
          const ns = ativas(estado.solicitacoes).filter(s => String(s.data_hora_saida || '').startsWith(String(a))).length;
          return `<tr class="${a === ano ? 'linha-ativa' : ''}"><td><strong>${a}</strong>${a === anoAtual() ? ' <small class="muted">(ano atual)</small>' : ''}</td>
            <td>${d?.status === 'aberto' ? '<span class="selo selo-emitida">Aberto</span>' : d ? '<span class="selo selo-pendente">Em abertura</span>' : '<span class="selo">Não aberto</span>'}</td>
            <td class="num">${nf}</td><td class="num">${ns}</td>
            <td>${esc(d?.aberto_por?.nome || '')}${d?.aberto_em ? `<small class="muted bloco">${esc(dataBR(d.aberto_em))}</small>` : ''}</td>
            <td class="acoes-linha">${a === ano ? '<span class="muted">em uso</span>' : `<button class="btn btn-sec btn-peq" data-usar-ano="${a}">Usar este exercício</button>`}</td></tr>`;
        }).join('')}</tbody></table></div>
    </section>

    <section class="cartao">
      <div class="cab-secao"><h3>Abertura do exercício ${ano}</h3>${doc.status === 'aberto' ? '<span class="selo selo-emitida">Aberto</span>' : ''}</div>
      <ol class="abertura">
        <li class="${okOrc ? 'ok' : ''}">
          <strong>Orçamento ${ano}</strong>
          <p>${okOrc ? `✓ ${fichasAno.length} ficha(s)/fonte(s) de ${secsComOrc.size} secretaria(s) importadas.` : `Ainda não há orçamento de ${ano}. Importe os PDFs do Demonstrativo da Despesa Fixada.`}</p>
          <button class="btn btn-sec btn-peq" id="ab-orc">📄 Ler PDFs do orçamento ${ano}</button>
        </li>
        ${PERGUNTAS.map(([k, pergunta, acao], i) => `<li class="${resp[k] ? 'ok' : ''}">
          <strong>${esc(pergunta)}</strong>
          <div class="sim-nao">
            <label class="check"><input type="radio" name="p-${k}" value="nao" ${resp[k] === 'nao' ? 'checked' : ''}> Não, continua igual</label>
            <label class="check"><input type="radio" name="p-${k}" value="sim" ${resp[k] === 'sim' ? 'checked' : ''}> Sim, mudou</label>
          </div>
          ${resp[k] === 'sim' ? `<div class="alerta alerta-info">${esc(acao)}
            ${k === 'agentes' ? `<br><button class="btn btn-sec btn-peq" id="ab-relacao">📄 Importar relação de servidores</button> <button class="btn btn-sec btn-peq" id="ab-categorias">⚖ Revisar categorias${foraDaRegra ? ` (${foraDaRegra} fora da regra)` : ''}</button>` : ''}
            ${k === 'lei' && pode.admin() ? '<br><a class="btn btn-sec btn-peq" href="#/parametros">Abrir Parâmetros da lei</a>' : ''}
            ${k === 'contas' ? '<br><a class="btn btn-sec btn-peq" href="#/secretarias">Abrir Secretarias</a>' : ''}
            ${k === 'usuarios' && pode.admin() ? '<br><a class="btn btn-sec btn-peq" href="#/usuarios">Abrir Usuários</a>' : ''}</div>` : ''}
          ${k === 'agentes' ? `<details><summary>Agentes políticos cadastrados hoje (${politicos.length})</summary><p class="muted">${politicos.map(s => esc(s.nome) + (s.cargo_funcao ? ' · ' + esc(s.cargo_funcao) : '')).join('<br>') || 'Nenhum.'}</p></details>` : ''}
        </li>`).join('')}
      </ol>
      <div class="acoes-form">
        ${doc.status === 'aberto' ? `<span class="muted">Aberto por ${esc(doc.aberto_por?.nome || '')} em ${esc(dataBR(doc.aberto_em))}.</span>` : ''}
        <button class="btn" id="ab-concluir" ${respondidas ? '' : 'disabled'}>${doc.status === 'aberto' ? 'Salvar respostas' : `✓ Concluir abertura de ${ano}`}</button>
      </div>
      ${respondidas ? '' : '<p class="dica" style="text-align:right">Responda todas as perguntas para concluir.</p>'}
    </section>`;

  const salvar = async dados => {
    try { await db.salvar('exercicios', String(ano), { ano, respostas: { ...resp, ...(dados.respostas || {}) }, ...(dados.extra || {}) }); }
    catch (err) { toast(mensagemErro(err), 'erro'); }
  };
  $$('[data-usar-ano]', el).forEach(b => b.onclick = () => { definirExercicio(b.dataset.usarAno); toast(`Exercício ${b.dataset.usarAno} em uso.`); });
  $$('.sim-nao input', el).forEach(r => r.onchange = () => salvar({ respostas: { [r.name.slice(2)]: r.value } }));
  $('#ab-orc', el).onclick = () => importarPDFsOrcamento();
  $('#ab-relacao', el)?.addEventListener('click', () => importarRelacao());
  $('#ab-categorias', el)?.addEventListener('click', () => revisarCategorias());
  $('#ab-concluir', el).onclick = async () => {
    if (!okOrc && !(await confirmar(`O orçamento de ${ano} ainda não foi importado. Concluir a abertura mesmo assim?`, { ok: 'Concluir' }))) return;
    await salvar({ extra: { status: 'aberto', ...(doc.status === 'aberto' ? {} : { aberto_em: new Date().toISOString(), aberto_por: { uid: estado.sessao.uid, nome: estado.sessao.nome } }) } });
    await db.registrarLog('exercicio.abrir', { ano, respostas: resp });
    toast(`Exercício ${ano} aberto.`);
  };
  return { viva: true, titulo: 'Exercícios' };
}

/** Aviso no painel da Contabilidade quando o exercício do ano atual ainda não foi aberto. */
export function avisoExercicio() {
  if (!pode.contabil() || !estado.prontos.has('exercicios')) return '';
  const ano = anoAtual();
  if (exercicioAberto(ano)) return '';
  return `<a class="alerta alerta-link" href="#/exercicio" data-abrir-ano="${ano}">📅 O exercício ${ano} ainda não foi aberto. Importe o orçamento de ${ano} e confirme se houve mudanças (agentes políticos, lei, contas, usuários). Clique para abrir.</a>`;
}
