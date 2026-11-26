# Briefing e RESULTADO

## Modelo de `tarefas/<id>/briefing.md`

O briefing é a única coisa que o agente vê. Escreve-o para alguém inteligente que não ouviu
nada da conversa.

```markdown
# Tarefa: <id>

estado: por lançar | em curso | bloqueada | por confirmar | concluída | fechada
tipo: investigar | executar | analisar
area: <projeto ou área, de projetos.md>
papel: <Investigador | Executor | Analista | Redator | Revisor | extra: nome>
iniciada: <AAAA-MM-DD HH:MM>
agente: <papel / nome ou id do agente>
espaco-de-trabalho: <caminho do worktree ou pasta de saída>
depende-de: <ids de outras tarefas, ou nenhuma>

## Objetivo
<uma ou duas frases: o que se quer e porquê>

## Contexto
<o que o agente precisa de saber: decisões já tomadas (citando decisoes.md), prioridades,
público, tom, restrições. Ficheiros e URLs com caminho completo.>

## Papel
<bloco copiado de references/equipa.md>

## Skills a usar
<ex.: analise-marketing; humanizador no fim>

## Critério de conclusão
- [ ] <verificável: ficheiro X existe e contém Y; testes Z passam; responde às perguntas A e B>

## Não pode
- push, merge, deploy, apagar, enviar para fora, gastar dinheiro (exceto o que está em acoes-autorizadas)
- falar diretamente com o utilizador

## Acoes-autorizadas
<vazio, ou: texto exato do utilizador | ação | alvo exato | comando>

## Formato de saída
Termina a resposta com o bloco RESULTADO (ver abaixo).

---
confirmado: <preenchido pelo Chief of Staff: o que verificou e como>
fechada: <data e desfecho>
```

## Bloco RESULTADO (o que o agente devolve)

```
RESULTADO: concluido | bloqueado | falhou
tarefa: <id>
resumo: <2–4 linhas>
entregas:
- <caminho completo, commit, URL>
verificacao:
- <comando ou método> → <resultado>
por-verificar:
- <o que não conseguiu confirmar e porquê>
pergunta: <só se bloqueado: uma pergunta, com as opções>
```

## Continuar uma tarefa

Para dar uma resposta ou uma autorização a um agente que ainda existe, usa SendMessage com o
nome dele. Se já não existe, atualiza o briefing (acrescenta a resposta em "Contexto" ou em
"Acoes-autorizadas") e relança com o mesmo `<id>`. O novo agente começa por ver o que o
anterior deixou no espaço de trabalho.
