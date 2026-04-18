# ADR-076: Subscription "Bodega al Mes" — schema + expand-migrate-contract

## Estado

Proposed — 2026-04-18
Author: Agent MIG-1

## Fecha

2026-04-18

## Contexto

### Negocio

"Bodega al Mes" es la versión peruana de Amazon Subscribe & Save: el cliente suscribe productos recurrentes (arroz, leche, detergente, aceite) a una frecuencia fija (semanal / quincenal / mensual / bimestral) y recibe un descuento automático del **5 %** por asumir el commitment. El dueño de la bodega obtiene:

- Predictibilidad de ingresos (MRR tangible, no sólo ticket puntual).
- Reducción de customer-acquisition-cost (el cliente vuelve sin ads).
- Inventario inteligente (sabemos cuánto arroz despachar el próximo mes).

Aterrizaje demográfico (Pucallpa): familias de 4-6 personas que compran la misma canasta cada 30 días; señoras del barrio que prefieren dejar la leche programada; bodegas del grupo Saldaña/Torres/Gonzales del mock data. El 5 % compensa el descuento mayorista que recibirían en supermercado.

### Técnico

La feature existe hoy como **mock completo front-end**, sin persistencia real:

| Superficie | Archivo | Estado |
|---|---|---|
| Widget PDP | `components/marketplace/product-detail/SubscribeAndSaveWidget.tsx` | UI ok, dispatch a context |
| Context | `contexts/subscription-context.tsx` | localStorage con `tenantKey()` |
| Dashboard cliente | `app/(store)/cuenta/suscripciones/` | render desde context |
| Admin module | `components/admin/unified/SubscriptionsModule.tsx` | mocks locales duplicados |
| Mocks | `lib/mocks/subscriptions.mock.ts` | 8 suscripciones + 8 productos suscribibles |
| API | — | **no existe** |

Problemas tangibles:
1. **Datos volátiles** — borrar el localStorage del navegador pierde toda la suscripción.
2. **Sin cross-device** — el cliente firma en móvil, no aparece en escritorio.
3. **Admin no ve nada real** — el módulo admin carga mocks hard-codeados y no refleja el uso.
4. **Sin cron posible** — no existe un catálogo persistente para barrer "entregas de mañana".
5. **Sin métricas** — MRR, churn, activation rate → incalculables sin persistencia.

TD similar en patrón a **TD-030** (loyalty sin ledger) que fue resuelto por ADR-024. Misma receta: ledger persistente + DB class con `tenantId` como primer parámetro + cache invalidation + backfill idempotente.

## Decisión

Crear dos modelos Prisma nuevos, **Subscription** (el plan del cliente, mutable) y **SubscriptionDelivery** (ledger append-only de cada entrega programada / entregada / saltada). Ambos son adiciones limpias — zero breaking change sobre `Customer`, `Product`, `Order`.

### Schema final

```prisma
enum SubscriptionFreq {
  weekly
  biweekly
  monthly
  bimonthly
}

enum SubscriptionStatus {
  active
  paused
  cancelled
}

model Subscription {
  id                String              @id @default(cuid())
  tenantId          String              // multi-tenant isolation (CLAUDE.md #3)
  userId            String              // FK a Customer.phone (Customer's @id es `phone`)
  productId         Int                 // FK a Product.id
  frequency         SubscriptionFreq
  quantity          Int                 @default(1)
  discount          Decimal             @default(0.05) @db.Decimal(5, 4) // 5 % default
  status            SubscriptionStatus
  nextDeliveryAt    DateTime
  pausedAt          DateTime?
  cancelledAt       DateTime?
  cancelReason      String?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  deliveries        SubscriptionDelivery[]

  @@index([tenantId, userId, status])
  @@index([tenantId, nextDeliveryAt, status])
  @@index([tenantId, status])
  @@map("subscriptions")
}

model SubscriptionDelivery {
  id             String   @id @default(cuid())
  subscriptionId String
  tenantId       String
  scheduledFor   DateTime
  deliveredAt    DateTime?
  skipped        Boolean  @default(false)
  skipReason     String?
  orderId        String?  // FK Order cuando se crea pedido real (nullable — puede ser sólo un skip)
  createdAt      DateTime @default(now())

  subscription   Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@index([tenantId, subscriptionId])
  @@index([tenantId, scheduledFor])
  @@map("subscription_deliveries")
}
```

