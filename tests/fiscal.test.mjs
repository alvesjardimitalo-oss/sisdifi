// Testes da conferência fiscal: node tests/fiscal.test.mjs
import { verificarNatureza, itensDoCnae, aliquotaIss, mensagemFornecedor, descreverTributacao, lerCodigo, cnpjValido, lerXML, conferir, irNoTexto, consultarCnpj, normalizarCadastro, sugerirNatureza, optanteNaData } from '../assets/js/fiscal.js';
let falhas = 0;
const ok = (cond, msg) => { if (!cond) { falhas++; console.log('FALHA:', msg); } };
const tem = (r, trecho) => r.problemas.some(p => p.titulo.includes(trecho));

// --- CNPJ (inclui alfanumérico) ---
ok(cnpjValido('11.222.333/0001-81'), 'CNPJ numérico válido');
ok(!cnpjValido('11.222.333/0001-82'), 'CNPJ DV errado');
ok(cnpjValido('12ABC34501DE35'), 'CNPJ alfanumérico (exemplo da Receita)');
ok(!cnpjValido('00000000000000'), 'zeros');

// --- Chave NF-e (44) ---
function comDV(corpo) { let s = 0, p = 2; for (let i = corpo.length - 1; i >= 0; i--) { s += (corpo.charCodeAt(i) - 48) * p; p = p === 9 ? 2 : p + 1; } const r = s % 11; return corpo + (r < 2 ? 0 : 11 - r); }
const chave = comDV('31' + '2609' + '11222333000181' + '55' + '001' + '000001234' + '1' + '12345678');
let c = lerCodigo(chave);
ok(c.tipo === 'chave' && c.documento === 'NF-e' && c.valida && c.cnpj === '11222333000181' && c.numero === '1234' && c.anoMes === '2026-09', 'chave NF-e');
ok(!lerCodigo(chave.slice(0, 43) + ((Number(chave[43]) + 1) % 10)).valida, 'DV errado');
c = lerCodigo('https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=' + chave + '|2|1|1|ABC');
ok(c.tipo === 'chave' && c.chave === chave, 'QR Code NFC-e');
// --- Chave NFS-e Nacional (50) ---
const nfse = comDV('3126901' + '1' + '2' + '11222333000181' + '0000000000077' + '2610' + '123456789');
c = lerCodigo('NFS' + nfse);
ok(c.tipo === 'chave' && c.documento === 'NFS-e Nacional' && c.valida && c.cnpj === '11222333000181' && c.municipio === '3126901' && c.numero === '77', 'chave NFS-e');
ok(lerCodigo('11.222.333/0001-81').tipo === 'cnpj', 'CNPJ digitado');
ok(lerCodigo('23793381286000000000300000000401884340000012345').tipo === 'boleto', 'boleto');

// --- IR nas informações complementares ---
ok(irNoTexto('RETENCAO IRRF 4,80% R$ 1.234,56 CONFORME IN 1234') === 1234.56, 'IR no texto');
ok(irNoTexto('Imposto de Renda retido: 48,00') === 48, 'IR por extenso');
ok(irNoTexto('Sem retenções') === null, 'sem IR');

// --- XML NF-e ---
const xmlNFe = `<nfeProc><NFe><infNFe Id="NFe${chave}"><ide><mod>55</mod><serie>1</serie><nNF>1234</nNF><dhEmi>2026-09-10T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>11222333000181</CNPJ><xNome>FORNECEDOR LTDA</xNome><enderEmit><cMun>3131703</cMun></enderEmit><CRT>3</CRT></emit>
<det><prod><NCM>48201000</NCM></prod><imposto><IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib><gIBSCBS><vBC>1000.00</vBC><gIBSUF><pIBSUF>0.10</pIBSUF></gIBSUF><gIBSMun><pIBSMun>0.00</pIBSMun></gIBSMun><gCBS><pCBS>0.90</pCBS></gCBS></gIBSCBS></IBSCBS></imposto></det>
<total><ICMSTot><vNF>1000.00</vNF></ICMSTot><IBSCBSTot><vBCIBSCBS>1000.00</vBCIBSCBS><gIBS><vIBS>1.00</vIBS></gIBS><gCBS><vCBS>9.00</vCBS></gCBS></IBSCBSTot></total>
<infAdic><infCpl>IRRF 1,2% R$ 12,00</infCpl></infAdic></infNFe></NFe></nfeProc>`;
let d = lerXML(xmlNFe);
ok(d.documento === 'NF-e' && d.cnpj === '11222333000181' && d.valor === 1000 && d.regimeNota === 'normal' && d.emissao === '2026-09-10', 'lê NF-e');
ok(d.irrfDestacado === 12 && d.ibscbs.pCBS === 0.9 && d.ibscbs.vCBS === 9 && d.ibscbs.vIBS === 1, 'lê IR e CBS/IBS da NF-e');
ok(sugerirNatureza(d) === 'mercadorias', 'NF-e de mercadoria');

