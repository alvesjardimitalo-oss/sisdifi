# Contas de água da COPASA por empenho — SISDIFI

Aba **Contas COPASA** (`#/copasa`), só ADM e Contabilidade.

## Como usar
1. No e-mail "Chegou sua conta por e-mail" de cada conta centralizadora, baixe o anexo (.zip) — ou só o arquivo `mat<nº>.txt`
   que começa com `Mat. Cliente;Nome Cliente;…`.
2. Clique em **⬆ Contas da COPASA** e selecione os três de uma vez (Administração 564-9, Educação 11386382-9, Saúde 11386384-5).
3. O sistema lê cada imóvel (matrícula do imóvel, endereço, valor da pré-fatura, IRRF retido) e separa no empenho do local.
   O total de cada fatura é a soma dos imóveis (out/2026: 1.936,77 · 3.391,56 · 1.559,40).
4. **Imprimir por empenho** (uma folha A4 por fatura, padrão dos documentos do SISDIFI), **Exportar planilha** (CSV no formato
   EMP / LOCAL / ENDEREÇO / VALOR) e **Copiar** o histórico de cada empenho:
   `REFERENTE A CONTA DE AGUA DO MES DE OUTUBRO/2026 - ENSINO FUNDAMENTAL, FATURA 126851617051.`

## Cadastro
- Locais e empenhos de 2026 vêm da planilha "COPASA CENTRALIZADORA" (83 a 97); as 38 matrículas de imóveis foram ligadas pelo
  valor e endereço de out/2026.
- Imóvel novo aparece em **"sem cadastro"**: escolha o local e fica gravado para os próximos meses. Também dá para mudar o local de
  um imóvel na lista dele.
- **Cadastro de locais e empenhos**: nome, conta centralizadora e o empenho de cada exercício. Na virada do ano, informe os novos
  números (a tela avisa quando faltar).
- Fica em `retencoes_config/copasa` (mesma regra das Retenções: só ADM/Contabilidade). Nada das contas é gravado — só o cadastro.

## Testes
`node tests/copasa.test.mjs` com os três `mat….txt` de out/2026 e um .zip de exemplo em `tests/fixtures/copasa/`.
