# Folha de pagamentos — prévia de empenhos e composição dos descontos

Módulo contábil SISDIFI: `#/folha-empenhos` (menu "Folha de pagamentos", exclusivo ADM e Contabilidade).

## Fluxo em etapas (v3.23)
A tela é um passo a passo. Cada etapa mostra o que falta; a barra do topo indica as concluídas.

1. **Arquivos do RH.** Envie o *Resumo de Verbas* e a *Folha de pagamento* (nominal) do mês; depois o Resumo de Verbas do **13º** e o das **rescisões**, quando houver. O resumo mensal já contém o 13º e as rescisões: o SISDIFI desconta esses valores do mensal (bruto, descontos **e consignados por banco**) e gera empenhos separados. A folha nominal identifica as servidoras com salário-maternidade. Em "Outros casos" ficam a folha extra do dia 10 e o PDF único com todos os resumos.
2. **Número do primeiro empenho.** O sistema pergunta o número e numera a partir dele, mostrando a faixa de cada grupo. A folha mensal segue a **ordem da planilha da Contabilidade** (`assets/js/folha-ordem.js`, tirada da aba OUTUBRO/2026 da "Nova Folha 2026"), não a do Resumo de Verbas; 13º e rescisões seguem o RH, como na planilha. Lotação nova vai para o fim da folha mensal com aviso; a coluna **Ordem** do mapa CSV muda a posição e fica guardada para os meses seguintes.
3. **Saldo das contas bancárias.** Cadastre as contas que pagam a folha (nome, banco/agência/conta, fonte de recurso) e o saldo da competência. As contas ficam guardadas para os meses seguintes; o saldo é informado todo mês. Saldo em branco é "não informado", diferente de zero.
4. **Ficha, fonte e conta de cada empenho.** Ao informar a ficha, a LOA preenche secretaria, ação, natureza e fonte; a conta é sugerida quando só uma conta tem aquela fonte. O **bruto** de cada empenho é descontado do saldo da conta, na ordem dos empenhos, e a tabela mostra o saldo depois de cada um. Conta com saldo insuficiente, empenho sem conta ou fonte do empenho diferente da fonte da conta ficam como pendência.
5. **Confirmar a folha.** Só libera com as etapas anteriores concluídas. Ao confirmar, o SISDIFI agrupa os descontos de **Caixa, Sicoob, Bradesco e pensão alimentícia por banco e fonte de recurso do empenho** (uma linha = uma OP extraorçamentária) e grava em **Consignações por mês** da mesma competência: o previsto por fonte e os totais por banco como valor esperado. A planilha conferida fica disponível. Qualquer mudança depois da confirmação (valor, ficha, fonte, conta ou saldo) exige confirmar de novo.

A minuta de arrecadação dos bancos só sai **depois** que a folha é lançada no sistema contábil, por isso ela **não bloqueia** mais a planilha conferida. A conferência com as minutas fica em "Depois do lançamento" e, por fonte, em Consignações por mês.

Dados de antes desta versão aparecem como "importação antiga": reenvie os PDFs do RH na etapa 1 para atualizar os valores.

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
A exportação em rascunho está disponível após importar qualquer Resumo de Verbas válido; a versão "conferida" exige a folha confirmada na etapa 5 (mapeamento verificado, salário-maternidade conciliado, composição de descontos sem diferenças, conta e saldo suficientes). As minutas bancárias são conferidas depois do lançamento.

Abas novas: **Consignados por fonte** (uma linha por banco e fonte, com os empenhos que compõem a OP) e **Saldos das contas** (saldo, bruto dos empenhos e saldo depois).

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

## Compartilhamento, segurança e limites
A folha é **compartilhada entre os usuários da Contabilidade** (perfis `admin` e `operador`) no Firestore:
- `folha_meses/{competência}`: primeiro empenho, saldos das contas, servidoras da maternidade, confirmação e o previsto de consignados;
- `folha_meses/{competência}/arquivos/{mensal|decimo|rescisao|extra}`: os valores lidos dos resumos do RH (o PDF nunca sai do navegador);
- `folha_mapa/{tipo|lotação}`: ficha, fonte, conta e ordem de cada lotação (vale para todos os meses);
- `folha_contas/{id}`: contas bancárias cadastradas.

