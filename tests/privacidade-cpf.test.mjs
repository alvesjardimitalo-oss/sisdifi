import assert from 'node:assert/strict';
import { cpfSituacao } from '../assets/js/privacidade.js';
assert.equal(cpfSituacao({cpf:'52998224725'}),'valido');
assert.equal(cpfSituacao({cpf:'11111111111',cpf_valido:true}),'invalido');
assert.equal(cpfSituacao({cpf:'***.982.247-**',cpf_valido:true}),'valido');
assert.equal(cpfSituacao({cpf_mascara:'***.982.247-**',cpf_valido:false}),'nao_verificado');
assert.equal(cpfSituacao({cpf:'',cpf_valido:false}),'ausente');
assert.equal(cpfSituacao({cpf_valido:true}),'valido');
