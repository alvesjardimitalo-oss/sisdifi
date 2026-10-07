// SISDIFI — Tutorial interativo do primeiro acesso: destaca cada parte da tela e explica, conforme o perfil.
// Abre sozinho na primeira entrada do usuário (marca "tutorial_visto" no cadastro dele) e pelo botão "?" do topo.
import { estado, pode, ehSecretaria, ehRH } from './estado.js';
import { esc } from './ui.js';

const celular = () => window.matchMedia('(max-width: 820px)').matches;
/** Alvo de um item do menu: no computador, o link do menu lateral; no celular, a aba de baixo (ou o botão Menu). */
const menu = rota => () => celular()
  ? (document.querySelector(`.abas-mobile [data-aba="${rota}"]`) || document.querySelector('#abas-menu'))
  : document.querySelector(`.lateral nav a[data-rota="${rota}"]`);
const el = sel => () => document.querySelector(sel);

function passos() {
  const nome = (estado.sessao?.nome || '').split(' ')[0];
  const comuns = [
    { titulo: `Bem-vindo(a) ao SISDIFI, ${nome}!`, texto: 'Este é o sistema de diárias de viagem da Prefeitura. Em um minuto mostramos onde fica cada coisa. Você pode pular agora e rever depois no botão ? do alto da tela.' },
    { alvo: () => celular() ? document.querySelector('.abas-mobile') : document.querySelector('.lateral nav'), titulo: 'O menu', texto: celular()
        ? 'Os atalhos ficam nesta barra. O menu completo abre no botão Menu.'
        : 'O menu mostra só o que o seu perfil pode usar. A tela em que você está fica marcada em dourado.' },
    { alvo: el('#sel-exercicio'), titulo: 'Exercício', texto: 'Escolha o ano em uso. Painel, solicitações e relatórios mostram o exercício escolhido aqui.' }
  ];
  let proprios;
  if (ehSecretaria()) proprios = [
    { alvo: menu('solicitacoes/nova'), titulo: 'Pedir uma diária', texto: 'Em Nova solicitação você escolhe o servidor, informa saída, chegada e destino, conta, fonte e objetivo, e envia para o Controle Interno.' },
    { alvo: menu('servidores'), titulo: 'Seus servidores', texto: 'Aqui ficam os servidores da sua secretaria e os motoristas de todas. Complete chave Pix e cargo de quem estiver pendente ou cadastre alguém novo.' },
    { alvo: el('.fila'), titulo: 'Acompanhe seus pedidos', texto: 'O painel mostra quantos pedidos estão em análise, aprovados, reprovados (para corrigir) e pagos. Clique num número para ver a lista.' },
    { alvo: menu('solicitacoes'), titulo: 'Solicitações', texto: 'A lista de todos os pedidos da secretaria. Abra um pedido para acompanhar a etapa, corrigir se foi reprovado, repetir a viagem ou prestar contas depois dela.' },
    { titulo: 'Chave Pix: o CPF é o padrão', texto: 'Ao escolher o servidor, o sistema pergunta se a chave Pix é mesmo o CPF. Confira com o servidor: é por ela que a diária é paga.' }
  ];
  else if (pode.analisar() && !pode.contabil()) proprios = [
    { alvo: el('.fila'), titulo: 'Sua fila', texto: 'Aqui aparecem os pedidos esperando a sua análise. Clique no número para abrir a lista.' },
    { alvo: menu('solicitacoes'), titulo: 'Analisar os pedidos', texto: 'Em Solicitações, filtre pela etapa Em análise. Os pedidos que passam em todas as verificações podem ser aprovados em lote; os demais, um a um, com os motivos prontos de reprovação.' },
    { alvo: menu('controle'), titulo: 'Relatório do Controle', texto: 'Pedidos recebidos, aprovados e reprovados por secretaria, tempo de análise, motivos mais comuns e viagens sem prestação de contas. Dá para imprimir.' }
  ];
  else if (pode.contabil()) proprios = [
    { alvo: el('.fila'), titulo: 'Fila de trabalho', texto: 'Calcular e preencher ficha, assinatura do Prefeito, empenhar, liquidar e pagar: clique no número para abrir as solicitações de cada etapa.' },
    { alvo: menu('servidores'), titulo: 'Servidores', texto: 'Importe a relação de pessoal e a folha em PDF, revise as categorias, preencha o Pix pelo CPF e edite ou inative cadastros.' },
    { alvo: menu('orcamento'), titulo: 'Orçamento', texto: 'Leia os PDFs do orçamento para trazer as fichas de diárias de cada secretaria. O saldo da ficha aparece como aviso no cálculo.' },
    { alvo: menu('exercicio'), titulo: 'Exercícios', texto: 'No começo de cada ano, importe o orçamento novo e confirme se mudaram agentes políticos, lei, contas e usuários.' },
    { alvo: el('.topo-historico'), titulo: 'Histórico antigo', texto: 'Marque para ver também as diárias importadas do sistema antigo. Desmarcado, elas ficam fora de todas as telas.' }
  ];
  else if (ehRH()) proprios = [
    { alvo: menu('relatorio'), titulo: 'Relatório mensal', texto: 'As diárias empenhadas e pagas no mês, por servidor e secretaria, para acompanhar os pagamentos.' }
  ];
  else proprios = [
    { alvo: menu('solicitacoes'), titulo: 'Solicitações', texto: 'Consulte os pedidos de diária e abra cada um para ver a tramitação.' }
  ];
  return [...comuns, ...proprios,
    { alvo: el('#abrir-tutorial'), titulo: 'Pronto!', texto: 'Sempre que quiser rever este passeio, clique aqui. Bom trabalho!' }];
}

