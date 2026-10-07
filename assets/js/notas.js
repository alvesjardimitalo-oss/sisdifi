// SISDIFI — Chave de acesso de documentos fiscais (NF-e 55, NFC-e 65, CT-e 57…) e atalhos para imprimir o DANFE
import { esc, toast } from './ui.js';

export const MODELOS = { '55': 'NF-e', '65': 'NFC-e (cupom)', '57': 'CT-e', '67': 'CT-e OS', '58': 'MDF-e', '59': 'CF-e SAT' };

/** Lê a chave de 44 dígitos: UF, AAMM, CNPJ, modelo, série, número e confere o dígito verificador. */
export function lerChave(chave) {
  const c = String(chave || '').replace(/\D/g, '');
  if (c.length !== 44) return null;
  let soma = 0, peso = 2;
  for (let i = 42; i >= 0; i--) { soma += Number(c[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const resto = soma % 11, dv = resto < 2 ? 0 : 11 - resto;
  const modelo = c.slice(20, 22);
  return {
    chave: c, valida: dv === Number(c[43]), modelo, modeloNome: MODELOS[modelo] || 'modelo ' + modelo,
    cnpj: c.slice(6, 20), serie: String(Number(c.slice(22, 25))), numero: String(Number(c.slice(25, 34))),
    emissao: `${c.slice(4, 6)}/20${c.slice(2, 4)}`
  };
}

/** Sites para consultar/imprimir. Os que não aceitam a chave no endereço recebem a chave copiada (é só colar). */
export function sitesDaChave(info) {
  const lista = [
    { nome: 'Meu Danfe', url: 'https://meudanfe.com.br/', copiar: true },
    { nome: 'Consulta DANFE', url: 'https://consultadanfe.com/', copiar: true }
  ];
  if (info?.modelo === '55') lista.push({ nome: 'Portal NF-e', url: 'https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=completa&tipoConteudo=XbSeqxE8pl8=&nfe=' + info.chave, copiar: false });
  return lista;
}

/** Botões ao lado da chave (usar ligarBotoesNota(raiz) depois de pôr no HTML). */
export function botoesNota(chave, { peq = true } = {}) {
  const info = lerChave(chave);
  if (!info) return '';
  return `<span class="nota-atalhos">
    <span class="selo ${info.valida ? 'selo-info' : 'selo-cancelada'}" title="${info.valida ? 'Chave conferida (dígito verificador ok)' : 'Dígito verificador não confere — confira a chave'}">${esc(info.modeloNome)}${info.valida ? '' : ' · chave inválida'}</span>
    ${sitesDaChave(info).map(s => `<a class="btn btn-sec ${peq ? 'btn-peq' : ''}" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" data-copiar-chave="${s.copiar ? esc(info.chave) : ''}" title="${s.copiar ? 'Copia a chave e abre o site — cole no campo de busca' : 'Abre a consulta com a chave preenchida'}">${esc(s.nome)}</a>`).join('')}
  </span>`;
}

export function ligarBotoesNota(raiz) {
  raiz.querySelectorAll('[data-copiar-chave]').forEach(a => a.addEventListener('click', () => {
    const ch = a.dataset.copiarChave;
    if (!ch) return;
    navigator.clipboard?.writeText(ch).then(() => toast('Chave copiada — cole (Ctrl+V) no campo de busca do site.'), () => toast('Copie a chave: ' + ch, 'aviso'));
  }));
}
