# Consignações por fonte

Menu **Consignações por fonte**, disponível para Administrador e Contabilidade (`admin`/`operador`). Rota `#/consignacoes`.

Importe uma ou mais minutas analíticas em PDF com texto, até 15 MB por arquivo. O processamento ocorre no navegador via PDF.js, sem gravação no Firestore ou upload dos documentos. Resultados são descartados ao sair da tela. Exporte CSV ou imprima antes de sair.

A leitura reconhece documentos no formato ano/número-parcela, a receita na linha do documento e as fontes nas linhas seguintes (formato 1.500.000.0000). Preserva o tipo identificado no cabeçalho: Guia ou Empenho. Não infere um empenho a partir de uma guia.

Categorias: consignações da Caixa Econômica Federal/CEF, Sicoob, Bradesco e pensão alimentícia. Receitas desconhecidas ficam em Não classificado, com aviso. Cada categoria é agrupada pelos quatro primeiros dígitos da fonte, preservando o código completo na tabela. A soma usa centavos inteiros e apenas as linhas de fonte, sem somar novamente valores de documentos, totais diários ou resumos.

Conferência: compara as fontes com cada documento e com o total geral, quando disponível. Mostra documentos sem fontes, fontes ilegíveis, receitas desconhecidas, repetição interna ou sobreposição entre arquivos. Um PDF idêntico já carregado é recusado por SHA-256. Sobreposições entre PDFs diferentes são sinalizadas, não excluídas automaticamente. Remova o arquivo sobreposto antes de exportar. O usuário confirma a revisão para liberar a exportação. CSV e impressão respeitam os filtros atuais.

PDFs digitalizados e outros layouts não têm OCR ou interpretação genérica. Novos modelos devem ser homologados com amostras reais. A validação real desta versão usou uma minuta Sicoob; outras categorias têm testes sintéticos de identificação. Nenhum documento real é incluído no repositório.

Teste: `node tests/minuta-pdf.test.mjs`.
