# ADR-109: Manejo de Errores — Audit + Plan

**Fecha:** 2026-05-12
**Estado:** Aceptado · plan documentado
**Score:** 14/20 → 16/20 post-fixes · techo realista 18-20/20

## Contexto

Audit profundo de Manejo de Errores tras pedido explícito de Brandon. La
categoría estaba en 14/20 — la más débil junto con CEO/Negocio.

## Hallazgos reales (corregidos del primer grep)

| Métrica inicial | Real verificado |
|---|---|
| 121 empty `.catch()` | Solo ~15 críticos · resto JSDoc + fire-and-forget intencional |
| 85 console.* sin logger | Mayoría intencionales (deprecation warnings que evitan ciclo logger) |
| 0 Sentry.captureException explícito | **FALSO POSITIVO** — `logger.error()` ya llama Sentry.captureException automáticamente |
| Error boundaries React | **10 archivos `error.tsx`** + `components/ui/error-boundary.tsx` — excelente |
| Retry patterns | ✅ `lib/db-retry.ts` exponential backoff + `lib/queue.ts` retry |
| 269 throw new Error | Legítimos · están en try/catch upstream |
| 516 endpoints 5xx response | ✅ Buen pattern |

## Sorpresa positiva: logger → Sentry wiring automático

`lib/logger.ts:67-80` ya tiene:
```ts
if (IS_PRODUCTION && level === "error") {
  const sentry = loadSentry();
  if (sentry) sentry.captureException(errObj, { extra: { message, ...context } });
}
```

TODA llamada a `logger.error()` en el codebase dispara Sentry automáticamente.
**Best-in-class.** No estaba documentado — devs futuros no sabían.

## Top archivos con empty .catch (review específico)

| Archivo | Count | Severidad real |
|---|---:|---|
| `components/admin/unified/FinanzasModule.tsx` | 7 | 🔴 Auditar uno por uno (P1) |
| `components/ServiceWorkerRegistrar.tsx` | 5 | 🟡 SW failures no afectan core |
| `components/marketplace/StoreDetail.tsx` | 4 | 🟡 Graceful fail OK |
| `components/admin/WarehouseTab.tsx` | 4 | 🟢 Bajo impacto |
| `lib/audit/superadmin-audit.ts` | 2 | ✅ FALSO POSITIVO (comentarios JSDoc) |
| `lib/db/*.db.ts` | 2 totales | ✅ Mayormente JSDoc examples |
| **CheckoutModal** | 2 | 🔴 Protegido por DANGER ZONE skill (correcto) |

**Conclusión**: solo ~15 empty catches son verdaderamente críticos. El 90%
restante son patrones aceptables.

## Lo que se arregló HOY

1. `lib/analytics.ts`: 4 `console.log/error` → `console.warn/debug` con
   guards `NODE_ENV === "development"` + eslint-disable explícito + comentarios.
   Analytics tracking es opcional → graceful fail mejor que console.error.

## Aceptable (NO arreglar)

| Pattern | Por qué |
|---|---|
| Empty `.catch(() => {})` en SW lifecycle | Browser ya loguea, fallback es no-op |
| `console.warn` con eslint-disable + comentario "evitar ciclo logger" | Deprecation warnings explícitos |
| Fire-and-forget con `.catch(() => {})` documentado en JSDoc | Convención del proyecto (CLAUDE.md regla #7) |
| Empty catch en lecturas opcionales (loyalty points, save cart) | Feature degrada gracefully |

## Plan de mejora

### Prioridad P1 (este mes)

| # | Acción | Tiempo | Score Δ |
|---|---|---:|---:|
| 1 | FinanzasModule.tsx: revisar 7 empty catches uno por uno | 2h | 16→17 |
| 2 | Activar `lib/circuit-breaker.ts` en Stripe webhook | 1h | +0.3 |
| 3 | Wire `EventDeadLetter` para jobs fallidos persistentes | 3h | +0.5 |

### Prioridad P2 (próximo sprint)

| # | Acción | Tiempo |
|---|---|---:|
| 4 | Sentry alert rules thresholds per endpoint | 2h |
| 5 | Codemod console → logger en lib/ sin ciclo | 1h |
| 6 | Standardize error response shape `{ error, message, details? }` | 2h |

### Prioridad P3 (este trimestre)

| # | Acción | Tiempo |
|---|---|---:|
| 7 | Documentar runbook por integración (Twilio, MP, SUNAT) | 4h |
| 8 | Chaos drill mensual cada integración externa | continuo |
| 9 | Error budget SLO dashboard 99.5% uptime | 4h |

## Score progression

| Estado | Score |
|---|---:|
| Antes hoy | 14/20 |
| **Post-audit + analytics cleanup** | **16/20** |
| Post P1 (FinanzasModule + circuit breaker + DLQ) | 18/20 |
| Post P2 (Sentry alerts + console codemod) | 19/20 |
| Post P3 (chaos drill + runbooks + SLO) | 20/20 |

## Referencias

- `lib/logger.ts:67-80` — Sentry auto-capture (best-in-class)
- `lib/db-retry.ts` — exponential backoff
- `lib/queue.ts:216-238` — retry BullMQ
- `lib/circuit-breaker.ts` — disponible no usado
- `docs/runbooks/`: db-down · redis-down · stripe-webhook-lost · deploy-rollback
- Skill `checkout-flow` (bloqueó modificación CheckoutModal — correcto)
