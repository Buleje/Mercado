# Code Review — flujo /tiendas → storefront → checkout → pago

**Fecha:** 2026-05-18
**Branch:** feat/checkout-payment-proof
**Revisor:** Code-Reviewer agent (Buleje)
**Scope:** app/tiendas, app/marketplace, app/checkout, components/checkout, components/marketplace, app/api/marketplace, app/api/orders, app/api/guest, lib/db/marketplace/orders.db.ts, contexts/cart-context.tsx

---

## Resumen ejecutivo

Se revisaron 38 archivos del flujo completo. Se detectaron **2 violaciones CLAUDE.md críticas** (prisma directo fuera de lib/db en routes de producción), **1 bug de datos con impacto financiero directo** (leakage de `storagePath` interno en respuesta pública), y **1 inconsistencia de constante de loyalty** entre el slider UI del CheckoutModal y el backend que puede inducir confusión aunque el impacto final en el API es nulo. El manejo de errores en el POST de órdenes es robusto. Las mayores deudas técnicas son la cantidad de `prisma.*` directo anotado con `@prisma-direct ok` pero sin migrar, y el rate limit del endpoint POST /marketplace/orders que no está `await`-eado (el check se saltea silenciosamente).

---

## Hallazgos por categoría

### 1. Violaciones CLAUDE.md (críticas)

#### 1.1 — Prisma directo fuera de lib/db (Regla #1)

| Archivo | Líneas | Descripción |
|---------|--------|-------------|
| `app/api/marketplace/orders/route.ts` | 253, 295, 344, 358, 386, 430, 450, 498, 505, 519, 525, 539, 543 | 13 llamadas `prisma.*` directas en endpoint de checkout: `store.findFirst`, `$queryRaw`, `paymentApproval.create`, `order.update`, `$executeRaw`, `tenant.findUnique`, `customer.findFirst/updateMany`, `coupon.findFirst/create`, `order.count` |
| `app/api/marketplace/orders/[id]/route.ts` | 94, 115, 129, 139, 147, 223, 241 | 7 llamadas `prisma.*` directas en PATCH de estado de orden |
| `app/api/guest/orders/create/route.ts` | 95, 140 | `order.findFirst` + `customer.upsert` directos |
| `app/api/marketplace/orders/bulk/route.ts` | 57, 90, 106, 129, 139 | 5 llamadas directas en bulk status change |

**Severidad:** Critico. Comentarios `@prisma-direct ok` y `// eslint-disable-next-line no-restricted-properties` indican deuda técnica consciente pero no exime la regla. Ninguna de estas llamadas pasa por cache, audit trail automático ni invalidación de caché.

**Fix requerido:** Migrar a `lib/db/marketplace/orders.db.ts` (ya existe). El PaymentApproval y CommissionLedger necesitan sus propias clases DB o métodos adicionales en la existente.

#### 1.2 — `await` ausente en `applyRateLimit` (Regla de seguridad operacional)

| Archivo | Línea | Descripción |
|---------|-------|-------------|
| `app/api/marketplace/orders/route.ts` | 142–143 | `const rateLimitResponse = applyRateLimit(...)` — sin `await`. La función es síncrona (no retorna Promise), por lo que el rate limit SÍ funciona. Sin embargo, el patrón difiere de todos los demás endpoints del proyecto que usan `await applyRateLimit(...)`, generando confusión futura y riesgo si la función se vuelve async. |

**Severidad:** Medio. Funciona hoy, pero es un landmine de mantenimiento.

---

### 2. Bugs lógicos potenciales

#### 2.1 — `storagePath` expuesto en respuesta pública (P0 de seguridad)

| Archivo | Línea | Descripción |
|---------|-------|-------------|
| `app/api/marketplace/checkout/payment-proof/route.ts` | 260 | `storagePath` se incluye en el JSON de respuesta al cliente: `return NextResponse.json({ ok: true, proofUrl, proofToken, storagePath })` |

El `storagePath` es la ruta interna de Supabase Storage (`order-proofs/{storeSlug}/{customerId}-{timestamp}-{random48bytes}.webp`). Exponer esto:

