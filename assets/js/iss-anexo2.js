// =============================================================
// SISDIFI — Anexo II da Lei 883/2017 (Código Tributário de Frei Inocêncio)
// Lista de serviços e ALÍQUOTA DO ISSQN por subitem.
//
// O art. 89 remete a lista de serviços ao Anexo II e o art. 103 remete
// as alíquotas ao mesmo anexo. Não existe alíquota única no Município:
// o Anexo II alterna 3% e 5% subitem a subitem.
//
// Fonte: Anexo II da Lei 883/2017, transcrito do texto publicado, conferido
// contra o cadastro do Município no Emissor Nacional da NFS-e (extração de
// 03/09/2026): 197 dos 199 subitens batem. Os dois que divergem são 8.01 e
// 8.02, que o próprio Município alterou de 3% para 5% em 17/07/2026 — aqui
// vale a alteração, com a alíquota antiga guardada em VIGENCIAS.
//
// Esse cadastro é o que o Emissor Nacional usa para calcular o ISS das NFS-e
// com incidência em Frei Inocêncio: é a alíquota que chega impressa na nota.
//
// Subitens vetados (3.01, 7.14, 7.15, 13.01, 17.07) não constam: não há serviço.
// =============================================================

/** Alíquota (%) por subitem da lista do Anexo II. */
export const ANEXO_II = {
  // 1 — Serviços de informática e congêneres
  '1.01': 3, '1.02': 3, '1.03': 3, '1.04': 3, '1.05': 3, '1.06': 3, '1.07': 3, '1.08': 3, '1.09': 3,
  // 2 — Pesquisas e desenvolvimento
  '2.01': 5,
  // 3 — Locação, cessão de direito de uso
  '3.02': 5, '3.03': 5, '3.04': 5, '3.05': 5,
  // 4 — Saúde, assistência médica
  '4.01': 3, '4.02': 3, '4.03': 3, '4.04': 3, '4.05': 3, '4.06': 3, '4.07': 3, '4.08': 3,
  '4.09': 3, '4.10': 3, '4.11': 3, '4.12': 3, '4.13': 3, '4.14': 3, '4.15': 3, '4.16': 3,
  '4.17': 3, '4.18': 3, '4.19': 3, '4.20': 3, '4.21': 3, '4.22': 3, '4.23': 3,
  // 5 — Medicina e assistência veterinária
  '5.01': 3, '5.02': 3, '5.03': 3, '5.04': 3, '5.05': 3, '5.06': 3, '5.07': 3, '5.08': 5, '5.09': 3,
  // 6 — Cuidados pessoais, estética, atividades físicas
  '6.01': 3, '6.02': 3, '6.03': 5, '6.04': 3, '6.05': 3, '6.06': 3,
  // 7 — Engenharia, construção civil, limpeza, meio ambiente
  '7.01': 5, '7.02': 5, '7.03': 5, '7.04': 3, '7.05': 5, '7.06': 3, '7.07': 5, '7.08': 5,
  '7.09': 5, '7.10': 5, '7.11': 5, '7.12': 3, '7.13': 3, '7.16': 5, '7.17': 5, '7.18': 5,
  '7.19': 3, '7.20': 5, '7.21': 5, '7.22': 5,
  // 8 — Educação e ensino (3% no Anexo II; 5% desde 17/07/2026 — ver VIGENCIAS)
  '8.01': 5, '8.02': 5,
  // 9 — Hospedagem, turismo, viagens
  '9.01': 3, '9.02': 3, '9.03': 3,
  // 10 — Intermediação
  '10.01': 5, '10.02': 5, '10.03': 5, '10.04': 5, '10.05': 5, '10.06': 5, '10.07': 5,
  '10.08': 3, '10.09': 3, '10.10': 3,
  // 11 — Guarda, estacionamento, armazenamento, vigilância
  '11.01': 5, '11.02': 5, '11.03': 5, '11.04': 5,
  // 12 — Diversões, lazer, entretenimento
  '12.01': 5, '12.02': 3, '12.03': 5, '12.04': 5, '12.05': 5, '12.06': 5, '12.07': 5,
  '12.08': 5, '12.09': 5, '12.10': 5, '12.11': 5, '12.12': 5, '12.13': 5, '12.14': 5,
  '12.15': 5, '12.16': 5, '12.17': 5,
  // 13 — Fonografia, fotografia, cinematografia, reprografia
  '13.02': 5, '13.03': 5, '13.04': 3, '13.05': 3,
  // 14 — Bens de terceiros
  '14.01': 3, '14.02': 3, '14.03': 3, '14.04': 3, '14.05': 3, '14.06': 5, '14.07': 3,
  '14.08': 3, '14.09': 3, '14.10': 3, '14.11': 3, '14.12': 3, '14.13': 3, '14.14': 3,
  // 15 — Setor bancário ou financeiro
  '15.01': 5, '15.02': 5, '15.03': 5, '15.04': 5, '15.05': 5, '15.06': 5, '15.07': 5,
  '15.08': 5, '15.09': 5, '15.10': 5, '15.11': 5, '15.12': 5, '15.13': 5, '15.14': 5,
  '15.15': 5, '15.16': 5, '15.17': 5, '15.18': 5,
  // 16 — Transporte de natureza municipal
  '16.01': 3, '16.02': 3,
  // 17 — Apoio técnico, administrativo, jurídico, contábil, comercial
  '17.01': 3, '17.02': 3, '17.03': 3, '17.04': 3, '17.05': 3, '17.06': 3,
  '17.08': 5, '17.09': 5, '17.10': 5, '17.11': 5, '17.12': 5, '17.13': 5,
  '17.14': 3, '17.15': 3, '17.16': 3, '17.17': 3, '17.18': 3, '17.19': 3, '17.20': 3,
  '17.21': 3, '17.22': 5, '17.23': 5, '17.24': 3, '17.25': 3,
  // 18 a 41
  '18.01': 5, '19.01': 5,
  '20.01': 5, '20.02': 5, '20.03': 5,
  '21.01': 5, '22.01': 5, '23.01': 3, '24.01': 3,
  '25.01': 3, '25.02': 5, '25.03': 5, '25.04': 5, '25.05': 5,
  '26.01': 5, '27.01': 3, '28.01': 5, '29.01': 3, '30.01': 3, '31.01': 3, '32.01': 5,
  '33.01': 3, '34.01': 5, '35.01': 5, '36.01': 5, '37.01': 5, '38.01': 5, '39.01': 3,
  '40.01': 3,
  // 41 e 99 vêm no Anexo sem subitem: a alíquota está na própria linha do item.
  '41': 5, '99': 5
};

