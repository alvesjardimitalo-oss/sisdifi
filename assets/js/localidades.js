// SISDIFI — UFs/municípios (IBGE) e distância rodoviária (OpenStreetMap + OSRM)
import { normalizar } from './ui.js';

const cacheMem = {};
function lerCache(chave) {
  if (cacheMem[chave]) return cacheMem[chave];
  try { const v = localStorage.getItem('sisdifi:' + chave); if (v) return (cacheMem[chave] = JSON.parse(v)); } catch { /* sem storage */ }
  return null;
}
function gravarCache(chave, valor) {
  cacheMem[chave] = valor;
  try { localStorage.setItem('sisdifi:' + chave, JSON.stringify(valor)); } catch { /* sem storage */ }
}

async function obterJSON(url, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function listarUFs() {
  let ufs = lerCache('ufs');
  if (!ufs) {
    const dados = await obterJSON('https://servicodados.ibge.gov.br/api/v1/localidades/estados');
    ufs = dados.map(e => ({ sigla: e.sigla, nome: e.nome })).sort((a, b) => a.sigla.localeCompare(b.sigla));
    gravarCache('ufs', ufs);
  }
  return ufs;
}

export async function listarMunicipios(uf) {
  if (!uf) return [];
  let lista = lerCache('mun-' + uf);
  if (!lista) {
    const dados = await obterJSON(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios`);
    lista = dados.map(m => m.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    gravarCache('mun-' + uf, lista);
  }
  return lista;
}

export function chaveDistancia(cidade, uf) {
  return (uf + '-' + normalizar(cidade).replace(/[^a-z0-9]+/g, '-')).replace(/-+$/, '');
}

async function geocodificar(cidade, nomeUF) {
  const chave = 'geo-' + normalizar(cidade + '-' + nomeUF);
  const c = lerCache(chave);
  if (c) return c;
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br'
    + '&city=' + encodeURIComponent(cidade) + '&state=' + encodeURIComponent(nomeUF);
  let r = await obterJSON(url);
  if (!r.length) r = await obterJSON('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=' + encodeURIComponent(`${cidade}, ${nomeUF}, Brasil`));
  if (!r.length) throw new Error(`Não foi possível localizar ${cidade}/${nomeUF} no mapa.`);
  const ponto = { lat: Number(r[0].lat), lon: Number(r[0].lon) };
  gravarCache(chave, ponto);
  return ponto;
}

/**
 * Distância rodoviária (km) da cidade de origem do município até o destino.
 * origem = { cidade, uf } (vem dos Parâmetros). Retorna número com 2 casas.
 */
export async function calcularDistanciaRodoviaria(origem, cidade, uf) {
  const ufs = await listarUFs();
  const nomeUF = sigla => (ufs.find(u => u.sigla === sigla) || {}).nome || sigla;
  const [a, b] = await Promise.all([
    geocodificar(origem.cidade, nomeUF(origem.uf)),
    geocodificar(cidade, nomeUF(uf))
  ]);
  const rota = await obterJSON(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`);
  if (!rota.routes || !rota.routes[0]) throw new Error('Não foi possível calcular a rota até o destino.');
  return Math.round(rota.routes[0].distance / 10) / 100;
}
