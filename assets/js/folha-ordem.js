// Ordem dos empenhos, como a Contabilidade os faz.
//
// A numeração segue a ordem em que os empenhos são digitados, então a ordem é
// o que decide o número de cada um. Duas regras diferentes a formam:
//
//  - DENTRO de um grupo, a ordem é o vínculo: Prefeito, Vice-Prefeito, agente
//    político, comissionado, efetivo, contratado. Isso se deriva do texto da
//    lotação, e é o padrão que a Contabilidade segue em todas as secretarias.
//
//  - ENTRE os grupos, a ordem é da Contabilidade e não sai de nenhum dado:
//    em outubro ela fez Esporte e Lazer antes de Transportes, que veio antes
//    de Obras Públicas, e os códigos são 002.011, 002.013 e 002.012. Então ela
//    é guardada por grupo e reaproveitada nos meses seguintes.
//
// Grupo é a lotação sem o nível do vínculo: '002.004.217.00002' e
// '002.004.217.00006' são o mesmo grupo '002.004.217'; em '002.016.002' o
// vínculo já é o 3º nível, então o grupo é '002.016'. Na lotação do Prefeito
// não há nível de vínculo nenhum, e o grupo é ela inteira.
import { normalizar } from './folha-servidores.js';
import { vinculoDoRegistro } from './folha-transcrever.js';

/* Ordem dos vínculos dentro do grupo, pela mesma detecção que escolhe o
   histórico — uma só, para as duas não divergirem. Quem não é vínculo de
   pessoal ativo (pensão, conselho tutelar, estágio) vai para o fim, porque a
   Contabilidade lança esses depois. */
export const RANK_VINCULO={
 prefeito:1,vice:2,agentePolitico:3,comissionado:4,efetivo:5,contratado:6,aposentadoria:7
};
export const RANK_OUTROS=9;

/** Texto do último nível da lotação, que é onde o vínculo aparece. */
const ultimoNivel=registro=>String((registro?.caminho||[]).slice(-1)[0]||registro?.vinculo||'');

/** Posição do vínculo na ordem de digitação. */
export function rankVinculo(registro={}){
 return RANK_VINCULO[vinculoDoRegistro(registro)]||RANK_OUTROS;
}

/* O último nível é vínculo quando o texto dele diz o vínculo. Na lotação do
   Prefeito não é: ele é reconhecido pela secretaria, e o nível que está ali é a
   ação — então ela não pode ser removida para formar o grupo. */
export function ultimoNivelEhVinculo(registro={}){
 const t=normalizar(ultimoNivel(registro));
 if(/CONSELHO|ESTAGI|PENSO|PENSION/.test(t))return true;
 return !!vinculoDoRegistro({caminho:[ultimoNivel(registro)]});
}

/* O nome da ação, que é o nível acima do vínculo. Dois códigos de lotação
   podem ser a MESMA ação: em outubro, 002.005.235 e 002.005.236 são as duas
   "ATENÇÃO BÁSICA", e 002.009.267 e 002.009.269 são as duas "CRAS/CREAS" — e a
   Contabilidade faz cada ação de uma vez, o agente político junto dos efetivos
   e contratados dela. Daí o grupo ser o nome, não o código.
   O sufixo numérico sai fora: "ATENÇÃO BÁSICA 159" é a mesma ação. */
const nomeAcao=registro=>{
 const caminho=registro?.caminho||[];
 const bruto=ultimoNivelEhVinculo(registro)?caminho.slice(-2)[0]:caminho.slice(-1)[0];
 return normalizar(bruto||'').replace(/[^A-Z0-9]+/g,' ').replace(/\s+\d+\s*$/,'').trim();
};

/**
 * Grupo de um empenho: a ação dentro da secretaria.
 *
 * A chave leva a secretaria junto, para duas secretarias com ação de nome
 * parecido não se misturarem. Sem nome de ação no caminho, cai para a lotação
 * sem o nível do vínculo — que é o que dava antes.
 */
export function grupoDaLotacao(registro={}){
 const partes=String(registro.lotacao||'').split('.');
 const secretaria=partes.slice(0,2).join('.');
 const acao=nomeAcao(registro);
 if(secretaria&&acao)return secretaria+'|'+acao;
 if(partes.length>1&&ultimoNivelEhVinculo(registro))partes.pop();
 return partes.join('.');
}

