// Onde o ISS é devido.
//
// A regra que vale para o ISS do Município é a do próprio Código Tributário:
// Lei 883/2017, art. 101. Ela espelha a LC 116/2003, art. 3º, com diferenças
// que importam, e por isso o enquadramento cita o artigo municipal.
//
// A regra geral (art. 101, I) manda o imposto para o ESTABELECIMENTO DO
// PRESTADOR. Executar o serviço em Frei Inocêncio não basta: só as hipóteses
// do inciso II mudam o destino.
//
// Quem retém: art. 98, XI, torna a Administração Direta e Indireta
// responsável pelo ISS dos serviços prestados a ela. Ou seja, quando o
// imposto é devido ao Município, a Prefeitura retém — e o art. 94, parágrafo
// único, mantém essa responsabilidade mesmo para contribuinte isento.

/** Para onde cada hipótese manda o imposto. */
export const ONDE = {
  PRESTADOR: 'prestador',   // regra geral — art. 101, I
  PRESTACAO: 'prestacao',   // onde o serviço foi executado
  TOMADOR: 'tomador'        // estabelecimento ou domicílio de quem contrata
};

/**
 * Hipóteses do art. 101, II, da Lei 883/2017.
 *
 * A alínea b) cita o subitem 3.04 mas descreve andaimes, palcos e coberturas,
 * que na lista nacional são o 3.05 — e o § 1º do mesmo artigo trata o 3.04
 * como locação de ferrovia, rodovia, postes e cabos. É erro de redação da
 * lei. Os dois ficam na lista: em qualquer leitura o imposto é do lugar da
 * execução, então o enquadramento não muda; o que muda é a citação, e ela
 * fica registrada aqui.
 */
export const EXCECOES = [
  { alinea: 'a', onde: ONDE.TOMADOR,   subitens: [],            descricao: 'serviço vindo do exterior ou lá iniciado' },
  { alinea: 'b', onde: ONDE.PRESTACAO, subitens: ['3.04', '3.05'], descricao: 'instalação de andaimes, palcos e coberturas', observacao: 'a lei cita 3.04 e descreve o 3.05' },
  { alinea: 'c', onde: ONDE.PRESTACAO, subitens: ['7.02', '7.19'], descricao: 'execução de obra' },
  { alinea: 'd', onde: ONDE.PRESTACAO, subitens: ['7.04'],      descricao: 'demolição' },
  { alinea: 'e', onde: ONDE.PRESTACAO, subitens: ['7.05'],      descricao: 'reparação, conservação e reforma de edificações, estradas e pontes' },
  { alinea: 'f', onde: ONDE.PRESTACAO, subitens: ['7.09'],      descricao: 'varrição, coleta e destinação de lixo e resíduos' },
  { alinea: 'g', onde: ONDE.PRESTACAO, subitens: ['7.10'],      descricao: 'limpeza, manutenção e conservação de vias, imóveis, piscinas e jardins' },
  { alinea: 'h', onde: ONDE.PRESTACAO, subitens: ['7.11'],      descricao: 'decoração, jardinagem, corte e poda de árvores' },
  { alinea: 'i', onde: ONDE.PRESTACAO, subitens: ['7.12'],      descricao: 'controle e tratamento de efluentes' },
  { alinea: 'j', onde: ONDE.PRESTACAO, subitens: ['7.16'],      descricao: 'florestamento, reflorestamento e colheita' },
  { alinea: 'k', onde: ONDE.PRESTACAO, subitens: ['7.17'],      descricao: 'escoramento e contenção de encostas' },
  { alinea: 'l', onde: ONDE.PRESTACAO, subitens: ['7.18'],      descricao: 'limpeza e dragagem' },
  { alinea: 'm', onde: ONDE.PRESTACAO, subitens: ['11.01'],     descricao: 'guarda e estacionamento de veículos' },
  { alinea: 'n', onde: ONDE.PRESTACAO, subitens: ['11.02'],     descricao: 'vigilância, segurança e monitoramento' },
  { alinea: 'o', onde: ONDE.PRESTACAO, subitens: ['11.04'],     descricao: 'armazenamento, carga, descarga e guarda de bens' },
  { alinea: 'p', onde: ONDE.PRESTACAO, subitens: ['12'], item: true, excetoSubitens: ['12.13'], descricao: 'diversões, lazer e entretenimento' },
  { alinea: 'q', onde: ONDE.PRESTACAO, subitens: ['16'], item: true, descricao: 'transporte municipal' },
  { alinea: 'r', onde: ONDE.TOMADOR,   subitens: ['17.05'],     descricao: 'fornecimento de mão de obra' },
  { alinea: 's', onde: ONDE.PRESTACAO, subitens: ['17.10'],     descricao: 'feiras, exposições e congressos' },
  { alinea: 't', onde: ONDE.PRESTACAO, subitens: ['20'], item: true, descricao: 'serviços portuários, aeroportuários e de terminais' },
  { alinea: 'u', onde: ONDE.TOMADOR,   subitens: ['4.22', '4.23', '5.09'], descricao: 'planos de saúde e de medicina veterinária' },
  { alinea: 'v', onde: ONDE.TOMADOR,   subitens: ['15.01'],     descricao: 'administração de cartões' },
  { alinea: 'w', onde: ONDE.TOMADOR,   subitens: ['10.04', '15.09'], descricao: 'agenciamento de leasing e arrendamento mercantil' }
];

/**
 * Subitens com regra territorial própria (art. 101, §§ 1º e 2º): o imposto é
 * devido aqui se houver, no território, extensão da ferrovia, rodovia, postes
 * e cabos locados (3.04) ou da rodovia explorada (22.01). Não é "onde o
 * serviço foi executado": é onde passa a coisa.
 */
