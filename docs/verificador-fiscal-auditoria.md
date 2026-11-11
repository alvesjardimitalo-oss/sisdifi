# SISDIFI — Auditoria fiscal pré-liquidação de Frei Inocêncio

## Competência e finalidade
Tomador: **Prefeitura Municipal de Frei Inocêncio/MG** (IBGE 3126901). O sistema verifica notas emitidas por fornecedores e prestadores, **não emite liquidação e não acessa o sistema contábil externo**. A chave de acesso identifica o documento e não contém, por si só, o valor, o regime de tributação, o atesto nem a situação de autorização: carregar o XML/PDF ou consultar o portal do emissor é necessário para concluir a conferência.

## Processo de auditoria
1. Ler XML, PDF de NFS-e, chave ou código; conferir valores, CNPJ, data, número, tomador e natureza.
2. Conferir cadastro e condição de Simples/MEI na data de emissão; ver necessidade de IRRF e ISSQN. Para serviços com INSS potencial, pedir análise específica — **o líquido calculado não inclui INSS**.
3. Solicitar: documento original, autenticidade/nota não cancelada, tomador correto, número de empenho/contrato, atesto/recebimento, natureza tributária, regime de tributação e confirmação da incidência/local/alíquota/base de ISS.
4. Documento com erro do motor tributário ou tomador incorreto => **NÃO LIQUIDAR**. Com dúvidas ou confirmações ausentes => **PENDENTE**. Sem pendências => **pré-auditoria concluída para revisão humana**, jamais liquidação automática.
5. O botão **Mensagem ao fornecedor** informa qual item está errado e o que deve ser corrigido. Erros internos (falta de atesto/empenho) são diligências para o processo administrativo, não necessariamente para o emissor.
6. A ficha impressa inclui status da auditoria, pendências, impedimentos, fontes e versão da política fiscal.

## Pontos de atenção locais
O código tributário é a Lei Municipal 883/2017. A Lei Municipal 966/2023 acrescentou hipóteses específicas de exclusão da base do ISS (art. 102 §§15–16), para os itens 10.1 a 10.8, 15.08 e 17.1 da lista de serviços, com documentos comprobatórios e limites. **Não calcular ISS automaticamente sobre o bruto** desses casos sem conferir a base, a norma e os comprovantes. A alíquota padrão que constava no motor é um parâmetro operacional, não prova de que seja aplicável a todos os serviços.

Outras referências: LC 116/2003; LC 123/2006; IN RFB 1.234/2012, com alteração pela IN RFB 2.145/2023; Lei 8.212/1991 e IN RFB 2.110/2022 (INSS, precisa análise própria); EC 132/2023, LC 214/2025 e alterações posteriores da RTC.

## Atualizador de legislação — automático com revisão obrigatória
- O GitHub Actions `.github/workflows/monitor-legislacao-fiscal.yml` executa diariamente a partir de 10:17 UTC, além de disparar na primeira publicação.
- O script `scripts/monitor-legislacao-fiscal.py` consulta apenas endereços oficiais autorizados: Prefeitura/Câmara de Frei Inocêncio e Receita Federal.
- A cada execução, atualiza automaticamente o catálogo `assets/data/legislacao-fiscal.json` com data, hash do conteúdo e estado da fonte. O aplicativo carrega diretamente a versão mais recente do GitHub Raw. Caso a fonte falhe ou esteja desatualizada por mais de sete dias, a conferência fica pendente.
- **Mudança de hash não demonstra mudança de lei, nem sua vigência**. Conteúdo de página pode ser alterado por razões editoriais; o sistema cria alerta de revisão, sem modificar alíquotas.
- O GitHub Actions abre issue ao identificar novidade; um ADM confere a fonte, vigência e efeitos e registra parecer fundamentado de revisão no Firebase `config/fiscal.legislacaoAprovada`. O registro de auditoria também é criado. Aprovar a revisão não muda nenhuma alíquota: atualizações dos parâmetros oficiais devem ser cadastradas pelo ADM, com base legal.
- Indicadores: **monitorado**, **alteração detectada**, **revisão registrada**, **fonte indisponível**.
- Não presumir vigência ou aderência municipal de uma alteração federal. Quando uma atualização impactar regra de retenção, revisar o motor fiscal, os testes e só então publicar mudança de cálculo.
- GitHub Pages sozinho não executa scripts de monitoramento; a rotina depende do GitHub Actions e suas permissões de escrita para atualizar o JSON. A primeira varredura pode demorar até o disparo do workflow; até então há aviso pendente.

## Validação
Execução automática de `node --check`, `node tests/fiscal.test.mjs`, `node tests/danfse.test.mjs`, `node tests/auditoria-fiscal.test.mjs`. Testar leitura e impressão no navegador com nota real, inclusive notas retificadas, canceladas, ISS de incidência externa e fornecedor do Simples. O status de auditoria pressupõe confirmação humana; nunca declarar que o sistema certifica integralmente regularidade fiscal ou substitui parecer jurídico da Fazenda.

## Portais municipais com bloqueio anti-robô (HTTP 403)
A primeira execução em GitHub Actions (11/11/2026) confirmou que os portais oficiais municipais podem bloquear o IP do GitHub. O robô tenta um agente compatível com navegador e, se o portal recusar, utiliza **espelho público de leitura somente como sinal de monitoramento**, nunca como texto autenticado da norma. O SISDIFI distingue fonte oficial acessada diretamente, **consulta via espelho com revisão obrigatória** e fonte indisponível. ADM pode registrar verificação manual do texto oficial, com justificativa, link e registro em log. Essa conferência manual expira em sete dias; não altera automaticamente ISS ou retenções. Sem verificação vigente, mantém a pré-auditoria pendente.

O controle evita concluir que uma lei não mudou só porque a coleta automática encontrou um bloqueio de acesso.
