// Cobertura das contas: com o que cada conta pode pagar, quanto do saldo dá
// para usar nos empenhos da folha, e o resto vai para o recurso próprio.
//
// Cada conta da etapa 3 tem fonte, saldo do mês e, opcionalmente, "pode
// pagar": a lista do que aquela conta paga, como na planilha de contas da
// Contabilidade —
//   vazio .............. qualquer empenho cuja ficha admita a fonte da conta
//                        (Custeio SUS, FUNDEB);
//   nº de fichas ....... só empenhos dessas fichas ("226, 227" para os
//                        funcionários da Atenção Básica);
//   nomes .............. só servidores com esses nomes (as contas da
//                        Assistência Social, a Farmácia, a Vigilância).
//
// O empenho NÃO é dividido: ele vai inteiro para a conta quando a conta pode
// pagar TODOS os servidores daquela lotação e o saldo cobre o BRUTO (o bruto
// inteiro sai da conta: líquido para o servidor e descontos para terceiros).
// Quando a conta pode pagar só parte dos servidores da lotação, o empenho vai
// para o recurso próprio e sai uma SUGESTÃO: pedir ao RH que separe esses
// servidores numa lotação própria, com o valor que deixaria de sair do
// recurso próprio.
// A lotação é por modalidade de contratação (comissionado, efetivo,
// contratado…) e as modalidades não se misturam: a lotação nova sugerida é da
// mesma modalidade da de origem, e a sugestão leva o vínculo.
//
// Quem são os servidores de cada lotação, e o bruto de cada um, vem da folha
// nominal (etapa 1), resumida em `quadro`: { lotação: [[nome, bruto], …] }.
import { dinheiroFolha } from './folha-empenhos.js';
import { ESPELHO_RECURSO_PROPRIO, codigoFonte } from './folha-saldos.js';

const PROPRIAS = ['1500', '1001', '1002'];
/* 1604 paga só agente comunitário de saúde e 1605 só o piso da enfermagem:
   ficam onde a Contabilidade as pôs, consumindo o saldo, e não são oferecidas
   a outros empenhos. */
const DE_CATEGORIA = ['1604', '1605'];
const num = v => (Number.isSafeInteger(v) ? v : 0);

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const LIGACOES = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);
const palavras = s => semAcento(s).replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(p => p.length > 1 && !LIGACOES.has(p));

/* Cargos que a planilha de contas escreve antes do nome ("=>Psicóloga:
   Kissila"). Saem do texto para sobrar só o nome. */
const CARGOS = /(=>)?\s*\b(assistente\s+social|psic[oó]log[oa]|monitor[a]?|coordenador[a]?|advogad[oa]|supervisor[a]?|visitador[a]?|orientador[a]?|recepcionista|professor[a]?)\s*:/gi;

/**
 * Lê o "pode pagar" de uma conta. Devolve null quando está vazio (a conta
 * paga qualquer empenho da fonte), ou { fichas, nomes } — fichas como texto,
 * nomes como listas de palavras.
 */
export function lerPodePagar(texto = '') {
  const t = String(texto || '').replace(CARGOS, ',').trim();
  if (!t) return null;
  const fichas = new Set(), nomes = [];
  for (const parte of t.split(/[,;\n]+|\s+e\s+/i)) {
    const p = parte.trim();
    if (!p) continue;
    if (/^\d{1,4}$/.test(p)) { fichas.add(p); continue; }
    const ps = palavras(p);
    if (ps.length) nomes.push({ texto: p, palavras: ps });
  }
  if (!fichas.size && !nomes.length) return null;
  return { fichas, nomes };
}

/** O nome da lista corresponde ao servidor? Todas as palavras dele estão no nome completo. */
export function mesmoServidor(nomeDaLista, nomeCompleto) {
  const ps = Array.isArray(nomeDaLista) ? nomeDaLista : palavras(nomeDaLista);
  if (!ps.length) return false;
  const doServidor = new Set(palavras(nomeCompleto));
  return ps.every(p => doServidor.has(p));
}

