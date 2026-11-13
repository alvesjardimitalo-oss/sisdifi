# Retenções nas transferências (FPM, ITR, IPI, LC 176) — SISDIFI

Aba **Retenções FPM/ITR/IPI** (`#/retencoes`), só para ADM e Contabilidade.

## Para que serve
Os valores descontados na fonte pelo Banco do Brasil nos repasses precisam ser empenhados e liquidados em favor de cada credor,
com baixa contra a própria conta da transferência. A aba registra cada retenção, numera (`RET 0001/2026`…) e emite o
**Comprovante de Retenção** para anexar na liquidação do empenho.

| Retenção | Onde aparece | Conta |
|---|---|---|
| PASEP (1% — Lei 9.715/1998, art. 2º, III, e art. 8º, III) | Consulta do DAF no BB | FPM 3261-1, ITR 6729-6, IPI 92998-0, FEP e LC 176 (configurar) |
| EMATER, CISDOCE Rateio, CISDOCE Serviços, ARDOCE, AMM | Extrato da conta do FPM, dias 10/20/30 | FPM 3261-1 |
| CNM | Extrato da conta do FPM, normalmente dia 20 | FPM 3261-1 |

## Como lançar
1. **⬆ Consulta do DAF (BB)** — CSV exportado em `demonstrativos.apps.bb.com.br/arrecadacao-federal`. Formato real: blocos por fundo
   (`FPM   - FUNDO DE PARTICIPACAO...`, `ITR`, `FEP`, `IPM`, `ADO - LC 176/2020`…), data só na 1ª linha do dia, valores `31.072_95C`.
   Os totais "TOTAL POR PARCELA / NATUREZA" são ignorados. **Só o PASEP vem marcado**, por fundo; o sistema confere 1% da cota
   (no FPM sobre a cota bruta; no ITR sobre a cota líquida do FUNDEB). "RFB-RET DARF" e FUNDEB aparecem desmarcados.
2. **⬆ Extrato da conta do FPM** — CSV, OFX, PDF do extrato ou o **scan em PDF/foto** (lido por OCR no navegador, Tesseract.js).
   O favorecido vem na linha de baixo do lançamento ("240 Contribuição" / "CISDOCE"). Vêm marcados EMATER, CISDOCE, ARDOCE, AMM
   ("ASSOCIACAO MIN MUNICIPIOS") e CNM ("CONFED NACIONAL MUNICIPIO"). **Estorno de débito** anula o débito igual do mesmo dia.
   O PASEP do extrato fica desmarcado (vem em duas linhas; é lançado pelo DAF). **CISDOCE**: o extrato não diz se é rateio ou
   serviços. Regra da Contabilidade: o **rateio** é o valor fixo (R$ 3.221,68, editável em Configurar) descontado em todo decêndio;
   **qualquer outro valor é serviços**, conforme a demanda, descontado só no dia 10 (aviso se aparecer em outro decêndio).
   Rateio **estornado** volta no decêndio seguinte: dois rateios no mesmo dia são lançados, e o a mais recebe a observação
   "Rateio CISDOCE do decêndio anterior, estornado em …, cobrado novamente neste decêndio" (sai no comprovante).
3. **+ Lançar decêndio** — digitação rápida de todas as retenções de uma data, quando não houver arquivo.
4. **+ Lançamento avulso** — qualquer retenção, inclusive "Outra retenção" com credor próprio (ex.: ADO LC 176 ocasional).

Na prévia, linhas não reconhecidas, créditos e dedução do FUNDEB ficam desmarcadas; linhas já lançadas (mesma data, fundo,
rubrica e valor) também. Ao gravar, o sistema oferece gerar os comprovantes.

**Decêndio**: os repasses saem nos dias 10, 20 e 30 ou no dia útil seguinte. A data é aproximada do decêndio mais próximo
(dias 1–5 → 3º decêndio do mês anterior; 6–15 → 1º; 16–25 → 2º; 26–31 → 3º) e pode ser corrigida no lançamento.

Depois de empenhar, use **Editar** (ou **Informar empenho nos selecionados**) para gravar nº do empenho, ficha e liquidação; o comprovante
passa a sair com esses dados. **Anular** tira do total sem reaproveitar o número.

