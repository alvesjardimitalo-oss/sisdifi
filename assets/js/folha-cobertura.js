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
// nominal (etapa 1), resumida em `quadro`: { lotação: [[nome, bruto, cargo], …] }.
import { dinheiroFolha } from './folha-empenhos.js';
import { ESPELHO_RECURSO_PROPRIO, codigoFonte } from './folha-saldos.js';

const PROPRIAS = ['1500', '1001', '1002'];
/* 1604 paga os agentes (comunitários de saúde e de endemias) e 1605 o piso da
   enfermagem: não são oferecidas a outros empenhos. Os agentes são pagos pela
   mesma conta do Custeio SUS (conta com fontes "1600, 1604"), e TÊM
   PRIORIDADE no saldo dela — o recurso vem para custear o pagamento deles —:
   os empenhos dos agentes são cobertos primeiro, e o que sobra vai para os
   outros empenhos da Atenção Básica. */
const DE_CATEGORIA = ['1604', '1605'];
/* Quem é agente de endemias (fonte 1604) é o CARGO, na folha nominal. Os
   demais cargos da Atenção Básica são 1600. */
export const cargoDeAgente = cargo => /ENDEMIA/.test(semAcentoTexto(cargo));
/**
 * Empenho de agentes: a lotação inteira é de agentes de endemias (pelo cargo
 * na folha nominal). Sem a folha nominal, vale a lotação dizer "endemias" ou a
 * Contabilidade já ter posto 1604. `servidores` são as tuplas do quadro.
 */
export const ehDeAgente = (e, servidores = null) => {
  if (codigoFonte(e.fonte) === '1604') return true;
  if (servidores?.length && servidores.every(s => s[2] !== undefined)) return servidores.every(s => cargoDeAgente(s[2]));
  return /ENDEMIA/.test(semAcentoTexto([...(e.caminho || []), e.vinculo || ''].join(' ')));
};
const semAcentoTexto = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
/** Fontes de uma conta: "1600, 1604" ou "1.600.000.0000". A primeira é a principal. */
export const fontesDaConta = f => String(f || '').split(/[,;/]|\s+e\s+/).map(codigoFonte).filter(x => x && x.length === 4);
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

/* A planilha de contas e o cadastro do RH escrevem o mesmo nome de jeitos
   diferentes — em novembro/2026: "Lorrai" × LORRAINY, "Mariany" × MARIANE,
   "Francielle" × FRANCIELE. Por isso a palavra também casa por aproximação:
   sem letra dobrada, Y como I, começo do nome (4 letras ou mais) ou uma letra
   diferente (5 letras ou mais). A busca é só nas lotações que a conta pode
   pagar, e o que casou por aproximação é mostrado para conferir. */
const simples = p => p.replace(/Y/g, 'I').replace(/PH/g, 'F').replace(/TH/g, 'T').replace(/(.)\1+/g, '$1');
const umaLetra = (a, b) => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
};
const palavraCasa = (p, q) => {
  if (p === q) return 'exato';
  const a = simples(p), b = simples(q);
  if (a === b) return 'aprox';
  if (a.length >= 4 && b.startsWith(a)) return 'aprox';
  if (a.length >= 5 && umaLetra(a, b)) return 'aprox';
  return '';
};
/**
 * Como o nome da lista corresponde ao servidor: 'exato' (todas as palavras
 * estão no nome completo), 'aprox' (alguma só por aproximação) ou ''.
 */
