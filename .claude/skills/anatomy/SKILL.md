---
name: anatomy
description: |
  Ensina qualquer assunto com uma página interativa (Artifact) em vez de uma resposta em texto:
  gráficos, diagramas e simulações que o utilizador arrasta, ajusta e explora, com modo
  passo-a-passo, desafios "prevê primeiro", mini-quiz e glossário ao passar o rato. Usar sempre
  que o utilizador pedir para lhe ensinarem, explicarem ou mostrarem como funciona alguma coisa
  ("ensina-me", "explica-me", "como funciona", "quero perceber", "anatomia de", "mostra-me
  visualmente", "teach me", "explain how X works"), seja ciência, matemática, biologia,
  economia, história, tecnologia ou programação, mesmo que não peça gráficos de forma explícita.
  Não usar para perguntas factuais de uma linha, para análise de ficheiros de dados do
  utilizador nem para dashboards de métricas.
license: MIT
metadata:
  version: "1.0.0"
  inspirado-em: "analyticalmonk/explain-this (MIT), explorable explanations (Bret Victor)"
---

# Anatomy: ensinar a mexer, não a ler

Quando o utilizador quer aprender um assunto, não respondas com texto. Constrói uma página
interativa onde ele aprende a mexer: arrasta um slider e vê a curva mudar, carrega em "Seguinte"
e vê o mecanismo avançar um passo, tenta adivinhar e só depois vê o resultado.

A razão é simples: ler uma explicação dá a sensação de ter percebido, mas brincar com o sistema
cria intuição a sério. Por isso cada gráfico tem de mostrar a relação de causa e efeito do
conceito, não decorar a página.

O texto fica no mínimo: títulos, legendas de uma linha que dizem o que observar, dicas como
"arrasta o ponto e vê o que acontece ao período". Nada de parágrafos longos nem listas de factos.

## Fluxo

Constrói logo, sem pedir aprovação de um plano. O utilizador pede alterações depois.

1. **Perceber o pedido.** Identifica o tema e o nível (pistas: idade, "sou principiante",
   "para o exame de medicina"). Sem pistas, aponta para um adulto curioso sem formação na área.
   Se o tema for enorme ("toda a química"), escolhe o núcleo mais útil e diz no fim que outras
   partes podes fazer a seguir. Só faz uma pergunta se for impossível adivinhar o que querem.
2. **Encontrar o modelo mental.** Antes de desenhar, decide qual é a ideia central que o
   utilizador deve levar e que variáveis a controlam. Ex.: no pêndulo, o período depende do
   comprimento e não da massa. Esta é a "espinha" da lição; tudo o resto serve-a.
3. **Planear 3 a 5 secções**, cada uma com uma visualização interativa que constrói sobre a
   anterior (do simples ao completo). Introduz um controlo de cada vez: o primeiro gráfico tem
   um slider, o último pode ter vários. Consulta `references/padroes-interacao.md` para escolher
   o tipo de visualização certo para cada conceito.
4. **Verificar os factos.** Números, fórmulas, nomes e datas têm de estar certos. Se não tens
   a certeza de um valor, pesquisa (WebSearch) ou deixa-o de fora. Uma simulação com física
   errada ensina errado, o que é pior que não ensinar.
5. **Construir a página** a partir de `assets/modelo.html` (ver "Construir" abaixo).
6. **Testar** (ver "Verificação") e **publicar** como Artifact.
7. **Responder em 2 a 4 linhas**: o que a página ensina, o que experimentar primeiro, e uma
   sugestão do próximo tema. Não repitas a explicação em texto no chat.

## Estrutura de cada lição

Usa os componentes que já estão no modelo. Todos os quatro extras entram em cada lição:

- **Cabeçalho**: título do tema e uma pergunta-gancho de uma linha ("Porque é que um pêndulo
  longo balança mais devagar?"). Nada de definições de dicionário a abrir.
- **Secções com passo-a-passo** (`.etapa`): a lição avança por etapas com botões Anterior /
  Seguinte e uma barra de progresso. Cada etapa = uma visualização + legenda curta + dica de
  interação. Os botões e as teclas ← → navegam.
- **"Prevê primeiro"** (`.preve`): em pelo menos uma etapa, antes de revelar a visualização ou
  o resultado, pede um palpite (escolha múltipla ou slider). Depois de responder, mostra o
  resultado e uma frase sobre o palpite. Usa-o no ponto mais contra-intuitivo do tema, porque é
  aí que o erro de previsão ensina mais.
- **Glossário** (`<span class="termo" data-def="...">`): os termos técnicos têm definição em
  tooltip ao passar o rato ou tocar (mobile). Definições de uma frase, em linguagem simples.
- **Mini-quiz final** (`.quiz`): 3 a 5 desafios. Prefere desafios de manipulação ("põe o
  slider no valor que dá um período de 2 s") a perguntas de escolha múltipla; mistura os dois.
  Feedback imediato: certo explica porquê em uma frase, errado dá uma pista e deixa tentar
  outra vez. No fim mostra a pontuação.

## Construir

- Copia `assets/modelo.html` para o scratchpad e preenche-o. O modelo já tem os tokens de
  cor (tema claro e escuro), layout responsivo, navegação por etapas, componente de previsão,
  quiz, tooltips do glossário e um helper de canvas com suporte a ecrãs retina. Não reescrevas
  estas peças; acrescenta o conteúdo e as visualizações.
- **Ficheiro único**: HTML, CSS e JS inline. Vanilla JS com SVG ou Canvas chega para quase
  tudo. Bibliotecas só se poupam muito trabalho e apenas de CDNs permitidos com versão exata
  (ex.: `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` para 3D a sério,
  `https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js` para gráficos de dados complexos).
- **Cada visualização é uma função isolada** (IIFE) com o seu estado. Redesenha sempre a
  partir do estado, nunca acumules alterações no DOM, para que mexer rápido no slider não
  deixe lixo no ecrã.
- **Mostra os números a mudar.** Junto a cada controlo, mostra o valor atual com unidade
  ("L = 1,2 m"). Quando há uma fórmula, mostra-a com os valores atuais substituídos.
- **Respostas imediatas**: tudo reage com `input`, não com `change`, para o gráfico seguir o
  dedo. Animações com `requestAnimationFrame`, com botão de pausa.
- **Mobile**: alvos de toque com pelo menos 40 px, sem scroll horizontal, gráficos que
  encolhem com o ecrã (viewBox no SVG, largura do contentor no canvas). Num SVG com viewBox
  de 600 de largura, o texto encolhe para ~60% num telemóvel: usa `font-size` de 18 ou mais
  para etiquetas que têm de ser lidas. Suporta pointer events
  para que arrastar funcione com rato e com dedo.
- **Cores**: usa só as variáveis CSS do modelo (`--acento`, `--a2`, `--a3`...), para a página
  funcionar em modo claro e escuro. Usa a cor com significado consistente: se o vermelho é
  "força" no primeiro gráfico, é força em todos.
- **Língua**: escreve na língua do utilizador (por defeito, português de Portugal: "ecrã",
  "carrega", "rato"). Usa vírgula decimal em PT.

## Publicar

Se a ferramenta Artifact está disponível, segue as regras dela: faz `quickstart` com
`intent: "other"` uma vez por lição nova, escreve o ficheiro no scratchpad, e publica com um
`<title>` de 2 a 4 palavras (ex.: "Anatomia do Coração"), um `description` de uma frase e
`icon: "learn"` (ou outra palavra genérica que sirva, ex.: "heart", "atom"). Para alterações
pedidas depois, republica o mesmo ficheiro para manter o link.

Sem a ferramenta Artifact, guarda o HTML numa pasta que o utilizador consiga abrir (ex.:
`licoes/<tema>.html` no projeto) e envia-o com SendUserFile se existir.

## Verificação

Antes de publicar, abre a página no Playwright (Chromium já está instalado) e confirma:

- zero erros na consola;
- cada controlo mexe a visualização (simula um `input` num slider e compara o estado);
- a navegação passa por todas as etapas e o quiz aceita respostas;
- a 375 px de largura não há scroll horizontal (`document.documentElement.scrollWidth <= 375`);
- em `prefers-color-scheme: dark` o texto continua legível.

`scripts/verificar.js` faz estas verificações: `node scripts/verificar.js <ficheiro.html>`.
Corrige o que falhar antes de publicar. Tira uma captura só para ti (deviceScaleFactor 1) e
olha para ela: sobreposições, texto cortado e gráficos vazios não se apanham só com código.

## Erros a evitar

- Responder com um texto longo e um gráfico decorativo no fim. O gráfico é a explicação.
- Gráficos que só se veem (imagem estática, animação sem controlo). Tudo deve ter algo para
  mexer, mesmo que seja um passo-a-passo.
- Muitos controlos de uma vez no início. Acrescenta-os aos poucos.
- Simplificar até ficar errado sem avisar. Se o modelo é uma aproximação (ex.: pêndulo de
  ângulos pequenos), diz numa legenda.
- Quiz que se resolve sem ter usado a página. As perguntas devem exigir a intuição que as
  visualizações construíram.
