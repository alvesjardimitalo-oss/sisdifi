# Retenções nas transferências (FPM, ITR, IPI, LC 176) — SISDIFI

Aba **Retenções FPM/ITR/IPI** (`#/retencoes`), só para ADM e Contabilidade.

## Para que serve
Os valores descontados na fonte pelo Banco do Brasil nos repasses precisam ser empenhados e liquidados em favor de cada credor,
com baixa contra a própria conta da transferência. A aba registra cada retenção, numera (`RET 0001/2026`…) e emite o
**Comprovante de Retenção** para anexar na liquidação do empenho.

| Retenção | Onde aparece | Conta |
|---|---|---|
| PASEP (1% — Lei 9.715/1998, art. 2º, III, e art. 8º, III) | Consulta do DAF no BB | FPM 3261-1, ITR 6729-6, IPI 92998-8, LC 176 (configurar) |
| EMATER, CISDOCE Rateio, CISDOCE Serviços, ARDOCE, AMM | Extrato da conta do FPM, dias 10/20/30 | FPM 3261-1 |
| CNM | Extrato da conta do FPM, normalmente dia 20 | FPM 3261-1 |

## Como lançar
1. **⬆ Extrato da conta do FPM** — CSV ou OFX do extrato do BB. Os débitos com EMATER, CISDOCE, ARDOCE, AMM e CNM vêm marcados.
2. **⬆ Consulta do DAF (BB)** — CSV exportado em `demonstrativos.apps.bb.com.br/arrecadacao-federal`. As linhas de PASEP vêm marcadas,
   com o fundo lido do cabeçalho do bloco (FPM, ITR, IPI, LC 176). Se houver linha da cota bruta, o sistema confere se o PASEP é 1%.
3. **+ Lançar decêndio** — digitação rápida de todas as retenções de uma data, quando não houver arquivo.
4. **+ Lançamento avulso** — qualquer retenção, inclusive "Outra retenção" com credor próprio (ex.: ADO LC 176 ocasional).

Na prévia, linhas não reconhecidas, créditos e dedução do FUNDEB ficam desmarcadas; linhas já lançadas (mesma data, fundo,
rubrica e valor) também. Ao gravar, o sistema oferece gerar os comprovantes.

**Decêndio**: os repasses saem nos dias 10, 20 e 30 ou no dia útil seguinte. A data é aproximada do decêndio mais próximo
(dias 1–5 → 3º decêndio do mês anterior; 6–15 → 1º; 16–25 → 2º; 26–31 → 3º) e pode ser corrigida no lançamento.

Depois de empenhar, use **Editar** (ou **Informar empenho nos selecionados**) para gravar nº do empenho, ficha e liquidação; o comprovante
passa a sair com esses dados. **Anular** tira do total sem reaproveitar o número.

## Configurar
CNPJ, responsável que assina, contas (inclusive a do LC 176) e nome de cada credor no comprovante. Fica em `retencoes_config/geral`.

## Armazenamento e regras
- `retencoes_anos/{ano}`: `{ ultimo, lancamentos: { id: {...} } }`. A numeração é feita em transação.
- `firestore.rules`: leitura e escrita só `operador()` (admin/operador). **Publique as regras no Console do Firebase** antes de usar.

## Testes
`node tests/retencoes.test.mjs` — leitura de valores/datas, decêndio, classificação, DAF em blocos, extrato CSV e OFX, conferência
do PASEP (1%), duplicidade, validação e comprovante. O layout real do CSV do DAF deve ser conferido com um arquivo exportado do BB.
