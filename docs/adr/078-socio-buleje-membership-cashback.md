# ADR-078: Socio Buleje — Membership + Billing Cycles + Cashback Ledger

## Status

Proposed — 2026-04-18
Author: Agent MIG-3 (Data / Migrations)

## Date

2026-04-18

## Context

"Socio Buleje" es el programa de membresía del marketplace Buleje (análogo a Amazon Prime, adaptado a bodega de barrio Pucallpa). Hoy vive 100% en capa mock:

| Capa | Estado actual | Problema |
|---|---|---|
| Landing `/socio-buleje` | estática + calculadora ahorro (`computeSavings`) | n/a (OK) |
| Dashboard `/cuenta/socio-buleje` | lee `lib/mocks/socio-buleje.mock.ts` | sin persistencia real |
| `SocioBadge` PDP / `SocioPriceBadge` card | lee `useSocioBuleje` (localStorage) | no sync con servidor |
| `contexts/socio-buleje-context.tsx` | `localStorage` tenant-scoped | se pierde en logout / multi-dispositivo |
| `lib/db/socio-buleje.db.ts` | `Map<tenantId:userId, Membership>` in-memory | se pierde en cold-start |
| `app/api/socio-buleje/{subscribe,cancel,status}` | stubs sobre la Map | no idempotentes, sin cobros |
| Admin `SocioMembersAdminModule` | `MOCK_MEMBERS` hardcoded | no refleja realidad |

Necesitamos persistir tres cosas que el mock no captura:

1. **El contrato de membresía** — plan mensual/anual, fecha de renovación, trial, cancelación "al fin del periodo" vs. inmediata.
2. **La historia de cobros** — cada ciclo de 30 o 365 días genera un cargo. Necesitamos saber si se cobró, falló, o quedó eximido (promo, grace period).
3. **El saldo de cashback** — es pasivo contable: le debemos al cliente lo acumulado. Tiene que ser trazable a la orden que lo originó, a la orden donde se gastó, al día de caducidad, a la corrección manual.

El diseño tiene que soportar operaciones crónicas:
- Cron diario que encuentra memberships con `currentPeriodEnd < now + 1d` y genera el próximo ciclo.
- Cron mensual que expira cashback > 12 meses.
- Past-due grace de 7 días cuando el cobro falla antes de marcar `cancelled`.
- Redemption de cashback en checkout con **lock** (dos tabs no deben poder gastar el mismo saldo dos veces).

## Decision

Tres tablas Prisma, **append-only para ledger**, expand-only para la migración:

### Tabla 1 — `SocioMembership`

Una fila por (tenant, user) representa el contrato vivo. Se actualiza con `cancelAtPeriodEnd`, `status`, `currentPeriodEnd`. Es mutable (no es un ledger).

### Tabla 2 — `SocioBillingCycle`

Una fila por ciclo de cobro (mensual o anual). Se crea por `subscribe` (primer ciclo, `waived` si trial) y por el cron diario (ciclos subsiguientes). Muta solo su `status` y `paidAt` cuando se concilia el cobro.

### Tabla 3 — `SocioCashbackEntry`

**Append-only ledger.** Cada movimiento del saldo Socio (earned, redeemed, expired, bonus, adjustment) es una fila nueva. Nunca update. Nunca delete. Correcciones se hacen con una nueva fila `type=adjustment` y `amount` negativo o positivo.

El saldo actual es **el `balanceAfter` de la entry más reciente** (snapshot inline por entry). Así el saldo se lee en O(1) sin agregar sobre el ledger completo.

### Modelo Prisma (canónico)

