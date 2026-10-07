// SISDIFI — Leitura da "Relação de servidores" (Cadastro de Pessoal por Lotação, em PDF) e checagem de duplicidade
// A análise do texto é pura (testável em Node); o PDF vira texto com extrairLinhas() do leitor do orçamento.
import { cpfValido } from './calculo.js';

const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const IGNORAR = /^(UF:|MUNIC[IÍ]PIO:|POR LOTA|ENTIDADE:|Titulo Eleitoral|Exp\.)|CADASTRO DE PESSOAL/i;
const DADO = /^(\d{4,8})\s+(\d{6,12})\s+(.+?)\s+(\d{3}\.\d{3}\.\d{3}-\d{2})(?:\s|$)/;
const VINCULO = /EFETIV|CONTRAT|COMISSION|AGENTE POL|VICE[- ]PREFEITO|CONSELHO TUTELAR|APOSENTAD|PENS[OÕ]ES|PENSIONIST|PROCESSO SELETIVO/i;

/** Nome em caixa alta → "Maria da Penha Pereira Alves". */
export function nomeProprio(nome) {
  const pequenas = ['da', 'das', 'de', 'do', 'dos', 'e'];
  return String(nome).toLowerCase().replace(/\s+/g, ' ').trim().split(' ')
    .map((w, i) => i && pequenas.includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Analisa as linhas do relatório "Cadastro de Pessoal por Lotação".
 * Devolve [{ matricula, nome, cpf, lotacao: [linhas do cabeçalho], secretaria_texto, vinculo }].
 */
export function analisarRelacaoServidores(linhas) {
  const lista = [];
  let cab = [], lotacao = [];
  for (const bruta of linhas) {
    const l = String(bruta).replace(/\s+/g, ' ').trim();
    if (!l || IGNORAR.test(l)) continue;
    if (/^Matr[ií]cula/i.test(l)) { if (cab.length) lotacao = cab; cab = []; continue; }
    if (/^TOTAL DE SERVIDORES/i.test(l)) { cab = []; continue; }
    const m = l.match(DADO);
    if (m) {
      const partes = lotacao.filter(x => !/^PREF(EITURA|\.)/i.test(x));
      const vinc = partes.length > 1 && VINCULO.test(partes[partes.length - 1]) ? partes[partes.length - 1] : '';
      lista.push({
        matricula: m[1], nome: m[3].trim(), cpf: m[4].replace(/\D/g, ''),
        lotacao: partes, vinculo: vinc,
        secretaria_texto: partes.find(x => /SECRETARIA|GABINETE/i.test(x)) || partes.filter(x => x !== vinc).join(' / ')
      });
      continue;
    }
    cab.push(l);
  }
  return lista;
}

const SINONIMOS = [
  [/acao social|assistencia social|cras|creas|suas|conselho tutelar/, 'assistencia social'],
  [/ensino|escolar|creche|educacao infantil|fundeb/, 'educacao'],
  [/saude|vigilancia|epidemiolog|farmacia|hospital|atencao basica/, 'saude'],
  [/obras/, 'obras']
];
const VAZIAS = new Set(['secretaria', 'secretarias', 'municipal', 'munic', 'de', 'da', 'do', 'das', 'dos', 'e']);
const tokens = t => norm(t).split(/[^a-z0-9]+/).filter(x => x.length > 1 && !VAZIAS.has(x));

/** Secretaria do sistema para um texto de lotação (ex.: "SECRETARIA MUNIC. DE ACAO SOCIAL" → Assistência Social). */
export function secretariaDaLotacao(texto, secretarias) {
  const ativas = secretarias.filter(s => s.ativo !== false);
  const tentar = alvo => {
    const t = ' ' + tokens(alvo).join(' ') + ' ';
    let melhor = null, pts = 0;
    for (const s of ativas) {
      const tk = tokens(s.nome);
      if (tk.length && tk.every(x => t.includes(' ' + x.slice(0, 5))) && tk.length > pts) { melhor = s.id; pts = tk.length; }
    }
    return melhor;
  };
  const n = norm(texto);
  const porSinonimo = () => { for (const [re, palavra] of SINONIMOS) { const id = re.test(n) && tentar(palavra); if (id) return id; } return null; };
  // Com "SECRETARIA ..." ou "GABINETE" no cabeçalho, vale o nome; sem isso (ex.: "TRANSPORTE ESCOLAR"), vale a área.
  return /secretaria|gabinete/.test(n) ? (tentar(texto) || porSinonimo()) : (porSinonimo() || tentar(texto));
}

/** Enquadramento sugerido pela lotação: agente político e vice-prefeito → secretários; demais → demais servidores. */
export function grupoSugerido(vinculo) {
  return /AGENTE POL|VICE[- ]PREFEITO/i.test(vinculo || '') ? 'VICE_SECRETARIO_JURIDICO' : 'DEMAIS_SERVIDORES';
}
export const ehInativo = p => /APOSENTAD|PENS[OÕ]ES|PENSIONIST|INATIVOS/i.test([p.vinculo, ...(p.lotacao || [])].join(' '));

/**
 * Junta a relação com o cadastro existente e classifica cada pessoa:
 *  novo · existe (mesmo CPF já cadastrado) · nome (mesmo nome com outro CPF — possível duplicidade)
 *  cpf_invalido · inativo (aposentado/pensionista). CPFs repetidos na relação viram uma pessoa só.
 */
export function compararComCadastro(lista, existentes) {
  const porCpf = new Map(existentes.map(s => [String(s.cpf).replace(/\D/g, '').padStart(11, '0'), s]));
  const porNome = new Map(existentes.map(s => [norm(s.nome), s]));
  const unicos = new Map();
  for (const p of lista) {
    const u = unicos.get(p.cpf);
    if (u) { if (!u.matriculas.includes(p.matricula)) u.matriculas.push(p.matricula); continue; }
    unicos.set(p.cpf, { ...p, matriculas: [p.matricula] });
  }
  return [...unicos.values()].map(p => {
    const existente = porCpf.get(p.cpf);
    const xara = !existente && porNome.get(norm(p.nome));
    const situacao = existente ? 'existe' : !cpfValido(p.cpf) ? 'cpf_invalido' : xara ? 'nome' : ehInativo(p) ? 'inativo' : 'novo';
    return { ...p, situacao, existente: existente || xara || null };
  });
}

export const SITUACOES = {
  novo: { nome: 'Novo', dica: 'será cadastrado', marcar: true },
  existe: { nome: 'Já cadastrado', dica: 'mesmo CPF — não duplica', marcar: false },
  nome: { nome: 'Possível duplicidade', dica: 'mesmo nome com outro CPF', marcar: false },
  cpf_invalido: { nome: 'CPF inválido', dica: 'dígito verificador não confere', marcar: false },
  inativo: { nome: 'Aposentado/pensionista', dica: 'não viaja a serviço', marcar: false }
};
