// SISDIFI — Documentos para impressão / PDF (formato A4, mesmo modelo do sistema anterior)
import { estado, porId, totalReembolsos, ativas, secretariaNome, ETAPAS, etapaDe, pode } from '../estado.js';
import { formatarCpf, moeda, horasBR, GRUPOS, valorPorExtenso } from '../calculo.js';
import { esc, $, dataBR, numeroBR, hojeISO } from '../ui.js';
import { aguardando, MESES } from './comum.js';
import { ultimaSimulacao } from './simulador.js';
import { solicitacoesDoRelatorio, agrupar, SITUACOES_REL, BASES_REL, situacaoPagamento } from './relatorio.js';
import { rotuloFicha } from './orcamento.js';
import { lerChave } from '../notas.js';

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
  if (sol.quantidade_alimentacao) { tipos.push(sol.dentro_municipio ? 'Etapa Alimentação (50%)' : 'Etapa Alimentação'); qtd.push('Alimentação: ' + sol.quantidade_alimentacao); }
  if (sol.quantidade_simples) { tipos.push('Diária Simples'); qtd.push('Simples: ' + sol.quantidade_simples); }
  if (sol.quantidade_pernoite) { tipos.push('Diária Pernoite'); qtd.push('Pernoite: ' + sol.quantidade_pernoite); }
  const reemb = sol.reembolsos || [];
  const sv = sol.servidor || {};
  const e = etapaDe(sol);
  const ci = sol.analise?.resultado === 'aprovada' ? sol.analise : null;
  const marca = sol.status === 'cancelada' ? 'CANCELADA' : e === 'reprovada' ? 'REPROVADA' : '';
  const aviso = sol.status !== 'cancelada' && e === 'analise' ? '<div class="doc-aviso">Aguardando análise do Controle Interno — documento ainda não aprovado.</div>'
    : (sol.etapa && !sol.calculado ? '<div class="doc-aviso">Valor ainda não calculado pela Contabilidade.</div>' : '');
  const links = sol.links || [];
  const nomeCI = ci?.por?.nome || '';
  return `<div class="folha">
    ${marca ? `<div class="doc-marca-cancelada">${marca}</div>` : ''}
    ${cabecalhoDoc('Solicitação de Diária')}
    ${aviso}
    <table class="doc-tab"><tr><td class="r" style="width:18%">Nº Solicitação</td><td><strong>${esc(sol.numero)}</strong></td><td class="r" style="width:22%">Data da Solicitação</td><td>${esc(dataBR(sol.data_solicitacao))}</td></tr></table>
    ${secao('1 - Identificação do Servidor', `<table class="doc-tab">
      <tr><td class="r" style="width:18%">Nome</td><td colspan="3">${esc(sv.nome)}</td></tr>
      <tr><td class="r">CPF</td><td style="width:27%">${esc(formatarCpf(sv.cpf))}</td><td class="r" style="width:22%">Chave Pix</td><td>${esc(sv.chave_pix)}</td></tr>
      <tr><td class="r">Cargo/Função</td><td>${esc(sv.cargo_funcao)}</td><td class="r">Secretaria Responsável</td><td>${esc(sol.secretaria_nome || secretariaNome(sol.secretaria_id))}</td></tr>
      <tr><td class="r">Categoria (Lei)</td><td colspan="3">${esc(GRUPOS[sv.grupo] || sv.categoria_nome || '')}</td></tr></table>`)}
    ${secao('2 - Viagem', `<table class="doc-tab">
      <tr><td class="r" style="width:25%">Data e Hora da Saída</td><td style="width:25%">${esc(dataBR(sol.data_hora_saida))}</td><td class="r" style="width:25%">Data e Hora do Retorno</td><td>${esc(dataBR(sol.data_hora_retorno))}</td></tr>
      <tr><td class="r">Destino</td><td colspan="2">${esc(sol.destino_cidade)} / ${esc(sol.destino_uf)}</td><td><strong>Distância:</strong> ${numeroBR(sol.distancia_km)} KM</td></tr>
      <tr><td class="r">Objetivo</td><td colspan="3" class="pre">${esc(sol.objetivo)}</td></tr>
      <tr><td class="r">Observações</td><td colspan="3" class="pre">${esc(sol.observacoes || 'Sem observações.')}</td></tr></table>`)}
    ${secao('3 - Especificações', `<table class="doc-tab">
      <tr><td class="r" style="width:22%">Tipo de Diária</td><td style="width:28%">${esc(tipos.join(' / ') || 'Sem diária')}</td><td class="r" style="width:22%">Faixa de Distância</td><td>${esc(sol.faixa_texto)}</td></tr>
      <tr><td class="r">Número de Diárias</td><td>${esc(qtd.join(' | ') || 'Sem diária')}</td><td class="r">Tempo Total</td><td>${horasBR(sol.horas_total)} horas</td></tr>
      <tr><td class="r">Valor Unitário Pernoite</td><td>${moeda(sol.valor_pernoite)}</td><td class="r">Valor Unitário Simples</td><td>${moeda(sol.valor_simples)}</td></tr>
      <tr><td class="r">Valor Unitário Alimentação</td><td>${moeda(sol.valor_alimentacao)}</td><td class="r">Valor das Diárias</td><td><strong>${moeda(sol.valor_total)}</strong></td></tr>
      ${totalReembolsos(sol) ? `<tr><td class="r">Reembolsos (notas)</td><td>${moeda(totalReembolsos(sol))}</td><td class="r">Total Geral a Empenhar</td><td><strong>${moeda(Number(sol.valor_total || 0) + totalReembolsos(sol))}</strong></td></tr>` : ''}
      <tr><td class="r">Valor por extenso</td><td colspan="3"><em>${esc(valorPorExtenso(Number(sol.valor_total || 0) + totalReembolsos(sol)))}</em></td></tr></table>`)}
    ${secao('Descritivo do Cálculo e Justificativa Legal', `<table class="doc-tab"><tr><td><ul class="doc-lista">${(sol.descricao_calculo || []).map(x => `<li>${esc(x)}</li>`).join('')}
      ${(sol.justificativa_legal || []).map(x => `<li>${esc(x)}</li>`).join('')}<li>Base legal: ${esc(estado.config.lei)}.</li></ul></td></tr></table>`)}
    ${secao('4 - Análise do Controle Interno', `<table class="doc-tab">
      <tr><td class="r" style="width:22%">Parecer</td><td style="width:28%">${ci ? 'APROVADA' : e === 'reprovada' ? 'REPROVADA' : ''}</td><td class="r" style="width:22%">Responsável / Data</td><td>${esc(nomeCI)}${ci ? ' — ' + esc(dataBR(ci.em)) : ''}</td></tr>
      <tr><td class="r">Conta de Pagamento</td><td>${esc(sol.conta_pagamento || '')}</td><td class="r">Fonte de Recursos</td><td>${esc(sol.fonte_recursos || '')}</td></tr>
      ${ci?.parecer ? `<tr><td class="r">Observação</td><td colspan="3" class="pre">${esc(ci.parecer)}</td></tr>` : ''}</table>`)}
    ${secao('5 - Contabilidade', `<table class="doc-tab">
      <tr><td class="r" style="width:22%">Ficha</td><td style="width:28%">${esc(rotuloFicha(sol))}</td><td class="r" style="width:22%">Nº / Data do Empenho</td><td>${esc(sol.numero_empenho || '')}${sol.data_empenho ? ' — ' + esc(dataBR(sol.data_empenho)) : ''}${(sol.empenho_conjunto || []).length > 1 ? `<br><small>Empenho conjunto: ${esc(sol.empenho_conjunto.join(', '))}</small>` : ''}</td></tr>
      <tr><td class="r">Cálculo conferido por</td><td colspan="3">${esc(sol.calculo_por?.nome || '')}${sol.calculo_em ? ' — ' + esc(dataBR(sol.calculo_em)) : ''}</td></tr></table>`)}
    ${links.length ? secao('Curso / Capacitação / Evento', `<table class="doc-tab"><tr><td><div class="doc-links">${links.map(u => `<div class="doc-link"><div class="doc-qr doc-qr-peq" data-qr="${esc(u)}"></div><span>${esc(u)}</span></div>`).join('')}</div></td></tr></table>`) : ''}
    ${reemb.length ? secao('6 - Reembolsos da Viagem', `<table class="doc-tab"><thead><tr><th>Tipo</th><th>Nº Nota</th><th>Série</th><th>Data</th><th>Valor</th><th>Empenho</th></tr></thead>
      <tbody>${reemb.map(r => `<tr><td>${esc(r.tipo)}${r.chave_nota ? `<br><small class="quebra">${esc(lerChave(r.chave_nota)?.modeloNome || '')} ${esc(r.chave_nota)}</small>` : ''}</td><td>${esc(r.numero_nota)}</td><td>${esc(r.serie_nota)}</td><td>${esc(dataBR(r.data_nota))}</td><td>${moeda(r.valor)}</td><td>${esc(r.numero_empenho)}</td></tr>`).join('')}</tbody></table>
      <div class="doc-total">Total Reembolso: ${moeda(totalReembolsos(sol))} &nbsp;·&nbsp; Total Geral (diárias + reembolsos): ${moeda(Number(sol.valor_total || 0) + totalReembolsos(sol))}</div>`) : ''}
    ${localData(sol.data_solicitacao)}
    <table class="doc-ass doc-ass-4"><tr>
      <td><div class="doc-linha-ass">Servidor<br><small>${esc(sv.nome)}</small></div></td>
      <td><div class="doc-linha-ass">Secretário Responsável<br><small>${esc(sol.secretaria_nome || '')}</small></div></td>
    </tr><tr>
      <td><div class="doc-linha-ass">Controle Interno<br><small>${esc(nomeCI || ' ')}</small></div></td>
      <td><div class="doc-linha-ass">Autorizo — Prefeito Municipal<br><small>Data: ${sol.data_autorizacao ? esc(dataBR(sol.data_autorizacao)) : '____/____/________'}</small></div></td>
    </tr></table>
    <div class="doc-rodape">
      <div class="doc-qr" data-qr="${esc(urlSolicitacao(sol))}"></div>
      <div>Código de verificação: <strong>${esc(codigoVerificacao(sol))}</strong><br>
        Emitida por ${esc(sol.criado_por?.nome || '—')} em ${esc(dataBR(sol.data_solicitacao))} · Etapa: ${esc(sol.status === 'cancelada' ? 'Cancelada' : ETAPAS[e].curto)}
        ${sol.atualizado_em?.toDate ? ' · Última alteração: ' + esc(sol.atualizado_em.toDate().toLocaleString('pt-BR')) + (sol.atualizado_por?.nome ? ' por ' + esc(sol.atualizado_por.nome) : '') : ''}<br>
        Confira a autenticidade no SISDIFI pelo QR Code ou pelo código.</div>
    </div>
  </div>`;
}

