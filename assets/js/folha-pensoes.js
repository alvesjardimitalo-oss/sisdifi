// Pensão alimentícia: uma única ordem de pagamento extra-orçamentária com
// várias liquidações, uma por pensão, e o beneficiário no histórico de cada uma.
//
// O resumo de verbas só traz o código e o total da rubrica por lotação, o que
// não basta: duas pensões da mesma rubrica em lotações diferentes são dois
// beneficiários. Quem diz de quem é cada desconto é a folha nominal, por
// matrícula. Daí este módulo cruzar os dois.
//
// O beneficiário não está em nenhum dos dois documentos — a folha mostra o
// servidor que sofre o desconto, não quem recebe. O nome vem do comprovante de depósito e fica no cadastro,
// por matrícula e rubrica, e o histórico fica pendente até ser informado.
import { somarRubricas } from './folha-servidores.js';

/** Rubricas de pensão alimentícia da folha de Frei Inocêncio. */
export const RUBRICAS_PENSAO = ['230', '232', '233'];
export const DESTINO_PENSAO = 'Pensão alimentícia';

export const chaveCadastro = (matricula, rubrica) => String(matricula || '') + '|' + String(rubrica || '');

/** Texto do histórico da liquidação. O beneficiário vem primeiro: é o que se procura. */
export function historicoPensao(l) {
  const partes = [];
  if (l.beneficiario) partes.push('Pensão alimentícia a ' + l.beneficiario);
  else partes.push('Pensão alimentícia (beneficiário a informar)');
  if (l.servidor) partes.push('descontada de ' + l.servidor +
    (l.matricula ? ' (matrícula ' + l.matricula + ')' : ''));
  if (l.processo) partes.push('processo ' + l.processo);
  partes.push('rubrica ' + l.rubrica);
  return partes.join(', ') + '.';
}

/**
 * Monta a OP de pensão alimentícia a partir dos empenhos e da folha nominal.
 *
 * `empenhos` é o que prepararEmpenhos devolve; `servidores`, o que
 * varrerServidores devolve; `cadastro` associa matrícula+rubrica ao
 * beneficiário: { '001213|233': { beneficiario, processo } }.
 *
 * Devolve uma OP só, com uma liquidação por pensão, e os avisos do que não
 * fechou. A conferência é dupla: cada liquidação tem de achar lotação no
 * empenho, e a soma das liquidações tem de bater com o total descontado.
 */
export function pensoesParaOP(empenhos = [], servidores = [], cadastro = {}) {
  const avisos = [];
  const quais = new Set(RUBRICAS_PENSAO);

  // O que o empenho descontou de pensão, por lotação: é o total a conferir.
  const porLotacao = new Map();
  for (const e of empenhos || []) {
    for (const d of e.rubricasDesconto || []) {
      if (!quais.has(d.codigo)) continue;
      const k = e.lotacao + '|' + d.codigo;
      const at = porLotacao.get(k) || { lotacao: e.lotacao, rubrica: d.codigo, descricao: d.descricao || '', valor: 0, empenho: e.empenho };
      at.valor += d.valor;
      porLotacao.set(k, at);
    }
  }
  const totalEmpenhado = [...porLotacao.values()].reduce((n, x) => n + x.valor, 0);

  // Quem é o servidor de cada desconto: vem da folha, por matrícula.
  const liquidacoes = [];
  for (const s of servidores || []) {
    if (somarRubricas(s, RUBRICAS_PENSAO) <= 0) continue;
    for (const r of s.rubricas || []) {
      if (!quais.has(r.codigo) || r.valor <= 0) continue;
      const cad = cadastro[chaveCadastro(s.matricula, r.codigo)] || {};
      const noEmpenho = porLotacao.get(s.lotacao + '|' + r.codigo);
      const l = {
        lotacao: s.lotacao || '', empenho: noEmpenho?.empenho ?? null,
        matricula: s.matricula || '', servidor: s.nome || '',
        rubrica: r.codigo, descricao: r.descricao || '', valor: r.valor,
        beneficiario: cad.beneficiario || '', processo: cad.processo || '',
        pagina: s.pagina
      };
      l.historico = historicoPensao(l);
      l.pendente = !l.beneficiario;
      if (!s.lotacao)
        avisos.push('Matrícula ' + (s.matricula || '?') + ' tem pensão na folha mas ficou sem lotação completa. ' +
          'Não atribuir a outro empenho por conta própria.');
      else if (!noEmpenho)
        avisos.push('Matrícula ' + s.matricula + ' tem a rubrica ' + r.codigo + ' na lotação ' + s.lotacao +
          ', que não desconta essa rubrica no resumo de verbas. Confira se a folha e o resumo são da mesma competência.');
      liquidacoes.push(l);
    }
  }
  liquidacoes.sort((a, b) => (a.lotacao || '').localeCompare(b.lotacao || '') || a.rubrica.localeCompare(b.rubrica));

  const total = liquidacoes.reduce((n, l) => n + l.valor, 0);
  // Sem nenhuma liquidação o que falta é a folha, não a conciliação: um aviso
  // de diferença aqui só esconderia o que a Contabilidade precisa fazer.
  if (totalEmpenhado && !liquidacoes.length)
    avisos.push('Os empenhos descontam ' + reais(totalEmpenhado) + ' de pensão, mas a folha nominal não trouxe nenhuma. ' +
      'Envie a folha individual para localizar os descontos por matrícula.');
  else if (totalEmpenhado && total !== totalEmpenhado)
    avisos.push('A soma das liquidações de pensão (' + reais(total) + ') não fecha com o descontado nos empenhos (' +
      reais(totalEmpenhado) + '). Falta ' + reais(totalEmpenhado - total) + ' — confira se a folha nominal está completa.');

  const pendentes = liquidacoes.filter(l => l.pendente);
  return {
    op: { destino: DESTINO_PENSAO, total, liquidacoes, quantidade: liquidacoes.length },
    pendentes, totalEmpenhado, avisos
  };
}

const reais = v => 'R$ ' + (Number(v || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
