# SISDIFI — Sistema de Diárias Municipais (versão web)

Sistema de cálculo, emissão e controle de diárias de viagem da Prefeitura Municipal de Frei Inocêncio/MG,
conforme a **Lei Ordinária nº 994/2025** (Anexo I). Hospedado no **GitHub Pages**, com login e banco de dados no **Firebase** (plano gratuito).

> Nenhum dado de servidor (CPF, Pix etc.) fica neste repositório. Os dados ficam no Firestore, protegidos pelas regras de segurança e acessíveis só a usuários cadastrados.

## O que o sistema faz

- **Login por e-mail/senha ou Google**, com perfis: *Administrador*, *Contabilidade*, *Controle Interno*, *Secretaria (solicitante)* e *Somente consulta*. Só entra quem o administrador liberar.
- **Secretarias solicitantes**: cada secretaria tem seu usuário, cadastra o servidor na hora (nome, CPF, Pix, cargo) e envia a solicitação para análise com conta para pagamento e fonte de recurso obrigatórias. Não vê valores nem pedidos de outras secretarias.
- **Tramitação**: Secretaria envia (com conta para pagamento, fonte de recurso e link do curso opcional) → Controle Interno confere o servidor e aprova/reprova → Contabilidade calcula o valor e preenche a ficha, imprime o formulário e o link do curso → assinatura do Prefeito → empenho → liquidação → pagamento. Cada passo registra quem fez e quando.
- **Importação da relação de servidores**: em Servidores → "Importar relação (PDF)", a Contabilidade lê o "Cadastro de Pessoal por Lotação". O CPF é a chave: quem já está cadastrado não é duplicado (só completa matrícula/lotação), CPFs repetidos viram um cadastro, mesmo nome com outro CPF é apontado como possível duplicidade (opção de corrigir o CPF existente) e aposentados/pensionistas ficam de fora. Os novos entram com chave Pix pendente e cargo a informar, que a secretaria completa.
- **Orçamento das secretarias**: a Contabilidade libera o PDF do orçamento de cada pasta (guardado no Firestore, sem custo de Storage) e cadastra as fichas/fontes. O botão **Ler PDFs do orçamento** lê o "Demonstrativo da Despesa Fixada" (vários PDFs de uma vez), extrai cada ficha × fonte de recurso com ação, elemento e valor autorizado, sugere a secretaria de cada arquivo (fundos e hospital vão para a secretaria do mesmo órgão) e libera o PDF; também dá para colar do Excel ou cadastrar à mão. Cada secretaria consulta só o seu e escolhe a ficha e a fonte no formulário da diária ("Consultar fichas"), que mostra por padrão só as fichas de diárias (3.3.90.14) do orçamento mais recente.
- **Sigilo dos valores**: o valor só é calculado na Contabilidade e fica na coleção protegida `valores`, que Secretaria e Controle Interno não conseguem ler (nem pelo navegador).
- **Nova solicitação** com cálculo ao vivo, vários servidores da mesma viagem de uma vez (cada um com a sua categoria) e aviso de viagens sobrepostas.
- **Numeração automática por ano** (`0001/2026`…), sem risco de número repetido com dois usuários ao mesmo tempo.
- **Destino escolhido em lista**: estado → município (todos os 5.570 municípios do Brasil). A distância é calculada automaticamente pela rota rodoviária entre a sede de Frei Inocêncio e a sede do destino (OSRM/OpenStreetMap), com ajuste manual permitido e aviso se divergir de viagens anteriores.
- **Empenho** da diária e **reembolsos** (com leitura do nº/série a partir da chave da NF-e).
- **Cancelamento** com motivo (mantém o número e o histórico); exclusão definitiva só para administrador.
- **Documentos para imprimir/PDF**: solicitação (com análise do Controle Interno, conta/fonte, ficha/empenho, valor por extenso, assinaturas do servidor, secretário, Controle Interno e Prefeito, QR Code e código de verificação), formulário de reembolso, relatório do servidor, relatório do período por secretaria e simulação.
- **Painel** com gastos por mês, por secretaria, servidores e destinos.
- **Conferência automática**: viagens sobrepostas do mesmo servidor, destinos com km divergente que mudam a faixa, CPF inválido e empenhos pendentes.
- **Parâmetros da lei** editáveis (valores do Anexo I, etapa alimentação, tipos de despesa).
- **Importador** do banco do SISDIFI desktop (`sisdifi.sqlite`), feito no navegador.
- **Auditoria** de todas as ações, exportação para planilha (CSV/Excel), cópia de segurança completa (JSON) e dotação de diárias por secretaria com acompanhamento no Painel.

