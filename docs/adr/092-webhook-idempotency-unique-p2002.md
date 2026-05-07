# ADR-092 — Idempotencia atómica de webhooks vía UNIQUE + P2002

- **Status:** Accepted
- **Date:** 2026-05-05
- **Deciders:** Brandon (owner), Architect agent
- **Tags:** webhooks, idempotency, billing, security

---

## Context

Buleje recibe webhooks de proveedores externos que pueden disparar
**efectos económicos irreversibles**: activación de plan SaaS, renovación
mensual, conciliación de pago, marcado de boleta como pagada, etc. Los
proveedores reintentan agresivamente:

- Mercado Pago: hasta 6 reintentos exponenciales si no recibe `200` <5s.
- Stripe: hasta 3 días de reintentos si responde 5xx.
- Twilio (WhatsApp): reintentos sobre el mismo `MessageSid`.

El patrón histórico en `mp-webhook` y `subscription_preapproval` era:

```ts
const existing = await prisma.X.findUnique({ where: { stripeId } });
if (existing) return ok();           // ← race window aquí
await prisma.X.upsert({ ... });      // dos requests entran a la vez
await activatePlan();                // → doble activación / doble cobro
```

Entre `findUnique` y `upsert` hay una **ventana de carrera**. Dos
notificaciones simultáneas del mismo `paymentId` (escenario habitual
cuando el servidor demora >5s y MP reintenta) ven `null`, ambas creen ser
las primeras, ambas activan el plan. Resultado observado el 2026-05-05:
posibilidad documentada de doble extensión de período (`+30 días × 2`).

## Decision

Adoptamos como **patrón canónico** para todos los webhooks externos:

```ts
const idempotencyKey = `mp_${dataId}`;          // o `stripe_${event.id}`
try {
  await prisma.stripeWebhookQueue.create({
    data: {
      stripeId: idempotencyKey,                  // UNIQUE en schema
      eventType: "mp.payment.processing",
      payload: JSON.stringify({ dataId }),
      attempts: 1,
      lastError: "",
      nextRetryAt: new Date(),
      processedAt: null,
    },
  });
} catch (err) {
  if ((err as { code?: string }).code === "P2002") {
    // Otro worker ya tomó el lock — duplicado
    return NextResponse.json({ received: true, duplicate: true });
  }
  throw err;
}

// ── procesamiento idempotente del evento ──
await processPayment(dataId);

// Marcar lock como completado
await prisma.stripeWebhookQueue.update({
  where: { stripeId: idempotencyKey },
  data: { processedAt: new Date() },
});
```

**Reglas:**

1. La columna usada como `idempotencyKey` debe tener `@unique` en
   `prisma/schema.prisma`. Postgres garantiza atomicidad del INSERT.
2. El catch específico de `P2002` es la **única forma correcta** de
   detectar lock tomado. No usar `findUnique` previo bajo ninguna
   circunstancia.
3. Tras procesar, hacer `update` con `processedAt = now()` para que un
   GET futuro pueda distinguir "procesando" vs "completado".
4. Si el procesamiento falla, dejar `processedAt = null` y `lastError`
   poblado — un cron de re-drive (`/api/cron/webhook-retry`) puede
   reintentar.

## Cuándo aplicar (scope)

| Provider | Endpoint | Key sugerida |
|---|---|---|
| Stripe | `/api/billing/webhook` | `stripe_${event.id}` |
| Mercado Pago | `/api/billing/mp-webhook` (payment) | `mp_${dataId}` |
| Mercado Pago | `/api/billing/mp-webhook` (subscription) | `mp_sub_${preapprovalId}_${event_ts}` |
| Twilio WhatsApp | `/api/whatsapp/webhook` | `wa_${MessageSid}` |
| Nubefact (futuro) | `/api/sunat/webhook` | `nube_${comprobante_serie_numero}` |
| Yape capture | `/api/whatsapp/yape-capture` | `yape_${MessageSid}` (ya existe) |

## Trade-offs / Consequences

**Positivo:**
- Atomicidad real garantizada por Postgres (no por código).
- Costo: 1 INSERT con UNIQUE check = ~0.5ms.
- El `stripeWebhookQueue` actúa también como audit log y dead-letter
  queue natural.

**Negativo:**
- Requiere `@unique` en la columna que sirva de idempotency key. La
  tabla `StripeWebhookQueue` ya lo tiene en `stripeId`, pero migraciones
  futuras a tablas dedicadas (ej. `MpWebhookQueue`) deben replicarlo.
- Un INSERT siempre tiene costo aunque sea duplicado. Para webhooks de
  alto volumen (>1000/s) se puede considerar Redis SETNX como capa L1
  delante. No es el caso de Buleje hoy.
- Si la transacción donde está el INSERT también modifica otras tablas y
  falla por otro motivo, el lock se libera (rollback). Para preservar el
  lock tras fallo, hacer el INSERT en transacción separada (es lo que
  hace `mp-webhook` hoy).

**Neutro:**
- Reusamos `StripeWebhookQueue` con prefijos (`mp_`, `wa_`) para evitar
  proliferación de tablas. Si llega a haber >5 proveedores, refactorizar
  a tabla `WebhookIdempotency` genérica.

## Alternatives considered

1. **Redis SETNX con TTL.** Más rápido pero introduce un punto de
   fallo: si Redis cae, idempotencia se pierde silenciosamente. Postgres
   es nuestra fuente de verdad para dinero.
2. **Mutex en proceso (`Map<string, Promise>`).** Inútil en serverless:
   Vercel Functions corren en instancias separadas.
3. **Advisory locks de Postgres (`pg_try_advisory_lock`).** Funciona,
   pero requiere raw SQL y el lock se libera al cerrar conexión — con
   pgBouncer en transaction mode esto rompe.
4. **`upsert` confiando en que es atómico.** No lo es para nuestro caso:
   solo es atómico para el row, no para el side-effect (`activatePlan`).
