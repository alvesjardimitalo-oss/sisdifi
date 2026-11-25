// Testes da leitura do DANFSe (dados fictícios, posições como no layout v2.0): node tests/danfse.test.mjs
import { lerDanfse } from '../assets/js/danfse-pdf.js';
let falhas = 0;
const ok = (c, m) => { if (!c) { falhas++; console.log('FALHA:', m); } };
const X = [30, 175, 330, 470];
const itens = [];
let y = 40;
const t = (x, yy, str) => itens.push({ x, y: yy, w: str.length * 4, str });
const lab = (col, rot, val) => { t(X[col], y, rot); if (val != null) t(X[col], y + 9, val); };
const linha = (passo = 22) => { y += passo; };
t(250, y, 'DANFSe v2.0'); t(470, y, 'Município: Exemplópolis / MG'); linha(30);
lab(0, 'CHAVE DE ACESSO DA NFS-E', '31134041122233300018100000000000001526106443009642'); linha(24);
lab(0, 'NÚMERO DA NFS-e', '15'); lab(1, 'COMPETÊNCIA DA NFS-E', '05/10/2026'); lab(2, 'DATA E HORA DA EMISSÃO DA NFS-E', '06/10/2026 10:00:00'); linha(26);
lab(0, 'PRESTADOR / FORNECEDOR'); lab(1, 'CNPJ / CPF / NIF', '11.222.333/0001-81'); linha();
lab(0, 'Nome / Nome Empresarial', 'TRANSPORTES FICTICIOS LTDA'); lab(2, 'Município / Sigla UF', 'Caratinga / MG'); lab(3, 'Código IBGE / CEP', '3113404 / 35.300-000'); linha();
lab(2, 'E-mail', 'contato@ficticio.com.br'); linha();
lab(0, 'Simples Nacional na Data de Competência', 'Não Optante'); lab(2, 'Regime de Apuração Tributária pelo SN', '-'); linha(26);
lab(0, 'TOMADOR / ADQUIRENTE'); lab(1, 'CNPJ / CPF / NIF', '16.945.990/0001-70'); linha();
lab(0, 'Nome / Nome Empresarial', 'PREFEITURA MUNICIPAL'); lab(2, 'Município / Sigla UF', 'Frei Inocêncio / MG'); lab(3, 'Código IBGE / CEP', '3126901 / 35.112-000'); linha(26);
lab(0, 'SERVIÇO PRESTADO'); lab(1, 'Código de Tributação Nacional / Municipal', '16.02.01 / -'); lab(3, 'Local da Prestação / Sigla UF / País', 'Frei Inocêncio / MG'); linha(32);
lab(0, 'Descrição do Serviço', 'TRANSPORTE ESCOLAR ROTA 01'); t(X[0], y + 18, 'PERIODO 09/2026'); linha(36);
lab(0, 'TRIBUTAÇÃO MUNICIPAL (ISSQN)'); lab(1, 'Tipo de Tributação do ISSQN', 'Operação Tributável'); lab(2, 'Município / Sigla UF / País de Incidência do ISSQN', 'Frei Inocêncio'); linha();
lab(0, 'BC ISSQN', 'R$ 10.000,00'); lab(1, 'Alíquota Aplicada', '5,00 %'); lab(2, 'Retenção do ISSQN', 'Retido pelo Tomador'); lab(3, 'ISSQN Apurado', 'R$ 500,00'); linha(24);
lab(0, 'TRIBUTAÇÃO FEDERAL (EXCETO CBS)'); lab(1, 'IRRF', 'R$ 240,00'); lab(2, 'Contribuição Previdenciária - Retida', '-'); linha(24);
lab(0, 'TRIBUTAÇÃO IBS / CBS'); lab(1, 'CST / cClassTrib', '000 / 000001'); lab(2, 'Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF', '060101 / 3118601 / Contagem'); linha();
lab(0, 'Exclusões e Reduções da Base de Cálculo', 'R$ 865,00'); lab(1, 'Base de Cálculo Após Exclusões e Reduções', 'R$ 9.135,00'); lab(3, 'Alíquota - IBS UF / IBS Mun', '0,10 % / 0,00 %'); linha();
lab(0, 'Valor Total Apurado - IBS', 'R$ 9,14'); lab(1, 'Alíquota - CBS', '0,90 %'); lab(3, 'Valor Total Apurado - CBS', 'R$ 82,22'); linha(24);
lab(0, 'VALOR TOTAL DA NFS-E'); lab(1, 'VALOR DA OPERAÇÃO / SERVIÇO', 'R$ 10.000,00'); linha();
lab(0, 'Total das Retenções (ISSQN / Federais)', 'R$ 740,00'); lab(1, 'VALOR LÍQUIDO DA NFS-e', 'R$ 9.260,00'); lab(3, 'VALOR LÍQUIDO DA NFS-e + IBS/CBS', 'R$ 9.260,00');

