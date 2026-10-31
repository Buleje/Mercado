---
name: agent-report
description: Dashboard de rendimiento por Hub y agente. Muestra tokens, exito, tiempo, fallos por Hub BUILD/QUALITY/OPS. Usar cuando Brandon diga "como rinden los agentes", "agent report", "hub metrics".
user-invocable: true
model: haiku
allowed-tools: Read, Grep, Glob
argument-hint: "[all|hub-build|hub-quality|hub-ops|agent-name]"
---

# /agent-report v2 — Hub Performance Dashboard

## Fuente de datos
Archivos en `.claude/hub-metrics/`:
- `build-metrics.json` — Metricas del Hub BUILD
- `quality-metrics.json` — Metricas del Hub QUALITY
- `ops-metrics.json` — Metricas del Hub OPS
- `sprint-history.json` — Historial de sprints

Si no existen, buscar fallback en `.claude/agent-metrics.json` (formato v1).

## Algoritmo

1. Leer archivos de metricas disponibles
2. Si no existe ninguno → reportar "Sin datos. Las metricas se generan automaticamente al usar sprint-autopilot o agent-team."
3. Calcular por Hub:
   - Sesiones totales del Hub
   - Tasa de exito (features completadas / total)
   - Tokens promedio por feature
   - Tiempo promedio por feature
   - Top 3 errores recurrentes
   - Gate pass rate (% que pasa lint+tsc o test+build a la primera)
4. Calcular por agente dentro del Hub:
   - Tareas completadas
   - Tokens usados
   - Errores causados
5. Calcular tendencias (mejorando/empeorando vs sesion anterior)

## Formato de salida

```markdown
## Hub Performance — [fecha]

### Resumen ejecutivo

| Hub | Sesiones | Exito | Tokens/feature | Tiempo | Gate pass |
|-----|----------|-------|----------------|--------|-----------|
| BUILD | N | N% | NK | Ns | N% |
| QUALITY | N | N% | NK | Ns | N% |
| OPS | N | N% | NK | Ns | N% |

### Detalle por agente

| Hub | Agente | Tareas | Tokens | Errores | Tendencia |
|-----|--------|--------|--------|---------|-----------|
| BUILD | architect | N | NK | N | ↑↓→ |
| BUILD | backend | N | NK | N | ↑↓→ |
| ... | ... | ... | ... | ... | ... |

### Top problemas

| # | Problema | Hub | Frecuencia | Impacto |
|---|---------|-----|-----------|---------|
| 1 | [desc] | [hub] | Nx | [alto/medio/bajo] |

### Recomendaciones

| # | Accion | Impacto estimado |
|---|--------|-----------------|
| 1 | [mejora] | [tokens ahorrados o tiempo reducido] |
```

## Modo comparativo

Si se pasa argumento `vs-last`:
- Comparar metricas actuales con la sesion/sprint anterior
- Mostrar deltas con flechas (↑ mejor, ↓ peor, → igual)
- Alertar si algun agente empeoro significativamente (>20%)
