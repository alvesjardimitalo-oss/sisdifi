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

export function fonteCompativel(informada,permitidas=[]){
 const prefixo=x=>{
   let s=String(x||'').replace(/\D/g,'');
   if(s.length===3)s='1'+s;
   return s.slice(0,4);
 };
 const p=prefixo(informada);
 return !!p&&permitidas.some(f=>prefixo(f)===p);
}

/**
 * Classificação de pessoal conforme o elemento da despesa da LOA.
 * Os textos são exibidos como apoio; a ficha e a fonte do orçamento
 * continuam determinantes, não o nome do vínculo isoladamente.
 */
export function classificacaoPessoal(naturezas=[]){
 const codigo=s=>normalizar(s).replace(/\s/g,'');
 const entradas=[...new Set((naturezas||[]).map(codigo))];
 const contratado=entradas.some(x=>/3\.1\.90\.04|CONTRATA[CÇ][AÃ]O(?:POR)?TEMPODETERMINADO/.test(x));
 const vencimentos=entradas.some(x=>/3\.1\.90\.11|VENCIMENTOSEVANT/.test(x));
 if(contratado&&vencimentos)return {codigo:'',titulo:'Classificação a conferir',conflito:true};
 if(contratado)return {codigo:'3.1.90.04.00',titulo:'Pessoal Contratado — Contratação por Tempo Determinado',conflito:false};
 if(vencimentos)return {codigo:'3.1.90.11.00',titulo:'Vencimentos e Vantagens Fixas — Pessoal Civil',conflito:false};
 return {codigo:'',titulo:'Não identificada na ficha',conflito:false};
}

/* =====================================================================
   Sugestão da ficha a partir da lotação do RH
   =====================================================================
   A ficha de pessoal é sempre um par na mesma ação: 3.1.90.04 para
   contratado por tempo determinado e 3.1.90.11 para os demais vínculos.
   Quem diz o vínculo é o último nível da lotação ("PESSOAL CONTRATADO",
   "EFETIVOS", "COMISSIONADOS", "AGENTE POLITICO"), e quem diz a ação é o
   nível acima dele, que o resumo imprime por extenso.

   O código da lotação do RH não corresponde ao da ação do orçamento, então
   o casamento é pelo NOME. Daí a sugestão vir sempre com um grau de
   confiança: ela é um ponto de partida para a Contabilidade conferir e
   trocar conforme o saldo, nunca uma decisão automática.

   Medido contra outubro/2026: 75 das 86 lotações com ficha conhecida. */

/** Educação: regra confirmada pela Contabilidade, pelo 3º nível da lotação. */
export const EDUCACAO_2026={
 '002.004.214':{'04':'107','11':'108',fonte:'1.500.000.0000',desdobramento:'0000',nome:'Secretaria de Educação'},
 '002.004.215':{'04':'186','11':'187',fonte:'1.540.000.0000',desdobramento:'1071',nome:'Creche 70%'},
 '002.004.217':{'04':'173','11':'174',fonte:'1.540.000.0000',desdobramento:'1071',nome:'Ensino Fundamental 70%'},
 '002.004.219':{'04':'191','11':'192',fonte:'1.540.000.0000',desdobramento:'1071',nome:'Ensino Infantil 70%'},
 '002.004.221':{'04':'173','11':'174',fonte:'1.540.000.0000',desdobramento:'0000',nome:'Ensino Fundamental 30%'},
 '002.004.223':{'04':'179','11':'180',fonte:'1.540.000.0000',desdobramento:'0000',nome:'Transporte Escolar'},
 '002.004.230':{'04':'173','11':'174',fonte:'1.540.000.0000',desdobramento:'1073',nome:'Ensino Tempo Integral'}
};
const SEM_PESO=new Set(['DE','DA','DO','DAS','DOS','E','MANUT','MANUTENCAO','MANUETENCAO',
 'ATIV','ATIVIDADES','ATIVID','SECRET','SECRETARIA','MUNICIPAL','MUNIC','PREF']);
/* Tira o plural: o resumo escreve "TRANSPORTES" e "OBRAS" onde o orçamento
   escreve "TRANSPORTE" e "OBRA". Sem isso, quatro lotações de Transportes
   casavam com o Gabinete. */
const raiz=t=>t.length>3&&t.endsWith('S')?t.slice(0,-1):t;
const palavras=s=>normalizar(s).replace(/[^A-Z0-9%]+/g,' ').split(' ')
 .filter(t=>t&&!SEM_PESO.has(t)).map(raiz);
const parecenca=(a,b)=>{const A=new Set(palavras(a)),B=new Set(palavras(b));
 if(!A.size||!B.size)return 0;let i=0;for(const t of B)if(A.has(t))i++;
 return i/Math.max(A.size,B.size);};

/* Fichas fixas, conferidas na LOA 2026. Aposentadoria e pensão ficam na
   Secretaria de Administração, na ação MANUTENÇÃO INATIVOS E PENSIONISTAS;
   a bolsa de estágio é serviço de terceiros na secretaria onde o estagiário
   trabalha, e em 2026 é a 303 da Ação Social. Nenhuma das três é despesa de
   pessoal ativo, então não têm par 04/11 e ficam fora do casamento por nome. */
