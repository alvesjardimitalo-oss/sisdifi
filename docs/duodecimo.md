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

## Armazenamento
Os dados são sincronizados no Firestore usando o documento de exercício (coleção exercicios, ID do ano) no mapa aninhado duodecimo.repasses por UUID. O serviço db.salvar usa merge para acrescentar apenas o item alterado, preservando os demais registros e informações de abertura do exercício.

As regras atuais permitem leitura dos documentos de exercício a qualquer usuário autenticado e ativo; somente admin e operador (Contabilidade) escrevem. A aba aparece apenas para estes dois perfis. Não inserir informação pessoal sensível no cadastro das OPs. A exclusão é lógica (anulado=true) e o lançamento anulado não entra no total.

Criação, edição e anulação são também registradas no log de auditoria do SISDIFI, com OP, competência e valor. Não há geração de OP oficial.

## Validação
A automação do GitHub executa verificação de sintaxe e testes do cálculo, divisão em parcelas, datas do pagamento versus competência, pendências, excesso e anulações. Os testes não substituem a validação em navegador autenticado com o Firebase de produção.
