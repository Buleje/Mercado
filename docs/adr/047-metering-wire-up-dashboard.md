# ADR 047 — Billing Metering Wire-Up + Admin Dashboard

**Estado:** Propuesto — cierra ADR-044
**Fecha:** 2026-04-10
**Autor:** Claude (arquitecto de soluciones) — sesion Sprint 2 wave 3
**Sprint:** 2 (AI + WhatsApp + Growth)
**Tier S item:** #8 — conecta metering de ADR-044 a los hot paths reales

---

## Contexto

ADR-044 entrego `lib/billing/metering.ts` con `recordUsageEvent()` y `getMeteredUsage()`. Los tests pasan. Pero los hot paths del negocio NO estan instrumentados:

- Cada venta completada → NO registra `order.created`
- Cada llamada al LLM recommender → NO registra `ai.recommend`
- Cada mensaje WhatsApp enviado → NO registra `whatsapp.sent`
- Cada emision SUNAT (ADR-045) → NO registra `sunat.emitted`
- Cada export de datos → NO registra ningún evento

Sin esta instrumentacion, el billing por uso es invisible — no se puede cobrar por lo que no se mide.

**El problema del dirty tree:** los hot paths viven en archivos modificados: `app/api/sales/route.ts`, `app/api/sales/[id]/route.ts`, `lib/db/orders.db.ts`. No se pueden tocar.

**Solucion:** aplicar el mismo patron observer usado en ADR-045 — un event bus propio en `lib/billing/wire-up/` que los nuevos archivos emiten, sin modificar los archivos dirty.

## Decision

Implementar un **Metering Event Bus** en `lib/billing/wire-up/` con tres componentes:

1. **Event emitter singleton** (`metering-bus.ts`) — cualquier nuevo codigo puede emitir eventos sin acoplar a los archivos dirty
2. **Listeners** (`metering-listeners.ts`) — escuchan el bus y llaman `recordUsageEvent()`
3. **Middleware para AI Gateway** (`ai-metering-middleware.ts`) — intercepta llamadas LLM y registra tokens

Para los hot paths en dirty tree, la solucion es **endpoint proxy**: un `POST /api/billing/wire-up/sales-hook` que recibe saleId + tenantId y registra el evento. Este endpoint se llama desde `app/api/sunat/emit-on-sale/route.ts` (ADR-045) y desde cualquier nuevo handler de ventas.

Para los callers LLM: la libreria `lib/ai/provider.ts` no esta en dirty tree — verificar y si esta limpia, agregar el emit ahi. Si esta en dirty tree, crear un wrapper `lib/ai/metered-provider.ts`.

### Esquema de eventos de metering

```ts
// lib/billing/wire-up/types.ts

export const METERED_EVENT_SOURCES = [
  "sale.completed",        // → recordUsageEvent("order.created", 1)
  "ai.llm.call",           // → recordUsageEvent("ai.call", tokens)
  "ai.recommend.call",     // → recordUsageEvent("ai.recommend", 1)
  "ai.insight.call",       // → recordUsageEvent("ai.insight", 1)
  "whatsapp.message.sent", // → recordUsageEvent("whatsapp.sent", 1)
  "sunat.invoice.emitted", // → recordUsageEvent("sunat.emitted", 1)
  "export.triggered",      // → recordUsageEvent("storage.blob", sizeKb)
  "sms.sent",              // → recordUsageEvent("sms.sent", 1)
] as const;

export type MeteringEventSource = typeof METERED_EVENT_SOURCES[number];

export interface MeteringBusEvent {
  source: MeteringEventSource;
  tenantId: string;
  amount: number;
  idempotencyKey?: string;  // saleId | messageId | invoiceId
  metadata?: Record<string, unknown>;
}
```

### Archivos nuevos (rutas NUEVAS — no dirty)

