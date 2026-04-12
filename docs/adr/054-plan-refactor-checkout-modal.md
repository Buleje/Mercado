# ADR-054 — Plan: romper CheckoutModal.tsx (119KB · 2018 líneas) en 8-12 módulos

**Fecha:** 2026-04-10
**Estado:** 📋 PLANNED · Esfuerzo L · **ZONA PELIGROSA** — `/audit-first checkout-flow` obligatorio · Bloque: Refactor · #06 del backlog

## Contexto
`components/CheckoutModal.tsx` es el archivo más crítico del proyecto. Hoy es:
- **2018 líneas** · **119 KB** · un único componente React
- Contiene el flujo completo: cart review → account → delivery → payment (Yape/PLIN/cash/Stripe/MP) → review → success
- Maneja: idempotency keys, cupones, geolocation, stock validation, recomposición de totales, fire-and-forget SUNAT/WhatsApp, state machine de pago implícita, BroadcastChannel multi-tab
- **Imposible de testear aisladamente**, debuggear o mantener. Bomba de tiempo.

Ya existe estructura parcial en `components/checkout/`:
- `CheckoutAccountStep.tsx`, `CheckoutDeliverySchedule.tsx`, `CheckoutNotesField.tsx`, `CheckoutOrderReview.tsx`, `CheckoutPaymentSection.tsx`, `CheckoutSuccessStep.tsx`
- Subcarpetas `parts/`, `steps/`, `hooks/`, `types.ts`, `index.ts`

**Paradoja**: los steps ya están extraídos pero `CheckoutModal.tsx` sigue monolítico. Hubo un refactor previo que no se completó.

## Decisión tentativa
Completar el refactor iniciado con patrón **State Machine + Dumb Components**:

```
components/checkout/
  CheckoutModal.tsx              (ORCHESTRATOR — <300 líneas, solo routing de steps)
  state/
    checkout-machine.ts          (XState v5 — ver ADR-050 pattern)
    checkout-context.tsx         (Provider del snapshot + actions)
    types.ts                     (ya existe)
  steps/
    step-account.tsx             (ya parcial)
    step-delivery.tsx
    step-payment.tsx
    step-review.tsx
    step-success.tsx
  payment-methods/
    YapePaymentPanel.tsx         (ya existe)
    PlinPaymentPanel.tsx         (ya existe)
    StripePaymentPanel.tsx       (nuevo)
    MercadoPagoPanel.tsx         (nuevo)
    CashPaymentPanel.tsx         (nuevo)
  hooks/
    use-checkout-totals.ts       (client preview, backend decide)
    use-coupon-validator.ts
    use-stock-check.ts
    use-geolocation.ts
    use-broadcast-sync.ts
  parts/                         (ya existe — dumb UI components)
```

## Plan de ejecución (5 sprints · ~30h)

### Sprint 1 — Audit obligatorio (4h)
- [ ] `/audit-first checkout-flow`
- [ ] Leer ADR-015 original del checkout
- [ ] Inventariar TODAS las responsabilidades del CheckoutModal actual → lista numerada
- [ ] Generar test-golden-snapshot de un checkout completo en staging (capturar request/response sequence)
- [ ] Decidir: ¿XState o Zustand store? Recomendación: XState para el flujo + Zustand para el cart

### Sprint 2 — Extraer state machine (6h)
- [ ] Crear `checkout-machine.ts` con los 5 estados: `account → delivery → payment → review → success`
- [ ] Eventos: `NEXT`, `BACK`, `SELECT_PAYMENT`, `APPLY_COUPON`, `SET_ADDRESS`, `SUBMIT`, `ERROR`
- [ ] Tests unitarios: 30+ transiciones
- [ ] NO integrar con UI aún — solo módulo paralelo

### Sprint 3 — Extraer payment-methods (8h)
- [ ] Un archivo por método de pago con interfaz común `PaymentMethodProps`
- [ ] Lazy load cada panel (dynamic import)
- [ ] Tests snapshot por método

### Sprint 4 — Convertir CheckoutModal en orchestrator (8h)
- [ ] Renderizar `<CurrentStep />` basado en `machine.value`
- [ ] Eliminar estado interno duplicado
- [ ] E2E Playwright: 10 escenarios (happy path + cada método + cancelación)

### Sprint 5 — Deprecación + QA (4h)
- [ ] Feature flag `CHECKOUT_V2_ENABLED` por tenant
- [ ] Canary: 5% → 25% → 100%
- [ ] Monitorear Sentry checkout error rate (SLO #1 > 99.5%)
- [ ] Borrar código viejo solo cuando 100% haya migrado 1 semana

## Riesgos CRÍTICOS
| Riesgo | Mitigación |
|---|---|
| Romper el checkout en prod → 0 ventas | Canary + feature flag + rollback <5min |
| Race condition en cupón + stock | XState `invoke` con services transaccionales |
| Pagos duplicados (double submit) | Idempotency key ya existe en `orders.db.ts` |
| Breakage en mobile (Capacitor) | E2E en Android emulator pre-merge |
| Pérdida del BroadcastChannel multi-tab | Hook dedicado `use-broadcast-sync.ts` con tests |

## Bloqueadores
- **security-pentester pre-merge obligatorio** (regla #14)
- **visual-qa-specialist** comparando screenshots antes/después por step
- **SLO #1 checkout success rate > 99.5%** monitoreo durante rollout

## Alternativas
- **Dejarlo como está** — deuda técnica compuesta. Imposible agregar nuevos métodos de pago sin romper algo.
- **Refactor parcial (solo extraer state machine)** — baja el riesgo pero no reduce el tamaño del archivo.
- **Reescritura desde cero** — mayor riesgo, descartado.

## Referencias
- `components/CheckoutModal.tsx` (2018 líneas)
- `components/checkout/*` (estructura parcial existente)
- ADR-015 Checkout original
- ADR-050 XState pattern (order-machine)
- Skill `checkout-flow`
- `/audit-first` skill obligatorio
