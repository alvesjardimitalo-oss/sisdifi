// SISDIFI — Documentos para impressão / PDF (formato A4, mesmo modelo do sistema anterior)
import { estado, porId, totalReembolsos, ativas, secretariaNome } from '../estado.js';
import { formatarCpf, moeda, horasBR, GRUPOS } from '../calculo.js';
import { esc, $, dataBR, numeroBR, hojeISO } from '../ui.js';
import { aguardando, MESES } from './comum.js';
import { ultimaSimulacao } from './simulador.js';

function cidadeOrgao() { return estado.config.origem?.cidade || ''; }

function cabecalhoDoc(titulo, sub = '') {
  return `<div class="doc-cab"><img src="assets/img/brasao.png" alt="Brasão" class="doc-brasao">
    <div class="doc-titulos"><div class="doc-orgao">${esc(estado.config.orgao)}</div><div class="doc-titulo">${esc(titulo)}</div>${sub ? `<div class="doc-sub">${esc(sub)}</div>` : ''}</div></div>
    <div class="doc-linha"></div>`;
}
const secao = (t, corpo) => `<div class="doc-secao"><div class="doc-secao-titulo">${esc(t)}</div>${corpo}</div>`;
const assinaturas = (a, b) => `<table class="doc-ass"><tr><td><div class="doc-linha-ass">${esc(a)}</div></td><td><div class="doc-linha-ass">${esc(b)}</div></td></tr></table>`;
const localData = iso => `<div class="doc-local">${esc(cidadeOrgao())}, ${esc(dataBR(iso || hojeISO()))}.</div>`;