| Archivo | Proposito |
|---------|-----------|
| `lib/billing/wire-up/types.ts` | Tipos del event bus y esquema de eventos |
| `lib/billing/wire-up/metering-bus.ts` | EventEmitter singleton con `emit()` y `on()` wrapeados |
| `lib/billing/wire-up/metering-listeners.ts` | Registra listeners que llaman `recordUsageEvent()` |
| `lib/billing/wire-up/ai-metering-middleware.ts` | Wrapper para LLM calls que cuenta tokens |
| `lib/billing/wire-up/quota-alerts.ts` | Logica de alertas al superar N% del quota |
| `lib/billing/wire-up/usage-tiers.ts` | Define tiering: Free / Starter / Pro / Enterprise |
| `app/api/billing/wire-up/sales-hook/route.ts` | POST interno — recibe saleId y emite al bus |
| `app/api/billing/wire-up/ai-hook/route.ts` | POST interno — recibe tokens usados y emite |
| `app/api/cron/meter-to-stripe/route.ts` | Cron diario — reporta agregado a Stripe |
| `app/api/cron/quota-alerts/route.ts` | Cron horario — revisa quotas y envia alertas |
| `components/admin/unified/MeteringCard/MeteringCard.tsx` | Card de metering por tenant para dashboard admin |
| `components/admin/unified/MeteringCard/MeteringChart.tsx` | Grafico de uso por tipo (recharts) |
| `components/admin/unified/MeteringCard/QuotaProgressBar.tsx` | Barra de progreso por categoria |
| `components/admin/unified/MeteringCard/index.ts` | Barrel export |
| `__tests__/metering-bus.test.ts` | Unit tests del bus (emit, listeners, idempotency) |
| `__tests__/metering-wire-up.test.ts` | Integration tests de los hooks endpoints |
| `__tests__/quota-alerts.test.ts` | Tests de alertas (trigger en 80%, 100%) |

### Usage-based tiering (`lib/billing/wire-up/usage-tiers.ts`)

```ts
export const USAGE_TIERS = {
  free: {
    "order.created":    { limit: 100,   alertAt: 0.8 },
    "ai.call":          { limit: 50,    alertAt: 0.8 },
    "ai.recommend":     { limit: 200,   alertAt: 0.8 },
    "whatsapp.sent":    { limit: 500,   alertAt: 0.8 },
    "sunat.emitted":    { limit: 0,     alertAt: 1.0 }, // bloqueado en free
  },
  starter: {
    "order.created":    { limit: 1000,  alertAt: 0.8 },
    "ai.call":          { limit: 500,   alertAt: 0.8 },
    "ai.recommend":     { limit: 2000,  alertAt: 0.9 },
    "whatsapp.sent":    { limit: 5000,  alertAt: 0.8 },
    "sunat.emitted":    { limit: 500,   alertAt: 0.9 },
  },
  pro: {
    "order.created":    { limit: 10000, alertAt: 0.9 },
    "ai.call":          { limit: 5000,  alertAt: 0.9 },
    "ai.recommend":     { limit: 20000, alertAt: 0.9 },
    "whatsapp.sent":    { limit: 50000, alertAt: 0.9 },
    "sunat.emitted":    { limit: 5000,  alertAt: 0.9 },
  },
  enterprise: {
    // Sin limites — solo alertas de costo USD
    "order.created":    { limit: Infinity, alertAt: 1.0 },
    // ...todos los eventos: Infinity
  },
} as const;
```

### Quota alerts (`lib/billing/wire-up/quota-alerts.ts`)

Cuando `usage / limit >= alertAt`:

1. **Email via Resend** → `POST https://api.resend.com/emails` con resumen de uso
2. **WhatsApp fallback** → si `WHATSAPP_STAFF_PHONE` configurado y el email falla, envia mensaje al dueno
3. **ActivityLog** → siempre, fire-and-forget

```ts
// Pseudo — referencia para implementacion
async function checkAndAlert(tenantId: string, event: MeteredEvent, currentUsage: number) {
  const tier = await getTenantTier(tenantId); // libre, starter, pro
  const limits = USAGE_TIERS[tier][event];
  if (currentUsage / limits.limit >= limits.alertAt) {
    await sendQuotaAlert(tenantId, event, currentUsage, limits.limit).catch(() => {});
  }
}
```

### MeteringCard para admin dashboard

`MeteringCard.tsx` llama `GET /api/billing/meter` (endpoint existente de ADR-044) y muestra:

- Uso del mes por categoria (tabla + barra de progreso)
- Costo USD estimado basado en pricing
- Alerta visual si alguna categoria supera el 80% del quota
- Boton "Upgrade plan" si es free o starter

El componente usa `"use cache"` con `cacheLife({ revalidate: 60, stale: 120 })` para no golpear la DB en cada render del dashboard.

### Cron de reporte a Stripe (`app/api/cron/meter-to-stripe/route.ts`)

Si el tenant tiene `STRIPE_CUSTOMER_ID` configurado, el cron diario:
1. Llama `getMeteredUsage(tenantId, "month")` para cada tenant activo
2. Reporta el delta (uso de las ultimas 24h) a Stripe Billing via `stripe.billing.meterEvents.create()`
3. Loggea el resultado en `ActivityLog`

Protegido con `CRON_SECRET` header (ya definido en CLAUDE.md).

## DAG de dependencias entre archivos