## Planilha do IPI (SEF-MG)
**⬆ Planilha do IPI (SEF-MG)** aceita uma ou várias planilhas `.xlsx` baixadas em
`fazenda.mg.gov.br/.../previsao_repasse_IPI/repasse_decendial/` (uma a cada decêndio, todos os municípios). O sistema acha a linha
de Frei Inocêncio (nome do município em Parâmetros), lê a data do título ("PARA O DIA 20/10/2026") e lança o **PASEP do IPI**
(conta 92998-0), conferindo 1% sobre Bruto − FUNDEB. O comprovante traz a linha da planilha (índice, bruto, FUNDEB, PASEP, saúde,
líquido) — não é preciso imprimir a planilha.

## Empenhos anuais
Cada retenção recebe o empenho do exercício automaticamente (editável na conferência e em Configurar). 2026:
PASEP de FPM, ITR, IPI e LC 176 → 2/2026 · PASEP do FEP → 4/2026 · CISDOCE Rateio → 5/2026 · CISDOCE Serviços → 6/2026 ·
ARDOCE → 7/2026 · EMATER → 8/2026 · AMM → 9/2026 · CNM → 32/2026. **Preencher empenhos padrão** completa os lançamentos antigos.
A dedução do FUNDEB não é listada.

## Numeração (RET nº/ano)
A numeração segue a **data do desconto, que é a data da liquidação** (no mesmo dia: FPM, ITR, IPI, LC 176, FEP; depois a
ordem das retenções). Cada lote é numerado em ordem de data. Se um lote tiver data anterior a retenções já numeradas
(ex.: subir as planilhas do IPI depois do DAF), o sistema oferece **reordenar** antes de gerar os comprovantes. O botão
**Reordenar por data** faz o mesmo a qualquer momento. Comprovantes impressos antes precisam ser gerados de novo.

## Situação e liquidação
O SISDIFI não consulta o sistema contábil: a situação vem do que está preenchido. Como os empenhos são anuais, toda retenção
nasce **Aguardando liquidação** (com o empenho padrão). **Marcar como liquidado** (selecionadas) grava a liquidação com a
**data do desconto** de cada retenção e, se informado, o nº da liquidação. **Pendentes de liquidação** filtra o que falta lançar.
No Editar há a caixa "Liquidado" para desfazer ou marcar uma a uma.

## Lista como extrato
A lista e o impresso (**Extrato do filtro**) ficam como um extrato: da data mais antiga para a mais nova, com o
**acumulado** em cada linha e o **total do dia** ao fim de cada data. Filtrando por *Retenção = PASEP* e *Mês = Todos*,
vira o espelho do PASEP do exercício. Retenções anuladas aparecem riscadas e não somam.

## Comprovante e histórico
O comprovante segue o padrão da memória de cálculo das Consignações (folha A4, brasão, faixa azul/verde, quadro do valor,
assinaturas, código de verificação). Cada retenção tem o **histórico contábil para copiar** (botão *Copiar* na lista, também
impresso no comprovante), no formato: `REFERENTE AO PRIMEIRO DECENDIO DO MES DE NOVEMBRO, FPM 3261-1.` — o decêndio e o mês
vêm da competência (3º decêndio pago no início do mês seguinte fica no mês anterior) e a conta vem de Configurar.

Quando o exercício virar, a tela avisa que faltam os empenhos do ano: cadastre-os em Configurar com o novo exercício selecionado.

## Configurar
CNPJ, responsável que assina, contas (inclusive a do LC 176) e nome de cada credor no comprovante. Fica em `retencoes_config/geral`.

## Armazenamento e regras
- `retencoes_anos/{ano}`: `{ ultimo, lancamentos: { id: {...} } }`. A numeração é feita em transação.
- `firestore.rules`: leitura e escrita só `operador()` (admin/operador). **Publique as regras no Console do Firebase** antes de usar.

## Testes
`node tests/retencoes.test.mjs` — inclui o CSV real do DAF (out–nov/2026) e o texto do extrato escaneado do FPM em `tests/fixtures/`; leitura de valores/datas, decêndio, classificação, DAF em blocos, extrato CSV e OFX, conferência
do PASEP (1%), duplicidade, validação e comprovante. O layout real do CSV do DAF deve ser conferido com um arquivo exportado do BB.