const cadNormal = { fonte: 'teste', cnpj: '11222333000181', nome: 'FORNECEDOR LTDA', situacao: 'ATIVA', simples: false, mei: false };
const cadSimples = { ...cadNormal, simples: true, simplesInicio: '2020-01-01', simplesFim: '' };
let r = conferir({ doc: d, cadastro: cadNormal, naturezaId: 'mercadorias', hoje: '2026-11-03' });
ok(r.ir.reter && r.ir.valor === 12 && r.liquido === 988 && r.situacao !== 'erro', 'NF-e mercadoria regime normal: IR 1,2%, sem erro');
ok(!r.iss.aplica, 'mercadoria sem ISS');

// nota de 2026-09 sem grupo IBS/CBS → erro
d = lerXML(xmlNFe.replace(/<IBSCBS>[\s\S]*?<\/IBSCBS>/, '').replace(/<IBSCBSTot>[\s\S]*?<\/IBSCBSTot>/, ''));
r = conferir({ doc: d, cadastro: cadNormal, naturezaId: 'mercadorias', hoje: '2026-11-03' });
ok(tem(r, 'sem o grupo de CBS/IBS'), 'NF-e regime normal sem CBS/IBS após 03/08/2026');

// nota se declara Simples (CRT 1) mas não é optante
d = lerXML(xmlNFe.replace('<CRT>3</CRT>', '<CRT>1</CRT>'));
r = conferir({ doc: d, cadastro: cadNormal, naturezaId: 'mercadorias', hoje: '2026-11-03' });
ok(r.situacao === 'erro' && tem(r, 'mas o fornecedor não é optante') && r.ir.reter, 'falso Simples: retém IR');

// optante pelo Simples: não retém, IR destacado vira alerta
r = conferir({ doc: lerXML(xmlNFe.replace('<CRT>3</CRT>', '<CRT>1</CRT>')), cadastro: cadSimples, naturezaId: 'mercadorias', hoje: '2026-11-03' });
ok(r.simples && !r.ir.reter && r.liquido === 1000 && tem(r, 'mas o fornecedor é do Simples'), 'Simples não retém');
ok(!r.cbsibs.aplica && tem(r, 'Nota do Simples com CBS/IBS'), 'Simples com CBS/IBS destacado');
// excluído do Simples antes da nota
ok(!optanteNaData('2020-01-01', '2026-01-01', true, '2026-09-10'), 'excluído antes');
ok(optanteNaData('2020-01-01', '2026-12-01', true, '2026-09-10'), 'excluído depois');

// IR inferior a R$ 10
r = conferir({ doc: { valor: 500, emissao: '2026-10-01' }, cadastro: cadNormal, naturezaId: 'mercadorias', hoje: '2026-11-03' });
ok(!r.ir.reter && r.ir.valor === 6, 'dispensa < R$ 10');
// IR destacado errado
r = conferir({ doc: { valor: 10000, emissao: '2026-10-01', irrfDestacado: 120 }, cadastro: cadNormal, naturezaId: 'demais_servicos', hoje: '2026-11-03' });
ok(r.ir.valor === 480 && tem(r, 'diferente do devido'), 'IR destacado errado');
// CNPJ baixado
r = conferir({ doc: { valor: 1000, emissao: '2026-10-01' }, cadastro: { ...cadNormal, situacao: 'BAIXADA' }, naturezaId: 'mercadorias', hoje: '2026-11-03' });
ok(r.situacao === 'erro' && tem(r, 'BAIXADA'), 'CNPJ baixado');

