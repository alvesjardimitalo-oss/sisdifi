// Referência de fichas de pessoal da LOA 2026 de Frei Inocêncio.
// Origem: catálogo do orçamento de 2026 fornecido à Contabilidade. Não representa saldo disponível.
// Código da lotação do RH é independente da ação do orçamento: nunca inferir um do outro.
const grupos=[
 ['38/04,39/11','GABINETE DO PREFEITO','MANUT. GABINETE E SECRETARIA DE GOVERNO','500'],
 ['47/11','GABINETE DO PREFEITO','MANUTENÇÃO CONTROLE INTERNO','500'],
 ['55/04,56/11','SECRETARIA MUNICIPAL DE ADMINISTRACAO','MANUTENÇÃO SECRETARIA ADMNISTRAÇÃO','500'],
 ['64/04,65/11','SECRETARIA MUNICIPAL DE ADMINISTRACAO','MANUT SERV RH/COMPRAS/LICIT.E PATRIMONIO','500'],
 ['71/11','SECRETARIA MUNICIPAL DE ADMINISTRACAO','MANUT DEPART DE PLANEJAMENTOS E PROJETOS','500'],
 ['75/11','SECRETARIA MUNICIPAL DE ADMINISTRACAO','MANUT. DEPART. DESENVOLVIMENTO ECONOMICO','500'],
 ['90/04,91/11','SECRETARIA MUNICIPAL DA FAZENDA','MANUTENÇÃO SECRETARIA DA FAZENDA','500'],
 ['107/04,108/11','SECRETARIA MUNICIPAL DE EDUCACAO','MANUT. SECRETARIA MUNICIPAL DE EDUCAÇÃO','500'],
 ['124/04,125/11','FUNDO MUNICIPAL EDUCACAO','MANUTENÇÃO ENSINO FUNDAMENTAL REC PROPIO','500'],
 ['143/04,144/11','FUNDO MUNICIPAL EDUCACAO','MANUETENÇÃO ENSINO INFANTIL - CRECHE','500'],
 ['148/04,149/11','FUNDO MUNICIPAL EDUCACAO','MANUETENÇÃO ENSINO INFANTIL - PRE ESCOLA','500'],
 ['158/04,159/11','FUNDO MUNICIPAL EDUCACAO','MANUT ENS. JOVENS E ADULTOS - REC PROPIO','500'],
 ['163/04,164/11','FUNDO MUNICIPAL EDUCACAO','MANUTENÇÃO ENSINO ESPECIAL - REC PROPIO','500'],
 ['173/04,174/11','FUNDEB','MANUTENÇÃO ENSINO FUNDAMENTAL FUNDEB','540,542'],
 ['179/04,180/11','FUNDEB','MANUTENÇÃO TRANSPORTE ESCOLAR','540'],
 ['186/04,187/11','FUNDEB','MANUT ENSINO INFANTIL CRECHE - FUNDEB','540,542'],
 ['191/04,192/11','FUNDEB','MANUT ENSI INFANT PRE ESCOLA - FUNDEB','540,542'],
 ['198/04,199/11','FUNDEB','MANUTENÇÃO EDUCAÇÃO JOVENS E ADULTOS','540'],
 ['205/04,206/11','SECRETARIA MUNICIPAL DE SAUDE','MANUTENÇÃO SECRETARIA DE SAUDE','500'],
 ['226/04','FUNDO MUNICIPAL DE SAUDE','MANUTENÇÃO ATENÇÃO BASICA','500,600,604,605,621'],
 ['227/11','FUNDO MUNICIPAL DE SAUDE','MANUTENÇÃO ATENÇÃO BASICA','500,600,605,621'],
 ['234/04,235/11','FUNDO MUNICIPAL DE SAUDE','MANUTENÇÃO FARMACIA','500,600,621'],
 ['239/04','FUNDO MUNICIPAL DE SAUDE','GESTÃO SAUDE MEDIA COMPLEXIDADE','500,600,605'],
 ['240/11','FUNDO MUNICIPAL DE SAUDE','GESTÃO SAUDE MEDIA COMPLEXIDADE','500,600'],
 ['248/04','FUNDO MUNICIPAL DE SAUDE','MANUTENÇÃO AÇÕES VIGILANCIA SANITARIA','500,600'],
 ['249/11','FUNDO MUNICIPAL DE SAUDE','MANUTENÇÃO AÇÕES VIGILANCIA SANITARIA','500,600,621'],
 ['255/04,256/11','FUNDO MUNICIPAL DE SAUDE','MANUTENÇÃO AÇÕES VIGILANCIA SAUDE','500,600,604'],
 ['266/04,267/11','HOSPITAL MUNICIPAL SAO GERALDO','MANUTENÇÃO ATIVIDADES HOSPITAL MUNICIPAL','500,600,605'],
 ['276/04,277/11','SECRETARIA DE TURISMO E CULTURA','MANUT. ATIVID. SECRET. CULTURA E TURISMO','500'],
 ['299/04,300/11','SECRETARIA MUNICIPAL DE ACAO SOCIAL','MANUT. ATIVIDADES SECRETARIA AÇÃO SOCIAL','500'],
 ['306/04,307/11','SECRETARIA MUNICIPAL DE ACAO SOCIAL','MANUT. ATIVIDADES COORDEN DEFESA CIVIL','500'],
 ['311/11','SECRETARIA MUNICIPAL DE ACAO SOCIAL','MANUTENÇÃO CONSELHO TUTELAR','500'],
 ['327/04,328/11','FUNDO MUNICIPAL DE ASSISTENCIA SOCIAL','MANUT PROGRAMA PRIMEIRA INFANCIA/SUAS','500,660'],
 ['341/04,342/11','FUNDO MUNICIPAL DE ASSISTENCIA SOCIAL','SERVIÇOS CONVIVENCIA E FORTALEC. VINCULO','660'],
 ['346/04,347/11','FUNDO MUNICIPAL DE ASSISTENCIA SOCIAL','MANUTENÇÃO ATIVIDADES CRAS/CREAS/PAIF','500,660'],
 ['352/04','FUNDO MUNICIPAL DE ASSISTENCIA SOCIAL','MANUTENÇÃO PROGRAMAS IGD/PBF/SUAS','500,660'],
 ['361/04,362/11','SECRETARIA DE ESPORTE E LAZER','MANUT. ATIVIDADES SECRET. ESPORTE/LAZER','500'],
 ['384/04,385/11','SECRETARIA OBRAS PUBLICAS','MANUTENÇÃO SECRETARIA OBRAS PUBLICAS','500'],
 ['398/04,399/11','SECRETARIA OBRAS PUBLICAS','MANUT VIAS/PRAÇAS/JARDINS E CEMITERIO','500'],
 ['416/04,417/11','SECRETARIA MUNICIPAL TRANSPORTE','MANUTENÇÃO SECRETARIA TRANSPORTE','500'],
 ['431/04,432/11','SECRETARIA MUNICIPAL DE AGRICULTURA','MANUTENÇÃO SECRETARIA AGRICULTURA','500'],
 ['446/04,447/11','SECRETARIA MUNICIPAL DE MEIO AMBIENTE','MANUT SEC MEIO AMBIENTE','500'],
 ['467/04,468/11','SECRETARIA MUNICIPAL DE LIMPEZA URBANA','MANUT SECRET DE LIMPEZA URBANA','500'],
 ['474/04,475/11','SECRETARIA MUNICIPAL DE LIMPEZA URBANA','MANUTENÇÃO/LIMPEZA VIAS E LOGRADOUROS','500']
];
const normalizar=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const fontePadrao=f=>'1.'+String(f).padStart(3,'0')+'.000.0000';
export const FICHAS_PESSOAL_2026=grupos.flatMap(([pares,unidade,acao,fontes])=>
 pares.split(',').map(par=>{
   const [ficha,elemento]=par.split('/');
   return {ficha,ano:2026,unidade,acao,natureza:'3.1.90.'+elemento+'.00',fontes:fontes.split(',').map(fontePadrao),origem:'LOA 2026 (catálogo de referência)'};
 }));