/* Sequência de grupos de 2026, recuperada da planilha de outubro da
   Contabilidade e conferida contra ela: os 35 grupos que deu para casar saem
   na mesma ordem, sem nenhum fora de lugar, e o rank do vínculo bate nos 36.
   Serve como ponto de partida para a competência não começar do zero; as setas
   da tela mudam o que precisar, e a ordem salva tem precedência.
   Em 2027 as ações mudam, e aí a Contabilidade reordena uma vez. */
export const ORDEM_GRUPOS_2026=[
 '002.001|MANUT DO GAB E SECRET DE GOVERNO',
 '002.001|MANUT DO CONTROLE INTERNO',
 '002.002|MANUT SECRET DE ADMINISTRACAO',
 '002.002|MANUT SERV RH COMPRAS LICITA E PATRI',
 '002.002|PAGAMENTO DE INATIVOS E PENSIONISTAS',
 '002.008|MANUT ATIV SECRET CULTURA E TURISMO',
 '002.003|MANUT DA SECRET DA FAZEDA',
 '002.011|MANUT DA SECRETARIA DE ESPORTE E LAZER',
 '002.013|SECRETARIA MUNIC DE TRANSPORTES',
 '002.014|SECRETARIA MUNIC DE AGRICULTURA',
 '002.012|MAUTENCAO SECRETARIA DE OBRAS PUBLICAS',
 '002.006|MANUT SECRET MUNIC OBRAS SERV URBAN',
 '002.012|MANUT VIAS PRACAS JARDINS E CEMITERIOS',
 '002.015|MANUTENCAO SEC MEIO AMBIENTE',
 '002.016|SECRETARIA MUNIC DE LIMPEZA URBANA',
 '002.004|MANUT SECRETARIA DE EDUCACAO',
 '002.004|MANUTENCAO CRECHE',
 '002.004|MANUT ENSINO FUNDAMENTAL',
 '002.004|MANUTENCAO ENSINO INFANTIL',
 '002.004|MANUTENCAO ENSINO FUNDAMENTAL',
 '002.004|MANUT TRANSPORTE ESCOLAR',
 '002.005|MANUTENCAO ATENCAO BASICA',
 '002.005|MANUTENCAO ACOES VIGILANCIA EM SAUDE',
 '002.005|MANUTENCAO FARMACIA',
 '002.005|MANUTENCAO ACOES VIGILANCIA SANITARIA',
 '002.005|GESTAO SAUDE MEDIA COMPLEXIDADE',
 '002.005|MANUT SECRETARIA MUNIC DE SAUDE',
 '002.005|MANUT ATIV HOSPITAL MUNICIPAL',
 '002.004|MANUTENCAO DO ENSINO TEMPO INTEGRAL',
 '002.009|MANUTENCAO DA SEC DE ACAO SOCIAL',
 '002.009|MANUTENCAO DO CONSELHO TUTELAR',
 '002.009|MANUTENCAO DO CRAS CREAS',
 '002.009|MANUT PROGRAMA IGD PBF SUAS',
 '002.009|PROCAD SUAS',
 '002.009|MANUTENCAO DO PROGRAMA PRIMEIRA INFANCIA',
 '002.009|MANUT ATIV COORDENACAO DEFESA CIVIL'
];

/**
 * Ordena os empenhos como a Contabilidade os faz.
 *
 * `ordemGrupos` é a sequência de grupos que ela fixou. Grupo que não está lá
 * entra depois dos conhecidos, na ordem em que o resumo o trouxe — assim uma
 * secretaria nova aparece no fim em vez de se perder no meio.
 *
 * Dentro do grupo manda o rank do vínculo; empatados, a lotação, para o
 * resultado não depender da ordem de leitura do PDF.
 *
 * Não mexe no que recebeu: devolve uma lista nova.
 */
export function ordenarEmpenhos(registros=[], ordemGrupos=[]){
 const lista=Array.isArray(registros)?[...registros]:[];
 const posicao=new Map((ordemGrupos||[]).map((g,i)=>[g,i]));
 const novos=[];
 for(const r of lista){
  const g=grupoDaLotacao(r);
  if(!posicao.has(g)&&!novos.includes(g))novos.push(g);
 }
 novos.forEach((g,i)=>posicao.set(g,(ordemGrupos||[]).length+i));
 return lista
  .map((r,i)=>({r,i,g:posicao.get(grupoDaLotacao(r)),v:rankVinculo(r)}))
  .sort((a,b)=>a.g-b.g||a.v-b.v||String(a.r.lotacao||'').localeCompare(String(b.r.lotacao||''))||a.i-b.i)
  .map(x=>x.r);
}