export const FICHAS_FIXAS_2026={
 aposentadoria:{ficha:'81',natureza:'3.1.90.01.00',fonte:'1.500.000.0000',
   nome:'Aposentadorias, reserva remunerada e reforma',unidade:'Secretaria Municipal de Administração'},
 pensao:{ficha:'82',natureza:'3.1.90.03.00',fonte:'1.500.000.0000',
   nome:'Pensões',unidade:'Secretaria Municipal de Administração'},
 estagio:{ficha:'303',natureza:'3.3.90.36.00',fonte:'',
   nome:'Bolsa de estágio (outros serviços de terceiros, pessoa física)',unidade:'Secretaria Municipal de Ação Social'}
};
/** Aposentadoria e pensão dividem a mesma ação: quem separa é o nível do vínculo. */
function fichaFixaDoVinculo(vinculo='',acao=''){
 for(const t of [vinculo,acao]){
  const n=normalizar(t);
  if(/PENS/.test(n))return FICHAS_FIXAS_2026.pensao;
  if(/APOSENT|INATIV/.test(n))return FICHAS_FIXAS_2026.aposentadoria;
 }
 return null;
}

/** Elemento pelo vínculo: contratado por tempo determinado ou os demais. */
export function elementoDoVinculo(texto=''){
 const n=normalizar(texto);
 if(/CONTRATAD|PESSOAS CONTRATADAS/.test(n))return '04';
 // Aposentadoria (3.1.90.01) e pensão (3.1.90.03) não são ficha de pessoal ativo.
 if(/APOSENT|INATIV|PENSOES|PENSIONISTA/.test(n))return '';
 return '11';
}

/**
 * Sugere ficha, fonte e desdobramento para uma lotação do resumo de verbas.
 * `registro` é o que analisarResumoVerbas devolve: precisa de `lotacao`,
 * `caminho` (unidade, ação e, quando existe, o vínculo) e `rubricas`.
 * Devolve sempre `confianca`, para a tela mostrar o que merece conferência:
 *   confirmada — regra fechada com a Contabilidade (educação)
 *   provavel   — um único candidato claramente à frente
 *   incerta    — casou mal ou houve empate: conferir antes de empenhar
 *   manual     — não é ficha de pessoal; a Contabilidade informa
 */
export function sugerirFichaDaLotacao(registro={}){
 const caminho=registro.caminho||[];
 const unidade=caminho[0]||'';
 const vinculo=caminho.length>=3?caminho[2]:'';
 // Sem o nível do vínculo, o nome que sobra é o da própria ação.
 const acao=caminho.length>=3?(caminho[1]||''):'';
 const elemento=elementoDoVinculo(vinculo||caminho[1]||registro.lotacao||'');
 const vazio={ficha:'',fonte:'',desdobramento:'',elemento,confianca:'manual',motivo:''};

 // Bolsa de estágio não é despesa de pessoal: vai em serviços de terceiros.
 const rubricas=registro.rubricas||[];
 if(rubricas.length&&rubricas.every(r=>r.codigo==='370')){
   const e=FICHAS_FIXAS_2026.estagio;
   return {...vazio,ficha:e.ficha,fonte:e.fonte,confianca:'confirmada',
     motivo:e.nome+': ficha fixa na LOA 2026, '+e.natureza+'. Conferir a fonte.'};
 }
 if(!elemento){
   const f=fichaFixaDoVinculo(vinculo,caminho[1]||'');
   if(f)return {...vazio,ficha:f.ficha,fonte:f.fonte,confianca:'confirmada',
     motivo:f.nome+': ficha fixa na LOA 2026, '+f.natureza+'.'};
   return {...vazio,motivo:'Aposentadoria ou pensão: ficha própria, fora do catálogo de pessoal.'};
 }

 const grupo=String(registro.lotacao||'').split('.').slice(0,3).join('.');
 const edu=EDUCACAO_2026[grupo];
 if(edu&&edu[elemento])
   return {ficha:edu[elemento],fonte:edu.fonte,desdobramento:edu.desdobramento,elemento,
     confianca:'confirmada',motivo:edu.nome+': regra confirmada pela Contabilidade.'};

 const candidatas=FICHAS_PESSOAL_2026.filter(f=>f.natureza==='3.1.90.'+elemento+'.00');
 const pontuadas=candidatas
   .map(f=>({f,p:acao?parecenca(f.acao,acao)*3+parecenca(f.unidade,unidade)*0.5:parecenca(f.unidade,unidade)*3}))
   .sort((a,b)=>b.p-a.p);
 const melhor=pontuadas[0];
 if(!melhor||melhor.p<0.8)
   return {...vazio,ficha:melhor?.f.ficha||'',confianca:'incerta',
     motivo:'Nenhuma ação do orçamento se parece com "'+(acao||unidade)+'".'};
 const folga=melhor.p-(pontuadas[1]?.p||0);
 const fonte=melhor.f.fontes.length===1?melhor.f.fontes[0]:'';
 return {ficha:melhor.f.ficha,fonte,desdobramento:'',elemento,
   confianca:folga>0.25?'provavel':'incerta',
   motivo:(folga>0.25?'':'Empate com outra ação. ')+'Ficha '+melhor.f.ficha+' — '+melhor.f.acao+
     (fonte?'':' (a ficha admite mais de uma fonte: informar).')};
}
