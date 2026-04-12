---
name: agent-report
description: Dashboard de rendimiento por agente. Muestra sesiones, tasa exito, tokens promedio, tiempo, fallos top. Usar cuando Brandon diga "como rinden los agentes", "agent report", "metricas agentes".
user-invocable: true
model: haiku
allowed-tools: Read, Grep, Glob
argument-hint: "[all|agent-name]"
---

# /agent-report — Rendimiento de Agentes

## Fuente de datos
Archivo: `.claude/agent-metrics.json` (generado por skill `/agent-metrics`)

## Algoritmo
1. Leer `.claude/agent-metrics.json`
2. Si no existe → reportar "Sin datos. Ejecuta `/agent-metrics` primero."
3. Para cada agente con datos, calcular:
   - Sesiones totales
   - Tasa de éxito (tareas completadas / total)
   - Tokens promedio por tarea
   - Tiempo promedio (segundos)
   - Top 3 errores recurrentes

## Formato de salida

```markdown
## Agent Performance — [fecha]

| Agente | Sesiones | Éxito | Tokens/tarea | Tiempo | Top fallo |
|--------|----------|-------|-------------|--------|-----------|
| frontend-engineer | 15 | 93% | 5.2K | 45s | snapshot mismatch |
| backend-platform-engineer | 12 | 87% | 8.1K | 62s | missing tenantId |

### Recomendaciones
- [agente con <80% éxito] → candidato a `/evolve analyze`
- [agente con >10K tokens] → candidato a model downgrade
```

## Reglas
1. Solo mostrar agentes con >= 3 sesiones de datos
2. Marcar 🔴 si éxito < 80%, 🟡 si < 90%, 🟢 si >= 90%
3. Sugerir `/evolve` para agentes con rendimiento bajo
