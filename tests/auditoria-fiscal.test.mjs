import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditoriaNota,monitorFiscalSituacao,codigoExcecaoISS,VERSAO_POLITICA_FISCAL} from '../assets/js/auditoria-fiscal.js';
import {lerXML,MUNICIPIO} from '../assets/js/fiscal.js';

assert.equal(MUNICIPIO.nome,'Frei Inocêncio');
assert.equal(MUNICIPIO.ibge,'3126901');
assert.equal(VERSAO_POLITICA_FISCAL,'2026-11-11.1');
assert.equal(codigoExcecaoISS('10.01'),true);
assert.equal(codigoExcecaoISS('10.08'),true);
assert.equal(codigoExcecaoISS('10.09'),false);
assert.equal(codigoExcecaoISS('15.08'),true);
assert.equal(codigoExcecaoISS('17.01'),true);
assert.equal(codigoExcecaoISS('16.01'),false);

const xml='<NFe><infNFe Id="NFe000"><ide><nNF>123</nNF><mod>55</mod><dhEmi>2026-11-11T10:00:00</dhEmi></ide><emit><CNPJ>11222333000181</CNPJ><xNome>FORNECEDOR</xNome></emit><dest><CNPJ>00000000000001</CNPJ><xNome>Municipio de Frei Inocencio</xNome></dest><total><ICMSTot><vNF>1000.00</vNF></ICMSTot></total></infNFe></NFe>';
const nota=lerXML(xml);
assert.equal(nota.tomadorNome,'Municipio de Frei Inocencio');
assert.equal(nota.tomadorCnpj,'00000000000001');

const aval={simples:false,natureza:{servico:true,inss:false},problemas:[]};
const catalogo={ultimaExecucao:'2026-11-11T07:00:00Z',fontes:[{
 id:'lei_966_2023',estado:'monitorado',hashObservado:'ABC',hashReferencia:'ABC',ultimaConsulta:'2026-11-11T07:00:00Z'
}]};
const base={...nota,servico:true,numeroEmpenho:'1234/2026',referenciaAtesto:'Atesto assinado no processo 123/2026',localPrestacao:'3126901',incidencia:'3126901',
 codigoServico:'17.01',descricaoServico:'Assessoria',valor:1000};
const c={originalConferido:true,tomadorConfirmado:true,autenticidadeConfirmada:true,naturezaConfirmada:true,
 regimeConfirmado:true,localConfirmado:true,legislacaoIssConfirmada:true,baseEspecialAnalisada:true,
 vinculoEmpenho:true,atestoConfirmado:true};
let a=auditoriaNota({doc:base,cadastro:{cnpj:base.cnpj,situacao:'ATIVA'},resultado:aval,contexto:c,catalogo,hoje:'2026-11-11'});
assert.equal(a.situacao,'conferida_para_revisao');
assert.equal(a.impedimentos.length,0);
assert.equal(a.pendencias.length,0);
assert.match(a.resumo,/liquidação ainda depende/);
a=auditoriaNota({doc:base,cadastro:{situacao:'ATIVA'},resultado:aval,contexto:{},catalogo,hoje:'2026-11-11'});
assert.equal(a.situacao,'pendente');
assert.ok(a.pendencias.some(p=>p.id==='base_especial'));
assert.ok(a.pendencias.some(p=>p.id==='legislacao_iss'));
assert.ok(a.pendencias.some(p=>p.id==='atesto'));
a=auditoriaNota({doc:{...base,tomadorNome:'PREFEITURA MUNICIPAL DE OUTRA CIDADE'},cadastro:{situacao:'ATIVA'},
 resultado:aval,contexto:c,catalogo,hoje:'2026-11-11'});
assert.equal(a.situacao,'bloqueada');
assert.ok(a.impedimentos.some(p=>p.id==='tomador_divergente'));
a=auditoriaNota({doc:base,cadastro:{situacao:'ATIVA'},resultado:{...aval,problemas:[{nivel:'erro',titulo:'ISS incorreto',solucao:'Pedir correção'}]},
 contexto:c,catalogo,hoje:'2026-11-11'});
assert.equal(a.situacao,'bloqueada');
let alterado={...catalogo,fontes:[{...catalogo.fontes[0],estado:'mudanca_detectada',hashObservado:'NOVO'}]};
assert.equal(monitorFiscalSituacao(alterado,'2026-11-11').requerRevisao,true);
a=auditoriaNota({doc:base,cadastro:{situacao:'ATIVA'},resultado:aval,contexto:c,catalogo:alterado,hoje:'2026-11-11'});
assert.equal(a.situacao,'pendente');
assert.ok(a.pendencias.some(p=>p.id==='legislacao'));
const aprovacoes={lei_966_2023:{hash:'NOVO',observacao:'Norma verificada pela Contabilidade'}};
assert.equal(monitorFiscalSituacao(alterado,'2026-11-11',aprovacoes).requerRevisao,false);
a=auditoriaNota({doc:base,cadastro:{situacao:'ATIVA'},resultado:aval,contexto:c,catalogo:alterado,aprovacoes,hoje:'2026-11-11'});
assert.equal(a.situacao,'conferida_para_revisao');
assert.equal(monitorFiscalSituacao(catalogo,'2026-12-01').requerRevisao,true);
assert.equal(monitorFiscalSituacao(null,'2026-11-11').requerRevisao,true);
const tela=readFileSync(new URL('../assets/js/views/fiscal.js',import.meta.url),'utf8');
assert.match(tela,/Auditoria da Prefeitura de Frei Inocêncio/);
assert.match(tela,/carregarLegislacao/);
assert.match(tela,/data-fis-confirma/);
assert.match(tela,/legislacaoAprovada/);
assert.match(tela,/NÃO LIQUIDAR/);
assert.match(tela,/URL_LEIS_ATUALIZADAS/);
const workflow=readFileSync(new URL('../.github/workflows/monitor-legislacao-fiscal.yml',import.meta.url),'utf8');
assert.match(workflow,/schedule/);
assert.match(workflow,/scripts\/monitor-legislacao-fiscal\.py/);
assert.match(workflow,/contents: write/);
console.log('Pré-auditoria municipal: perguntas, bloqueios, leis especiais e monitoramento com aprovação: OK.');


// Fontes municipais que recusam robôs não podem ser consideradas automaticamente verificadas.
const proxied={...catalogo,fontes:[{...catalogo.fontes[0],consultaIntermediada:true,estado:'monitorado'}]};
assert.equal(monitorFiscalSituacao(proxied,'2026-11-11').requerRevisao,true);
assert.ok(monitorFiscalSituacao(proxied,'2026-11-11').indisponiveis.length);
const manualFonte={lei_966_2023:{hash:'ABC',verificacaoManualEm:'2026-11-11T10:00:00Z',observacao:'Lei municipal consultada em portal oficial'}};
assert.equal(monitorFiscalSituacao(proxied,'2026-11-11',manualFonte).requerRevisao,false);
assert.equal(monitorFiscalSituacao(proxied,'2026-11-20',manualFonte).requerRevisao,true);
const erroFonte={...catalogo,fontes:[{...catalogo.fontes[0],estado:'erro',hashObservado:null}]};
assert.equal(monitorFiscalSituacao(erroFonte,'2026-11-11').requerRevisao,true);
assert.equal(monitorFiscalSituacao(erroFonte,'2026-11-11',{lei_966_2023:{verificacaoManualEm:'2026-11-11T10:00:00Z',observacao:'verificação no portal municipal'}}).requerRevisao,false);
console.log('Portal municipal com erro 403 e espelho exigem revisão humana válida por 7 dias.');
