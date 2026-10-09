# SISDIFI — Anexos no Google Drive (implantação segura)

## Objetivo
Secretarias enviam convites, comprovantes de inscrição e PDFs para análise do Controle Interno e impressão pela Contabilidade. Os binários ficam no Google Drive de uma conta exclusiva do SISDIFI; o Firestore armazena somente metadados.

## Infraestrutura
1. Criar conta Google exclusiva sob controle institucional, com recuperação e autenticação de dois fatores. Não registrar senhas nem chaves no GitHub.
2. Criar pasta privada SISDIFI/Anexos; não ativar compartilhamento público por link.
3. Provisionar backend autenticado (ex.: Cloud Run) com acesso ao Drive por OAuth da conta institucional ou delegação autorizada. GitHub Pages não pode guardar credenciais.
4. Backend deve verificar Firebase ID token com Admin SDK, consultar usuarios/{uid} e solicitacoes/{id} no Firestore e aplicar as permissões ANTES de cada upload, download ou exclusão. Nunca confiar no perfil enviado pelo navegador.
5. Usar API do Google Drive no backend para gravar arquivos e fazer streaming de leitura/impressão. Não expor tokens OAuth ou links públicos.
6. Configurar CORS apenas para a origem oficial do SISDIFI; impor limites de tamanho, taxa e quota.

## Modelo sugerido
Coleção solicitacoes/{solicitacaoId}/anexos/{anexoId}:
- drive_file_id (somente backend)
- nome_original, mime_type, tamanho_bytes
- categoria: convite | inscricao | outro
- criado_em, criado_por_uid
- status: disponivel | removido

O backend controla a escrita dessa coleção com Admin SDK; negar gravação direta por clientes nas regras Firestore.

## Permissões
- Secretaria: enviar e visualizar anexos da própria secretaria enquanto a solicitação está em análise ou reprovada; não alterar anexos após aprovação.
- Controle Interno: visualizar e imprimir anexos das solicitações não internas durante a análise.
- Contabilidade e administrador: visualizar e imprimir anexos das solicitações autorizadas conforme regras existentes.
- Consulta e RH: sem acesso por padrão.
- Toda operação deve registrar auditoria com UID, solicitação, ação e horário.

## Validações
- Aceitar PDF, JPG e PNG, até 10 MB por arquivo, no máximo 10 anexos por solicitação.
- Validar MIME e assinatura do conteúdo no servidor, não somente extensão; sanitizar nomes.
- Gerar IDs opacos para arquivos; não usar CPF ou nome do servidor no caminho.
- Evitar duplicações e arquivos órfãos: confirmar gravação no Drive antes de registrar metadados e limpar uploads incompletos.
- Retenção e exclusão de documentos precisam de política administrativa; exclusão lógica preferível.

## Integração planejada
- Formulário de nova solicitação: seleção de anexos; upload apenas após existir ID da solicitação; indicar andamento e falhas sem perder a solicitação.
- Detalhe da solicitação: lista de anexos e ações Visualizar/Imprimir, com botão de envio quando permitido.
- Controle Interno: anexos visíveis antes da decisão, sem alterar a rotina de aprovação/reprovação.
- Contabilidade: acesso aos comprovantes para instrução do empenho.
- Não modificar motor de cálculo, coleção de valores, numeração, impressão atual ou fluxo de tramitação.

## Pré-requisitos para ativar
- Conta Google exclusiva criada e pasta provisionada pelo responsável.
- Credenciais OAuth/identidade de serviço configuradas no backend, nunca no frontend.
- URL do backend configurada na aplicação.
- Testes com usuários reais de cada perfil e teste negativo de acesso entre secretarias.
- Implantação gradual após homologação; não ativar interface de upload sem backend seguro.