/** Subitens vetados no Anexo II: não há serviço tributável sob esse código. */
export const VETADOS = ['3.01', '7.14', '7.15', '13.01', '17.07'];

/**
 * Alíquotas que já valeram e não valem mais. A nota é regida pela alíquota
 * vigente na data da EMISSÃO, não na data em que se confere: nota de educação
 * emitida em junho de 2026 é 3%, mesmo conferida hoje.
 */
export const VIGENCIAS = [
  { subitem: '8.01', aliquota: 3, ate: '2026-07-16' },
  { subitem: '8.02', aliquota: 3, ate: '2026-07-16' }
];

export const FUNDAMENTO_ANEXO_II =
  'Anexo II da Lei 883/2017 (lista de serviços e alíquotas, arts. 89 e 103)';

/** Forma curta, para caber dentro de outra frase já entre parênteses. */
export const ANEXO_II_CURTO = 'Anexo II da Lei 883/2017';

/**
 * Normaliza um código de tributação para o subitem do Anexo II.
 * Aceita "07.02.00", "0702", "7.02", "702" → "7.02". Itens 41 e 99 viram "41"/"99".
 */
export function subitemAnexo(codigo = '') {
  const bruto = String(codigo || '').trim();
  if (!bruto) return '';
  // Com pontos, os grupos já dizem onde o item termina — inclusive no formato
  // nacional de quatro grupos ("08.01.01.000"), que não cabe no corte por dígitos.
  const grupos = bruto.split('.').map(g => g.replace(/\D/g, '')).filter(Boolean);
  if (grupos.length >= 2) {
    const item = Number(grupos[0]);
    if (!item) return '';
    return item + '.' + grupos[1].slice(0, 2).padStart(2, '0');
  }
  let so = bruto.replace(/\D/g, '');
  if (!so) return '';
  if (so.length < 3) {                       // só o item: 41, 99, 17…
    const n = String(Number(so));
    return (n === '41' || n === '99') ? n : '';
  }
  // "702" é 7.02, não 70.2: o item ocupa dois dígitos, então ímpar ganha zero à esquerda.
  if (so.length % 2) so = '0' + so;
  const item = String(Number(so.slice(0, 2)));
  return item + '.' + so.slice(2, 4);
}

/**
 * Alíquota do Município para o código, na data da emissão da nota.
 * Retorna { aliquota, subitem, vetado, anterior } ou null se o código não existe.
 * `emissao` em ISO (AAAA-MM-DD); sem data, usa a alíquota vigente hoje.
 */
export function aliquotaAnexo(codigo = '', emissao = '') {
  const sub = subitemAnexo(codigo);
  if (!sub) return null;
  if (VETADOS.includes(sub)) return { aliquota: null, subitem: sub, vetado: true };
  const a = ANEXO_II[sub];
  if (!(Number(a) > 0)) return null;
  const dia = String(emissao || '').slice(0, 10);
  if (dia) {
    const antiga = VIGENCIAS.find(v => v.subitem === sub && dia <= v.ate);
    if (antiga) return { aliquota: antiga.aliquota, subitem: sub, vetado: false, anterior: true, ate: antiga.ate };
  }
  return { aliquota: Number(a), subitem: sub, vetado: false, anterior: false };
}
