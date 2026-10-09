import { listarAnexos, enviarAnexo, abrirAnexo } from './anexos.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function montarPainelAnexos(el, sol, podeEnviar) {
  if (!el) return;
  if (!window.SISDIFI_ANEXOS_API_URL) {
    el.innerHTML = ''; // Integração não habilitada: preserva o comportamento atual.
    return;
  }
  el.innerHTML = `<section class="cartao"><h3>Anexos da solicitação</h3>
    <p class="muted">Convites e comprovantes de inscrição (PDF, JPG ou PNG, até 10 MB).</p>
    ${podeEnviar ? '<form id="form-anexo-sisdifi"><select name="categoria" aria-label="Tipo de anexo"><option value="convite">Convite</option><option value="inscricao">Comprovante de inscrição</option><option value="outro">Outro</option></select><input name="arquivo" type="file" accept=".pdf,.jpg,.jpeg,.png" required><button class="btn" type="submit">Enviar anexo</button></form>' : ''}
    <div id="estado-anexos-sisdifi" role="status"></div><ul id="lista-anexos-sisdifi"></ul></section>`;
  const status = el.querySelector('#estado-anexos-sisdifi');
  const lista = el.querySelector('#lista-anexos-sisdifi');
  const carregar = async () => {
    status.textContent = 'Carregando anexos…';
    try {
      const anexos = await listarAnexos(sol.id);
      lista.replaceChildren();
      for (const a of anexos) {
        const li = document.createElement('li');
        const botao = document.createElement('button');
        botao.className = 'btn btn-sec';
        botao.type = 'button';
        botao.textContent = 'Visualizar / imprimir';
        botao.onclick = async () => {
          try {
            const blob = await abrirAnexo(sol.id, a.id);
            const url = URL.createObjectURL(blob);
            const nova = window.open(url, '_blank', 'noopener,noreferrer');
            if (!nova) { const link = document.createElement('a'); link.href = url; link.download = a.nome || 'anexo'; link.click(); }
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          } catch (e) { status.textContent = e.message; }
        };
        li.append(document.createTextNode((a.nome || 'Anexo') + ' (' + (a.categoria || 'outro') + ') '), botao);
        lista.append(li);
      }
      status.textContent = anexos.length ? '' : 'Nenhum anexo cadastrado.';
    } catch (e) { status.textContent = e.message; }
  };
  const form = el.querySelector('#form-anexo-sisdifi');
  if (form) form.onsubmit = async e => {
    e.preventDefault();
    const arquivo = form.elements.arquivo.files[0];
    if (!arquivo) return;
    const botao = form.querySelector('button');
    botao.disabled = true;
    status.textContent = 'Enviando…';
    try { await enviarAnexo(sol.id, arquivo, form.elements.categoria.value); form.reset(); await carregar(); }
    catch (erro) { status.textContent = erro.message; }
    finally { botao.disabled = false; }
  };
  carregar();
}
