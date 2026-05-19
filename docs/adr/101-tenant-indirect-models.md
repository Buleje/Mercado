# ADR-101: Modelos indirectos multi-tenant (acceso vía FK del padre)

**Date:** 2026-05-11
**Status:** Accepted
**Related:** ADR-082 (multi-tenant isolation), ADR-093 (cross-tenant guard pattern)

## Contexto

`lib/tenant.ts::TENANT_MODELS` define el set de modelos Prisma que `prismaForTenant(tenantId)` auto-scope con `WHERE { tenantId }`. Tras el audit del 2026-05-11 se agregaron 40+ modelos faltantes (b7bad981), pero quedan ~10 modelos **indirectamente** tenant-scoped — sin columna `tenantId` propia, vinculados a un padre que sí la tiene.

Sin documentación clara, un dev nuevo que escribe `prisma.orderItem.findMany()` directo podría leakar items cross-tenant. El issue es real: CRIT-1 del audit (demo-products wipe global) explotó exactamente este gap en OrderItem/SaleItem.

## Decisión

**Los modelos indirectos NO van en TENANT_MODELS.** Se acceden SIEMPRE vía el padre tenant-scoped, nunca directo desde route handlers.

### Modelos indirectos (FK → padre tenant-scoped)

| Modelo | Padre tenant-scoped | Acceso correcto |
|---|---|---|
| `OrderItem` | `Order.tenantId` | `OrdersDB.list(tenantId).items` o `include: { items }` |
| `SaleItem` | `Sale.tenantId` | `SalesDB.list(tenantId).items` |
| `PurchaseItem` | `PurchaseOrder.tenantId` | `PurchasesDB.list(tenantId).items` |
| `ReturnItem` | `Return.tenantId` | `ReturnsDB` |
| `RecetaIngrediente` | `Receta.tenantId` | `RecetasDB.getById(tenantId, id).ingredientes` |
| `ShoppingListItem` | `ShoppingList.tenantId` | `ShoppingListsDB` |
| `BundleItem` | `Bundle.tenantId` | `BundlesDB` |
| `CashMovement` | `CashRegister.tenantId` | `SalesDB.addMovement(tenantId, cashRegisterId, mov)` |
| `WholesaleOrderItem` | `WholesaleOrder.tenantId` | `WholesaleDB` |

### Reglas

1. **NUNCA** consultar un modelo indirecto directo: `prisma.orderItem.findMany({...})` está PROHIBIDO en route handlers y RSC. Usar el padre con `include`.
2. **Para deletes en cascada** (ej. borrar items al borrar order): la transacción debe pre-filtrar el padre por `tenantId` y usar el set de IDs resultante para los children. Ver `app/api/admin/demo-products/route.ts` post-fix CRIT-1 como ejemplo canónico.
3. **Para queries de reporting cross-entity** (ej. "items vendidos en el mes"): joinear vía el padre con `where: { sale: { tenantId } }` o `where: { order: { tenantId } }`.
4. **ESLint** (rule pendiente): debe bloquear `prisma.<indirectModel>.(deleteMany|updateMany)` sin un `where.<padre>.tenantId` literal.

### Excepciones explícitas

- **`CommissionLedger`** SÍ tiene tenantId directo (está en TENANT_MODELS).
- **`OrderStatusHistory`** SÍ tiene tenantId directo (está en TENANT_MODELS).
- **`PriceHistory`** SÍ tiene tenantId directo (está en TENANT_MODELS).
- **`InventoryMovement`** SÍ tiene tenantId directo (está en TENANT_MODELS).

## Consecuencias

### Positivas
- Schema más pequeño: no duplicar tenantId donde la FK al padre ya lo garantiza.
- Inserciones más simples: el padre escribe tenantId, los children lo heredan al joinear.
- Sin riesgo de divergencia (item.tenantId ≠ padre.tenantId imposible).

### Negativas
- Devs nuevos deben aprender la convención. Mitigado con ADR + ESLint rule.
- Queries de reporting requieren explicit join (no `findMany` directo).

## Alternativas consideradas

1. **Agregar tenantId a TODOS los items**: rechazado — duplica datos y abre la puerta a divergencia.
2. **Postgres RLS**: rechazado — Buleje usa aislamiento app-level por simplicidad operacional y para soportar superadmin cross-tenant queries sin SET LOCAL.
3. **Prisma Extension que valida automáticamente el join**: complejo de implementar sin penalizar performance. La ESLint rule es suficiente como guard.

## Referencias

- `lib/tenant.ts` — TENANT_MODELS set
- `app/api/admin/demo-products/route.ts` — patrón canónico de cascada con pre-filter
- ADR-082 — aislamiento multi-tenant base
- ADR-093 — cross-tenant guard pattern
- Audit 2026-05-11 — CRIT-1 fue exactamente este gap
