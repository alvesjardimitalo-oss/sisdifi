// SISDIFI — Conversão do banco do sistema antigo (sisdifi.sqlite) para o Firestore.
// Função pura: recebe as tabelas lidas do SQLite e devolve as gravações a fazer.
import { GRUPOS, limparCpf, PARAMETROS_PADRAO } from './calculo.js';
import { chaveDistancia } from './localidades.js';
import { separarValores } from './estado.js';

const FAIXA_TEXTO_PARA_CODIGO = { '0 a 149 KM': '0_149', '150 a 300 KM': '150_300', 'Acima de 300 KM': 'ACIMA_300' };

function jsonLista(v) {
  try { const x = JSON.parse(v || '[]'); return Array.isArray(x) ? x : []; } catch { return v ? [String(v)] : []; }
}
const txt = v => (v === null || v === undefined ? '' : String(v));
const num = v => Number(v || 0);

export function mapearBancoAntigo(t, { agora = new Date().toISOString() } = {}) {
  const avisos = [];
  const ops = [];
  const origem = { nome: 'Importação do SISDIFI desktop' };
  const tab = n => t[n] || [];

  // Categorias → grupo
  const grupoDaCategoria = Object.fromEntries(tab('categorias_diaria').map(c => [c.id, c.grupo_valor || c.codigo]));

  // Secretarias
  const secId = id => (id ? 'sec_' + id : null);
  const secNome = Object.fromEntries(tab('secretarias').map(s => [s.id, s.nome]));
  for (const s of tab('secretarias')) {
    ops.push({ colecao: 'secretarias', id: secId(s.id), dados: { nome: txt(s.nome).trim(), ativo: num(s.ativo ?? 1) === 1, legado_id: s.id, importado_em: agora, criado_por: origem } });
  }

  // Servidores
  const svPorId = {};
  for (const s of tab('servidores')) {
    const grupo = grupoDaCategoria[s.categoria_diaria_id];
    let cpf = limparCpf(s.cpf);
    if (cpf.length !== 11) {
      avisos.push(`Servidor "${txt(s.nome).trim()}": CPF com ${cpf.length} dígito(s) no banco antigo (${cpf}). Importado completado com zeros à esquerda — corrija o CPF no cadastro do servidor.`);
      cpf = cpf.slice(0, 11).padStart(11, '0');
    }
    if (!GRUPOS[grupo]) avisos.push(`Servidor "${s.nome}" com categoria desconhecida (${s.categoria_diaria_id}); importado como Demais Servidores.`);
    const dados = {
      nome: txt(s.nome).trim().replace(/\s+/g, ' '), cpf, chave_pix: txt(s.chave_pix).trim(),
      cargo_funcao: txt(s.cargo_funcao).trim(), grupo: GRUPOS[grupo] ? grupo : 'DEMAIS_SERVIDORES',
      secretaria_id: s.secretaria_id && secNome[s.secretaria_id] !== undefined ? secId(s.secretaria_id) : null,
      ativo: num(s.ativo ?? 1) === 1, legado_id: s.id, importado_em: agora, criado_por: origem
    };
    svPorId[s.id] = dados;
    ops.push({ colecao: 'servidores', id: 'srv_' + s.id, dados });
  }

  // Tipos de despesa
  const tipoNome = Object.fromEntries(tab('tipos_despesa').map(x => [x.id, x.nome]));

  // Reembolsos agrupados por solicitação
  const reembPorSol = {};
  for (const r of tab('solicitacao_reembolsos')) {
    (reembPorSol[r.solicitacao_id] = reembPorSol[r.solicitacao_id] || []).push({
      id: 'r' + r.id, tipo: tipoNome[r.tipo_despesa_id] || 'Outros', chave_nota: limparCpf(r.chave_nota), numero_nota: txt(r.numero_nota),
      serie_nota: txt(r.serie_nota), data_nota: txt(r.data_nota).slice(0, 10), valor: Math.round(num(r.valor) * 100) / 100,
      numero_empenho: txt(r.numero_empenho), data_empenho: txt(r.data_empenho).slice(0, 10), descricao: txt(r.descricao),
      lancado_em: txt(r.created_at).replace(' ', 'T')
    });
  }

  // Solicitações
  const contadores = {};
  const distancias = {};
  const numerosVistos = new Set();
  for (const s of tab('solicitacoes_diaria')) {
    const sv = svPorId[s.servidor_id];
    if (!sv) { avisos.push(`Solicitação ${s.numero}: servidor ${s.servidor_id} não existe no banco antigo — ignorada.`); continue; }
    const m = /^(\d+)\/(\d{4})$/.exec(txt(s.numero));
    const sequencia = m ? Number(m[1]) : 0;
    const ano = m ? Number(m[2]) : Number(txt(s.data_solicitacao).slice(0, 4));
    if (numerosVistos.has(s.numero)) avisos.push(`Número repetido no banco antigo: ${s.numero}.`);
    numerosVistos.add(s.numero);
    contadores[ano] = Math.max(contadores[ano] || 0, sequencia);
    const reembolsos = reembPorSol[s.id] || [];
    const dadosSol = {
        numero: txt(s.numero), ano, sequencia,
        servidor_id: 'srv_' + s.servidor_id,
        servidor: { nome: sv.nome, cpf: sv.cpf, chave_pix: sv.chave_pix, cargo_funcao: sv.cargo_funcao, grupo: sv.grupo, categoria_nome: GRUPOS[sv.grupo] },
        secretaria_id: secId(s.secretaria_id), secretaria_nome: secNome[s.secretaria_id] || '',
        destino_uf: txt(s.destino_uf).toUpperCase(), destino_cidade: txt(s.destino_cidade),
        distancia_km: Math.round(num(s.distancia_km) * 100) / 100,
        data_hora_saida: txt(s.data_hora_saida).slice(0, 16), data_hora_retorno: txt(s.data_hora_retorno).slice(0, 16),
        objetivo: txt(s.objetivo), observacoes: txt(s.observacoes),
        faixa_codigo: FAIXA_TEXTO_PARA_CODIGO[s.faixa_distancia] || '', faixa_texto: txt(s.faixa_distancia),
        horas_total: num(s.horas_total),
        quantidade_pernoite: num(s.quantidade_pernoite), quantidade_simples: num(s.quantidade_simples), quantidade_alimentacao: num(s.quantidade_alimentacao),
        valor_pernoite: num(s.valor_pernoite), valor_simples: num(s.valor_simples), valor_alimentacao: num(s.valor_alimentacao),
        valor_total: Math.round(num(s.valor_total) * 100) / 100,
        descricao_calculo: jsonLista(s.descricao_calculo), justificativa_legal: jsonLista(s.justificativa_legal),
        numero_empenho: txt(s.numero_empenho), data_empenho: txt(s.data_empenho).slice(0, 10),
        status: s.status === 'cancelada' ? 'cancelada' : 'emitida',
        data_solicitacao: txt(s.data_solicitacao).slice(0, 10),
        reembolsos, total_reembolsos: Math.round(reembolsos.reduce((a, r) => a + r.valor, 0) * 100) / 100,
        legado_id: s.id, importado_em: agora, criado_por: origem
    };
    // valores vão para a coleção protegida (Secretaria e Controle Interno não leem)
    const { base, val } = separarValores(dadosSol);
    ops.push({ colecao: 'solicitacoes', id: 'sol_' + s.id, dados: { ...base, calculado: true } });
    ops.push({ colecao: 'valores', id: 'sol_' + s.id, dados: val });
    if (s.destino_cidade && s.destino_uf && num(s.distancia_km) > 0) {
      const k = chaveDistancia(txt(s.destino_cidade), txt(s.destino_uf).toUpperCase());
      // Guarda a distância MAIS USADA para o destino (o banco antigo tem km errados pontuais, ex.: 1,47 km para Gov. Valadares).
      const km = Math.round(num(s.distancia_km) * 100) / 100;
      distancias[k] = distancias[k] || { cidade: txt(s.destino_cidade), uf: txt(s.destino_uf).toUpperCase(), contagem: {} };
      distancias[k].contagem[km] = (distancias[k].contagem[km] || 0) + 1;
    }
  }
  for (const [k, d] of Object.entries(distancias)) {
    const km = Number(Object.entries(d.contagem).sort((a, b) => b[1] - a[1])[0][0]);
    ops.push({ colecao: 'distancias', id: k, dados: { cidade: d.cidade, uf: d.uf, km } });
  }

  // Parâmetros (o banco antigo tinha linhas duplicadas: vale a primeira de cada combinação)
  const valores = structuredClone(PARAMETROS_PADRAO.valores);
  const vistos = new Set();
  for (const p of tab('parametros_diaria')) {
    const k = `${p.categoria_grupo}|${p.tipo_diaria}|${p.faixa_distancia}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    if (valores[p.categoria_grupo]?.[p.tipo_diaria]?.[p.faixa_distancia] !== undefined) valores[p.categoria_grupo][p.tipo_diaria][p.faixa_distancia] = num(p.valor);
  }
  const duplicados = tab('parametros_diaria').length - vistos.size;
  if (duplicados > 0) avisos.push(`Tabela de valores do banco antigo tinha ${duplicados} linha(s) duplicada(s) — corrigido (mantida uma de cada).`);
  const tipos = tab('tipos_despesa').filter(x => num(x.ativo ?? 1) === 1).map(x => x.nome);
  const config = { valores, ...(tipos.length ? { tipos_despesa: tipos } : {}) };

  const resumo = {
    secretarias: tab('secretarias').length,
    servidores: tab('servidores').length,
    solicitacoes: ops.filter(o => o.colecao === 'solicitacoes').length,
    reembolsos: tab('solicitacao_reembolsos').length,
    distancias: Object.keys(distancias).length
  };
  return { operacoes: ops, contadores, config, resumo, avisos };
}
