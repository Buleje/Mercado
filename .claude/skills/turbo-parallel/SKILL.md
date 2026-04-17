---
name: turbo-parallel
description: Modo TURBO de paralelismo agresivo. Fuerza dispatch de N agentes + N tool calls en 1 solo mensaje con run_in_background=true e isolation=worktree cuando aplique. Usar cuando Brandon diga "rapido", "turbo", "mas velocidad", "en paralelo", "no lento" o cuando hay 3+ sub-tareas independientes.
user-invocable: true
model: opus
context: main
---

# /turbo-parallel — Paralelismo agresivo (ADR-061)

Reemplaza el patron "ejecutar 1 cosa, esperar, ejecutar la siguiente" por **execucion masiva en 1 mensaje**.

## Principios duros

1. **Batch-first ABSOLUTO.** Cada mensaje de Claude debe maximizar tool calls paralelos. Si hay 5 reads pendientes, los 5 van en el MISMO mensaje. Nunca 1+1+1+1+1.
2. **Multi-Agent en 1 mensaje.** Cuando hay 3+ sub-tareas independientes, los 3+ Agent() se despachan en el mismo bloque con `run_in_background: true` + `isolation: "worktree"`.
3. **Fork sobre secuencial.** `subagent_type` especializado + `context: fork` es mas rapido que el mismo agente ejecutando N tareas en serie.
4. **8 max** agentes en paralelo. Mas que eso satura disco/red.

## Cuando aplicar

| Escenario | Accion |
|-----------|--------|
| 3+ frentes independientes (DB, BE, FE) | 3 Agent() con isolation=worktree, run_in_background, en 1 mensaje |
| 5+ reads para context loading | Todos en 1 mensaje |
| Lint + tsc + test + build (independientes) | 4 Bash() en paralelo, 1 mensaje |
| 2 Edit + 1 Write + 1 Bash (archivos distintos) | Los 4 en 1 mensaje |
| ADR + skill + hook + commit | Los 3 writes en 1 mensaje, commit despues |

## Cuando NO aplicar

- Tool calls dependientes (Read → Edit del mismo archivo)
- Si el contenido de un call alimenta otro (search → read del resultado)
- Tareas que comparten archivos criticos (checkout, cart, schema)

## Template turbo

```
[1 mensaje de Claude]:
  Agent(subagent_type: database, isolation: worktree, run_in_background: true)
  Agent(subagent_type: backend, isolation: worktree, run_in_background: true)
  Agent(subagent_type: frontend, isolation: worktree, run_in_background: true)
  Agent(subagent_type: tester, isolation: worktree, run_in_background: true)
  Read(CLAUDE.md)
  Read(ROADMAP)
  Read(session-state.json)
  Bash(git log --oneline -10)

→ Mientras 4 agentes corren en background, Claude ya tiene contexto.
→ Tiempo total: max(duracion_de_cualquier_agente) + merge final.
```

## Telemetria (opcional)

- Si `.claude/hooks/parallel-telemetry.mjs` existe, cuenta cuantos tool calls hiciste en cada mensaje y reporta el % de paralelismo.
- Meta: >60% de los mensajes con 2+ tool calls deben ser paralelos.

## Reglas anti-regresion

- NO hacer 1 Agent, esperar resultado, hacer otro Agent igual de independiente. Es el anti-patron que desperdicia 40-60% de tiempo.
- NO leer 1 archivo, pensar, leer otro si ya sabias que ibas a necesitar ambos. Batch el read.
- NO llamar /luis para sub-tareas — /luis forkea y bloquea. Usa Agent() directo en background.

## Beneficio medido

Con 4 agentes en worktree paralelos vs secuenciales:
- Sesion secuencial: 4 × 90s = 360s
- Sesion turbo: max(agent) + sync ≈ 110s
- **Ganancia ~3x** sin perder calidad (cada agente usa Opus en fork)
