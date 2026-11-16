// Saldo por fonte e rateio da educação entre FUNDEB e recurso próprio.
//
// A educação toda vai no FUNDEB, menos o pessoal da Secretaria de Educação.
// Quando o FUNDEB não tem saldo para pagar, a diferença vai para o recurso
// próprio, nas fichas espelho do Fundo de Educação — a mesma ação, na fonte
// 1.500.000.0000.
//
// O rateio é por lotação inteira, na ordem dos empenhos, e não por valor.
// Dividir o valor de uma lotação em dois empenhos exigiria repartir também os
// descontos, e o INSS e o IRRF de um servidor não se repartem: a liquidação
// tem de casar com a retenção real daquela pessoa. Então cada empenho vai
// inteiro para uma fonte ou para a outra, e o número do empenho não muda.
import { dinheiroFolha } from './folha-empenhos.js';

export const FONTES_FUNDEB = ['1.540.000.0000', '1.542.000.0000'];

/* Fichas espelho, conferidas na LOA 2026: a mesma ação no Fundo de Educação,
   em recurso próprio. Transporte Escolar está de fora de propósito — no Fundo
   de Educação aquela ação só tem material e serviços, sem elemento de pessoal
   (3.1.90.04/11), então não há para onde mover e o sistema avisa. */
export const ESPELHO_RECURSO_PROPRIO = {
  '173': { ficha: '124', acao: 'Manutenção Ensino Fundamental — recurso próprio' },
  '174': { ficha: '125', acao: 'Manutenção Ensino Fundamental — recurso próprio' },
  '186': { ficha: '143', acao: 'Manutenção Ensino Infantil Creche — recurso próprio' },
  '187': { ficha: '144', acao: 'Manutenção Ensino Infantil Creche — recurso próprio' },
  '191': { ficha: '148', acao: 'Manutenção Ensino Infantil Pré-Escola — recurso próprio' },
  '192': { ficha: '149', acao: 'Manutenção Ensino Infantil Pré-Escola — recurso próprio' },
  '198': { ficha: '158', acao: 'Manutenção Educação Jovens e Adultos — recurso próprio' },
  '199': { ficha: '159', acao: 'Manutenção Educação Jovens e Adultos — recurso próprio' }
};
export const FONTE_RECURSO_PROPRIO = '1.500.000.0000';

/** Compara fonte ignorando pontuação: "1540" e "1.540.000.0000" são a mesma. */
export const mesmaFonte = (a, b) => {
  const so = v => String(v || '').replace(/\D/g, '').replace(/0+$/, '') || '0';
  return so(a) === so(b) && so(a) !== '0';
};
export const ehFundeb = fonte => FONTES_FUNDEB.some(f => mesmaFonte(f, fonte));

/** Saldo informado para a fonte, aceitando "1540" ou "1.540.000.0000" como chave. */
export function saldoDaFonte(saldos = {}, fonte = '') {
  for (const [k, v] of Object.entries(saldos || {}))
    if (mesmaFonte(k, fonte)) return Number(v) || 0;
  return null;
}

/**
 * Decide a fonte de cada empenho conforme o saldo informado.
 *
 * `saldos` associa fonte a saldo em centavos: { '1540': 55000954 }. Sem saldo
 * informado para uma fonte, nada é movido por ela — o sistema não presume que
 * falte dinheiro.
 *
 * Percorre os empenhos na ordem em que serão feitos e consome o saldo do
 * FUNDEB. Cada empenho que não couber no que restou vai para a ficha espelho
 * em recurso próprio; os seguintes que ainda couberem continuam no FUNDEB.
 * Assim o FUNDEB é usado até o fim e só a diferença sai dele, que é a regra da
 * Contabilidade — em troca, um empenho grande pode sair enquanto um menor,
 * depois dele, fica.
 *
 * O saldo é comparado com o BRUTO do empenho, não com o líquido: o líquido vai
 * para o servidor e as retenções para terceiros, mas tudo sai da mesma conta.
 *
 * Ficha escolhida à mão não é movida — só entra no rateio a que o sistema
 * sugeriu (`fichaSugerida`). O saldo dela é consumido do mesmo jeito, e se
 * faltar, o aviso do fim mostra quanto.
 *
 * Devolve os empenhos com ficha e fonte ajustadas, o que foi movido, o consumo
 * por fonte e os avisos. O número do empenho não muda.
 */
