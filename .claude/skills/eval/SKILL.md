---
name: eval
description: |
  Corre evaluaciones automáticas sobre zonas críticas del código.
  Prerequisito del Sentry auto-fix loop: sin evals, no se auto-repara.
  Zonas: checkout, fiado, sunat, multi-tenant.
  Usar cuando Brandon diga "corre evals", "evalúa checkout", "eval",
  "test de zona roja", o automáticamente antes de auto-fixes.
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "[checkout | fiado | sunat | multi-tenant | all]"
model: sonnet
---

# Eval — Evaluación de zonas críticas

Score 0-100 por eval, timeout 30s, input fijo (no random).

## Zonas y estructura

| Zona | Evals | Foco |
|---|---|---|
| `checkout/` | 10 | CheckoutModal: cart-total, coupon, yape, idempotency... |
| `fiado/` | 5 | Score crediticio, plan de pago |
| `sunat/` | 5 | Boleta, XML generation |
| `multi-tenant/` | 5 | Aislamiento, cross-tenant query |
| `runner.ts` | — | Orquestador |

## Subcomandos

### `/eval [zona]`

1. Identificar zona (checkout | fiado | sunat | multi-tenant)
2. Buscar `evals/[zona]/*.eval.ts`
3. Por cada eval: ejecutar (timeout 30s), capturar score/tiempo/pass-fail
4. Si falla: logear expected vs actual
5. Reportar tabla de resultados

### `/eval all`

Ejecuta todas las zonas en secuencia.

## Formato eval (vitest)

```typescript
// evals/checkout/01-cart-total.eval.ts
import { describe, it, expect } from 'vitest'
describe('Eval: Cart Total', () => {
  it('calculates total with 3 items', () => {
    // Score: 100 si pasa, 0 si falla | Timeout: 30s
    expect(calculateTotal(items)).toBe(expected)
  })
})
```

## Integración con auto-fix

1. `/eval [zona]` -> capturar `score_antes`
2. Aplicar fix
3. `/eval [zona]` -> capturar `score_despues`
4. `score_despues < score_antes - 5` -> **ROLLBACK**
5. `score_despues >= score_antes` -> **ACEPTAR**

## Salida

Tabla: `# | Eval | Score | Tiempo | Estado` + score total + detalles de fallos.

## Reglas

1. **Input fijo por eval** — no random, no dynamic
2. **Timeout 30s** — si excede, score = 0
3. **Score baja >5% = bloquear merge** (cuando integrado en CI)
4. **No modificar evals para que pasen** — el eval es la verdad
5. **Agregar evals ANTES de features nuevas** (eval-driven development)

## Referencia

- Agente: `sre-observability` — requiere evals antes de auto-fix
- Agente: `qa-reliability-engineer` — valida evals
- ADR-027 (futuro): Eval-driven self-healing
