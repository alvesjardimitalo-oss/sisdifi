// SISDIFI — Simulador (substitui a antiga calculadora calcular.php): calcula sem gravar nada
import { estado } from '../estado.js';
import { calcularDiaria, GRUPOS, FAIXAS, moeda, horasBR } from '../calculo.js';
import { esc, $, lerForm } from '../ui.js';
import { aguardando, cabecalho } from './comum.js';

export const ultimaSimulacao = { dados: null, resultado: null };
const valores = { grupo: 'DEMAIS_SERVIDORES', km: '', saida: '', retorno: '', dentro_municipio: false };

export function telaSimulador(el) {
  if (aguardando(el, ['config'])) return { viva: true, titulo: 'Simulador' };
  const v = estado.config.valores;
  el.innerHTML = `
    ${cabecalho('Simulador de diárias', '', 'Faça uma consulta rápida sem gerar solicitação. Útil para orçamento de viagens.')}
    <div class="grade-form">
      <form class="cartao col-form" id="fsim">
        <label class="campo"><span>Categoria do servidor</span><select name="grupo">
          ${Object.entries(GRUPOS).map(([k, n]) => `<option value="${k}" ${valores.grupo === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="campo"><span>Distância (km)</span><input type="number" name="km" min="0.01" step="0.01" value="${esc(valores.km)}"></label>
        <div class="grade-2">
          <label class="campo"><span>Saída</span><input type="datetime-local" name="saida" value="${esc(valores.saida)}"></label>
          <label class="campo"><span>Retorno</span><input type="datetime-local" name="retorno" value="${esc(valores.retorno)}"></label>
        </div>
        <label class="check"><input type="checkbox" name="dentro_municipio" ${valores.dentro_municipio ? 'checked' : ''}> Dentro do território do município (Art. 6º, § 2º)</label>
        <details class="mt"><summary>Tabela de valores em vigor (${esc(estado.config.lei)})</summary>
          <div class="tabela-wrap"><table class="tabela tabela-peq"><thead><tr><th>Categoria</th>${Object.values(FAIXAS).map(f => `<th colspan="2">${esc(f)}</th>`).join('')}</tr>
            <tr><th></th>${Object.keys(FAIXAS).map(() => '<th>Simples</th><th>Pernoite</th>').join('')}</tr></thead>
            <tbody>${Object.entries(GRUPOS).map(([g, n]) => `<tr><td>${esc(n)}</td>${Object.keys(FAIXAS).map(f => `<td>${moeda(v[g].SIMPLES[f])}</td><td>${moeda(v[g].PERNOITE[f])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
          <p class="muted">Etapa alimentação: ${moeda(estado.config.alimentacao)} (50% dentro do município). Abaixo de 100 km com pernoite paga-se o valor da diária simples (Art. 7º, § 2º).</p>
        </details>
      </form>
      <aside class="col-resultado"><div class="cartao resultado-calc" id="res-sim"></div>
        <div class="acoes-form"><a class="btn btn-sec" id="imp-sim" href="#/imprimir/simulacao" hidden>🖨 Imprimir simulação</a></div></aside>
    </div>`;
  const f = $('#fsim', el);
  const atualizar = () => {
    Object.assign(valores, lerForm(f));
    const r = calcularDiaria({ grupo: valores.grupo, km: valores.km, saida: valores.saida, retorno: valores.retorno, dentroMunicipio: !!valores.dentro_municipio, parametros: estado.config });
    const box = $('#res-sim', el);
    $('#imp-sim', el).hidden = !!r.erro;
    if (r.erro) { box.innerHTML = `<p class="muted">${esc(r.erro)}</p>`; ultimaSimulacao.resultado = null; return; }
    ultimaSimulacao.dados = { ...valores }; ultimaSimulacao.resultado = r;
    box.innerHTML = `<h3>Resultado</h3>
      <div class="calc-total grande"><span>Valor total</span><strong>${moeda(r.valor_total)}</strong></div>
      <dl class="dl-calc"><dt>Tempo fora</dt><dd>${horasBR(r.horas_total)} h</dd><dt>Faixa</dt><dd>${esc(r.faixa_texto)}</dd>
        <dt>Pernoite</dt><dd>${r.quantidade_pernoite} × ${moeda(r.valor_pernoite)}</dd><dt>Simples</dt><dd>${r.quantidade_simples} × ${moeda(r.valor_simples)}</dd>
        <dt>Alimentação</dt><dd>${r.quantidade_alimentacao} × ${moeda(r.valor_alimentacao)}</dd></dl>
      <ul class="lista-peq">${r.descricao_calculo.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  };
  f.oninput = atualizar; f.onchange = atualizar; f.onsubmit = e => e.preventDefault();
  atualizar();
  return { titulo: 'Simulador' };
}
