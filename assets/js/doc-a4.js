// SISDIFI — Padrão visual dos documentos A4 (mesmo da memória de cálculo das Consignações):
// brasão, cabeçalho da Prefeitura, faixa azul/verde, quadros, assinaturas e rodapé. Usado nas Retenções e nas contas da COPASA.
export const escH = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Mesmo padrão visual da memória de cálculo das Consignações (folha A4, brasão, faixa azul/verde).
export const CSS_DOC = [
  '@page{size:A4 portrait;margin:0}', '*{box-sizing:border-box}', 'html{margin:0;padding:0}',
  'body{margin:0;background:#e8edf3;color:#172c42;font:13px/1.46 Arial,Helvetica,sans-serif}', 'h1,h2,h3,p{margin:0}',
  '.barra{height:5px;background:linear-gradient(90deg,#14517c 0 74%,#33844c 74%);margin:15px 0 22px}',
  '.toolbar{width:210mm;max-width:calc(100% - 24px);margin:18px auto 0;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#33526c;font-size:13px}',
  '.toolbar .acoes{display:flex;gap:8px}.toolbar button{background:#155078;border:1px solid #155078;color:#fff;border-radius:6px;font:600 13px Arial;padding:10px 14px;cursor:pointer}',
  '.toolbar button.fechar{background:#fff;color:#204765;border-color:#b9cbd9}',
  '.paper{width:210mm;min-height:297mm;margin:14px auto 36px;padding:14mm 15mm 12mm;background:#fff;box-shadow:0 9px 28px rgba(21,48,74,.18);display:flex;flex-direction:column}',
  '.topo{display:flex;align-items:center;justify-content:space-between;gap:15px}.marca{display:flex;gap:13px;align-items:center;min-width:0}',
  '.brasao{width:66px;height:69px;object-fit:contain;flex-shrink:0}.orgao{border-left:3px solid #33844c;padding-left:12px}',
  '.orgao h2{font-size:17px;line-height:1.2;color:#123e64}.orgao p{font-size:11px;line-height:1.55;margin-top:5px;color:#53687b}',
  '.sistema{border-left:1px solid #b7cbd9;padding-left:12px;text-align:right;flex-shrink:0;white-space:nowrap}.sistema b{font-size:19px;color:#123f67;letter-spacing:1.4px}.sistema span{display:block;font-size:10px;color:#5c7080}',
  '.titulo{text-align:center;margin:0 0 18px}.titulo h1{font-size:23px;letter-spacing:.6px;color:#123f66;line-height:1.2}',
  '.titulo p{display:inline-block;margin-top:9px;padding:7px 16px;background:#eaf3eb;color:#205a3e;font-size:11px;font-weight:700;letter-spacing:.35px;border-bottom:2px solid #328c56}',
  '.resumo{display:grid;grid-template-columns:1fr 1.15fr 1.35fr 1fr;border:1px solid #c8d8e4;border-radius:8px;overflow:hidden;margin-bottom:16px}',
  '.resumo .item{min-width:0;padding:11px 10px;background:#f4f8fb;border-right:1px solid #dbe4eb}.resumo .item:last-child{border-right:0;background:#e8f4eb}',
  '.resumo small{display:block;color:#5c7284;font-size:10px;font-weight:700;letter-spacing:.2px}.resumo strong{display:block;font-size:13px;line-height:1.4;margin-top:4px;color:#173e61;overflow-wrap:anywhere}',
  '.resumo .total strong{font-size:18px;color:#14633b;white-space:nowrap}',
  '.bloco{border:1px solid #cadbe6;border-radius:8px;overflow:hidden;margin:0 0 15px}',
  '.bloco-cab{display:flex;align-items:center;justify-content:space-between;background:#eaf2f8;border-bottom:1px solid #cadbe6;padding:13px 15px;gap:12px}',
  '.rotulo{font-size:10px;color:#4e677c;text-transform:uppercase;font-weight:700;letter-spacing:.5px}.bloco-cab h2{font-size:17px;color:#17486f;margin:4px 0}.bloco-cab p{color:#4e6375;font-size:11px}',
  '.tab{width:100%;border-collapse:collapse}.tab th{width:34%;background:#f7f9fb;text-align:left;font-size:10px;color:#38576f;text-transform:uppercase;letter-spacing:.25px}',
  '.tab th,.tab td{padding:8px 11px;border-bottom:1px solid #dce5ed;font-size:12px;vertical-align:top}.tab tr:last-child th,.tab tr:last-child td{border-bottom:0}',
  '.lista th{width:auto}.lista td.v,.lista th.v{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.lista tfoot td{font-weight:700;background:#edf4f9;border-top:1px solid #cbdbe6}',
  '.quadro-total{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#edf7ee;border:1px solid #92c3a0;border-radius:8px;padding:13px 15px;color:#1b5c39}',
  '.quadro-total span{font-size:12px;font-weight:700}.quadro-total strong{font-size:22px;white-space:nowrap}.quadro-total em{display:block;font-size:11px;font-weight:400;color:#2f6a49;margin-top:3px}',
  '.historico{margin-top:14px;border:1px dashed #9db6c8;border-radius:8px;padding:10px 13px;background:#fbfdff}.historico small{display:block;font-size:10px;font-weight:700;color:#4e677c;letter-spacing:.4px}.historico p{font:600 13px/1.45 "Courier New",monospace;color:#123e64;margin-top:4px}',
  '.nota{margin-top:13px;color:#526578;font-size:11px;line-height:1.55;text-align:justify}',
  '.assinaturas{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;margin-top:auto;padding-top:46px;text-align:center;color:#465d72;font-size:10px}.assinaturas span{display:block;border-top:1px solid #70899d;padding-top:7px}',
  '.rodape{border-top:1px solid #d1dce6;margin-top:22px;padding-top:8px;display:flex;justify-content:space-between;gap:12px;color:#748493;font-size:10px}',
  '.paper{break-after:page;page-break-after:always}.paper:last-of-type{break-after:auto;page-break-after:auto}',
  '@media screen and (max-width:850px){.paper{max-width:calc(100% - 20px);padding:20px}.resumo{grid-template-columns:1fr 1fr}.topo{flex-wrap:wrap}}',
  '@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{background:#fff!important;width:210mm}.toolbar{display:none!important}.paper{width:210mm;min-height:296mm;max-width:none;margin:0;padding:12mm 14mm 10mm;box-shadow:none}tr{break-inside:avoid}thead{display:table-header-group}}'
].join('');

export function cabecalhoDoc(cfg, subtitulo) {
  const orgao = String(cfg.orgao || 'PREFEITURA MUNICIPAL DE FREI INOCÊNCIO').replace(/^PREFEITURA MUNICIPAL DE\s*/i, '');
  return `<header class="topo"><div class="marca"><img class="brasao doc-logo" src="${escH(cfg.logo || '')}" alt="Brasão do Município">
    <div class="orgao"><h2>PREFEITURA MUNICIPAL DE<br>${escH(orgao)}</h2><p>Estado de Minas Gerais${cfg.cnpj ? ' · CNPJ ' + escH(cfg.cnpj) : ''}<br>Secretaria Municipal da Fazenda · Setor de Contabilidade</p></div></div>
    <div class="sistema"><b>SISDIFI</b><span>${escH(subtitulo)}</span></div></header><div class="barra"></div>`;
}
export const toolbarDoc = texto => `<div class="toolbar"><span><b>Visualização A4</b> · ${escH(texto)}</span><div class="acoes"><button id="doc-imprimir" type="button">Imprimir / Salvar em PDF</button><button id="doc-fechar" type="button" class="fechar">Fechar</button></div></div>`;

