# Runbook: Webhooks Stripe perdidos

**Severity:** P1
**Owner:** SRE on-call (Brandon)
**SLA mitigacion:** 30 minutos (tenants afectados deben quedar activos antes de 1 hora)

---

## Sintomas (como lo detectas)

- Tenant paga en Stripe Dashboard (evento `customer.subscription.created` o `checkout.session.completed`) pero su plan sigue como `free` en el sistema
- Sentry muestra errores en `app/api/billing/webhook/route.ts`: `[webhook] Failed to process event` o `P2024` (DB timeout durante procesamiento del webhook)
- `prisma.stripeWebhookQueue` tiene registros con `processedAt: null` y `attempts > 0`
- Cron `webhook-replay` (4am diario en `app/api/billing/webhook-replay/route.ts`) fallo silenciosamente
- Cliente reporta: "pague y no me activaron el plan"
- Stripe Dashboard > Developers > Webhooks > tu endpoint muestra eventos con status `Failed` (HTTP 5xx o timeout)

---

## Diagnostico inmediato (3 comandos clave)

```bash
# 1. Verificar eventos no procesados en la queue interna
#    Expected en estado sano: 0 filas (o filas con processedAt != null)
#    Si hay filas con processedAt = null y nextRetryAt en el pasado -> hay un problema de replay
curl -s https://buleje.pe/api/health/deep \
  -H "Authorization: Bearer <CRON_SECRET>" | jq '.checks.webhookQueue'

# 2. Ejecutar replay manual del cron de webhook
#    Expected: {"replayed": N, "failed": 0, "total": N}
#    Si "failed" > 0 -> ver logs Sentry para el error especifico del procesamiento
curl -s https://buleje.pe/api/billing/webhook-replay \
  -H "Authorization: Bearer <CRON_SECRET>" | jq '.'

# 3. Ver los ultimos eventos en Stripe Dashboard
#    Abrir: https://dashboard.stripe.com/webhooks/<webhook-id>
#    Buscar eventos con status "Failed" o "Pending" en las ultimas 24 horas
#    Alternativa via CLI de Stripe (requiere stripe CLI instalado):
stripe events list --limit 20 2>&1 | grep -E "customer.subscription|checkout.session"
```

---

## Mitigacion (en orden de menor a mayor riesgo)

### 1. [low risk] Ejecutar replay manual inmediato

El cron `webhook-replay` corre a las 4am diariamente, pero se puede ejecutar en cualquier momento. Este es el primer paso ante cualquier webhook perdido:

```bash
# Replay manual — procesa hasta 10 eventos pendientes por llamada
# Repetir hasta que retorne {"replayed": 0} o {"total": 0}
curl -X GET https://buleje.pe/api/billing/webhook-replay \
  -H "Authorization: Bearer <CRON_SECRET>"

# Si hay muchos eventos pendientes, ejecutar varias veces:
for i in 1 2 3 4 5; do
  echo "--- Run $i ---"
  curl -s https://buleje.pe/api/billing/webhook-replay \
    -H "Authorization: Bearer <CRON_SECRET>" | jq '{replayed, failed, total}'
  sleep 2
done
```

**Logica de backoff:** `lib/stripe-webhook-queue.ts` usa delays de 1 min → 5 min → 15 min → 1h → 6h por intento. Si un evento tiene `nextRetryAt` en el futuro, el cron lo saltea. Para forzar replay inmediato del evento especifico, actualizar `nextRetryAt` directamente en DB (ver step 3).

### 2. [low risk] Verificar que CRON_SECRET este configurado

Si el replay retorna `401 Unauthorized`:

```bash
# Verificar que CRON_SECRET este en Vercel:
vercel env ls --environment production 2>&1 | grep CRON_SECRET

# Si no esta -> agregarlo en Vercel Dashboard > Settings > Environment Variables
# Valor: string aleatorio de 32+ caracteres
# Luego redeploy:
vercel deploy --prod --force
```

### 3. [medium risk] Forzar replay de evento especifico en Stripe Dashboard

Para un tenant especifico cuyo pago ya se proceso en Stripe pero no en Buleje:

