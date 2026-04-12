---
name: agent-metrics
description: Trackea metricas de rendimiento de agentes — tokens usados, tiempo, tasa de exito, calidad. Ayuda a optimizar que agentes usar para que tipo de tarea.
user-invocable: true
model: haiku
---

# /agent-metrics — Metricas de rendimiento de agentes

## Cuando usarlo
- `/agent-metrics status` — ver dashboard de metricas actuales
- `/agent-metrics report` — generar reporte completo
- `/agent-metrics reset` — limpiar metricas (nuevo sprint)
- AUTOMATICO: el finops-guard consulta esto para detectar agentes costosos

## Que trackea

Para cada agente/squad usado en la sesion:

| Metrica | Como se mide |
|---|---|
| **Invocaciones** | Conteo de veces lanzado |
| **Tokens estimados** | Basado en turns × modelo (Opus ~4K/turn, Sonnet ~2K/turn, Haiku ~1K/turn) |
| **Tasa de exito** | % de veces que produjo output utilizado sin rehacer |
| **Tiempo promedio** | Segundos desde launch hasta resultado |
| **Archivos tocados** | Promedio de archivos editados por invocacion |
| **Tests verdes** | % de veces que los tests pasaron despues de su trabajo |

## Formato del dashboard

```
## Agent Metrics — Sprint 2

| Agente | Usos | Tokens est. | Exito | Tiempo | Tests OK |
|---|---|---|---|---|---|
| database-engineer | 5 | ~40K | 100% | 45s | 100% |
| frontend-engineer | 8 | ~64K | 87% | 60s | 87% |
| bug-hunter | 3 | ~24K | 100% | 30s | 100% |
| full-stack-squad | 2 | ~200K | 100% | 180s | 100% |
| checkout-squad | 1 | ~150K | 100% | 120s | 100% |

**Total tokens sesion:** ~478K
**Costo estimado:** ~$2.40 (Opus $15/M input, $75/M output)
**ROI:** 12 tasks completadas = $0.20/task

### Top 3 mas eficientes
1. bug-hunter — 100% exito, 30s promedio, bajo costo
2. database-engineer — 100% exito, especializado
3. frontend-engineer — 87% exito (1 re-do por snapshot)

### Recomendaciones
- frontend-engineer: considerar agregar snapshot regeneration automatica
- full-stack-squad: usar solo para tareas genuinamente cross-layer (costoso)
```

## Persistencia

Las metricas se guardan en `bodega-san-martin/.claude/metrics/sprint-[N].json`.
Se acumulan por sprint y se resetean con `/agent-metrics reset`.

## Integracion con finops-guard

El agente finops-guard lee las metricas para:
- Detectar agentes que gastan >$2/tarea (umbral de alerta)
- Recomendar Sonnet en vez de Opus para tareas repetitivas
- Detectar squads usados para tareas simples (desperdicio)