// --- NFS-e Nacional ---
const xmlNFSe = `<NFSe><infNFSe Id="NFS${nfse}"><xLocEmi>Frei Inocêncio</xLocEmi><cLocIncid>3126901</cLocIncid><nNFSe>77</nNFSe>
<emit><CNPJ>11222333000181</CNPJ><xNome>SERVICOS LTDA</xNome></emit><valores><vBC>2000.00</vBC><pAliqAplic>2.00</pAliqAplic><vISSQN>40.00</vISSQN><vLiq>2000.00</vLiq></valores>
<DPS><infDPS><dhEmi>2026-10-05T09:00:00-03:00</dhEmi><prest><CNPJ>11222333000181</CNPJ><regTrib><opSimpNac>1</opSimpNac></regTrib></prest>
<serv><cServ><cTribNac>010101</cTribNac><xDescServ>Desenvolvimento de sistemas</xDescServ></cServ></serv>
<valores><vServPrest><vServ>2000.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><tribFed></tribFed></trib></valores></infDPS></DPS></infNFSe></NFSe>`;
d = lerXML(xmlNFSe);
ok(d.documento === 'NFS-e Nacional' && d.valor === 2000 && d.regimeNota === 'normal' && d.issAliquota === 2 && d.issRetidoNota === false && d.municipioEmissor === '3126901', 'lê NFS-e Nacional');
r = conferir({ doc: d, cadastro: cadNormal, naturezaId: 'demais_servicos', hoje: '2026-11-03' });
ok(r.ir.valor === 96 && r.iss.aliquota === 5 && r.iss.valor === 100 && r.liquido === 1804, 'NFS-e: IR 4,8% + ISS 5%');
ok(tem(r, 'Alíquota de ISS na nota (2%)') && tem(r, 'ISS NÃO retido') && tem(r, 'IRRF não destacado'), 'NFS-e: erros de ISS e IR');
// Simples ME/EPP: alíquota da nota
r = conferir({ doc: lerXML(xmlNFSe.replace('<opSimpNac>1</opSimpNac>', '<opSimpNac>3</opSimpNac>')), cadastro: cadSimples, naturezaId: 'demais_servicos', hoje: '2026-11-03' });
ok(!r.ir.reter && r.iss.aliquota === 2 && r.iss.valor === 40 && r.liquido === 1960, 'Simples: ISS pela alíquota da nota');
// MEI
r = conferir({ doc: { valor: 800, emissao: '2026-10-01', servico: true, municipioEmissor: '3126901' }, simplesManual: 'mei', naturezaId: 'demais_servicos', hoje: '2026-11-03' });
ok(r.mei && !r.iss.reter && r.liquido === 800, 'MEI sem retenções');
// nota emitida em outro município, serviço prestado em Frei Inocêncio, não optante → retém 5% e reflete no líquido
r = conferir({ doc: { valor: 1000, emissao: '2026-10-01', servico: true, municipioEmissor: '3113404' }, cadastro: cadNormal, naturezaId: 'demais_servicos', hoje: '2026-11-03' });
ok(r.iss.reter && r.iss.valor === 50 && r.liquido === 1000 - 48 - 50 && tem(r, 'confira o município de incidência'), 'emitida fora, prestada aqui: retém ISS 5% e pede conferir incidência');
r = conferir({ doc: { valor: 1000, emissao: '2026-10-01', servico: true, municipioEmissor: '3113404', incidencia: '3126901' }, cadastro: cadNormal, naturezaId: 'demais_servicos', hoje: '2026-11-03' });
ok(r.iss.reter && !tem(r, 'incidência') && !tem(r, 'ISS devido em outro'), 'emitida em Caratinga com incidência Frei Inocêncio: correto, sem aviso');
r = conferir({ doc: { valor: 1000, emissao: '2026-10-01', servico: true, municipioEmissor: '3113404', incidencia: '3113404', incidenciaNome: 'Caratinga/MG' }, cadastro: cadNormal, naturezaId: 'demais_servicos', hoje: '2026-11-03' });
ok(r.situacao === 'erro' && tem(r, 'ISS devido em outro município (Caratinga/MG)'), 'incidência errada: erro e substituição');
// serviço prestado fora
r = conferir({ doc: { valor: 1000, emissao: '2026-10-01', servico: true, municipioEmissor: '3113404', localPrestacao: '3113404' }, cadastro: cadNormal, naturezaId: 'demais_servicos', hoje: '2026-11-03' });
ok(!r.iss.reter && r.liquido === 952 && tem(r, 'prestado em outro município'), 'prestado fora: não retém ISS');
// nota com "ISS retido pelo tomador", mesmo com local diferente → retém 5%
r = conferir({ doc: { valor: 1000, emissao: '2026-10-01', servico: true, municipioEmissor: '3113404', localPrestacao: '3113404', issRetidoNota: true }, cadastro: cadNormal, naturezaId: 'demais_servicos', hoje: '2026-11-03' });
ok(r.iss.reter && r.iss.valor === 50 && r.liquido === 902, 'ISS retido pelo tomador na nota: retém 5%');
// tipo escolhido
ok(lerCodigo('3113404124641829100013300000000000902610889436854', 'nfse').tipo === 'incompleto', 'NFS-e incompleta com tipo escolhido');
ok(lerCodigo('31134041246418291000133000000000009026108894368549', 'nfse').tipo === 'chave', 'NFS-e completa com tipo escolhido');
ok(lerCodigo('31134041246418291000133000000000009026108894368549', 'nfe').tipo === 'outroTipo', 'tipo errado');