function docSolicitacao(sol) {
  const tipos = [], qtd = [];
  if (sol.quantidade_alimentacao) { tipos.push('Etapa Alimentação'); qtd.push('Alimentação: ' + sol.quantidade_alimentacao); }
  if (sol.quantidade_simples) { tipos.push('Diária Simples'); qtd.push('Simples: ' + sol.quantidade_simples); }
  if (sol.quantidade_pernoite) { tipos.push('Diária Pernoite'); qtd.push('Pernoite: ' + sol.quantidade_pernoite); }
  const reemb = sol.reembolsos || [];
  const sv = sol.servidor || {};
  return `<div class="folha">
    ${sol.status === 'cancelada' ? '<div class="doc-marca-cancelada">CANCELADA</div>' : ''}
    ${cabecalhoDoc('Solicitação de Diária')}
    <table class="doc-tab"><tr><td class="r" style="width:20%">Nº Solicitação</td><td>${esc(sol.numero)}</td><td class="r" style="width:22%">Data da Solicitação</td><td>${esc(dataBR(sol.data_solicitacao))}</td></tr></table>
    ${secao('1 - Identificação do Servidor', `<table class="doc-tab">
      <tr><td class="r" style="width:18%">Nome</td><td colspan="3">${esc(sv.nome)}</td></tr>
      <tr><td class="r">CPF</td><td style="width:27%">${esc(formatarCpf(sv.cpf))}</td><td class="r" style="width:22%">Chave Pix</td><td>${esc(sv.chave_pix)}</td></tr>
      <tr><td class="r">Cargo/Função</td><td>${esc(sv.cargo_funcao)}</td><td class="r">Secretaria Responsável</td><td>${esc(sol.secretaria_nome || secretariaNome(sol.secretaria_id))}</td></tr>
      <tr><td class="r">Categoria (Lei)</td><td colspan="3">${esc(GRUPOS[sv.grupo] || sv.categoria_nome || '')}</td></tr></table>`)}
    ${secao('2 - Viagem', `<table class="doc-tab">
      <tr><td class="r" style="width:25%">Data e Hora da Saída</td><td style="width:25%">${esc(dataBR(sol.data_hora_saida))}</td><td class="r" style="width:25%">Data e Hora do Retorno</td><td>${esc(dataBR(sol.data_hora_retorno))}</td></tr>
      <tr><td class="r">Destino</td><td colspan="2">${esc(sol.destino_cidade)} / ${esc(sol.destino_uf)}</td><td><strong>Distância:</strong> ${numeroBR(sol.distancia_km)} KM</td></tr>
      <tr><td class="r">Empenho da Diária</td><td>${esc(sol.numero_empenho || '')}</td><td class="r">Data do Empenho</td><td>${esc(dataBR(sol.data_empenho))}</td></tr></table>`)}
    ${secao('3 - Objetivo da Viagem', `<table class="doc-tab"><tr><td class="pre">${esc(sol.objetivo)}</td></tr></table>`)}
    ${secao('4 - Observações', `<table class="doc-tab"><tr><td class="pre">${esc(sol.observacoes || 'Sem observações.')}</td></tr></table>`)}
    ${secao('5 - Especificações', `<table class="doc-tab">
      <tr><td class="r" style="width:22%">Tipo de Diária</td><td style="width:28%">${esc(tipos.join(' / ') || 'Sem diária')}</td><td class="r" style="width:22%">Faixa de Distância</td><td>${esc(sol.faixa_texto)}</td></tr>
      <tr><td class="r">Número de Diárias</td><td>${esc(qtd.join(' | ') || 'Sem diária')}</td><td class="r">Tempo Total</td><td>${horasBR(sol.horas_total)} horas</td></tr>
      <tr><td class="r">Valor Unitário Pernoite</td><td>${moeda(sol.valor_pernoite)}</td><td class="r">Valor Unitário Simples</td><td>${moeda(sol.valor_simples)}</td></tr>
      <tr><td class="r">Valor Unitário Alimentação</td><td>${moeda(sol.valor_alimentacao)}</td><td class="r">Valor Total</td><td><strong>${moeda(sol.valor_total)}</strong></td></tr></table>`)}
    ${secao('Descritivo do Cálculo', `<table class="doc-tab"><tr><td><ul class="doc-lista">${(sol.descricao_calculo || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></td></tr></table>`)}
    ${secao('Justificativa Legal', `<table class="doc-tab"><tr><td><ul class="doc-lista">${(sol.justificativa_legal || []).map(x => `<li>${esc(x)}</li>`).join('')}<li>Base legal: ${esc(estado.config.lei)}.</li></ul></td></tr></table>`)}
    ${reemb.length ? secao('6 - Reembolsos da Viagem', `<table class="doc-tab"><thead><tr><th>Tipo</th><th>Nº Nota</th><th>Série</th><th>Data</th><th>Valor</th><th>Empenho</th></tr></thead>
      <tbody>${reemb.map(r => `<tr><td>${esc(r.tipo)}</td><td>${esc(r.numero_nota)}</td><td>${esc(r.serie_nota)}</td><td>${esc(dataBR(r.data_nota))}</td><td>${moeda(r.valor)}</td><td>${esc(r.numero_empenho)}</td></tr>`).join('')}</tbody></table>
      <div class="doc-total">Total Reembolso: ${moeda(totalReembolsos(sol))}</div>`) : ''}
    ${localData(sol.data_solicitacao)}
    ${assinaturas('Servidor', 'Secretário Responsável')}
  </div>`;
}

function docReembolso(sol, r) {
  const sv = sol.servidor || {};
  return `<div class="folha">
    ${cabecalhoDoc('Formulário de Reembolso')}
    ${secao('1 - Servidor', `<table class="doc-tab">
      <tr><td class="r" style="width:18%">Nome</td><td colspan="3">${esc(sv.nome)}</td></tr>
      <tr><td class="r">CPF</td><td>${esc(formatarCpf(sv.cpf))}</td><td class="r" style="width:20%">Chave Pix</td><td>${esc(sv.chave_pix)}</td></tr>
      <tr><td class="r">Cargo/Função</td><td>${esc(sv.cargo_funcao)}</td><td class="r">Secretaria</td><td>${esc(sol.secretaria_nome)}</td></tr></table>`)}
    ${secao('2 - Viagem Vinculada', `<table class="doc-tab">
      <tr><td class="r" style="width:25%">Nº Solicitação</td><td style="width:25%">${esc(sol.numero)}</td><td class="r" style="width:25%">Data da Solicitação</td><td>${esc(dataBR(sol.data_solicitacao))}</td></tr>
      <tr><td class="r">Destino</td><td colspan="3">${esc(sol.destino_cidade)} / ${esc(sol.destino_uf)}</td></tr>
      <tr><td class="r">Saída</td><td>${esc(dataBR(sol.data_hora_saida))}</td><td class="r">Retorno</td><td>${esc(dataBR(sol.data_hora_retorno))}</td></tr>
      <tr><td class="r">Objetivo</td><td colspan="3" class="pre">${esc(sol.objetivo)}</td></tr></table>`)}
    ${secao('3 - Dados do Reembolso', `<table class="doc-tab">
      <tr><td class="r" style="width:22%">Tipo de Despesa</td><td style="width:28%">${esc(r.tipo)}</td><td class="r" style="width:22%">Valor</td><td><strong>${moeda(r.valor)}</strong></td></tr>
      <tr><td class="r">Chave da Nota</td><td class="quebra">${esc(r.chave_nota)}</td><td class="r">Data da Nota</td><td>${esc(dataBR(r.data_nota))}</td></tr>
      <tr><td class="r">Número da Nota</td><td>${esc(r.numero_nota)}</td><td class="r">Série da Nota</td><td>${esc(r.serie_nota)}</td></tr>
      <tr><td class="r">Empenho do Reembolso</td><td>${esc(r.numero_empenho)}</td><td class="r">Data do Empenho</td><td>${esc(dataBR(r.data_empenho))}</td></tr>
      <tr><td class="r">Descrição</td><td colspan="3" class="pre">${esc(r.descricao)}</td></tr></table>`)}
    ${localData(String(r.lancado_em || '').slice(0, 10) || hojeISO())}
    ${assinaturas('Servidor', 'Setor Responsável')}
  </div>`;
}

function docRelatorioServidor(sv, mes, ano) {
  const sols = estado.solicitacoes.filter(x => x.servidor_id === sv.id &&
    (!ano || String(x.data_hora_saida).startsWith(ano)) && (!mes || String(x.data_hora_saida).slice(5, 7) === mes.padStart(2, '0')));
  const validas = ativas(sols);
  const tD = validas.reduce((t, x) => t + Number(x.valor_total || 0), 0);
  const tR = validas.reduce((t, x) => t + totalReembolsos(x), 0);
  const periodo = mes && ano ? `${MESES[Number(mes) - 1]}/${ano}` : mes ? MESES[Number(mes) - 1] : ano ? `Ano ${ano}` : 'Todos';
  const reembs = validas.flatMap(x => (x.reembolsos || []).map(r => ({ ...r, sol: x })));
  return `<div class="folha">
    ${cabecalhoDoc('Relatório do Servidor', 'Período: ' + periodo + ' (pela data de saída da viagem)')}
    ${secao('1 - Dados do Servidor', `<table class="doc-tab">
      <tr><td class="r" style="width:18%">Nome</td><td style="width:32%">${esc(sv.nome)}</td><td class="r" style="width:18%">CPF</td><td>${esc(formatarCpf(sv.cpf))}</td></tr>
      <tr><td class="r">Cargo/Função</td><td>${esc(sv.cargo_funcao)}</td><td class="r">Chave Pix</td><td>${esc(sv.chave_pix)}</td></tr>
      <tr><td class="r">Categoria</td><td>${esc(GRUPOS[sv.grupo])}</td><td class="r">Secretaria</td><td>${esc(secretariaNome(sv.secretaria_id))}</td></tr></table>`)}
    <table class="doc-resumo"><tr><td><span>Viagens</span><strong>${validas.length}</strong></td><td><span>Diárias</span><strong>${moeda(tD)}</strong></td>
      <td><span>Reembolsos</span><strong>${moeda(tR)}</strong></td><td><span>Total Geral</span><strong>${moeda(tD + tR)}</strong></td></tr></table>
    ${secao('2 - Diárias do Período', `<table class="doc-tab"><thead><tr><th>Nº</th><th>Saída</th><th>Destino</th><th>Valor</th><th>Empenho</th><th>Data Empenho</th></tr></thead>
      <tbody>${sols.map(x => `<tr${x.status === 'cancelada' ? ' class="riscado"' : ''}><td>${esc(x.numero)}${x.status === 'cancelada' ? ' (cancelada)' : ''}</td><td>${esc(dataBR(x.data_hora_saida).slice(0, 10))}</td><td>${esc(x.destino_cidade)} / ${esc(x.destino_uf)}</td>
        <td>${moeda(x.valor_total)}</td><td>${esc(x.numero_empenho)}</td><td>${esc(dataBR(x.data_empenho))}</td></tr>`).join('') || '<tr><td colspan="6">Nenhuma diária no período.</td></tr>'}</tbody></table>`)}
    ${secao('3 - Reembolsos do Período', `<table class="doc-tab"><thead><tr><th>Solicitação</th><th>Destino</th><th>Tipo</th><th>Valor</th><th>Empenho</th><th>Data Empenho</th></tr></thead>
      <tbody>${reembs.map(r => `<tr><td>${esc(r.sol.numero)}</td><td>${esc(r.sol.destino_cidade)} / ${esc(r.sol.destino_uf)}</td><td>${esc(r.tipo)}</td>
        <td>${moeda(r.valor)}</td><td>${esc(r.numero_empenho)}</td><td>${esc(dataBR(r.data_empenho))}</td></tr>`).join('') || '<tr><td colspan="6">Nenhum reembolso no período.</td></tr>'}</tbody></table>`)}
    ${localData(hojeISO())}
  </div>`;
}

function docSimulacao() {
  const { dados: d, resultado: r } = ultimaSimulacao;
  if (!r) return '<div class="folha"><p>Nenhuma simulação feita. Volte ao simulador.</p></div>';
  return `<div class="folha">
    ${cabecalhoDoc('Simulação de Diária', 'Documento informativo — não constitui solicitação')}
    ${secao('Dados informados', `<table class="doc-tab">
      <tr><td class="r" style="width:25%">Categoria</td><td colspan="3">${esc(GRUPOS[d.grupo])}</td></tr>
      <tr><td class="r">Saída</td><td>${esc(dataBR(d.saida))}</td><td class="r" style="width:25%">Retorno</td><td>${esc(dataBR(d.retorno))}</td></tr>
      <tr><td class="r">Distância</td><td>${numeroBR(r.distancia_km)} KM</td><td class="r">Faixa</td><td>${esc(r.faixa_texto)}</td></tr></table>`)}
    ${secao('Resultado', `<table class="doc-tab">
      <tr><td class="r" style="width:25%">Pernoite</td><td>${r.quantidade_pernoite} × ${moeda(r.valor_pernoite)}</td><td class="r" style="width:25%">Simples</td><td>${r.quantidade_simples} × ${moeda(r.valor_simples)}</td></tr>
      <tr><td class="r">Alimentação</td><td>${r.quantidade_alimentacao} × ${moeda(r.valor_alimentacao)}</td><td class="r">Valor Total</td><td><strong>${moeda(r.valor_total)}</strong></td></tr></table>
      <table class="doc-tab"><tr><td><ul class="doc-lista">${r.descricao_calculo.map(x => `<li>${esc(x)}</li>`).join('')}<li>Base legal: ${esc(estado.config.lei)}.</li></ul></td></tr></table>`)}
    ${localData(hojeISO())}
  </div>`;
}

export function telaImprimir(el, { args, query }) {
  if (aguardando(el, ['solicitacoes', 'servidores', 'secretarias', 'config'])) return { viva: true, titulo: 'Impressão' };
  const partes = args[0].split('/');
  let html = '', voltar = '#/solicitacoes', titulo = 'Impressão';
  const naoAchou = '<div class="folha"><p>Documento não encontrado.</p></div>';
  if (partes[0] === 'solicitacao') {
    const sol = porId('solicitacoes', partes[1]);
    html = sol ? docSolicitacao(sol) : naoAchou; voltar = '#/solicitacoes/' + partes[1]; titulo = sol ? 'Solicitação ' + sol.numero : titulo;
  } else if (partes[0] === 'lote') {
    const sols = partes[1].split(',').map(id => porId('solicitacoes', id)).filter(Boolean);
    html = sols.map(docSolicitacao).join('') || naoAchou; voltar = '#/solicitacoes?ids=' + partes[1]; titulo = sols.length + ' solicitações';
  } else if (partes[0] === 'reembolso') {
    const sol = porId('solicitacoes', partes[1]);
    const r = sol && (sol.reembolsos || []).find(x => x.id === partes[2]);
    html = r ? docReembolso(sol, r) : naoAchou; voltar = '#/solicitacoes/' + partes[1]; titulo = 'Reembolso';
  } else if (partes[0] === 'servidor') {
    const sv = porId('servidores', partes[1]);
    html = sv ? docRelatorioServidor(sv, query.get('mes') || '', query.get('ano') || '') : naoAchou; voltar = '#/servidores/' + partes[1]; titulo = sv ? 'Relatório — ' + sv.nome : titulo;
  } else if (partes[0] === 'simulacao') {
    html = docSimulacao(); voltar = '#/simulador'; titulo = 'Simulação';
  } else html = naoAchou;

  el.innerHTML = `<div class="barra-impressao">
      <button class="btn" id="btn-imprimir">🖨 Imprimir / Salvar PDF</button>
      <a class="btn btn-sec" href="${esc(voltar)}">⬅ Voltar</a>
      <span class="muted">Dica: no destino da impressão escolha "Salvar como PDF". Papel A4, margens padrão.</span>
    </div><div class="documentos">${html}</div>`;
  $('#btn-imprimir', el).onclick = () => window.print();
  // Se o documento acabou de ser criado e ainda não chegou do servidor, a tela se atualiza sozinha quando chegar.
  return { titulo, viva: html.includes('Documento não encontrado') };
}
