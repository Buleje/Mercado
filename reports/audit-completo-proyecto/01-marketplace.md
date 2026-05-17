# Audit Marketplace Multi-Vendor — 2026-05-17

**Alcance:** 22 archivos · `app/marketplace/**`, `app/api/marketplace/**`, `components/marketplace/**`, `lib/db/marketplace*.db.ts`, multi-vendor WhatsApp checkout.

**Hallazgos:** 3 P0 · 6 P1 · 4 P2 (más 16 ya documentados en `reports/audit-comisiones/REPORT.md`).

> **Nota actualización 2026-05-17 post-audit:** los P0 de comisiones que este reporte cita como "sin fix" ya fueron cerrados en commits `e0583448` (feat comisiones audit + 3 construcciones) y `c7fd3f59` (hot-fix P0 admin). Confirmar antes de re-trabajar.

---

## P0 — Críticos

| # | Archivo:Línea | Hallazgo | Confianza |
|---|---|---|---|
| 1 | `app/api/marketplace/stores/my/products/route.ts:93` | Cross-tenant inventory leak: `storeProduct.findMany` sin filtro `tenantId` busca precios competencia cross-store por barcode — un admin puede inferir precios de competidores con mismo barcode. | Alta |
| 2 | `lib/whatsapp/concierge/multi-vendor-checkout.ts:133-142` | Error swallowing en `$executeRaw UPDATE Order SET paymentApprovalId`: `.catch(() => {})` silencioso. Si la columna no existe en prod, las órdenes WhatsApp quedan sin `paymentApprovalId` y superadmin no puede aprobar Yape — dinero en limbo sin visibilidad. | Alta |
| 3 | `app/api/marketplace/orders/route.ts:411-461` | Dos `(async () => {})()` (notif vendor + bienvenida-cupón) terminan en `catch { /* silencioso */ }` (L461, L541). Si `prisma.coupon.create` falla, error oculto sin traza. Patrón correcto: `catch (err) { logger.warn(...) }`. | Alta |

## P1 — Altos

| # | Archivo:Línea | Hallazgo |
|---|---|---|
| 4 | `app/api/marketplace/orders/route.ts:250-256` | `prisma.store.findUnique` vacation-check sin `tenantId`. Slug globally unique HOY, pero el `catch {}` vacío silencia bugs de registro futuros. |
| 5 | `components/marketplace/MarketplaceCheckoutModal.tsx:398` | `total` calculado client-side enviado a `/api/marketplace/cart/save` que persiste sin recomputo — analytics con totales manipulables. |
| 6 | `app/api/marketplace/stores/apply/route.ts` | Sin validación DNI/RUC. Vendor puede registrarse con datos falsos; `ownerPhone` es único identificador real. |
| 7 | `lib/whatsapp/concierge/multi-vendor-checkout.ts:222-228` | `checkoutMultiVendor` WhatsApp solo hace `findUnique(storeId)` para obtener `commission` — NO verifica `isPublished`. Store desaprobada recibe órdenes WhatsApp. |
| 8 | `lib/whatsapp/concierge/multi-vendor-checkout.ts:190-210` | Path "reuse existing PaymentApproval" (idempotencia) recomputa subtotales desde cart cliente sin revalidar precios DB. Cliente modifica cart entre intentos → totales rotos. |
| 9 | `contexts/cart-context.tsx:244` | `tenantSlug === "main"` → `validProductIdsRef = null` (sin filtro cross-tenant). Marketplace global usa "main" — producto de cualquier tenant se agrega sin validación de pertenencia. Backend rechaza pero UX degradado. |

## P2 — Medios

| # | Archivo:Línea | Hallazgo |
|---|---|---|
| 10 | `app/api/marketplace/orders/route.ts:371-379` | `scheduledFor` persisted via `$executeRaw` con template literal interpolando `Date` directo — serialización driver-dependent. |
| 11 | `app/api/marketplace/orders/[id]/route.ts:241-268` | Auto-cupón "VUELVE{suffix}": `.then` dispara push+WhatsApp dentro del cadena del `create()`. Lógica invertida — si create falla por código duplicado, notif igual se manda. |
| 12 | `app/api/marketplace/stores/my/products/route.ts:66-74` | `$queryRaw` justifica usar raw "porque Prisma Client en dev a veces no tiene el modelo cacheado" — justificación frágil. |
| 13 | `components/marketplace/MarketplaceCheckoutModal.tsx:263` | `loyaltyDiscount` calculado client-side puede diferir del server-side por drift de puntos — mismatch UX (no fraud). |

---

## Análisis por área

**1. Multi-tenant + multi-vendor isolation:** generalmente sólido. `createFromCart` siempre pasa `store.tenantId`. Único leak real: competition pricing (P0-1).

**2. Comisiones:** ya cerradas en commit `e0583448` (este reporte es pre-fix). Verificar contra `reports/audit-comisiones/REPORT.md`.

**3. Vendor onboarding:** `isPublished: false` correcto en registro, falla en WhatsApp checkout (P1-7). Sin DNI/RUC (P1-6).

**4. Cart cross-store:** invariante server-side respetada. Cliente-side preview OK. Gap: `tenantSlug === "main"` sin filtro (P1-9).

**5. WhatsApp multi-vendor:** idempotencia por `conversationId` implementada. Bug crítico en path de reuse (P1-8).

---

## Acciones sugeridas (priorizado)

| Acción | Tipo | Prioridad |
|---|---|---|
| Validar comisiones cerradas (ya en commit `e0583448`) — re-correr este audit para confirmar | Verify | Urgente |
| Agregar `isPublished: true` check en `checkoutMultiVendor` (P1-7) | Security fix | Alta |
| Quitar `catch { /* silencioso */ }` en async IIFE de orders/route.ts (P0-3) | Observabilidad | Alta |
| Logger.warn en `$executeRaw UPDATE paymentApprovalId` catch (P0-2) | Observabilidad + dinero | Alta |
| Restringir competition-price a storeProducts del tenant (P0-1) o ADR explícito | Security/privacidad | Media |
| Revalidar precios DB en path "reuse approval" WhatsApp (P1-8) | Correctness dinero | Media |

**Bloqueante merge a master:** P0-1, P0-2, P0-3 + P1-7 (store no publicada recibe WhatsApp).
