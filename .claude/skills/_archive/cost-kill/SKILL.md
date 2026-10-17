---
name: cost-kill
description: |
  Mata agentes o procesos que se desbocan en tokens sin producir output
  útil. Reporta el consumo estimado antes de matar.
  Usar cuando un agente lleve demasiado tiempo, cuando el data-qa
  detecte exceso, o cuando Brandon diga "mata ese agente", "está
  gastando mucho", "cost kill", "para eso".
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, TaskCreate, TaskUpdate
argument-hint: "[agent-name | 'all-background' | 'report']"
model: haiku
---

# Cost Kill — Control de gasto de agentes

## Subcomandos

### `/cost-kill report`

```
1. Listar agentes/procesos activos en background
2. Estimar tokens consumidos por cada uno
3. Reportar en tabla:
   | Agente | Tokens est. | Tiempo activo | Output útil |
4. Marcar con 🔴 los que excedan umbral ($2 o 100k tokens)
```

### `/cost-kill [agent-name]`

```
1. Identificar el agente por nombre
2. Estimar tokens consumidos hasta ahora
3. Si tiene tareas pendientes → marcarlas como "killed by finops"
4. Terminar el proceso
5. Reportar:
   - Tokens ahorrados estimados
   - Tareas que quedaron pendientes
   - Si la tarea era crítica → sugerir re-ejecutar con modelo más barato
```

### `/cost-kill all-background`

```
1. Listar TODOS los agentes en background
2. Para cada uno: verificar si produjo output en los últimos 5 minutos
3. Si no produjo output → matar
4. Si produjo output → dejarlo correr
5. Reportar resumen
```

## Umbrales

| Métrica | Umbral | Acción |
|---|---|---|
| Tokens por agente | > 100k sin output | 🔴 Kill recomendado |
| Tiempo activo | > 10 min sin progreso | 🟡 Advertencia |
| Costo estimado | > $2 por tarea | 🔴 Kill recomendado |
| Re-lecturas | Mismo archivo 5+ veces | 🟡 Sugerir checkpoint |

## Reglas

1. **Nunca matar agentes con tareas críticas** (checkout, migration, pentest) sin confirmación.
2. **Siempre reportar tokens ahorrados** al terminar.
3. **Sugerir modelo más barato** si la tarea se puede re-ejecutar.
4. **Modelo Haiku** para este skill — no gastar Opus en matar agentes.

## Referencia

- Agente: `data-qa` (22)
- Skill: `/token-optimizer`
