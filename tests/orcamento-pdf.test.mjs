// Teste da leitura do "Demonstrativo da Despesa Fixada": node tests/orcamento-pdf.test.mjs
import assert from 'node:assert/strict';
import { analisarOrcamento, ehDiaria } from '../assets/js/orcamento-pdf.js';

const texto = `
              UF: MINAS GERAIS                                                                          07 jan 2026 10:07
                                                           DEMONSTRATIVO DA DESPESA FIXADA
              ENTIDADE: PREFEITURA MUNICIPAL                                                            ORÇAMENTO
                                                                                                           2026
CÓDIGO DA DESPESA       FICHA     F.RECURSO       ESPECIFICAÇÃO DA DESPESA                               AUTORIZADO
02                                               PREFEITURA MUNICIPAL FREI INOCENCIO                  62.108.000,00
02.05                                            SECRETARIA MUNICIPAL DE SAUDE                        19.345.000,00
02.05.02                                         FUNDO MUNICIPAL DE SAUDE                             13.085.000,00
     10                                          Saude                                                13.085.000,00
     10.301.0013.2045                            MANUTENÇÃO ATENÇÃO BASICA                             9.000.000,00
          3.3.90.14.00      228                  Diárias - Pessoal Civil                                 130.000,00
                                   1.600.000.0000 Transf. Fundo/Fundo Recur. SUS Gov.Fed. - Bl.            10.000,00
                                   1.621.000.0000 Transf. Fundo/Fundo Recur. SUS proven. Gov.              10.000,00
            UF: MINAS GERAIS                                                                     07 jan 2026 10:07
            MUNICÍPIO: FREI INOCENCIO                                                           FOLHA:         2
CÓDIGO DA DESPESA     FICHA     F.RECURSO       ESPECIFICAÇÃO DA DESPESA                          AUTORIZADO
                                   1.720.000.0000 Transf.União Ref.Part.Explor.Petr Rec Gas Nat FEP        10.000,00
                                   1.500.000.0000 Recursos não vinculados de Impostos                    100.000,00
          3.3.90.30.00      229                  Material de Consumo                                   2.510.000,00
                                   1.621.000.0000 Transf. Fundo/Fundo Recur. SUS proven. Gov.          2.510.000,00
`.split('\n');

const r = analisarOrcamento(texto);
assert.equal(r.ano, 2026);
assert.deepEqual(r.orgao, { codigo: '02.05', nome: 'SECRETARIA MUNICIPAL DE SAUDE' });
assert.deepEqual(r.unidades, [{ codigo: '02.05.02', nome: 'FUNDO MUNICIPAL DE SAUDE' }]);
assert.equal(r.fichas.length, 5);
const f228 = r.fichas.filter(f => f.ficha === '228');
assert.equal(f228.length, 4, 'fontes continuam depois da quebra de página');
assert.equal(f228[3].fonte_codigo, '1.500.000.0000');
assert.equal(f228[3].autorizado, 100000);
assert.equal(f228[0].acao_codigo, '10.301.0013.2045');
assert.equal(r.fichas.filter(ehDiaria).length, 4);
assert.deepEqual(r.avisos, []);
console.log('orcamento-pdf: ok');
