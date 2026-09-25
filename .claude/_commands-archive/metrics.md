---
description: Muestra las ultimas 20 corridas de agentes con tokens/duration del log JSONL
---

Lee el archivo `.claude/metrics/agents.jsonl` y muestra una tabla compacta con las ultimas 20 entradas:

| Fecha | Agente | Duration | Tokens in/out | Success |

Si el archivo no existe, avisa que aun no hay datos y sugiere correr al menos un subagent para poblar.

Al final agrega totales:
- Total agents ejecutados
- Token count aproximado
- Success rate

Comandos utiles: `tail -20 .claude/metrics/agents.jsonl`