export function casamentoDeNome(nomeDaLista, nomeCompleto) {
  const ps = Array.isArray(nomeDaLista) ? nomeDaLista : palavras(nomeDaLista);
  if (!ps.length) return '';
  const doServidor = palavras(nomeCompleto);
  let aprox = false;
  for (const p of ps) {
    let melhor = '';
    for (const q of doServidor) { const c = palavraCasa(p, q); if (c === 'exato') { melhor = c; break; } if (c) melhor = c; }
    if (!melhor) return '';
    if (melhor === 'aprox') aprox = true;
  }
  return aprox ? 'aprox' : 'exato';
}
/** O nome da lista corresponde ao servidor (exato ou aproximado)? */
export const mesmoServidor = (nomeDaLista, nomeCompleto) => !!casamentoDeNome(nomeDaLista, nomeCompleto);

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
    (quadro[s.lotacao] ??= []).push([String(s.nome || '').trim(), Math.round(bruto), String(s.cargo || '').trim()]);
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
    .map((c, k) => { const fontes = fontesDaConta(c.fonte);
      return { ...c, k, fontes, fonte: fontes[0] || '', saldo: Number(c.saldo), regra: lerPodePagar(c.podePagar) }; })
    .filter(c => c.fonte && !PROPRIAS.includes(c.fonte) && Number.isFinite(c.saldo))
    .sort((a, b) => peso(a) - peso(b) || a.k - b.k)
    .map(c => ({ ...c, restante: c.saldo, usado: 0, empenhos: [] }));
  const avisos = [], sugestoes = [];
  const temQuadro = !!(quadro && Object.keys(quadro).length);
  if (!temQuadro && lista.some(c => c.regra?.nomes.length))
    avisos.push('Há conta que paga servidores pelo nome: envie a Folha de pagamento (nominal) na etapa 1 para o SISDIFI saber quem está em cada lotação.');

  const servidoresDe = e => (temQuadro ? quadro[e.lotacao] || null : null);

  /* Cada nome do "pode pagar" é resolvido para UM servidor, procurado só nas
     lotações que a conta pode pagar (ficha que admite a fonte dela; lotação
     ainda sem ficha entra): primeiro pelo nome exato e, se não houver, por
     aproximação de grafia. Nome que não resolve para uma pessoa só não paga
     ninguém e vai para a conferência — assim a aproximação nunca faz a conta
     pagar quem não está na lista. */
  const conferencia = [];
  if (temQuadro) {
    const fichaDaLotacao = new Map((empenhos || []).map(e => [e.lotacao, String(e.ficha || '')]));
    const daConta = c => Object.entries(quadro).filter(([lot]) => {
      const ficha = fichaDaLotacao.get(lot);
      if (!ficha) return true;
      const admitidas = ((fichaInfo(ficha) || {}).fontes || []).map(codigoFonte);
      return c.fontes.some(f => admitidas.includes(f));
    }).flatMap(([lot, ss]) => ss.map(([nome]) => ({ nome, lot })));
    for (const c of lista) {
      c.resolvidos = new Set();
      if (!c.regra?.nomes.length) continue;
      const pessoas = daConta(c);
      const casos = c.regra.nomes.map(n => {
        const todos = pessoas.map(x => ({ ...x, como: casamentoDeNome(n.palavras, x.nome) })).filter(x => x.como);
        return { n, exatos: [...new Set(todos.filter(x => x.como === 'exato').map(x => x.nome))],
          aprox: [...new Set(todos.filter(x => x.como === 'aprox').map(x => x.nome))] };
      });
      // Primeiro os nomes exatos; depois as grafias parecidas, sem quem já
      // foi resolvido por outro nome da lista ("Elza" já é ELZA MARIANA, então
      // "Mariany" só pode ser MARIANE).
      for (const k of casos) if (k.exatos.length === 1) c.resolvidos.add(k.exatos[0]);
      for (const k of casos) {
        if (k.exatos.length === 1) continue;
        if (k.exatos.length > 1) { conferencia.push({ conta: c.nome || c.fonte, nome: k.n.texto, achados: k.exatos }); continue; }
        const livres = k.aprox.filter(nome => !c.resolvidos.has(nome));
        if (!livres.length && !k.aprox.length) {
          /* Ninguém com esse nome nas lotações da conta: diz onde ele está, se
             estiver na folha — numa lotação cuja ficha não aceita a fonte da
             conta (o Marcelo Vieira, contratado da Vigilância Sanitária, na
             ficha 248, que na LOA 2026 não tem a 1621) — ou que não está na
             folha mensal (o Felipe, em rescisão em novembro/2026). */
          const fora = Object.entries(quadro).flatMap(([lot, ss]) => ss.filter(([nome]) => casamentoDeNome(k.n.palavras, nome) === 'exato').map(([nome]) => ({ nome, lot })));
          const onde = fora.length === 1 ? { nome: fora[0].nome, lotacao: fora[0].lot, ficha: fichaDaLotacao.get(fora[0].lot) || '' } : null;
          conferencia.push({ conta: c.nome || c.fonte, nome: k.n.texto, achados: [], onde, fontes: c.fontes });
          continue;
        }
        if (livres.length !== 1) { conferencia.push({ conta: c.nome || c.fonte, nome: k.n.texto, achados: livres.length ? livres : k.aprox }); continue; }
        c.resolvidos.add(livres[0]);
        conferencia.push({ conta: c.nome || c.fonte, nome: k.n.texto, achados: livres, aproximado: true });
      }
    }
  }

  /* Fonte com que a conta pagaria o empenho: a de categoria (1604) só para o
     empenho daquela categoria; as outras, se a ficha admite. */
  const fonteParaEmpenho = (c, e, admitidas, categoria) => categoria
    ? (c.fontes.includes(categoria) && (admitidas.includes(categoria) || codigoFonte(e.fonte) === categoria) ? categoria : '')
    : c.fontes.find(f => !DE_CATEGORIA.includes(f) && (admitidas.includes(f) || codigoFonte(e.fonte) === f)) || '';
  const avaliar = (c, e, admitidas, categoria = '') => {
    const fonte = fonteParaEmpenho(c, e, admitidas, categoria);
    if (!fonte) return { pode: false };
    /* A conta que tem a fonte da categoria (o Custeio SUS com "1600, 1604")
       paga os agentes onde estiverem lotados — na Vigilância em Saúde, em
       novembro/2026 —, mesmo que o "pode pagar" dela limite as fichas da 1600
       à Atenção Básica. */
    if (categoria) return { pode: true, fonte };
    const r = c.regra;
    if (!r) return { pode: true, fonte };
    if (r.fichas.size && r.fichas.has(String(e.ficha))) return { pode: true, fonte };
    if (!r.nomes.length) return { pode: false };
    const servidores = servidoresDe(e);
    if (!servidores?.length) return { pode: false };
    const deles = servidores.filter(([nome]) => c.resolvidos?.has(nome));
    return { pode: deles.length === servidores.length, parte: deles, total: servidores.length, fonte };
  };
  const usar = (c, e) => { c.restante -= num(e.bruto); c.usado += num(e.bruto); c.empenhos.push(e.empenho); };

  const decidir = (e, categoria) => {
    const atual = { ficha: String(e.ficha || ''), fonte: codigoFonte(e.fonte) };
    const igual = (motivo, conta = '') => ({ id: e.id, empenho: e.empenho, ...atual, conta, motivo, mudou: false });
    const bruto = num(e.bruto);
    if (!atual.ficha || bruto <= 0) return igual('');
    const info = fichaInfo(atual.ficha) || {};
    const admitidas = (info.fontes || []).map(codigoFonte);
    const avaliadas = lista.map(c => ({ c, a: avaliar(c, e, admitidas, categoria) }));
    const cabe = avaliadas.find(({ c, a }) => a.pode && c.restante >= bruto);
    if (cabe) {
      usar(cabe.c, e);
      return { id: e.id, empenho: e.empenho, ficha: atual.ficha, fonte: cabe.a.fonte, conta: cabe.c.id,
        motivo: (categoria ? 'prioridade dos agentes: ' : '') + 'conta ' + (cabe.c.nome || cabe.c.fonte) + ' (' + cabe.a.fonte + ')',
        mudou: cabe.a.fonte !== atual.fonte };
    }
    // Conta que pagaria só parte da lotação: sugestão ao RH.
    for (const { c, a } of avaliadas)
      if (!a.pode && a.parte?.length)
        sugestoes.push({ conta: c.id, contaNome: c.nome || c.fonte, fonte: a.fonte, empenho: e.empenho, lotacao: e.lotacao,
          secretaria: e.secretaria || '', vinculo: e.vinculo || '', servidores: a.parte.map(([nome, b]) => ({ nome, bruto: b })),
          valor: a.parte.reduce((n, [, b]) => n + b, 0), outros: a.total - a.parte.length });
    // Conta que pagaria o empenho inteiro, mas o saldo não dá.
    const semSaldo = avaliadas.filter(({ a }) => a.pode).map(({ c }) => c.nome || c.fonte);
    if (categoria && !semSaldo.length && !lista.some(c => c.fontes.includes(categoria)))
      return igual(atual.fonte === categoria ? 'fonte ' + categoria + ' mantida (só paga esta categoria; nenhuma conta com ' + categoria + ' informada)' : '');
    const motivo = semSaldo.length ? 'saldo de ' + semSaldo.join(', ') + ' não cobre ' + dinheiroFolha(bruto) + ': recurso próprio' : '';
    if (categoria && semSaldo.length) avisos.push('Empenho ' + e.empenho + ' (agentes, ' + categoria + '): o saldo de ' + semSaldo.join(', ') + ' não cobre ' + dinheiroFolha(bruto) + '.');
    const espelho = ESPELHO_RECURSO_PROPRIO[atual.ficha];
    if (semSaldo.length && espelho)
      return { id: e.id, empenho: e.empenho, ficha: espelho.ficha, fonte: '1001', conta: '', motivo: motivo + ' (ficha ' + espelho.ficha + ')',
        mudou: espelho.ficha !== atual.ficha || atual.fonte !== '1001' };
    if (semSaldo.length && info.propria)
      return { id: e.id, empenho: e.empenho, ficha: atual.ficha, fonte: info.propria, conta: '', motivo, mudou: info.propria !== atual.fonte };
    return igual(motivo);
  };
  /* Primeiro os empenhos de categoria (agentes na 1604, piso na 1605), que
     têm prioridade no saldo da conta que os paga; depois os demais, na ordem
     da folha. As propostas voltam na ordem da folha. */
  const categoriaDe = e => {
    const f = codigoFonte(e.fonte);
    if (DE_CATEGORIA.includes(f)) return f;
    return ehDeAgente(e, servidoresDe(e)) ? '1604' : '';
  };
  /* Lotação mista: agentes de endemias junto com outros cargos. O empenho não
     se divide, então segue como os demais; a sugestão é o RH separar os
     agentes numa lotação própria, da mesma modalidade, para irem na 1604. */
  const conta1604 = lista.find(c => c.fontes.includes('1604'));
  if (conta1604)
    for (const e of empenhos || []) {
      const ss = servidoresDe(e);
      if (!ss?.length || codigoFonte(e.fonte) === '1604') continue;
      const agentes = ss.filter(x => cargoDeAgente(x[2]));
      if (agentes.length && agentes.length < ss.length)
        sugestoes.push({ conta: conta1604.id, contaNome: conta1604.nome || '1604', fonte: '1604', empenho: e.empenho, lotacao: e.lotacao,
          secretaria: e.secretaria || '', vinculo: e.vinculo || '', motivo: 'agentes de endemias',
          servidores: agentes.map(([nome, b]) => ({ nome, bruto: b })), valor: agentes.reduce((n, [, b]) => n + b, 0),
          outros: ss.length - agentes.length });
    }
  const porId = new Map();
  for (const e of empenhos || []) { const cat = categoriaDe(e); if (cat) porId.set(e.id, decidir(e, cat)); }
  for (const e of empenhos || []) if (!porId.has(e.id)) porId.set(e.id, decidir(e, ''));
  const propostas = (empenhos || []).map(e => porId.get(e.id));

  for (const s of sugestoes) s.cabe = (lista.find(c => c.id === s.conta)?.restante ?? 0) >= s.valor;

  return { propostas, avisos, sugestoes, conferencia,
    uso: lista.map(c => ({ id: c.id, nome: c.nome, fonte: c.fontes.join(', '), saldo: c.saldo, usado: c.usado, sobra: c.restante,
      empenhos: c.empenhos, regra: c.regra ? (c.regra.nomes.length ? 'servidores' : 'fichas') : 'livre' })),
    mudancas: propostas.filter(p => p.mudou).length };
}