Quem abre a mesma competência vê na hora o que o outro preenche. Cada alteração grava **só o campo que mudou** (uma lotação, um saldo, uma conta), então duas pessoas trabalhando ao mesmo tempo não apagam o trabalho uma da outra; se as duas mudarem o mesmo campo, vale a última. A tela não redesenha embaixo de quem está digitando: a atualização do outro aparece quando o campo perde o foco. Cada lotação mostra quem a alterou por último.

**Publicar as regras:** as coleções acima precisam das regras novas de `firestore.rules` (Console Firebase → Firestore → Regras → Publicar). Sem isso a tela avisa que não conseguiu abrir a folha compartilhada.

Os dados que antes ficavam só no navegador (IndexedDB) não são levados automaticamente: reenvie os PDFs do RH e, se quiser, importe o mapa CSV de fichas.

**Não emite empenhos, OPs nem liquidações oficiais.** O resultado depende da conferência humana, especialmente onde os resumos do RH apresentarem campos ilegíveis, divergências e benefícios especiais.

## Folha extra do dia 10 — incentivo federal da enfermagem

A aba aceita um quarto resumo de verbas: **Folha extra · incentivo federal (dia 10)**. Pode ser processado mesmo antes da folha principal. Pagamentos de diferenças salariais e acertos diversos da mesma folha permanecem na sua respectiva lotação e composição.

O parser reconhece a rubrica ou resumo `COMP FED.PIS SAL ENFERMAGEM` e descrições de incentivo federal/complementação do piso da enfermagem. **O valor não é somado automaticamente ao bruto**: a Contabilidade deve informar por lotação se o incentivo já está incluído no `VALOR BRUTO DO EMPENHO` informado pelo RH. Se sim, mantém o bruto original; se não, soma o incentivo identificado, mantendo o valor original, o incentivo e a decisão registrados na planilha exportada. O sistema sinaliza como pendente até a decisão.

O INSS da folha extra não é projetado nem descontado por presunção. Se houver desconto de INSS na própria extra, gera alerta; se for recolhido/descontado na folha posterior, deverá ser acompanhado na competência de desconto, sem dupla retenção. Isso descreve o fluxo informado pela Contabilidade e **não é uma validação automática da legislação previdenciária**.

A exportação em rascunho e conferida inclui colunas: bruto original RH, incentivo federal, tratamento adotado e observação sobre INSS da extra. Uma folha extra sem consignados/pensões pode ter conferência final sem a minuta da folha principal; existindo descontos bancários/pensão ou folha principal, as verificações anteriores continuam exigidas.

## Lançamento: uma linha por empenho e a planilha Google

Assim que o Resumo de Verbas é lido, o topo da tela mostra a tabela de lançamento: empenho/ano, ficha, fonte, bruto, histórico, desconto e composição (INSS, Caixa, Sicoob, Bradesco, pensão, IR), as OPs (salário-família, maternidade, natalidade) e a conferência bruto − desconto + OP − desconto da OP = total líquido do Resumo de Verbas. Não depende das etapas.

**Fonte pelo saldo.** Com o saldo das contas (etapa 3), cada empenho vai para a primeira fonte estadual/federal que a ficha admite e que ainda o cobre inteiro; o resto vai para o recurso próprio da ficha (1500, 1001, 1002) ou, no FUNDEB, para a ficha espelho. É proposta: só vale com "Usar as fontes pelo saldo". 1604 (ACS) e 1605 (piso da enfermagem) não são oferecidas a outros empenhos.

