# Padrões de interação: que visualização usar para cada tipo de conceito

Escolhe pelo tipo de ideia que queres ensinar, não pelo tema. O mesmo tema pode precisar de
vários padrões (ex.: o coração tem estrutura, fluxo e ciclo).

| Tipo de conceito | Padrão | Controlo principal | Exemplos |
|---|---|---|---|
| Uma quantidade depende de outra | **Explorador de parâmetros**: gráfico ou cena que se redesenha | Slider(s) com valor e unidade | Lei de Ohm, juros compostos, lentes, oferta e procura |
| Estrutura com partes | **Diagrama anatómico clicável**: SVG com regiões que destacam e mostram nome/função | Clicar/hover nas partes, alternar camadas | Coração, célula, motor, CPU, olho, flor |
| Processo em fases | **Stepper de estados**: o mesmo diagrama em estados sucessivos | Anterior/Seguinte, Play/Pausa | Ciclo cardíaco, mitose, fotossíntese, TCP handshake |
| Algo que se move no tempo | **Simulação animada** com `requestAnimationFrame` | Play/Pausa, velocidade, reset + parâmetros | Pêndulo, órbitas, ondas, epidemia SIR, trânsito |
| Fluxo através de um sistema | **Diagrama de fluxo animado**: partículas a percorrer caminhos | Ligar/desligar ramos, caudal | Circulação sanguínea, circuito elétrico, cadeia de abastecimento |
| Comparar alternativas | **Separadores ou lado-a-lado** com o mesmo eixo | Botões de separador, slider partilhado | Mitose vs meiose, ordenar com bubble vs quick sort |
| Geometria / espaço | **Manipulação direta**: pontos arrastáveis | Arrastar pontos (função `arrastar`) | Teorema de Pitágoras, vetores, trigonometria no círculo |
| Algoritmo / código | **Traço de execução**: código com linha atual realçada + estado das variáveis | Passo, Play, editar input | Pesquisa binária, recursão, ordenação |
| Escala e proporção | **Zoom ou barra comparativa** em escala log | Slider de zoom | Tamanho de células a galáxias, dívida pública |
| Linha temporal / história | **Timeline arrastável** com eventos que mudam um mapa ou cena | Slider de ano, clicar em eventos | Expansão do Império Romano, evolução do telemóvel |
| Probabilidade / estatística | **Amostragem ao vivo**: lançar N vezes e ver o histograma crescer | Botão "lançar", slider de N | Lei dos grandes números, distribuição normal |
| 3D | **Rotação por arrasto** (Three.js r128 ou projeção própria em canvas) | Arrastar para rodar, roda para zoom | Moléculas, sistema solar, anatomia em 3D |

## Receitas curtas

**Diagrama anatómico clicável.** Desenha as partes como `<path>` ou formas SVG simples com
`data-parte`. Ao clicar: realça a parte (`stroke-width`, opacidade dos outros a 0,3) e mostra
um painel com nome, função numa frase e um facto curioso. Inclui um botão "Mostrar nomes"
para ligar/desligar etiquetas e transformar o diagrama em autoteste ("clica no ventrículo
esquerdo"). Formas estilizadas e claras ensinam melhor que um desenho realista mal feito.

**Stepper de estados.** Define um array `estados = [{titulo, legenda, ...propriedades}]` e
uma função `desenhar(estado)`. Interpolação entre estados (transições CSS em atributos ou
lerp em canvas) ajuda a ver o que mudou. Mostra "Fase 2 de 5".

**Simulação.** Separa a física (`passo(dt)`) do desenho (`desenhar()`). Usa `dt` fixo
(ex.: 1/120 s) com vários subpassos por frame para estabilidade. Sempre com Pausa e Reiniciar.
Para quando a etapa não está visível (ouve o evento `etapa`) para não gastar CPU.

**Gráfico de função.** Eixos com marcas e unidades, curva atual a cheio, e opcionalmente uma
"curva fantasma" do estado inicial a tracejado para comparar. Um ponto que segue o slider na
curva liga o controlo ao gráfico.

**Traço de execução.** Código em `<pre>` com uma `<span>` por linha; a linha ativa tem fundo
`--acento` a 15%. Ao lado, uma tabela de variáveis em que o valor que acabou de mudar pisca.

## Ideias para "Prevê primeiro"

Usa nos pontos onde a intuição comum falha:
- "A massa do pêndulo afeta o período?" (não)
- "Se o sangue sai do ventrículo direito, vai para onde?" (pulmões, não para o corpo)
- "Duplicar os juros duplica o resultado após 30 anos?" (muito mais que o dobro)
- "Numa sala de 23 pessoas, qual a probabilidade de duas fazerem anos no mesmo dia?" (~50%)

Pode ser escolha múltipla ou um slider ("põe o slider onde achas que fica") — nesse caso,
mostra depois o palpite e o valor real lado a lado.

## Ideias para desafios do quiz

- **Atingir um alvo**: "ajusta até a corrente ser 2 A".
- **Identificar**: "clica na válvula que impede o sangue de voltar à aurícula".
- **Ordenar**: arrastar fases para a ordem certa (ou clicar por ordem).
- **Explicar o efeito**: "o que acontece à órbita se a velocidade baixar?" com opções.
Para desafios de identificar/ordenar, regista um verificador em `Quiz.verificadores` que lê o
estado da visualização.