export const TERRITORIAIS = ['3.04', '22.01'];

/**
 * Serviços com dedução de valores pagos a terceiros na base de cálculo.
 *
 * Lei 966/2023, que acrescentou os §§ 15 e 16 ao art. 102 da Lei 883/2017:
 * nos itens 10.01 a 10.08, 15.08 e 17.01, o que foi pago a terceiros, com
 * documento fiscal ou comprovante eficaz, sai do preço do serviço — até o
 * limite de 95% da base. Nessa hipótese aplica-se a ALÍQUOTA MÍNIMA.
 *
 * É regra de intermediação: quem agencia repassa a maior parte do valor e
 * seria tributado sobre dinheiro que não é receita dele.
 */
export const DEDUCAO_TERCEIROS = {
  subitens: ['10.01', '10.02', '10.03', '10.04', '10.05', '10.06', '10.07', '10.08', '15.08', '17.01'],
  limitePercentual: 95,
  fundamento: 'Lei 966/2023, que acrescentou o § 15 ao art. 102 da Lei 883/2017'
};

/** O serviço admite dedução de valores pagos a terceiros? */
export function admiteDeducaoTerceiros(codigoServico = '') {
  const { subitem } = partesDoCodigo(codigoServico);
  if (!subitem) return null;
  return DEDUCAO_TERCEIROS.subitens.some(x => {
    const n = v => { const so = String(v).replace(/\D/g, ''); return Number(so.slice(0, 2)) + '.' + so.slice(2, 4); };
    return n(x) === subitem;
  });
}

/**
 * Normaliza "16.01.01", "1601", "16.01" ou "07.02" para item e subitem.
 *
 * O item sai sem zero à esquerda ("7", não "07") e o subitem no formato
 * "7.02": a lista da lei escreve 7.02, as notas costumam trazer 07.02.00, e
 * comparar os dois como texto cru não casa.
 */
export function partesDoCodigo(codigo = '') {
  const bruto = String(codigo || '').trim();
  // Com pontos, os grupos dizem onde o item termina — inclusive no formato
  // nacional de quatro grupos ("08.01.01.000"), que o corte por dígitos erra.
  const grupos = bruto.split('.').map(g => g.replace(/\D/g, '')).filter(Boolean);
  if (grupos.length >= 2) {
    const n = Number(grupos[0]);
    if (!n) return { item: '', subitem: '' };
    return { item: String(n), subitem: String(n) + '.' + grupos[1].slice(0, 2).padStart(2, '0') };
  }
  let so = bruto.replace(/\D/g, '');
  if (so.length < 3) return { item: '', subitem: '' };
  if (so.length % 2) so = '0' + so;   // "702" é 7.02, não 70.2
  const item = String(Number(so.slice(0, 2)));
  return { item, subitem: item + '.' + so.slice(2, 4) };
}

/** Compara subitens escritos de formas diferentes (7.02 x 07.02 x 0702). */
const mesmoSubitem = (a, b) => {
  const n = v => {
    const so = String(v || '').replace(/\D/g, '');
    return so.length < 3 ? '' : Number(so.slice(0, 2)) + '.' + so.slice(2, 4);
  };
  return n(a) !== '' && n(a) === n(b);
};

/**
 * Onde o ISS deste serviço é devido.
 *
 * Sem código de tributação não há como saber: devolve `indefinido`, porque
 * chutar a regra geral faria o sistema afirmar com segurança algo que ele
 * não sabe.
 */
export function localDevidoIss(codigoServico = '') {
  const { item, subitem } = partesDoCodigo(codigoServico);
  if (!subitem) {
    return { onde: ONDE.PRESTADOR, indefinido: true, inciso: '',
      fundamento: 'Sem o código de tributação não dá para saber se o serviço está nas hipóteses do art. 101, II, da Lei 883/2017.' };
  }
  for (const e of EXCECOES) {
    if (!e.subitens.length) continue;
    const casa = e.item
      ? e.subitens.includes(item) && !(e.excetoSubitens || []).some(x => mesmoSubitem(x, subitem))
      : e.subitens.some(x => mesmoSubitem(x, subitem));
    if (casa) {
      return { onde: e.onde, indefinido: false, inciso: e.alinea, descricao: e.descricao,
        territorial: TERRITORIAIS.some(x => mesmoSubitem(x, subitem)),
        observacao: e.observacao || '',
        fundamento: `Lei 883/2017, art. 101, II, "${e.alinea}" — ${e.descricao}.` };
    }
  }
  return { onde: ONDE.PRESTADOR, indefinido: false, inciso: '',
    fundamento: 'Lei 883/2017, art. 101, I — fora das hipóteses do inciso II, o ISS é devido no município do estabelecimento do prestador.' };
}

/**
 * O Município deve reter o ISS desta nota?
 *
 * `ibgeMunicipio`  o município que está conferindo (o tomador)
 * `ibgePrestador`  onde fica o estabelecimento do prestador
 * `ibgePrestacao`  onde o serviço foi executado
 */
export function issDevidoAqui({ codigoServico = '', ibgeMunicipio = '', ibgePrestador = '', ibgePrestacao = '' } = {}) {
  const r = localDevidoIss(codigoServico);
  const m = String(ibgeMunicipio || '');
  const igual = v => String(v || '') === m;
  if (r.indefinido) return { ...r, aqui: null };
  if (r.onde === ONDE.TOMADOR) return { ...r, aqui: true };
  if (r.onde === ONDE.PRESTACAO) {
    // Sem saber onde foi executado, não afirma: a execução é o que decide.
    return { ...r, aqui: ibgePrestacao ? igual(ibgePrestacao) : null };
  }
  return { ...r, aqui: ibgePrestador ? igual(ibgePrestador) : null };
}
