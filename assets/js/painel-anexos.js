// SISDIFI — painel compacto de anexos, carregado somente quando solicitado.
// A autenticação usa a sessão Firebase do SISDIFI; o token nunca vai na URL.
import { tokenAnexos } from './db.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const origemAppsScript = o => /^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/.test(o) || o === 'https://script.google.com';
let limparAnterior = null;

export function montarPainelAnexos(el, sol, podeEnviar) {
  if (limparAnterior) { limparAnterior(); limparAnterior = null; }
  if (!el || !sol?.id) return;
  let url;
  try {
    url = new URL(window.SISDIFI_ANEXOS_APP_URL);
    if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' ||
        !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)) throw Error('URL inválida');
  } catch { el.replaceChildren(); return; }

  const canal = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2,'0')).join('');
  url.searchParams.set('solicitacao', sol.id);
  url.searchParams.set('canal', canal);

  el.innerHTML = `<section class="cartao" aria-label="Documentos da solicitação">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="min-width:0">
        <h3 style="margin:0 0 4px">📎 Documentos anexados</h3>
        <p class="muted" style="margin:0;font-size:.88em">Convites, inscrições e comprovantes · PDF, JPG ou PNG · até 4 MB</p>
      </div>
      <button type="button" class="btn btn-sec" id="anexos-alternar" aria-expanded="false" aria-controls="anexos-conteudo">Ver documentos ▾</button>
    </div>
    <div id="anexos-conteudo" hidden style="margin-top:16px">
      <p class="muted" id="anexos-estado" role="status" style="font-size:.88em">Carregando documentos...</p>
      <div id="anexos-frame"></div>
    </div>
  </section>`;

  const botao = el.querySelector('#anexos-alternar');
  const conteudo = el.querySelector('#anexos-conteudo');
  const indicador = el.querySelector('#anexos-estado');
  const frame = el.querySelector('#anexos-frame');
  let ativo = true, aberto = false, carregado = false, iframe = null;

  const receber = async event => {
    if (!ativo || !iframe || event.source !== iframe.contentWindow ||
        !origemAppsScript(event.origin) ||
        event.data?.tipo !== 'sisdifi-anexos-pronto' || event.data?.canal !== canal) return;
    try {
      const token = await tokenAnexos();
      if (!ativo || !aberto) return;
      event.source.postMessage({tipo:'sisdifi-anexos-sessao',canal,token},event.origin);
      indicador.textContent = 'Conectado à sua sessão SISDIFI.';
    } catch {
      indicador.textContent = 'Sessão encerrada. Entre novamente no SISDIFI.';
    }
  };
  window.addEventListener('message', receber);

  botao.onclick = () => {
    aberto = !aberto;
    conteudo.hidden = !aberto;
    botao.setAttribute('aria-expanded', String(aberto));
    botao.textContent = aberto ? 'Ocultar documentos ▴' : 'Ver documentos ▾';
    if (aberto && !carregado) {
      carregado = true;
      iframe = document.createElement('iframe');
      iframe.title = 'Anexos da solicitação ' + (sol.numero || '');
      iframe.src = url.href;
      iframe.referrerPolicy = 'no-referrer';
      iframe.style.cssText = 'display:block;width:100%;height:460px;max-width:100%;border:1px solid #dbe1e8;border-radius:8px;background:#fff';
      frame.append(iframe);
    }
  };

  limparAnterior = () => {
    ativo = false;
    window.removeEventListener('message', receber);
    botao.onclick = null;
    if (iframe) { iframe.removeAttribute('src'); iframe.remove(); }
  };
}