// --- ABRASF ---
const abrasf = `<CompNfse><Nfse><InfNfse><Numero>15</Numero><DataEmissao>2026-10-02T08:00:00</DataEmissao><Servico><Valores><ValorServicos>1000.00</ValorServicos><ValorIr>48.00</ValorIr><ValorIss>50.00</ValorIss><Aliquota>0.05</Aliquota></Valores><IssRetido>1</IssRetido><ItemListaServico>17.01</ItemListaServico><CodigoMunicipio>3126901</CodigoMunicipio></Servico>
<PrestadorServico><IdentificacaoPrestador><Cnpj>11222333000181</Cnpj></IdentificacaoPrestador><RazaoSocial>ASSESSORIA LTDA</RazaoSocial></PrestadorServico><OptanteSimplesNacional>2</OptanteSimplesNacional></InfNfse></Nfse></CompNfse>`;
d = lerXML(abrasf);
ok(d.issAliquota === 5 && d.irrfDestacado === 48 && d.issRetidoNota === true && d.regimeNota === 'normal', 'lê ABRASF');
r = conferir({ doc: d, cadastro: cadNormal, naturezaId: 'demais_servicos', hoje: '2026-11-03' });
ok(r.problemas.filter(p => p.nivel === 'erro').length === 0 && r.liquido === 902, 'ABRASF correta sem erro');

// --- 2027 provisório ---
r = conferir({ doc: { valor: 1000, emissao: '2027-02-01', origem: 'xml', modelo: '55' }, cadastro: cadNormal, naturezaId: 'mercadorias', hoje: '2027-03-01' });
ok(r.cbsibs.esperado && tem(r, 'provisórias'), '2027 provisório');

// --- Consulta CNPJ com reserva ---
const respostas = [{ status: 503 }, { status: 200, json: { cnpj: '11222333000181', razao_social: 'X', descricao_situacao_cadastral: 'ATIVA', opcao_pelo_simples: true, data_opcao_pelo_simples: '2019-01-01', opcao_pelo_mei: false } }];
let i = 0;
const fake = async () => { const x = respostas[i++]; return { ok: x.status === 200, status: x.status, json: async () => x.json }; };
const q = await consultarCnpj('11222333000181', { fetchFn: fake });
ok(q.cadastro?.fonte === 'Minha Receita' && q.cadastro.simples && q.cadastro.situacao === 'ATIVA', 'reserva da consulta');
const ws = normalizarCadastro({ razao_social: 'Y', natureza_juridica: { id: '206-2', descricao: 'Sociedade Empresária Limitada' }, simples: { simples: 'Não', mei: 'Não' }, estabelecimento: { cnpj: '11222333000181', situacao_cadastral: 'Ativa', cidade: { nome: 'X', ibge_id: 3126901 }, estado: { sigla: 'MG' } } }, 'CNPJ.ws');
ok(ws.situacao === 'ATIVA' && ws.simples === false && ws.naturezaCodigo === '2062', 'normaliza CNPJ.ws');

