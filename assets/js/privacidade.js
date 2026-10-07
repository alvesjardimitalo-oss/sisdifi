// SISDIFI — Dados pessoais dos servidores (LGPD)
// CPF e chave Pix ficam em "servidores_privado/{id}", que só a Contabilidade, o RH, a consulta e a secretaria do
// próprio servidor leem. O cadastro público ("servidores") guarda nome, cargo, categoria e indicadores sem o dado:
// cpf_mascara ("***.456.789-**"), cpf_valido e tem_pix. O índice "cpfs/{cpf}" só responde a quem já sabe o CPF
// completo (não lista), para encontrar o servidor e evitar cadastro duplicado.
import { cpfValido, formatarCpf } from './calculo.js';

export const CAMPOS_PRIVADOS = ['cpf', 'chave_pix', 'cpf_anterior'];

/** Motoristas ficam visíveis a todas as secretarias (indicador público "motorista", conferido nas regras). */
export const cargoMotorista = cargo => /motorista/i.test(String(cargo || ''));

export function mascararCpf(cpf) {
  const c = String(cpf || '').replace(/\D/g, '');
  return c.length === 11 ? `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**` : '';
}

/**
 * Separa os dados de um servidor: { publico, privado }.
 * Os indicadores públicos só são recalculados quando o dado correspondente vem na gravação.
 */
export function separarServidor(dados) {
  const publico = {}, privado = {};
  for (const [k, v] of Object.entries(dados || {})) (CAMPOS_PRIVADOS.includes(k) ? privado : publico)[k] = v;
  if ('cpf' in privado) {
    privado.cpf = String(privado.cpf || '').replace(/\D/g, '');
    publico.cpf_mascara = mascararCpf(privado.cpf);
    publico.cpf_valido = cpfValido(privado.cpf);
  }
  if ('cargo_funcao' in publico) publico.motorista = cargoMotorista(publico.cargo_funcao);
  if ('chave_pix' in privado) publico.tem_pix = !!String(privado.chave_pix || '').trim();
  if ('secretaria_id' in publico && Object.keys(privado).length) privado.secretaria_id = publico.secretaria_id || null;
  return { publico, privado };
}

// ---------- Exibição (funciona com ou sem acesso ao dado privado) ----------
export const temPix = sv => !!(sv && (sv.chave_pix || sv.tem_pix));
export const cpfOk = sv => sv ? (sv.cpf ? cpfValido(sv.cpf) : sv.cpf_valido !== false) : false;
export const cpfExibir = sv => sv ? (sv.cpf ? formatarCpf(sv.cpf) : (sv.cpf_mascara || '')) : '';
export const pixExibir = sv => sv ? (sv.chave_pix || (sv.tem_pix ? 'cadastrada' : '')) : '';