### Decisiones clave del shape

| Decisión | Razón |
|---|---|
| **Split en 2 tablas** | Subscription es mutable (status cambia). Delivery es append-only (ledger). Mezclarlos hace queries como "ultimas 10 entregas" mezclar rows activos con históricos. |
| **`userId String`** (no FK explícita) | Customer usa `phone String @id`. En la mayoría del codebase los FK a Customer no son declarados (sólo el `customerPhone` del Order). Mantenemos consistencia: FK lógico a `Customer.phone`, no físico. Esto evita CASCADE inesperado si un cliente con datos aún se borra. |
| **`productId Int`** | Consistente con `Product.id Int @default(autoincrement())`. |
| **`discount Decimal @db.Decimal(5, 4)`** | Permite `0.0500` (5 %) hasta `9.9999`, con 4 decimales. Evita TD-018 (float→decimal) en cálculos de totales. |
| **`frequency` como enum Prisma** | A diferencia de `loyalty.reason`, la frecuencia es cerrada y fija (weekly/biweekly/monthly/bimonthly). Usar enum da type-safety + constraint en Postgres. |
| **`status` como enum Prisma** | Mismo razonamiento: set cerrado (active/paused/cancelled). |
| **No soft delete** | `cancelled` **es un estado** — no un borrado. Deliveries pasadas quedan siempre (analytics retroactivo del churn). |
| **Índice `(tenantId, nextDeliveryAt, status)`** | Hot path del cron: "suscripciones activas con entrega en las próximas 48 h". Sin este índice, el cron hace table-scan. |
| **Índice `(tenantId, userId, status)`** | Hot path del dashboard del cliente (`/cuenta/suscripciones`): "mis suscripciones activas". |
| **`@@map`** (`subscriptions`, `subscription_deliveries`) | Naming SQL lowercase plural consistente con convenciones REST. La convención Prisma de PascalCase choca con el estilo `snake_case` plural al exponer a SQL directo. |
| **`onDelete: Cascade` en Delivery** | Si una suscripción se elimina físicamente (no cancela — elimina), su histórico de deliveries se borra con ella. Esto sucede raramente (GDPR / Ley 29733 right-to-erasure). Mientras tanto, `status = cancelled` deja TODO intacto. |

### Contract de lectura/escritura

Toda interacción con estas tablas pasa por `lib/db/subscriptions.db.ts#SubscriptionsDB`:

```ts
listForUser(tenantId, userId, options?)
  → Subscription[] con deliveries embebidas opcionalmente
  → "use cache" + cacheLife + cacheTag('subscriptions:user:{id}')

listActiveNearbyDelivery(tenantId, dayLookAhead)
  → Subscription[] para cron delivery-scheduler
  → uso del index (tenantId, nextDeliveryAt, status)

create(tenantId, data)
  → Zod validate, invalidate('subscriptions:user:{id}')

updateStatus(tenantId, id, status)
  → pause/resume/cancel con timestamp; invalida cache

changeFrequency(tenantId, id, freq)
  → recalcula nextDeliveryAt desde "ahora"; invalida cache

skipNextDelivery(tenantId, id)
  → crea SubscriptionDelivery {skipped: true}, avanza nextDeliveryAt

listDeliveries(tenantId, subscriptionId)
  → histórico del cliente

getStats(tenantId)
  → para admin: {active, paused, cancelled, mrrEstimated, churnRate}
```