## Regra de cálculo (Lei nº 994, de 14/04/2025)

| Situação | Resultado | Base |
|---|---|---|
| Cada 24 horas completas fora do município | 1 diária pernoite | Art. 6º |
| Fração final acima de 12 horas | 1 diária simples | Art. 6º |
| Fração final de 6 a 12 horas | 1 etapa alimentação (R$ 60) | Art. 6º, § 1º |
| Fração final abaixo de 6 horas | nada | Art. 6º, § 1º |
| Deslocamento **inferior a 100 km** com pernoite | cada 24h paga pelo valor da **diária simples** | Art. 7º, § 2º |
| Deslocamento **dentro do território do município**, a partir de 6h | 50% da etapa alimentação | Art. 6º, § 2º |

Faixas do Anexo I: até 100 km, 150 a 300 km e acima de 300 km. A lei não trata de 100,01–149,99 km;
por decisão da administração essa distância fica na **primeira faixa** (como já era pago).
O Art. 7º, caput e § 1º (sem diária abaixo de 8h/100 km; alimentação só se o município não oferecer) **não** é aplicado
automaticamente, por decisão da administração.

## Implantação (uma vez só)

1. **Firebase** — em [console.firebase.google.com](https://console.firebase.google.com):
   - Crie o projeto `sisdifi`.
   - *Authentication* → *Sign-in method* → ative **E-mail/senha**.
   - *Authentication* → *Settings* → *Authorized domains* → adicione `SEU-USUARIO.github.io`.
   - *Firestore Database* → criar banco (`southamerica-east1`, modo produção).
   - *Firestore Database* → *Regras* → cole o conteúdo de [`firestore.rules`](firestore.rules) → **Publicar**.
   - *Configurações do projeto* → *Seus apps* → Web (`</>`) → copie o `firebaseConfig`.
2. **Configuração** — edite [`assets/js/firebase-config.js`](assets/js/firebase-config.js) aqui no GitHub (lápis ✎) e cole os valores. *Commit changes*.
3. **GitHub Pages** — *Settings* → *Pages* → *Deploy from a branch* → `main` / `(root)` → *Save*. Em 1–2 minutos o sistema abre em `https://SEU-USUARIO.github.io/sisdifi/`.
4. **Primeiro acesso** — abra o endereço e entre com Google ou com e-mail/senha (pode ser uma conta já criada no Firebase): essa conta vira o **administrador**.
   Depois: cadastre usuários em *Usuários*, ou peça que entrem com Google — eles aparecem como "Aguardando liberação" e você clica em **Liberar**.
   Para o login Google funcionar, ative o provedor *Google* em Authentication → Sign-in method.
5. **Importar o banco antigo** — *Importar banco antigo* → selecione `sisdifi.sqlite` (na pasta de instalação do SISDIFI desktop: `resources\app\database\sisdifi.sqlite`). Depois revise a *Conferência*.

## Estrutura

```
index.html                  página única
assets/css/app.css          interface
assets/css/documentos.css   documentos A4 para impressão
assets/js/firebase-config.js  dados do projeto Firebase (editar)
assets/js/db.js             acesso ao Firebase (login e banco)
assets/js/calculo.js        motor de cálculo da lei (funções puras)
assets/js/importador.js     conversão do banco antigo
assets/js/views/            telas
assets/data/municipios.json lista de municípios com coordenadas (kelvins/municipios-brasileiros, MIT)
firestore.rules             regras de segurança
tests/                      testes automáticos do cálculo
```

## Testes

`node tests/calculo.test.mjs` — confere as regras de cálculo, faixas e CPF.
O motor foi conferido contra as 141 solicitações do banco antigo: **141/141 idênticas**.

## Custos

Uso normal de uma prefeitura cabe com folga no plano gratuito (Spark) do Firebase: 50 mil leituras e 20 mil gravações por dia. O sistema usa cache local para reduzir leituras.
