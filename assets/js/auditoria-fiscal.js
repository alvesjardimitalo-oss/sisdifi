// SISDIFI — Pré-auditoria de documentos fiscais da Prefeitura de Frei Inocêncio.
// O documento fiscal não substitui atesto, empenho, contrato e verificação jurídica.
// O status "concluída" é restrito à pré-auditoria; NÃO emite liquidação.
import { MUNICIPIO } from './fiscal.js';

export const FONTES_LEGISLATIVAS = [
  {id:'codigo_tributario_municipal',titulo:'Lei Municipal 883/2017 — Código Tributário de Frei Inocêncio',url:'https://freiinocencio.mg.gov.br/legislacoes',tema:'ISS',importancia:'alta'},
  {id:'lei_966_2023',titulo:'Lei Municipal 966/2023 — alterações na base de cálculo do ISS',url:'https://freiinocencio.mg.gov.br/arquivo/67d484b2ddc9d.pdf',tema:'ISS',importancia:'alta'},
  {id:'municipal_publicacoes',titulo:'Legislações oficiais da Prefeitura de Frei Inocêncio',url:'https://freiinocencio.mg.gov.br/legislacoes',tema:'municipal',importancia:'alta'},
  {id:'receita_normas',titulo:'Acervo oficial de normas da Receita Federal',url:'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/app-normas',tema:'IRRF',importancia:'alta'},
  {id:'reforma_tributaria',titulo:'Reforma tributária — normas e marcos regulatórios da RFB',url:'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/legislacao/principais-marcos-regulatorios',tema:'CBS/IBS',importancia:'alta'},
  {id:'reforma_orientacoes',titulo:'Orientações e cronograma da CBS e IBS (RFB/CGIBS)',url:'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-e-comite-gestor-do-ibs-publicam-o-cronograma-de-implementacao-dos-documentos-fiscais-eletronicos-da-reforma-tributaria-do-consumo',tema:'CBS/IBS',importancia:'media'}
];
export const VERSAO_POLITICA_FISCAL = '2026-11-11.1';
const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const numero = v => String(v ?? '').replace(/\D/g,'');
const literal = v => String(v || '').trim();
const fato = (id, titulo, pergunta, base='') => ({id,titulo,pergunta,base});
export function codigoExcecaoISS(codigo) {
  const n=numero(codigo).padEnd(4,'0').slice(0,4);
  const item=n.slice(0,2),sub=n.slice(2,4);
  return (item==='10' && Number(sub)>=1 && Number(sub)<=8) || n==='1508' || n==='1701';
}
export function monitorFiscalSituacao(catalogo, agora='2026-11-11', aprovacoes={}) {
  const fontes = (Array.isArray(catalogo?.fontes) ? catalogo.fontes : []).map(f => {
    const aprovado = aprovacoes?.[f.id] || {};
    const aprovadoHash = !!(aprovado.hash && aprovado.hash === f.hashObservado);
    const validadeManual = aprovado.verificacaoManualEm
      ? Math.floor((Date.parse(agora+'T12:00:00Z')-Date.parse(String(aprovado.verificacaoManualEm).slice(0,10)+'T12:00:00Z'))/86400000)
      : null;
    if (f.estado==='erro' && validadeManual!==null && validadeManual>=0 && validadeManual<=7)
      return {...f,estado:'verificacao_manual',aprovacao:aprovado};
    if ((f.estado==='mudanca_detectada' || f.consultaIntermediada) && aprovadoHash
        && (!f.consultaIntermediada || (validadeManual!==null && validadeManual>=0 && validadeManual<=7)))
      return {...f,estado:'revisao_registrada',aprovacao:aprovado};
    if (f.consultaIntermediada && f.estado==='monitorado')
      return {...f,estado:'consulta_intermediada'};
    return f;
  });
  const verificadas=fontes.filter(f=>f.estado==='monitorado');
  const pendentes=fontes.filter(f=>f.estado==='mudanca_detectada');
  const indisponiveis=fontes.filter(f=>['erro','consulta_intermediada'].includes(f.estado));
  const ultimo = /^\d{4}-\d{2}-\d{2}/.test(catalogo?.ultimaExecucao||'') ? catalogo.ultimaExecucao.slice(0,10) : '';
  const dias = ultimo ? Math.max(0,Math.floor((Date.parse(agora+'T12:00:00Z')-Date.parse(ultimo+'T12:00:00Z'))/86400000)) : null;
  return {fontes,verificadas,pendentes,indisponiveis,ultimo,dias,
    recente:dias!==null && dias<=7,
    aplicacaoAutomatica:false,
    requerRevisao:!fontes.length || dias===null || dias>7 || pendentes.length>0 || indisponiveis.length>0};
}
export function auditoriaNota({doc={},cadastro=null,resultado=null,contexto={},catalogo=null,aprovacoes={},hoje=new Date().toISOString().slice(0,10)}={}) {
  const pendencias=[], impedimentos=[], orientacoes=[];
  const adicionar = (id,titulo,pergunta,base='')=>pendencias.push(fato(id,titulo,pergunta,base));
  const bloquear=(id,titulo,pergunta,base='')=>impedimentos.push(fato(id,titulo,pergunta,base));
  const ehServico=!!(doc.servico || /NFS/.test(doc.documento||'') || resultado?.natureza?.servico);
  if (!literal(doc.documento)) adicionar('documento','Tipo do documento','Informe se é NF-e, NFS-e, CT-e ou outro documento fiscal.');
  if (!literal(doc.numero)) adicionar('numero','Número da nota','Informe o número da nota fiscal e confira a série, quando aplicável.');
  if (!literal(doc.emissao)) adicionar('emissao','Data de emissão','Confira a data de emissão com a nota original.');
  if (!(Number(doc.valor)>0)) adicionar('valor','Valor bruto','Informe o valor total efetivo da nota.');
  if (!literal(doc.cnpj)) adicionar('cnpj','CNPJ emitente','Informe o CNPJ que consta na nota.');
  if (!cadastro) adicionar('cadastro','Cadastro do fornecedor','Consultar e documentar a situação cadastral do emitente na Receita Federal.');
  if (!contexto.originalConferido) adicionar('original','Documento fiscal original','Abra PDF/XML integral da nota ou confirme a verificação do documento no portal oficial.');
  const nomeTomador = norm(doc.tomadorNome);
  if (nomeTomador && !nomeTomador.includes('FREI INOCENCIO')) {
    bloquear('tomador_divergente','Tomador diferente de Frei Inocêncio',
      'A nota indica outro tomador ('+literal(doc.tomadorNome)+'). Confirme no documento e solicite correção ao emissor se o Município de Frei Inocêncio é o contratante.');
  }
  if (!contexto.tomadorConfirmado) adicionar('tomador','Tomador da nota','Confirme que a nota foi emitida em nome da Prefeitura Municipal de Frei Inocêncio/MG, CNPJ do órgão conforme cadastro oficial.');
  if (!contexto.autenticidadeConfirmada) adicionar('autenticidade','Autenticidade e autorização','Confirme no portal emissor que a nota está autorizada, não cancelada nem substituída.');
  if (!contexto.vinculoEmpenho || !literal(doc.numeroEmpenho)) adicionar('empenho','Vínculo com empenho/contrato','Informe o número do empenho/contrato e confira valores e saldo contratual.');
  if (!contexto.atestoConfirmado || !literal(doc.referenciaAtesto)) adicionar('atesto','Atesto do fornecimento ou serviço','Registre a referência ao atesto/recebimento efetivo e confira a assinatura do fiscal responsável.');
  if (resultado?.simples==null && !contexto.regimeConfirmado) adicionar('simples','Regime tributário na data da emissão','Confirme Simples Nacional/MEI em consulta oficial ou com declaração válida.');
  if (ehServico) {
    if (!literal(doc.codigoServico)) adicionar('codigo','Código do serviço','Informe o código de tributação conforme a NFS-e e confira com a descrição.');
    if (!literal(doc.descricaoServico)) adicionar('descricao','Descrição dos serviços','Confira o objeto do contrato e a descrição discriminada na nota.');
    if (!literal(doc.incidencia)) adicionar('incidencia','Município de incidência do ISS','Confirme o município de incidência da nota; a cidade do prestador não determina sozinha o ISS devido.');
    if (!literal(doc.localPrestacao) || !contexto.localConfirmado) adicionar('local','Local efetivo da prestação','Confirme onde o serviço foi executado e a regra específica de incidência da LC 116/2003.');
    if (!contexto.legislacaoIssConfirmada) adicionar('legislacao_iss','Alíquota e base do ISS em Frei Inocêncio','Valide o Código Tributário Municipal (Lei 883/2017 e alterações), a lista do serviço, a sujeição à retenção e a base de cálculo.');
    if (codigoExcecaoISS(doc.codigoServico) && !contexto.baseEspecialAnalisada) adicionar('base_especial','Possível redução legal da base do ISS','Verifique documentação de valores pagos a terceiros e hipóteses específicas dos §§15-16 do art. 102 (Lei 966/2023); não aplique automaticamente o ISS sobre o bruto.','Lei Municipal 966/2023, art. 1º');
    if (resultado?.natureza?.inss && !contexto.inssAnalisado) adicionar('inss','Retenção previdenciária a conferir','Analise cessão de mão de obra/empreitada, base, dispensa e eventual retenção previdenciária; o valor líquido simulado não inclui INSS.','Lei 8.212/1991 art. 31; IN RFB 2.110/2022');
  }
  if (resultado?.problemas?.some(p=>p.nivel==='erro')) for(const p of resultado.problemas.filter(p=>p.nivel==='erro'))
    bloquear('motor_'+impedimentos.length,p.titulo,p.solucao);
  if (cadastro?.situacao && norm(cadastro.situacao)!=='ATIVA') bloquear('cnpj_inativo','CNPJ com situação cadastral irregular','Esclarecer a situação cadastral antes de prosseguir.');
  const monitor=monitorFiscalSituacao(catalogo,hoje,aprovacoes);
  if (monitor.requerRevisao) adicionar('legislacao','Monitoramento legislativo pendente','Confirme as fontes oficiais e os efeitos de alterações antes de validar as retenções; nenhuma alíquota é alterada automaticamente.');
  if (!contexto.naturezaConfirmada) adicionar('natureza','Natureza tributária do item','Confirme a natureza do serviço/bem escolhida para o cálculo do IRRF.');
  if (resultado?.problemas?.some(p=>p.nivel==='alerta')) adicionar('avisos','Pendências técnicas do cálculo','Revise os avisos de retenções, ISS, Simples e CBS/IBS na conferência fiscal.');
  const bases=[
    {tema:'IRRF',lei:'IN RFB 1.234/2012, com alterações da IN RFB 2.145/2023',url:'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/app-normas'},
    {tema:'ISSQN',lei:'LC 116/2003; Lei Municipal 883/2017, alterada pela Lei 966/2023',url:'https://freiinocencio.mg.gov.br/legislacoes'},
    {tema:'Simples',lei:'LC 123/2006, art. 21; verificação do regime na data',url:'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm'},
    {tema:'CBS/IBS',lei:'EC 132/2023, LC 214/2025 e normas posteriores',url:'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/legislacao/principais-marcos-regulatorios'}
  ];
  const situacao=impedimentos.length?'bloqueada':pendencias.length?'pendente':'conferida_para_revisao';
  return {municipio:MUNICIPIO,versaoPolitica:VERSAO_POLITICA_FISCAL,situacao,pendencias,impedimentos,monitor,bases,
    resumo: situacao==='bloqueada'?'Não prosseguir com a liquidação: divergências materiais identificadas.'
      :situacao==='pendente'?'Conferência incompleta: solicite ou confirme as informações pendentes antes de liquidar.'
      :'Pré-auditoria documental concluída. A liquidação ainda depende do servidor responsável e do processo administrativo.',
    ressalva:'Valores de IRRF e ISS são estimativas baseadas nos dados e parâmetros confirmados. INSS e hipóteses especiais exigem análise própria. O SISDIFI não emite nem bloqueia liquidações no sistema contábil externo.'};
}
