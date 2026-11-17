// Varredura por servidor da folha nominal.
//
// A folha agrupa os servidores por lotação: um cabeçalho com a hierarquia, e
// depois um bloco por matrícula com as rubricas de provento e desconto. Quem
// precisa de detalhe por pessoa — salário-maternidade, pensão alimentícia,
// consignado — parte daqui, em vez de cada módulo reaprender a ler o cabeçalho.
//
// Duas armadilhas conhecidas:
//  - o campo "tipo" P/D NÃO indica provento ou desconto: nesses relatórios ele
//    é o status do processamento. Quem define é a coluna do valor;
//  - a lotação do empenho tem 3 OU 4 níveis, e as duas formas são completas.
//    Em '002.004.215.00001' o 3º nível é a ação e o 4º a categoria; em
//    '002.016.002' a hierarquia pula a ação e o 3º nível já é a categoria.
//    Exigir quatro níveis fazia o relatório perder 10 das 93 lotações reais.
//    '002' é órgão e '002.004' é secretaria: esses sim são prefixo.
import { centavosFolha } from './folha-empenhos.js';

export const texto = o => String(typeof o === 'string' ? o : o?.texto || '').trim();
export const pagina = o => typeof o === 'string' ? 1 : o?.pagina || 1;
export const normalizar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const PISO_NIVEIS = 3;
const codigoLotacao = /\b(\d{3}(?:\s*\.\s*\d+)+)\b/g;
const matricula = /^(\d{4,8})\s*\/\s*\d+\s+(.+)$/;
const verba = /^(\d{2,4})\s+([A-Z])\s+(.+)$/i;

export const limparLotacao = v => String(v || '').replace(/\s+/g, '');
export const niveis = v => limparLotacao(v).split('.').length;

/**
 * Código de lotação na linha.
 * Quem decide o que é lotação é o resumo de verbas, que lista as reais: quando
 * `conhecidas` é informado, só vale código que está lá. '002.004.215' é o nível
 * da ação da creche e seria recusado; '002.016.002' é lotação de verdade e passa.
 * Sem o resumo em mãos, vale o mais profundo da linha a partir do piso — o
 * cabeçalho da folha sempre desce até o último nível.
 */
export function localizarLotacaoCompleta(linha, conhecidas = null) {
  const achados = [...String(linha || '').matchAll(codigoLotacao)]
    .map(m => limparLotacao(m[1]))
    .filter(c => niveis(c) >= PISO_NIVEIS)
    .sort((a, b) => niveis(b) - niveis(a));
  if (conhecidas && conhecidas.size) return achados.find(c => conhecidas.has(c)) || '';
  return achados[0] || '';
}

/** Lotações reais, extraídas dos registros do resumo de verbas. */
export function lotacoesDoResumo(resumos = []) {
  return new Set((resumos || []).filter(Boolean)
    .flatMap(a => a.registros || []).map(r => limparLotacao(r.lotacao)).filter(Boolean));
}

/* O nome vem entre a matrícula e a coluna NÍVEL / PADRÃO - FUNÇÃO. O nível tem
   duas formas na mesma folha: "1_20 /0073 -" em 511 linhas de outubro e um
   algarismo romano, "II /0032 -", em outras 102. Cobrir só a primeira deixava
   um sexto dos nomes com o cargo e a data grudados — e o nome vai no histórico
   da liquidação de pensão, que a Contabilidade copia para o sistema.

   Em quatro linhas as colunas se sobrepõem no PDF e o nível entra no meio do
   nome ("...DE OLIVEIR1A_20"). Aí o fim do nome é irrecuperável: apara-se o
   trecho com dígito ou sublinhado e fica o que dá, em vez de devolver o cargo
   e a data junto. */
const NIVEL = /\s*(?:\d+_\d+|[IVX]{1,4})?\s*\/\s*\d+\s*-/;
export function extrairNome(s) {
  const bruto = String(s || '');
  const corte = bruto.search(NIVEL);
  let nome = (corte >= 0 ? bruto.slice(0, corte) : bruto).trim();
  // Resto do nível colado no último termo, ou solto depois do nome.
  nome = nome.replace(/\s+(?:\d+_\d+|[IVX]{1,4})$/, '').replace(/[\d_]+[A-Z]?_?\d*$/, '');
  return nome.trim();
}

/** Rubrica da linha, com o valor da última coluna preenchida. */
export function valoresRubrica(l) {
  const v = String(l || '').match(verba);
  if (!v) return null;
  const finais = v[3].match(/-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}/g) || [];
  if (!finais.length) return null;
  return { codigo: v[1], tipo: v[2], descricao: v[3], valor: centavosFolha(finais.at(-1)) };
}

/**
 * Percorre a folha e devolve um registro por servidor, com as rubricas dele.
 * `conhecidas` são as lotações do resumo de verbas; sem elas, vale o código
 * mais profundo do cabeçalho.
 *
 * Cada servidor sai como { matricula, nome, lotacao, lotacaoPendente, pagina,
 * rubricas: [{codigo, tipo, descricao, valor}] }. `lotacaoPendente` guarda o
 * prefixo quando só veio órgão ou secretaria: aí a lotação ficou indefinida e
 * o servidor NÃO deve ser atribuído a outra por conta própria.
 */