Reglas CLAUDE.md aplicadas:
- **#1** Jamás `prisma.subscription.*` fuera de `subscriptions.db.ts`.
- **#2** `safeParse()` en Zod en cada mutation.
- **#3** `tenantId` es el PRIMER parámetro en TODAS las firmas.
- **#5** `invalidate()`/`invalidateByPrefix()` tras cada write.
- **#6** Totales (MRR, ahorro proyectado) son computados en backend.
- **#7** Audit log fire-and-forget con `.catch(() => {})`.

## Alternativas consideradas

### Opción A — Tabla única `Subscription` sin split

Merge de `Subscription` + `SubscriptionDelivery` en una sola tabla con `deliveredAt NULL` marcando "no ejecutado aún".

- ✅ Menos tablas, menos joins.
- ❌ La suscripción es una entidad mutable (status cambia); la entrega es append-only. Mezclarlas hace que actualizar `nextDeliveryAt` modifique rows con `deliveredAt` que deberían ser inmutables.
- ❌ El índice `(tenantId, nextDeliveryAt, status)` para el cron tendría que escanear rows históricos ya entregados.
- ❌ No permite construir "últimas 10 entregas" sin un `WHERE deliveredAt IS NOT NULL` extra.

**Rechazado**. El split refleja la realidad del dominio: el plan y sus entregas son cosas distintas.

### Opción B — `SubscriptionPlan` (catálogo) + `SubscriptionInstance` (plan activo por cliente)

Tres tablas: catálogo (el dueño de la bodega define los paquetes) + instancia (el cliente tiene X plan con ajustes) + delivery.

- ✅ Modelo más rico, permite "planes fijos" (canasta familiar, canasta estudiante).
- ❌ Overkill para el MVP. El 95 % de los casos del mock son suscripciones individuales producto-a-producto, no planes pre-armados.
- ❌ Triplica la complejidad del DB class y la UX.

**Rechazado para v1**. Si aparece demanda de planes pre-armados, se puede agregar una tabla `SubscriptionBundle` sin breaking change sobre `Subscription`.

### Opción C — Stripe Subscriptions nativas

Usar Stripe como fuente de verdad del ciclo (plan, cobro, webhook).

- ✅ Billing resuelto end-to-end.
- ✅ Hooks de `invoice.paid`, `customer.subscription.deleted`.
- ❌ Pucallpa usa mayormente Yape / efectivo contra-entrega — no Stripe recurrente.
- ❌ Atarse a Stripe complica la versión offline-first del PWA.
- ❌ El descuento del 5 % es cupón interno de la bodega, no un pricing de Stripe.

**Rechazado**. Stripe seguirá siendo para pagos one-time del checkout. "Bodega al Mes" es billing interno en PEN, no platform payment.

### Opción D — Solo localStorage (status-quo)

Quedarse con el mock.

- ✅ Cero ingeniería.
- ❌ Borrar cache del navegador → pierde suscripciones.
- ❌ Sin cross-device.
- ❌ Sin cron. Sin MRR. Sin churn.
- ❌ No es una feature, es un prototipo.

**Rechazado**. Ya estamos más allá del prototipo.

## Fases expand → migrate → contract

Zero-downtime deploy sigue el patrón estándar del repo (precedentes: ADR-017, ADR-024).

### Fase EXPAND (esta ADR — sin breaking change)

1. Agregar `Subscription` + `SubscriptionDelivery` + 2 enums al `prisma/schema.prisma`.
2. Generar migration `prisma/migrations/2026XXXXXX_add_subscription_bodega_al_mes/migration.sql` — sólo `CREATE TABLE`, `CREATE TYPE`, `CREATE INDEX`. Sin `DROP`, sin `ALTER` de columnas existentes.
3. `DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy` → tabla nueva, cero filas.
4. Ship `lib/db/subscriptions.db.ts` + APIs `/api/subscriptions/*`.
5. Ship `contexts/subscription-context.tsx` wrapped al API (localStorage como cache optimista, NO source of truth).

En este punto, el localStorage antiguo sigue funcionando para sesiones no-autenticadas. Usuarios autenticados empiezan a ver datos reales al login.

### Fase MIGRATE (backfill)

