---
name: token-optimizer
description: |
  Optimiza el consumo de tokens de la sesión actual. Resume mensajes viejos
  en `session_recap.md`, marca chunks pesados para limpieza, y emite
  recomendaciones cuando el contexto supera el 70% del presupuesto.
  Usar manualmente con `/token-optimizer` o automáticamente cuando el sistema
  detecte carga alta. Complementa (no reemplaza) la auto-compresión nativa.
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
argument-hint: "[summary | clean | status | recap]"
model: sonnet
---

# Token Optimizer — gestor de presupuesto de contexto

Mantener la sesión rápida, enfocada y barata. Aplicable cuando contexto >100k tokens.

## Subcomandos

| Comando | Acción |
|---|---|
| `status` | Estimación de uso actual + alertas |
| `summary` | Genera `session_recap.md` con lo importante |
| `clean` | Marca lecturas/outputs pesados para purga |
| `recap` | Combo: summary + clean + status |

## 1. `status` — diagnóstico

Reportar tabla con estas métricas:

| Métrica | Umbral |
|---|---|
| Tool calls grandes (>5k tokens) | <10 |
| Lecturas de archivo | <30 |
| Bash outputs grandes (>2k) | <15 |
| Estimación total | 200k (Opus 1M) |

Recomendación: Verde (seguir) / Amarillo (`summary` ahora) / Rojo (`recap` + considerar `/clear`).

## 2. `summary` — escribir session_recap.md

Guardar en `bodega-san-martin/.claude/sessions/session_recap_YYYYMMDD-HHMM.md`:
- Objetivo de la sesión (1-2 frases)
- Archivos tocados (path + qué cambió + por qué)
- Comandos clave ejecutados + resultado
- Decisiones tomadas + razón
- Pendientes (checklist)
- Memorias actualizadas
- Cómo retomar (comandos bash)

## 3. `clean` — recomendar purga

Identificar candidatos (NO borrar):
- Tool calls >5k tokens (lecturas exploratorias ya digeridas)
- Outputs de build/test verdes (no aportan más)
- Recomendar: mantener lecturas de tarea actual, purgar el resto

Opciones de purga: `/clear` (drástico) | auto-compresión nativa | nueva sesión con recap cargado.

## 4. `recap` — combo completo

Ejecuta: summary → clean → status → imprime URL del recap + comandos para retomar.

## Heurísticas de uso

| Síntoma | Acción |
|---|---|
| Sesión >2h activa | `summary` cada 30 min |
| Múltiples reads de archivos enormes | `clean` después de cada read |
| Cambio de contexto (feature X → Y) | `recap` + considerar nueva sesión |
| Brandon dice "esto está pesado" | `recap` inmediato |
| Antes de cierre de sesión | `summary` siempre |

## Reglas duras

1. Nunca borrar mensajes manualmente — solo recomendar o esperar auto-compresión
2. Recap siempre va a disco (no solo en respuesta)
3. Sobreescribir recap si es del mismo día
4. No incluir secrets en el recap (filtrar `AUTH_SECRET`, `STRIPE_*`, etc.)
5. No medir tokens exactos — usar estimaciones (~Xk)
