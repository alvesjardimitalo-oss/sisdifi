import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../assets/js/views/fiscal.js', import.meta.url),'utf8');
let mau = 0;
const t = (nome, ok, detalhe='') => { if(!ok) mau++; console.log((ok?'ok  ':'ERRO')+'  '+nome+(ok?'':'  '+detalhe)); };

// o bug: a pergunta era desenhada em 2 lugares e ligada em 1
const desenhos = (src.match(/perguntaUnica\(\)/g)||[]).length;
t('a pergunta e desenhada em mais de um caminho', desenhos >= 2, `achei ${desenhos}`);

// delegacao no documento cobre todos eles
t('submit ligado por delegacao no documento',
  /document\.addEventListener\('submit'/.test(src));
t('a delegacao impede o envio nativo',
  /\[data-pergunta\]'\)[\s\S]{0,120}preventDefault\(\)/.test(src));

// nao pode sobrar ligacao local, que foi a origem do bug
t('nenhuma ligacao local por caminho de desenho',
  !/perg\.onsubmit|box\.querySelector\('\[data-pergunta\]'\)/.test(src));

// inline handler esbarraria em CSP
t('sem onsubmit inline', !/onsubmit="/.test(src));

// o container precisa estar guardado para a delegacao alcancar
t('a tela guarda o container', /s\.el = el/.test(src));
process.exit(mau?1:0);
