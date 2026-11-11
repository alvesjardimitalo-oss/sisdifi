// Gerador Excel XLSX offline (OpenXML + ZIP store), sem enviar a folha a nenhum servidor.
// Usa formulas para preservar bruto - desconto = líquido após edição dos lançamentos.
const xml=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const bytes=s=>new TextEncoder().encode(s);
const p16=(arr,n)=>{arr.push(n&255,(n>>>8)&255)};
const p32=(arr,n)=>{arr.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255)};
const crc32=buffer=>{
  let crc=0xffffffff;
  for(const b of buffer){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
};
export function criarZIP(arquivos){
  const parts=[],entries=[];let offset=0;
  for(const [nome,conteudo] of arquivos){
    const fileName=bytes(nome),data=typeof conteudo==='string'?bytes(conteudo):conteudo,crc=crc32(data),local=[];
    p32(local,0x04034b50);p16(local,20);p16(local,0);p16(local,0);p16(local,0);p16(local,0x21);
    p32(local,crc);p32(local,data.length);p32(local,data.length);p16(local,fileName.length);p16(local,0);
    const part=new Uint8Array([...local,...fileName,...data]);parts.push(part);
    entries.push({fileName,data,crc,offset});offset+=part.length;
  }
  const central=[];
  for(const r of entries){
    p32(central,0x02014b50);p16(central,20);p16(central,20);p16(central,0);p16(central,0);
    p16(central,0);p16(central,0x21);p32(central,r.crc);p32(central,r.data.length);p32(central,r.data.length);
    p16(central,r.fileName.length);p16(central,0);p16(central,0);p16(central,0);p16(central,0);
    p32(central,0);p32(central,r.offset);central.push(...r.fileName);
  }
  const final=[];
  p32(final,0x06054b50);p16(final,0);p16(final,0);p16(final,entries.length);p16(final,entries.length);
  p32(final,central.length);p32(final,offset);p16(final,0);
  return new Blob([...parts,new Uint8Array(central),new Uint8Array(final)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function letra(ind){
  let s='';for(let n=ind+1;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;
}
function celula(v,col,row,header=false){
  const ref=letra(col)+row;
  if(v==null||v==='')return '<c r="'+ref+'"/>';
  if(typeof v==='object'&&v.formula)return '<c r="'+ref+'" s="'+(v.moeda?2:0)+'"><f>'+xml(v.formula.replace(/^=/,''))+'</f><v>'+(Number(v.cache||0)/100).toFixed(2)+'</v></c>';
  if(typeof v==='object'&&v.centavos!=null)return '<c r="'+ref+'" s="2"><v>'+(v.centavos/100).toFixed(2)+'</v></c>';
  if(typeof v==='number'&&Number.isFinite(v))return '<c r="'+ref+'" s="0"><v>'+v+'</v></c>';
  return '<c r="'+ref+'" s="'+(header?1:0)+'" t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>';
}
function folhaXML(tabela){
  const [cab,...dados]=tabela,cols=cab.map((s,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+Math.max(12,Math.min(34,String(s).length+5))+'" customWidth="1"/>').join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
  '<cols>'+cols+'</cols><sheetData>'+
  tabela.map((linha,i)=>'<row r="'+(i+1)+'">'+linha.map((v,j)=>celula(v,j,i+1,i===0)).join('')+'</row>').join('')+
  '</sheetData><autoFilter ref="A1:'+letra(cab.length-1)+tabela.length+'"/></worksheet>';
}
export function gerarPlanilhaFolha(previsao,{competencia='',status='RASCUNHO',conciliacao=[],aprovouMapa=false}={}){
  // Primeira aba espelha as 14 colunas da última planilha municipal de junho,
  // sem copiar fichas/fontes de competências anteriores e sem inventar nº de OP.
  const modelo=[['Grupo de folha','Empenho','Secretaria','Ficha','Fonte de Recursos','Conta Bancária',
    'Valor Bruto','Desconto Liquidação','Nº OP Extra','Bruto Extraorçamentário',
    'Desconto Extraorçamentário','Outros Brutos','Outros Descontos','Valor Líquido Geral']];
  const nomeGrupo={principal:'FOLHA DE PAGAMENTO',extra:'EXTRA FOLHA · INCENTIVO FEDERAL',
    decimo:'ADIANTAMENTO DE 50% DO 13º SALÁRIO',rescisao:'RESCISÃO CONTRATUAL'};
  let grupoAnterior='';
  for(const r of previsao.empenhos){
    const linha=modelo.length+1;
    const opBruto=(r.familia||0)+(r.maternidade||0);
    const opInss=r.maisInssExtra||0;
    const cacheLiquido=(r.bruto||0)-(r.descontoAjustado||0)+opBruto-opInss;
    modelo.push([r.tipo!==grupoAnterior?nomeGrupo[r.tipo]:'',
      r.empenho,r.secretaria,r.ficha||'',r.fonte||'',r.conta||'',
      r.bruto==null?'':{centavos:r.bruto},
      r.descontoAjustado==null?'':{centavos:r.descontoAjustado},'',
      {centavos:opBruto},{centavos:opInss},
      '', '',{formula:'G'+linha+'-H'+linha+'+J'+linha+'-K'+linha+'+L'+linha+'-M'+linha,
        moeda:true,cache:cacheLiquido}]);
    grupoAnterior=r.tipo;
  }
  const emp=[['Empenho','Grupo','Secretaria','Vínculo','Lotação RH','Ficha','Fonte','Conta bancária','Bruto R$',
    'Caixa R$','Sicoob R$','Bradesco R$','Pensão R$','INSS R$','IRRF R$','Outros descontos R$',
    'Desconto total RH R$','Soma das rubricas R$','Diferença de descontos R$',
    'INSS realocado maternidade R$','Desconto a liquidar R$','Líquido R$',
    'Salário-família R$','Salário-maternidade R$','Situação','Origem PDF','Ficha/Fonte confirmadas','Liquidação/Observações',
    'Bruto RH antes do ajuste R$','Incentivo federal enfermagem R$','Incentivo incluído no bruto RH?','INSS da folha extra R$','Nota sobre INSS']];
  const composicoes=[['Empenho','Grupo','Secretaria','Vínculo','Lotação RH','Categoria do desconto',
    'Código da rubrica RH','Descrição da rubrica RH','Valor R$','Página do PDF','Arquivo de origem']];
  for(const r of previsao.empenhos) {
    const n=emp.length+1;
    const c=r.composicao||{},cent=k=>({centavos:c[k]||0});
    emp.push([r.empenho,{principal:'Folha principal',extra:'Folha extra · incentivo federal',decimo:'Adiantamento 13º',rescisao:'Rescisões'}[r.tipo],
      r.secretaria,r.vinculo,r.lotacao,r.ficha,r.fonte,r.conta,
      r.bruto==null?'':{centavos:r.bruto},
      cent('Caixa'),cent('Sicoob'),cent('Bradesco'),cent('Pensao'),cent('INSS'),cent('IRRF'),cent('Outros'),
      r.descontoRH==null?'':{centavos:r.descontoRH},
      {formula:'SUM(J'+n+':P'+n+')',moeda:true,cache:r.composicaoTotal},
      r.descontoRH==null?'':{formula:'Q'+n+'-R'+n,moeda:true,cache:r.diferencaComposicao},
      {centavos:r.maisInssExtra},
      r.descontoRH==null?'':{formula:'Q'+n+'-T'+n,moeda:true,cache:r.descontoAjustado},
      r.bruto==null||r.descontoAjustado==null?'':{formula:'I'+n+'-U'+n,moeda:true,cache:r.liquido},
      {centavos:r.familia},{centavos:r.maternidade},
      r.problemas.length?'PENDENTE: '+r.problemas.join(' / '):status,
      r.arquivo+' · p. '+r.pagina,aprovouMapa?'SIM':'NÃO','',
      r.brutoRH==null?'':{centavos:r.brutoRH},{centavos:r.incentivo||0},
      r.enfermagemIncluidaNoBruto==='sim'?'SIM':r.enfermagemIncluidaNoBruto==='nao'?'NÃO — SOMADO':'NÃO CONFERIDO',
      {centavos:r.tipo==='extra'?(r.composicao?.INSS||0):0},
      r.tipo==='extra'?'INSS pode ser descontado na folha seguinte; não criar desconto por presunção':'']);
    for(const rubrica of r.rubricasDesconto||[]){
      composicoes.push([r.empenho,r.tipo,r.secretaria,r.vinculo,r.lotacao,
        rubrica.categoria,rubrica.codigo,rubrica.descricao,{centavos:rubrica.valor},
        rubrica.pagina||r.pagina,r.arquivo]);
    }
  }
  const extra=[['Tipo de OP extraorçamentária','Empenho referência','Lotação','Ficha','Fonte','Conta bancária','Bruto R$','INSS a reter R$','Líquido R$','Situação','Observações']];
  for(const x of previsao.extras){
    const n=extra.length+1;
    extra.push([x.tipo,x.empenhoReferencia,x.lotacao,x.ficha,x.fonte,x.conta,
      {centavos:x.bruto},{centavos:x.inss},{formula:'G'+n+'-H'+n,moeda:true,cache:x.liquido},
      x.problemas.length?'PENDENTE: '+x.problemas.join('; '):status,'Referente ao empenho '+x.empenhoReferencia]);
  }
  const conf=[['SISDIFI · Prévia de empenhos da folha da Prefeitura de Frei Inocêncio','Valor'],
    ['Competência',competencia],['Situação',status],['Primeiro empenho',previsao.primeiro],['Último empenho',previsao.ultimo],
    ['Quantidade de empenhos',previsao.empenhos.length],['Empenhos com pendências',previsao.pendentes.length],
    ['Bruto orçamentário',{centavos:previsao.totalBruto}],['Desconto do RH',{centavos:previsao.totalDescontoRH}],
    ['Soma dos descontos discriminados',{centavos:previsao.empenhos.reduce((a,r)=>a+(r.composicaoTotal||0),0)}],
    ['Diferença RH x composição',{centavos:previsao.empenhos.reduce((a,r)=>a+(r.diferencaComposicao||0),0)}],
    ['Desconto ajustado do INSS maternidade',{centavos:previsao.totalDescontoAjustado}],
    ['Líquido orçamentário ajustado',{centavos:previsao.totalLiquido}],
    ['OPs extraorçamentárias',previsao.extras.length],
    ['Atenção','Documento de apoio, não efetua empenho, liquidação ou OP oficial. Conferir ficha, fonte e todos os descontos.'],
    ['Banco','Desconto RH','Minuta','Diferença','Situação']];
  for(const r of conciliacao)conf.push([r.banco,{centavos:r.esperado},{centavos:r.minuta},{centavos:r.diferenca},r.conferido?'CONFERIDO':'PENDENTE']);
  const notas=[['Regras de conferência e preenchimento'],
    ['1. A numeração dos empenhos é sequencial e provisória a partir do primeiro informado.'],
    ['2. A ordem dentro da folha principal segue o PDF original do RH, como na planilha de junho, depois extra, 13º e rescisões.'],
    ['2A. A primeira aba reproduz as colunas da planilha da Contabilidade. Ficha, fonte, conta, nº OP e ajustes adicionais ficam editáveis.'],
    ['3. O resumo de verbas informa valores por lotação, não os nomes das servidoras.'],
    ['4. Salário-família gera indicação de OP extra pelo valor do resumo.'],
    ['5. Salário-maternidade exige folha individual, matrícula, rubrica 163 e INSS 201 com conferência humana.'],
    ['6. O INSS confirmado da maternidade é removido do desconto da folha principal e retido na OP extra.'],
    ['7. Descontos de bancos e pensões são comparados com minutas por TOTAL; o vínculo de cada guia com empenho precisa revisão.'],
    ['8. Caso o RH apresente compensações externas não analisadas, não presumir total líquido final.'],
    ['9. A aba Composição discrimina rubrica, código, categoria e página do PDF do RH para cada desconto.'],
    ['10. Divergência entre soma das rubricas e desconto RH BLOQUEIA a exportação da relação conferida.'],
    ['11. Folha extra do dia 10: incentivo da enfermagem SOMENTE é somado ao bruto do RH após confirmação de que não está incluído.'],
    ['12. INSS da folha extra: não criar desconto automático; conferir na folha da competência seguinte e evitar duplicidade.'],
    ['13. Outros brutos/descontos da planilha original só podem ser informados após comprovação, sem criação automática de valores.'],
    ['14. O líquido do Modelo Contabilidade inclui OPs extras; no Empenhos, o líquido representa somente a parte orçamentária ajustada.'],
    ['15. Este Excel é memória de apoio, não emite empenho, liquidação ou OP no sistema contábil.']];
  const nomes=['Modelo Contabilidade','Empenhos','Composição','OPs Extras','Conferência','Orientações'],dados=[modelo,emp,composicoes,extra,conf,notas];
  const header='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const workbook=header+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+
    nomes.map((n,i)=>'<sheet name="'+xml(n)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets><calcPr fullCalcOnLoad="1"/></workbook>';
  const relaciones=header+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    nomes.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+
    '<Relationship Id="rId'+(nomes.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const contentTypes=header+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
    nomes.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>';
  const rels=header+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const styles=header+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$ &quot;#,##0.00"/></numFmts><fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF164A70"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';
  return criarZIP([['[Content_Types].xml',contentTypes],['_rels/.rels',rels],['xl/workbook.xml',workbook],['xl/_rels/workbook.xml.rels',relaciones],['xl/styles.xml',styles],...dados.map((v,i)=>['xl/worksheets/sheet'+(i+1)+'.xml',folhaXML(v)])]);
}

