// SISDIFI — anexos integrados à sessão Firebase já aberta.
// O Apps Script executa num iframe isolado; ID token trafega por postMessage,
// nunca por URL, storage ou parâmetros do navegador.
import { tokenAnexos } from './db.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const origemAppsScript = o => /^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(o) || o === 'https://script.google.com';
let limparAnterior = null;

export function montarPainelAnexos(el, sol, podeEnviar) {
  if (limparAnterior) { limparAnterior(); limparAnterior = null; }
  if (!el || !sol?.id) return;
  const endereco = window.SISDIFI_ANEXOS_APP_URL;
  let url;
  try {
    url = new URL(endereco);
    if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' ||
        !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)) throw Error('URL inválida');
  } catch { el.replaceChildren(); return; }
  const canal = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2,'0')).join('');
  url.searchParams.set('solicitacao', sol.id);
  url.searchParams.set('canal', canal);
  el.innerHTML = `<section class="cartao">
    <h3>Anexos da solicitação</h3>
    <p class="muted">Convites, comprovantes e documentos PDF/JPG/PNG. ${podeEnviar ? 'Envio sujeito à autorização.' : 'Consulta conforme permissões.'}</p>
    <p class="muted" id="anexos-estado">Conectando à sessão SISDIFI...</p>
    <iframe title="Documentos da solicitação" src="${esc(url.href)}"
      style="display:block;width:100%;min-height:640px;border:1px solid #dbe1e8;border-radius:8px"
      referrerpolicy="no-referrer" allow="clipboard-write"></iframe>
  </section>`;
  const iframe = el.querySelector('iframe');
  const indicador = el.querySelector('#anexos-estado');
  let ativo = true;
  const receber = async event => {
    if (!ativo || !origemAppsScript(event.origin) ||
        event.data?.tipo !== 'sisdifi-anexos-pronto' || event.data?.canal !== canal) return;
    try {
      const token = await tokenAnexos();
      if (!ativo) return;
      event.source.postMessage({tipo:'sisdifi-anexos-sessao',canal,token},event.origin);
      if (indicador) indicador.textContent = 'Sessão autenticada. Documentos disponíveis abaixo.';
    } catch {
      if (indicador) indicador.textContent = 'Sua sessão expirou. Entre novamente no SISDIFI.';
    }
  };
  window.addEventListener('message', receber);
  limparAnterior = () => { ativo = false; window.removeEventListener('message', receber); };
}