6. Script `scripts/backfill-subscriptions.ts` lee `lib/mocks/subscriptions.mock.ts` e inserta cada mock como Subscription real. Idempotente: `findFirst` por `id` antes de insertar.
7. Correr el backfill en dev/staging con el mock; en prod **no** se ejecuta (el mock es fixture, no data real).

### Fase CONTRACT (futuras ADRs, fuera de scope de MIG-1)

8. Activar cron `cron/subscription-delivery-scheduler.ts` que barre `listActiveNearbyDelivery(tenantId, 2)` cada hora y crea pedidos reales.
9. Deprecar los mocks cuando el dashboard de admin tenga datos reales.
10. Remover `MOCK_SUBSCRIPTIONS_CUSTOMER_SEED` del SubscriptionProvider (queda el seed vacío).

El contract cleanup no rompe nada — es simplemente retirar código muerto cuando hay reemplazo real.

## Plan de rollback

La migration es **aditiva pura**: dos `CREATE TABLE`, dos `CREATE TYPE`, tres índices. No modifica ni `Customer`, ni `Product`, ni `Order`.

```sql
-- Rollback completo (ejecutar con DIRECT_URL):
DROP TABLE "subscription_deliveries";
DROP TABLE "subscriptions";
DROP TYPE "SubscriptionStatus";
DROP TYPE "SubscriptionFreq";
```

El DB class + APIs + context-wiring se revierten con `git revert` del merge commit. Como el localStorage queda como fallback en el context, la UX degrada a "solo-local" pero no se rompe.

## Métricas de éxito

| Métrica | Cómo se calcula | Meta MVP |
|---|---|---|
| **MRR (Monthly Recurring Revenue)** | `SUM(unitPrice * quantity * (1-discount) * entregas_por_mes)` sobre `status = active` | > PEN 500 en primer mes |
| **Activation rate** | `subs_creadas_ultimos_30d / unique_pdp_views_con_widget` | > 3 % |
| **Churn mensual** | `subs_cancelled_ultimos_30d / subs_active_inicio_mes` | < 5 % |
| **Skip rate** | `deliveries_skipped / deliveries_scheduled` | < 15 % |
| **Average lifetime** | `AVG(cancelledAt - createdAt)` para canceladas | > 3 meses |

Todos calculables con SQL directo sobre las dos tablas, sin joins a terceros.

## Comando de aplicación manual

Por política de zona peligrosa, **la migration NO se aplica automáticamente**. Brandon ejecuta manualmente (en una red con acceso a Supabase) desde la raíz del proyecto:

```bash
# Dry-run: verificar qué va a correr
DATABASE_URL="$DIRECT_URL" npx prisma migrate status

# Aplicar
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy

# Verificar
DATABASE_URL="$DIRECT_URL" npx prisma migrate status  # debe decir "Database schema is up to date!"
```

Si `DIRECT_URL` falla por DNS en esta red, aplicar el SQL directamente vía Supabase SQL Editor usando el contenido de `prisma/migrations/2026XXXXXX_add_subscription_bodega_al_mes/migration.sql`.

## Referencias

- `lib/mocks/subscriptions.mock.ts` — fixtures que guían el shape del modelo
- `contexts/subscription-context.tsx` — ciclo de vida en cliente
- `components/marketplace/product-detail/SubscribeAndSaveWidget.tsx` — entrypoint UX en PDP
- `app/(store)/cuenta/suscripciones/` — dashboard del cliente
- `components/admin/unified/SubscriptionsModule.tsx` — módulo admin
- ADR-001 — Multi-tenancy row-level (`tenantId` en toda query)
- ADR-017 — Patrón CREATE INDEX CONCURRENTLY en Supabase
- ADR-019 — Next 16 cache (`"use cache"` + `cacheLife` + `cacheTag`)
- ADR-024 — LoyaltyTransaction (mismo patrón expand-migrate-contract)
- `CLAUDE.md` — reglas #1, #2, #3, #5, #6, #7
