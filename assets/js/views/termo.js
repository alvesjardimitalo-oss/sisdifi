// SISDIFI — Termo de responsabilidade e confidencialidade no tratamento de dados pessoais (LGPD e LAI).
// Quem vê CPF e chave Pix (Secretaria, Contabilidade, Administrador, Consulta e RH) aceita o termo no primeiro acesso.
// O aceite fica no cadastro do usuário (termo_lgpd: { versao, aceito_em }) e na auditoria. Mudou o texto: suba a versão.
import * as db from '../db.js';
import { estado } from '../estado.js';
import { esc, $, toast, mensagemErro, dataBR } from '../ui.js';

export const TERMO_VERSAO = '2026-10';
// Perfis que veem CPF e chave Pix completos (o Controle Interno só vê o CPF mascarado)
const PERFIS_COM_DADOS = ['secretaria', 'operador', 'admin', 'consulta', 'rh'];
const precisa = () => PERFIS_COM_DADOS.includes(estado.sessao?.perfil);
export const termoAceito = () => !precisa() || estado.sessao?.termo_lgpd?.versao === TERMO_VERSAO;

function textoTermo() {
  return `
    <p>Ao acessar o SISDIFI, tenho acesso a dados pessoais de servidores da Prefeitura Municipal de Frei Inocêncio, como nome, CPF, chave Pix, cargo e lotação. Declaro que:</p>
    <ol class="termo-itens">
      <li>Esses dados são tratados pela Prefeitura somente para solicitar, conceder e pagar diárias de viagem, no cumprimento de obrigação legal e na execução de políticas públicas, conforme a <strong>Lei nº 13.709/2018 (LGPD)</strong>, arts. 7º, II e III, e 23.</li>
      <li>Vou usar os dados apenas para essa finalidade e no exercício das minhas funções.</li>
      <li>Não vou copiar, imprimir, fotografar, divulgar ou repassar esses dados a terceiros, nem enviá-los por canais não oficiais (como aplicativos de mensagem pessoais), respeitando o sigilo das informações pessoais previsto na <strong>Lei nº 12.527/2011 (Lei de Acesso à Informação)</strong>, art. 31.</li>
      <li>Vou manter meu usuário e minha senha em sigilo, não deixar a tela aberta sem supervisão e sair do sistema ao terminar.</li>
      <li>Vou avisar imediatamente o Departamento de Contabilidade se perceber acesso indevido, perda ou vazamento de dados.</li>
      <li>Estou ciente de que meus acessos e ações ficam registrados e de que o uso indevido dos dados pode levar à responsabilização administrativa, civil e penal, nos termos da legislação aplicável.</li>
    </ol>`;
}

/**
 * Se a secretaria ainda não aceitou o termo, desenha o termo em `el` e devolve true (a tela deve parar ali).
 * Ao aceitar, chama aoAceitar() para desenhar a tela pedida.
 */
export function exigirTermo(el, aoAceitar) {
  if (termoAceito()) return false;
  const s = estado.sessao;
  el.innerHTML = `
    <div class="cab-pagina"><div><h1>Termo de responsabilidade</h1>
      <p class="muted">Antes de usar o sistema, leia e confirme o termo abaixo. Ele é pedido uma vez e fica registrado.</p></div></div>
    <section class="cartao termo">
      <h3>Termo de Responsabilidade e Confidencialidade no Tratamento de Dados Pessoais</h3>
      ${textoTermo()}
      <p class="termo-assina"><strong>${esc(s.nome)}</strong> · ${esc(s.perfil === 'secretaria' ? (s.secretaria_nome || 'Secretaria') : ({ operador: 'Contabilidade', admin: 'Administrador', consulta: 'Consulta', rh: 'RH' }[s.perfil] || ''))} · ${esc(s.email)}</p>
      <form id="f-termo">
        <label class="check termo-check"><input type="checkbox" name="ciente" required> Li o termo e estou ciente das minhas responsabilidades no cuidado com os dados pessoais.</label>
        <p class="erro-form" id="erro-termo"></p>
        <div class="acoes-form"><button type="button" class="btn btn-sec" id="termo-sair">Sair do sistema</button><button class="btn" type="submit" disabled>Aceitar e continuar</button></div>
      </form>
    </section>`;
  const f = $('#f-termo', el), btn = f.querySelector('[type=submit]');
  f.ciente.onchange = () => { btn.disabled = !f.ciente.checked; };
  $('#termo-sair', el).onclick = () => db.sair();
  f.onsubmit = async e => {
    e.preventDefault();
    if (!f.ciente.checked) return;
    btn.disabled = true;
    const aceite = { versao: TERMO_VERSAO, aceito_em: new Date().toISOString() };
    try {
      await db.aceitarTermo(aceite);
      await db.registrarLog('termo_lgpd.aceite', { versao: TERMO_VERSAO, perfil: s.perfil, secretaria: s.secretaria_nome || '' });
      s.termo_lgpd = aceite;
      window.dispatchEvent(new CustomEvent('sisdifi:termo-aceito'));
      toast('Termo aceito. Obrigado pelo cuidado com os dados.');
      aoAceitar();
    } catch (err) { $('#erro-termo', el).textContent = mensagemErro(err); btn.disabled = false; }
  };
  return true;
}

/** Bloco para "Minha conta": mostra o termo aceito e permite reler. */
export function blocoTermoConta() {
  if (!precisa()) return '';
  const t = estado.sessao?.termo_lgpd;
  return `<section class="cartao estreito termo">
    <h3>Termo de responsabilidade (dados pessoais)</h3>
    <p>${t?.versao === TERMO_VERSAO ? `✓ Aceito em ${esc(dataBR(t.aceito_em))}.` : 'Ainda não aceito.'}</p>
    <details><summary>Ler o termo</summary>${textoTermo()}</details>
  </section>`;
}