let atual = null;
export function tutorialAberto() { return !!atual; }

/** Abre o tutorial. aoFechar(concluiu) é chamado ao terminar ou pular. */
export function iniciarTutorial(aoFechar = () => {}) {
  if (atual) return;
  const lista = passos();
  let i = 0;
  const luz = document.createElement('div'); luz.className = 'tour-luz';
  const fundo = document.createElement('div'); fundo.className = 'tour-fundo';
  const balao = document.createElement('div'); balao.className = 'tour-balao';
  balao.setAttribute('role', 'dialog'); balao.setAttribute('aria-modal', 'true'); balao.setAttribute('aria-labelledby', 'tour-titulo');
  document.body.append(fundo, luz, balao);
  document.getElementById('lateral')?.classList.remove('aberta');

  const fechar = concluiu => {
    window.removeEventListener('resize', posicionar); window.removeEventListener('scroll', posicionar, true);
    document.removeEventListener('keydown', teclas, true);
    [luz, fundo, balao].forEach(x => x.remove());
    atual = null;
    aoFechar(concluiu);
  };
  const alvoVisivel = () => {
    const a = lista[i].alvo?.();
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(a).visibility !== 'hidden' ? a : null;
  };
  function posicionar() {
    const a = alvoVisivel();
    const m = 8, vw = window.innerWidth, vh = window.innerHeight;
    balao.classList.toggle('tour-centro', !a);
    fundo.classList.toggle('tour-fundo-escuro', !a);
    luz.hidden = !a;
    if (!a) { balao.style.left = ''; balao.style.top = ''; return; }
    const r = a.getBoundingClientRect();
    Object.assign(luz.style, { left: `${r.left - m}px`, top: `${r.top - m}px`, width: `${r.width + 2 * m}px`, height: `${r.height + 2 * m}px` });
    const bw = balao.offsetWidth, bh = balao.offsetHeight;
    let left, top;
    if (r.right + 16 + bw < vw && r.height < vh * 0.6 && !celular()) { left = r.right + 16; top = r.top + r.height / 2 - bh / 2; }   // à direita
    else if (r.bottom + 16 + bh < vh) { top = r.bottom + 16; left = r.left + r.width / 2 - bw / 2; }                                   // abaixo
    else { top = r.top - 16 - bh; left = r.left + r.width / 2 - bw / 2; }                                                              // acima
    balao.style.left = `${Math.max(12, Math.min(left, vw - bw - 12))}px`;
    balao.style.top = `${Math.max(12, Math.min(top, vh - bh - 12))}px`;
  }
  function mostrar() {
    const p = lista[i];
    const a = p.alvo?.();
    if (a) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    balao.innerHTML = `
      <div class="tour-cab"><span class="tour-passo">${i + 1} de ${lista.length}</span><button type="button" class="tour-pular" data-pular>Pular tutorial</button></div>
      <h3 id="tour-titulo">${esc(p.titulo)}</h3>
      <p>${esc(p.texto)}</p>
      <div class="tour-pontos" aria-hidden="true">${lista.map((_, k) => `<span class="${k === i ? 'ativo' : ''}"></span>`).join('')}</div>
      <div class="tour-acoes">${i ? '<button type="button" class="btn btn-sec btn-peq" data-voltar>Voltar</button>' : ''}
        <button type="button" class="btn btn-peq" data-seguir>${i === lista.length - 1 ? 'Concluir' : i === 0 ? 'Começar' : 'Próximo'}</button></div>`;
    balao.querySelector('[data-pular]').onclick = () => fechar(false);
    balao.querySelector('[data-voltar]')?.addEventListener('click', () => { i--; mostrar(); });
    balao.querySelector('[data-seguir]').onclick = () => { if (i === lista.length - 1) fechar(true); else { i++; mostrar(); } };
    requestAnimationFrame(() => { posicionar(); balao.querySelector('[data-seguir]').focus(); });
  }
  function teclas(e) {
    if (e.key === 'Escape') { e.preventDefault(); fechar(false); }
    else if (e.key === 'ArrowRight' && i < lista.length - 1) { i++; mostrar(); }
    else if (e.key === 'ArrowLeft' && i > 0) { i--; mostrar(); }
    else if (e.key === 'Tab') { // foco preso no balão
      const f = [...balao.querySelectorAll('button')]; const k = f.indexOf(document.activeElement);
      e.preventDefault(); f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  }
  fundo.onclick = () => {}; // o fundo bloqueia cliques na tela durante o passeio
  window.addEventListener('resize', posicionar); window.addEventListener('scroll', posicionar, true);
  document.addEventListener('keydown', teclas, true);
  atual = { fechar };
  mostrar();
}