/** Sequência de grupos de uma lista já ordenada, para guardar a ordem. */
export function gruposEmOrdem(registros=[]){
 const vistos=[];
 for(const r of registros||[]){
  const g=grupoDaLotacao(r);
  if(g&&!vistos.includes(g))vistos.push(g);
 }
 return vistos;
}

/**
 * Move um grupo na ordem, para a Contabilidade acertar a sequência uma vez.
 * `passo` é -1 para subir e 1 para descer; posição fora da lista não faz nada.
 */
export function moverGrupo(ordem=[], grupo='', passo=0){
 const lista=[...(ordem||[])];
 const de=lista.indexOf(grupo);
 const para=de+passo;
 if(de<0||para<0||para>=lista.length)return lista;
 lista.splice(para,0,lista.splice(de,1)[0]);
 return lista;
}

/* A lista abaixo é a transcrição literal da aba OUTUBRO/2026, lotação por
   lotação, e veio da main. Ela não ordena mais a tela — `ordenarEmpenhos`
   acima deriva a ordem da ação e do vínculo, e por isso aguenta lotação nova,
   que em novembro apareceu. Fica porque `ordemDasLotacoes` ainda é o caminho
   da coluna Ordem do mapa CSV, onde a Contabilidade sobrepõe a posição à mão. */
// a Contabilidade pode mudar a posição pela coluna Ordem do mapa CSV.
export const ORDEM_FOLHA_MENSAL = [
  "002.001.201", "002.001.201.00005", "002.001.201.00003", "002.001.203.00006", "002.002.204.00004",
  "002.002.204.00002", "002.002.205.00003", "002.002.205.00001", "002.002.209.00001", "002.002.209.00002",
  "002.008.297.00003", "002.003.212.00004", "002.003.212.00003", "002.003.212.00002", "002.011.289.00004",
  "002.011.289.00003", "002.011.289.00001", "002.013.004", "002.013.003", "002.013.002",
  "002.013.001", "002.014.004", "002.014.003", "002.012.297.00004", "002.012.297.00003",
  "002.006.252.00001", "002.012.296.00001", "002.012.296.00002", "002.015.296.00004", "002.015.296.00003",
  "002.016.004", "002.016.003", "002.016.002", "002.016.001", "002.004.214.00004",
  "002.004.214.00001", "002.004.215.00003", "002.004.215.00001", "002.004.217.00006", "002.004.217.00002",
  "002.004.217.00001", "002.004.219.00004", "002.004.221.00003", "002.004.221.00004", "002.004.221.00006",
  "002.004.221.00001", "002.004.223.00002", "002.005.236.00004", "002.005.235.00019", "002.005.235.00007",
  "002.005.235.00002", "002.005.235.00001", "002.005.235.00008", "002.005.235.00020", "002.005.235.00012",
  "002.005.247.00004", "002.005.247.00002", "002.005.247.00005", "002.005.282.00002", "002.005.282.00006",
  "002.005.286.00002", "002.005.286.00001", "002.005.232.00001", "002.005.232.00002", "002.005.251.00003",
  "002.005.250.00003", "002.005.250.00002", "002.005.250.00001", "002.004.223.00001", "002.004.230.00003",
  "002.004.230.00002", "002.004.230.00001", "002.009.266.00004", "002.009.266.00003", "002.009.266.00001",
  "002.009.269.00003", "002.009.268.00004", "002.009.266", "002.009.289.00003", "002.009.267.00008",
  "002.009.267.00005", "002.009.267.00002", "002.009.267.00001", "002.009.267.00004", "002.009.267.00007",
  "002.009.267.00009", "002.009.288.00002", "002.009.288.00001", "002.009.290.00003", "002.009.290.00001",
  "002.009.129.00001", "002.009.129.00004"
];

/** Posição de cada lotação: a do mapa (coluna Ordem do CSV) manda; senão, a padrão. */
export function ordemDasLotacoes(mapa = {}) {
  const ordem = {};
  ORDEM_FOLHA_MENSAL.forEach((lot, i) => { ordem['principal|' + lot] = (i + 1) * 10; ordem['extra|' + lot] = (i + 1) * 10; });
  for (const [id, m] of Object.entries(mapa)) {
    const o = Number(m?.ordem);
    if (m?.ordem !== '' && m?.ordem != null && Number.isFinite(o)) ordem[id] = o;
  }
  return ordem;
}
