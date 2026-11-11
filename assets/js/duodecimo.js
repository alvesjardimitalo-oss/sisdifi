// SISDIFI - Controle de repasses do duodécimo à Câmara Municipal.
// Valores em centavos; competência não é a mesma coisa que a data do pagamento.
export const META_MENSAL_PADRAO = 14000000;
export const MESES_DUODECIMO = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export function centavosDuodecimo(valor) {
  const texto = String(valor ?? '').trim().replace(/^R\$\s*/,'').replace(/\s/g,'');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(texto)) {
    throw Error('Informe um valor em reais, como 25.000,00.');
  }
  const [reais, centavos=''] = texto.split(',');
  const inteiro = Number(reais.replace(/\./g,''));
  const total = inteiro * 100 + Number(centavos.padEnd(2,'0'));
  if (!Number.isSafeInteger(total) || total <= 0 || total > 100000000000) {
    throw Error('Informe um valor positivo e válido.');
  }
  return total;
}

export function dinheiroDuodecimo(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}
export function dataISOValida(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))) return false;
  const [ano,mes,dia] = s.split('-').map(Number);
  const d = new Date(Date.UTC(ano,mes-1,dia));
  return d.getUTCFullYear()===ano && d.getUTCMonth()+1===mes && d.getUTCDate()===dia;
}
export function dataDuodecimoBR(iso) {
  return dataISOValida(iso) ? iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4) : '—';
}
export function mesDoAno(mes) {return String(mes).padStart(2,'0');}
export function competenciaDuodecimo(ano,mes) {
  return String(ano)+'-'+mesDoAno(mes);
}
export function validarRepasse(dados, ano) {
  const numero = String(dados.numeroOP || '').trim();
  if (!numero || numero.length > 80) throw Error('Informe o número da OP (até 80 caracteres).');
  if (!/^\d{4}$/.test(String(ano)) || Number(ano)<2000 || Number(ano)>2100) throw Error('Ano inválido.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(dados.competencia || '') || !dados.competencia.startsWith(String(ano)+'-')) throw Error('Competência inválida.');
  if (!dataISOValida(dados.dataOP)) throw Error('Informe a data de emissão da OP.');
  if (dados.dataRepasse && !dataISOValida(dados.dataRepasse)) throw Error('Informe uma data real de repasse válida.');
  const valorCentavos = Number.isSafeInteger(dados.valorCentavos) ? dados.valorCentavos : centavosDuodecimo(dados.valor);
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos<=0 || valorCentavos>100000000000) throw Error('Valor da OP inválido.');
  const observacao = String(dados.observacao || '').trim();
  if (observacao.length>500) throw Error('Observação limitada a 500 caracteres.');
  return { numeroOP:numero, competencia:dados.competencia, dataOP:dados.dataOP,
    dataRepasse:dados.dataRepasse||'', valorCentavos, observacao };
}
export function repassesAtivos(documento) {
  return Object.entries(documento?.repasses || {}).filter(([,r])=>r && !r.anulado)
    .map(([id,r])=>({ id,...r })).filter(r=>/^(?:19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(r.competencia));
}
export function resumoDuodecimo(repasses, metaMensal = META_MENSAL_PADRAO, ano) {
  if (!Number.isSafeInteger(metaMensal) || metaMensal<=0) throw Error('Meta mensal inválida.');
  const meses = MESES_DUODECIMO.map((nome,i)=>{
    const mes = mesDoAno(i+1), competencia = String(ano)+'-'+mes;
    const rs = repasses.filter(r=>r.competencia===competencia && !r.anulado);
    const pagos = rs.filter(r=>dataISOValida(r.dataRepasse));
    const emitidos = rs.filter(r=>!dataISOValida(r.dataRepasse));
    const pago = pagos.reduce((n,r)=>n+r.valorCentavos,0);
    const emAberto = emitidos.reduce((n,r)=>n+r.valorCentavos,0);
    const saldo = metaMensal-pago;
    return {mes,nome,competencia,repasses:rs,pagos,emitidos,pago,emAberto,saldo,meta:metaMensal,
      percentual:Math.min(100,(pago/metaMensal)*100),
      situacao:pago>=metaMensal?'Integral':pago>0?'Parcial':'Não realizado'};
  });
  const pago=meses.reduce((n,m)=>n+m.pago,0);
  const emAberto=meses.reduce((n,m)=>n+m.emAberto,0);
  return {meses,pago,emAberto,metaTotal:metaMensal*12,saldo:metaMensal*12-pago,
    mesesIntegrais:meses.filter(m=>m.pago>=metaMensal).length,
    totalOPs:meses.reduce((n,m)=>n+m.repasses.length,0)};
}
