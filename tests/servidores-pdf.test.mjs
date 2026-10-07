// Teste da leitura da relação de servidores: node tests/servidores-pdf.test.mjs  (dados fictícios)
import assert from 'node:assert/strict';
import { analisarRelacaoServidores, compararComCadastro, secretariaDaLotacao, grupoSugerido, nomeProprio } from '../assets/js/servidores-pdf.js';

const texto = `
           UF: MINAS GERAIS                                                     07 out 2026 07:41
           MUNICÍPIO: FREI INOCENCIO          CADASTRO DE PESSOAL - 05          FOLHA:       1
                                                   POR LOTAÇÃO
           ENTIDADE: PREFEITURA MUNICIPAL
PREFEITURA MUNICIPAL
TRANSPORTE ESCOLAR ENS.FUNDAMENTAL
MANUT. TRANSPORTE ESCOLAR
Matrícula CUC           Nome Servidor                       C.P.F.           PIS/PASEP
                                                                                           Titulo Eleitoral
000061    000002645     FULANO DE TAL                       529.982.247-25   12282248327   000 - 0000 - 000000000000
TOTAL DE SERVIDORES:   1
PREF. MUNIC. DE FREI INOCENCIO
SECRETARIA MUNIC. DE ACAO SOCIAL
MANUTENCAO DA SEC. DE AÇAO SOCIAL
           UF: MINAS GERAIS                                                     07 out 2026 07:41
           MUNICÍPIO: FREI INOCENCIO          CADASTRO DE PESSOAL - 05          FOLHA:       2
AGENTE POLITICO
Matrícula CUC           Nome Servidor                       C.P.F.           PIS/PASEP
000070    000002646     BELTRANA DOS SANTOS                 111.444.777-35   12282248327
000071    000002647     CICRANO SILVA                       111.444.777-00   12282248327
000072    000002648     FULANO DE TAL                       529.982.247-25   12282248327
`.split('\n');

const l = analisarRelacaoServidores(texto);
assert.equal(l.length, 4);
assert.equal(l[0].secretaria_texto, 'TRANSPORTE ESCOLAR ENS.FUNDAMENTAL / MANUT. TRANSPORTE ESCOLAR');
assert.equal(l[1].secretaria_texto, 'SECRETARIA MUNIC. DE ACAO SOCIAL', 'lotação atravessa a quebra de página');
assert.equal(l[1].vinculo, 'AGENTE POLITICO');
assert.equal(grupoSugerido(l[1].vinculo), 'VICE_SECRETARIO_JURIDICO');
assert.equal(nomeProprio('BELTRANA DOS SANTOS'), 'Beltrana dos Santos');

const secs = [{ id: 'ed', nome: 'Educação' }, { id: 'tr', nome: 'Transporte' }, { id: 'as', nome: 'Assistência Social' }];
assert.equal(secretariaDaLotacao(l[0].secretaria_texto, secs), 'ed', 'transporte escolar é da Educação');
assert.equal(secretariaDaLotacao(l[1].secretaria_texto, secs), 'as');

const c = compararComCadastro(l, [{ id: 'x', nome: 'Beltrana dos Santos', cpf: '11144477735' }, { id: 'y', nome: 'Cicrano Silva', cpf: '00000000000' }]);
assert.equal(c.length, 3, 'CPF repetido na relação vira uma pessoa');
assert.deepEqual(c.find(p => p.nome === 'FULANO DE TAL').matriculas, ['000061', '000072']);
assert.equal(c.find(p => p.nome === 'FULANO DE TAL').situacao, 'novo');
assert.equal(c.find(p => p.nome === 'BELTRANA DOS SANTOS').situacao, 'existe');
assert.equal(c.find(p => p.nome === 'CICRANO SILVA').situacao, 'cpf_invalido');
console.log('servidores-pdf: ok');
