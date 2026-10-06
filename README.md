# SISDIFI — Sistema de Diárias Municipais (versão web)

Sistema de cálculo, emissão e controle de diárias de viagem da Prefeitura Municipal de Frei Inocêncio/MG,
conforme a **Lei Ordinária nº 994/2025** (Anexo I). Hospedado no **GitHub Pages**, com login e banco de dados no **Firebase** (plano gratuito).

> Nenhum dado de servidor (CPF, Pix etc.) fica neste repositório. Os dados ficam no Firestore, protegidos pelas regras de segurança e acessíveis só a usuários cadastrados.

## O que o sistema faz

- **Login por e-mail e senha**, com perfis: *Administrador*, *Operador* e *Somente consulta*. Só entra quem o administrador cadastrar.
- **Nova solicitação** com cálculo ao vivo, vários servidores da mesma viagem de uma vez (cada um com a sua categoria) e aviso de viagens sobrepostas.
- **Numeração automática por ano** (`0001/2026`…), sem risco de número repetido com dois usuários ao mesmo tempo.
- **Distância**: reaproveita o km já usado para o mesmo destino; se for destino novo, calcula pela rota (OpenStreetMap/OSRM) e permite ajuste manual.
- **Empenho** da diária e **reembolsos** (com leitura do nº/série a partir da chave da NF-e).
- **Cancelamento** com motivo (mantém o número e o histórico); exclusão definitiva só para administrador.
- **Documentos para imprimir/PDF**: solicitação (inclusive em lote), formulário de reembolso, relatório do servidor e simulação.
- **Painel** com gastos por mês, por secretaria, servidores e destinos.
- **Conferência automática**: viagens sobrepostas do mesmo servidor, destinos com km divergente que mudam a faixa, CPF inválido e empenhos pendentes.
- **Parâmetros da lei** editáveis (valores do Anexo I, etapa alimentação, tipos de despesa).
- **Importador** do banco do SISDIFI desktop (`sisdifi.sqlite`), feito no navegador.
- **Auditoria** de todas as ações e exportação para planilha (CSV/Excel).

## Regra de cálculo

| Situação | Resultado |
|---|---|
| Cada 24 horas completas fora do município | 1 diária pernoite |
| Fração final acima de 12 horas | 1 diária simples |
| Fração final de 6 a 12 horas | 1 etapa alimentação |
| Fração final abaixo de 6 horas | nada |

Faixas de distância: **abaixo de 150 km**, **de 150 a 300 km** (300 inclusive) e **acima de 300 km**.

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
4. **Primeiro acesso** — abra o endereço: o sistema pede para criar o **administrador**. Depois cadastre os demais em *Usuários*.
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
firestore.rules             regras de segurança
tests/                      testes automáticos do cálculo
```

## Testes

`node tests/calculo.test.mjs` — confere as regras de cálculo, faixas e CPF.
O motor foi conferido contra as 141 solicitações do banco antigo: **141/141 idênticas**.

## Custos

Uso normal de uma prefeitura cabe com folga no plano gratuito (Spark) do Firebase: 50 mil leituras e 20 mil gravações por dia. O sistema usa cache local para reduzir leituras.
