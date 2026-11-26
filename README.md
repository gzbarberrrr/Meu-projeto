# Site da Barbearia

Site de marcações online com página inicial, marcação passo a passo, consulta/cancelamento pelo cliente e dashboard para o barbeiro. Todas as marcações ficam gravadas numa base de dados SQLite (`data/barbearia.db`).

Não precisa de instalar dependências: usa só Node.js (versão 22.13 ou mais recente).

## Arrancar

```bash
ADMIN_PASSWORD=uma-palavra-passe-forte npm start
```

- Site: http://localhost:3000
- Dashboard: http://localhost:3000/admin

Para ver o dashboard com dados de exemplo: `npm run seed` (não usar em produção).

## Personalizar

Tudo o que é da barbearia está em `config.json`:

- `shop`: nome, frase, morada, telefone, WhatsApp (só dígitos com indicativo), email, NIF.
- `hours`: horário por dia da semana (`0` = domingo). Lista vazia = fechado.
- `closedDates`: feriados e folgas (`AAAA-MM-DD`).
- `barbers`: lista de barbeiros.
- `services`: serviços, duração em minutos e preço.
- `booking`: intervalo entre horários, quantos dias à frente se pode marcar e antecedência mínima.

Reinicie o servidor depois de alterar o ficheiro.

## O que faz

**Site público**
- Página inicial com horário em tempo real (aberto/fechado), serviços e preços, perguntas frequentes e contactos.
- Marcação em 4 passos: serviço, barbeiro (ou "qualquer"), dia e hora livres, dados do cliente.
- Só mostra horários realmente livres; dois clientes não conseguem marcar o mesmo horário.
- O cliente recebe um código para consultar ou cancelar a marcação.
- Consentimento RGPD e política de privacidade.

**Dashboard** (`/admin`, protegido por palavra-passe)
- Indicadores: hoje, próximas, faturação da semana e do mês, cancelamentos e faltas, clientes.
- Gráfico dos últimos 14 dias (marcações ou faturação).
- Agenda de hoje com ações rápidas: concluída, falta, cancelar, apagar.
- Tabela de todas as marcações com pesquisa e filtros.
- Nova marcação ao balcão ou por telefone.
- Exportar para CSV (abre no Excel).
- Atualiza sozinho a cada 30 segundos e avisa quando entra uma marcação nova.

## Variáveis de ambiente

| Variável | Para quê | Por omissão |
|---|---|---|
| `ADMIN_PASSWORD` | Palavra-passe do dashboard | `admin123` (mudar!) |
| `PORT` | Porta do servidor | `3000` |
| `DB_PATH` | Ficheiro da base de dados | `data/barbearia.db` |
| `SESSION_SECRET` | Mantém a sessão após reinício | aleatório |

## Publicar

Funciona em qualquer serviço que corra Node.js com disco persistente (por exemplo Render, Railway, Fly.io ou um VPS). Garanta que a pasta `data/` fica num disco persistente, senão as marcações perdem-se a cada novo deploy, e use HTTPS.