/**
 * Bruto de cada servidor, por lotação, a partir da folha nominal.
 * `servidores` vem de varrerServidores; `codigosDesconto` são os que o resumo
 * de verbas classificou como desconto. Salário-família (164), maternidade
 * (163) e natalidade (361) ficam de fora: são ordem de pagamento, não
 * empenho.
 */
export function quadroDaFolha(servidores = [], codigosDesconto = new Set()) {
  const fora = new Set([...codigosDesconto].map(String).concat(['163', '164', '361']));
  const quadro = {};
  for (const s of servidores || []) {
    if (!s.lotacao) continue;
    const bruto = (s.rubricas || []).filter(r => !fora.has(String(r.codigo))).reduce((n, r) => n + (Number(r.valor) || 0), 0);
    (quadro[s.lotacao] ??= []).push([String(s.nome || '').trim(), Math.round(bruto)]);
  }
  return quadro;
}

/**
 * Cobertura da folha pelas contas.
 *
 * `contas`: [{ id, nome, fonte, saldo, podePagar }] — só as que têm saldo.
 * `fichaInfo(ficha)`: { fontes, propria } da LOA.
 * `quadro`: de quadroDaFolha (opcional; sem ele, conta com nomes não decide).
 *
 * Ordem: as contas mais específicas primeiro (por nomes, depois por fichas,
 * depois as livres), na ordem em que foram cadastradas; e os empenhos na ordem
 * da folha. Cada empenho vai para a primeira conta que pode pagá-lo inteiro e
 * ainda tem saldo para o bruto.
 */
