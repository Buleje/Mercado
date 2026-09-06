# ADR-298 — Dropshipping: fulfillment automático al proveedor

**Status:** Proposed
**Fecha:** 2026-06-21
**Autor:** Brandon (Buleje) + Claude Code

## 1. Contexto

Brandon quiere operar un negocio de **dropshipping** bajo una marca propia
(tienda standalone "CompraFácil", ver Fase 1: tenant `comprafacil`,
`Store.isPublished=false`, storefront white-label en `/t/comprafacil` →
`comprafacil.com`). En dropshipping el vendedor **no tiene stock**: cuando entra
un pedido pagado, el **proveedor despacha directo al cliente final**.

Hoy la plataforma tiene `Supplier`, `Order`/`OrderItem`, `PurchaseOrder` y
máquina de estados de órdenes (ADR-050), pero **no existe** el puente automático
"pedido del cliente → orden al proveedor → tracking". El dueño tendría que
reenviar cada pedido a mano. Restricciones: multi-tenant (todo scopeado por
`tenantId`), schema es zona de peligro (migración expand→migrate→contract,
pooler Supabase), pagos/órdenes no se tocan sin cuidado.

## 2. Decisión

Agregar un **módulo de fulfillment dropship** que, al confirmarse/pagarse una
orden en una tienda con dropship habilitado, **agrupa los ítems por proveedor**,
crea un registro de fulfillment por proveedor, **notifica al proveedor** (con la
dirección del cliente) y permite **trackear** el envío desde el admin. Gated por
flag per-tenant para no afectar tiendas normales (bodega).

**Schema (expand-only, aditivo):**

- `Product` (+ campos, todos nullable/con default → sin romper filas existentes):
  - `isDropship Boolean @default(false)`
  - `dropshipSupplierId String?` (FK lógica a `Supplier.id`)
  - `supplierSku String?`, `supplierUrl String?`
  - (costo del proveedor: se reusa `costPrice` existente → margen = `price − costPrice`)

- **Nuevo modelo `DropshipFulfillment`** (1 por proveedor por orden):
  `id, tenantId, orderId, supplierId, status, itemsJson (snapshot líneas+qty+costo),
   shipName, shipPhone, shipLocation, shipReference, costTotal Decimal?,
   supplierOrderRef String?, carrier String?, trackingNumber String?, trackingUrl String?,
   notifiedAt DateTime?, createdAt, updatedAt` + índices `(tenantId,status)`, `(orderId)`.
  Estados: `pending → forwarded → confirmed → shipped → delivered | cancelled`.

- **Flag**: `Settings.dropshipEnabled Boolean @default(false)` (per-tenant).

**Flujo:** hook en `lib/db/orders.db.ts` al pasar a `confirmado`/pagado → si
`Settings.dropshipEnabled` → toma los `OrderItem` cuyo `Product.isDropship` →
agrupa por `dropshipSupplierId` → crea `DropshipFulfillment` (pending) →
notifica al proveedor (WhatsApp Twilio / email Resend, fire-and-forget con log).

**Módulo admin** "Dropshipping": (a) vincular productos↔proveedor + costo/SKU/URL,
(b) lista de fulfillments con estado + carga de tracking, (c) margen por pedido.
Vive como tab gated por `dropshipEnabled` (no satura tiendas normales).

**Archivos impactados:** `prisma/schema.prisma`, `lib/db/dropship.db.ts` (nuevo,
patrón db-class: `tenantId` 1er arg, cache+audit+invalidate), `lib/db/orders.db.ts`
(hook), `app/api/admin/dropship/**` (endpoints), módulo admin nuevo +
`tab-categories`/`tab-data`/`TabRouter`/`plan-tiers` (checklist 6 lugares),
notificación reusando Twilio/Resend.

## 3. Consecuencias

### Positivas
- Negocio dropshipping operable sin app nueva — mismo código, mismo admin.
- Margen automático (price − costPrice) → entra a finanzas/ganancias del tenant.
- Aditivo + flag → cero impacto en bodega/otras tiendas.

### Negativas
- Acopla `orders.db` (zona sensible) con un hook → debe ser fire-and-forget,
  nunca romper el checkout si falla la notificación.
- Notificación depende de Twilio/Resend configurados; sin eso, queda en `pending`
  para reenvío manual (degradación elegante).

### Migraciones requeridas
- **Expand**: `ALTER TABLE "Product" ADD COLUMN ...` (nullable/default) +
  `CREATE TABLE "DropshipFulfillment"` + `ALTER TABLE "Settings" ADD dropshipEnabled`.
- SQL **idempotente** (`IF NOT EXISTS`) + script `pg` con `DIRECT_URL` +
  `prisma generate` + **reiniciar dev** (gotcha pooler, ver
  reference_prisma_migrate_pooler_workaround). Sin contract (no se borra nada).

## 4. Alternativas evaluadas

| Opción | Pros | Contras | Por qué descartada |
|---|---|---|---|
| App/repo separado para CompraFácil | aislamiento total | duplica mantenimiento, pierde admin unificado | es justo lo que Brandon quiere evitar |
| Reusar `PurchaseOrder` como fulfillment | no agrega modelo | PurchaseOrder es para compras de stock propio (otro flujo/estados) | semántica distinta, ensucia ambos |
| Forward 100% manual (sin schema) | cero código | no escala, el dueño reenvía a mano cada pedido | es exactamente la Fase 1 (ya disponible); Fase 2 automatiza |
| Integración API directa por proveedor (AliExpress/CJ) | fulfillment real automático | cada proveedor su API + credenciales | Fase 2b; el MVP usa notificación (WhatsApp/email) |

## 5. Verificación
- [ ] Migración expand aplicada + `prisma generate` + dev reiniciado
- [ ] `dropship.db.ts` cumple rubric db-class (tenantId 1er arg, cache/audit/invalidate)
- [ ] Hook en orders.db es fire-and-forget (test: falla notificación → checkout OK)
- [ ] Flag `dropshipEnabled=false` → cero cambios en tiendas normales (bodega)
- [ ] E2E: orden pagada en `comprafacil` → crea DropshipFulfillment(s) por proveedor
- [ ] Memoria actualizada + rollback plan (drop table + columnas, son aditivas)

## 6. Referencias
- ADR-050 (máquina de estados de órdenes) · ADR-059 (marketplace)
- Fase 1: tenant `comprafacil` standalone (`scripts/create-comprafacil.ts`)
- Memorias: [[project_marketplace_module_decomp_2026-06-15]], reference_prisma_migrate_pooler_workaround
- CLAUDE.md §6 zona de peligro (schema, orders.db)