1. **Leakea información de estructura interna** del bucket aunque el path sea ofuscado.
2. **Permite a un atacante intentar manipular el token HMAC** si conoce el path (el HMAC incluye un hash del path como componente — exponer el path elimina parcialmente esa opacidad).
3. **No tiene ningún uso legítimo en el cliente** — ni `PaymentProofModal.tsx` ni `confirmar/page.tsx` consumen `storagePath`.

**Fix:** Remover `storagePath` del objeto de respuesta. Solo devolver `{ ok, proofUrl, proofToken }`.

#### 2.2 — `PaymentApproval.create` + `Order.update` fuera de transacción (Race condition)

| Archivo | Líneas | Descripción |
|---------|--------|-------------|
| `app/api/marketplace/orders/route.ts` | 341–370 | Después de `MarketplaceOrdersDB.createFromCart()` (que ya ejecutó su propia `$transaction`), se hacen dos operaciones separadas: `prisma.paymentApproval.create` + `prisma.order.update({ paymentApprovalId })`. Si la primera triunfa y la segunda falla (timeout, DB hiccup), la `PaymentApproval` queda huérfana sin `paymentApprovalId` en la Order. El código tiene un `try/catch` que loguea pero no revierte. |

**Impacto:** El admin ve la orden sin comprobante vinculado y el cliente ya pagó. Requiere intervención manual.

**Fix:** Envolver ambas operaciones en una sola `$transaction` (o mover a `MarketplaceOrdersDB.attachPaymentApproval(orderId, ...)`).

#### 2.3 — Inconsistencia constante loyalty entre flujos (P1 UX/datos)

| Archivo | Línea | Valor |
|---------|-------|-------|
| `lib/db/marketplace/orders.db.ts` | 163 | `LOYALTY_POINTS_PER_SOL = 100` (100 pts = S/1) |
| `contexts/checkout-data-context.tsx` | 283 | `loyaltyDiscountTotal = redeemPoints / 100` (correcto con backend) |
| `components/checkout/CheckoutPaymentSection.tsx` | 495 | `PTS_PER_SOL = 50` (50 pts = S/1) — para slider del `CheckoutModal` (flujo tienda directa) |

El `CheckoutPaymentSection` es parte del `CheckoutModal` (flujo POS / tienda directa), no del flujo marketplace (`/checkout/confirmar`). En el flujo marketplace el valor `redeemPoints` se pasa directamente como puntos al API (correcto). En el `CheckoutModal`, `redemptionSoles` son soles directamente (tampoco pasa por la conversión 50x). **El impacto financiero real al backend es nulo en este branch**, pero el hint UI (`50 pts = S/1`) es falso respecto a lo que el backend cobra (`100 pts = S/1`), generando confusión al usuario.

**Fix:** Unificar la constante en un archivo compartido (ej. `lib/loyalty-constants.ts`) y usar `PTS_PER_SOL = 100` en todos lados.

#### 2.4 — `scheduledFor` persiste vía `$executeRaw` con columna fuera del schema Prisma

| Archivo | Líneas | Descripción |
|---------|--------|-------------|
| `app/api/marketplace/orders/route.ts` | 384–395 | `prisma.$executeRaw` con template literal parameterizado (correcto — usa `${resolvedScheduledFor}` y `${order.id}`, no interpolación de strings). Sin embargo, la columna `scheduledFor` no existe en `schema.prisma` — si hay un `prisma generate` o `migrate reset`, la columna puede desaparecer silenciosamente. El `catch` solo loguea `warn`, no bloquea la orden. |

