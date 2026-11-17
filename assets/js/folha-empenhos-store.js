// Armazena APENAS registros extraídos e mapeamentos no IndexedDB local, nunca os PDFs.
// Cada conta do SISDIFI tem dados isolados por UID neste navegador.
const NOME='sisdifi-folha-empenhos',VERSAO=1;
function abrir(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(NOME,VERSAO);
    r.onupgradeneeded=()=>r.result.createObjectStore('registros',{keyPath:'id'});
    r.onerror=()=>reject(r.error);
    r.onblocked=()=>reject(Error('Feche outras abas do SISDIFI para acessar o histórico da folha.'));
    r.onsuccess=()=>resolve(r.result);
  });
}
export async function carregarRegistroFolha(uid,chave){
  if(!uid||!chave)throw Error('Conta e competência obrigatórias.');
  const id=JSON.stringify([uid,chave]),db=await abrir();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('registros','readonly'),q=tx.objectStore('registros').get(id);
    tx.oncomplete=()=>{db.close();resolve(q.result?.dados||null)};
    tx.onerror=()=>{db.close();reject(tx.error)};
  });
}
export async function salvarRegistroFolha(uid,chave,dados){
  if(!uid||!chave)throw Error('Conta e competência obrigatórias.');
  const id=JSON.stringify([uid,chave]),db=await abrir();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('registros','readwrite');
    tx.objectStore('registros').put({id,dados,atualizadoEm:new Date().toISOString()});
    tx.oncomplete=()=>{db.close();resolve(true)};
    tx.onerror=()=>{db.close();reject(tx.error)};
  });
}
/**
 * Apaga um registro. Usado para limpar a competência quando os arquivos
 * entraram errados: sem isso o mês fica com dados de um envio anterior
 * misturados com os do novo, e a conferência passa a mentir.
 */
export async function apagarRegistroFolha(uid,chave){
  if(!uid||!chave)throw Error('Conta e competência obrigatórias.');
  const id=JSON.stringify([uid,chave]),db=await abrir();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('registros','readwrite');
    tx.objectStore('registros').delete(id);
    tx.oncomplete=()=>{db.close();resolve(true)};
    tx.onerror=()=>{db.close();reject(tx.error)};
  });
}
/** Competências com registro guardado nesta conta, da mais recente para a mais antiga. */
export async function competenciasGuardadas(uid){
  if(!uid)return [];
  const db=await abrir();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('registros','readonly'),q=tx.objectStore('registros').getAllKeys();
    tx.oncomplete=()=>{
      db.close();
      const chaves=(q.result||[]).map(id=>{try{return JSON.parse(id)}catch{return null}})
        .filter(x=>Array.isArray(x)&&x[0]===uid).map(x=>x[1])
        .filter(c=>/^\d{4}-\d{2}$/.test(c));
      resolve([...new Set(chaves)].sort().reverse());
    };
    tx.onerror=()=>{db.close();reject(tx.error)};
  });
}
