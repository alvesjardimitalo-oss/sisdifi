import assert from 'node:assert/strict';
import { localDevidoIss, issDevidoAqui, ONDE, partesDoCodigo } from '../assets/js/iss-local.js';

const FI = '3126901';          // Frei Inocêncio
const FORA = '3106200';        // Belo Horizonte

// ---- leitura do código ----
assert.deepEqual(partesDoCodigo('16.01.01'), { item: '16', subitem: '16.01' });
assert.deepEqual(partesDoCodigo('1601'), { item: '16', subitem: '16.01' });
assert.deepEqual(partesDoCodigo('07.02.00'), { item: '7', subitem: '7.02' });
assert.deepEqual(partesDoCodigo(''), { item: '', subitem: '' });

// ---- a regra geral: fora das exceções, o ISS é do município do prestador ----
{
  // 17.01 consultoria/assessoria não está nas exceções
  const r = localDevidoIss('17.01.00');
  assert.equal(r.onde, ONDE.PRESTADOR);
  assert.match(r.fundamento, /caput/);
  // executado aqui, prestador de fora → NÃO é de Frei Inocêncio
  const d = issDevidoAqui({ codigoServico: '17.01.00', ibgeMunicipio: FI, ibgePrestador: FORA, ibgePrestacao: FI });
  assert.equal(d.aqui, false, 'consultoria de empresa de fora não gera ISS aqui, mesmo executada aqui');
}

// ---- exceções: vale onde o serviço foi executado ----
{
  const obra = issDevidoAqui({ codigoServico: '07.02.00', ibgeMunicipio: FI, ibgePrestador: FORA, ibgePrestacao: FI });
  assert.equal(obra.aqui, true, 'obra executada aqui gera ISS aqui mesmo com prestador de fora');
  assert.equal(obra.inciso, 'III');

  const vigilancia = issDevidoAqui({ codigoServico: '11.02.00', ibgeMunicipio: FI, ibgePrestador: FORA, ibgePrestacao: FI });
  assert.equal(vigilancia.aqui, true);
  assert.equal(vigilancia.inciso, 'XVI');

  // a mesma obra executada em outra cidade não é nossa
  const obraFora = issDevidoAqui({ codigoServico: '07.02.00', ibgeMunicipio: FI, ibgePrestador: FI, ibgePrestacao: FORA });
  assert.equal(obraFora.aqui, false, 'obra executada fora não gera ISS aqui, mesmo com prestador daqui');
}

// ---- item inteiro, e a exceção dentro da exceção ----
{
  assert.equal(localDevidoIss('16.01.01').inciso, 'XIX', 'transporte municipal: item 16 inteiro');
  assert.equal(localDevidoIss('12.07.00').inciso, 'XVIII', 'diversões: item 12');
  assert.equal(localDevidoIss('12.13.00').onde, ONDE.PRESTADOR, '12.13 é ressalvado do inciso XVIII');
  assert.equal(localDevidoIss('20.01.00').inciso, 'XXII', 'portuários: item 20 inteiro');
}

// ---- incisos que mandam para o tomador ----
{
  const maoDeObra = issDevidoAqui({ codigoServico: '17.05.00', ibgeMunicipio: FI, ibgePrestador: FORA, ibgePrestacao: FORA });
  assert.equal(maoDeObra.aqui, true, 'mão de obra: ISS no tomador, aqui, ainda que tudo o mais seja fora');
  assert.equal(maoDeObra.inciso, 'XX');
  assert.equal(issDevidoAqui({ codigoServico: '15.09.00', ibgeMunicipio: FI }).inciso, 'XXV', 'leasing vai ao tomador');
}

// ---- vetados não entram ----
{
  // 7.13 e 7.15 não têm inciso próprio: caem na regra geral
  assert.equal(localDevidoIss('07.13.00').onde, ONDE.PRESTADOR);
  assert.equal(localDevidoIss('07.15.00').onde, ONDE.PRESTADOR);
}

// ---- sem informação, não afirma ----
{
  const semCodigo = localDevidoIss('');
  assert.equal(semCodigo.indefinido, true, 'sem código não dá para decidir');
  assert.equal(issDevidoAqui({ codigoServico: '', ibgeMunicipio: FI }).aqui, null);
  // exceção de local de prestação sem saber onde foi executado
  assert.equal(issDevidoAqui({ codigoServico: '07.02.00', ibgeMunicipio: FI, ibgePrestador: FORA }).aqui, null,
    'obra sem local de execução informado não permite afirmar');
}

console.log('iss-local: todos os testes passaram');
