# Caracteres tratados pelo `limpar_texto.py`

| Categoria no relatório | Caracteres | Para que servem / porque aparecem | O que o script faz |
|---|---|---|---|
| `largura_zero` | U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ, U+2060 WORD JOINER, U+2061–2064 operadores invisíveis, U+FEFF BOM, U+180E, U+034F, preenchimentos Hangul (U+115F, U+1160, U+3164, U+FFA0), U+FFF9–FFFB | Os mais usados para marcar texto às escondidas (sequências de ZWSP/ZWNJ codificam bits). O BOM vem muitas vezes do Excel ou do Bloco de Notas. | Remove. **Exceção:** o ZWJ entre emojis é mantido, porque faz parte de emojis compostos (👨‍👩‍👧). |
| `caracteres_tag (texto escondido)` | U+E0000–E007F | Cada um corresponde a uma letra ASCII invisível. Permitem esconder frases inteiras ("ASCII smuggling"), incluindo instruções para IAs. | Remove e **descodifica** a mensagem escondida para o relatório. |
| `seletores_variacao` | U+FE00–FE0F, U+E0100–E01EF | Os seletores de variação podem esconder bytes de dados atrás de qualquer letra. | Remove. **Exceção:** VS15/VS16 (U+FE0E/FE0F) a seguir a um símbolo ou emoji, que é o uso normal (❤️). |
| `controlo_bidirecional` | U+200E, U+200F, U+061C, U+202A–202E, U+2066–2069 | Mudam a direção da escrita. Podem fazer o texto parecer diferente do que é (ataque "Trojan Source"). | Remove, a menos que se use `--keep-bidi` (texto árabe ou hebraico). |
| `hifen_suave` | U+00AD | Hífen que só aparece em quebras de linha. Vem do Word e de sites, e estraga pesquisas. | Remove. |
| `espacos_especiais` | U+00A0 NBSP, U+202F, U+2000–200A, U+205F, U+3000; U+2028/2029 | Espaços com outra largura ou que não deixam partir a linha. Também se usam para marcar texto. | Converte em espaço normal (U+2028/2029 passam a quebra de linha). `--keep-nbsp` mantém U+00A0 e U+202F. |
| `caracteres_controlo` | C0 e C1 exceto tab, LF e CR | Lixo de conversões ou caracteres metidos de propósito. | Remove. |
| `outros_formatacao_invisivel` | Qualquer outro caractere da categoria Unicode Cf | Rede de segurança para caracteres invisíveis menos comuns. | Remove e indica o nome no relatório. |
| `homoglifos` | Cirílico/grego parecido com latim (а е о р с у х і ј ѕ…, Α Β Ε Ο Ρ…), U+2010/2011 | Letras iguais à vista trocadas numa palavra latina para "assinar" o texto ou fugir a filtros. | Converte para latim **só em palavras que também têm letras latinas**. Uma palavra toda em cirílico (russo genuíno) fica intacta. `--keep-homoglyphs` desativa a conversão. |
| `frases_removidas` | O que for indicado em `--remove-phrase` / `--remove-regex` | Marcas visíveis ("RASCUNHO", "Gerado por…"). | Remove (sem distinguir maiúsculas) e arruma os espaços e as linhas vazias que ficarem. |
| `marca_de_agua_word` | VML `PowerPlusWaterMarkObject*`, `docPr` com "WaterMark", `sdt` da galeria Watermarks | A marca de água posta em Design > Marca de Água no Word. | Remove o elemento inteiro do cabeçalho. O relatório mostra o texto da marca. |

## Notas

- O relatório assinala as **linhas curtas repetidas 3 ou mais vezes**, mas não as remove: podem ser conteúdo legítimo (títulos de secção, por exemplo).
- As **marcas estatísticas de IA** (padrões na escolha de palavras) não são caracteres e não aparecem aqui. Limpar o texto não as remove.
