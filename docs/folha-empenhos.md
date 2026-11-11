# Folha de pagamentos — prévia de empenhos e composição dos descontos

Módulo contábil SISDIFI: `#/folha-empenhos` (menu "Folha de pagamentos", exclusivo ADM e Contabilidade).

## Fluxo de um único PDF (v3.17.0)
1. Abra **Folha de pagamentos** e escolha um único PDF no campo azul **Escolha um único arquivo do RH (PDF)**. O arquivo ideal é o **Resumo de Verbas consolidado**: a folha nominal isolada não contém os totais orçamentários por lotação.
2. A competência é identificada pelo cabeçalho do próprio resumo quando não há lançamentos previamente carregados no mês atual; se existirem dados de outra competência, a importação é bloqueada para não misturá-los.
3. O leitor separa os grupos principal, extra, adiantamento de 13º e rescisões. **Mantém a ordem das lotações tal como aparecem no relatório do RH**, como na última planilha de junho/2026, sem impor ordenação alfabética que deslocaria o número de empenho.
4. No cabeçalho misto **01-FOLHA MENSAL/05-DÉCIMO**, identifica a rubrica **150 ADIANTAMENTO 13SALARIO**, retira seu valor da parte principal e gera empenho de adiantamento do 13º ao final, com valor bruto e líquido próprios e nenhum desconto inventado. Se a separação não for aritmeticamente segura, gera pendência em vez de criar valor.
5. Digite o número inicial de empenho. A tabela preenche número sequencial, secretaria, vínculo, lotação, bruto, descontos e líquido. **Ficha e fonte ficam para a Contabilidade preencher**; conta bancária é opcional.
6. O quadro **VALOR BATEU / VALOR NÃO BATEU** verifica a aritmética entre bruto, desconto e líquido do **próprio Resumo de Verbas**. Não substitui conferência independente com o arquivo nominal nem com extratos/minutas.
7. O Excel exportado inclui como **primeira aba “Modelo Contabilidade”**, com o mesmo padrão de **14 colunas da planilha de junho**: grupo, empenho, secretaria, ficha, fonte, conta, bruto, desconto, nº da OP extra, bruto e desconto extraorçamentários, adicionais e líquido geral. As demais abas permanecem para composição por rubrica, conferência e justificativas.
8. Salário-família e maternidade aparecem como OPs extras. O **INSS individual da maternidade não pode ser inferido apenas pelo resumo**: envie a folha nominal se esse dado não estiver no mesmo PDF, confira matrícula e lotação e marque o lançamento como conferido. Sem isso, a versão final continua pendente, mas o Excel de rascunho fica disponível.

**Atenção:** a última planilha de junho serve como referência de organização e colunas, não como tabela automática de correspondência de fichas/fontes. O RH pode alterar lotações e as verbas de uma competência. Não reutilizar números de empenho, fontes ou valores de junho por posição sem identificação inequívoca.

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
A exportação em rascunho está disponível após importar qualquer Resumo de Verbas válido; a versão "conferida" exige mapeamento verificado, salário-maternidade conciliado, composição de descontos sem diferenças e minutas bancárias/pensões conferidas.

Abas do Excel:
1. **Empenhos:** uma linha por empenho, colunas individualizadas Caixa, Sicoob, Bradesco, pensões, INSS, IRRF e Outros; bruto, soma automática das rubricas, diferença com RH, INSS maternidade, desconto ajustado e líquido. Fórmulas e valores de cache para abertura correta no Excel.
2. **Composição:** cada rubrica original de desconto, por empenho, com código, nome, categoria, valor, página e PDF.
3. **OPs Extras:** salário-família e maternidade por lotação, valores brutos, INSS e líquidos.
4. **Conferência:** totais anuais/mensais e comparação agregada com as minutas de consignados e pensão.
5. **Orientações:** regras e ressalvas para o lançamento seguro.

O comparativo de banco/pensão **por total** não comprova o vínculo correto de cada guia com seu empenho. As diferenças entre guias precisam de conferência na aba de consignações.

## Resumo de Verbas consolidado por lotação
O sistema permite importar **um único PDF com resumos da folha principal, folha extra, 13º e rescisões**. Cada conjunto é classificado pelo tipo do cabeçalho e pelo código completo da lotação; uma mesma lotação pode aparecer em diferentes tipos sem ser misturada. Quando o cabeçalho não indica o tipo ou há uma lotação duplicada dentro do mesmo tipo, a importação registra pendência e bloqueia a exportação conferida. A folha nominal também pode ser enviada em um PDF único.

A rubrica 163 (salário-maternidade) é extraída da coluna de proventos, e a 201 (INSS) da coluna de descontos, **mesmo quando ambas estão marcadas com a letra P no RH**. O cruzamento entre folha nominal e Resumo de Verbas usa a lotação completa e a matrícula da servidora, e exige conferência do usuário antes de redistribuir o INSS para a OP extraorçamentária. O caso de teste utiliza exatamente R$ 1.782,37 de salário-maternidade e R$ 136,09 de INSS.

## Segurança e limites
PDFs não são enviados ao GitHub/Firebase pelo módulo. As extrações e mapeamentos ficam no IndexedDB do navegador, segmentados pelo UID da conta, **não criptografados em repouso pelo módulo**. Utilize dispositivo institucional e evite computadores compartilhados. A planilha exportada contém dados financeiros e deve permanecer em local autorizado.

**Não emite empenhos, OPs nem liquidações oficiais.** O resultado depende da conferência humana, especialmente onde os resumos do RH apresentarem campos ilegíveis, divergências e benefícios especiais.

## Folha extra do dia 10 — incentivo federal da enfermagem

A aba aceita um quarto resumo de verbas: **Folha extra · incentivo federal (dia 10)**. Pode ser processado mesmo antes da folha principal. Pagamentos de diferenças salariais e acertos diversos da mesma folha permanecem na sua respectiva lotação e composição.

O parser reconhece a rubrica ou resumo `COMP FED.PIS SAL ENFERMAGEM` e descrições de incentivo federal/complementação do piso da enfermagem. **O valor não é somado automaticamente ao bruto**: a Contabilidade deve informar por lotação se o incentivo já está incluído no `VALOR BRUTO DO EMPENHO` informado pelo RH. Se sim, mantém o bruto original; se não, soma o incentivo identificado, mantendo o valor original, o incentivo e a decisão registrados na planilha exportada. O sistema sinaliza como pendente até a decisão.

O INSS da folha extra não é projetado nem descontado por presunção. Se houver desconto de INSS na própria extra, gera alerta; se for recolhido/descontado na folha posterior, deverá ser acompanhado na competência de desconto, sem dupla retenção. Isso descreve o fluxo informado pela Contabilidade e **não é uma validação automática da legislação previdenciária**.

A exportação em rascunho e conferida inclui colunas: bruto original RH, incentivo federal, tratamento adotado e observação sobre INSS da extra. Uma folha extra sem consignados/pensões pode ter conferência final sem a minuta da folha principal; existindo descontos bancários/pensão ou folha principal, as verificações anteriores continuam exigidas.