/**
 * Previsão do mês: quanto da folha (bruto dos empenhos) sai das contas
 * vinculadas e quanto do recurso próprio, e a divisão por fonte — depois da
 * cobertura, com a fonte que cada empenho teria pela proposta.
 * O salário-família e a maternidade ficam de fora: são OP extraorçamentária.
 */
export function previsaoDaFolha(empenhos = [], propostas = []) {
  const porId = new Map((propostas || []).map(p => [p.id, p]));
  const fontes = new Map();
  let total = 0, propria = 0, contas = 0, semFonte = 0;
  for (const e of empenhos || []) {
    const bruto = num(e.bruto);
    if (bruto <= 0) continue;
    total += bruto;
    const f = codigoFonte(porId.get(e.id)?.fonte || e.fonte);
    if (!f) { semFonte += bruto; continue; }
    if (PROPRIAS.includes(f)) propria += bruto; else contas += bruto;
    const x = fontes.get(f) || { fonte: f, valor: 0, empenhos: 0, propria: PROPRIAS.includes(f) };
    x.valor += bruto; x.empenhos++;
    fontes.set(f, x);
  }
  const pct = v => (total ? Math.round(v / total * 1000) / 10 : 0);
  return { total, contas, propria, semFonte, pctContas: pct(contas), pctPropria: pct(propria),
    porFonte: [...fontes.values()].sort((a, b) => Number(a.propria) - Number(b.propria) || b.valor - a.valor).map(x => ({ ...x, pct: pct(x.valor) })) };
}
