// SISDIFI — Estados, municípios (com coordenadas) e distância rodoviária
// Lista de municípios: arquivo local assets/data/municipios.json (5.571 sedes municipais com latitude/longitude),
// então o destino é escolhido numa lista e a distância é calculada sem depender de busca por nome.
import { normalizar } from './ui.js';

let base = null;
async function carregarBase() {
  if (!base) {
    const r = await fetch('assets/data/municipios.json');
    if (!r.ok) throw new Error('lista de municípios indisponível');
    base = await r.json();
  }
  return base;
}

export async function listarUFs() {
  const b = await carregarBase();
  return Object.entries(b.estados).map(([sigla, nome]) => ({ sigla, nome }));
}

export async function listarMunicipios(uf) {
  if (!uf) return [];
  const b = await carregarBase();
  return (b.municipios[uf] || []).map(m => m[0]);
}

export async function coordenadas(cidade, uf) {
  const b = await carregarBase();
  const alvo = normalizar(cidade);
  const m = (b.municipios[uf] || []).find(x => normalizar(x[0]) === alvo);
  return m ? { lat: m[1], lon: m[2] } : null;
}

export function chaveDistancia(cidade, uf) {
  return (uf + '-' + normalizar(cidade).replace(/[^a-z0-9]+/g, '-')).replace(/-+$/, '');
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

function linhaReta(a, b) {
  const rad = x => x * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Distância rodoviária (ida) da sede do município de origem até a sede do destino.
 * Retorna { km, fonte: 'rota' | 'estimada' }. Se o serviço de rotas estiver fora do ar,
 * devolve uma estimativa (linha reta × 1,25) marcada como "estimada" para o operador conferir.
 */
export async function calcularDistanciaRodoviaria(origem, cidade, uf) {
  const [a, b] = await Promise.all([coordenadas(origem.cidade, origem.uf), coordenadas(cidade, uf)]);
  if (!a) throw new Error(`município de origem "${origem.cidade}/${origem.uf}" não está na lista`);
  if (!b) throw new Error(`escolha o destino na lista de municípios de ${uf}`);
  try {
    const rota = await obterJSON(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`);
    if (rota.routes && rota.routes[0]) return { km: Math.round(rota.routes[0].distance / 10) / 100, fonte: 'rota' };
  } catch { /* cai na estimativa */ }
  return { km: Math.round(linhaReta(a, b) * 1.25 * 100) / 100, fonte: 'estimada' };
}