export function ratearPorSaldo(empenhos = [], saldos = {}) {
  const lista = Array.isArray(empenhos) ? empenhos : [];
  const avisos = [], movidos = [];
  const restante = new Map(), consumo = new Map();
  const gastar = (fonte, valor) => {
    consumo.set(fonte, (consumo.get(fonte) || 0) + valor);
    if (restante.has(fonte)) restante.set(fonte, restante.get(fonte) - valor);
  };
  for (const e of lista) {
    const s = saldoDaFonte(saldos, e.fonte);
    if (s != null && !restante.has(e.fonte)) restante.set(e.fonte, s);
  }

  const resultado = lista.map(e => {
    const bruto = Number(e.bruto) || 0;
    if (!ehFundeb(e.fonte) || bruto <= 0) { gastar(e.fonte, bruto); return e; }
    const disponivel = restante.has(e.fonte) ? restante.get(e.fonte) : null;
    if (disponivel == null || disponivel >= bruto) { gastar(e.fonte, bruto); return e; }
    // Escolha da Contabilidade não se desfaz por conta própria.
    if (!e.fichaSugerida) { gastar(e.fonte, bruto); return e; }

    const espelho = ESPELHO_RECURSO_PROPRIO[String(e.ficha || '')];
    if (!espelho) {
      avisos.push('Empenho ' + e.empenho + ' (lotação ' + e.lotacao + ', ficha ' + e.ficha + '): o FUNDEB tem ' +
        dinheiroFolha(Math.max(disponivel, 0)) + ' e o empenho é de ' + dinheiroFolha(bruto) +
        ', mas essa ação não tem ficha de pessoal em recurso próprio. Informe a ficha à mão.');
      gastar(e.fonte, bruto);
      return e;
    }
    movidos.push({ empenho: e.empenho, lotacao: e.lotacao, bruto,
      de: { ficha: e.ficha, fonte: e.fonte }, para: { ficha: espelho.ficha, fonte: FONTE_RECURSO_PROPRIO },
      acao: espelho.acao });
    gastar(FONTE_RECURSO_PROPRIO, bruto);
    return { ...e, ficha: espelho.ficha, fonte: FONTE_RECURSO_PROPRIO,
      lotacaoOrcamentaria: espelho.acao, fichaSugerida: true, confiancaFicha: 'confirmada',
      motivoFicha: 'Movido do FUNDEB por falta de saldo: ficha espelho em recurso próprio.',
      origemFonte: 'rateio por saldo' };
  });

  if (movidos.length)
    avisos.push(movidos.length + ' empenho' + (movidos.length === 1 ? '' : 's') + ' da educação ' +
      (movidos.length === 1 ? 'foi' : 'foram') + ' movid' + (movidos.length === 1 ? 'o' : 'os') +
      ' do FUNDEB para recurso próprio por falta de saldo: ' +
      dinheiroFolha(movidos.reduce((n, m) => n + m.bruto, 0)) + '.');

  // Saldo informado que não cobre nem o que ficou: a Contabilidade precisa ver.
  for (const [fonte, gasto] of consumo) {
    const s = saldoDaFonte(saldos, fonte);
    if (s != null && gasto > s)
      avisos.push('A fonte ' + fonte + ' tem saldo de ' + dinheiroFolha(s) + ' e os empenhos somam ' +
        dinheiroFolha(gasto) + ' — falta ' + dinheiroFolha(gasto - s) + '.');
  }

  return { empenhos: resultado, movidos, avisos,
    consumo: [...consumo.entries()].map(([fonte, total]) => ({ fonte, total, saldo: saldoDaFonte(saldos, fonte) }))
      .sort((a, b) => b.total - a.total) };
}
