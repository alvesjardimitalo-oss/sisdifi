// =============================================================
// SISDIFI — Motor de cálculo de diárias (Lei Municipal 994/2025)
// Funções puras: não acessam banco nem tela. Usadas pelo app e pelos testes.
// =============================================================

export const GRUPOS = {
  PREFEITO: 'Prefeito',
  VICE_SECRETARIO_JURIDICO: 'Vice-Prefeito / Secretários / Assessor Jurídico',
  DEMAIS_SERVIDORES: 'Demais Servidores'
};

export const FAIXAS = {
  '0_149': '0 a 149 KM',  // Anexo I diz "até 100 km"; 100–149,99 km foi enquadrado aqui por decisão da administração
  '150_300': '150 a 300 KM',
  'ACIMA_300': 'Acima de 300 KM'
};

// Valores do Anexo I (padrão). Podem ser alterados pelo admin em Parâmetros.
export const PARAMETROS_PADRAO = {
  alimentacao: 60,
  valores: {
    PREFEITO: {
      SIMPLES: { '0_149': 300, '150_300': 800, 'ACIMA_300': 1300 },
      PERNOITE: { '0_149': 350, '150_300': 1000, 'ACIMA_300': 1500 }
    },
    VICE_SECRETARIO_JURIDICO: {
      SIMPLES: { '0_149': 200, '150_300': 350, 'ACIMA_300': 750 },
      PERNOITE: { '0_149': 250, '150_300': 400, 'ACIMA_300': 800 }
    },
    DEMAIS_SERVIDORES: {
      SIMPLES: { '0_149': 150, '150_300': 250, 'ACIMA_300': 350 },
      PERNOITE: { '0_149': 200, '150_300': 300, 'ACIMA_300': 400 }
    }
  }
};

/**
 * Faixa de distância.
 * Correção: o sistema antigo usava "km <= 149", então 149,40 km caía em "150 a 300".
 * Agora: abaixo de 150 km → 0_149; de 150 até 300 km (inclusive) → 150_300; acima → ACIMA_300.
 */
export function faixaDistancia(km) {
  const v = Number(km);
  if (v < 150) return '0_149';
  if (v <= 300) return '150_300';
  return 'ACIMA_300';
}

/** Converte "AAAA-MM-DDTHH:MM" (horário local) em minutos absolutos, sem depender de fuso/horário de verão. */
export function minutosAbsolutos(dataHora) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(dataHora || '').trim());
  if (!m) return null;
  const [, a, me, d, h, mi] = m.map(Number);
  if (me < 1 || me > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return Date.UTC(a, me - 1, d, h, mi) / 60000;
}

