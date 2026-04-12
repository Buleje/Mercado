---
name: slo-status
description: Shows current SLO status, error budgets, and burn rates for Buleje
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "[name|all|checkout_success_rate|api_p99_latency|boleta_sunat_success|whatsapp_delivery]"
model: haiku
---

# /slo-status — SLO Error Budget Dashboard

Muestra el estado actual de los SLOs, error budgets y burn rates.

## Algoritmo

### 1. Leer configuracion SLO

```bash
cat ${CLAUDE_PROJECT_DIR}/slo/slo.yaml
```

Parsear los 4 SLOs definidos:
- `checkout_success_rate` (target: 99.5%, 30d)
- `api_p99_latency` (target: 99.9%, 7d)
- `boleta_sunat_success` (target: 99.9%, 30d)
- `whatsapp_delivery` (target: 98%, 30d)

### 2. Obtener metricas actuales

Intentar leer metricas reales:

```bash
cat ${CLAUDE_PROJECT_DIR}/slo/current-metrics.json 2>/dev/null
```

Si no existe el archivo de metricas, usar valores simulados (at-target) y marcar como "(simulated)".

### 3. Calcular burn rate para cada SLO

Para cada SLO:
- `budgetTotal = 1 - target` (ej: 0.005 para 99.5%)
- `budgetBurned = max(0, (target - current) / budgetTotal)`
- `burnRatePercent = budgetBurned * 100`
- `daysRemaining = floor(window_days * (1 - burnRatePercent / 100))`

Clasificar status:
- `burnRate < 50%` -> healthy
- `50% <= burnRate < 90%` -> warning
- `90% <= burnRate < 100%` -> critical
- `burnRate >= 100%` -> exhausted

### 4. Filtrar por argumento

Si el argumento es un nombre especifico de SLO, mostrar solo ese.
Si es "all" o vacio, mostrar todos.

### 5. Mostrar tabla de resultados

Formato de salida obligatorio:

```
## SLO Error Budget Dashboard

| SLO | Target | Current | Budget Burned | Days Left | Status |
|-----|--------|---------|---------------|-----------|--------|
| checkout_success_rate | 99.5% | 99.5% | 0.0% | 30d | healthy |
| api_p99_latency | 99.9% | 99.9% | 0.0% | 7d | healthy |
| boleta_sunat_success | 99.9% | 99.9% | 0.0% | 30d | healthy |
| whatsapp_delivery | 98.0% | 98.0% | 0.0% | 30d | healthy |

Deploy gate: OPEN (all budgets within safe range)
```

### 6. Deploy gate status

Si algun SLO tiene `burnRate >= 90%`:
```
Deploy gate: BLOCKED — [nombre_slo] at [X]% burned
```

Si todos estan OK:
```
Deploy gate: OPEN (all budgets within safe range)
```

### 7. Recomendaciones

Si hay SLOs en warning o critical, agregar seccion de recomendaciones:

| SLO | Recomendacion | Owner |
|-----|---------------|-------|
| [nombre] | [accion sugerida] | [owner_agent] |

## Reglas

- NO bloquear si no hay datos — mostrar "(simulated)" y recomendar configurar OTEL/Sentry
- Siempre mostrar los 4 SLOs aunque solo se pida uno (el pedido resaltado)
- Ref: ADR-034 (SLOs Operational Contract)
