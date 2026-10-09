# SISDIFI — Etapa de vinculação de anexos (homologação)

## Estado confirmado em 09/10/2026
- Pasta privada do Drive acessível pelo Apps Script e teste de escrita/leitura aprovado.
- Interface HTML Service funcionando no endereço /dev, com validação local de PDF/JPG/PNG (10 MB).
- Firebase rejeita tokens inválidos; Firestore rejeita listagem anônima.
- Fetch direto do GitHub Pages para /dev falhou por CORS.
- **Nenhum usuário real foi autenticado no Apps Script; nenhuma autorização por perfil foi testada.**
- A implantação atual é **Somente eu**. Não ampliar acesso.

## Vínculo obrigatório
Cada anexo precisa ter o **ID imutável do documento Firestore** `solicitacoes/{solicitacaoId}`, nunca apenas o número legível `0001/2026`. O backend deve buscar o documento e obter seu `numero` para apresentação, além de `secretaria_id`, `visivel_secretaria`, `interna` e `etapa` para autorização. O cliente não pode definir esses atributos de acesso.

Metadados planejados em `solicitacoes/{solicitacaoId}/anexos/{anexoId}`:
- `drive_file_id` (interno, nunca retornado ao navegador)
- `nome_original`, `mime_type`, `tamanho_bytes`, `categoria`
- `criado_por_uid`, `criado_em`, `status`

## Autorização (a ser implementada e testada)
1. Validar ID token Firebase em **cada operação** (não confiar em email/perfil informado pelo navegador).
2. Ler `usuarios/{uid}`, confirmar `ativo === true` e perfil atual.
3. Ler `solicitacoes/{solicitacaoId}` no Firestore sob contexto de autorização adequado.
4. Secretaria: só solicitações da própria `secretaria_id`, com `visivel_secretaria === true`, `interna === false`; upload apenas em `analise` ou `reprovada`.
5. Controle Interno: somente visualização/impressão de solicitações não internas.
6. Contabilidade (`operador`) e admin: leitura segundo regras vigentes; não permitir upload sem requisito explícito.
7. Nenhum ID de Drive, link público ou conteúdo de documento pode ser retornado antes da autorização.
8. Validar conteúdo/tipo/tamanho no servidor, registrar auditoria, limitar arquivos por solicitação e impedir associação a ID inexistente.

## Bloqueadores antes de liberar
- `google.script.run` funciona **apenas dentro do HTML Service**, não é uma API REST compatível com o cliente atual `assets/js/anexos.js`.
- /dev só funciona para editores do projeto; implantação `Somente eu` não permite uso pelas secretarias.
- Implantar `Executar como eu` para usuários externos concede às funções Apps Script os poderes do proprietário: **todas** as funções que acessam dados devem autenticar e autorizar no servidor. Funções de teste que acessam Drive (`testarConexaoDrive`, `testarArmazenamentoSISDIFI`) devem ser removidas/isoladas antes de ampliar o acesso, pois funções globais podem ser chamadas pelo HTML Service.
- Avaliar uma forma de passar identidade Firebase à interface HTML Service sem expor token em URL, logs ou armazenamento persistente, e comprovar leitura autenticada do Firestore e rejeição de acesso entre secretarias.
- Não mesclar PR nem habilitar `SISDIFI_ANEXOS_API_URL` até existir implementação end-to-end testada.
- Sem faturamento habilitado; cotas gratuitas não garantem disponibilidade ilimitada.

## Testes mínimos de homologação
- Usuário sem login, desativado, `consulta` e `rh`: negar.
- Secretaria A não consegue listar, anexar ou ler arquivo da Secretaria B.
- Secretaria não anexa após aprovação.
- Controle Interno só lê solicitações permitidas e não anexa.
- Contabilidade lê/imprime, sem acesso a links públicos.
- IDs falsos e arquivos com MIME/extensão adulterados: negar.
- Não modificar numeração, cálculos, fluxo de aprovação, impressão existente ou dados financeiros.
