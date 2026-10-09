// SISDIFI — integração com o aplicativo de anexos do Google Apps Script.
// O HTML Service usa google.script.run; NÃO tentar fetch direto (CORS).
// Configurar window.SISDIFI_ANEXOS_APP_URL com o /exec autorizado.
// Nunca passar token Firebase, dados pessoais ou permissões na URL.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));

export function montarPainelAnexos(el, sol, podeEnviar) {
  if (!el || !sol?.id) return;
  const endereco = window.SISDIFI_ANEXOS_APP_URL;
  if (!endereco || typeof endereco !== 'string') {
    el.replaceChildren(); // recurso não publicado: preservar sistema atual
    return;
  }
  let url;
  try {
    url = new URL(endereco);
    if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' ||
        !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)) throw Error('URL inválida');
  } catch (_) {
    el.replaceChildren();
    return;
  }
  // Apenas identificador de solicitação; o Apps Script precisa autenticar
  // e validar a autorização no servidor, independentemente deste valor.
  url.searchParams.set('solicitacaoId', sol.id);
  el.innerHTML = `<section class="cartao">
    <h3>Anexos da solicitação</h3>
    <p class="muted">Convites, comprovantes e documentos (PDF, JPG ou PNG).
    ${podeEnviar ? 'Envio sujeito à autorização do servidor.' : 'Consulta e impressão conforme permissões.'}</p>
    <a class="btn btn-sec" target="_blank" rel="noopener noreferrer" href="${esc(url.href)}">📎 Abrir anexos desta solicitação</a>
    <p class="muted">Acesse com sua conta SISDIFI. Nenhum arquivo é disponibilizado publicamente.</p>
  </section>`;
}
