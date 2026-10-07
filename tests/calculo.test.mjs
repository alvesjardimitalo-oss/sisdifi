// Testes do motor de cálculo: node tests/calculo.test.mjs [registros_antigos.json]
import { calcularDiaria, faixaDistancia, cpfValido, periodosSobrepostos, valorPorExtenso, analisarPix } from '../assets/js/calculo.js';
import fs from 'node:fs';
let falhas = 0;
const ok = (cond, msg) => { if (!cond) { falhas++; console.log('FALHA:', msg); } };

// Faixas
ok(faixaDistancia(100) === '0_149', '100');
ok(faixaDistancia(149.4) === '0_149', '149,4 deve ser 0_149 (bug antigo)');
ok(faixaDistancia(150) === '150_300', '150');
ok(faixaDistancia(300) === '150_300', '300 inclusive');
ok(faixaDistancia(300.01) === 'ACIMA_300', '300,01');

const c = (saida, retorno, km = 50, grupo = 'DEMAIS_SERVIDORES') => calcularDiaria({ grupo, km, saida, retorno });
let r = c('2026-03-10T08:00', '2026-03-10T13:59'); ok(r.valor_total === 0, '<6h');
r = c('2026-03-10T08:00', '2026-03-10T14:00'); ok(r.quantidade_alimentacao === 1 && r.valor_total === 60, '6h = alimentação');
r = c('2026-03-10T08:00', '2026-03-10T20:00'); ok(r.quantidade_alimentacao === 1, '12h = alimentação');
r = c('2026-03-10T08:00', '2026-03-10T20:01'); ok(r.quantidade_simples === 1 && r.valor_total === 150, '>12h simples');
r = c('2026-03-10T08:00', '2026-03-11T08:00', 120); ok(r.quantidade_pernoite === 1 && r.valor_total === 200, '24h pernoite (>=100 km)');
r = c('2026-03-10T08:00', '2026-03-11T08:00', 50); ok(r.quantidade_pernoite === 1 && r.valor_total === 150, 'Art. 7º § 2º: <100 km com pernoite paga valor simples');
r = c('2026-03-10T08:00', '2026-03-12T22:00', 99.9); ok(r.valor_total === 150 * 3, 'Art. 7º § 2º: 2 períodos + simples');
r = c('2026-03-10T08:00', '2026-03-11T08:00', 100); ok(r.valor_total === 200, '100 km exatos já não é "inferior a 100"');
const dm = (s1, s2, km = 0) => calcularDiaria({ grupo: 'DEMAIS_SERVIDORES', km, saida: s1, retorno: s2, dentroMunicipio: true });
r = dm('2026-03-10T08:00', '2026-03-10T15:00'); ok(r.valor_total === 30 && r.quantidade_alimentacao === 1, 'Art. 6º § 2º: dentro do município 7h = 50% alimentação');
r = dm('2026-03-10T08:00', '2026-03-10T13:00'); ok(r.valor_total === 0, 'dentro do município <6h = 0');
r = c('2026-03-18T21:00', '2026-03-21T19:10', 349.35); ok(r.quantidade_pernoite === 2 && r.quantidade_simples === 1 && r.valor_total === 1150, 'caso 0014/2026');
ok(c('2026-03-10T08:00', '2026-03-10T08:00').erro, 'retorno = saída');
ok(c('x', 'y').erro, 'datas inválidas');
ok(calcularDiaria({ grupo: 'X', km: 1, saida: '2026-01-01T00:00', retorno: '2026-01-02T00:00' }).erro, 'grupo inválido');
// CPF
ok(cpfValido('529.982.247-25'), 'cpf válido'); ok(!cpfValido('111.111.111-11'), 'cpf repetido'); ok(!cpfValido('52998224724'), 'dv errado');
ok(periodosSobrepostos('2026-01-01T08:00','2026-01-01T18:00','2026-01-01T17:00','2026-01-02T08:00'), 'sobreposição');
ok(!periodosSobrepostos('2026-01-01T08:00','2026-01-01T18:00','2026-01-01T18:00','2026-01-02T08:00'), 'encostado não sobrepõe');

ok(valorPorExtenso(750) === 'setecentos e cinquenta reais', 'extenso 750');
ok(valorPorExtenso(7560) === 'sete mil quinhentos e sessenta reais', 'extenso 7560');
ok(valorPorExtenso(1300) === 'mil e trezentos reais', 'extenso 1300');
ok(valorPorExtenso(30.5) === 'trinta reais e cinquenta centavos', 'extenso centavos');

ok(analisarPix('529.982.247-25').tipo === 'CPF', 'pix cpf');
ok(analisarPix('(33) 99855-6503').valor === '+5533998556503', 'pix telefone');
ok(analisarPix('a@b.com').tipo === 'E-mail', 'pix email');
ok(!analisarPix('12345').ok, 'pix inválido');

// Comparação com o banco antigo (opcional)
const arq = process.argv[2];
if (arq && fs.existsSync(arq)) {
  const rows = JSON.parse(fs.readFileSync(arq, 'utf8'));
  let iguais = 0; const dif = [];
  for (const o of rows) {
    const n = calcularDiaria({ grupo: o.grupo_valor, km: o.distancia_km, saida: o.data_hora_saida, retorno: o.data_hora_retorno });
    const mesmo = n.quantidade_pernoite === o.quantidade_pernoite && n.quantidade_simples === o.quantidade_simples &&
      n.quantidade_alimentacao === o.quantidade_alimentacao && Math.abs(n.valor_total - o.valor_total) < 0.005;
    if (mesmo) iguais++; else dif.push(`${o.numero}: antigo ${o.valor_total} (${o.faixa_distancia}, P${o.quantidade_pernoite}/S${o.quantidade_simples}/A${o.quantidade_alimentacao}) × novo ${n.valor_total} (${n.faixa_texto}, P${n.quantidade_pernoite}/S${n.quantidade_simples}/A${n.quantidade_alimentacao}) grupo atual ${o.grupo_valor}`);
  }
  console.log(`Banco antigo: ${iguais}/${rows.length} idênticos.`);
  dif.forEach(d => console.log('  ≠', d));
}
console.log(falhas ? `${falhas} falha(s)` : 'Todos os testes passaram.');
process.exit(falhas ? 1 : 0);