// Usa a LOA cadastrada no SISDIFI primeiro; quando não houver registro, usa a referência
// de pessoal para 2026. Fonte jamais é presumida se a ficha admitir várias.
export function consultarFichaOrcamento(numero,ano,cadastradas=[],secretarias=[]){
 const ficha=String(numero??'').trim(),exercicio=Number(ano);
 if(!ficha)return null;
 const arr=(cadastradas||[]).filter(f=>f.ativo!==false&&String(f.ficha??'').trim()===ficha&&
   (f.ano==null||f.ano===''||Number(f.ano)===exercicio));
 const fontesUnicas=xs=>[...new Set(xs.map(v=>String(v||'').trim()).filter(Boolean))];
 if(arr.length){
   const mapa=arr.map(f=>{
     const sec=secretarias.find(s=>String(s.id)===String(f.secretaria_id));
     const a=String(f.acao_nome||f.acao||'').split(' — ').at(-1).trim();
     return {unidade:sec?.nome||f.unidade||'',acao:a,natureza:f.elemento||f.natureza||'',fonte:String(f.fonte_codigo||f.fonte||'').trim()};
   });
   const unicas=fontesUnicas(mapa.map(x=>x.unidade));
   const acoes=fontesUnicas(mapa.map(x=>x.acao));
   return {ficha,unidade:unicas.length===1?unicas[0]:'',acao:acoes.length===1?acoes[0]:'',fontes:fontesUnicas(mapa.map(x=>x.fonte)),naturezas:fontesUnicas(mapa.map(x=>x.natureza)),ambiguo:unicas.length!==1||acoes.length!==1,origem:'Orçamento cadastrado no SISDIFI'};
 }
 if(exercicio!==2026)return null;
 const c=FICHAS_PESSOAL_2026.find(x=>x.ficha===ficha);
 return c?{ficha,unidade:c.unidade,acao:c.acao,fontes:c.fontes,naturezas:[c.natureza],ambiguo:false,origem:c.origem}:null;
}
export function alertaNaturezaFicha(vinculo,naturezas=[]){
 const t=normalizar(vinculo),n=naturezas.map(normalizar);
 if(!n.length)return '';
 const e04=n.some(x=>x.includes('3.1.90.04')),e11=n.some(x=>x.includes('3.1.90.11'));
 if(/CONTRATAD|TEMPORAR/.test(t)&&e11&&!e04)return 'Ficha de vencimentos (3.1.90.11) em vínculo contratado: confira a classificação.';
 if(/EFETIV|COMISSIONAD|AGENTE POLITIC/.test(t)&&e04&&!e11)return 'Ficha de contratação temporária (3.1.90.04) em vínculo não temporário: confira a classificação.';
 return '';
}
