import { esc } from '../ui.js';
import { pode, estado } from '../estado.js';
import { DESTINOS, extrairMinuta, agruparMinuta } from '../minuta-pdf.js';
import { MESES, rotuloCompetencia, valorEsperado, vincularFolha, conferenciaMensal, carregarMes, salvarMes, agruparOPsPorBancoFonte, reconhecerCodigoCaixaExistente, classificarArquivo, avisosPendentes } from '../consignacoes-mensal.js?v=3.13.0';
const moeda = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function telaConsignacoes(el) {
  if (!pode.contabil()) return { titulo: 'Acesso restrito' };
  const uid=estado.sessao.uid, hoje=new Date();
  let competencia=`${estado.exercicio || hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  let arquivos=[],esperados={},revisao=0,ocupado=true,ativo=true,erroCarga=false,modoOP=true;
  const urls=new Set();
  el.innerHTML=`<style>
  .minuta .mi-acoes{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:16px 0}.minuta .mi-card{border:1px solid #dce3ed;border-radius:12px;padding:20px;margin:16px 0;background:#fff}.minuta .mi-total{font-size:1.6rem;font-weight:700;color:#174665}.minuta .mi-tabela{overflow:auto}.minuta table{width:100%;border-collapse:collapse}.minuta th,.minuta td{padding:10px;text-align:left;border-bottom:1px solid #e2e8f0}.minuta .mi-valor{text-align:right;white-space:nowrap}.minuta .mi-aviso{background:#fff7df;padding:14px;border-radius:8px;margin:10px 0}.minuta select{max-width:100%}.minuta summary{cursor:pointer}.minuta small{display:block;color:#526174}.minuta .mi-bancos{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.minuta .mi-bancos .mi-card{margin:0}.minuta .mi-diferenca{font-weight:700;color:#a3430c}.minuta .mi-ok{color:#14673c}.minuta input[type=search]{min-width:220px}.minuta .mi-abas{display:flex;gap:8px;overflow-x:auto;padding:6px 0 12px;scrollbar-width:thin}.minuta .mi-abas button{flex:0 0 auto;padding:11px 16px;border:1px solid #ccd8e5;border-radius:9px;background:#fff;color:#23445c;cursor:pointer;font:inherit;font-weight:600}.minuta .mi-abas button[aria-selected=true]{background:#174665;color:#fff;border-color:#174665}.minuta .mi-analise{border-left:4px solid #d98e2c;background:#fffaf1}.minuta .mi-analise li{margin:7px 0}.minuta .mi-analise .mi-candidato{border-radius:7px;padding:9px;background:#fff}.minuta .mi-pendencias{color:#7b421c}.minuta .mi-card button{max-width:100%}@media(max-width:600px){.minuta .mi-card{padding:13px}.minuta .mi-bancos{grid-template-columns:1fr}.minuta th,.minuta td{padding:7px;font-size:.88rem}.minuta .mi-acoes>*{min-width:0}.minuta input[type=search]{min-width:0;width:100%}}
  .minuta [hidden]{display:none!important}
  .minuta .mi-op-painel{background:#f8fbff;border-color:#ccdcec}
  .minuta .mi-op-topo{display:flex;align-items:start;justify-content:space-between;gap:14px;flex-wrap:wrap}
  .minuta .mi-op-topo h2{margin:0 0 4px}
  .minuta .mi-op-topo p{margin:0;color:#526174}
  .minuta .mi-op-modos{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  .minuta .mi-op-modos button[aria-pressed=true]{background:#174665;color:#fff;border-color:#174665}
  .minuta .mi-op-barra{display:flex;gap:12px;align-items:end;justify-content:space-between;flex-wrap:wrap;margin:14px 0}
  .minuta .mi-op-barra .mi-op-resumo{font-size:1.12rem;font-weight:700;color:#174665}
  .minuta .mi-op-banco{border:1px solid #dce3ed;background:#fff;border-radius:10px;margin:12px 0;overflow:hidden}
  .minuta .mi-op-banco-cab{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;background:#eef5fb;padding:12px 15px}
  .minuta .mi-op-banco-cab h3{margin:0;color:#163c59;font-size:1.04rem}
  .minuta .mi-op-banco-cab small{display:inline;font-size:.8rem}
  .minuta .mi-op-banco-cab strong{font-size:1.15rem;color:#163c59}
  .minuta .mi-op-tabela{width:100%;border-collapse:collapse}
  .minuta .mi-op-tabela th,.minuta .mi-op-tabela td{padding:10px 12px;vertical-align:middle}
  .minuta .mi-op-tabela th{font-size:.78rem;color:#526174;white-space:nowrap}
  .minuta .mi-op-tabela tr:last-child td{border-bottom:0}
  .minuta .mi-op-tabela .mi-op-fonte strong{white-space:nowrap}
  .minuta .mi-op-tabela .mi-op-fonte small{font-size:.76rem;max-width:260px}
  .minuta .mi-op-tabela .mi-op-montante{font-size:1.08rem;font-weight:700;color:#174665;text-align:right;white-space:nowrap}
  .minuta .mi-op-tabela .mi-op-botoes{display:flex;justify-content:flex-end;gap:5px;flex-wrap:wrap}
  .minuta .mi-op-botoes button{font-size:.82rem;padding:7px 9px}
  .minuta .mi-op-aviso{font-size:.9rem;margin:12px 0;padding:12px;border-radius:7px;background:#fff7df;color:#694a16}
  @media(max-width:700px){.minuta .mi-op-tabela thead{display:none}.minuta .mi-op-tabela tr{display:grid;grid-template-columns:1fr auto;gap:2px;border-bottom:1px solid #e2e8f0;padding:8px 10px}.minuta .mi-op-tabela td{border:0;padding:5px}.minuta .mi-op-tabela .mi-op-fonte{grid-column:1}.minuta .mi-op-tabela .mi-op-montante{grid-column:2;grid-row:1}.minuta .mi-op-tabela .mi-op-qtd{grid-column:1}.minuta .mi-op-tabela .mi-op-botoes{grid-column:1 / -1;justify-content:flex-start}.minuta .mi-op-banco-cab strong{font-size:1rem}}
  </style><section class="minuta"><h1>Conferência mensal de consignações</h1><p>Selecione a competência da folha, importe as minutas e confira os três bancos e a pensão alimentícia.</p>
  <div class="mi-acoes"><label class="campo"><span>Mês da folha</span><select id="mi-mes">${MESES.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}">${m}</option>`).join('')}</select></label><label class="campo"><span>Ano da folha</span><input id="mi-ano" type="number" min="2000" max="2100" step="1" style="width:110px"></label><strong id="mi-competencia"></strong></div>
  <p class="dica">Histórico salvo neste navegador e nesta conta do SISDIFI. Não é compartilhado com outros computadores; limpar os dados do navegador apaga este histórico. Guarde os PDFs originais e exporte a conferência.</p>
  <div id="mi-status" role="status" aria-live="polite"></div>
  <details class="mi-card" id="mi-conferencia-expandida"><summary><strong>Conferência mensal e diferenças entre bancos</strong> · Clique para abrir os valores esperados e os alertas</summary><div id="mi-bancos" class="mi-bancos"></div><div id="mi-conferencia"></div></details>
  <div class="mi-card"><label class="campo"><span>Adicionar minutas à competência da folha selecionada (PDF, até 15 MB por arquivo)</span><input id="mi-pdf" type="file" accept="application/pdf,.pdf" multiple disabled></label><p class="dica">O banco é identificado pelo conteúdo do PDF, inclusive código de receita 21 para Caixa nas minutas de Frei Inocêncio. A competência é a da folha, mesmo quando o pagamento ou a arrecadação ocorre no mês seguinte. As datas do PDF são preservadas e não definem a competência. PDFs sem texto precisam de OCR. O número mantém o tipo indicado na minuta: guia ou empenho.</p></div>
  <div id="mi-arquivos"></div>
  <div id="mi-op-painel" class="mi-card mi-op-painel">
    <div class="mi-op-topo"><div><h2>OP extraorçamentária por banco e fonte</h2><p>Uma OP para cada banco/desconto e fonte de recurso. Valores extraídos das guias da competência selecionada.</p></div></div>
    <div class="mi-op-modos" aria-label="Modo de visualização">
      <button class="btn btn-sec" id="mi-modo-ops" type="button" aria-pressed="true">Resumo para OP</button>
      <button class="btn btn-sec" id="mi-modo-detalhe" type="button" aria-pressed="false">Guias detalhadas</button>
    </div>
    <label style="display:block;margin:14px 0"><input type="checkbox" id="mi-revisado"> Conferi os documentos, os bancos e os avisos antes de imprimir ou exportar</label>
    <div id="mi-op-conteudo">
      <div class="mi-op-barra">
        <label class="campo"><span>Visualizar banco / desconto</span><select id="mi-op-banco"><option value="">Todos</option>${DESTINOS.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select></label>
        <div class="mi-acoes"><button class="btn btn-sec" id="mi-op-imprimir-todos" type="button" disabled>Imprimir resumo exibido</button></div>
      </div>
      <div id="mi-ops"></div>
    </div>
  </div>
  <div id="mi-detalhamento" hidden><h2>Conferir por banco ou desconto</h2><nav id="mi-abas" class="mi-abas" role="tablist" aria-label="Conferência por banco"><button type="button" data-aba="" role="tab" aria-selected="true">Visão geral</button>${DESTINOS.map(d=>`<button type="button" data-aba="${esc(d)}" role="tab" aria-selected="false">${esc(d)}</button>`).join('')}</nav><div class="mi-acoes"><label class="campo"><span>Banco / desconto</span><select id="mi-destino"><option value="">Todos</option>${DESTINOS.map(d=>`<option>${esc(d)}</option>`).join('')}<option>Não classificado</option></select></label><label class="campo"><span>Fonte</span><select id="mi-fonte"><option value="">Todas</option></select></label><label class="campo"><span>Buscar guia ou empenho</span><input id="mi-busca" type="search" placeholder="Ex.: 4041"></label><button class="btn btn-sec" id="mi-csv" disabled>Exportar CSV</button><button class="btn btn-sec" id="mi-print" disabled>Imprimir / PDF</button></div>
  <div id="mi-resultado"></div></div></section>`;
  const $=s=>el.querySelector(s);
  // O painel de OP fica no topo; o detalhamento original e a importação permanecem acessíveis.
  $('#mi-status').insertAdjacentElement('afterend',$('#mi-op-painel'));
  $('#mi-mes').value=competencia.slice(5);$('#mi-ano').value=competencia.slice(0,4);
  const todos=()=>arquivos.flatMap(a=>a.resultado.registros.map(r=>({...r,arquivo:a.nome})));
  const filtrados=()=>todos().filter(r=>(!$('#mi-destino').value||(r.destino||'Não classificado')===$('#mi-destino').value)&&(!$('#mi-fonte').value||r.fonteCompleta===$('#mi-fonte').value)&&String(r.numero||'').toLowerCase().includes($('#mi-busca').value.trim().toLowerCase()));
  const status=t=>{if(ativo)$('#mi-status').textContent=t;};
  function travar(valor) {
    ocupado=valor;
    for(const id of ['mi-pdf','mi-mes','mi-ano']) $("#"+id).disabled=valor || (erroCarga && id==='mi-pdf');
    el.querySelectorAll('[data-esperado],[data-salvar],[data-remover]').forEach(e=>e.disabled=valor||erroCarga);
    $('#mi-csv').disabled=$('#mi-print').disabled=valor||!filtrados().length||!$('#mi-revisado').checked;
    $('#mi-op-imprimir-todos').disabled=valor||!$('#mi-revisado').checked||!agruparOPsPorBancoFonte(arquivos).itens.some(g=>!$('#mi-op-banco').value||g.destino===$('#mi-op-banco').value);
    el.querySelectorAll('[data-op-imprimir]').forEach(b=>b.disabled=valor||!$('#mi-revisado').checked);
  }
  function tabela(grupos) {
    return grupos.map(g=>`<section class="mi-card"><h3>${esc(g.destino)} · Fonte ${esc(g.fonte)}</h3><div class="mi-tabela"><table><thead><tr><th>Tipo / Número</th><th>Data da arrecadação</th><th>Fonte completa</th><th>Arquivo / página</th><th class="mi-valor">Valor</th></tr></thead><tbody>${g.registros.map(r=>`<tr><td>${esc(r.tipo)} ${esc(r.numero)}</td><td>${esc(r.data)}</td><td>${esc(r.fonteCompleta)}<small>${esc(r.fonteNome)}</small></td><td>${esc(r.arquivo)} · p. ${r.pagina}</td><td class="mi-valor">${moeda(r.centavos)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="4">Total da fonte ${esc(g.fonte)}</th><th class="mi-valor">${moeda(g.total)}</th></tr></tfoot></table></div></section>`).join('');
  }
  function resumo(c) {
    return `<h2>${esc(rotuloCompetencia(competencia))}</h2><table><thead><tr><th>Destino</th><th>Importado</th><th>Esperado</th><th>Diferença</th></tr></thead><tbody>${c.blocos.map(b=>`<tr><td>${esc(b.destino)}${b.arquivos?'':' — arquivo pendente'}</td><td>${moeda(b.total)}</td><td>${b.esperado===null?'Não informado':moeda(b.esperado)}</td><td>${b.diferenca===null?'—':moeda(b.diferenca)}</td></tr>`).join('')}</tbody></table>`;
  }

  function textoParaOP(g) {
    return 'OP extraorçamentária - '+g.destino+' - Fonte '+g.fonteCompleta+
      '\nCompetência da folha: '+rotuloCompetencia(competencia)+
      '\nValor: '+moeda(g.total)+
      '\nHistórico sugerido: Recolhimento de consignações da folha de '+rotuloCompetencia(competencia)+
      ', referente a '+g.destino+', fonte '+g.fonteCompleta+', conforme minutas de arrecadação.';
  }
  function imprimirMemoriaOP(grupos, detalhado) {
    if (!$('#mi-revisado').checked) {
      status('Confirme que revisou os documentos antes de imprimir.');
      return;
    }
    if (!grupos.length) return;
    const c = conferenciaMensal(arquivos, esperados), w = window.open('', '_blank');
    if (!w) { status('Permita a abertura da janela para imprimir a memória.'); return; }
    w.opener = null;
    const total = grupos.reduce((n,g)=>n+g.total,0);
    const individual = grupos.length === 1;
    const g = individual ? grupos[0] : null;
    // Imagem institucional JÁ incluída no SISDIFI, mesmo domínio do site.
    const logoUrl = new URL('assets/img/brasao.png', document.baseURI).href;
    const emissao = new Date().toLocaleDateString('pt-BR');
    const siglaFonte = f => String(f||'').replace(/\D/g,'').slice(0,4);
    const titulo = 'MEMÓRIA DE CÁLCULO';
    const subtitulo = 'OP EXTRAORÇAMENTÁRIA · ' + (individual?'BANCO E FONTE':'RESUMO POR BANCO E FONTE');
    const quantidade = grupos.reduce((n,x)=>n+x.guias,0);
    const bancos = [...new Set(grupos.map(x=>x.destino))];
    const nomeBanco = individual ? g.destino : (bancos.length===1?bancos[0]:'Vários bancos');
    const situacao = c.conferido ? 'Valores mensais conciliados com os totais esperados' : 'Conferência mensal pendente / incompleta';
    const css = [
      // A impressão física usa folha A4 verdadeira; a visualização na tela simula a folha.
      '@page{size:A4 portrait;margin:0}',
      '*{box-sizing:border-box}',
      'html{margin:0;padding:0}',
      'body{margin:0;background:#e8edf3;color:#172c42;font:13px/1.46 Arial,Helvetica,sans-serif}',
      'h1,h2,h3,p{margin:0}strong{font-weight:700}',
      '.barra{height:5px;background:linear-gradient(90deg,#14517c 0 74%,#33844c 74%);margin:15px 0 24px}',
      '.toolbar{width:210mm;max-width:calc(100% - 24px);margin:18px auto 0;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#33526c;font-size:13px}',
      '.toolbar b{font-size:13px}.toolbar .acoes{display:flex;gap:8px;align-items:center}',
      '.toolbar button{background:#155078;border:1px solid #155078;color:#fff;border-radius:6px;font:600 13px Arial;padding:10px 14px;cursor:pointer}',
      '.toolbar button.fechar{background:#fff;color:#204765;border-color:#b9cbd9}',
      '.paper{width:210mm;min-height:297mm;margin:14px auto 36px;padding:14mm 15mm 13mm;background:#fff;box-shadow:0 9px 28px rgba(21,48,74,.18)}',
      '.topo{display:flex;align-items:center;justify-content:space-between;gap:15px}',
      '.marca{display:flex;gap:13px;align-items:center;min-width:0}',
      '.brasao{width:66px;height:69px;object-fit:contain;flex-shrink:0}',
      '.orgao{border-left:3px solid #33844c;padding-left:12px}',
      '.orgao h2{font-size:17px;letter-spacing:.1px;line-height:1.2;color:#123e64}',
      '.orgao p{font-size:11px;line-height:1.55;margin-top:5px;color:#53687b}',
      '.sistema{border-left:1px solid #b7cbd9;padding-left:12px;text-align:right;flex-shrink:0;white-space:nowrap}',
      '.sistema b{font-size:19px;color:#123f67;letter-spacing:1.4px}',
      '.sistema span{display:block;font-size:10px;color:#5c7080}',
      '.titulo{text-align:center;margin:0 0 20px}',
      '.titulo h1{font-size:25px;letter-spacing:.7px;color:#123f66;line-height:1.2}',
      '.titulo p{display:inline-block;margin-top:9px;padding:8px 17px;background:#eaf3eb;color:#205a3e;font-size:11px;font-weight:700;letter-spacing:.35px;border-bottom:2px solid #328c56}',
      '.resumo{display:grid;grid-template-columns:1.25fr 1.2fr .6fr 1fr;border:1px solid #c8d8e4;border-radius:8px;overflow:hidden;margin-bottom:18px}',
      '.resumo .item{min-width:0;padding:13px 10px;background:#f4f8fb;border-right:1px solid #dbe4eb}',
      '.resumo .item:last-child{border-right:0;background:#e8f4eb}',
      '.resumo small{display:block;color:#5c7284;font-size:10px;font-weight:700;letter-spacing:.2px}',
      '.resumo strong{display:block;font-size:13px;line-height:1.45;margin-top:5px;color:#173e61;overflow-wrap:anywhere}',
      '.resumo .total strong{font-size:18px;color:#14633b;white-space:nowrap}',
      '.op-bloco{border:1px solid #cadbe6;border-radius:8px;overflow:hidden;margin:0 0 17px}',
      '.op-cab{display:flex;align-items:center;justify-content:space-between;background:#eaf2f8;border-bottom:1px solid #cadbe6;padding:15px;gap:12px}',
      '.op-cab .rotulo{font-size:10px;color:#4e677c;text-transform:uppercase;font-weight:700;letter-spacing:.5px}',
      '.op-cab h2{font-size:17px;color:#17486f;margin:5px 0}',
      '.op-cab p{color:#4e6375;font-size:11px;line-height:1.5;max-width:440px}',
      '.op-cab .valor{text-align:right;white-space:nowrap;flex-shrink:0}',
      '.op-cab .valor strong{font-size:22px;color:#123e64}',
      '.mi-tab{width:100%;border-collapse:collapse;table-layout:auto}',
      '.mi-tab th{background:#f7f9fb;text-align:left;font-size:10px;color:#38576f;text-transform:uppercase;letter-spacing:.25px}',
      '.mi-tab th,.mi-tab td{padding:9px 11px;border-bottom:1px solid #dce5ed;font-size:12px}',
      '.mi-tab tbody tr:nth-child(even){background:#f8fafc}',
      '.mi-tab tbody tr:last-child td{border-bottom:0}',
      '.mi-tab td.valor,.mi-tab th.valor{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.mi-tab td.cod{white-space:nowrap;font-weight:700;color:#244964}',
      '.mi-tab tfoot td{font-weight:700;font-size:12px;color:#15476d;background:#edf4f9;border-top:1px solid #cbdbe6}',
      '.quadro-total{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#edf7ee;border:1px solid #92c3a0;border-radius:8px;padding:14px 15px;color:#1b5c39;margin-top:17px}',
      '.quadro-total span{font-size:12px;font-weight:700;letter-spacing:.2px}.quadro-total strong{font-size:21px;white-space:nowrap}',
      '.situacao{border-left:4px solid '+(c.conferido?'#328457':'#c89544')+';padding:10px 12px;background:'+(c.conferido?'#f1f8f2':'#fff9ed')+';color:#43566a;margin:18px 0 0;font-size:11px}',
      '.nota{margin-top:15px;color:#526578;font-size:11px;line-height:1.55}',
      '.assinaturas{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;margin-top:50px;text-align:center;color:#465d72;font-size:10px}',
      '.assinaturas span{display:block;border-top:1px solid #70899d;padding-top:7px}',
      '.rodape{border-top:1px solid #d1dce6;margin-top:26px;padding-top:9px;display:flex;justify-content:space-between;gap:12px;color:#748493;font-size:10px}',
      '.op-bloco,.quadro-total,.assinaturas{break-inside:avoid;page-break-inside:avoid}',
      '@media screen and (max-width:850px){.paper{max-width:calc(100% - 20px);padding:20px}.resumo{grid-template-columns:1fr 1fr}.resumo .item:nth-child(2){border-right:0}.resumo .item:nth-child(-n+2){border-bottom:1px solid #dbe4eb}.topo{flex-wrap:wrap}.toolbar{flex-wrap:wrap}.mi-tab th,.mi-tab td{padding:7px 6px}}',
      '@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{background:#fff!important;width:210mm}.toolbar{display:none!important}.paper{width:210mm;min-height:0;max-width:none;margin:0;padding:12mm 14mm 10mm;box-shadow:none}.barra{margin:10px 0 15px}.titulo{margin-bottom:13px}.titulo h1{font-size:23px}.titulo p{padding:6px 13px;margin-top:6px}.resumo{grid-template-columns:1.25fr 1.2fr .6fr 1fr;margin-bottom:12px}.resumo .item{padding:9px 9px}.resumo .item:nth-child(-n+2){border-bottom:0}.topo{flex-wrap:nowrap}.op-cab{padding:10px 12px}.op-bloco{margin-bottom:11px}.mi-tab th,.mi-tab td{padding:6px 9px;font-size:11px}.quadro-total{padding:10px 12px;margin-top:11px}.quadro-total strong{font-size:19px}.situacao{margin-top:11px;padding:7px 10px}.nota{margin-top:10px;font-size:10px}.assinaturas{margin-top:32px}.rodape{margin-top:17px}thead{display:table-header-group}tr{break-inside:avoid}.op-bloco,.assinaturas{page-break-inside:avoid}}'
    ].join('');
    const tabelaIndividual = g => {
      const linhas = g.registros.map(r => '<tr><td class="cod">'+esc((r.tipo||'Guia')+' '+r.numero)+'</td><td>'+esc(r.data||'—')+
        '</td><td>'+esc(r.arquivo||'—')+'</td><td class="valor">'+moeda(r.centavos)+'</td></tr>').join('');
      return '<table class="mi-tab"><thead><tr><th>Guia / empenho</th><th>Arrecadação</th><th>Documento de origem</th><th class="valor">Valor</th></tr></thead>'+
        '<tbody>'+linhas+'</tbody><tfoot><tr><td colspan="3">TOTAL DA FONTE '+esc(g.fonteCompleta)+'</td><td class="valor">'+moeda(g.total)+'</td></tr></tfoot></table>';
    };
    const memoriaIndividual = g =>
      '<section class="op-bloco"><div class="op-cab"><div><span class="rotulo">Identificação da OP</span><h2>'+esc(g.destino)+' · Fonte '+esc(siglaFonte(g.fonteCompleta))+
      '</h2><p>Fonte completa: '+esc(g.fonteCompleta)+' · '+esc(g.fonteNome||'Fonte de recursos')+
      ' · '+g.guias+' guia(s)</p></div><div class="valor"><span class="rotulo">Valor da OP</span><br><strong>'+moeda(g.total)+
      '</strong></div></div>'+(detalhado?tabelaIndividual(g):'')+'</section>';
    const memoriaResumo = grupos => '<section class="op-bloco"><div class="op-cab"><div><span class="rotulo">Relação de pagamentos</span><h2>Uma OP por banco e fonte de recurso</h2>'+
      '<p>'+grupos.length+' OP(s) sugeridas na competência '+esc(rotuloCompetencia(competencia))+'</p></div></div>'+
      '<table class="mi-tab"><thead><tr><th>Banco / desconto</th><th>Fonte completa</th><th>Guias</th><th class="valor">Valor da OP</th></tr></thead><tbody>'+
      grupos.map(g=>'<tr><td>'+esc(g.destino)+'</td><td class="cod">'+esc(g.fonteCompleta)+'</td><td>'+g.guias+
        '</td><td class="valor">'+moeda(g.total)+'</td></tr>').join('')+
      '</tbody></table></section>';
    const corpo = individual ? memoriaIndividual(g) : memoriaResumo(grupos);
    const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<title>Memória de cálculo · '+esc(competencia)+'</title><style>'+css+'</style></head><body>'+ 
      '<div class="toolbar"><span><b>Visualização A4</b> · Memória de cálculo para OP extraorçamentária</span>'+
      '<div class="acoes"><button id="mi-op-print-again" type="button">Imprimir / Salvar em PDF</button><button id="mi-op-close" type="button" class="fechar">Fechar</button></div></div>'+
      '<main class="paper">'+
      '<header class="topo"><div class="marca"><img id="mi-logo-prefeitura" class="brasao" src="'+esc(logoUrl)+'" alt="Brasão do Município de Frei Inocêncio">'+
      '<div class="orgao"><h2>PREFEITURA MUNICIPAL DE<br>FREI INOCÊNCIO</h2><p>Estado de Minas Gerais<br>Secretaria Municipal da Fazenda · Setor de Contabilidade</p></div></div>'+
      '<div class="sistema"><b>SISDIFI</b><span>Conferência de consignações</span></div></header><div class="barra"></div>'+
      '<div class="titulo"><h1>'+titulo+'</h1><p>'+esc(subtitulo)+'</p></div>'+
      '<div class="resumo"><div class="item"><small>COMPETÊNCIA DA FOLHA</small><strong>'+esc(rotuloCompetencia(competencia))+
      '</strong></div><div class="item"><small>BANCO / DESCONTO</small><strong>'+esc(nomeBanco)+
      '</strong></div><div class="item"><small>GUIAS</small><strong>'+quantidade+
      '</strong></div><div class="item total"><small>TOTAL DA MEMÓRIA</small><strong>'+moeda(total)+'</strong></div></div>'+
      corpo+'<div class="quadro-total"><span>TOTAL PARA EMISSÃO '+(individual?'DA OP':'DAS OPS')+'</span><strong>'+moeda(total)+'</strong></div>'+
      '<div class="situacao"><strong>Situação da conferência:</strong> '+esc(situacao)+
      '. Este impresso apresenta a memória de cálculo; não substitui a OP do sistema contábil.</div>'+
      '<p class="nota">Documento de apoio à emissão de ordem de pagamento extraorçamentária. Valores apurados das minutas de arrecadação da competência informada. Conferir banco, fonte de recurso, valores e documentos originais antes da emissão.</p>'+
      '<div class="assinaturas"><span>Responsável pela conferência</span><span>Setor de Contabilidade</span><span>Autorização</span></div>'+
      '<footer class="rodape"><span>Prefeitura Municipal de Frei Inocêncio · SISDIFI</span><span>Memória emitida em '+esc(emissao)+'</span></footer></main>'+
      '</body></html>';
    w.document.write(html);
    w.document.close();
    w.document.getElementById('mi-op-print-again')?.addEventListener('click',()=>w.print());
    w.document.getElementById('mi-op-close')?.addEventListener('click',()=>w.close());
    const imprimir = () => { try { w.focus(); w.print(); } catch (e) { status('Não foi possível abrir a impressão.'); } };
    const logo = w.document.getElementById('mi-logo-prefeitura');
    if (logo && !logo.complete) {
      let disparado=false;
      const concluir=()=>{if(disparado)return;disparado=true;imprimir();};
      logo.addEventListener('load',concluir,{once:true});
      logo.addEventListener('error',concluir,{once:true});
      setTimeout(concluir,1800);
    } else setTimeout(imprimir,150);
  }

  function alternarModoOP(op) {
    modoOP=op;
    $('#mi-op-conteudo').hidden=!op;
    $('#mi-detalhamento').hidden=op;
    $('#mi-modo-ops').setAttribute('aria-pressed',String(op));
    $('#mi-modo-detalhe').setAttribute('aria-pressed',String(!op));
  }
  function renderOPs(c) {
    const dados=agruparOPsPorBancoFonte(arquivos);
    const banco=$('#mi-op-banco').value;
    const itens=dados.itens.filter(g=>!banco||g.destino===banco);
    const total=itens.reduce((n,g)=>n+g.total,0);
    const revisado=$('#mi-revisado').checked;
    const bancos=DESTINOS.map(destino=>({destino,lista:itens.filter(g=>g.destino===destino)})).filter(b=>b.lista.length);
    $('#mi-ops').innerHTML=
      '<div class="mi-op-barra"><strong class="mi-op-resumo">'+itens.length+' OP(s) · '+moeda(total)+'</strong><small>Uma OP para cada combinação de banco e fonte completa.</small></div>'+
      (!c.conferido?'<p class="mi-op-aviso">Conferência mensal pendente: os valores são os das minutas importadas. Antes da emissão, verifique diferenças com a folha e valores esperados.</p>':'')+
      (dados.pendentes.length?'<p class="mi-op-aviso">'+dados.pendentes.length+' lançamento(s) sem banco/fonte válida não entraram no resumo. Revise-os.</p>':'')+
      (bancos.length?bancos.map(b=>{
        const subtotal=b.lista.reduce((n,g)=>n+g.total,0);
        return '<section class="mi-op-banco"><div class="mi-op-banco-cab"><div><h3>'+esc(b.destino)+'</h3><small>'+b.lista.length+' OP(s) por fonte</small></div><strong>'+moeda(subtotal)+'</strong></div>'+
          '<table class="mi-op-tabela"><thead><tr><th>Fonte de recurso</th><th>Guias</th><th style="text-align:right">Valor da OP</th><th style="text-align:right">Ações</th></tr></thead><tbody>'+
          b.lista.map(g=>{
            const i=dados.itens.indexOf(g);
            return '<tr><td class="mi-op-fonte"><strong>'+esc(g.fonteCompleta)+'</strong><small>'+esc(g.fonteNome)+'</small></td>'+
              '<td class="mi-op-qtd">'+g.guias+'</td><td class="mi-op-montante">'+moeda(g.total)+'</td>'+
              '<td class="mi-op-botoes"><button type="button" class="btn btn-sec" data-op-ver="'+i+'">Ver guias</button>'+
              '<button type="button" class="btn btn-sec" data-op-copiar="'+i+'">Copiar dados</button>'+
              '<button type="button" class="btn" data-op-imprimir="'+i+'" '+(!revisado||ocupado?'disabled':'')+'>Imprimir OP</button></td></tr>';
          }).join('')+'</tbody></table></section>';
      }).join(''):'<p class="mi-card">Nenhuma OP nesta seleção. Importe as minutas ou altere o filtro.</p>')+
      '<p class="dica">A impressão é uma memória para preencher a OP extraorçamentária no sistema contábil; não gera número nem registra pagamento automaticamente.</p>';
    $('#mi-ops').querySelectorAll('[data-op-ver]').forEach(b=>b.onclick=()=>{
      const g=dados.itens[Number(b.dataset.opVer)];
      if(!g)return;
      alternarModoOP(false);
      $('#mi-destino').value=g.destino;
      $('#mi-fonte').value=g.fonteCompleta;
      $('#mi-busca').value='';
      render();
      $('#mi-resultado').scrollIntoView({behavior:'smooth',block:'start'});
    });
    $('#mi-ops').querySelectorAll('[data-op-imprimir]').forEach(b=>b.onclick=()=>{
      const g=dados.itens[Number(b.dataset.opImprimir)];
      if(g&&!ocupado)imprimirMemoriaOP([g],true);
    });
    $('#mi-ops').querySelectorAll('[data-op-copiar]').forEach(b=>b.onclick=async()=>{
      const g=dados.itens[Number(b.dataset.opCopiar)];
      if(!g)return;
      try{await navigator.clipboard.writeText(textoParaOP(g));status('Dados da OP copiados: '+g.destino+' · fonte '+g.fonte);}
      catch(e){status('Não foi possível copiar automaticamente. Use a impressão da memória.');}
    });
  }

  function render() {
    const c=conferenciaMensal(arquivos,esperados), rs=filtrados();
    $('#mi-competencia').textContent=rotuloCompetencia(competencia);
    renderOPs(c);
    $('#mi-bancos').innerHTML=c.blocos.map((b,i)=>`<div class="mi-card"><h3>${esc(b.destino)}</h3><small>${b.arquivos?`${b.arquivos} arquivo(s) · ${b.registros.length} lançamentos`:'Arquivo pendente'}</small><p class="mi-total">${moeda(b.total)}</p><label class="campo"><span>Valor esperado · ${esc(b.destino)}</span><input data-esperado="${i}" inputmode="decimal" placeholder="Ex.: 10.000,00" value="${b.esperado===null?'':(b.esperado/100).toFixed(2).replace('.',',')}"></label><button class="btn btn-sec" data-salvar="${i}">Salvar valor</button><p class="${b.diferenca===0?'mi-ok':'mi-diferenca'}">${b.diferenca===null?'Informe o valor para comparar':b.diferenca===0?'Sem diferença de valor':b.diferenca>0?'Sobra '+moeda(b.diferenca):'Falta '+moeda(-b.diferenca)}</p><button class="btn btn-sec" data-ver="${i}">Ver lançamentos</button></div>`).join('');
    const documento = r => `${esc(r.tipo)} ${esc(r.numero)} · fonte(s) ${(r.fontes||[r.fonteCompleta]).map(esc).join(', ')} · ${moeda(r.centavos)} · ${esc(r.arquivo||'')} · p. ${(r.paginas||[r.pagina]).join(', ')}`;
    const hipoteses = c.investigacoes.map(t => {
      const combinacoes = t.combinacoes.map((docs,i) => `<li class="mi-candidato"><strong>Hipótese ${i+1}:</strong> ${docs.map(documento).join(' <strong>+</strong> ')} = <strong>${moeda(t.valor)}</strong></li>`).join('');
      const aproximados = t.proximos.map(r => `<li>${documento(r)} · diferença de ${moeda(Math.abs(r.centavos-t.valor))} para o valor investigado</li>`).join('');
      return `<section class="mi-card mi-analise"><h3>${t.exata?'Possível empenho em banco errado':'Investigar diferença parcial'}</h3><p><strong>${esc(t.sobra)} (sobra) → ${esc(t.falta)} (falta)</strong></p><p>Valor investigado: <strong>${moeda(t.valor)}</strong>${t.exata?' · Os saldos opostos se compensam.':' · Os saldos não se compensam integralmente.'}</p>${combinacoes?`<p>Documentos inteiros que, individualmente ou combinados (até 3), explicam esse valor:</p><ol>${combinacoes}</ol>`:`<p>Nenhum conjunto de até três documentos coincide com a diferença.${aproximados?' Documentos mais próximos para conferência:':''}</p>${aproximados?`<ul>${aproximados}</ul>`:''}`}<small>Indicação matemática para revisão manual; a descrição, a fonte e a minuta original precisam confirmar o destino correto. Nenhum empenho é alterado automaticamente.</small></section>`;
    }).join('');
    $('#mi-conferencia').innerHTML=`<div class="mi-card"><strong>${c.conferido?'Quatro categorias conferem com os valores esperados':'Conferência pendente'}</strong><p>Total das quatro categorias: ${moeda(c.total)}${c.esperado===null?' · Informe os quatro valores esperados para comparar.':` · Esperado: ${moeda(c.esperado)} · Diferença: ${moeda(c.diferenca)}`}</p>${c.diferenca===0&&c.blocos.some(b=>b.diferenca!==0)?'<p class="mi-aviso">O total geral bate, mas há diferenças entre bancos. Confira os empenhos apontados abaixo.</p>':''}${c.naoClassificados.length?`<p class="mi-aviso">${c.naoClassificados.length} lançamento(s) não classificado(s). Se a minuta é de um banco só, selecione o banco no arquivo para corrigir a classificação.</p>`:''}</div>${hipoteses}`;
    $('#mi-abas').querySelectorAll('[data-aba]').forEach(b => b.setAttribute('aria-selected',String(b.dataset.aba===$('#mi-destino').value)));
    $('#mi-arquivos').innerHTML=arquivos.map((a,i)=>{ const pendentes=avisosPendentes(a); return `<details class="mi-card"><summary><strong>${esc(a.nome)}</strong> · ${a.resultado.registros.length} linhas · ${moeda(a.resultado.totalLido)}${pendentes.length?' · Revisar avisos':''}</summary><p>Total do PDF: ${a.resultado.totalInformado===null?'Não identificado':moeda(a.resultado.totalInformado)}</p>${pendentes.length?`<ul class="mi-aviso">${pendentes.map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`:''}<label class="campo"><span>Banco do arquivo (opcional, para PDF sem identificação)</span><select data-classificar="${i}"><option value="">Identificação automática</option>${DESTINOS.map(d=>`<option value="${esc(d)}" ${a.destinoForcado===d?'selected':''}>${esc(d)}</option>`).join('')}</select></label><small>Escolha manualmente apenas se todos os lançamentos deste PDF pertencerem ao mesmo banco/desconto. A descrição extraída será preservada para auditoria.</small><div class="mi-acoes"><button class="btn btn-sec" data-pdf="${i}">Baixar PDF original</button><button class="btn btn-sec" data-remover="${i}">Retirar deste mês</button></div></details>`;}).join('');
    $('#mi-resultado').innerHTML=rs.length?`<div class="mi-card"><small>Detalhamento filtrado · ${rs.length} lançamentos</small><div class="mi-total">${moeda(rs.reduce((s,r)=>s+r.centavos,0))}</div></div>${tabela(agruparMinuta(rs))}`:'<div class="mi-card">Nenhum lançamento nesta seleção.</div>';
    el.querySelectorAll('[data-ver]').forEach(b=>b.onclick=()=>{alternarModoOP(false);$('#mi-destino').value=DESTINOS[Number(b.dataset.ver)];$('#mi-busca').value='';$('#mi-fonte').value='';render();$('#mi-resultado').scrollIntoView({behavior:'smooth'});});
    el.querySelectorAll('[data-salvar]').forEach(botao=>botao.onclick=async()=>{
      if(ocupado)return;
      const input=el.querySelector('[data-esperado="'+botao.dataset.salvar+'"]');
      const destino=DESTINOS[Number(botao.dataset.salvar)];
      try { const valor=valorEsperado(input.value);await gravar(arquivos,{...esperados,[destino]:valor}); }
      catch(e){status(e.message);render();}
    });
    el.querySelectorAll('[data-remover]').forEach(b=>b.onclick=async()=>{
      if(ocupado)return;
      if(!window.confirm('Retirar este arquivo da conferência de '+rotuloCompetencia(competencia)+'? Os valores serão recalculados.'))return;
      try{await gravar(arquivos.filter((_,i)=>i!==Number(b.dataset.remover)),esperados);}catch(e){status(e.message);}
    });
    el.querySelectorAll('[data-pdf]').forEach(b=>b.onclick=()=>baixar(arquivos[Number(b.dataset.pdf)].pdf,arquivos[Number(b.dataset.pdf)].nome));
    el.querySelectorAll('[data-classificar]').forEach(select=>select.onchange=async()=>{
      if(ocupado)return;
      const i=Number(select.dataset.classificar), destino=select.value, a=arquivos[i];
      const novo=classificarArquivo(a,destino);
      try{await gravar(arquivos.map((x,j)=>j===i?novo:x),esperados);}catch(e){status(e.message);render();}
    });
    travar(ocupado);
  }
  function atualizar() {
    $('#mi-revisado').checked=false;
    const anterior=$('#mi-fonte').value;
    $('#mi-fonte').innerHTML='<option value="">Todas</option>'+[...new Set(todos().map(r=>r.fonteCompleta).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true})).map(f=>`<option value="${esc(f)}">${esc(f.replace(/\D/g,'').slice(0,4))} · ${esc(f)}</option>`).join('');
    $('#mi-fonte').value=[...$('#mi-fonte').options].some(o=>o.value===anterior)?anterior:'';
    render();
  }
  async function gravar(novos,novosEsperados) {
    if(!ativo||erroCarga)throw Error('Reabra a tela para carregar o histórico.');
    travar(true);
    try {
      const proxima=await salvarMes(uid,competencia,{arquivos:novos,esperados:novosEsperados,revisao});
      if(!ativo)return;
      revisao=proxima;arquivos=novos;esperados=novosEsperados;status('Salvo neste navegador · '+rotuloCompetencia(competencia));
    } finally {if(ativo){ocupado=false;atualizar();}}
  }
  async function carregar() {
    travar(true);erroCarga=false;arquivos=[];esperados={};revisao=0;atualizar();status('Carregando '+rotuloCompetencia(competencia)+'…');
    try {const d=await carregarMes(uid,competencia);if(!ativo)return;arquivos=d.arquivos;esperados=d.esperados;revisao=d.revisao;
      const processados=arquivos.map(reconhecerCodigoCaixaExistente);
      const reconhecidos=processados.reduce((s,x)=>s+x.alterados,0);
      if(reconhecidos){await gravar(processados.map(x=>x.arquivo),esperados);status(reconhecidos+' guia(s) com código 21 reconhecida(s) automaticamente como Caixa.');}
      else status('Histórico local carregado.');}
    catch(e){erroCarga=true;status('Não foi possível abrir o histórico local. '+e.message);}
    finally{if(ativo){ocupado=false;atualizar();}}
  }
  const mudar=()=>{
    const ano=$('#mi-ano').value;
    if(!/^\d{4}$/.test(ano)||Number(ano)<2000||Number(ano)>2100){status('Informe um ano entre 2000 e 2100.');$('#mi-ano').value=competencia.slice(0,4);return;}
    competencia=ano+'-'+$('#mi-mes').value;$('#mi-destino').value='';$('#mi-busca').value='';carregar();
  };
  $('#mi-mes').onchange=$('#mi-ano').onchange=mudar;
  $('#mi-pdf').onchange=async e=>{
    if(ocupado||erroCarga)return;
    const files=[...e.target.files],novos=[...arquivos],erros=[];
    travar(true);$('#mi-revisado').checked=false;
    try {
      for(const file of files){
        if(!ativo)break;status('Analisando '+file.name+'…');
        try{
          if(!/\.pdf$/i.test(file.name)||file.size>15*1024*1024)throw Error('Selecione um PDF de até 15 MB.');
          const data=await file.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(b=>b.toString(16).padStart(2,'0')).join('');
          if(novos.some(a=>a.hash===hash))throw Error('Este PDF já está neste mês; cópia ignorada.');
          const resultado=vincularFolha(await extrairMinuta(data),competencia);
          resultado.registros=resultado.registros.map(r=>({...r,destinoOriginal:r.destino}));
          if(!resultado.registros.length)throw Error('Nenhum lançamento reconhecido. Confira o layout e se o PDF possui texto.');
          const chaves=new Set(novos.flatMap(a=>a.resultado.registros).map(r=>[r.data,r.numero,r.fonteCompleta,r.destino,r.centavos].join('|')));
          if(resultado.registros.some(r=>chaves.has([r.data,r.numero,r.fonteCompleta,r.destino,r.centavos].join('|'))))resultado.avisos.push('Há lançamentos iguais em outro PDF deste mês. Confira a sobreposição antes de usar os totais.');
          novos.push({nome:file.name,hash,resultado,pdf:file});
        }catch(err){erros.push(file.name+': '+(err.message||'Falha na leitura. Verifique o PDF e a conexão com o leitor.'));}
      }
      if(ativo&&novos.length!==arquivos.length)await gravar(novos,esperados);
      if(erros.length)status(erros.join(' | '));
    }catch(err){status(err.message+' Os novos PDFs não foram adicionados.');}
    finally{if(ativo){ocupado=false;$('#mi-pdf').value='';atualizar();}}
  };
  $('#mi-destino').onchange=$('#mi-fonte').onchange=$('#mi-revisado').onchange=$('#mi-op-banco').onchange=render;
  $('#mi-modo-ops').onclick=()=>alternarModoOP(true);
  $('#mi-modo-detalhe').onclick=()=>alternarModoOP(false);
  $('#mi-op-imprimir-todos').onclick=()=>{
    const banco=$('#mi-op-banco').value;
    imprimirMemoriaOP(agruparOPsPorBancoFonte(arquivos).itens.filter(g=>!banco||g.destino===banco),false);
  };
  $('#mi-abas').querySelectorAll('[data-aba]').forEach(b=>b.onclick=()=>{
    $('#mi-destino').value=b.dataset.aba;$('#mi-fonte').value='';$('#mi-busca').value='';render();
    $('#mi-resultado').scrollIntoView({behavior:'smooth',block:'start'});
  });
  $('#mi-busca').oninput=render;
  function baixar(blob,nome){const url=URL.createObjectURL(blob);urls.add(url);const a=document.createElement('a');a.href=url;a.download=nome;a.click();setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},1000);}
  $('#mi-csv').onclick=()=>{
    const cell=s=>'"'+String(s??'').replace(/^[=+@-]/,"'"+'$&').replace(/"/g,'""')+'"';
    const linhas=[['Competência da folha',competencia],['Conferência mensal (todos os lançamentos)'],['Destino','Importado','Esperado','Diferença','Arquivos']];
    const c=conferenciaMensal(arquivos,esperados),num=n=>n===null?'':(n/100).toFixed(2).replace('.',',');
    for(const b of c.blocos)linhas.push([b.destino,num(b.total),num(b.esperado),num(b.diferenca),b.arquivos]);
    linhas.push([],['Detalhamento conforme filtros'],['Destino','Tipo','Número','Data da arrecadação','Fonte','Fonte completa','Valor','Arquivo','Página']);
    for(const g of agruparMinuta(filtrados())){
      for(const r of g.registros)linhas.push([g.destino,r.tipo,r.numero,r.data,r.fonte,r.fonteCompleta,num(r.centavos),r.arquivo,r.pagina]);
      linhas.push([g.destino,'TOTAL DA FONTE','','',g.fonte,'',num(g.total)]);
    }
    baixar(new Blob(['\uFEFF'+linhas.map(l=>l.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'consignacoes-'+competencia+'.csv');
  };
  $('#mi-print').onclick=()=>{
    const w=window.open('','_blank');if(!w){status('Permita a abertura da janela para imprimir.');return;}w.opener=null;
    const c=conferenciaMensal(arquivos,esperados);
    w.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Consignações ${esc(competencia)} · SISDIFI</title><style>body{font:12px Arial;padding:20px;color:#172b42}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #ccc;text-align:left}small{display:block}.mi-valor{text-align:right}h3{margin-top:28px}tr{break-inside:avoid}thead{display:table-header-group}</style><h1>SISDIFI · Conferência mensal</h1>${resumo(c)}<p>${c.conferido?'Valores das quatro categorias conferem.':'Conferência pendente: revise arquivos, valores e avisos.'}</p>${c.trocas.map(t=>`<p>Possível troca: sobra ${moeda(t.valor)} em ${esc(t.sobra)}, falta igual em ${esc(t.falta)}.</p>`).join('')}<h2>Detalhamento conforme filtros</h2>${tabela(agruparMinuta(filtrados()))}</html>`);w.document.close();w.focus();w.print();
  };
  carregar();
  return{titulo:'Consignações por mês',limpar:()=>{ativo=false;arquivos=[];urls.forEach(u=>URL.revokeObjectURL(u));urls.clear();}};
}
