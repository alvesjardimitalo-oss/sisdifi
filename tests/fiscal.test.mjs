// Testes da conferência fiscal: node tests/fiscal.test.mjs
import { descreverTributacao, lerCodigo, cnpjValido, lerXML, conferir, irNoTexto, consultarCnpj, normalizarCadastro, sugerirNatureza, optanteNaData } from '../assets/js/fiscal.js';
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
ok(r.iss.reter && r.iss.valor === 50 && r.liquido === 1000 - 48 - 50 && tem(r, 'Nota emitida em outro município'), 'emitida fora, prestada aqui: retém ISS 5%');
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
console.log(falhas ? `${falhas} falha(s)` : 'fiscal: todos os testes passaram');
process.exit(falhas ? 1 : 0);