export function formatarDataHora(minutos) {
  const d = new Date(minutos * 60000);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function moeda(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function horasBR(h) {
  return Number(h || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Calcula a diária conforme a Lei Ordinária nº 994/2025.
 *  - Art. 6º: cada período de 24h completo → 1 diária (pernoite); fração final > 12h → 1 diária simples;
 *  - Art. 6º, § 1º: fração final de 6h a 12h → somente etapa alimentação; abaixo de 6h → nada;
 *  - Art. 6º, § 2º: deslocamento DENTRO do território do município de 6h a 12h → 50% da etapa alimentação;
 *  - Art. 7º, § 2º: deslocamento inferior a 100 km COM pernoite → cada período de 24h é pago pelo valor da diária simples;
 *  - Faixa "até 100 km" do Anexo I também cobre 100,01–149,99 km (lacuna da lei; decisão da administração).
 * Os cálculos são feitos em MINUTOS inteiros.
 */
export function calcularDiaria({ grupo, km, saida, retorno, dentroMunicipio = false, parametros = PARAMETROS_PADRAO }) {
  if (!GRUPOS[grupo]) return { erro: 'Categoria do servidor inválida.' };
  const distancia = Number(String(km ?? '').replace(',', '.')) || 0;
  if (!dentroMunicipio && !(distancia > 0)) return { erro: 'Informe a distância em KM.' };
  const ini = minutosAbsolutos(saida);
  const fim = minutosAbsolutos(retorno);
  if (ini === null || fim === null) return { erro: 'Informe data e hora de saída e de retorno.' };
  if (fim <= ini) return { erro: 'A data/hora de retorno deve ser posterior à de saída.' };

  const totalMin = fim - ini;
  const valorAlimentacaoCheia = Number(parametros.alimentacao);
  const descricao = [];
  const justificativa = [];
  let qtdPernoite = 0, qtdSimples = 0, qtdAlimentacao = 0;
  let valorPernoite = 0, valorSimples = 0, valorAlimentacao = valorAlimentacaoCheia;
  let faixa = faixaDistancia(distancia), faixaTexto = FAIXAS[faixa];
  const periodo = `${formatarDataHora(ini)} até ${formatarDataHora(fim)}`;

  if (dentroMunicipio) {
    // Diária só é devida fora do município (Art. 3º); dentro do território vale apenas o Art. 6º, § 2º.
    faixa = 'MUNICIPIO'; faixaTexto = 'Dentro do território do município';
    valorAlimentacao = Math.round(valorAlimentacaoCheia * 50) / 100;
    if (totalMin >= 360) {
      qtdAlimentacao = 1;
      descricao.push(`01 etapa alimentação (50%) referente ao deslocamento dentro do município de ${periodo}.`);
      justificativa.push('Art. 6º, § 2º: deslocamento dentro do território do município com duração a partir de 6 horas — 50% do valor da etapa alimentação.');
      if (totalMin > 720) justificativa.push('A lei não prevê diária para deslocamento dentro do município; aplicada somente a etapa alimentação de 50%.');
    } else {
      descricao.push('Não há valor devido: deslocamento dentro do município inferior a 6 horas.');
      justificativa.push('Art. 6º, § 2º: abaixo de 6 horas não há etapa alimentação.');
    }
  } else {
    const tab = parametros.valores[grupo];
    valorSimples = Number(tab.SIMPLES[faixa]);
    const art7 = distancia < 100;
    valorPernoite = art7 ? valorSimples : Number(tab.PERNOITE[faixa]);
    qtdPernoite = Math.floor(totalMin / 1440);
    const restoMin = totalMin - qtdPernoite * 1440;
    const inicioResto = ini + qtdPernoite * 1440;

    for (let i = 0; i < qtdPernoite; i++) {
      descricao.push(`01 diária ${art7 ? 'com pernoite (pago o valor da diária simples)' : 'pernoite'} referente ao período de ${formatarDataHora(ini + i * 1440)} até ${formatarDataHora(ini + (i + 1) * 1440)}.`);
    }
    if (qtdPernoite) {
      justificativa.push('Art. 6º: uma diária a cada período de 24 horas de deslocamento, contado da saída de Frei Inocêncio até o retorno.');
      if (art7) justificativa.push('Art. 7º, § 2º: deslocamento inferior a 100 km com necessidade de pernoite — atribuído o valor da diária simples.');
    }
    const periodoResto = `${formatarDataHora(inicioResto)} até ${formatarDataHora(fim)}`;
    if (restoMin > 720) {
      qtdSimples = 1;
      descricao.push(`01 diária simples referente ao período de ${periodoResto}.`);
      justificativa.push(qtdPernoite
        ? 'Art. 6º: fração superior a 12 horas após o último período de 24 horas — uma diária simples.'
        : 'Art. 6º: deslocamento superior a 12 horas — uma diária simples.');
    } else if (restoMin >= 360) {
      qtdAlimentacao = 1;
      descricao.push(`01 etapa alimentação referente ao período de ${periodoResto}.`);
      justificativa.push('Art. 6º, § 1º: fração de deslocamento entre 6 e 12 horas — somente a parcela referente à alimentação.');
    } else if (restoMin > 0 || qtdPernoite === 0) {
      if (qtdPernoite === 0) {
        descricao.push('Não há diária devida, pois o afastamento foi inferior a 6 horas.');
        justificativa.push('Art. 6º, § 1º: deslocamento inferior a 6 horas não gera diária nem etapa alimentação.');
      } else {
        descricao.push('O período residual final foi inferior a 6 horas e não gerou parcela adicional.');
        justificativa.push('Art. 6º: fração final inferior a 6 horas não gera parcela adicional.');
      }
    }
  }

  const valorTotal = Math.round((qtdPernoite * valorPernoite + qtdSimples * valorSimples + qtdAlimentacao * valorAlimentacao) * 100) / 100;
  const tipos = [];
  if (qtdAlimentacao) tipos.push(dentroMunicipio ? 'Etapa Alimentação (50%)' : 'Etapa Alimentação');
  if (qtdSimples) tipos.push('Diária Simples');
  if (qtdPernoite) tipos.push(valorPernoite === valorSimples && !dentroMunicipio ? 'Diária com Pernoite (valor simples – Art. 7º, § 2º)' : 'Diária Pernoite');

  return {
    distancia_km: Math.round(distancia * 100) / 100,
    dentro_municipio: !!dentroMunicipio,
    faixa_codigo: faixa,
    faixa_texto: faixaTexto,
    horas_total: totalMin / 60,
    quantidade_pernoite: qtdPernoite,
    quantidade_simples: qtdSimples,
    quantidade_alimentacao: qtdAlimentacao,
    valor_pernoite: valorPernoite,
    valor_simples: valorSimples,
    valor_alimentacao: valorAlimentacao,
    valor_total: valorTotal,
    tipo_resumo: tipos.length ? tipos.join(' / ') : 'Sem diária',
    descricao_calculo: descricao,
    justificativa_legal: justificativa
  };
}

// ---------- CPF ----------
export function limparCpf(cpf) { return String(cpf || '').replace(/\D/g, ''); }

export function formatarCpf(cpf) {
  const c = limparCpf(cpf);
  return c.length === 11 ? c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : c;
}

/** Valida os dígitos verificadores (o sistema antigo só conferia se havia 11 números). */
export function cpfValido(cpf) {
  const c = limparCpf(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(c[t])) return false;
  }
  return true;
}

/** Duas viagens do mesmo servidor se sobrepõem? */
export function periodosSobrepostos(aIni, aFim, bIni, bFim) {
  const a1 = minutosAbsolutos(aIni), a2 = minutosAbsolutos(aFim);
  const b1 = minutosAbsolutos(bIni), b2 = minutosAbsolutos(bFim);
  if ([a1, a2, b1, b2].includes(null)) return false;
  return a1 < b2 && b1 < a2;
}

// ---------- Valor por extenso (reais) ----------
const UNI = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function ate999(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100, partes = [];
  if (c) partes.push(CEN[c]);
  if (r < 20) { if (r) partes.push(UNI[r]); }
  else { partes.push(DEZ[Math.floor(r / 10)] + (r % 10 ? ' e ' + UNI[r % 10] : '')); }
  return partes.join(' e ');
}
function inteiroExtenso(n) {
  if (n === 0) return 'zero';
  const grupos = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
  const partes = [];
  let i = 0;
  const blocos = [];
  while (n > 0) { blocos.push(n % 1000); n = Math.floor(n / 1000); }
  for (i = blocos.length - 1; i >= 0; i--) {
    const b = blocos[i];
    if (!b) continue;
    let t = (i === 1 && b === 1) ? 'mil' : ate999(b) + (i ? ' ' + grupos[i][b === 1 ? 0 : 1] : '');
    partes.push({ t, b, i });
  }
  return partes.map((p, k) => {
    if (k === 0) return p.t;
    const ultimo = k === partes.length - 1;
    return (ultimo ? ((p.b < 100 || p.b % 100 === 0) ? ' e ' : ' ') : ', ') + p.t;
  }).join('').replace(/^, /, '');
}
/** 750 → "setecentos e cinquenta reais"; 1300.5 → "mil e trezentos reais e cinquenta centavos" */
export function valorPorExtenso(valor) {
  const total = Math.round(Number(valor || 0) * 100);
  const reais = Math.floor(total / 100), cent = total % 100;
  const partes = [];
  if (reais || !cent) {
    const t = inteiroExtenso(reais);
    partes.push(t + (reais === 1 ? ' real' : (/(milhão|milhões|bilhão|bilhões)$/.test(t) ? ' de reais' : ' reais')));
  }
  if (cent) partes.push(inteiroExtenso(cent) + (cent === 1 ? ' centavo' : ' centavos'));
  return partes.join(' e ');
}

// ---------- Chave Pix ----------
/** Identifica e valida a chave Pix. Retorna { ok, tipo, valor } com o valor normalizado. */
export function analisarPix(chave) {
  const v = String(chave || '').trim();
  if (!v) return { ok: false, tipo: '', valor: '' };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: true, tipo: 'E-mail', valor: v.toLowerCase() };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return { ok: true, tipo: 'Chave aleatória', valor: v.toLowerCase() };
  const d = v.replace(/\D/g, '');
  if (/^\+?55/.test(v.replace(/[\s()-]/g, '')) && (d.length === 12 || d.length === 13)) return { ok: true, tipo: 'Telefone', valor: '+' + d };
  // 11 dígitos com dígito verificador de CPF válido e sem formatação de telefone → CPF
  if (d.length === 11 && cpfValido(d) && !/[()+\s]/.test(v)) return { ok: true, tipo: 'CPF', valor: d };
  if (d.length === 14 && !/[a-z]/i.test(v)) return { ok: true, tipo: 'CNPJ', valor: d };
  if ((d.length === 10 || d.length === 11) && !/[a-z]/i.test(v)) return { ok: true, tipo: 'Telefone', valor: '+55' + d };
  return { ok: false, tipo: '', valor: v };
}