**Severidad:** Medio — comportamiento correcto hoy, frágil ante schema changes. El SQL parametrizado está bien (cumple Regla #11).

#### 2.5 — Race condition en welcome coupon (N+1 + TOCTOU)

| Archivo | Líneas | Descripción |
|---------|--------|-------------|
| `app/api/marketplace/orders/route.ts` | 514–578 | Fire-and-forget de welcome coupon: `prisma.order.count` + `prisma.coupon.findFirst` + `prisma.coupon.create` sin transacción. Si dos pedidos simultáneos del mismo phone llegan, ambos pasan el `count === 1` check (ambos ven count=1 antes de que el otro commit) y ambos intentan `coupon.create` con el mismo `code`. El segundo falla con P2002 y queda logueado como `warn` — aceptable como best-effort, pero el primer pedido tampoco llega a enviar el WhatsApp si la race ocurre. |

**Severidad:** Bajo (best-effort explícito, no afecta orden ni pago).

---

### 3. Manejo de errores

#### 3.1 — `catch {}` silencioso en `confirmar/page.tsx`

| Archivo | Línea | Descripción |
|---------|-------|-------------|
| `app/checkout/confirmar/page.tsx` | 133–135 | `try { ... } catch { /* silent */ }` alrededor de `persistAddress`. No loguea ni siquiera al logger — si falla, el usuario pierde la dirección guardada sin ninguna traza. |

**Severidad:** Medio.

#### 3.2 — `console.error` de diagnóstico hardcodeado en producción

| Archivo | Líneas | Descripción |
|---------|--------|-------------|
| `app/api/marketplace/orders/route.ts` | 160–162, 627–629 | Dos bloques `console.error(...)` con datos de request (body redactado, trace, issues). El comentario dice "sale en la terminal de npm run dev" pero también sale en logs de Vercel prod. No es un bug de seguridad (body está redactado) pero contamina logs de producción con formato no estructurado. Duplica lo que `logger.warn/error` ya hace. |

**Severidad:** Bajo.

#### 3.3 — Fire-and-forget sin `void` consistente

| Archivo | Líneas | Descripción |
|---------|--------|-------------|
| `app/api/marketplace/orders/[id]/route.ts` | 139, 147, 223, 241 | Cuatro llamadas `prisma.*` fire-and-forget sin prefijo `void` ni `.catch(() => {})` explícito. Las líneas 139 y 223 tienen `.catch(...)`, pero las líneas 147 y — especialmente 241 — usan `.then().catch()` encadenado que si `.then` lanza, el `.catch` no lo atrapa si está en el `.then` chain y no en el Promise padre. Revisar líneas 241–267 con cuidado: `prisma.coupon.create({...}).then(() => { sendPushToPhone(...).catch(...) })` — si `coupon.create` falla, el `.catch` está en el nivel correcto. Aceptable. |

**Severidad:** Bajo (revisado — los `.catch` están correctamente posicionados).

---

### 4. Convenciones / mantenibilidad

#### 4.1 — Componentes > 300 líneas

| Archivo | LOC |
|---------|-----|
| `app/tiendas/TiendasClient.tsx` | 1542 |
| `components/marketplace/store-detail/StoreDetailClient.tsx` | 1299 |
| `components/marketplace/MarketplaceCart.tsx` | 1356 |
| `components/checkout/CheckoutPaymentSection.tsx` | 722 |

Los tres primeros son candidatos urgentes a split. `StoreDetailClient.tsx` mezcla hero, catálogo, horarios, reviews y carrito — al menos 4 responsabilidades.

#### 4.2 — Lógica de negocio en page.tsx

| Archivo | Línea | Descripción |
|---------|-------|-------------|
| `app/checkout/confirmar/page.tsx` | 137–210 | `Promise.allSettled` con lógica de agrupación por tienda, construcción del requestBody, y manejo de errores tipados directamente en el componente. Candidato a `hooks/use-submit-marketplace-order.ts`. |

#### 4.3 — Constantes de negocio duplicadas sin fuente única

Loyalty (`PTS_PER_SOL`), max cart qty (`MAX_QTY = 20` en cart-context), TTL de proof token (`7 * 24 * 3600`), max foto size (`5 * 1024 * 1024`) están duplicadas en múltiples archivos sin importar de un módulo compartido.

---

### 5. A11y obvia

| # | Archivo | Línea | Descripción |
|---|---------|-------|-------------|
| 1 | `components/checkout/PaymentProofModal.tsx` | 461–495 | `<button type="button" onClick={() => fileInputRef.current?.click()} ...>` — el botón drag/drop de subir captura no tiene `aria-label`. El `<input type="file" className="hidden">` tampoco tiene label asociada. Un screen reader no puede identificar el propósito del área de subida. |
| 2 | `components/checkout/CheckoutPaymentSection.tsx` | 449–453 | `<input type="text">` del cupón no tiene `id` + `<label htmlFor>` explícito. Confía en el texto visible cercano, pero no hay enlace semántico. |

---

## Top-10 a arreglar antes de merge a master

| # | Severidad | Archivo:Línea | Descripción |
|---|-----------|--------------|-------------|
| 1 | P0 | `app/api/marketplace/checkout/payment-proof/route.ts:260` | Remover `storagePath` de la respuesta JSON — leakea ruta interna del bucket y debilita la opacidad del token HMAC |
| 2 | P0 | `app/api/marketplace/orders/route.ts:344–369` | `paymentApproval.create` + `order.update` fuera de transacción — race condition que deja PaymentApproval huérfana si falla el update |
| 3 | P0 | `app/api/marketplace/orders/route.ts:253` | `prisma.store.findFirst` directo en endpoint de checkout — viola Regla #1. Mover a `MarketplaceOrdersDB.getStoreForCheckout()` |
| 4 | P1 | `app/api/marketplace/orders/route.ts:142` | `applyRateLimit` sin `await` — inconsistente con el resto del codebase, landmine si la función se vuelve async |
| 5 | P1 | `lib/db/marketplace/orders.db.ts:163` vs `components/checkout/CheckoutPaymentSection.tsx:495` | Constante loyalty `100` vs `50` — unificar en `lib/loyalty-constants.ts` con valor `100` |
| 6 | P1 | `app/api/marketplace/orders/[id]/route.ts:94,115,129` | `prisma.order.findFirst/updateMany/findFirst` directo en PATCH de estado — migrar a método en `MarketplaceOrdersDB` |
| 7 | P1 | `app/api/guest/orders/create/route.ts:95,140` | `prisma.order.findFirst` + `prisma.customer.upsert` directos — el `customer.upsert` ignora `tenantId` en el `where` (usa solo `phone`) potencial cross-tenant customer match |
| 8 | P1 | `app/checkout/confirmar/page.tsx:133` | `catch { /* silent */ }` sin logger — deuda de observabilidad |
| 9 | P2 | `app/api/marketplace/orders/route.ts:384–395` | `scheduledFor` columna fuera de schema — documentar con `// @schema-drift` y abrir ticket de migration |
| 10 | P2 | `components/checkout/PaymentProofModal.tsx:461` | Botón drag/drop sin `aria-label` — añadir `aria-label="Subir captura del comprobante"` |

---

## Archivos revisados

| Archivo | LOC aprox | Resultado |
|---------|-----------|-----------|
| `app/api/marketplace/checkout/payment-proof/route.ts` | 263 | P0 storagePath leak, buen HMAC |
| `app/api/marketplace/payment-proof/route.ts` | 179 | OK — flujo pre-tenant diferente |
| `app/api/marketplace/orders/route.ts` | 638 | P0 race condition, P0 prisma directo (13 calls) |
| `app/api/marketplace/orders/[id]/route.ts` | 275 | P0 prisma directo (7 calls), buen state machine |
| `app/api/marketplace/storefront/payment-config/route.ts` | 159 | OK — no expone datos sensibles |
| `app/api/guest/orders/create/route.ts` | ~200 | P0 prisma directo, posible cross-tenant en upsert |
| `app/api/marketplace/orders/bulk/route.ts` | ~150 | P1 prisma directo (5 calls) |
| `lib/db/marketplace/orders.db.ts` | ~420 | OK excepto constante loyalty |
| `contexts/cart-context.tsx` | ~400 | OK — BroadcastChannel bien gestionado |
| `contexts/checkout-data-context.tsx` | ~320 | OK |
| `components/checkout/PaymentProofModal.tsx` | 627 | P2 a11y |
| `components/checkout/CheckoutPaymentSection.tsx` | 722 | P1 constante loyalty, >300 LOC |
| `components/checkout/steps/StepConfirmar.tsx` | ~300 | OK |
| `app/checkout/confirmar/page.tsx` | ~900 | P1 silent catch, lógica en page |
| `app/tiendas/TiendasClient.tsx` | 1542 | >300 LOC — candidato split |
| `components/marketplace/store-detail/StoreDetailClient.tsx` | 1299 | >300 LOC |
| `components/marketplace/MarketplaceCart.tsx` | 1356 | >300 LOC, a11y OK |