function urlSolicitacao(sol) { return location.origin + location.pathname + '#/solicitacoes/' + sol.id; }
function codigoVerificacao(sol) { return (sol.numero || '').replace('/', '-') + '-' + String(sol.id).slice(-6).toUpperCase(); }

let qrPronto = null;
function carregarQR() {
  if (!qrPronto) qrPronto = new Promise((ok, falha) => {
    if (window.QRCode) return ok();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = ok; s.onerror = () => { qrPronto = null; falha(); };
    document.head.appendChild(s);
  });
  return qrPronto;
}
function desenharQRs(el) {
  const alvos = [...el.querySelectorAll('[data-qr]')];
  if (!alvos.length) return;
  carregarQR().then(() => alvos.forEach(a => { a.innerHTML = ''; new window.QRCode(a, { text: a.dataset.qr, width: 64, height: 64, correctLevel: window.QRCode.CorrectLevel.M }); }))
    .catch(() => alvos.forEach(a => a.remove()));
}

/** Resumo do empenho (um ou mais pedidos do mesmo servidor no mesmo empenho): diárias + reembolsos. */
function docEmpenho(sol) {
  const lista = ativas(estado.solicitacoes).filter(x => x.servidor_id === sol.servidor_id && x.numero_empenho === sol.numero_empenho && x.data_empenho === sol.data_empenho)
    .sort((a, b) => String(a.data_hora_saida).localeCompare(String(b.data_hora_saida)));
  const sv = sol.servidor || {};
  const reembDoEmp = x => (x.reembolsos || []).filter(r => r.numero_empenho === sol.numero_empenho);
  const tD = lista.reduce((t, x) => t + Number(x.valor_total || 0), 0);
  const tR = lista.reduce((t, x) => t + reembDoEmp(x).reduce((a, r) => a + Number(r.valor || 0), 0), 0);
  return `<div class="folha">
    ${cabecalhoDoc('Resumo do Empenho', `Empenho nº ${esc(sol.numero_empenho)} de ${esc(dataBR(sol.data_empenho))}`)}
    ${secao('1 - Credor (Servidor)', `<table class="doc-tab">
      <tr><td class="r" style="width:18%">Nome</td><td colspan="3">${esc(sv.nome)}</td></tr>
      <tr><td class="r">CPF</td><td style="width:27%">${esc(formatarCpf(sv.cpf))}</td><td class="r" style="width:22%">Chave Pix</td><td>${esc(sv.chave_pix)}</td></tr>
      <tr><td class="r">Ficha</td><td colspan="3">${esc(rotuloFicha(sol))}</td></tr>
      <tr><td class="r">Fonte / Conta</td><td colspan="3">${esc(sol.fonte_recursos || '')}${sol.conta_pagamento ? ' · ' + esc(sol.conta_pagamento) : ''}</td></tr></table>`)}
    ${secao('2 - Solicitações neste empenho', `<table class="doc-tab"><thead><tr><th>Nº</th><th>Destino</th><th>Saída</th><th>Retorno</th><th>Diárias</th><th>Reembolsos</th><th>Total</th></tr></thead>
      <tbody>${lista.map(x => { const r = reembDoEmp(x).reduce((a, y) => a + Number(y.valor || 0), 0); return `<tr><td>${esc(x.numero)}</td><td>${esc(x.destino_cidade)}/${esc(x.destino_uf)}</td><td>${esc(dataBR(x.data_hora_saida))}</td><td>${esc(dataBR(x.data_hora_retorno))}</td><td>${moeda(x.valor_total)}</td><td>${moeda(r)}</td><td><strong>${moeda(Number(x.valor_total || 0) + r)}</strong></td></tr>`; }).join('')}
      <tr><td class="r" colspan="4">TOTAL</td><td class="r">${moeda(tD)}</td><td class="r">${moeda(tR)}</td><td class="r">${moeda(tD + tR)}</td></tr></tbody></table>
      <div class="doc-total">Total geral do empenho: ${moeda(tD + tR)} — <em>${esc(valorPorExtenso(tD + tR))}</em></div>`)}
    ${localData(sol.data_empenho)}
    ${assinaturas('Contabilidade', 'Ordenador da Despesa')}
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

function docRelatorioPeriodo(q) {
  const f = { ano: q.get('ano') || '', mes: q.get('mes') || '', base: q.get('base') || 'viagem', secretaria: q.get('secretaria') || '', fonte: q.get('fonte') || '', situacao: q.get('situacao') || 'empenhadas' };
  const sols = solicitacoesDoRelatorio(f);
  const periodo = f.mes && f.ano ? `${MESES[Number(f.mes) - 1]}/${f.ano}` : f.mes ? MESES[Number(f.mes) - 1] : f.ano ? `Ano ${f.ano}` : 'Todo o período';
  const ref = (BASES_REL[f.base] || BASES_REL.viagem).toLowerCase();
  const sit = (SITUACOES_REL[f.situacao] || 'todas as solicitações calculadas').toLowerCase();
  const filtros = [f.secretaria ? 'Secretaria: ' + (estado.secretarias.find(x => x.id === f.secretaria)?.nome || '') : '', f.fonte ? 'Fonte: ' + f.fonte : ''].filter(Boolean).join(' · ');
  const tab = (titulo, linhas) => {
    const tot = linhas.reduce((a, [, v]) => ({ n: a.n + v.n, d: a.d + v.d, r: a.r + v.r }), { n: 0, d: 0, r: 0 });
    return secao(titulo, `<table class="doc-tab"><thead><tr><th style="width:40%"></th><th>Qtd.</th><th>Diárias</th><th>Reembolsos</th><th>Total</th></tr></thead>
      <tbody>${linhas.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.n}</td><td>${moeda(v.d)}</td><td>${moeda(v.r)}</td><td><strong>${moeda(v.d + v.r)}</strong></td></tr>`).join('') || '<tr><td colspan="5">Nada no período.</td></tr>'}
      <tr><td class="r">TOTAL</td><td class="r">${tot.n}</td><td class="r">${moeda(tot.d)}</td><td class="r">${moeda(tot.r)}</td><td class="r">${moeda(tot.d + tot.r)}</td></tr></tbody></table>`);
  };
  return `<div class="folha folha-relatorio">
    ${cabecalhoDoc('Relatório de Diárias', `Período: ${periodo} (pela ${ref}) — ${sit}${filtros ? ' — ' + filtros : ''}`)}
    ${tab('1 - Situação do Pagamento', agrupar(sols, situacaoPagamento))}
    ${tab('2 - Resumo por Servidor', agrupar(sols, s => s.servidor?.nome))}
    ${tab('3 - Resumo por Secretaria', agrupar(sols, s => s.secretaria_nome))}
    ${tab('4 - Resumo por Fonte de Recursos', agrupar(sols, s => s.fonte_recursos))}
    ${tab('5 - Resumo por Ficha (ação / atividade)', agrupar(sols, s => rotuloFicha(s)))}
    ${secao('6 - Solicitações', `<table class="doc-tab doc-tab-peq"><thead><tr><th style="width:9%">Nº</th><th style="width:18%">Servidor</th><th style="width:11%">Destino</th><th style="width:8%">Saída</th><th style="width:13%">Fonte</th><th style="width:12%">Ficha</th><th style="width:11%">Empenho</th><th style="width:9%">Valor</th><th style="width:8%">Etapa</th></tr></thead>
      <tbody>${sols.map(x => `<tr><td>${esc(x.numero)}</td><td>${esc(x.servidor?.nome)}<br><small>${esc(x.secretaria_nome)}</small></td><td>${esc(x.destino_cidade)}/${esc(x.destino_uf)}</td>
        <td>${esc(dataBR(x.data_hora_saida).slice(0, 10))}</td><td>${esc(x.fonte_recursos || '')}</td><td>${esc(rotuloFicha(x))}</td>
        <td>${esc(x.numero_empenho || '')}${x.data_empenho ? '<br><small>' + esc(dataBR(x.data_empenho)) + '</small>' : ''}</td><td>${moeda(Number(x.valor_total || 0) + totalReembolsos(x))}</td><td>${esc(ETAPAS[etapaDe(x)].curto)}</td></tr>`).join('') || '<tr><td colspan="9">Nenhuma solicitação.</td></tr>'}</tbody></table>`)}
    ${localData(hojeISO())}
    <table class="doc-ass"><tr><td><div class="doc-linha-ass">Responsável<br><small>${esc(estado.sessao.nome)}</small></div></td><td></td></tr></table>
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
  } else if (partes[0] === 'empenho') {
    const sol = porId('solicitacoes', partes[1]);
    html = sol?.numero_empenho ? docEmpenho(sol) : naoAchou; voltar = '#/solicitacoes/' + partes[1]; titulo = 'Empenho ' + (sol?.numero_empenho || '');
  } else if (partes[0] === 'servidor') {
    const sv = porId('servidores', partes[1]);
    html = sv ? docRelatorioServidor(sv, query.get('mes') || '', query.get('ano') || '') : naoAchou; voltar = '#/servidores/' + partes[1]; titulo = sv ? 'Relatório — ' + sv.nome : titulo;
  } else if (partes[0] === 'mensal') {
    html = docRelatorioPeriodo(query); voltar = '#/relatorio'; titulo = 'Relatório de diárias';
  } else if (partes[0] === 'simulacao') {
    html = docSimulacao(); voltar = '#/simulador'; titulo = 'Simulação';
  } else html = naoAchou;

  const linksDoc = partes[0] === 'solicitacao' ? (porId('solicitacoes', partes[1])?.links || []) : [];
  el.innerHTML = `<div class="barra-impressao">
      <button class="btn" id="btn-imprimir">🖨 Imprimir / Salvar PDF</button>
      ${linksDoc.map((u, i) => `<a class="btn btn-sec" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(u)}">🔗 Abrir link do curso${linksDoc.length > 1 ? ' ' + (i + 1) : ''} para imprimir</a>`).join('')}
      <a class="btn btn-sec" href="${esc(voltar)}">⬅ Voltar</a>
      <span class="muted">Dica: no destino da impressão escolha "Salvar como PDF". Papel A4, margens padrão.</span>
    </div><div class="documentos">${html}</div>`;
  $('#btn-imprimir', el).onclick = () => window.print();
  desenharQRs(el);
  // Se o documento acabou de ser criado e ainda não chegou do servidor, a tela se atualiza sozinha quando chegar.
  // Tela viva: se os dados (ex.: valores recém-calculados) chegarem depois, o documento se atualiza sozinho.
  return { titulo, viva: true };
}
