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

Sistema de evaluación para zonas rojas del código. Cada eval tiene input fijo,
output esperado, score 0-100, y tiempo máximo 30 segundos.

## Estructura de evals

```
evals/
├── checkout/         (10 evals — CheckoutModal 119KB)
│   ├── 01-cart-total.eval.ts
│   ├── 02-coupon-apply.eval.ts
│   ├── 03-yape-flow.eval.ts
│   ├── ...
│   └── 10-idempotency.eval.ts
├── fiado/            (5 evals — score crediticio)
│   ├── 01-credit-score.eval.ts
│   ├── ...
│   └── 05-payment-plan.eval.ts
├── sunat/            (5 evals — boleta)
│   ├── 01-boleta-format.eval.ts
│   ├── ...
│   └── 05-xml-generation.eval.ts
├── multi-tenant/     (5 evals — aislamiento)
│   ├── 01-tenant-isolation.eval.ts
│   ├── ...
│   └── 05-cross-tenant-query.eval.ts
└── runner.ts         (orquestador)
```

## Subcomandos

### `/eval [zona]`

```
1. Identificar zona (checkout | fiado | sunat | multi-tenant)
2. Buscar archivos eval en evals/[zona]/*.eval.ts
3. Para cada eval:
   a. Ejecutar con timeout de 30s
   b. Capturar: score (0-100), tiempo, pass/fail
   c. Si falla: logear diferencia exacta (expected vs actual)
4. Reportar tabla de resultados
```

### `/eval all`

Ejecuta todas las zonas en secuencia.

## Formato de un eval

```typescript
// evals/checkout/01-cart-total.eval.ts
import { describe, it, expect } from 'vitest'

describe('Eval: Cart Total Calculation', () => {
  it('should calculate total correctly with 3 items', () => {
    const items = [
      { price: 10.50, quantity: 2 },
      { price: 5.00, quantity: 1 },
      { price: 8.75, quantity: 3 }
    ]
    const expected = 52.25 // (10.50*2) + (5.00*1) + (8.75*3)
    const result = calculateTotal(items)
    expect(result).toBe(expected)
  })

  // Score: 100 si pasa, 0 si falla
  // Tiempo máximo: 30s
})
```

## Integración con auto-fix

```
ANTES de cualquier auto-fix en zona roja:
1. /eval [zona] → capturar score_antes
2. Aplicar fix
3. /eval [zona] → capturar score_despues
4. Si score_despues < score_antes - 5 → ROLLBACK
5. Si score_despues >= score_antes → ACEPTAR
```

## Formato de salida

```markdown
## 🧪 Eval Report — [zona] — [fecha]

| # | Eval | Score | Tiempo | Estado |
|---|---|---|---|---|
| 01 | cart-total | 100 | 0.3s | ✅ |
| 02 | coupon-apply | 85 | 1.2s | ⚠️ |
| 03 | yape-flow | 0 | 0.1s | ❌ |

### Score total: 62/100

### Detalles de fallos
**03-yape-flow:** Expected QR URL format, got null
```

## Reglas

1. **Cada eval DEBE tener input fijo** — no random, no dynamic.
2. **Timeout 30s por eval** — si excede, score = 0.
3. **Score baja >5% = bloquear merge** (cuando integrado en CI).
4. **No modificar evals para que pasen** — el eval es la verdad.
5. **Agregar evals ANTES de features nuevas** (eval-driven development).

## Referencia

- Agente: `sre-observability` — requiere evals antes de auto-fix
- Agente: `qa-reliability-engineer` — valida evals
- ADR-027 (futuro): Eval-driven self-healing