```prisma
model SocioMembership {
  id                 String                @id @default(cuid())
  tenantId           String
  userId             String
  plan               SocioPlan             // monthly | annual
  status             SocioStatus           // trial | active | past_due | paused | cancelled
  startedAt          DateTime              @default(now())
  currentPeriodEnd   DateTime
  trialEndsAt        DateTime?
  cancelledAt        DateTime?
  cancelReason       String?
  cancelAtPeriodEnd  Boolean               @default(false)
  autoRenew          Boolean               @default(true)
  createdAt          DateTime              @default(now())
  updatedAt          DateTime              @updatedAt

  billingCycles      SocioBillingCycle[]
  cashbackEntries    SocioCashbackEntry[]

  @@unique([tenantId, userId])
  @@index([tenantId, status])
  @@index([tenantId, currentPeriodEnd, status])
  @@index([tenantId, cancelAtPeriodEnd])
  @@map("socio_memberships")
}

model SocioBillingCycle {
  id             String              @id @default(cuid())
  membershipId   String
  tenantId       String
  periodStart    DateTime
  periodEnd      DateTime
  amountSoles    Decimal             @db.Decimal(10, 2)
  status         BillingCycleStatus  // pending | paid | failed | waived
  paidAt         DateTime?
  invoiceId      String?
  failureReason  String?
  createdAt      DateTime            @default(now())

  membership     SocioMembership     @relation(fields: [membershipId], references: [id], onDelete: Cascade)

  @@index([tenantId, membershipId])
  @@index([tenantId, periodEnd, status])
  @@map("socio_billing_cycles")
}

model SocioCashbackEntry {
  id             String               @id @default(cuid())
  membershipId   String
  tenantId       String
  userId         String
  orderId        String?
  type           CashbackEntryType    // earned | redeemed | expired | bonus | adjustment
  amountSoles    Decimal              @db.Decimal(10, 2)
  description    String
  balanceAfter   Decimal              @db.Decimal(10, 2)
  createdAt      DateTime             @default(now())

  membership     SocioMembership      @relation(fields: [membershipId], references: [id], onDelete: Cascade)

  @@index([tenantId, userId, createdAt])
  @@index([tenantId, membershipId, type])
  @@index([tenantId, orderId])
  @@map("socio_cashback_entries")
}
```

### Decisiones de forma

| Decisión | Por qué |
|---|---|
| `@@unique([tenantId, userId])` (no `userId @unique`) | Ley 29733 / multi-tenant: el mismo `userId` (CUID) nunca se repite entre tenants, pero el **uniqueness lógico del contrato** es por tenant. Mantener el compuesto evita accidentes si alguna vez cambiamos la shape del userId. |
| Enums Prisma (`SocioPlan`, `SocioStatus`, `BillingCycleStatus`, `CashbackEntryType`) | A diferencia de `Order.status` (string libre), estos dominios son **cerrados y versionados** (cambiar = ADR nuevo). Enum en DB = check constraint gratis. |
| `amountSoles Decimal(10,2)` | Dinero nunca `Float`. 10 dígitos total, 2 decimales = hasta S/ 99,999,999.99 por entry. Matching con `Order.total Decimal(12,2)`. |
| `balanceAfter` snapshot por entry | Leer saldo es O(1) = `ORDER BY createdAt DESC LIMIT 1`. Sin snapshot, cada read sería `SUM(amount)` sobre toda la historia del usuario → explota con 10k+ entries. |
| `type: CashbackEntryType` enum | Los 5 tipos son **financieramente distintos** (tax, reporting, expiration jobs). Enum asegura que backfill y app nunca inventen tipos nuevos sin ADR. |
| `onDelete: Cascade` en cycles + entries | GDPR/Ley 29733 right-to-erasure: borrar membership borra toda la historia asociada en 1 DELETE. |
| `invoiceId String?` (no FK) | Por ahora no existe tabla `Invoice` (factura electrónica SUNAT está en `SunatInvoice` pero el FK lo agregamos en Sprint B cuando conectemos billing real). String nullable evita bloquear esta migración. |
| `orderId String?` (no FK) | `Order.id` es String tenant-scoped. FK evitaría cleanup de Order sin cascade. String + index por tenant+orderId cubre la query real sin lock de dependencias. |

