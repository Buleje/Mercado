# PostHog Funnels — Config dashboard (round 28+)

> **Para Brandon:** este doc tiene los pasos exactos para crear dos funnels en
> el dashboard de PostHog. No requiere código nuevo (los eventos ya se emiten
> via `lib/analytics.ts → trackEvent`). Solo configuración en
> `https://us.i.posthog.com/project/376984/insights`.

Última actualización: 2026-05-09 · Sprint AI/DevOps round 28+
Project ID: `376984` (Default project, Buleje Sy org).

---

## Índice

1. [Funnel 1 — Checkout step-by-step](#funnel-1--checkout-step-by-step)
2. [Funnel 2 — Vendor onboarding](#funnel-2--vendor-onboarding)
3. [HogQL queries — drop-off analysis](#hogql-queries--drop-off-analysis)
4. [Eventos faltantes — acción requerida](#eventos-faltantes--accion-requerida)
5. [Dashboard recomendado](#dashboard-recomendado)

---

## Funnel 1 — Checkout step-by-step

**Objetivo:** medir dónde se cae el cliente entre abrir carrito y confirmar
pedido. Drop-off típico esperado: 60-70% entre `add_to_cart` y `purchase`. Si
es peor, hay fricción.

### Pasos del funnel

| # | Evento | Estado actual | Properties relevantes |
|---|---|---|---|
| 1 | `add_to_cart` | **Existe** (`lib/analytics.ts:244`) | `currency`, `value`, `items` |
| 2 | `begin_checkout` | **Existe** (`lib/analytics.ts:292`) | `currency`, `value`, `coupon` |
| 3 | `checkout_step_account` | **FALTA** | `step:1` |
| 4 | `checkout_step_address` | **FALTA** | `step:2`, `district` |
| 5 | `checkout_step_payment` | **FALTA** | `step:3`, `payment_method` |
| 6 | `purchase` | **Existe** (Google Analytics format) | `transaction_id`, `value`, `currency` |

### Setup en PostHog UI

1. **Insights → New Insight → Funnels**
2. **Steps:**
   - Step 1: `add_to_cart`
   - Step 2: `begin_checkout`
   - Step 3: `checkout_step_account`
   - Step 4: `checkout_step_address`
   - Step 5: `checkout_step_payment`
   - Step 6: `purchase`
3. **Conversion window:** `1 day` (el cliente puede dejar el carrito y volver)
4. **Filter by:** `tenant_id` (property) — para comparar bodegas
5. **Breakdown:** opcional por `payment_method` para ver si Yape vs efectivo
   tienen drop-off distinto.
6. **Save** as `Checkout funnel — global`.

### Cómo interpretar

| Drop-off entre | Diagnóstico probable | Acción |
|---|---|---|
| `add_to_cart` → `begin_checkout` | Carrito flotante no convence o costo de envío shock | Mostrar costo envío antes de checkout |
| `begin_checkout` → `step_account` | Form de cuenta intimida (registro forzoso?) | Permitir checkout guest |
| `step_account` → `step_address` | Ubigeo Perú confuso o lento | Auto-detectar distrito por IP |
| `step_address` → `step_payment` | Costo de envío sorprende | Mostrar antes |
| `step_payment` → `purchase` | Yape QR falla o tarjeta rechazada | Logs payment provider |

---

## Funnel 2 — Vendor onboarding

**Objetivo:** medir cuántos vendors nuevos completan el flujo desde "quiero
vender" hasta "publiqué mi primer producto". ADR-079 vendor-approval.

### Pasos del funnel

| # | Evento | Estado actual | Properties relevantes |
|---|---|---|---|
| 1 | `vendor_apply_start` | **FALTA** | `source:landing|admin` |
| 2 | `vendor_form_complete` | **FALTA** | — |
| 3 | `vendor_application_submitted` | **FALTA** | — |
| 4 | `vendor_admin_review_started` | **FALTA** | `reviewer_id` |
| 5 | `vendor_approved` | **FALTA** | `decision:approved` |
| 6 | `vendor_first_product_created` | **FALTA** | `product_id` |

### Setup en PostHog UI

1. **Insights → New Insight → Funnels**
2. **Steps:** los 6 eventos de arriba en orden
3. **Conversion window:** `7 days` (admin puede tardar en revisar)
4. **Breakdown:** `source` (landing vs admin) para saber qué canal trae mejores leads
5. **Filter:** `environment:production`
6. **Save** as `Vendor onboarding funnel`.

### Métrica clave

`Approval rate` = `vendor_approved / vendor_application_submitted`. Meta: >70%.
Si está más bajo, hay un mismatch entre lo que la landing promete y lo que el
admin acepta.

---

## HogQL queries — drop-off analysis

### Query 1 — Drop-off por step en checkout (últimos 7 días)

```sql
SELECT
  count(DISTINCT person_id) AS users,
  countIf(event = 'add_to_cart') AS step_1,
  countIf(event = 'begin_checkout') AS step_2,
  countIf(event = 'checkout_step_account') AS step_3,
  countIf(event = 'checkout_step_address') AS step_4,
  countIf(event = 'checkout_step_payment') AS step_5,
  countIf(event = 'purchase') AS step_6,
  round(countIf(event = 'purchase') / countIf(event = 'add_to_cart') * 100, 2) AS overall_conversion_pct
FROM events
WHERE timestamp > now() - INTERVAL 7 DAY
```

### Query 2 — Top drop-off paths (cuáles son los caminos más comunes que NO terminan en purchase)

```sql
SELECT
  arrayStringConcat(groupArray(event), ' → ') AS user_path,
  count() AS frequency
FROM events
WHERE timestamp > now() - INTERVAL 7 DAY
  AND event IN (
    'add_to_cart', 'begin_checkout', 'checkout_step_account',
    'checkout_step_address', 'checkout_step_payment', 'purchase'
  )
GROUP BY person_id
HAVING NOT has(groupArray(event), 'purchase')
ORDER BY frequency DESC
LIMIT 20
```

### Query 3 — Tiempo medio entre steps (detecta steps lentos = formularios pesados)

```sql
WITH steps AS (
  SELECT
    person_id,
    event,
    timestamp,
    lag(event) OVER (PARTITION BY person_id ORDER BY timestamp) AS prev_event,
    lag(timestamp) OVER (PARTITION BY person_id ORDER BY timestamp) AS prev_timestamp
  FROM events
  WHERE event IN (
    'add_to_cart', 'begin_checkout', 'checkout_step_account',
    'checkout_step_address', 'checkout_step_payment', 'purchase'
  )
    AND timestamp > now() - INTERVAL 7 DAY
)
SELECT
  prev_event,
  event,
  round(avg(dateDiff('second', prev_timestamp, timestamp)), 1) AS avg_seconds,
  count() AS sample_size
FROM steps
WHERE prev_event IS NOT NULL
GROUP BY prev_event, event
ORDER BY avg_seconds DESC
```

### Query 4 — Vendor onboarding por source

```sql
SELECT
  properties.source AS source,
  countIf(event = 'vendor_apply_start') AS started,
  countIf(event = 'vendor_application_submitted') AS submitted,
  countIf(event = 'vendor_approved') AS approved,
  countIf(event = 'vendor_first_product_created') AS productive,
  round(countIf(event = 'vendor_approved') / countIf(event = 'vendor_apply_start') * 100, 2) AS approval_rate_pct
FROM events
WHERE timestamp > now() - INTERVAL 30 DAY
  AND event LIKE 'vendor_%'
GROUP BY source
ORDER BY started DESC
```

---

## Eventos faltantes — acción requerida

Para que los funnels arriba funcionen, hace falta agregar los siguientes
`trackEvent(...)` calls. Es trabajo de FE, NO está incluido en este round.

### Checkout

| Evento | Donde añadir | Snippet sugerido |
|---|---|---|
| `checkout_step_account` | `components/checkout/AccountStep.tsx` cuando se valida | `trackEvent("checkout_step_account", { step: 1 })` |
| `checkout_step_address` | `components/checkout/AddressStep.tsx` onContinue | `trackEvent("checkout_step_address", { step: 2, district })` |
| `checkout_step_payment` | `components/checkout/PaymentStep.tsx` onSelect | `trackEvent("checkout_step_payment", { step: 3, payment_method })` |

### Vendor onboarding

| Evento | Donde añadir |
|---|---|
| `vendor_apply_start` | `app/vender/page.tsx` onClick del CTA principal |
| `vendor_form_complete` | `components/marketing/RegistrationForm.tsx` onAllFieldsValid |
| `vendor_application_submitted` | onSuccess del POST `/api/vendor/apply` |
| `vendor_admin_review_started` | `components/admin/vendor-approval/...` cuando admin abre el caso |
| `vendor_approved` | `app/api/admin/vendors/[id]/approve/route.ts` server-side via posthog-node |
| `vendor_first_product_created` | `app/api/products/route.ts` cuando es el primer product de ese vendor |

**Estimado total:** 8 PRs pequeños (1 evento c/u). ~2h de trabajo.

---

## Dashboard recomendado

Crear un Dashboard en PostHog llamado `Buleje — Conversion & Onboarding` con:

| Card | Insight |
|---|---|
| 1 | Funnel "Checkout — global" (los 6 steps) |
| 2 | Funnel "Checkout — por dispositivo" (breakdown `$device_type`) |
| 3 | Funnel "Vendor onboarding" |
| 4 | Trend "Daily purchases" (línea, 30d) |
| 5 | Trend "Cart abandons" — `add_to_cart` sin `purchase` mismo día |
| 6 | HogQL Query 4 (vendor onboarding por source) |

**Layout:** 3 cols x 2 rows. Refresh cada 4h.

---

## Checklist Brandon (10 min, post-eventos-añadidos)

- [ ] Verificar en PostHog Live Events que `add_to_cart` y `begin_checkout` ya llegan
- [ ] Crear Funnel 1 con los 6 steps (los 3 nuevos llegan después de los PRs FE)
- [ ] Crear Funnel 2 con los 6 steps de vendor
- [ ] Crear Dashboard con las 6 cards
- [ ] Programar review semanal: si el funnel 1 tiene <30% conversion, levantar issue

---

## Apéndice — pricing PostHog

Plan free de PostHog: 1M events/mes. A escala actual de Buleje (~50 ventas/día,
~1000 events/día) hay margen 30x. No hay que preocuparse por costo aún.