ok(sugerirNatureza({ modelo: '66' }) === 'energia' && sugerirNatureza({ modelo: '62' }) === 'agua_telefone' && sugerirNatureza({ modelo: '57' }) === 'transporte_cargas', 'natureza pelo modelo (energia, telefone, frete)');
const nf3e = comDV('31' + '2610' + '11222333000181' + '66' + '001' + '000000555' + '1' + '12345678');
ok(lerCodigo(nf3e).documento.startsWith('NF3-e'), 'NF3-e pela chave');
// chave real informada (NFS-e Nacional de Caratinga) e o pedaço de 44 dígitos não pode virar NF-e
c = lerCodigo('31134041246418291000133000000000009026108894368549');
ok(c.documento === 'NFS-e Nacional' && c.valida && c.cnpj === '46418291000133' && c.municipio === '3113404' && c.numero === '90' && c.anoMes === '2026-10', 'NFS-e de Caratinga');
ok(lerCodigo('31134041246418291000133000000000009026108894').tipo !== 'chave', '44 primeiros dígitos da NFS-e não são NF-e (mês 40)');
// código de tributação 16.01.01 → passageiros 2,4%
let tb = descreverTributacao('16.01.01');
ok(tb.valido && tb.codigo === '16.01.01' && tb.natureza === 'transporte_passageiros' && tb.issNoLocal, '16.01.01');
ok(sugerirNatureza({ servico: true, codigoServico: '160101' }) === 'transporte_passageiros', 'natureza 16.01.01');
ok(sugerirNatureza({ servico: true, codigoServico: '16.02.01', descricaoServico: 'Transporte escolar' }) === 'transporte_passageiros', '16.02 escolar');
ok(sugerirNatureza({ codigoServico: '17.01' }) === 'demais_servicos' && sugerirNatureza({ codigoServico: '07.10.01' }) === 'limpeza', 'outros códigos');
ok(!descreverTributacao('99.01').valido, 'código inexistente');
r = conferir({ doc: { valor: 10000, emissao: '2026-10-01', servico: true, codigoServico: '16.01.01', municipioEmissor: '3113404' }, cadastro: cadNormal, hoje: '2026-11-03' });
ok(r.ir.aliquota === 2.4 && r.ir.valor === 240 && r.iss.valor === 500 && r.liquido === 9260 && /art\. 3º/.test(r.iss.motivo), '16.01.01 completo: IR 2,4% + ISS 5%');
// cooperativa de transporte de passageiros: 1,5% sobre 60% dos serviços pessoais
const coop = { ...cadNormal, naturezaCodigo: '2143', naturezaTexto: 'Cooperativa' };
r = conferir({ doc: { valor: 12000, emissao: '2026-10-01', servico: true, codigoServico: '16.01.01', coopServicosPessoais: 10000, coopTransporte: 'passageiros' }, cadastro: coop, naturezaId: 'cooperativas', hoje: '2026-11-03' });
ok(r.ir.base === 6000 && r.ir.valor === 90 && r.iss.valor === 600 && r.liquido === 11310, 'cooperativa passageiros: IR 1,5% s/ 60% dos serviços pessoais');
r = conferir({ doc: { valor: 12000, emissao: '2026-10-01', servico: true, coopTransporte: 'passageiros' }, cadastro: coop, naturezaId: 'cooperativas', hoje: '2026-11-03' });
ok(r.ir.valor === 108 && tem(r, 'sem a parcela de serviços pessoais'), 'cooperativa sem discriminação: base no total');
r = conferir({ doc: { valor: 12000, emissao: '2026-10-01', servico: true, codigoServico: '16.01.01' }, cadastro: coop, naturezaId: 'transporte_passageiros', hoje: '2026-11-03' });
ok(r.situacao === 'erro' && tem(r, 'COOPERATIVA'), 'cooperativa com natureza errada');
// alíquota de ISS por código
ok(aliquotaIss('16.01.01').aliquota === 5, 'ISS padrão 5%');
ok(aliquotaIss('16.01.01', { issPadrao: 5, issPorCodigo: { '16.01': 2.5 } }).aliquota === 2.5, 'exceção por subitem');
ok(aliquotaIss('16.02.01', { issPadrao: 5, issPorCodigo: { '16.01': 2.5 } }).aliquota === 5, 'outro subitem usa o padrão');
ok(aliquotaIss('16.01.01', { issPorCodigo: { '16': 3, '16.01.01': 2 } }).aliquota === 2, 'mais específico vence');

// Caso real (dados fictícios): transporte escolar 16.01.01, não optante, nota com ISS 2,5% e IRRF 1,5%
const docT = { origem: 'danfse', documento: 'NFS-e Nacional', modelo: 'nfse', servico: true, valor: 19426.92, emissao: '2026-10-27', codigoServico: '16.01.01',
  municipioEmissor: '3113404', localPrestacao: '3126901', incidencia: '3126901', regimeNota: 'normal', issRetidoNota: true, issAliquota: 2.5, issValor: 485.67,
  irrfDestacado: 291.40, totalRetencoesNota: 777.07, liquidoNota: 18649.85, ibscbs: { cst: '400', classTrib: '400001', base: 17144.26, vCBS: 0, vIBS: 0, pCBS: 0 } };
