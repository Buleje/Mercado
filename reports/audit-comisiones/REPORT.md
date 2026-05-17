# Audit Comisiones — Buleje Marketplace

**Fecha:** 2026-05-17
**Branch:** `feat/checkout-payment-proof`
**Alcance:** 2 sistemas distintos (equipo + marketplace) + 5 endpoints + 1 cron + 3 componentes UI

## Resumen ejecutivo

| Categoría | Cantidad |
|---|---|
| Endpoints | 6 (commissions, commissions/ledger, commission-rules, superadmin/commissions, cron/settle-commissions) |
| Componentes UI | 4 (ComisionesTab equipo, ComisionesTab marketplace, CommissionCalculator, hook) |
| Modelos Prisma | 2 (CommissionRule, CommissionLedger) |
| Tests existentes | 26 (calculateCommission + recordCommission flow) |
| Bugs P0 | **4** (cross-tenant leak ledger GET, fallback "main", rate unit mismatch, signature sin tenantId) |
| Bugs P1 | **7** (regla #1 violada 6x, no idempotencia, swallow errors, lookups sin tenantId) |
| Bugs P2 | 5 (Zod faltante, paginación, etc.) |
| Gaps de construcción | 3 (refunds/disputas, rate escalonado, settle real) |

**Veredicto:** sistema funciona en happy path con datos limpios, pero hay **leak cross-tenant** y **fallback silencioso "main"** que pueden atribuir comisiones al tenant equivocado. Refactor a `lib/db/commissions.db.ts` urgente.

---

## P0 — Bloquean correctness de dinero

### P0-1 · GET `/api/commissions/ledger` no filtra por tenantId

**Archivo:** `app/api/commissions/ledger/route.ts:23-48`

```ts
const where: Record<string, unknown> = {};
if (storeId) where.storeId = storeId;
if (status) where.status = status;
// ... where SIN tenantId
const commissions = await prisma.commissionLedger.findMany({ where, ... });
```

**Problema:** cualquier admin autenticado ve TODAS las comisiones de TODOS los tenants. **Leak directo de datos financieros cross-vendor.**

**Fix:** agregar `tenantId: auth.tenantId` al where inicial. El test/curl debería confirmar que admin del tenant A no ve fees del tenant B.

---

### P0-2 · `recordMarketplaceCommissions` no recibe `tenantId`

**Archivo:** `lib/commissions.ts:66-71`

```ts
export async function recordMarketplaceCommissions(
  orderId: string,
  orderTotal: number,
  storeId: string,
  deliveryPartnerId?: string,
  // ← falta tenantId
): Promise<void>
```

**Problema:** la función llama internamente a `recordCommission()` sin `tenantId`, lo que dispara el fallback `"main"` para TODA orden de marketplace que pase por este flujo.

**Caller actual:** `lib/whatsapp/concierge/multi-vendor-checkout.ts:294` SÍ pasa tenantId a `recordCommission` directamente (evita el bug pasando por alto a `recordMarketplaceCommissions`). Pero cualquier nuevo caller que use la función "oficial" pisa el bug.

**Fix:** agregar `tenantId: string` como param obligatorio. Migrar callers existentes.

---

### P0-3 · Fallback silencioso `tenantId = "main"`

**Archivo:** `lib/commissions.ts:34-41`

```ts
const tenantId = params.tenantId ?? "main";
if (!params.tenantId) {
  logger.warn("[commissions] missing tenantId — falling back to 'main'");
}
```

**Problema:** el comment dice "fallback observable hasta que todos los callers pasen tenantId" pero **YA es una zona de DINERO**. Una comisión atribuida al tenant equivocado significa que `superadmin` cobra de menos al tenant correcto y de más al "main".

**Fix:** quitar fallback. Si `tenantId` no viene → throw `Error("tenantId required")`. Fail-loud es mejor que perder plata silenciosamente.

---

### P0-4 · Inconsistencia de unidad `rate` (0-1 vs 0-100)

**Archivo:** `app/api/commissions/ledger/route.ts:16` vs `lib/commissions.ts:13`

```ts
// Endpoint POST /ledger:
rate: z.number().min(0).max(1, "La tasa debe estar entre 0 y 1"),

// lib/commissions.ts (recordCommission):
rate, // 5 (representando 5%, no 0.05)
```

**Problema:** el endpoint POST espera rate como **proporción** (0.05 = 5%). La librería que escribe desde el server pasa rate como **porcentaje** (5 = 5%). El mismo modelo `CommissionLedger.rate Decimal(5,4)` recibe ambos formatos según el caller → cálculos posteriores tabla muestran 500% o 0.05%.

**Fix:** unificar. Convención recomendada: **`rate` siempre como % entero/decimal (0-100)** para ser legible al humano. Actualizar Zod schema del endpoint a `max(100)`.

---

## P1 — Robustez y regla #1

### P1-1 · 6 archivos violan regla #1 (prisma.* directo en routes)

| Archivo | Líneas | Operación |
|---|---|---|
| `app/api/commissions/route.ts` | 29, 41, 73 | findMany, findMany, findMany |
| `app/api/commission-rules/route.ts` | 35, 62, 89, 98, 123, 126 | findMany, create, findFirst, update, findFirst, delete |
| `app/api/commissions/ledger/route.ts` | 45, 49, 94, 136 | findMany, groupBy, create, updateMany |
| `app/api/superadmin/commissions/route.ts` | 26 | findMany (legítimo — superadmin cross-tenant) |
| `app/api/cron/settle-commissions/route.ts` | 23, 42 | findMany, updateMany (legítimo — cron platform) |
| `lib/commissions.ts` | 43, 73, 91 | create, findUnique, findFirst |

**Fix:** crear `lib/db/commissions.db.ts` con métodos: `list`, `listLedger`, `recordCommission`, `recordMarketplaceCommissions`, `settle`, `rulesByCashier`, `createRule`, `updateRule`, `deleteRule`. Cache + audit + tenantId obligatorio.

---

### P1-2 · `recordCommission` swallow errors (P1)

**Archivo:** `lib/commissions.ts:55-57`

```ts
} catch (err) {
  logger.warn("Failed to record commission", { error: err, params });
}
```

**Problema:** si falla la creación del ledger row, la orden ya está completada pero NO hay registro de la comisión. El test `commissions-business-logic.test.ts:174` explícitamente espera este comportamiento como "fire-and-forget compatible" — pero eso es deliberadamente perder dinero.

**Fix:** propagar error pero NO crash hot path. Encolar a un `failed_commissions` queue (BullMQ) con retry exponencial. Si falla 3x → Sentry alert al superadmin.

---

### P1-3 · No idempotencia en `recordMarketplaceCommissions`

Si por algún bug (webhook duplicado de Stripe, retry de cron, etc.) se llama 2x para la misma `orderId`, se crean 2 rows en CommissionLedger → cobro doble.

**Fix:** check duplicado antes de crear: `findFirst({ orderId, type })`. Si existe, skip + log info. Idealmente: unique index `@@unique([orderId, type])` en schema (require migration — diferir a sprint propio).

---

### P1-4 · `prisma.store.findUnique` y `deliveryAssignment.findFirst` sin tenantId

**Archivo:** `lib/commissions.ts:73, 91`

Hoy funciona porque `Store.id` es unique global. Pero defense-in-depth requiere `tenantId` en `findFirst` con `id` también.

---

### P1-5 · GET `/api/commissions` sin Zod en query params

**Archivo:** `app/api/commissions/route.ts:14-16`

```ts
const from = req.nextUrl.searchParams.get("from");
// new Date(from) puede dar Invalid Date sin validar
```

**Fix:** `z.string().datetime().optional()` para `from` y `to`.

---

### P1-6 · Tab unified "Comisiones marketplace" no tipa status

**Archivo:** `components/admin/marketplace/hooks/use-marketplace-commissions.ts:9`

```ts
status: "pendiente" | "liquidado" | "pagado";  // ← español
```

Pero el modelo Prisma usa `pending | settled | paid` (inglés). Necesita mapping en el endpoint o normalizar a inglés siempre.

---

### P1-7 · Cron `settle-commissions` cross-tenant sin reporting per-vendor

**Archivo:** `app/api/cron/settle-commissions/route.ts:23-44`

El cron busca TODAS las pending pasadas de 7 días y las marca settled de una sola, **sin desglose por tenant ni payout summary**. Si hay 200 tenants, todos se settlean en un solo batch sin trazabilidad.

**Fix:** group by `tenantId + storeId/partnerId`, generar summary por vendor para audit.

---

## P2 — Mejoras

### P2-1 · Sin paginación en GET ledger / GET commissions
### P2-2 · Sin export CSV de comisiones liquidadas
### P2-3 · `CommissionLedger.rate` es Decimal(5,4) pero el seed usa Number → precisión perdida en cargas masivas
### P2-4 · El componente `CommissionCalculator.tsx` usa localStorage como única persistencia de tasas (no DB)
### P2-5 · El cron NO emite notificación al vendor cuando se settle su comisión

---

## Gaps de construcción

### Gap 1 · Disputas / Refunds sobre comisiones

**Estado:** inexistente. Cuando una Order pasa a `refunded`, la comisión queda `pending` o `settled` infinitamente, descuadrando con la realidad financiera.

**Diseño propuesto:**
- Agregar status `"refunded"` al ledger (literal string, sin schema change).
- Endpoint POST `/api/commissions/refund` que reciba `orderId`, busque las commissions activas, las marque `refunded` + setea `settledAt`, y crea una entrada negativa de compensación (tipo `refund_reversal`).
- Hook desde `OrdersDB.markAsRefunded()` → llama a `CommissionsDB.refundCommissionsByOrder(orderId)`.
- Tests: orden con 2 fees (marketplace + delivery) → refund debe reversar ambas.

### Gap 2 · Rate escalonado por volumen (Vendor Tier)

**Estado:** todas las tiendas pagan rate flat (5% default). Vendors top no son recompensados, vendors chicos pagan igual que grandes.

**Diseño propuesto:**
- Calcular dinámicamente el tier de cada Store en `recordMarketplaceCommissions`:
  - **Bronze** (default): 5% — ventas < S/5,000/mes
  - **Silver**: 4% — ventas S/5,000-15,000/mes
  - **Gold**: 3% — ventas S/15,000-50,000/mes
  - **Platinum**: 2% — ventas > S/50,000/mes
- Ventas calculadas sobre últimos 30 días via `prisma.order.aggregate`.
- Store.commission sigue siendo el rate "override" — si no es default 5, gana sobre el tier.
- UI superadmin: tabla de tiendas con tier actual + ventas 30d + rate efectivo.
- Tests: 4 escenarios de ventas → 4 tiers correctos.

### Gap 3 · Settle real (no solo marcar flag)

**Estado:** cron marca `settledAt=now()` pero NO transfiere dinero. Vendor NUNCA cobra automáticamente.

**Diseño propuesto:**
- **Fase 1 (esta sesión):** generar `PayoutSummary` por vendor con desglose por orderId + monto neto + rate aplicado. Endpoint GET `/api/superadmin/payouts/pending` que devuelve el job de transferencias por hacer.
- **Fase 2 (sprint propio):** integración Stripe Connect Transfers o Mercado Pago Marketplace API. Por ahora el cron escribe la intención + permite al superadmin descargar el job para procesar manual.
- Marcar `status: "settled"` solo cuando el payout efectivamente se ejecutó (no antes).
- Agregar `payoutId` opcional al ledger para vincular con el transfer externo.

---

## Plan de ejecución (esta sesión)

| Fase | Tareas | Tests | Schema migration |
|---|---|---|---|
| **1. Audit** | Reporte ✓ | — | No |
| **2. P0 fixes** | Filtro tenantId ledger, eliminar fallback "main", unificar rate, agregar tenantId param | 5 nuevos | No |
| **3. P1 fixes + CommissionsDB** | Crear lib/db/commissions.db.ts, migrar endpoints, idempotencia, lookup tenantId | 8 nuevos | No |
| **4. Disputas/Refunds** | Endpoint `/api/commissions/refund`, status "refunded", reversa atómica | 4 nuevos | No (string status) |
| **5. Rate escalonado** | Cálculo dinámico tier, UI superadmin tabla tiers | 4 nuevos | No (calc dinámico) |
| **6. Settle mejorado** | PayoutSummary + endpoint pending, summary por vendor en cron | 3 nuevos | No |

Total nuevo: ~24 tests, 0 migraciones de schema.

ETAs: ~4h con tests y smoke en mi-pollo.
