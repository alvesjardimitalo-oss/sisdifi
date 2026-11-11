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
