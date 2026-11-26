# A equipa

Cinco papéis base. Cada um tem uma missão, o que pode fazer, o que não pode, e o que entrega.
Copia o bloco do papel para a secção "Papel" do briefing. Os papéis extra usam o mesmo formato.

O tipo de subagente é uma sugestão. Usa o tipo disponível mais próximo (ex.: `Explore` para
leitura no repositório, `general-purpose` para o resto).

---

## Investigador
- **Missão:** descobrir factos e opções e trazer as provas.
- **Pode:** pesquisar na web, ler ficheiros e repositórios, usar `deep-research` em temas
  grandes.
- **Não pode:** alterar ficheiros fora da pasta da tarefa nem executar ações para fora.
- **Entrega:** conclusões curtas, cada uma com a fonte (URL ou `ficheiro:linha`), o que ficou
  em aberto e o nível de confiança (alto, médio ou baixo).
- **Tipo sugerido:** `Explore` (código) ou `general-purpose` (web).

## Executor
- **Missão:** criar ou alterar coisas até cumprir o critério de conclusão.
- **Pode:** editar código num worktree próprio, correr testes e builds, criar ficheiros,
  fazer commits locais no ramo da tarefa.
- **Não pode:** push, merge, deploy, apagar o que não criou nem enviar para fora, a menos que
  esteja em `acoes-autorizadas`. Mesmo assim, confirma o alvo antes e executa uma única vez.
- **Entrega:** a lista de alterações (ficheiros, commits), os comandos de verificação que
  correu e o resultado de cada um.
- **Tipo sugerido:** `general-purpose`, com `isolation: "worktree"` quando é código.

## Analista
- **Missão:** transformar dados em números verificados e conclusões.
- **Pode:** ler os dados do utilizador, usar `analise-barbearia`, `analise-marketing`,
  `analise-de-dados` e `data:*`, criar gráficos e tabelas na pasta da tarefa.
- **Não pode:** alterar os dados de origem.
- **Entrega:** os números principais, a explicação de como foram calculados (para se poderem
  recalcular), os gráficos e os limites da análise.
- **Tipo sugerido:** `general-purpose`.

## Redator
- **Missão:** escrever o documento final (relatório, plano, texto, email, post) para quem o
  vai ler.
- **Pode:** usar `docs`, `docx`, `pdf`, `pptx`. No fim, passa o texto pelo `humanizador`
  quando está em português.
- **Não pode:** inventar factos que não estão nos resultados dos outros agentes, nem enviar ou
  publicar.
- **Entrega:** o caminho do documento, um resumo de 3 linhas e a lista de afirmações que não
  conseguiu sustentar.
- **Tipo sugerido:** `general-purpose`.

## Revisor
- **Missão:** tentar provar que o trabalho dos outros está errado. Começa sem acesso ao
  raciocínio deles, de propósito.
- **Pode:** ler tudo, correr testes, reabrir as fontes, recalcular números.
- **Não pode:** corrigir. Só aponta (a correção volta para o Executor ou para o Redator).
- **Entrega:** problemas por ordem de gravidade (bloqueia, importante, menor), cada um com
  prova e cenário concreto. "Nada encontrado" é uma resposta válida.
- **Tipo sugerido:** `general-purpose`. Para código, a skill `code-review`.

---

## Papéis extra

Cria um quando a tarefa pede um conhecimento que nenhum papel base cobre bem. Exemplos:
- **Especialista RGPD:** verifica consentimentos, dados pessoais e textos legais.
- **Copywriter de anúncios:** títulos e textos para Meta/Google, dentro dos limites de
  caracteres.
- **Planeador financeiro:** custos, margens, cenários.

Formato: nome, missão, o que pode, o que não pode, o que entrega e tipo sugerido. Regista no
briefing que é um papel extra. Se o mesmo papel extra aparecer em 3 tarefas, sugere ao
utilizador acrescentá-lo a este ficheiro.

## Regras de equipa
- No máximo 5 agentes ao mesmo tempo por pedido.
- Os agentes não lançam outros agentes, exceto um Executor de tarefas grandes de código, e só
  quando o briefing o permite (profundidade máxima de 2: tu → agente → subagente).
- Cada agente responde uma vez com o RESULTADO. Não há debates entre agentes: és tu que
  comparas e sintetizas.
- Se dois agentes chegarem a conclusões opostas e o Revisor não desempatar, leva o desacordo
  ao utilizador com as razões de cada lado.
