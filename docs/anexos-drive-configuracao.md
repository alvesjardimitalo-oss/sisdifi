# SISDIFI — Configuração de anexos (ambiente de homologação)

## Conta e pasta
- Conta proprietária prevista: sisdifistorage@gmail.com
- Pasta raiz: 1_y50QqapSN87hJJd5zSrPUzhiYvXAhPW
- URL: https://drive.google.com/drive/folders/1_y50QqapSN87hJJd5zSrPUzhiYvXAhPW
- **A propriedade e as permissões ainda não foram verificadas pela integração.**

## Segurança e autenticação
- Não tornar a pasta pública e não usar links com acesso a qualquer pessoa.
- Usar backend que valide o Firebase ID token e confira perfil, secretaria e solicitação no Firestore antes de operar no Drive.
- OAuth do Google Drive deve ser autorizado pela conta institucional e armazenado como segredo no servidor; jamais publicar refresh token, client secret ou service account JSON no GitHub.
- Conta Gmail comum não deve ser tratada como Google Workspace com delegação de domínio; configurar OAuth consent + autorização da conta proprietária conforme política Google.
- Não presumir que conectar Google Drive ao ChatGPT autoriza o SISDIFI: são integrações diferentes.

## Variáveis de ambiente do backend (somente nomes)
- FIREBASE_PROJECT_ID
- GOOGLE_DRIVE_ROOT_FOLDER_ID=1_y50QqapSN87hJJd5zSrPUzhiYvXAhPW
- GOOGLE_OAUTH_CLIENT_ID
- GOOGLE_OAUTH_CLIENT_SECRET
- GOOGLE_OAUTH_REFRESH_TOKEN
- ALLOWED_ORIGIN

## Contrato HTTP proposto
- GET /solicitacoes/:id/anexos -> { anexos: [...] }
- POST /solicitacoes/:id/anexos -> multipart/form-data com arquivo e categoria
- GET /solicitacoes/:id/anexos/:anexoId/conteudo -> stream autenticado do arquivo
- DELETE /solicitacoes/:id/anexos/:anexoId -> somente com política de retenção definida

## Homologação obrigatória
1. Secretaria A envia PDF, JPG e PNG para solicitação da própria pasta.
2. Secretaria B não consegue listar, enviar nem baixar arquivos da Secretaria A.
3. Controle Interno visualiza/imprime anexos de solicitações não internas.
4. Contabilidade visualiza/imprime anexos para empenho.
5. Usuário inativo ou sem login recebe 401/403.
6. Arquivos acima de 10 MB ou de tipo não permitido são rejeitados.
7. Confirmar que arquivos não são persistidos como base64 no Firestore.
8. Conferir que o fluxo atual de diárias e relatórios não sofreu regressões.

## Estado
Preparação de integração apenas. O backend, a autorização OAuth e a interface ainda não foram implantados.
