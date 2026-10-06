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
  '0_149': '0 a 149 KM',
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
 * Calcula a diária.
 * Regra (mantida do sistema em uso):
 *  - cada período completo de 24h → 1 diária pernoite;
 *  - fração final > 12h → 1 diária simples;
 *  - fração final de 6h a 12h → 1 etapa alimentação;
 *  - fração final < 6h → nada.
 * Os cálculos são feitos em MINUTOS inteiros (o antigo usava horas com vírgula flutuante).
 */
export function calcularDiaria({ grupo, km, saida, retorno, parametros = PARAMETROS_PADRAO }) {
  if (!GRUPOS[grupo]) return { erro: 'Categoria do servidor inválida.' };
  const distancia = Number(String(km ?? '').replace(',', '.'));
  if (!(distancia > 0)) return { erro: 'Informe a distância em KM.' };
  const ini = minutosAbsolutos(saida);
  const fim = minutosAbsolutos(retorno);
  if (ini === null || fim === null) return { erro: 'Informe data e hora de saída e de retorno.' };
  if (fim <= ini) return { erro: 'A data/hora de retorno deve ser posterior à de saída.' };

  const faixa = faixaDistancia(distancia);
  const tab = parametros.valores[grupo];
  const valorPernoite = Number(tab.PERNOITE[faixa]);
  const valorSimples = Number(tab.SIMPLES[faixa]);
  const valorAlimentacao = Number(parametros.alimentacao);

  const totalMin = fim - ini;
  const qtdPernoite = Math.floor(totalMin / 1440);
  const restoMin = totalMin - qtdPernoite * 1440;
  const inicioResto = ini + qtdPernoite * 1440;

  const descricao = [];
  const justificativa = [];
  for (let i = 0; i < qtdPernoite; i++) {
    descricao.push(`01 diária pernoite referente ao período de ${formatarDataHora(ini + i * 1440)} até ${formatarDataHora(ini + (i + 1) * 1440)}.`);
  }
  if (qtdPernoite) justificativa.push('Diária pernoite devida por período completo de 24 horas fora do município.');

  let qtdSimples = 0, qtdAlimentacao = 0;
  const periodoResto = `${formatarDataHora(inicioResto)} até ${formatarDataHora(fim)}`;
  if (restoMin > 720) {
    qtdSimples = 1;
    descricao.push(`01 diária simples referente ao período de ${periodoResto}.`);
    justificativa.push(qtdPernoite
      ? 'Diária simples devida por fração superior a 12 horas após o último período integral.'
      : 'Diária simples devida por afastamento superior a 12 horas.');
  } else if (restoMin >= 360) {
    qtdAlimentacao = 1;
    descricao.push(`01 etapa alimentação referente ao período de ${periodoResto}.`);
    justificativa.push('Etapa alimentação devida por fração entre 6 e 12 horas.');
  } else if (restoMin > 0 || qtdPernoite === 0) {
    if (qtdPernoite === 0) {
      descricao.push('Não há diária devida, pois o afastamento foi inferior a 6 horas.');
      justificativa.push('Afastamento inferior ao período mínimo para concessão.');
    } else {
      descricao.push('O período residual final foi inferior a 6 horas e não gerou parcela adicional.');
      justificativa.push('Fração final inferior a 6 horas sem direito a parcela adicional.');
    }
  }

  const valorTotal = Math.round((qtdPernoite * valorPernoite + qtdSimples * valorSimples + qtdAlimentacao * valorAlimentacao) * 100) / 100;
  const tipos = [];
  if (qtdAlimentacao) tipos.push('Etapa Alimentação');
  if (qtdSimples) tipos.push('Diária Simples');
  if (qtdPernoite) tipos.push('Diária Pernoite');

  return {
    distancia_km: Math.round(distancia * 100) / 100,
    faixa_codigo: faixa,
    faixa_texto: FAIXAS[faixa],
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