### Write contract

Todas las mutaciones pasan por `lib/db/socio-buleje.db.ts`:

- **`subscribe(tenantId, userId, plan)`** — crea `SocioMembership` (status=`trial` si nunca fue socio, else `active`) + primer `SocioBillingCycle` (`waived` si trial, `pending` si no).
- **`cancel(tenantId, userId, reason, immediate?)`** — default es `cancelAtPeriodEnd=true` (sigue socio hasta `currentPeriodEnd`). `immediate=true` setea `status=cancelled` y `cancelledAt=now()`.
- **`resume(tenantId, userId)`** — invierte `cancelAtPeriodEnd=false` si la membership aún está vigente.
- **`earnCashback(tenantId, userId, orderId, amount, description)`** — append entry `type=earned` + `balanceAfter = previousBalance + amount`. Todo en `$transaction` para que balance snapshot quede consistente incluso con entries concurrentes.
- **`redeemCashback(tenantId, userId, orderId, amount)`** — **transacción con `SELECT ... FOR UPDATE`** sobre membership. Valida balance >= amount, append entry negativa, actualiza snapshot. Sin lock, dos tabs con la misma sesión pueden ambos reservar todo el saldo.
- **`renewCycleIfDue(tenantId, membershipId)`** — idempotente. Busca el último cycle, si `periodEnd < now + 1d` y membership no está en `cancelAtPeriodEnd=true`, crea el siguiente cycle `pending`.

Invalidación de caché después de cada write:
`invalidateByPrefix(\`socio:${tenantId}:${userId}\`)`.

### Read contract

- **`getMembership(tenantId, userId)`** — cached 60s, key `socio:{tenant}:{user}:membership`. Hidrata `cashbackBalance` y métricas derivadas del ledger.
- **`getCashbackHistory(tenantId, userId, limit?)`** — cached 60s por página.
- **`getCashbackBalance(tenantId, userId)`** — deriva de la última entry (`ORDER BY createdAt DESC LIMIT 1`). 0 si no hay entries.
- **`getExclusiveOffers(tenantId, limit?)`** — lista de productos con `socioPrice` (v1 lee del mock de ofertas; Sprint B conectará con Product.socioPrice).
- **`getStats(tenantId)`** — admin-only. MRR (sum de `amountSoles` de cycles paid del mes), churn mensual, active count, outstanding cashback liability (SUM de `balanceAfter` por último-user).

## Alternatives Considered

### A — Single-table (membership con contador `cashbackBalance` in-place, sin ledger)

- ✅ Una sola tabla, menos migración.
- ❌ Idéntico al problema de `Customer.loyaltyPoints` pre-ADR-024: sin audit trail. No podemos responder "¿por qué este usuario tiene S/47.30 de saldo?".
- ❌ Las idempotency guarantees se pierden: si un webhook retry aplica el mismo cashback dos veces, no hay idempotency key para rechazarlo.
- ❌ Compliance Ley 29733 y auditoría financiera: sin ledger no hay trazabilidad para el saldo que le debemos al cliente (pasivo contable).

Rechazado.

### B — Double-entry accounting (asset + liability accounts con debit/credit)

- ✅ Gold standard de integridad contable.
- ❌ Overkill para 100% 1-usuario 1-saldo. La doble-entrada vale cuando tenemos flujos entre cuentas (p.ej. transferencias, revenue recognition por orden). Acá el "otro lado" es trivialmente Buleje.
- ❌ Latencia: cada write sería 2 rows + balance constraint.

Rechazado por sobreingeniería para v1. Si llegamos a necesitar GAAP-level ledger (IPO, SOX), migramos a un ledger propio para ese módulo.

### C — Ledger sin `balanceAfter` (derivado con SUM on-demand)

