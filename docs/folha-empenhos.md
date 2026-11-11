# Folha de pagamentos — prévia de empenhos e composição dos descontos

Módulo contábil SISDIFI: `#/folha-empenhos` (menu "Folha de pagamentos", exclusivo ADM e Contabilidade).

## Finalidade
Produzir memória de lançamento com **uma linha por empenho/lotação**, sugerindo números sequenciais a partir do primeiro número informado, respeitando a ordem folha principal → adiantamento de 50% do 13º → rescisões. Dentro de cada grupo, ordena por secretaria e vínculo. A Contabilidade define e confirma **ficha, fonte e conta bancária**; o sistema não as inventa.

### Resumo por empenho
- Número proposto do empenho, grupo, secretaria, vínculo e lotação RH
- Ficha, fonte e conta bancária (campos editáveis pela Contabilidade)
- Valor bruto do empenho, desconto total na liquidação e líquido
- Ajuste de INSS de salário-maternidade, quando confirmado individualmente
- **Composição dos descontos do Resumo de Verbas:** Caixa, Sicoob, Bradesco, pensões alimentícias, INSS, IRRF e **outros**. A coluna **Outros** conserva descontos não identificados nas categorias anteriores e suas rubricas são auditáveis
- Soma das rubricas, valor do desconto total informado pelo RH, diferença em centavos e referência da página do PDF
- Botão **Ver rubricas** mostra código, descrição integral, valor e página de cada desconto que compõe o empenho

### PDF RH e critérios de agrupamento
- Resumo de Verbas traz registros por **lotação**, com totais `VALOR BRUTO DO EMPENHO`, `VALOR DO DESCONTO NA LIQUIDAÇÃO` e `VALOR LIQUIDO DO EMPENHO`.
- Algumas verbas têm classificação "2 - OUTRAS" **mas são proventos**, como salário-família (164), salário-maternidade (163) e complementação da enfermagem (344). Também podem existir diárias (1600) em um bloco posterior aos descontos. Portanto a leitura **não** classifica como desconto apenas pelo número da rubrica nem pela classificação "2 - OUTRAS".
- Os blocos de rubricas são confrontados com o **total de descontos do RH**. Somente o bloco ou conjunto de blocos que confere com aquele valor e contém desconto reconhecido entra na composição. Se não houver correspondência ou houver diferença, a linha fica pendente e a exportação final é bloqueada.
- Proventos não são incluídos na soma dos descontos; rubricas desconhecidas **dentro do bloco de descontos** entram em "Outros". A soma das categorias deve coincidir com o desconto total da liquidação.

### Salário-família e maternidade
- Salário-família: OP extraorçamentária pelo valor do Resumo, sem INSS atribuído à rubrica.
- Salário-maternidade: identificar servidora na folha individualizada, matrícula, lotação, valor do benefício (rubrica 163) e INSS individual (rubrica 201). Confirmar dados e soma por lotação.
- Somente o INSS individual confirmado é realocado do desconto da folha principal para a OP extraorçamentária do salário-maternidade. O total retido no conjunto das operações não é duplicado.

## Planilha XLSX
A exportação em rascunho está sempre disponível após importar a folha principal; a versão "conferida" exige mapeamento verificado, salário-maternidade conciliado, composição de descontos sem diferenças e minutas bancárias/pensões conferidas.

Abas do Excel:
1. **Empenhos:** uma linha por empenho, colunas individualizadas Caixa, Sicoob, Bradesco, pensões, INSS, IRRF e Outros; bruto, soma automática das rubricas, diferença com RH, INSS maternidade, desconto ajustado e líquido. Fórmulas e valores de cache para abertura correta no Excel.
2. **Composição:** cada rubrica original de desconto, por empenho, com código, nome, categoria, valor, página e PDF.
3. **OPs Extras:** salário-família e maternidade por lotação, valores brutos, INSS e líquidos.
4. **Conferência:** totais anuais/mensais e comparação agregada com as minutas de consignados e pensão.
5. **Orientações:** regras e ressalvas para o lançamento seguro.

O comparativo de banco/pensão **por total** não comprova o vínculo correto de cada guia com seu empenho. As diferenças entre guias precisam de conferência na aba de consignações.

## Segurança e limites
PDFs não são enviados ao GitHub/Firebase pelo módulo. As extrações e mapeamentos ficam no IndexedDB do navegador, segmentados pelo UID da conta, **não criptografados em repouso pelo módulo**. Utilize dispositivo institucional e evite computadores compartilhados. A planilha exportada contém dados financeiros e deve permanecer em local autorizado.

**Não emite empenhos, OPs nem liquidações oficiais.** O resultado depende da conferência humana, especialmente onde os resumos do RH apresentarem campos ilegíveis, divergências e benefícios especiais.

## Folha extra do dia 10 — incentivo federal da enfermagem

A aba aceita um quarto resumo de verbas: **Folha extra · incentivo federal (dia 10)**. Pode ser processado mesmo antes da folha principal. Pagamentos de diferenças salariais e acertos diversos da mesma folha permanecem na sua respectiva lotação e composição.

O parser reconhece a rubrica ou resumo `COMP FED.PIS SAL ENFERMAGEM` e descrições de incentivo federal/complementação do piso da enfermagem. **O valor não é somado automaticamente ao bruto**: a Contabilidade deve informar por lotação se o incentivo já está incluído no `VALOR BRUTO DO EMPENHO` informado pelo RH. Se sim, mantém o bruto original; se não, soma o incentivo identificado, mantendo o valor original, o incentivo e a decisão registrados na planilha exportada. O sistema sinaliza como pendente até a decisão.

O INSS da folha extra não é projetado nem descontado por presunção. Se houver desconto de INSS na própria extra, gera alerta; se for recolhido/descontado na folha posterior, deverá ser acompanhado na competência de desconto, sem dupla retenção. Isso descreve o fluxo informado pela Contabilidade e **não é uma validação automática da legislação previdenciária**.

A exportação em rascunho e conferida inclui colunas: bruto original RH, incentivo federal, tratamento adotado e observação sobre INSS da extra. Uma folha extra sem consignados/pensões pode ter conferência final sem a minuta da folha principal; existindo descontos bancários/pensão ou folha principal, as verificações anteriores continuam exigidas.