```
lib/billing/wire-up/types.ts
  └── lib/billing/wire-up/metering-bus.ts              ← singleton
        └── lib/billing/wire-up/metering-listeners.ts  ← registra en startup
        └── lib/billing/wire-up/quota-alerts.ts
              └── lib/billing/wire-up/usage-tiers.ts
  └── lib/billing/wire-up/ai-metering-middleware.ts
  └── app/api/billing/wire-up/sales-hook/route.ts      ← llamado desde ADR-045 emit-on-sale
  └── app/api/billing/wire-up/ai-hook/route.ts
  └── app/api/cron/meter-to-stripe/route.ts
  └── app/api/cron/quota-alerts/route.ts
lib/billing/metering.ts [ADR-044, no modificar]
  └── lib/billing/wire-up/metering-listeners.ts        ← importa recordUsageEvent
components/admin/unified/MeteringCard/
  ← GET /api/billing/meter [ADR-044, no modificar]
```

### Relacion con ADR-045 (SUNAT)

`app/api/sunat/emit-on-sale/route.ts` (ADR-045) llama a `POST /api/billing/wire-up/sales-hook` despues de emitir el evento SUNAT. Esto garantiza que cada venta que genera comprobante tambien genera un evento de metering `order.created`. No hay acoplamiento directo — es una llamada HTTP entre dos modulos nuevos.

## Tests

| Tipo | Archivo | Casos cubiertos |
|------|---------|-----------------|
| Unit | `metering-bus.test.ts` | emit multiple listeners, idempotency 60min window, listener error no crash bus |
| Integration | `metering-wire-up.test.ts` | POST sales-hook registra order.created, POST ai-hook registra tokens, endpoint sin tenantId rechazado |
| Unit | `quota-alerts.test.ts` | alert a 80% free tier, no alert a 70%, alert a 100% bloquea (enterprise no alerta) |

## Alternativas evaluadas

1. **Modificar los hot paths directamente** (sales/route.ts, orders.db.ts) — descartado: archivos en dirty tree. Ademas, mezclar billing con logica de negocio viola SRP.
2. **BullMQ queue para todos los eventos** — descartado: overhead para ADR inicial. El EventEmitter en-proceso es suficiente; migrar a BullMQ cuando se necesite durabilidad entre reinicios.
3. **Stripe Billing solamente** — descartado: necesitamos agregacion local antes de reportar a Stripe, para manejar reintentos, idempotency y dashboard interno.

## Consecuencias

### Positivas
- Metering conectado a hot paths sin tocar archivos dirty
- Usage-based billing habilitado con tiering claro
- Dashboard admin muestra uso real en tiempo real (cache 60s)
- Alertas de quota via email + WhatsApp antes de que el tenant se quede sin cuota
- Cron de reporte a Stripe habilita el modelo "5x ARPU" del roadmap

### Negativas / riesgos
- El pattern de "endpoints proxy" para hot paths es deuda tecnica — cuando el tree este limpio, refactorizar a emits directos
- Si el cron de Stripe falla, el reporte se pierde (mitigacion: retry en el cron con `ActivityLog` como buffer)
- El dashboard card es el primer usuario de `getMeteredUsage()` a escala — monitorear que el query no supere 100ms con el indice compuesto recomendado en ADR-044

### Seguridad
- `sales-hook` y `ai-hook` son endpoints internos — proteger con `INTERNAL_API_SECRET` header o solo aceptar desde `localhost`
- `meter-to-stripe/route.ts` verificado con `CRON_SECRET` (regla CLAUDE.md)
- `tenantId` siempre del session server-side, nunca del body del request

## Variables de entorno requeridas

```env
# Heredadas de ADR-044 (ya definidas):
# DATABASE_URL, AUTH_SECRET

# Nuevas:
RESEND_API_KEY="re_..."                 # Para emails de quota alert
WHATSAPP_STAFF_PHONE="51XXXXXXXXX"      # Fallback WA para alertas (opcional)
STRIPE_SECRET_KEY="sk_live_..."         # Para meter-to-stripe cron
INTERNAL_API_SECRET="int_..."           # Protege hooks internos
```

## Fases de implementacion

| Fase | Archivos | Tiempo estimado |
|------|----------|-----------------|
| 1 — Event Bus | `types.ts`, `metering-bus.ts`, `metering-listeners.ts` | 1h |
| 2 — Hook endpoints | `sales-hook/route.ts`, `ai-hook/route.ts`, `ai-metering-middleware.ts` | 1h |
| 3 — Quota + Tiers | `usage-tiers.ts`, `quota-alerts.ts`, `cron/quota-alerts/route.ts` | 1.5h |
| 4 — Stripe cron | `cron/meter-to-stripe/route.ts` | 1h |
| 5 — Admin UI | `MeteringCard/` (4 archivos) | 2h |
| 6 — Tests | Los 3 archivos de test | 1.5h |

**Agente delegado:** `backend-platform-engineer` para fases 1-4. `frontend-engineer` para fase 5. `test-writer` para fase 6.

## Referencias

