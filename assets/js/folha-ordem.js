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

/**
 * Grupo da lotação: ela sem o nível do vínculo.
 * Mantém o nível quando ele não é vínculo — é o caso da lotação do Prefeito,
 * cujo último nível é a ação.
 */
export function grupoDaLotacao(registro={}){
 const partes=String(registro.lotacao||'').split('.');
 if(partes.length>1&&ultimoNivelEhVinculo(registro))partes.pop();
 return partes.join('.');
}

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
