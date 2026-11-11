# Controle de repasses do duodécimo à Câmara Municipal — SISDIFI

Nova aba do menu Contabilidade: Duodécimo da Câmara (#/duodecimo).

## Regra adotada
- Referência mensal informada: R$ 140.000,00; previsão anual de 12 meses: R$ 1.680.000,00. É meta informada, não verificação do valor legal devido.
- Uma competência por mês e exercício; cada competência aceita várias OPs parciais.
- Cada OP tem número, valor, data de emissão, observação opcional e data de repasse efetivo opcional.
- Sem data de repasse, OP pendente, NÃO soma ao pago. Com data de repasse, fica Repassado e soma à competência da folha, mesmo pago em outro mês.
- Saldo mensal = R$ 140.000,00 menos os pagamentos confirmados. Excedentes geram alerta, sem compensação automática.
- Registrar uma OP não a emite no sistema contábil nem movimenta recursos bancários.
- Edição, anulação lógica preservando histórico, CSV anual, relatório A4 mensal e anual.

## Acesso restrito (ADM e Contabilidade)
- A rota e o item de menu são visíveis apenas aos perfis `admin` e `operador`.
- Os registros agora são mantidos na coleção Firestore **`duodecimo_anos/{ano}`**, separada do documento compartilhado de exercícios.
- As regras de Firestore verificam `operador()`, que exige usuário ativo com perfil `admin` ou `operador`, tanto para **LEITURA** quanto **ESCRITA**.
- As regras de `exercicios/{ano}` impedem novos registros `duodecimo` nesse documento compartilhado; os demais dados de exercício continuam públicos aos usuários autenticados ativos.
- A migração automática é iniciada na abertura da aba por ADM/Contabilidade: transação que copia cada ano com histórico legado para `duodecimo_anos/{ano}`, preservando alterações privadas mais recentes, e **remove** o campo antigo do documento `exercicios/{ano}` na mesma transação. Não apaga os demais dados do exercício.
- Os registros contêm OP, valor, competência, emissão, data do repasse e observação. Edição e anulação são auditadas no registro de logs.

## ATENÇÃO — Publicação obrigatória das regras
Publicar no GitHub Pages **não publica as regras do Firestore**. Antes de usar a nova versão:
1. Abrir o projeto Firebase do SISDIFI em **Firestore Database → Regras**.
2. Aplicar e publicar o conteúdo atualizado do arquivo `firestore.rules` deste repositório.
3. Abrir a aba Duodécimo com uma conta ADM ou Contabilidade para executar a migração dos registros legados de todos os anos.
4. Conferir na Console se os dados passaram para `duodecimo_anos/{ano}` e se o campo `duodecimo` não existe mais nos documentos `exercicios/{ano}`.
5. Testar com um perfil sem permissão (consulta/secretaria): a aba e a rota devem ser recusadas, e a leitura direta de `duodecimo_anos/{ano}` deve receber `permission-denied`.

A nova interface bloqueia o uso caso as regras privadas ainda não estejam publicadas, para evitar novos lançamentos em local compartilhado. **Dados antigos em `exercicios/{ano}` só deixarão de ser legíveis pelos outros perfis depois que forem migrados e removidos da origem.** Não declare o sigilo da base concluído sem confirmar esse passo.

## Validação
A automação do GitHub executa verificação de sintaxe e testes do cálculo, divisão em parcelas, datas do pagamento versus competência, pendências, excesso e anulações. Os testes não substituem a validação em navegador autenticado com o Firebase de produção.
