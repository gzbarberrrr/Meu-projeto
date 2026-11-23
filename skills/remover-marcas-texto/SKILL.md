---
name: remover-marcas-texto
description: Deteta e remove marcas de água textuais de texto e documentos (.txt, .md, .csv, .html, .srt, .json, .docx ou texto colado). Trata marcas invisíveis, como caracteres de largura zero, BOM, caracteres "tag" com mensagens escondidas, seletores de variação, controlos bidirecionais, hífenes suaves, espaços especiais e letras cirílicas ou gregas disfarçadas de latinas. Trata também marcas visíveis, como "RASCUNHO", "CONFIDENCIAL", "Gerado por…" e a marca de água do Word no cabeçalho. Usar sempre que alguém pedir para limpar, verificar ou "desinfetar" texto, tirar caracteres escondidos ou estranhos, explicar porque um texto colado se comporta mal (pesquisa que não encontra, contagens erradas, espaços fantasma), tirar a marca de água ou o carimbo de um documento Word ou de texto, ou perguntar se um texto tem marca d'água, mesmo sem usar a palavra "marca de água". Não serve para imagens, vídeo ou PDF digitalizado.
---

# Remover marcas de água textuais

Uma marca textual é qualquer coisa metida dentro do texto para o identificar ou "carimbar", sem fazer parte do conteúdo. Há duas famílias, e é importante distingui-las ao falar com o utilizador:

- **Invisíveis:** caracteres Unicode que não se veem, mas viajam com o texto quando é copiado. Servem para rastrear a origem, esconder um ID ou "impressão digital", e às vezes aparecem por acidente (o BOM do Excel, espaços não separáveis do Word). Também causam bugs reais: pesquisas que falham, palavras "iguais" que o código trata como diferentes, contagens de caracteres erradas.
- **Visíveis:** frases carimbadas no texto ("RASCUNHO", "Versão de avaliação", "Gerado por X") e a marca de água que o Word põe no cabeçalho (Design > Marca de Água).

O script `scripts/limpar_texto.py` trata as duas famílias de forma determinística. Usa-o em vez de escrever regex à mão: a lista de caracteres é longa e fácil de errar, e o script já protege casos que uma limpeza ingénua estraga (emojis compostos, texto genuinamente em russo ou grego, quebras de linha \r\n).

## Âmbito e uso responsável

Esta skill é para limpar texto que o utilizador escreveu, recebeu para trabalhar ou tem direito a editar: documentos internos, texto colado de outras ferramentas, ficheiros exportados, rascunhos que passam a versão final. Na grande maioria dos pedidos é isto, e não vale a pena interrogar o utilizador.

Pára e fala com o utilizador quando o pedido for claramente para apagar sinais de autoria ou de licença de trabalho alheio e o fazer passar por seu (por exemplo, tirar "© Autor X, não redistribuir" de um texto que não é dele para o publicar), ou para esconder que um documento é confidencial ao partilhá-lo com quem não o devia ver. Nesses casos, explica o problema numa frase e oferece o que puderes fazer de legítimo.

**Marcas estatísticas de IA:** alguns fornecedores de IA marcam o texto pela escolha das palavras, sem nenhum caractere especial (por exemplo, o SynthID). Estas marcas não se veem nem se "removem" com limpeza de caracteres, e esta skill não reescreve texto para enganar detetores. Se o utilizador perguntar por isto, diz-lhe com franqueza que a limpeza tira os caracteres escondidos mas não muda o padrão estatístico. Se a intenção for apresentar texto gerado por IA como escrito à mão num contexto que o proíbe (trabalho escolar, por exemplo), não ajudes a contornar a deteção.

## Fluxo de trabalho

1. **Arranjar o texto.** Se o utilizador colou o texto na conversa, grava-o num ficheiro temporário com a ferramenta Write (preserva os caracteres invisíveis; um `echo` na shell pode perdê-los). Se é um ficheiro, usa o caminho dele.

