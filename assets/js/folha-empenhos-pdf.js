// Leitor client-side para resumo de verbas e folha individual do RH.
// Os arquivos permanecem no navegador; nenhum PDF é enviado ao servidor.
let biblioteca;
export async function extrairLinhasDaFolha(dados){
  biblioteca ||= import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs').catch(e=>{biblioteca=null;throw e;});
  const lib=await biblioteca;
  lib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
  const task=lib.getDocument({data:new Uint8Array(dados),isEvalSupported:false});
  try{
    const pdf=await task.promise, linhas=[];
    if(pdf.numPages>1600)throw Error('PDF excede 1.600 páginas; divida em duas partes para manter o navegador estável.');
    for(let pagina=1;pagina<=pdf.numPages;pagina++){
      const p=await pdf.getPage(pagina),conteudo=await p.getTextContent(),agrupadas=[];
      const [a,b,c,d,e,f]=p.getViewport({scale:1}).transform;
      for(const item of conteudo.items){
        if(!item.str?.trim())continue;
        const x=a*item.transform[4]+c*item.transform[5]+e;
        const y=b*item.transform[4]+d*item.transform[5]+f;
        let g=agrupadas.find(g=>Math.abs(g.y-y)<0.9);
        if(!g)agrupadas.push(g={y,itens:[]});
        g.itens.push({x,texto:item.str});
      }
      for(const g of agrupadas.sort((a,b)=>a.y-b.y))
        linhas.push({pagina,texto:g.itens.sort((a,b)=>a.x-b.x).map(it=>it.texto).join(' ').replace(/\s+/g,' ').trim()});
      p.cleanup();
    }
    return linhas;
  }finally{await task.destroy();}
}
