import { DESTINOS, centavos } from './minuta-pdf.js';
export const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
export const competenciaValida = s => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export function rotuloCompetencia(s) { return competenciaValida(s) ? `${MESES[Number(s.slice(5))-1]} de ${s.slice(0,4)}` : ''; }
export function valorEsperado(s) {
  const t = String(s).trim();
  if (!t) return null;
  const n = centavos(/^\d+$/.test(t) ? t+',00' : t);
  if (n < 0) throw Error('O total esperado não pode ser negativo.');
  return n;
}
// A competência é declarada pelo usuário; a arrecadação pode ocorrer em outro mês/ano.
export function vincularFolha(resultado, competencia) {
  if (!competenciaValida(competencia)) throw Error('Selecione uma competência válida para a folha.');
  return { ...resultado, competenciaFolha: competencia };
}
// Investigação por documento completo: um mesmo empenho pode ter várias fontes.
export function documentosParaConferencia(registros) {
  const mapa = new Map();
  for (const r of registros) {
    const chave = [r.arquivo || '', r.data || '', r.tipo || '', r.numero || ''].join('|');
    if (!mapa.has(chave)) mapa.set(chave, { ...r, centavos: 0, fontes: [], paginas: [] });
    const doc = mapa.get(chave);
    doc.centavos += r.centavos;
    if (r.fonteCompleta && !doc.fontes.includes(r.fonteCompleta)) doc.fontes.push(r.fonteCompleta);
    if (r.pagina && !doc.paginas.includes(r.pagina)) doc.paginas.push(r.pagina);
  }
  return [...mapa.values()].filter(r => r.centavos > 0);
}
// Somente hipóteses matematicamente compatíveis: até três documentos inteiros.
export function buscarDocumentosDaDiferenca(registros, diferenca, limite = 5) {
  if (!Number.isSafeInteger(diferenca) || diferenca <= 0) return [];
  const pool = documentosParaConferencia(registros)
    .filter(d => d.centavos <= diferenca)
    .sort((a, b) => Math.abs(diferenca - a.centavos) - Math.abs(diferenca - b.centavos))
    .slice(0, 240);
  const combinacoes = [], vistos = new Set();
  function adicionar(indices) {
    const chave = [...indices].sort((a, b) => a - b).join(',');
    if (vistos.has(chave)) return;
    vistos.add(chave);
    combinacoes.push(indices.map(i => pool[i]));
  }
  for (let i = 0; i < pool.length && combinacoes.length < limite; i++)
    if (pool[i].centavos === diferenca) adicionar([i]);
  for (let i = 0; i < pool.length && combinacoes.length < limite; i++)
    for (let j = i + 1; j < pool.length && combinacoes.length < limite; j++)
      if (pool[i].centavos + pool[j].centavos === diferenca) adicionar([i, j]);
  if (combinacoes.length < limite) {
    const indicesPorValor = new Map();
    for (let i = 0; i < pool.length; i++) {
      const v = pool[i].centavos;
      if (!indicesPorValor.has(v)) indicesPorValor.set(v, []);
      indicesPorValor.get(v).push(i);
    }
    for (let i = 0; i < pool.length && combinacoes.length < limite; i++)
      for (let j = i + 1; j < pool.length && combinacoes.length < limite; j++) {
        const falta = diferenca - pool[i].centavos - pool[j].centavos;
        if (falta <= 0) continue;
        for (const k of indicesPorValor.get(falta) || []) {
          if (k <= j) continue;
          adicionar([i, j, k]);
          if (combinacoes.length >= limite) break;
        }
      }
  }
  return combinacoes;
}
export function conferenciaMensal(arquivos, esperados = {}) {
  const registros = arquivos.flatMap(a => a.resultado.registros.map(r => ({...r, arquivo:a.nome})));
  const blocos = DESTINOS.map(destino => {
    const rs = registros.filter(r=>r.destino===destino), total = rs.reduce((s,r)=>s+r.centavos,0);
    const esperado = Number.isSafeInteger(esperados[destino]) ? esperados[destino] : null;
    return { destino, registros:rs, arquivos:arquivos.filter(a=>a.resultado.registros.some(r=>r.destino===destino)).length, total, esperado, diferenca:esperado === null ? null : total-esperado };
  });
  const trocas = [], investigacoes = [];
  for (const falta of blocos.filter(b => b.diferenca < 0))
    for (const sobra of blocos.filter(b => b.diferenca > 0)) {
      const exata = falta.diferenca + sobra.diferenca === 0;
      const valor = Math.min(-falta.diferenca, sobra.diferenca);
      const combinacoes = buscarDocumentosDaDiferenca(sobra.registros, valor);
      const proximos = combinacoes.length ? [] : documentosParaConferencia(sobra.registros)
        .filter(r => r.centavos > 0)
        .sort((a, b) => Math.abs(a.centavos - valor) - Math.abs(b.centavos - valor))
        .slice(0, 3);
      if (exata) trocas.push({ falta:falta.destino, sobra:sobra.destino, valor,
        candidatos:combinacoes.filter(c => c.length === 1).map(c => c[0]), combinacoes });
      investigacoes.push({ falta:falta.destino, sobra:sobra.destino, valor, exata, combinacoes, proximos });
    }
  const conhecidos = blocos.reduce((s,b)=>s+b.total,0), completo = blocos.every(b=>b.esperado !== null);
  const naoClassificados = registros.filter(r=>!DESTINOS.includes(r.destino));
  return {blocos,trocas,investigacoes,naoClassificados,total:conhecidos, esperado:completo?blocos.reduce((s,b)=>s+b.esperado,0):null,
    diferenca:completo?blocos.reduce((s,b)=>s+b.diferenca,0):null,
    conferido:completo && blocos.every(b=>b.arquivos>0 && b.diferenca===0) && !naoClassificados.length && !arquivos.some(a=>a.resultado.avisos.length)};
}
// Histórico local separado por usuário e competência. PDFs ficam no IndexedDB, nunca no repositório.
function abrir() {
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('sisdifi-consignacoes',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('meses',{keyPath:'id'});
    req.onerror=()=>reject(req.error); req.onblocked=()=>reject(Error('Feche outra aba antiga do SISDIFI e tente novamente.'));
    req.onsuccess=()=>resolve(req.result);
  });
}
function chave(uid,competencia) {
  if(!uid || !competenciaValida(competencia)) throw Error('Usuário ou competência inválida.');
  return JSON.stringify([uid,competencia]);
}
export async function carregarMes(uid,competencia) {
  const id=chave(uid,competencia), db=await abrir();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('meses','readonly'), req=tx.objectStore('meses').get(id);
    tx.oncomplete=()=>{db.close();resolve(req.result || {id,arquivos:[],esperados:{},revisao:0});};
    tx.onabort=()=>{db.close();reject(tx.error || Error('Não foi possível carregar o mês.'));};
  });
}
export async function salvarMes(uid,competencia,dados) {
  const id=chave(uid,competencia),db=await abrir();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('meses','readwrite'),store=tx.objectStore('meses'),req=store.get(id);let conflito=false;
    req.onsuccess=()=>{
      if((req.result?.revisao||0)!==(dados.revisao||0)){conflito=true;tx.abort();return;}
      store.put({...dados,id,revisao:(dados.revisao||0)+1,atualizadoEm:new Date().toISOString()});
    };
    tx.oncomplete=()=>{db.close();resolve((dados.revisao||0)+1);};
    tx.onabort=()=>{db.close();reject(Error(conflito?'Este mês mudou em outra aba. Reabra a tela antes de continuar.':'Não foi possível salvar neste navegador. Verifique o espaço disponível e tente novamente.'));};
  });
}
