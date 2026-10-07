// SISDIFI — Leitura da "Folha de Pagamento" (ordem lotação/alfabética, em PDF) para atualizar cargo, vínculo e lotação
// A folha não traz CPF: o cruzamento com o cadastro é pela matrícula (a mesma da relação de pessoal) e, na falta dela,
// pelo nome. Valores de salário e descontos são ignorados — nada da folha além de cargo, vínculo e lotação é guardado.
import { nomeProprio, secretariaDaLotacao, ehInativo } from './servidores-pdf.js';

const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const INICIO = /^(\d{6})\s*\/\s*(\d)\s+(.*)$/;
const LOTACAO = /^(?:LOTA[CÇ][AÃ]O:\s*)?(\d{3}(?:\.\d+)*)\s*-\s*(.+)$/i;
const FIM_CAB = /^(\d{3}\s+[PD]\s|TOTAL\b|T O T A L|Total d)/;
// nome · nível (1_20, II…) · / padrão · - função · admissão · situação
// (o nível pode vir colado no nome: "OLIVEIRA1_20", "PAULAII")
const CABECALHO = /^(.+?)\s*(?:(\d\w*|[IVX]{2,4}|(?<=\s)[IVX])\s*)?\/\s*(\d{1,4})\s*-\s*(.+?)\s*(\d{2}\/\d{2}\/\d{4})\s*(.*)$/;
const SITUACAO = /(AGENTES? POL[IÍ]TICOS?|COMISSIONAD[OA]|EFETIV[OA]|CONTRATAD[OA]|APOSENTAD[OA]|ESTAGI[AÁ]RI[OA]|CONSELHO TUTELAR|PENSIONISTA|CEDID[OA])\b.*$/i;

/**
 * Analisa as linhas da folha. Devolve [{ matricula, nome, funcao, admissao, situacao, lotacao: [...], secretaria_texto }].
 */
const completo = t => { const m = t.replace(/\s+/g, ' ').trim().match(CABECALHO); return !!(m && m[6].trim()); };

export function analisarFolha(linhas) {
  const lista = [];
  let lotacao = [], novaLot = false, atual = null;
  const fechar = () => {
    if (!atual) return;
    const m = atual.texto.replace(/\s+/g, ' ').trim().match(CABECALHO);
    if (m) {
      const partes = lotacao.filter(x => !/^PREF(EITURA|\.)/i.test(x));
      // o fim da função às vezes cai depois da data ("… TURISMO 10/02/2025 E COMISSIONADO")
      const resto = m[6].trim(), sit = resto.match(SITUACAO);
      const antes = sit ? resto.slice(0, sit.index).trim() : '';
      lista.push({
        matricula: atual.matricula, nome: m[1].trim(), funcao: (m[4].trim() + ' ' + antes).trim(), admissao: m[5],
        situacao: (sit ? sit[0] : resto).replace(/\s*-\s*$/, '').trim(), lotacao: partes,
        secretaria_texto: partes.find(x => /SECRETARIA|GABINETE/i.test(x)) || partes.join(' / ')
      });
    }
    atual = null;
  };
  for (const bruta of linhas) {
    const l = String(bruta).replace(/\s+/g, ' ').trim();
    if (!l) continue;
    if (/^LOTA[CÇ][AÃ]O:/i.test(l)) { fechar(); lotacao = []; novaLot = true; }
    const lot = l.match(LOTACAO);
    if (lot && novaLot && !INICIO.test(l)) { lotacao.push(lot[2].trim()); continue; }
    const ini = l.match(INICIO);
    if (ini) { fechar(); novaLot = false; atual = { matricula: ini[1], texto: ini[3] }; continue; }
    if (atual && !FIM_CAB.test(l) && !completo(atual.texto)) { atual.texto += ' ' + l; continue; }
    if (atual) fechar();
  }
  fechar();
  return lista;
}

const cargoNorm = t => norm(t).replace(/\(A\)|\(O\)/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/** A folha corta a função em ~30 letras: um cargo já cadastrado que começa igual ao texto cortado continua valendo. */
export function cargoEquivale(cadastrado, folha) {
  const a = cargoNorm(cadastrado), b = cargoNorm(folha);
  return !!a && !!b && (a === b || a === cargoNorm(cargoDaFolha(folha)) || (b.length >= 20 && a.startsWith(b)));
}

/** Função da folha em letra normal ("PROFESSOR GRADUADO E" → "Professor Graduado"); cortes no fim são limpos. */
export function cargoDaFolha(funcao) {
  return nomeProprio(String(funcao || '').replace(/\s+(E|DE|DA|DO|DAS|DOS|EM|\/)$/i, '').trim())
    .replace(/\/(\p{Ll})/gu, (t, c) => '/' + c.toUpperCase())
    .replace(/\b(cras|creas|psf|esf|suas|ubs|caps|sus|rh)\b/gi, t => t.toUpperCase()).replace(/\((a|o)\)/gi, '(a)')
    .replace(/\(([^)]*)$/, (t, d) => d.trim() ? `(${d.trim()})` : '').trim();
}

/**
 * Cruza a folha com o cadastro. Para cada pessoa da folha:
 *  { folha, servidor|null, por: 'matricula'|'nome'|null, mudancas: { cargo_funcao?, vinculo?, secretaria_id?, matricula? } }
 * Além disso devolve os servidores ativos do cadastro que não estão na folha.
 */
export function cruzarFolha(folha, servidores, secretarias) {
  const ativos = servidores.filter(s => s.ativo !== false);
  const porMat = new Map(), porNome = new Map();
  for (const s of servidores) {
    for (const m of [s.matricula, ...(s.matriculas || [])].filter(Boolean)) porMat.set(String(m).padStart(6, '0'), s);
    const k = norm(s.nome); porNome.set(k, porNome.has(k) ? null : s); // nome repetido no cadastro não serve de chave
  }
  const usados = new Set();
  const itens = folha.map(f => {
    let sv = porMat.get(f.matricula), por = sv ? 'matricula' : null;
    if (!sv) { sv = porNome.get(norm(f.nome)) || null; por = sv ? 'nome' : null; }
    const mud = {};
    if (sv) {
      usados.add(sv.id);
      if (!cargoEquivale(sv.cargo_funcao, f.funcao)) mud.cargo_funcao = cargoDaFolha(f.funcao);
      if (norm(sv.vinculo) !== norm(f.situacao)) mud.vinculo = f.situacao;
      const sec = ehInativo({ vinculo: f.situacao, lotacao: f.lotacao }) ? null : secretariaDaLotacao(f.secretaria_texto, secretarias);
      if (sec && sec !== sv.secretaria_id) mud.secretaria_id = sec;
      if (por === 'nome' && !sv.matricula) mud.matricula = f.matricula;
    }
    return { folha: f, servidor: sv, por, mudancas: mud };
  });
  // mesma pessoa com duas matrículas na folha: vale a primeira linha com mudança de cargo
  const vistos = new Set();
  for (const it of itens) {
    if (!it.servidor) continue;
    if (vistos.has(it.servidor.id)) { it.repetido = true; it.mudancas = {}; }
    vistos.add(it.servidor.id);
  }
  const fora = ativos.filter(s => !usados.has(s.id));
  return { itens, fora };
}
