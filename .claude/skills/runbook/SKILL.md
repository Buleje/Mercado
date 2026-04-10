---
name: runbook
description: |
  Ejecuta runbooks operacionales ante incidentes. Lee el runbook,
  ejecuta diagnóstico automático, aplica mitigación, reporta resultado.
  Usar cuando haya un incidente, error en prod, o Brandon diga
  "checkout caído", "redis down", "SUNAT no funciona", "runbook",
  "incidente", "qué hago si se cae X".
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Agent, WebFetch
argument-hint: "[checkout-down|db-connections-saturated|sunat-api-failing|whatsapp-rate-limited|tenant-isolation-breach|redis-down|stripe-webhook-failing|disk-space-low]"
model: opus
---

# Runbook Executor — Respuesta a incidentes automatizada

## Algoritmo

```
1. Recibir nombre del incidente
2. Buscar runbook en runbooks/[incidente].md
3. Si no existe → sugerir crear uno nuevo
4. Leer runbook completo
5. Ejecutar sección "Diagnóstico" paso a paso
6. Reportar hallazgos
7. Si el diagnóstico confirma el problema:
   a. Ejecutar sección "Mitigación inmediata"
   b. Verificar que la mitigación funcionó
   c. Si funcionó → reportar éxito + log
   d. Si no funcionó → escalar a Brandon con análisis pre-hecho
8. Guardar log en logs/runbooks/YYYY-MM-DD-[incidente].md
9. Notificar vía WhatsApp (MCP Bodega) si es P0/P1
```

## Runbooks disponibles

| Runbook | Severidad | SLO afectado |
|---------|-----------|--------------|
| checkout-down | P0 | checkout_success_rate |
| db-connections-saturated | P0 | api_p99_latency |
| tenant-isolation-breach | P0 MÁXIMO | TODOS |
| sunat-api-failing | P1 | boleta_sunat_success |
| stripe-webhook-failing | P1 | checkout_success_rate |
| redis-down | P1 | api_p99_latency |
| whatsapp-rate-limited | P2 | whatsapp_delivery |
| disk-space-low | P2 | api_p99_latency |

## Reglas

1. **P0 = actuar INMEDIATAMENTE** sin esperar confirmación.
2. **tenant-isolation-breach = modo crisis** — notificar a Brandon, preservar evidencia.
3. **Siempre logear** cada paso ejecutado en `logs/runbooks/`.
4. **Nunca ejecutar resolución completa sin aprobación** — solo mitigación.
5. **Si no hay runbook para el incidente**, proponer crear uno.
