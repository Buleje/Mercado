# Audit Quality — Panel Admin (2026-05-17)

Alcance: 80 archivos (41 routes con prisma directo + 90 lib/db + top 15 componentes).
Hallazgos: 4 P0, 7 P1, 6 P2, 2 Bajos.

---

## P0 — Críticos

| # | Archivo:Línea | Regla | Descripción |
|---|--------------|-------|-------------|
| Q-P0-1 | `app/api/admin/orders/[id]/payment-proof/route.ts:65` | Regla 3 | `prisma.paymentApproval.findUnique({ where: { id: order.paymentApprovalId } })` sin tenantId. Guard previo via `order.tenantId` (L56) protege HOY pero defense-in-depth perdido. Si admin de otro tenant conoce el ID puede leer comprobantes. |
| Q-P0-2 | `app/api/admin/plan/checkout/stripe-session/route.ts:38` | Regla 9 | `requireAdmin(req)` sin roles → almacenero/cajero pueden iniciar sesión Stripe del tenant. Restringir a `["owner", "admin"]`. |
| Q-P0-3 | `app/api/admin/orders/[id]/payment-proof/route.ts:29` | Regla 9 | Endpoint que aprueba comprobantes de pago acepta cualquier rol autenticado. |
| Q-P0-4 | `lib/db/purchases.db.ts` (3 métodos) | Regla 5 | `add(supplier)`, `delete(supplier)`, `add(purchaseOrder)` sin `invalidate` posterior. Stock y proveedores quedan stale → POS muestra inventario incorrecto. |

---

## P1 — Altos

| # | Archivo | Regla | Descripción |
|---|---------|-------|-------------|
| Q-P1-1 | 41 archivos en `app/api/admin/**` | Regla 1 | `prisma.*` directo fuera de `lib/db/*.db.ts`. Críticos con writes: `sunat/generate-invoice`, `delivery-zones`, `setup-marketplace-store`, `store-reviews`. La allowlist legacy crece. |
| Q-P1-2 | `app/api/admin/today-summary/route.ts:34-108` | Regla 1 | 8 llamadas `prisma.*` directas en hot-path de lectura. Sin cache, sin audit, sin tenant isolation declarativa. |
| Q-P1-3 | `lib/db/product-images.db.ts` (create/update/delete) | Regla 5 | Sin `invalidate` — vitrina pública muestra fotos antiguas hasta TTL natural. |
| Q-P1-4 | `lib/db/finance.db.ts` (add Payable, delete Payable, add Expense) | Regla 5 | Tesoreria muestra datos stale tras crear/eliminar gastos. |
| Q-P1-5 | `components/admin/TurnosModule.tsx` (2147 LOC) | Calidad | 7× el límite de 300. Modificado en este branch. Mezcla apertura/cierre caja + cálculos + UI. |
| Q-P1-6 | `components/admin/VoiceCommandPOS.tsx` (484 LOC) y `pos/POSCustomerSearch.tsx` (560 LOC) | Calidad | Ambos >300 LOC. Voice mezcla speech recognition con lógica POS sin hook. |
| Q-P1-7 | 17 endpoints | Regla 9 | `requireAdmin(req)` sin array. Notables: `chat/route.ts`, `documents/share/[shareId]`, `overview/route.ts` (métricas financieras), `documents/templates/generate`. |

---

## P2 — Medios

| # | Archivo:Línea | Regla | Descripción |
|---|--------------|-------|-------------|
| Q-P2-1 | `KioskPOS.tsx:243`, `KioskMode.tsx:124`, `MobilePOS.tsx:255`, `POSView.tsx:1890,2176` | Regla 6 | `cart.reduce(price * quantity)` como total cliente. Riesgo: manipulación localStorage. Verificar recomputo backend. |
| Q-P2-2 | `AIStatusBanner.tsx:64`, `DevolucionesProveedorModule.tsx:125` | Regla 7 | `catch {}` vacío — error swallowing puro (no fire-and-forget). |
| Q-P2-3 | `lib/db/variant-catalog.db.ts` (deleteTemplate, deleteOption) | Regla 5 | Sin invalidación — opciones eliminadas persisten en cache. |
| Q-P2-4 | `app/api/sales/csv/route.ts` | Regla 9 | `requireAdmin(req)` sin roles — exportación de ventas accesible por repartidor con token admin. |
| Q-P2-5 | `app/api/admin/plan/checkout/stripe-session/route.ts:62` | Regla 3 | Patrón `where: { OR: [{ id: auth.tenantId }, { slug: auth.tenantId }] }` puede resolver al tenant equivocado si slug de A == id de B. |
| Q-P2-6 | `app/api/admin/setup-marketplace-store/route.ts:52` | Regla 3 | `tenantId: { in: [tenant.id, tenant.slug] }` — idem riesgo. |

---

## Lo que ya está bien

- **Regla 11** (raw SQL interpolation): cero violaciones. Solo `$queryRaw\`SELECT 1\`` en /health.
- **Regla 2** (Zod `.parse()` directo): cero violaciones en alcance.
- **Regla 4** (`force-dynamic`): los 3 hits son comentarios documentando la remoción correcta.
- **Recetario** marcado en grep previo: tiene `eslint-disable` documentado + tenantId en todos los WHERE. Aceptable.

---

## Patrones cross-cutting

1. **41 routes con prisma directo** — tendencia creciente desde allowlist de 318. Necesita CI gate adicional.
2. **17 endpoints con `requireAdmin(req)` sin roles** — script CI que falle ante esto sería gran ROI.
3. **6 lib/db sin invalidate en writes** — falta cobertura sistemática.
4. **3 monolitos POS-related modificados este branch** — TurnosModule, VoiceCommandPOS, POSCustomerSearch superan límites.

---

*Generado: 2026-05-17 | Branch: feat/checkout-payment-proof*