- `lib/billing/metering.ts` — ADR-044, base (no modificar)
- `app/api/billing/meter/route.ts` — endpoint existente (no modificar)
- `app/api/sunat/emit-on-sale/route.ts` — ADR-045 (llama sales-hook)
- ADR 044 — Billing Metering via ActivityLog (prerequisito)
- ADR 045 — SUNAT NubeFact (emite sunat.emitted al bus)
- ADR 016 — plan maestro (Tier S #8 — 5x ARPU)
- CLAUDE.md reglas #3 (tenantId), #5 (invalidar cache tras writes), #7 (fire-and-forget alertas), #9 (requireAdmin)

---

## Estado de implementacion (2026-04-17)

**Estado:** IMPLEMENTADO — Sprint 2 Tier S #8 cerrado.

### Hot paths wired al MeteringBus

| Hot path | Archivo | Evento emitido | Idempotency key |
|---|---|---|---|
| Recommender hibrido | `app/api/recommender/hybrid/route.ts` | `ai.recommend.call` | `rec:{tenantId}:{productId}:{minuteBucket}` |
| WhatsApp Concierge | `app/api/whatsapp/concierge/route.ts` | `whatsapp.message.sent` | `wa:{tenantId}:{phone}:{timestamp}` |
| SUNAT emision aceptada | `app/api/sunat/emit/route.ts` | `sunat.invoice.emitted` | `{invoice.id}` |
| Daily insights cron | `app/api/cron/daily-summary/route.ts` | `ai.insight.call` | `insight:{tenantId}:{yyyy-mm-dd}` |

**Regla de emision:** todos los hot paths usan patron fire-and-forget sin `await`. Un fallo del bus nunca bloquea la respuesta al usuario (CLAUDE.md regla #7).

### Cron reporte a Stripe

`app/api/cron/meter-to-stripe/route.ts` (nuevo) usa el modelo moderno de Stripe **Billing Meters** (api `stripe.billing.meterEvents.create`), no los ya deprecados `subscription_items.createUsageRecord`.

- Consulta `tenant.stripeCustomerId` y agrega uso mensual via `getMeteredUsage`
- Mapea `MeteredEvent` a un `event_name` de Stripe meter via env vars `STRIPE_METER_<EVENT>` (8 eventos soportados)
- Crea meter events con payload `{ stripe_customer_id, value }` y `identifier` por `tenant:event:yyyy-mm`
- Stripe garantiza unicidad del identifier en ventana 24h → reintentos no duplican facturacion
- Query param `?dryRun=1` para verificacion en staging sin facturar
- Si `meterEvents.create` falla para un evento, los demas siguen procesandose
- Vercel cron sugerido: `"0 3 * * *"` (03:00 UTC, tras rollup de 02:00)

### Tests nuevos (2026-04-17)

- `__tests__/metering-wiring-hot-paths.test.ts` — 3/3 verde (wiring recommender)
- `__tests__/cron-meter-to-stripe.test.ts` — 8/8 verde (auth, dryRun, idempotencyKey, amount 0, items sin mapear)

**Tests previos que siguen verde:** `metering-wire-up-bus.test.ts` (5/5), `billing-metering.test.ts` (8/8).

### Env vars nuevas requeridas en prod

| Variable | Proposito |
|---|---|
| `STRIPE_METER_AI_RECOMMEND` | event_name del Stripe meter para recommender |
| `STRIPE_METER_AI_CALL` | Idem LLM generico |
| `STRIPE_METER_AI_INSIGHT` | Idem AI insights |
| `STRIPE_METER_WHATSAPP_SENT` | Idem WhatsApp outbound |
| `STRIPE_METER_SUNAT_EMITTED` | Idem SUNAT |
| `STRIPE_METER_ORDER_CREATED` | Idem pedidos |
| `STRIPE_METER_SMS_SENT` | Idem SMS |
| `STRIPE_METER_STORAGE_BLOB` | Idem storage |

Si una env var esta ausente el cron simplemente no reporta ese evento — no falla.

### Acciones manuales pendientes para Brandon

1. Crear 8 Meters en Stripe Dashboard (Billing → Meters → Create) con `customer_mapping.event_payload_key = "stripe_customer_id"` y `value_settings.event_payload_key = "value"`.
2. Crear un price recurring+metered por meter y asociarlo a la suscripcion del tenant.
3. Copiar los `event_name` de cada meter a env vars en Vercel (prod + preview).
4. Agregar cron en `vercel.json`:
   ```json
   {"path": "/api/cron/meter-to-stripe", "schedule": "0 3 * * *"}
   ```
5. Staging: correr `/api/cron/meter-to-stripe?dryRun=1` con `Authorization: Bearer $CRON_SECRET` para verificar resultados sin facturar.