1. Ir a [Stripe Dashboard](https://dashboard.stripe.com) > Developers > Webhooks
2. Seleccionar tu endpoint (`https://buleje.pe/api/billing/webhook`)
3. Ir a la tab "Recent deliveries"
4. Encontrar el evento fallido (ej. `checkout.session.completed`)
5. Click en el evento > "Resend" (boton de replay de Stripe)

**Verificacion de freshness (round 28):** El evento tiene timestamp `created`. Si tiene menos de 1 hora de antiguedad (`Date.now()/1000 - event.created < 3600`), el replay es seguro. Si es mas antiguo, verificar que el handler en `app/api/billing/webhook/route.ts` sea idempotente (usa `upsert`, es seguro).

### 4. [medium risk] Activar plan manualmente en DB

Si el replay sigue fallando y el cliente esta esperando (P0 para el cliente individual):

```bash
# PASO 1: Identificar el tenantId del cliente afectado
# Buscar en Supabase Dashboard > Table Editor > Tenant:
# - filtrar por email o slug del cliente

# PASO 2: Actualizar el plan directamente (requiere acceso DIRECT_URL)
# Ejecutar en Supabase Dashboard > SQL Editor:

UPDATE "Tenant"
SET
  "plan" = 'pro',                          -- o 'business' segun lo que pago
  "trialEndsAt" = NULL,
  "subscriptionStatus" = 'active',
  "stripeSubscriptionId" = '<stripe-sub-id>'  -- del Stripe Dashboard
WHERE id = '<tenant-id>';

# PASO 3: Marcar el evento en la queue como procesado para evitar doble activacion
UPDATE "StripeWebhookQueue"
SET "processedAt" = NOW()
WHERE "stripeId" = '<stripe-event-id>';
```

**ADVERTENCIA:** Hacer esto SOLO si el pago esta confirmado en Stripe Dashboard con status `paid`. Nunca activar plan sin confirmar el pago primero.

### 5. [medium risk] Revisar y reconfigurar el webhook endpoint en Stripe

Si el endpoint de Stripe apunta a una URL vieja (ej. preview deployment en lugar de produccion):

1. Stripe Dashboard > Developers > Webhooks
2. Verificar que el endpoint sea exactamente: `https://buleje.pe/api/billing/webhook`
3. Verificar que `STRIPE_WEBHOOK_SECRET` en Vercel coincida con el "Signing secret" del webhook en Stripe
4. Eventos habilitados minimos requeridos:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

```bash
# Si STRIPE_WEBHOOK_SECRET esta incorrecto, el handler retorna 400 y Stripe deja de reintentar
# Verificar en Vercel:
vercel env ls --environment production 2>&1 | grep STRIPE_WEBHOOK_SECRET
```

### 6. [high risk — last resort] Replay masivo de eventos historicos desde Stripe CLI

Si hay un outage prolongado y se perdieron muchos eventos de las ultimas horas:

```bash
# Requiere Stripe CLI instalado: https://stripe.com/docs/stripe-cli
stripe login

# Listar eventos de las ultimas 4 horas y hacer trigger manual
# PELIGROSO: puede causar duplicados si la logica no es idempotente
# El handler usa upsert/idempotency keys, deberia ser seguro
stripe events resend <event-id-1> <event-id-2> <event-id-3>
```

**Verificar idempotencia antes:** `app/api/billing/webhook/route.ts` usa `stripeId` como clave unica en `StripeWebhookQueue`. Los handlers de subscription usan `upsert`. Es seguro repetir.

---

## Escalation

| Tiempo sin resolver | Accion |
|---|---|
| 15 min | Si el replay manual no funciona, revisar Sentry para el error exacto del procesamiento |
| 30 min | Activar plan manualmente en DB (step 4) para no dejar al cliente sin servicio |
| 45 min | Abrir ticket Stripe Support si el endpoint no recibe eventos: [support.stripe.com](https://support.stripe.com) |
| 60 min | Si hay multiples tenants afectados, auditar todos los eventos fallidos en Stripe Dashboard |

**Contactos:**
- Stripe Support: [dashboard.stripe.com/support](https://dashboard.stripe.com/support) — incluir Event IDs y logs del webhook endpoint
- Para compensar al cliente: ofrecer 1 mes gratis del plan correspondiente

---

## Post-incident

- [ ] Archivar eventos fallidos de Stripe (exportar desde Stripe Dashboard > Developers > Events)
- [ ] Revisar Sentry: issues del tipo `[webhook]` en el periodo afectado
- [ ] Verificar que todos los tenants afectados quedaron con el plan correcto en DB
- [ ] Comprobar que el cron `webhook-replay` (4am) esta activo en Vercel: Settings > Cron Jobs
- [ ] Si el cron estaba deshabilitado: reactivarlo y documentar por que se desactivo
- [ ] Si el problema fue `STRIPE_WEBHOOK_SECRET` incorrecto: agregar validacion en `/api/health/deep` para detectarlo en startup
- [ ] Crear ADR si se necesita cambio arquitectural (ej. segundo endpoint de webhook para redundancia)
- [ ] Actualizar este runbook con el RCA y el tipo de evento que fallo

---

## Archivos relevantes

| Archivo | Rol |
|---|---|
| `app/api/billing/webhook/route.ts` | Handler principal de webhooks Stripe — verifica firma, procesa evento |
| `app/api/billing/webhook-replay/route.ts` | Cron endpoint que drena la queue de eventos fallidos |
| `lib/stripe-webhook-queue.ts` | Queue de eventos fallidos: `enqueueWebhookEvent`, `getPendingWebhookEvents`, `markWebhookProcessed` |
| `lib/billing/` | Logica de activacion de planes, suscripciones, trials |
| `prisma/schema.prisma` | Modelo `StripeWebhookQueue` — campos: `stripeId`, `eventType`, `payload`, `attempts`, `nextRetryAt`, `processedAt`, `lastError` |
| `lib/sentry-alerts.ts` | `reportCriticalError` — usado en replay para alertar fallos repetidos |
