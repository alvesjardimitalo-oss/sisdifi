// Onde o ISS é devido — LC 116/2003, art. 3º.
//
// A regra geral manda o imposto para o município do ESTABELECIMENTO DO
// PRESTADOR. Executar o serviço em Frei Inocêncio não basta: só nas hipóteses
// dos incisos I a XXV é que o imposto vai para outro lugar.
//
// O sistema tratava toda nota com local de prestação em Frei Inocêncio como
// retenção devida aqui. Para consultoria, assessoria ou manutenção prestadas
// por empresa de outra cidade, isso significa reter ISS que não é do
// Município — e o fornecedor ainda recolhe no município dele, pagando duas
// vezes o mesmo imposto.
//
// Fonte: LC 116/2003, art. 3º, na redação da LC 157/2016 (incisos I a XXV).
// Os incisos X e XI foram vetados.

/** Para onde cada inciso manda o imposto. */
export const ONDE = {
  PRESTADOR: 'prestador',   // regra geral do caput
  PRESTACAO: 'prestacao',   // onde o serviço foi executado
  TOMADOR: 'tomador'        // estabelecimento ou domicílio de quem contrata
};

/**
 * Exceções do art. 3º. Cada entrada liga um inciso aos subitens da lista
 * anexa que ele alcança.
 *
 * `item: true` marca o item inteiro (ex.: todo o item 16), não um subitem.
 */
export const EXCECOES = [
  { inciso: 'I',     onde: ONDE.TOMADOR,   subitens: [],            descricao: 'serviço vindo do exterior ou lá iniciado (art. 1º, § 1º)' },
  { inciso: 'II',    onde: ONDE.PRESTACAO, subitens: ['3.05'],      descricao: 'instalação de andaimes, palcos e coberturas' },
  { inciso: 'III',   onde: ONDE.PRESTACAO, subitens: ['7.02', '7.19'], descricao: 'execução de obra' },
  { inciso: 'IV',    onde: ONDE.PRESTACAO, subitens: ['7.04'],      descricao: 'demolição' },
  { inciso: 'V',     onde: ONDE.PRESTACAO, subitens: ['7.05'],      descricao: 'reparação, conservação e reforma de edificações, estradas e pontes' },
  { inciso: 'VI',    onde: ONDE.PRESTACAO, subitens: ['7.09'],      descricao: 'varrição, coleta e destinação de lixo e resíduos' },
  { inciso: 'VII',   onde: ONDE.PRESTACAO, subitens: ['7.10'],      descricao: 'limpeza, manutenção e conservação de vias, imóveis, piscinas e jardins' },
  { inciso: 'VIII',  onde: ONDE.PRESTACAO, subitens: ['7.11'],      descricao: 'decoração, jardinagem, corte e poda de árvores' },
  { inciso: 'IX',    onde: ONDE.PRESTACAO, subitens: ['7.12'],      descricao: 'controle e tratamento de efluentes' },
  // X e XI: vetados.
  { inciso: 'XII',   onde: ONDE.PRESTACAO, subitens: ['7.16'],      descricao: 'florestamento e reflorestamento' },
  { inciso: 'XIII',  onde: ONDE.PRESTACAO, subitens: ['7.17'],      descricao: 'escoramento e contenção de encostas' },
  { inciso: 'XIV',   onde: ONDE.PRESTACAO, subitens: ['7.18'],      descricao: 'limpeza e dragagem' },
  { inciso: 'XV',    onde: ONDE.PRESTACAO, subitens: ['11.01'],     descricao: 'guarda e estacionamento de veículos' },
  { inciso: 'XVI',   onde: ONDE.PRESTACAO, subitens: ['11.02'],     descricao: 'vigilância, segurança e monitoramento' },
  { inciso: 'XVII',  onde: ONDE.PRESTACAO, subitens: ['11.04'],     descricao: 'armazenamento, carga, descarga e guarda de bens' },
  { inciso: 'XVIII', onde: ONDE.PRESTACAO, subitens: ['12'], item: true, excetoSubitens: ['12.13'], descricao: 'diversões, lazer e entretenimento' },
  { inciso: 'XIX',   onde: ONDE.PRESTACAO, subitens: ['16'], item: true, descricao: 'transporte municipal' },
  { inciso: 'XX',    onde: ONDE.TOMADOR,   subitens: ['17.05'],     descricao: 'fornecimento de mão de obra' },
  { inciso: 'XXI',   onde: ONDE.PRESTACAO, subitens: ['17.10'],     descricao: 'feiras, exposições e congressos' },
  { inciso: 'XXII',  onde: ONDE.PRESTACAO, subitens: ['20'], item: true, descricao: 'serviços portuários, aeroportuários e de terminais' },
  { inciso: 'XXIII', onde: ONDE.TOMADOR,   subitens: ['4.22', '4.23', '5.09'], descricao: 'planos de saúde e de medicina veterinária' },
  { inciso: 'XXIV',  onde: ONDE.TOMADOR,   subitens: ['15.01'],     descricao: 'administração de cartões' },
  { inciso: 'XXV',   onde: ONDE.TOMADOR,   subitens: ['15.09'],     descricao: 'arrendamento mercantil (leasing)' }
];

/**
 * Normaliza "16.01.01", "1601", "16.01" ou "07.02" para item e subitem.
 *
 * O item sai sem zero à esquerda ("7", não "07") e o subitem no formato
 * "7.02": a lista da lei escreve 7.02, as notas costumam trazer 07.02.00, e
 * comparar os dois como texto cru não casa.
 */
export function partesDoCodigo(codigo = '') {
  const so = String(codigo || '').replace(/\D/g, '');
  if (so.length < 3) return { item: '', subitem: '' };
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
      fundamento: 'Sem o código de tributação não dá para saber se o serviço está nas exceções do art. 3º da LC 116/2003.' };
  }
  for (const e of EXCECOES) {
    if (!e.subitens.length) continue;
    const casa = e.item
      ? e.subitens.includes(item) && !(e.excetoSubitens || []).some(x => mesmoSubitem(x, subitem))
      : e.subitens.some(x => mesmoSubitem(x, subitem));
    if (casa) {
      return { onde: e.onde, indefinido: false, inciso: e.inciso, descricao: e.descricao,
        fundamento: `LC 116/2003, art. 3º, ${e.inciso} — ${e.descricao}.` };
    }
  }
  return { onde: ONDE.PRESTADOR, indefinido: false, inciso: '',
    fundamento: 'LC 116/2003, art. 3º, caput — fora das exceções, o ISS é devido no município do estabelecimento do prestador.' };
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