export function varrerServidores(linhas = [], conhecidas = null) {
  const servidores = [];
  let pessoa = null, lotacaoAtual = '', emCabecalho = false, ultimaPagina = 1, ultimoPrefixo = '';
  /* Quando o bloco de um servidor é cortado pela quebra de página, a página
     seguinte reimprime o cabeçalho inteiro — LOTAÇÃO incluída — e as rubricas
     dele continuam sem nova linha de matrícula. Fechar a pessoa no cabeçalho
     jogava essas rubricas fora: em outubro perdia a pensão de 504,61 do
     servidor 001213, cujo bloco começa na página 148 e termina na 149.
     Então a pessoa fica suspensa e volta se a lotação for a mesma. */
  let suspensa = null;
  const fechar = () => {
    if (suspensa) { servidores.push(suspensa); suspensa = null; }
    if (pessoa) servidores.push(pessoa);
    pessoa = null;
  };
  const retomar = () => {
    if (!suspensa) return;
    if (suspensa.lotacao === lotacaoAtual) { pessoa = suspensa; suspensa = null; return; }
    servidores.push(suspensa); suspensa = null;
  };

  for (const item of linhas) {
    const s = texto(item);
    if (!s) continue;
    ultimaPagina = pagina(item);
    if (/^LOTA[CÇ][AÃ]O\s*:/i.test(s)) {
      if (suspensa) { servidores.push(suspensa); suspensa = null; }
      suspensa = pessoa; pessoa = null;
      lotacaoAtual = ''; ultimoPrefixo = ''; emCabecalho = true;
      const codigo = localizarLotacaoCompleta(s, conhecidas);
      if (codigo) lotacaoAtual = codigo;
      continue;
    }
    /* O cabeçalho traz um nível por linha: 002, 002.004, 002.004.215 e às vezes
       002.004.215.00001. Vale o mais profundo; o que ficar abaixo do piso é
       prefixo e nunca é a lotação do empenho. Não exigir hífen, pois o pdf.js
       pode separar descrição e código. */
    if (emCabecalho) {
      const codigo = localizarLotacaoCompleta(s, conhecidas);
      if (codigo) {
        if (!lotacaoAtual || niveis(codigo) > niveis(lotacaoAtual)) { lotacaoAtual = codigo; ultimoPrefixo = ''; }
        continue;
      }
      const parcial = s.match(codigoLotacao);
      if (parcial && niveis(parcial[0]) < PISO_NIVEIS) { ultimoPrefixo = limparLotacao(parcial[0]); continue; }
    }
    const cab = s.match(matricula);
    if (cab) {
      fechar();
      emCabecalho = false;
      pessoa = null;
      pessoa = { matricula: cab[1], nome: extrairNome(cab[2]), lotacao: lotacaoAtual,
        pagina: pagina(item), rubricas: [] };
      if (!lotacaoAtual && ultimoPrefixo) pessoa.lotacaoPendente = ultimoPrefixo;
      continue;
    }
    const v = valoresRubrica(s);
    if (!v) continue;
    // Rubrica depois do cabeçalho reimpresso: é a continuação do mesmo servidor.
    if (!pessoa) retomar();
    if (!pessoa) continue;
    emCabecalho = false;
    pessoa.rubricas.push(v);
  }
  fechar();
  return { servidores, paginas: ultimaPagina };
}

/** Soma, por servidor, as rubricas cujo código está em `codigos`. */
export function somarRubricas(servidor, codigos = [], filtro = null) {
  const quais = new Set(codigos.map(String));
  return (servidor?.rubricas || [])
    .filter(r => quais.has(r.codigo) && (!filtro || filtro(r)))
    .reduce((n, r) => n + r.valor, 0);
}

/**
 * Enxuga a varredura para guardar só quem interessa ao repasse: servidores com
 * desconto de banco, pensão ou restituição. INSS e IRRF ficam de fora porque
 * se apuram pelo total, não por pessoa.
 *
 * Quem diz quais códigos são desconto é o resumo de verbas, que os imprime na
 * classificação contábil própria — a folha sozinha não separa provento de
 * desconto pelo código. Então `codigosDesconto` vem do resumo e `categoriaDe`
 * descarta tributo. Assim um empréstimo novo entra sozinho, sem lista fixa.
 *
 * Sem isso o registro mensal guardaria a folha inteira: em outubro, 298 KiB
 * contra 37 KiB.
 */
export function servidoresComRepasse(servidores = [], codigosDesconto = null, categoriaDe = null) {
  const codigos = codigosDesconto instanceof Set ? codigosDesconto : new Set(codigosDesconto || []);
  if (!codigos.size) return [];
  const categoria = typeof categoriaDe === 'function' ? categoriaDe : () => 'Outros';
  const interessa = r => codigos.has(String(r.codigo)) && !['INSS', 'IRRF'].includes(categoria(r));
  return (servidores || [])
    .map(s => ({ ...s, rubricas: (s.rubricas || []).filter(interessa) }))
    .filter(s => s.rubricas.length);
}

/** Códigos que o resumo de verbas classificou como desconto. */
export function codigosDeDesconto(arquivos = []) {
  const codigos = new Set();
  for (const a of (arquivos || []).filter(Boolean))
    for (const r of a.registros || [])
      for (const d of r.rubricasDesconto || []) codigos.add(String(d.codigo));
  return codigos;
}
