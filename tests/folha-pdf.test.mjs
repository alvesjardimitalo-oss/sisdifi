// Testes da leitura da Folha de Pagamento (dados fictícios)
import assert from 'node:assert/strict';
import { analisarFolha, cruzarFolha, cargoEquivale, cargoDaFolha } from '../assets/js/folha-pdf.js';

const linhas = `
UF: MINAS GERAIS   F O L H A D E P A G A M E N T O
REFERENCIA: OUTUBRO/2026
MATRÍCULA  NOME DO SERVIDOR  NÍVEL/ PADRÃO - FUNÇÃO  ADMISSÃO  SITUAÇÃO
LOTAÇÃO:        002          - PREF. MUNIC. DE EXEMPLO
                002.001      - GABINETE DO PREFEITO
                002.001.201  - MANUT. DO GAB. E SECRET. DE GOVERNO
000101     /6   FULANO DE TAL                 1_20 / 0001       - PREFEITO                 01/01/2021       AGENTES POLÍTICOS
                  103           P       SUBSIDIO        220,00     10.000,00
                                                   TOTAL....:      10.000,00
LOTAÇÃO:        002          - PREF. MUNIC. DE EXEMPLO
                002.004      - SECRETARIA MUNIC. DE EDUCACAO
                002.004.217  - MANUT. ENSINO FUNDAMENTAL 70%
                002.004.217.00002 - PESSOAL EFETIVO
000202   /3   BELTRANA DA SILVA NASCIMENTO
                              II               / 0024      - PROFESSOR GRADUADO E      01/04/2020       EFETIVO
               100         P      VENCIMENTO MENSAL     125,00     3.000,00
000303   /1   CICRANO PEREIRA DE OLIVEIRA1_20 / 0025   - DIRETOR DE DEPART. DE TURISMO 10/02/2025
                                                  E                       COMISSIONADO
               100         P      VENCIMENTO MENSAL     200,00     2.000,00
000404   /6   MARIA SOUZA          1_20 / 656    - ASSISTENTE SOCIAL DA EDUCAÇÃO01/01/2026     CONTRATADO -
               100         P      VENCIMENTO MENSAL     200,00     2.000,00
`.split('\n');

const f = analisarFolha(linhas);
assert.equal(f.length, 4);
assert.deepEqual(f.map(x => x.matricula), ['000101', '000202', '000303', '000404']);
assert.equal(f[0].funcao, 'PREFEITO');
assert.equal(f[0].situacao, 'AGENTES POLÍTICOS');
assert.equal(f[0].secretaria_texto, 'GABINETE DO PREFEITO');
assert.equal(f[1].nome, 'BELTRANA DA SILVA NASCIMENTO');
assert.equal(f[1].secretaria_texto, 'SECRETARIA MUNIC. DE EDUCACAO');
assert.equal(f[2].nome, 'CICRANO PEREIRA DE OLIVEIRA');
assert.equal(f[2].funcao, 'DIRETOR DE DEPART. DE TURISMO E');
assert.equal(f[2].situacao, 'COMISSIONADO');
assert.equal(f[3].funcao, 'ASSISTENTE SOCIAL DA EDUCAÇÃO');
assert.equal(f[3].situacao, 'CONTRATADO');

assert.equal(cargoDaFolha('PROFESSOR GRADUADO E'), 'Professor Graduado');
assert.equal(cargoDaFolha('MONITOR DE ESPORTE CREAS/CRAS'), 'Monitor de Esporte CREAS/CRAS');
assert.equal(cargoDaFolha('COORDENADOR (FAMILIA'), 'Coordenador (familia)');
assert.ok(cargoEquivale('Diretor de Departamento de Educação Infantil', 'DIRETOR (A) DE DEPARTAMENTO DE'));
assert.ok(!cargoEquivale('Motorista', 'PROFESSOR GRADUADO'));

const secretarias = [{ id: 'gab', nome: 'Gabinete' }, { id: 'edu', nome: 'Educação' }, { id: 'tur', nome: 'Turismo e Cultura' }];
const servidores = [
  { id: 'a', nome: 'Fulano de Tal', matricula: '000101', cargo_funcao: '', secretaria_id: 'gab' },
  { id: 'b', nome: 'Beltrana da Silva Nascimento', matriculas: ['000202'], cargo_funcao: 'Professor Graduado', secretaria_id: 'gab' },
  { id: 'c', nome: 'Cicrano Pereira de Oliveira', cargo_funcao: 'Assessor', secretaria_id: 'tur' },
  { id: 'd', nome: 'Pessoa Antiga', matricula: '000999', cargo_funcao: 'Vigia' }
];
const r = cruzarFolha(f, servidores, secretarias);
assert.equal(r.itens[0].por, 'matricula');
assert.deepEqual(r.itens[0].mudancas, { cargo_funcao: 'Prefeito', vinculo: 'AGENTES POLÍTICOS' });
assert.equal(r.itens[1].mudancas.cargo_funcao, undefined, 'cargo igual não muda');
assert.equal(r.itens[1].mudancas.secretaria_id, 'edu');
assert.equal(r.itens[2].por, 'nome');
assert.equal(r.itens[2].mudancas.matricula, '000303');
assert.equal(r.itens[3].servidor, null);
assert.deepEqual(r.fora.map(s => s.id), ['d']);
console.log('folha-pdf: ok');
