# SISDIFI — Anexos Google Drive: handoff técnico para Claude

**Estado em 09/10/2026:** módulo **desativado temporariamente na interface principal** por solicitação do responsável. Não remover arquivos, pasta ou implantação. Código preservado para revisão. O ponto de integração em `assets/js/views/solicitacoes.js` está comentado (import e chamada de `montarPainelAnexos`). A DIV vazia permanece. Não alterar o restante do SISDIFI.

## Arquitetura e pontos de integração

- Repositório: `alvesjardimitalo-oss/sisdifi`, site GitHub Pages, autenticação Firebase Auth (Google e e-mail/senha), Firestore.
- `assets/js/db.js`: `tokenAnexos()` devolve `auth.currentUser.getIdToken()` da sessão já aberta; não há necessidade de novo login.
- `assets/js/painel-anexos.js`: UI compacta expansível, carrega iframe Apps Script somente quando aberta, gera canal aleatório de 24 bytes e envia `solicitacao` e `canal` na URL (NUNCA token na URL). Recebe `postMessage` do Apps Script de origem `script.google.com` ou subdomínio `googleusercontent.com`, verifica `tipo=sisdifi-anexos-pronto` e canal, responde `tipo=sisdifi-anexos-sessao`, canal e ID token Firebase. Apps Script HTML é hospedado em iframe interno, portanto comparar `event.source` com iframe externo quebra o handshake.
- `index.html`: `window.SISDIFI_ANEXOS_APP_URL` aponta para `https://script.google.com/macros/s/AKfycbx-TjZPQz7ZaVGs1BIyOPJ5ofhdV2RuFSwgRezR69lYRYrUOdWLkT6IjyOdu2OF8oaO/exec`. Manter até decidir nova implantação.
- Apps Script projeto: `1fC97aPFHE72Uiraz51dwWW7KYbEQKpJnEDu86E_FzdMp3wpC5DZkrEd0`; arquivos `Código.gs` e `Anexos.html` são editados no Google Apps Script, **não são automaticamente publicados por commits GitHub**.
- Pasta privada Google Drive: `1_y50QqapSN87hJJd5zSrPUzhiYvXAhPW`, proprietária `sisdifistorage@gmail.com`. A conta `alvesjardim.italo@gmail.com` executava uma implantação antiga e inicialmente não tinha acesso à pasta. Foi orientado compartilhamento restrito como editor; confirmar estado atual antes de presumir.
- `Code.gs`: `doGet(e)` injeta `solicitacaoInicial` e `canalSso` no template HTML; habilita iframe por `HtmlService.XFrameOptionsMode.ALLOWALL`. `autorizar_(token, solicitacaoId, gravar)` valida token Firebase via Identity Toolkit, lê `usuarios/{uid}` e `solicitacoes/{id}` via Firestore REST e confere perfil, secretaria e etapa antes de acessar Drive. `listarAnexos`, `enviarAnexo`, `lerAnexo`, `excluirAnexo` são funções expostas ao `google.script.run`.
- Metadados dos arquivos ficam na descrição do arquivo do Drive, incluindo `solicitacaoId`, nome, tipo, categoria, tamanho, uid; não há link público. Upload aceita PDF/JPG/PNG até 4 MB, até 10 anexos/solicitação, confere assinatura e usa lock. Listagem atual percorre arquivos da pasta e filtra por `solicitacaoId` (custo linear e possível lentidão futura). É melhor indexar sem perder o controle de acesso.
- Perfis: secretaria só própria solicitação visível, não interna, etapa `analise` ou `reprovada` para enviar; `controle_interno` consulta solicitações não internas; `admin` e `operador` consultam. Conferir perfil efetivo de Contabilidade. Exclusão pretendida para admin/operador e secretaria quando ainda autorizada a enviar, nunca Controle Interno.
- Segurança: Apps Script web app acessível sem login Google próprio para permitir iframe, mas **toda função pública que toca em dados/Drive deve validar Firebase token e autorização no servidor**. Nunca aceitar UID/perfil vindos da UI como autorização. Não adicionar links públicos aos arquivos. Auditar funções globais de teste. Usar o princípio do menor privilégio.

## Histórico e defeitos reproduzidos

1. Segunda tela de login removida por integração da sessão Firebase via postMessage. Depois de corrigir o `event.source` (Apps Script iframe interno), sessão e visualização passaram a funcionar.
2. Erro `Exception: Nenhum item com o ID fornecido foi encontrado` em `arquivos_`/DriveApp: implantação executava como conta pessoal sem acesso à pasta. Alteração de implantação/compartilhamento resolveu visualização segundo usuário.
3. Erro `ReferenceError: canalSso is not defined` em `Anexos.html`: corrigido passando `t.canalSso` no `doGet(e)`.
4. Interface grande: painel passou a ser recolhível e iframe lazy-loaded em `assets/js/painel-anexos.js`.
5. **PENDÊNCIA ATUAL:** botão Excluir aparece, confirmação customizada funciona, mas chamada de exclusão retorna `Exception: Acesso negado. DriveApp.` após clicar **Confirmar exclusão**. Código tentou `DriveApp.getFileById(id_(anexoId))`, verifica descrição e pasta e usa `f.setTrashed(true)`. É necessário identificar exatamente qual operação falha no registro de Execuções, a conta executora, o proprietário do arquivo, o escopo OAuth do Apps Script e eventuais restrições; **não** afirmar sem prova que é problema de OAuth ou conta. Não usar exclusão definitiva. Implementar mensagens de erro discriminadas e testes seguros, não manipular anexos reais em diagnóstico.
6. Versões ZIP entregues em conversa podem divergir do Apps Script implantado; inspecionar os arquivos atuais do projeto antes de corrigir. Não sobrescrever versões mais novas sem comparar.

## Reativação (somente após correção e aprovação)

1. Revisar Apps Script real, corrigir exclusão com validação de perfil e mover à lixeira, testar consulta/envio/visualização/exclusão para admin, secretaria e Controle Interno.
2. Descomentar import e chamada `montarPainelAnexos` em `assets/js/views/solicitacoes.js`; manter `tokenAnexos()` e URL somente se ainda válidos.
3. Atualizar versão de cache `assets/js/app.js?v=...` em `index.html`, verificar GitHub Pages e não ativar sem validação.

**Custo:** manter Firebase Spark, Apps Script e Google Drive dentro das cotas gratuitas; não habilitar faturamento nem migrar para serviços pagos.