const cadLtda = { ...cadNormal, naturezaCodigo: '2062', naturezaTexto: 'Sociedade Empresária Limitada' };
r = conferir({ doc: docT, cadastro: cadLtda, hoje: '2026-11-03' });
ok(r.ir.valor === 466.25 && r.iss.valor === 971.35 && r.liquido === 17989.32, 'transporte escolar: IR 2,4% + ISS 5%');
ok(tem(r, 'diferente do devido') && tem(r, 'Alíquota de ISS na nota (2,5%)') && tem(r, 'isentos na nota (CST 400') && tem(r, 'Valor líquido da nota (R$'), 'erros do caso real');
ok(r.problemas.find(p => p.titulo.startsWith('Alíquota de ISS')).solucao.includes('setor de Tributos'), 'orienta a conferir a parametrização do Município');
const cl = r.comparativo.find(l => l.total);
ok(cl.nota === 18649.85 && cl.conferido === 17989.32 && cl.diferenca === -660.53, 'comparativo do líquido');
// com a exceção de 2,5% cadastrada para 16.01, o ISS da nota fica certo
r = conferir({ doc: docT, cadastro: cadLtda, hoje: '2026-11-03', parametros: { issPadrao: 5, issPorCodigo: { '16.01': 2.5 } } });
ok(r.iss.valor === 485.67 && !tem(r, 'Alíquota de ISS na nota') && r.liquido === 18475, 'exceção 2,5% para 16.01');
const msg = mensagemFornecedor(r, docT, cadLtda).replace(/\s/g, ' ');
ok(msg.includes('IRRF: R$ 466,25') && msg.includes('Valor líquido a pagar: R$ 18.475,00') && msg.includes('substituição'), 'mensagem ao fornecedor');
// verificador da natureza do serviço
ok(itensDoCnae('4924800').itens.includes('16') && itensDoCnae('7711000').itens.length === 0, 'CNAE → itens');
const locadora = { ...cadNormal, cnae: '7711000', cnaeTexto: 'Locação de automóveis sem condutor', cnaesSecundarios: [{ codigo: '8211300', texto: 'Serviços combinados de escritório' }] };
let vn = verificarNatureza({ doc: { codigoServico: '16.01.01', descricaoServico: 'PRESTAÇÃO DE SERVIÇO DE TRANSPORTE ESCOLAR, ROTA 06' }, cadastro: locadora });
ok(vn.problemas.some(p => p.titulo.includes('não corresponde à descrição') && p.solucao.includes('16.02')), 'escolar com 16.01 → sugere 16.02');
ok(vn.problemas.some(p => p.titulo.includes('não aparece entre as atividades') && p.solucao.includes('locação de bens')), 'locadora sem CNAE de transporte');
vn = verificarNatureza({ doc: { codigoServico: '16.02.01', descricaoServico: 'Transporte escolar rota 06' }, cadastro: { ...locadora, cnaesSecundarios: [{ codigo: '4924800', texto: 'Transporte escolar' }] } });
ok(!vn.problemas.length && vn.linhas.filter(l => l.ok).length === 2, '16.02 com CNAE de transporte escolar: tudo certo');
vn = verificarNatureza({ doc: { codigoServico: '17.01', descricaoServico: 'Locação de veículo tipo pick-up sem motorista' }, cadastro: locadora, natureza: { id: 'demais_servicos', texto: 'x', ir: 4.8 } });
ok(vn.problemas.some(p => p.titulo.includes('locação de bem móvel')) && vn.problemas.some(p => p.titulo.includes('natureza do IRRF diferente de locação')), 'locação sem motorista');
ok(verificarNatureza({ doc: { codigoServico: '99.99' } }).problemas[0].nivel === 'erro', 'código inexistente é erro');
r = conferir({ doc: { ...docT, descricaoServico: 'TRANSPORTE ESCOLAR ROTA 06' }, cadastro: locadora, hoje: '2026-11-03' });
ok(r.verificacao.linhas.length >= 2 && tem(r, 'não corresponde à descrição'), 'verificação dentro da conferência');
console.log(falhas ? `${falhas} falha(s)` : 'fiscal: todos os testes passaram');
process.exit(falhas ? 1 : 0);