export function coberturaPorConta(empenhos = [], contas = [], fichaInfo = () => null, quadro = null) {
  const peso = c => (c.regra?.nomes.length ? 0 : c.regra?.fichas.size ? 1 : 2);
  const lista = (contas || [])
    .map((c, k) => ({ ...c, k, fonte: codigoFonte(c.fonte), saldo: Number(c.saldo), regra: lerPodePagar(c.podePagar) }))
    .filter(c => c.fonte && !PROPRIAS.includes(c.fonte) && Number.isFinite(c.saldo))
    .sort((a, b) => peso(a) - peso(b) || a.k - b.k)
    .map(c => ({ ...c, restante: c.saldo, usado: 0, empenhos: [] }));
  const avisos = [], sugestoes = [];
  const temQuadro = !!(quadro && Object.keys(quadro).length);
  if (!temQuadro && lista.some(c => c.regra?.nomes.length))
    avisos.push('Há conta que paga servidores pelo nome: envie a Folha de pagamento (nominal) na etapa 1 para o SISDIFI saber quem está em cada lotação.');

  const servidoresDe = e => (temQuadro ? quadro[e.lotacao] || null : null);
  // A conta pode pagar este empenho inteiro? E, se não, quem dele ela pagaria?
  const avaliar = (c, e, admitidas) => {
    if (c.fonte !== codigoFonte(e.fonte) && !admitidas.includes(c.fonte)) return { pode: false };
    if (DE_CATEGORIA.includes(c.fonte) && codigoFonte(e.fonte) !== c.fonte) return { pode: false };
    const r = c.regra;
    if (!r) return { pode: true };
    if (r.fichas.size && r.fichas.has(String(e.ficha))) return { pode: true };
    if (!r.nomes.length) return { pode: false };
    const servidores = servidoresDe(e);
    if (!servidores?.length) return { pode: false };
    const deles = servidores.filter(([nome]) => r.nomes.some(n => mesmoServidor(n.palavras, nome)));
    return { pode: deles.length === servidores.length, parte: deles, total: servidores.length };
  };
  const usar = (c, e) => { c.restante -= num(e.bruto); c.usado += num(e.bruto); c.empenhos.push(e.empenho); };

  const propostas = (empenhos || []).map(e => {
    const atual = { ficha: String(e.ficha || ''), fonte: codigoFonte(e.fonte) };
    const igual = (motivo, conta = '') => ({ id: e.id, empenho: e.empenho, ...atual, conta, motivo, mudou: false });
    const bruto = num(e.bruto);
    if (!atual.ficha || bruto <= 0) return igual('');
    const info = fichaInfo(atual.ficha) || {};
    const admitidas = (info.fontes || []).map(codigoFonte);

    // Fonte de categoria já escolhida fica, e gasta o saldo da conta dela.
    if (DE_CATEGORIA.includes(atual.fonte)) {
      const c = lista.find(x => x.fonte === atual.fonte && avaliar(x, e, admitidas).pode);
      if (c) { usar(c, e); if (c.restante < 0) avisos.push('Empenho ' + e.empenho + ': a conta ' + c.nome + ' não tem saldo para ele.'); }
      return igual('fonte ' + atual.fonte + ' mantida (só paga esta categoria)', c?.id || '');
    }

    const avaliadas = lista.map(c => ({ c, a: avaliar(c, e, admitidas) }));
    const cabe = avaliadas.find(({ c, a }) => a.pode && c.restante >= bruto);
    if (cabe) {
      usar(cabe.c, e);
      return { id: e.id, empenho: e.empenho, ficha: atual.ficha, fonte: cabe.c.fonte, conta: cabe.c.id,
        motivo: 'conta ' + (cabe.c.nome || cabe.c.fonte) + ' (' + cabe.c.fonte + ')', mudou: cabe.c.fonte !== atual.fonte };
    }
    // Conta que pagaria só parte da lotação: sugestão ao RH.
    for (const { c, a } of avaliadas)
      if (!a.pode && a.parte?.length)
        sugestoes.push({ conta: c.id, contaNome: c.nome || c.fonte, fonte: c.fonte, empenho: e.empenho, lotacao: e.lotacao,
          secretaria: e.secretaria || '', vinculo: e.vinculo || '', servidores: a.parte.map(([nome, b]) => ({ nome, bruto: b })),
          valor: a.parte.reduce((n, [, b]) => n + b, 0), outros: a.total - a.parte.length });
    // Conta que pagaria o empenho inteiro, mas o saldo não dá.
    const semSaldo = avaliadas.filter(({ a }) => a.pode).map(({ c }) => c.nome || c.fonte);
    const motivo = semSaldo.length ? 'saldo de ' + semSaldo.join(', ') + ' não cobre ' + dinheiroFolha(bruto) + ': recurso próprio' : '';
    const espelho = ESPELHO_RECURSO_PROPRIO[atual.ficha];
    if (semSaldo.length && espelho)
      return { id: e.id, empenho: e.empenho, ficha: espelho.ficha, fonte: '1001', conta: '', motivo: motivo + ' (ficha ' + espelho.ficha + ')',
        mudou: espelho.ficha !== atual.ficha || atual.fonte !== '1001' };
    if (semSaldo.length && info.propria)
      return { id: e.id, empenho: e.empenho, ficha: atual.ficha, fonte: info.propria, conta: '', motivo, mudou: info.propria !== atual.fonte };
    return igual(motivo);
  });

  // Nomes da lista que não aparecem na folha, ou que aparecem em mais de um servidor.
  const conferencia = [];
  if (temQuadro) {
    const todos = Object.entries(quadro).flatMap(([lot, ss]) => ss.map(([nome]) => ({ nome, lot })));
    for (const c of lista) for (const n of c.regra?.nomes || []) {
      const achados = todos.filter(s => mesmoServidor(n.palavras, s.nome));
      if (achados.length !== 1) conferencia.push({ conta: c.nome || c.fonte, nome: n.texto, achados: achados.map(s => s.nome) });
    }
  }
  for (const s of sugestoes) s.cabe = (lista.find(c => c.id === s.conta)?.restante ?? 0) >= s.valor;

  return { propostas, avisos, sugestoes, conferencia,
    uso: lista.map(c => ({ id: c.id, nome: c.nome, fonte: c.fonte, saldo: c.saldo, usado: c.usado, sobra: c.restante,
      empenhos: c.empenhos, regra: c.regra ? (c.regra.nomes.length ? 'servidores' : 'fichas') : 'livre' })),
    mudancas: propostas.filter(p => p.mudou).length };
}