**Lançar na planilha Google.** Escreve na aba do mês (ex.: NOVEMBRO) da planilha da folha, a partir da linha 4, na ordem em que o empenho é lançado: A grupo, B empenho, C secretaria, **D–G ficha, fonte, bruto e histórico num grupo que abre e fecha no "+"** (aberto; a Contabilidade fecha depois de digitar o empenho e segue para a liquidação), H desconto da liquidação, **I–O itens do desconto (INSS, Caixa, Sicoob, Bradesco, Pensão, IR, Outros) num grupo fechado no "+"**, P nº OP, Q salário-família, R desconto dele (INSS), S salário-maternidade/natalidade, T desconto dele (INSS), U líquido, V total líquido do Resumo de Verbas, W conferência (BATEU em verde, NÃO BATEU em vermelho). A conta bancária não vai para a planilha: é escolhida no SISDIFI. O único desconto de uma OP é o INSS da servidora em salário-maternidade, que sai da liquidação do empenho. Na primeira vez em cada aba o SISDIFI lê o cabeçalho e aplica só o que falta — tira a Conta Bancária, põe o histórico depois do bruto (copiando e apagando a coluna velha, porque o Google recusa mover coluna para dentro de célula mesclada), abre os itens depois do desconto e cria os dois grupos; grupo que já existe não é tocado. Fórmulas, totais e títulos mesclados se ajustam sozinhos. Não apaga nada abaixo das linhas lançadas; se a aba já tiver empenhos, pergunta antes de substituir. Sem configuração nenhuma, "Copiar para colar na planilha" gera o mesmo conteúdo para Ctrl+V na célula A4 — nesse caso a aba já precisa estar no modelo.

Na tabela de lançamento do SISDIFI cada valor tem o botão **copiar**, na mesma ordem: bruto, histórico, desconto, itens, OP, líquido.

**▶ Iniciar preenchimento.** Abre a lista dos empenhos (só os que faltam, ou todos, com busca por número ou secretaria) para cada pessoa escolher onde começar; cada linha da tabela também tem "▶ preencher", que abre direto naquele empenho. A lista mostra, para todos da Contabilidade em tempo real, quem está preenchendo cada empenho e quem lançou: duas ou mais pessoas trabalham ao mesmo tempo, uma num empenho e outra em outro. Cada marcação grava só a chave daquele empenho (`folha_meses/{competência}.preenchimento`), então uma pessoa não apaga a da outra; ao sair de um empenho sem lançar, ele volta a ficar livre. Dentro do empenho, o assistente mostra um empenho por vez, com os campos na ordem em que se digita no sistema contábil (número, ficha, fonte, desdobramento, bruto, histórico; data e valor do desconto; distribuição do desconto com a ficha extra de cada item; OPs com ficha extra, valor, desconto e histórico, e o campo para o nº da OP). Cada campo tem um botão COPIAR; o campo da vez fica destacado e **Enter** copia e passa para o próximo. Dinheiro é copiado sem o "R$". Embaixo, a conferência do empenho; "Lançado ✓ — próximo livre" marca e vai para o próximo empenho que ninguém está preenchendo; "☰ Lista" volta à lista. Histórico sem modelo (vínculo que o sistema não reconhece, como o do Prefeito) é escolhido ali mesmo, uma vez, e fica guardado.

**Visual da aba.** A cada lançamento: cada secretaria com uma cor fixa (a mesma em toda a linha e em todos os meses, sem os destaques soltos da planilha manual), cabeçalho azul-escuro com letra branca, Arial 9 em todas as linhas (as cores de cada secretaria ficam), valores à direita, empenho/ficha/fonte/nº OP ao centro, bordas finas cinza com contorno mais grosso, altura e larguras uniformes.

Para o botão direto funcionar, uma vez só:
1. Google Cloud Console do projeto do Firebase → *APIs e serviços* → *Biblioteca* → ativar **Google Sheets API**.
2. *Tela de consentimento OAuth* → incluir o escopo `.../auth/spreadsheets`; enquanto o app não for verificado pelo Google, cadastre as contas da Contabilidade como **usuários de teste** (o Google mostra o aviso "app não verificado"; é esperado).
3. A conta Google escolhida no botão precisa ter permissão de **edição** na planilha.

O token do Google fica só na memória da página (vale cerca de 1 hora) e não é gravado; a sessão do SISDIFI não muda.