// ---------- falta para o diagnóstico ----------
{
  const { faltaParaDiagnostico } = await import('../assets/js/fiscal.js');
  const campos = d => faltaParaDiagnostico(d).map(f => f.campo);

  // logo depois de ler a chave: só identificação, nenhum valor
  const daChave = { origem: 'leitura', modelo: 'nfse', servico: true, cnpj: '10781677000168',
                    emissao: '2026-11-01', emissaoPresumida: true };
  assert.deepEqual(campos(daChave), ['valor', 'emissao', 'codigoServico'],
    'chave sozinha deixa valor, data e código em aberto');

  // a data presumida continua pendente mesmo preenchida: a chave só dá o mês
  assert.ok(campos({ ...daChave, valor: 1000, codigoServico: '16.01.01' }).includes('emissao'),
    'data vinda da chave precisa de confirmação do dia');
  assert.deepEqual(campos({ ...daChave, valor: 1000, codigoServico: '16.01.01', emissaoPresumida: false }), [],
    'confirmando o dia, nada mais falta');

  // nota de produto não tem código de tributação de serviço
  assert.deepEqual(campos({ modelo: '55', servico: false, valor: 500, emissao: '2026-11-10' }), [],
    'NF-e de produto não exige código de serviço');

  // valor zero ou negativo não serve de base
  assert.ok(campos({ ...daChave, valor: 0 }).includes('valor'), 'valor zero bloqueia');
  assert.ok(campos({ ...daChave, valor: -5 }).includes('valor'), 'valor negativo bloqueia');

  console.log('ok  falta para o diagnóstico');
}

// ---------- MEI volta a ser tratado ----------
{
  // Havia dois "else if (mei)" seguidos: o primeiro, de corpo vazio, engolia
  // todos os casos de MEI e o tratamento real virava código morto.
  const base = { origem: 'leitura', servico: true, modelo: 'nfse', valor: 1000, emissao: '2026-11-10',
    codigoServico: '07.02.00', localPrestacao: '3126901', municipioEmissor: '3126901',
    issValor: 50, issRetidoNota: true };
  const cad = { cnpj: '10781677000168', situacao: 'ATIVA', mei: true, simples: true,
    meiInicio: '2020-01-01', simplesInicio: '2020-01-01', fonte: 'RFB' };
  const r = conferir({ doc: base, cadastro: cad, naturezaId: 'servicos_gerais', hoje: '2026-11-16' });
  assert.equal(r.mei, true, 'MEI reconhecido na data');
  assert.match(r.iss.motivo, /DAS/, 'o motivo do ISS do MEI é preenchido');
  assert.ok(r.problemas.some(p => /MEI com ISS destacado/i.test(p.titulo)),
    'MEI com ISS retido na nota precisa ser apontado: não se retém ISS de MEI');
  console.log('ok  MEI tratado');
}

// ---------- ISS: onde o imposto é devido (LC 116/2003, art. 3º) ----------
{
  const cad = { cnpj: '10781677000168', situacao: 'ATIVA', simples: false, fonte: 'RFB' };
  // nota emitida em BH, serviço executado em Frei Inocêncio
  const base = { origem: 'leitura', servico: true, modelo: 'nfse', valor: 10000, emissao: '2026-11-10',
    municipioEmissor: '3106200', municipioEmissorNome: 'Belo Horizonte', localPrestacao: '3126901',
    issAliquota: 5, issValor: 500 };
  const roda = extra => conferir({ doc: { ...base, ...extra }, cadastro: cad,
    naturezaId: 'servicos_gerais', hoje: '2026-11-16' });

  // consultoria (17.01) não está nas exceções: o ISS é do município do prestador
  const consultoria = roda({ codigoServico: '17.01.00' });
  assert.equal(consultoria.iss.aplica, false, 'consultoria de empresa de fora não gera ISS aqui');
  assert.equal(consultoria.iss.valor, 0);
  assert.ok(consultoria.problemas.some(p => /devido em Belo Horizonte/.test(p.titulo)));

  // a mesma nota mandando reter aqui é erro: o mesmo ISS seria pago duas vezes
  const errada = roda({ codigoServico: '17.01.00', issRetidoNota: true });
  assert.ok(errada.problemas.some(p => p.nivel === 'erro' && /manda reter o ISS aqui/.test(p.titulo)),
    'ISS retido pelo tomador em serviço que não é daqui tem que ser erro');

  // obra (7.02) é exceção do inciso III: vale onde foi executada
  const obra = roda({ codigoServico: '07.02.00', issRetidoNota: true });
  assert.equal(obra.iss.aplica, true, 'obra executada aqui gera ISS aqui');
  assert.equal(obra.iss.valor, 500);
  assert.match(obra.localIss.inciso, /^III$/);

  // sem código não dá para aplicar a lei: cai no critério antigo em vez de chutar
  const semCodigo = roda({ codigoServico: '', issRetidoNota: true });
  assert.equal(semCodigo.iss.aplica, true, 'sem código, segue o que a nota declara');
  console.log('ok  ISS por local devido');
}