2. **Analisar primeiro, sem gravar:**
   ```bash
   python3 <skill>/scripts/limpar_texto.py FICHEIRO --report-only --json relatorio.json
   ```
   O relatório conta cada tipo de marca, dá exemplos, descodifica mensagens escondidas em caracteres "tag" e assinala linhas curtas repetidas 3 ou mais vezes (candidatas a marca visível).

3. **Decidir o que remover.** As marcas invisíveis saem por omissão. As frases visíveis só saem quando o utilizador as indicou, ou quando o relatório as assinala e são obviamente um carimbo ("RASCUNHO", "AMOSTRA"). Se houver dúvida se uma linha repetida é conteúdo, pergunta antes de a apagar.

   Ajusta as opções ao texto:
   - `--keep-nbsp` em texto com tipografia cuidada (o espaço não separável em "15 €" ou antes de ":" em francês é intencional). Por omissão é convertido em espaço normal, porque é a origem mais comum de pesquisas que falham.
   - `--keep-bidi` em texto com árabe ou hebraico, onde os controlos bidirecionais podem ser necessários.
   - `--keep-homoglyphs` se o texto mistura propositadamente alfabetos (raro).
   - `--keep-word-watermark` se o utilizador quiser manter a marca do cabeçalho do Word.

4. **Limpar.** O original nunca é alterado:
   ```bash
   python3 <skill>/scripts/limpar_texto.py FICHEIRO \
       [--remove-phrase "Gerado por FreePDF Trial"] \
       [--remove-regex '^RASCUNHO$\n?'] \
       --json relatorio.json
   ```
   A saída é `<nome>.limpo<ext>` ao lado do original, ou o caminho dado em `--out`. Para texto colado, usa `-` e passa o texto por stdin; o texto limpo sai em stdout e o relatório em stderr.

5. **Confirmar.** Volta a correr a análise (`--report-only`) sobre o ficheiro limpo: deve dar 0 marcas, ou só as que decidiste manter. Num .docx, confirma que o texto continua lá (por exemplo, com `python-docx`), porque um documento vazio também tem "0 marcas".

6. **Responder ao utilizador.** Em português, e sem jargão desnecessário:
   - quantas marcas havia e de que tipo, numa frase cada ("3 caracteres invisíveis de largura zero, comuns em texto copiado de ferramentas de IA ou chats");
   - qualquer mensagem escondida que tenha sido descodificada, porque é a informação mais útil e surpreendente;
   - o que foi mantido de propósito e porquê (emojis, texto em russo genuíno, NBSP);
   - o caminho do ficheiro limpo. Se o texto foi colado e é curto, mostra também o texto limpo pronto a copiar.
   - Se não havia nenhuma marca, diz isso claramente. É uma resposta útil.

## Formatos

| Formato | Como é tratado |
|---|---|
| .txt .md .csv .tsv .html .srt .vtt .json .xml | Lido como UTF-8 (Latin-1 como alternativa) e gravado em UTF-8, com as quebras de linha preservadas |
| .docx | Limpa o texto do corpo, cabeçalhos, rodapés, notas e comentários, e remove a marca de água do Word no cabeçalho (VML `PowerPlusWaterMarkObject`, desenhos "WaterMark" e blocos da galeria Watermarks). A formatação é preservada. |
| Texto colado | Gravar com Write e tratar como .txt, ou usar `-` com stdin |
| .pdf, imagens | Fora do âmbito. Para PDF com camada de texto, extrai o texto primeiro (skill de PDF) e depois limpa esse texto. |

Em .docx, uma frase visível pode estar partida em vários "runs" do Word (por exemplo, quando parte dela está a negrito), e então `--remove-phrase` não a encontra. Se o relatório não indicar a remoção esperada, explica isso ao utilizador e remove-a com python-docx juntando o texto do parágrafo.

## Referência

`references/caracteres.md` lista cada caractere tratado, para que serve e porque é removido ou mantido. Lê-o quando o utilizador perguntar o que um caractere específico era, ou quando o relatório mostrar uma categoria inesperada (`outros_formatacao_invisivel`).
