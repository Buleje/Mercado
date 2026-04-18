# Socio Buleje — Membresía del marketplace

Feature de suscripción estilo "Amazon Prime" para el marketplace Buleje. Multi-tenant, pensada para la bodega de barrio de Pucallpa.

---

## Qué entrega al usuario

| Beneficio | Valor |
|---|---|
| Delivery gratis | Ilimitado, todas las bodegas |
| Cashback en compras | 5% sobre el subtotal |
| Precios exclusivos | Productos seleccionados |
| Acceso anticipado a ofertas | 24 horas antes |
| Soporte WhatsApp prioritario | Respuesta en minutos |
| Puntos de fidelidad | 2× al normal |

---

## Precios MVP (mock, in-memory)

| Plan | Precio | Ciclo |
|---|---|---|
| Mensual | S/ 19 | 30 días |
| Anual | S/ 189 | 365 días (ahorra 2 meses) |
| Trial | S/ 0 | 30 días sin tarjeta |

En prod: estos montos vendrán de `StripePrice` objects; ver sección "Migración a Stripe".

---

## Arquitectura (MVP actual)

```
app/(store)/socio-buleje/page.tsx          → landing pública
app/(store)/cuenta/socio-buleje/page.tsx   → dashboard del socio
app/api/socio-buleje/{subscribe,cancel,status}/route.ts
contexts/socio-buleje-context.tsx          → estado cliente + localStorage
lib/db/socio-buleje.db.ts                  → DB class (in-memory mock)
lib/mocks/socio-buleje.mock.ts             → datos demo
lib/validators/socio-buleje.ts             → Zod schemas (safeParse)
components/socio-buleje/                   → UI landing
components/customer/socio-buleje/          → UI panel
components/marketplace/SocioPriceBadge.tsx → badge en ProductCard
components/marketplace/product-detail/SocioBadge.tsx → CTA en PDP
components/ui-system/widgets/SocioPromoFlotante.tsx  → mini toast
```

### Persistencia MVP

- `localStorage` key `buleje-{tenantSlug}-socio-buleje` — estado del socio
- `localStorage` key `buleje-{tenantSlug}-socio-promo-dismissed` — cooldown 7d del widget flotante
- In-memory `Map<tenantId:userId, Membership>` en `SocioBulejeDB`
- Demo user `user_demo_01` tiene historial mock prellenado (visible en el dashboard)

### API routes

| Método | Ruta | Body/Query | Descripción |
|---|---|---|---|
| POST | `/api/socio-buleje/subscribe` | `{plan, userId}` | Crea/activa membership |
| POST | `/api/socio-buleje/cancel` | `{userId, reason?}` | Marca `status: "canceled"` (beneficio sigue hasta endDate) |
| GET | `/api/socio-buleje/status?userId=...` | — | Devuelve membership actual |

Todas pasan `safeParse()` Zod (regla #2) y extraen `tenantId` del header `x-tenant-id`.

---

## Migración a producción

### Cuando tengamos Stripe real (ADR-XX pendiente)

1. **Schema Prisma** (rompe zero-downtime — usa pattern expand→migrate→contract):

   ```prisma
   model SocioMembership {
     id              String   @id @default(cuid())
     tenantId        String
     userId          String
     plan            String   // "monthly" | "yearly"
     status          String   // "active" | "canceled" | "trial"
     stripeCustomerId String?
     stripeSubscriptionId String?
     startDate       DateTime
     endDate         DateTime
     trialEndsAt     DateTime?
     cashbackBalance Decimal  @default(0) @db.Decimal(10, 2)
     totalSaved      Decimal  @default(0) @db.Decimal(10, 2)
     @@unique([tenantId, userId])
     @@index([tenantId, status])
   }

   model SocioCashbackTransaction {
     id          String   @id @default(cuid())
     tenantId    String
     userId      String
     orderId     String?
     amount      Decimal  @db.Decimal(10, 2)
     reason      String   // "purchase" | "redemption" | "expiration"
     createdAt   DateTime @default(now())
     @@index([tenantId, userId, createdAt])
   }
   ```

2. **Stripe integration** (crear productos + prices):

   ```ts
   // Desde /admin/socio-buleje/setup — one-off
   const monthly = await stripe.prices.create({
     product: SOCIO_PRODUCT_ID,
     currency: "pen",
     unit_amount: 1900,
     recurring: { interval: "month" },
   });
   const yearly = await stripe.prices.create({
     product: SOCIO_PRODUCT_ID,
     currency: "pen",
     unit_amount: 18900,
     recurring: { interval: "year" },
   });
   ```

3. **Subscribe flow** (POST /api/socio-buleje/subscribe):
   - Crear `StripeCustomer` si no existe
   - Crear `StripeSubscription` con trial 30d
   - Persistir en `SocioMembership`
   - Webhook `customer.subscription.updated` → sync status

4. **Cashback ledger** (por cada order entregada):
   - Cron o webhook `order.delivered`
   - Insert en `SocioCashbackTransaction` + suma a `cashbackBalance`
   - Invalidar `socio:${tenantId}:${userId}` cache

5. **Redemption** (al checkout):
   - Usuario elige cuánto aplicar (máx = cashbackBalance)
   - Insert transacción `reason: "redemption"` con `amount: -X`
   - Descuenta del total del pedido

### Zona de peligro (no tocar sin test)

- `components/checkout/**` — la integración de precios Socio debe ser **read-only** en el carrito; el cálculo final pasa por `lib/db/orders.db.ts` server-side (regla #6 CLAUDE.md).

---

## Analítica a medir

| Métrica | Cómo | Meta inicial |
|---|---|---|
| Conversion rate landing → subscribe | Track click "Volverme Socio" vs session views | 3-5% |
| Trial → paid | Cohort a 30 días | 40% |
| Churn mensual | Canceled / active | <5% |
| LTV (lifetime value) | `avg(months) × monthly_price` | S/ 380 |
| ARPU (avg revenue per user) | `sum(revenue) / active_members` | S/ 19 |
| Uso de cashback (redemption rate) | redemptions / total earned | 60-80% |
| Pedidos por Socio vs Invitado | orders/month ratio | 2× |

### Eventos a trackear

- `socio_landing_view`
- `socio_calculator_used` (con spend value)
- `socio_plan_selected` (monthly | yearly)
- `socio_subscribe_attempt`
- `socio_subscribe_success`
- `socio_cancel_attempt` (incluir reason si se capta)
- `socio_pdp_badge_shown` / `socio_pdp_badge_clicked` (atribución)
- `socio_floating_widget_shown` / `socio_floating_widget_dismissed`

---

## Tests a escribir (cuando pase a prod)

- [ ] E2E: landing → subscribe → dashboard aparece
- [ ] E2E: cancelar → status = canceled, beneficios activos hasta endDate
- [ ] Unit: `computeSavings()` con diferentes spend levels
- [ ] Unit: `SocioBulejeDB.subscribe()` idempotencia + trial assignment
- [ ] Integration: webhook Stripe `subscription.deleted` → sync status
- [ ] Visual: SocioBadge en PDP con y sin isSocio
- [ ] A11y: PlanSelector usable con teclado + screen reader