- ✅ Single source of truth por fila.
- ❌ Cada read de saldo hace `SUM(amount)` sobre todas las entries del usuario. A los 1000 entries/user eso es 50-200ms en pgBouncer (no cabe en hot path como checkout o `SocioBadge` PDP).
- ❌ A futuro, la validación de `balanceAfter === sum(previous)` desaparece como test cross-check.

Rechazado. Mantener snapshot inline + test de consistencia en CI.

## Fases expand → migrate → contract

Siguiendo el patrón ADR-020:

| Fase | Acción | Duración |
|---|---|---|
| **Expand** | Migración adiciona 3 tablas + 4 enums. No toca nada existente. Deploy la migración a DB. Deploy de la app sigue leyendo mock. | 1 deploy (zero downtime) |
| **Migrate** | Backfill script inserta registros desde `lib/mocks/socio-buleje.mock.ts` para demo user. Flip feature flag `socio.prismaEnabled` — nuevas suscripciones escriben a DB; reads consultan DB y caen al mock solo si no hay registro. | 1 deploy (canary 5% → 25% → 100%) |
| **Contract** | Borrar `lib/mocks/socio-buleje.mock.ts` y todas las references. Flag queda siempre-on. | 1 deploy |

## Rollback

**Expand:** `DROP TABLE socio_cashback_entries; DROP TABLE socio_billing_cycles; DROP TABLE socio_memberships; DROP TYPE "CashbackEntryType"; DROP TYPE "BillingCycleStatus"; DROP TYPE "SocioStatus"; DROP TYPE "SocioPlan";` — las tablas son brand-new, zero rows si no se corrió backfill.

**Migrate:** Deshabilitar feature flag `socio.prismaEnabled` → rutas vuelven al mock. Los registros quedan en DB para un re-flip.

**Contract:** Versión mayor de la app, rollback completo requiere restaurar `lib/mocks/socio-buleje.mock.ts` de Git + redeploy.

## Métricas a trackear

| Métrica | Fuente | Alerta |
|---|---|---|
| **MRR** (Monthly Recurring Revenue) | `SUM(amountSoles) WHERE status=paid AND periodEnd > now-30d` | Dashboard admin. |
| **Churn mensual** | `canceled_this_month / active_start_of_month` | Alerta si >8%. |
| **LTV** (Lifetime Value) | `AVG(months_active) * avg_monthly_fee` | Reporte mensual admin. |
| **Active count** | `COUNT(*) WHERE status IN ('active','trial')` | Dashboard admin. |
| **Past_due count** | `COUNT(*) WHERE status='past_due'` | Alerta si >5% del active count. |
| **Cashback outstanding liability** | `SUM(balanceAfter) WHERE createdAt = MAX(createdAt) per user` | Reporte financiero semanal. |
| **Redemption rate** | `SUM(|amount|) where type=redeemed / SUM(amount) where type=earned` | Meta 60-80% a 90d. |
| **Cycle renewal success rate** | `paid / (paid + failed)` del último mes | Alerta si <95%. |

## Consecuencias

**Positivas:**
- Trazabilidad completa del pasivo cashback (compliance + customer support).
- Cron diario de renovación idempotente (re-corrida safe).
- Redemption race-free via `SELECT FOR UPDATE`.
- Reporting admin robusto (MRR, churn, liability).

**Negativas:**
- 3 tablas nuevas + 4 enums (schema crece de 131 → 134 modelos).
- Backfill requiere DIRECT_URL para aplicar migration (restricción red).
- Flip de feature flag debe coordinarse con release de UI (admin module + context hydration).

## Referencias

- ADR-020 — Patrón expand/migrate/contract.
- ADR-024 — Append-only ledger (LoyaltyTransaction, mismo estilo).
- CLAUDE.md reglas #1, #2, #3, #5, #6, #7 — cumplidas.
- docs/features/socio-buleje.md — esta ADR cancela la sección "Migración a producción" de ese doc.