const d = lerDanfse(itens);
ok(d.chave.length === 50 && d.numero === '15' && d.emissao === '2026-10-05', 'chave, número, competência');
ok(d.cnpj === '11222333000181' && d.nome === 'TRANSPORTES FICTICIOS LTDA' && d.email === 'contato@ficticio.com.br', 'prestador (não o tomador)');
ok(d.municipioEmissorIbge === '3113404' && d.regimeNota === 'normal', 'emissor e Simples');
ok(d.codigoServico === '16.02.01' && d.localPrestacaoTexto === 'Frei Inocêncio / MG' && d.incidenciaTexto === 'Frei Inocêncio' && !d.incidenciaIbge, 'serviço, local e incidência');
ok(d.descricaoServico === 'TRANSPORTE ESCOLAR ROTA 01 PERIODO 09/2026', 'descrição em duas linhas');
ok(d.issAliquota === 5 && d.issValor === 500 && d.issRetidoNota === true && d.irrfDestacado === 240, 'ISS e IRRF');
ok(d.valor === 10000 && d.totalRetencoesNota === 740 && d.liquidoNota === 9260, 'valores');
ok(d.ibscbs.cst === '000' && d.ibscbs.base === 9135 && d.ibscbs.pCBS === 0.9 && d.ibscbs.pIBSUF === 0.1 && d.ibscbs.vCBS === 82.22 && d.ibscbs.vIBS === 9.14, 'IBS/CBS');
ok(d.retencoesNota.length === 0, 'nota sem retenção federal não inventa linha');

// --- NF 42 real: retenção de contribuições sociais, com o nome impresso na nota ---
{
  const it = []; let yy = 40;
  const tt = (x, y2, str) => it.push({ x, y: y2, w: str.length * 4, str });
  const l2 = (col, rot, val) => { tt(X[col], yy, rot); if (val != null) tt(X[col], yy + 9, val); };
  const ln = (passo = 22) => { yy += passo; };
  tt(250, yy, 'DANFSe v2.0'); ln(30);
  l2(0, 'NÚMERO DA NFS-e', '42'); l2(1, 'COMPETÊNCIA DA NFS-E', '13/11/2026'); ln(26);
  l2(0, 'PRESTADOR / FORNECEDOR'); l2(1, 'CNPJ / CPF / NIF', '10.781.677/0001-68'); ln();
  l2(0, 'Nome / Nome Empresarial', 'ENGEQUALITY LTDA'); l2(3, 'Código IBGE / CEP', '3118601 / 32.000-000'); ln(26);
  l2(0, 'TOMADOR / ADQUIRENTE'); l2(1, 'CNPJ / CPF / NIF', '16.945.990/0001-70'); ln(26);
  l2(0, 'SERVIÇO PRESTADO'); l2(1, 'Código de Tributação Nacional / Municipal', '14.01.01 / -');
  l2(3, 'Local da Prestação / Sigla UF / País', 'Frei Inocêncio / MG'); ln(32);
  l2(0, 'TRIBUTAÇÃO MUNICIPAL (ISSQN)'); l2(1, 'Alíquota Aplicada', '4,00 %');
  l2(2, 'Retenção do ISSQN', 'Não Retido'); l2(3, 'ISSQN Apurado', 'R$ 67,20'); ln(24);
  l2(0, 'TRIBUTAÇÃO FEDERAL (EXCETO CBS)'); l2(1, 'IRRF', 'R$ 80,64');
  l2(2, 'Contribuição Previdenciária - Retida', '-');
  l2(3, 'Contribuições Sociais - Retidas', 'R$ 78,12'); ln();
  l2(0, 'Descrição Contrib. Sociais - Retidas', 'PIS/COFINS/CSLL Retidos'); ln(24);
  l2(0, 'VALOR TOTAL DA NFS-E'); l2(1, 'VALOR DA OPERAÇÃO / SERVIÇO', 'R$ 1.680,00'); ln();
  l2(0, 'Total das Retenções (ISSQN / Federais)', 'R$ 158,76');
  l2(1, 'VALOR LÍQUIDO DA NFS-e', 'R$ 1.521,24');

  const n = lerDanfse(it);
  ok(n.csrfRetido === 78.12, 'lê o valor da retenção de contribuições sociais');
  ok(n.csrfRotulo === 'Contribuições Sociais Retidas', 'guarda o nome como está impresso na nota, não um apelido nosso: ' + n.csrfRotulo);
  ok(n.csrfDescricao === 'PIS/COFINS/CSLL Retidos', 'lê a descrição que diz quais contribuições: ' + n.csrfDescricao);
  ok(n.inssRetido == null, 'previdenciária em branco não vira zero com nome');
  ok(n.retencoesNota.length === 1 && n.retencoesNota[0].valor === 78.12
    && n.retencoesNota[0].rotulo === 'Contribuições Sociais Retidas', 'a varredura pega a retenção pelo nome dela');
}

let erro = ''; try { lerDanfse([{ x: 0, y: 0, w: 10, str: 'Relatório qualquer' }]); } catch (e) { erro = e.message; }
ok(/não parece ser um DANFSe/.test(erro), 'rejeita PDF que não é DANFSe');
console.log(falhas ? `${falhas} falha(s)` : 'danfse: todos os testes passaram');
process.exit(falhas ? 1 : 0);