// ---------- retenções que a nota declara e a ferramenta não calcula ----------
{
  // NF 42 real: ENGEQUALITY (Contagem) para a Prefeitura, manutenção 14.01.01.
  // A nota retém PIS/COFINS/CSLL (4,65%); a conferência calcula IRRF e ISSQN.
  // Antes isso virava só "líquido diferente", sem dizer de onde vinham os R$ 78,12.
  const doc = { origem: 'pdf', servico: true, modelo: 'nfse', valor: 1680, emissao: '2026-11-13',
    municipioEmissor: '3118601', municipioEmissorNome: 'Contagem', localPrestacao: '3126901',
    codigoServico: '14.01.01', regimeNota: 'normal',
    issAliquota: 4, issValor: 67.20, issRetidoNota: false,
    irrfDestacado: 80.64, csrfRetido: 78.12,
    totalRetencoesNota: 158.76, liquidoNota: 1521.24 };
  const cad = { cnpj: '10781677000168', situacao: 'ATIVA', simples: false, fonte: 'RFB' };
  const r = conferir({ doc, cadastro: cad, hoje: '2026-11-16' });

  const linha = r.comparativo.find(l => /PIS\/COFINS\/CSLL/.test(l.item));
  assert.ok(linha, 'a retenção declarada aparece no comparativo com o nome dela');
  assert.equal(linha.nota, 78.12);
  assert.equal(linha.conferido, null, 'não é calculada: não se inventa um valor conferido');
  assert.equal(linha.diferenca, null, 'sem valor conferido não há diferença a apontar');

  const aviso = r.problemas.find(p => /diferença de .* é a retenção/.test(p.titulo));
  assert.ok(aviso, 'a diferença precisa ser nomeada, não só medida');
  assert.equal(aviso.nivel, 'alerta', 'não é erro do fornecedor: é retenção fora do escopo');
  assert.ok(!r.problemas.some(p => /Valor líquido da nota/.test(p.titulo)),
    'não repete o erro genérico de líquido quando a diferença já está explicada');

  // ISS: 14.01 não está nas exceções do art. 3º — é de Contagem, como a nota diz
  assert.equal(r.iss.aplica, false);
  assert.equal(r.localIss.aqui, false);
  console.log('ok  retenções declaradas e não calculadas');
}

// ---------- gravidade pelo impacto na liquidação ----------
{
  // Princípio: o que muda o valor a pagar é alerta/erro; o que a empresa só
  // declara e o Município não retém vira comunicação ao emitente.
  const cad = { cnpj: '10781677000168', situacao: 'ATIVA', simples: false, fonte: 'RFB' };
  const nf42 = { origem: 'pdf', servico: true, modelo: 'nfse', valor: 1680, emissao: '2026-11-13',
    municipioEmissor: '3118601', municipioEmissorNome: 'Contagem', localPrestacao: '3126901',
    codigoServico: '14.01.01', regimeNota: 'normal', issAliquota: 4, issValor: 67.20,
    issRetidoNota: false, irrfDestacado: 80.64, csrfRetido: 78.12,
    totalRetencoesNota: 158.76, liquidoNota: 1521.24 };
  const r = conferir({ doc: nf42, cadastro: cad, hoje: '2026-11-16' });

  assert.equal(r.situacao, 'ok',
    'retenção só declarada pelo emitente não pode bloquear um pagamento correto');
  const dec = r.problemas.find(p => p.impacto === 'declaracao');
  assert.ok(dec, 'o achado existe, classificado como declaração');
  assert.equal(dec.nivel, 'info');
  assert.ok(dec.aoEmitente, 'tem texto próprio dirigido ao emitente');

  // a carta fala com o fornecedor, não manda ele pagar
  const carta = mensagemFornecedor(r, nf42, cad);
  assert.match(carta, /não encontramos divergência que impeça o pagamento/);
  assert.match(carta, /Observação sobre o preenchimento da nota/);
  assert.ok(!/Providência solicitada/.test(carta),
    'sem divergência de pagamento não se pede providência');
  assert.match(carta, /O crédito será de R\$ 1\.599,36/);

  // já um erro que muda o pagamento continua bloqueando
  const comErro = conferir({ doc: { ...nf42, codigoServico: '07.02.00', issRetidoNota: true, issValor: 10 },
    cadastro: cad, hoje: '2026-11-16' });
  assert.notEqual(comErro.situacao, 'ok', 'divergência de ISS que muda o pagamento continua pesando');
  console.log('ok  gravidade por impacto na liquidação');
}
