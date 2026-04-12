# Marketplace — Research de mejoras 2026-04-09

> Scout: MARKETPLACE-SCOUT agent | Repo: `bodega-san-martin` | Base de investigacion: `app/marketplace/**`, `app/api/marketplace/**`, `lib/db/marketplace.db.ts`, `lib/marketplace/sponsored-ranker.ts`, `prisma/schema.prisma` (modelos 2333-3103).

---

## Estado actual (lo que YA existe)

El marketplace esta **bastante avanzado** pero con gaps criticos en el flujo comercial que evitan que sea realmente multi-vendor. Existen los modelos `Store`, `StoreProduct`, `StoreBanner`, `CommissionLedger`, `WholesaleOrder`, `StorePermission`, `SponsoredBoost`, `StockoutPrediction`, `SalesAnomaly`, `SearchSuggestion`, `ConversationThread`/`Message` (chat buyer-seller D2), `DeliveryRoute`/`Stop` (D1). Hay dos vistas de discovery (`tiendas` grid + `catalogo` infinite scroll Temu-style), busqueda con boosts + fuzzy + did-you-mean, filtros por zona/categoria/precio, geo haversine con fallback por zona (coords hardcoded Pucallpa), recomendaciones personalizadas (`recommendations-personalized.db.ts`), reviews con upload de fotos, sponsored boosts con bid+budget+CTR, vendor dashboard con analytics de 14 queries paralelas, admin overview cross-store, y `stripe-connect.ts` con `createConnectedAccount` + split payment helpers ya escritos.

Sin embargo, el **core comercial esta roto o incompleto**: (1) el carrito se guarda por `storeId` (`byStore`) pero `POST /api/marketplace/orders` crea **un pedido por tienda** sin checkout unificado multi-vendor real ni split-payment activo; (2) `CommissionLedger` solo inserta filas con `status: "pending"` — **no hay payout cycle, ni job que settle, ni pago real a vendedores**; (3) `Coupon` no tiene `storeId` (TD-032 confirmado en `/api/marketplace/coupons/route.ts` linea 41) — los cupones son por tenant, no por tienda; (4) `MarketplaceAbandonedCart` es **stub** (lineas 806-875 de marketplace.db.ts, TODO Sprint C Wave 4); (5) `LoyaltyTransaction` no existe en schema — solo se incrementa `Customer.loyaltyPoints`; (6) no hay modelos `Wishlist`, `Favorite`, `RecentlyViewed`, `Dispute`, `KYC`, `VendorTier`/`Subscription`, `FlashSale`, `Affiliate`; (7) el `apply` endpoint crea tienda con `tenantId = store-${phone}` — **duplica tenants fantasma** y rompe aislamiento multi-tenant; (8) el heart/favorito en `CatalogView` solo guarda estado local (`useState`), no persiste.

---

## Mejoras de alto impacto — Top 14

| # | Mejora | Tipo | Impacto | Esfuerzo | Prioridad | Dependencias |
|---|---|---|---|---|---|---|
| 1 | Checkout multi-vendor real con 1 sola pasarela y N sub-ordenes | 📈 expansion | 🔴 P0 | L (2-3 sem) | P0 | `MarketplaceOrdersDB.createFromCart` refactor, nuevo `MarketplaceCheckoutSession`, `stripe-connect.ts` split |
| 2 | Payout cycle semanal a vendedores (job + ledger settle) | 🆕 nueva | 🔴 P0 | L | P0 | `CommissionLedger.status` flujo, `Payout` model nuevo, cron, Stripe Connect transfers |
| 3 | Cupones por tienda (resolver TD-032) + cupones plataforma | ✅ completar | 🔴 P0 | M (1 sem) | P0 | Migracion `Coupon.storeId`, ADR |
| 4 | Wishlist + favoritos persistentes cross-store | 🆕 nueva | 🟠 P1 | M | P1 | Nuevo `Favorite` model, API CRUD, cambios en `CatalogView` heart button |
| 5 | KYC basico de vendedores + badge "Verificado" | 🆕 nueva | 🟠 P1 | M | P1 | `Store.kycStatus` + `kycDocumentUrl`, cola admin, ADR |
| 6 | Arreglar apply flow — no crear tenants fantasma | 🔴 fix | 🔴 P0 | S (1-2 dias) | P0 | Refactor `stores/apply/route.ts`, reusar tenant existente |
| 7 | Recently viewed + historial de busquedas persistente | 🆕 nueva | 🟠 P1 | S | P1 | Nuevo `ProductView` model o usar `localStorage` + sync opcional |
| 8 | Abandoned cart recovery real (quitar stub) | ✅ completar | 🟠 P1 | M | P1 | Migracion `MarketplaceAbandonedCart`, cron de recordatorios WhatsApp |
| 9 | Disputas cliente-vendedor con SLA 48h | 🆕 nueva | 🟠 P1 | M | P1 | Nuevo `Dispute` model + workflow + notifs, protege confianza |
| 10 | Tiers de vendedor (free/pro/elite) con subscription | 🆕 nueva | 🟡 P2 | L | P2 | Nuevo `StoreSubscription`, gating de features, Stripe subscriptions |
| 11 | Banners platform-wide rotativos ads-as-a-service | 📈 expansion | 🟡 P2 | S | P2 | Extender `StoreBanner` con `section="platform"` + rotacion ponderada |
| 12 | Lazy loading real del catalogo (virtualizar grid grande) | 🔴 fix | 🟠 P1 | S | P1 | `CatalogView.tsx` — ya tiene infinite scroll pero no virtualizacion |
| 13 | Flash sales cross-vendor (Black Friday Pucallpa) | 🆕 nueva | 🟡 P2 | M | P2 | Nuevo `FlashSale` model + countdown UI + sponsored boost piggyback |
| 14 | Cross-vendor loyalty points unificados (1 punto = todas las tiendas) | 📈 expansion | 🟠 P1 | M | P1 | Resolver `LoyaltyTransaction` pendiente, tabla real, canje en cualquier store |

---

## Detalle de cada mejora

### 1. Checkout multi-vendor real con 1 pasarela y N sub-ordenes

**Tipo:** expansion (hoy existe checkout por tienda aislado)
**Impacto esperado:** conversion +20-35%, ticket promedio +40% (cliente compra de 2-3 tiendas en un pedido), menos friccion vs abrir 3 checkouts.
**Esfuerzo:** L (2-3 semanas)
**Prioridad:** P0
**Dependencias:** refactor `MarketplaceOrdersDB.createFromCart`, nuevo modelo `MarketplaceCheckoutSession` que agrupe `Order[]`, integracion real de `stripe-connect.ts` (`createSplitPaymentIntent`), ADR nuevo.

**Que es:** hoy el carrito del cliente agrupa items por `storeId` (ver `use-marketplace-cart.ts` + `CartItem.storeId`) pero `POST /api/marketplace/orders` recibe UN solo `storeSlug` y crea UN solo `Order`. Si el cliente tiene productos de 3 tiendas, tiene que hacer checkout 3 veces. La mejora es crear un **`MarketplaceCheckoutSession`** que agrupe N `Order`s (uno por vendedor) detras de un solo pago con Stripe PaymentIntent + `transfer_data` / `application_fee_amount` por cada tienda.

**Por que importa:** este es EL gap que convierte Buleje de "catalogo agregado" a "marketplace real". Sin esto, el modelo Rappi/MercadoLibre no funciona. El cliente perderia interes antes del segundo checkout.

**Como se implementa:**
- Schema: `MarketplaceCheckoutSession { id, customerPhone, customerName, address, totalGross, platformFee, status }` + relacion 1:N a `Order`.
- `POST /api/marketplace/checkout` nuevo endpoint que recibe carrito completo (items con distintos `storeId`), agrupa por tienda, llama a `MarketplaceOrdersDB.createMultiVendor()`, crea UN `PaymentIntent` con `transfer_group` y despues N transfers (uno por tenant conectado).
- Frontend: `MarketplaceCheckoutModal.tsx` ya existe, adaptar para mostrar breakdown por tienda + total unico.
- Status machine: pago ok -> todos los Orders en "pendiente"; si una tienda rechaza, refund parcial.
- Feature flag: `MULTI_VENDOR_CHECKOUT_ENABLED` para rollout.

**Riesgos:** complejidad de refunds parciales, reconciliacion con SUNAT (cada tienda necesita su boleta), UX de "esta tienda no tiene delivery a tu zona" a mitad de checkout.
**Clasificacion:** inversion grande pero es la pieza central del negocio.

---

### 2. Payout cycle semanal a vendedores (job + ledger settle)

**Tipo:** nueva (hoy solo existe insert en `CommissionLedger` con status "pending")
**Impacto esperado:** habilita onboarding real de vendedores (hoy no pueden cobrar -> no se registran).
**Esfuerzo:** L (2 semanas)
**Prioridad:** P0
**Dependencias:** Stripe Connect activado, `Payout` model nuevo, cron, email/WhatsApp al vendedor con reporte.

**Que es:** hoy `MarketplaceOrdersDB.createFromCart` inserta `CommissionLedger { status: "pending" }` pero no hay ningun proceso que (a) marque como settled cuando la orden es entregada, ni (b) envie dinero al vendedor. Se necesita un ciclo semanal (ej. lunes 9am) que: calcule cuanto le debe la plataforma a cada tenant (total de orders delivered - commission), haga el transfer via Stripe Connect, marque `CommissionLedger.status = "settled"` y cree un `Payout` record con el detalle.

**Por que importa:** sin payout real el marketplace es un juguete. Ningun bodeguero de Pucallpa va a registrarse si "el dinero queda guardado en el sistema".

**Como se implementa:**
- Schema: `Payout { id, storeId, tenantId, periodStart, periodEnd, grossRevenue, commissionTotal, netAmount, stripeTransferId, status, paidAt }`.
- `POST /api/cron/marketplace-payouts` (llamado con `CRON_SECRET`) cada lunes 9am Pucallpa.
- Usar `stripe-connect.ts.createTransferToConnectedAccount()` (ya existe el helper).
- Notif WhatsApp al vendedor con PDF o link al reporte.
- Dashboard del vendedor: tab "Pagos" con historial de payouts.

**Riesgos:** Stripe Connect en Peru tiene limitaciones — quiza hay que usar Mercado Pago Marketplace en su lugar (la docs de `stripe-connect.ts` asume USA/EU). Investigar antes.
**Clasificacion:** inversion grande, critica.

---

### 3. Cupones por tienda (resolver TD-032) + cupones plataforma

**Tipo:** completar (TD-032 documentado en coupons/route.ts linea 41)
**Impacto esperado:** habilita promos del vendedor, campanias platform-wide, +15-25% conversion en primera compra.
**Esfuerzo:** M (1 semana)
**Prioridad:** P0
**Dependencias:** migracion Prisma `Coupon.storeId`, update de `validate/route.ts`.

**Que es:** hoy el modelo `Coupon` (schema linea 806) no tiene `storeId`. El endpoint `marketplace/coupons` filtra solo por `tenantId`. El TODO esta explicito:
```ts
// TECH-DEBT: campo storeId no está en schema Prisma (Coupon) — filtrar solo por tenant
// TODO: agregar storeId al modelo Coupon para soporte de cupones de marketplace
```
Ademas, en `orders/route.ts` hay logica de "welcome coupon" que crea cupones sin `storeId` y por eso se duplican si el cliente hace su primera compra en 2 tiendas distintas del mismo tenant (imposible hoy pero sera posible mañana).

**Por que importa:** cupones por tienda = promos de apertura, cumpleanios, flash sales. Cupones plataforma = campanias Buleje ("BULEJE10" todo el marketplace). Sin discriminacion no se puede segmentar.

**Como se implementa:**
- Migracion: `ALTER TABLE Coupon ADD COLUMN storeId String NULL` (null = cupon plataforma, non-null = cupon de tienda).
- Index: `@@index([storeId, code])`.
- `POST /api/marketplace/coupons`: agregar `storeId = store.id`.
- `GET /api/marketplace/coupons/validate`: check `storeId` matches el checkout actual O es null (platform).
- UI vendor dashboard: toggle "cupon de mi tienda" vs "cupon de plataforma" (solo admin global).

**Riesgos:** migracion en produccion con datos existentes — backfill `storeId = null` para todos los cupones actuales.
**Clasificacion:** quick-win (deuda tecnica explicita con bloqueo de features).

---

### 4. Wishlist + favoritos persistentes cross-store

**Tipo:** nueva
**Impacto esperado:** retention +15%, remarketing via WhatsApp ("el producto X que te gustaba bajo de precio"), engagement +20%.
**Esfuerzo:** M (1 semana)
**Prioridad:** P1
**Dependencias:** `Favorite` model nuevo, API CRUD, cambios en `CatalogView.tsx` heart button (hoy solo `useState`).

**Que es:** en `CatalogView.tsx` linea 85 hay un `<Heart />` con `setLiked(!liked)` que solo guarda en memoria y se pierde al recargar. Convertirlo en wishlist real persistente por `customerPhone` (el marketplace es publico, no hay login, pero si hay phone en checkout).

**Por que importa:** la senora de 55 anios de Pucallpa entra, ve arroz Costeno, quiere "guardarlo para despues", sale del app, vuelve al dia siguiente — y se perdio todo. Fav persistente + notif WhatsApp cuando baja de precio = retention enorme.

**Como se implementa:**
- Schema: `Favorite { id, customerPhone, storeProductId, productId, addedAt }` con `@@unique([customerPhone, storeProductId])`.
- API: `POST/DELETE /api/marketplace/favorites`, `GET /api/marketplace/favorites?phone=X`.
- Cliente: reemplazar `useState(false)` por fetch al cargar + optimistic update.
- Sin phone -> `localStorage` + sync opcional cuando el usuario hace checkout.
- Sprint 2: cron que compara precios actuales vs precios al momento de fav y manda WhatsApp al bajar 10%+.

**Riesgos:** privacy (no hay login), mitigado con "autorizo mi numero".
**Clasificacion:** quick-win con impacto alto.

---

### 5. KYC basico de vendedores + badge "Verificado"

**Tipo:** nueva
**Impacto esperado:** confianza +30% en compradores, reduce fraude, habilita payouts reales (no se puede pagar sin KYC).
**Esfuerzo:** M (1-2 semanas)
**Prioridad:** P1
**Dependencias:** `Store.kycStatus` + `Store.kycDocuments`, cola admin, ADR.

**Que es:** hoy en `stores/apply/route.ts` cualquier persona puede registrar una tienda con solo nombre + telefono. No hay verificacion de DNI, RUC, direccion fisica ni foto del local. Para pagar comisiones reales se necesita KYC (SUNAT, SBS, Stripe Connect).

**Por que importa:** sin KYC no se puede hacer payout legal. Ademas, los compradores no confian en tiendas sin badge "Verificada" (test de la senora 55 anios: "y si me roban?").

**Como se implementa:**
- Schema: agregar a `Store`: `kycStatus: String @default("unverified")` (unverified|pending|verified|rejected), `kycDniUrl`, `kycRucUrl`, `kycLocalPhotoUrl`, `kycVerifiedAt`, `kycVerifiedBy`.
- Upload: re-usar `/api/upload` existente.
- Admin queue: pagina `/admin?module=marketplace&tab=kyc` con lista de pending.
- Badge UI: mostrar "Verificada" en `StoreCard` si `kycStatus === "verified"`.
- Gate: payouts bloqueados si `kycStatus !== "verified"`.

**Riesgos:** friccion de onboarding — compensar con "vendes sin KYC pero no cobras hasta verificar".
**Clasificacion:** inversion media, habilita el Payout cycle (#2).

---

### 6. Arreglar apply flow — no crear tenants fantasma

**Tipo:** fix critico
**Impacto esperado:** previene corrupcion de datos, evita duplicados, protege aislamiento multi-tenant.
**Esfuerzo:** S (1-2 dias)
**Prioridad:** P0
**Dependencias:** refactor `app/api/marketplace/stores/apply/route.ts`.

**Que es:** en `stores/apply/route.ts` linea 64-70:
```ts
const store = await MarketplaceStoresDB.register({
  tenantId: `store-${ownerPhone.replace(/\D/g, "")}`,  // ⚠️ crea tenantId falso
  ...
});
```
Esto crea un `Store.tenantId` que **no corresponde a ningun Tenant real**. Rompe queries cross-tabla (por ej. `Order.tenantId` nunca matchea, `Settings` no existe, etc.). El admin no puede entrar a su tienda porque el login lo manda a un tenant que no existe.

Ademas usa un patron inseguro: extrae solo digitos del telefono y asume que es unico.

**Por que importa:** esto ya es un bug silencioso. Tiendas registradas via apply estan "huerfanas" — no reciben pedidos porque el `tenantId` no matchea el auth token del vendedor.

**Como se implementa:**
- En lugar de generar `tenantId` falso, crear `Tenant` real con `prisma.tenant.create({ data: { slug, name, plan: "free" } })`.
- Guardar `tenantId = tenant.id` en el `Store`.
- En el WhatsApp de confirmacion al vendedor, enviar link magico de login (`/login?token=...`) con credencial temporal.
- Reusar `ensureTenant()` helper que ya existe en `stores/route.ts`.
- Cleanup data migration: buscar stores con `tenantId LIKE 'store-%'` y merge-lar con el tenant real del vendedor si existe.

**Riesgos:** migracion de data existente — identificar cuales stores son fantasmas.
**Clasificacion:** quick-win pero critico.

---

### 7. Recently viewed + historial de busquedas persistente

**Tipo:** nueva
**Impacto esperado:** +10% re-engagement, fomenta descubrimiento cruzado, alimenta el sistema de recomendaciones existente.
**Esfuerzo:** S (1-2 dias)
**Prioridad:** P1
**Dependencias:** `localStorage` cliente O `ProductView` model + `customerPhone` opcional.

**Que es:** ya existe `ProductAnalytics` model (linea 2979 con views/clicks) y `SearchSuggestion` (linea 3089 con log de busquedas por tenant), pero no hay una vista "visto recientemente" en la UI publica. El cliente que vio 5 productos en 3 tiendas distintas no los puede recuperar facilmente.

**Por que importa:** el 30% de las compras en ecommerce vienen de "visto recientemente". La senora de 55 anios se fue a hacer otra cosa, vuelve, quiere "el que vi ayer" — hoy tiene que volver a buscar.

**Como se implementa:**
- Cliente: hook `useRecentlyViewed` que guarda los ultimos 20 en `localStorage`.
- UI: banda "Visto recientemente" en `MarketplaceContent.tsx` arriba de `PersonalizedRecommendations`.
- Opcional: si hay `customerPhone`, sincronizar a `ProductView` table nuevo (o usar `ProductAnalytics` existente si acepta `customerPhone` — verificar schema).
- Cross-device: si el cliente pone su phone en el checkout, re-sync en la proxima visita.

**Riesgos:** minimo, feature aislada.
**Clasificacion:** quick-win, no requiere schema change si se mantiene cliente-only.

---

### 8. Abandoned cart recovery real (quitar stub)

**Tipo:** completar (stub documentado en `marketplace.db.ts` linea 805-875)
**Impacto esperado:** recupera 15-25% de carritos abandonados, +5-10% revenue marketplace.
**Esfuerzo:** M (1 semana)
**Prioridad:** P1
**Dependencias:** migracion `MarketplaceAbandonedCart`, cron de recordatorios, integracion WhatsApp.

**Que es:** `MarketplaceAbandonedCartsDB` en `lib/db/marketplace.db.ts` linea 805-875 tiene 4 metodos (save, markConverted, getAbandoned, markReminderSent) pero **todos retornan `null` o `void`** porque el modelo no existe en Prisma. Hay un TODO explicito: `// TODO Sprint C Wave 4: refactor type MarketplaceAbandonedCart`. El endpoint `/api/marketplace/cart/save` llama al stub y no hace nada.

**Por que importa:** en ecommerce retail el 70% de los carritos se abandonan. Un reminder por WhatsApp a las 2h recupera entre 15-25%. Con 100 carritos/dia, eso son 15-25 ordenes extra/dia gratis.

**Como se implementa:**
- Migracion: `MarketplaceAbandonedCart { id, storeSlug, customerName, customerPhone, itemsJson, total, recovered, convertedAt, reminderSentAt, createdAt, updatedAt }`.
- Implementar los 4 metodos stub (save / markConverted / getAbandoned / markReminderSent).
- Cron nuevo `/api/cron/marketplace-abandoned-reminder` que cada hora busca carritos > 2h sin conversion, manda WhatsApp con deep-link al checkout pre-rellenado, marca `reminderSentAt`.
- Gate: no enviar recordatorio si ya se envio uno en las ultimas 24h.

**Riesgos:** spam si no se gatea bien. Opt-out obligatorio.
**Clasificacion:** quick-win con ROI alto.

---

### 9. Disputas cliente-vendedor con SLA 48h

**Tipo:** nueva
**Impacto esperado:** confianza del comprador +25%, reduce chargebacks, habilita refunds automaticos.
**Esfuerzo:** M (1-2 semanas)
**Prioridad:** P1
**Dependencias:** nuevo `Dispute` model, workflow de estados, notifs WhatsApp al vendedor + admin.

**Que es:** hoy si un cliente recibe un pedido incompleto, roto o nunca llega, no hay flujo formal para reclamar. Existe el chat D2 (`ConversationThread`) pero no hay un ticket estructurado que escale a admin si el vendedor no responde en 48h.

**Por que importa:** sin sistema de disputas, la plataforma carga con la reputacion de cada vendedor malo. Una mala experiencia = cliente abandona TODO el marketplace. Protege la marca Buleje.

**Como se implementa:**
- Schema: `Dispute { id, orderId, storeId, customerPhone, reason (enum), description, photoUrls, status (open|seller_response|admin_review|resolved_refund|resolved_reject|closed), openedAt, respondBy, resolvedAt, refundAmount }`.
- Cliente: boton "Reportar problema" en la pagina `/marketplace/orden/[id]` (publica con phone + order id).
- Vendedor: notificacion in-app + WhatsApp, tiene 48h para responder via chat D2.
- Admin escalation: si no responde, cae a cola admin marketplace.
- Refund: si se aprueba, reversar `CommissionLedger` + notificar via WhatsApp.

**Riesgos:** abuso por compradores malintencionados. Mitigacion: limitar 1 dispute por order, foto obligatoria.
**Clasificacion:** inversion media, critica para escala.

---

### 10. Tiers de vendedor (free/pro/elite) con subscription

**Tipo:** nueva
**Impacto esperado:** monetization platform +40% (ARPU), incentiva profesionalizacion del vendedor.
**Esfuerzo:** L (2-3 semanas)
**Prioridad:** P2
**Dependencias:** nuevo `StoreSubscription`, Stripe subscriptions, gating de features por tier.

**Que es:** hoy todas las tiendas tienen las mismas capacidades. Crear tiers:
- **Free:** 30 productos, 5% comision, 1 banner, sin analytics avanzado.
- **Pro (S/29/mes):** 200 productos, 4% comision, 5 banners, sponsored credits mensuales, analytics C1/C2, chat D2.
- **Elite (S/99/mes):** ilimitado, 3% comision, top placement gratis, prioridad en search, multi-local.

**Por que importa:** diversifica revenue. Hoy Buleje solo cobra comision por venta, lo cual es inestable. Subscripciones dan MRR predecible. Vendedores serios pagarian Pro con tal de bajar comision.

**Como se implementa:**
- Schema: `StoreSubscription { id, storeId, tier, stripeSubscriptionId, startedAt, renewsAt, status, currentPeriodEnd }`.
- Helper: `getStoreTier(storeId) -> { tier, limits }`.
- Gates: en `upsertProduct` verificar limite, en `createBanner` idem, etc.
- Dashboard: pagina de upgrade con comparativa de tiers.
- Stripe: usar productos + prices recurrentes.

**Riesgos:** complejidad de billing + proration + downgrade con excedente de productos.
**Clasificacion:** inversion grande, monetization play.

---

### 11. Banners platform-wide rotativos (ads-as-a-service)

**Tipo:** expansion (ya existe `StoreBanner` por tienda)
**Impacto esperado:** nueva fuente de revenue (CPM/CPC), visibilidad a vendedores pequenios.
**Esfuerzo:** S (2-3 dias)
**Prioridad:** P2
**Dependencias:** extender `StoreBanner` con `section="platform"` + rotacion ponderada por bid.

**Que es:** `StoreBanner` ya existe con `section: String @default("hero")`. Hoy solo se renderiza en la pagina de la tienda. Agregar `section="platform_hero"` que se muestra en `/marketplace` (arriba del grid de tiendas) y rotar ponderado por bid, igual que `SponsoredBoost`.

**Por que importa:** un bodeguero chico que no tiene trafico propio puede comprar un banner platform-wide por S/20/dia. Es monetization directa platform-level.

**Como se implementa:**
- Usar `StoreBanner` existente con `section="platform_hero"`.
- Nuevo componente `<PlatformBannerCarousel />` en `MarketplaceContent.tsx` arriba del hero.
- Rotacion: similar a `sponsored-ranker.ts` — max 3 banners, rotacion ponderada por bid, tracking impressions/clicks.
- Admin: aprobacion manual de banners platform-wide (anti-spam/offensive).

**Riesgos:** si el banner es feo degrada la UX del marketplace. Requiere aprobacion humana.
**Clasificacion:** quick-win de monetization.

---

### 12. Lazy loading real del catalogo (virtualizar grid grande)

**Tipo:** fix performance
**Impacto esperado:** TTI -40% en mobile, scroll fluido con 500+ productos, LCP mejora.
**Esfuerzo:** S (1-2 dias)
**Prioridad:** P1
**Dependencias:** `CatalogView.tsx` — ya tiene infinite scroll pero no virtualizacion. Agregar `@tanstack/react-virtual`.

**Que es:** `CatalogView.tsx` carga productos con infinite scroll (cursor-based). Cuando el cliente ha scrolleado 200+ productos, la pagina tiene 200 DOM nodes renderizados con `<Image />`, `framer-motion`, etc. En mobile bajo (Moto E, comun en Pucallpa) esto hace freezing.

**Por que importa:** la senora 55 anios en un Moto E6 con 2G abre el catalogo, ve 40 productos, scrollea un poco, y se le traba el telefono. Pierde la compra.

**Como se implementa:**
- Instalar `@tanstack/react-virtual`.
- Reemplazar el `.map()` por `useVirtualizer` con columnas dinamicas (2/3/4/5 segun breakpoint).
- Keep alive de 20 items antes/despues del viewport.
- Medicion antes/despues con Chrome DevTools CPU throttling 4x.

**Riesgos:** framer-motion + virtualizer a veces rompen animaciones de entrada. Usar `layoutId` o desactivar animaciones cuando virtualizado.
**Clasificacion:** quick-win de performance.

---

### 13. Flash sales cross-vendor (Black Friday Pucallpa)

**Tipo:** nueva
**Impacto esperado:** picos de trafico +300% en eventos (Cyber Wow, Black Friday), buzz local.
**Esfuerzo:** M (1-2 semanas)
**Prioridad:** P2
**Dependencias:** nuevo `FlashSale` model, countdown UI, integracion con sponsored boost existente.

**Que es:** eventos tipo "Todos los pollos a S/12 este viernes 6-9pm" o "24h de descuento en abarrotes en 5 tiendas seleccionadas". Una pagina `/marketplace/flash` con countdown, badges urgentes, items pre-aprobados por admin.

**Por que importa:** crea eventos que traen trafico a todas las tiendas. El vendedor gana volumen, la plataforma gana comision alta, el cliente gana precio.

**Como se implementa:**
- Schema: `FlashSale { id, name, startsAt, endsAt, bannerImage, discountType, discountValue, isActive }` + `FlashSaleProduct { id, flashSaleId, storeProductId, originalPrice, salePrice, maxQty, soldQty }`.
- UI: pagina `/marketplace/flash` con countdown tipo shopee.
- Admin: cola para crear flash sales + aprobar productos que los vendedores proponen.
- Push notification al abrir la venta.
- Integracion con `sponsored-ranker`: flash items ranking boost automatico durante la venta.

**Riesgos:** inventario real — necesita integrarse con `Product.stock` para no vender lo que no hay.
**Clasificacion:** inversion media con ROI en eventos.

---

### 14. Cross-vendor loyalty points unificados

**Tipo:** expansion (hoy el loyalty esta roto — solo incrementa `Customer.loyaltyPoints` sin historial)
**Impacto esperado:** retention +20%, LTV +15%, engagement cross-store.
**Esfuerzo:** M (1 semana)
**Prioridad:** P1
**Dependencias:** resolver TD-`LoyaltyTransaction` (linea 190-207 de orders/route.ts + linea 101 de loyalty/route.ts).

**Que es:** hoy el sistema **incrementa** `Customer.loyaltyPoints` en el `POST /api/marketplace/orders` pero **nunca inserta en `LoyaltyTransaction`** porque el modelo no existe:
```ts
// TODO Sprint C Wave 4: el modelo LoyaltyTransaction no existe en schema.prisma aún.
// Por ahora solo actualizamos loyaltyPoints en Customer.
```
Sin historial, el cliente no puede ver de donde vinieron sus puntos y no se pueden canjear de forma controlada.

**Por que importa:** el loyalty actual es fantasma. La senora 55 anios compra, le dicen "tienes 50 puntos" pero no puede verlos ni usarlos. Sin historial no hay confianza. Ademas, un punto cross-vendor (1 point = 1 sol, uso en cualquier tienda) convierte a Buleje en un "club de puntos" estilo Belcorp / Tottus.

**Como se implementa:**
- Schema: `LoyaltyTransaction { id, customerPhone, type (earn|redeem|expire), points, orderId, storeId, description, createdAt }`.
- Quitar los 2 TODOs explicitos y usar el modelo real.
- Endpoint canje: aplicar `LoyaltyTransaction type=redeem` durante checkout como descuento.
- UI: pagina `/marketplace/mis-puntos?phone=X` con historial.
- Expiry: cron que marca puntos > 6 meses como expired.

**Riesgos:** abuso — un cliente crea 10 cuentas con phones falsos. Mitigar con deduplicacion por phone real verificado SMS.
**Clasificacion:** quick-win con alto impacto retention.

---

## Top 3 mejoras que DEBEN arrancarse ya

1. **#1 Checkout multi-vendor + #2 Payout cycle (tandem inseparable)** — son EL core del marketplace. Sin esto, Buleje es un catalogo agregado bonito, no un marketplace. Sin payout, ningun bodeguero se registra. Sin checkout multi-vendor, el modelo Rappi no existe. Ambos se hacen juntos porque comparten el split-payment via Stripe Connect. Esta es la inversion estructural que desbloquea todo lo demas.

2. **#6 Arreglar apply flow (tenants fantasma)** — es un bug critico silencioso. Cada tienda registrada via el portal publico crea un `tenantId` falso que rompe el aislamiento multi-tenant. Hay que arreglarlo ANTES de crecer la base de vendedores, porque cada dia que pasa se acumula data corrupta. 1-2 dias de esfuerzo, protege meses de trabajo.

3. **#3 Cupones por tienda (TD-032)** — deuda tecnica documentada, bloquea promos de apertura, bienvenida, bloquea la feature de "Coupon por marketplace" que ya se intento en `orders/route.ts` linea 209-260 (welcome coupon) pero esta roto porque el cupon es por `tenantId` no por `storeId`. Migracion simple + 1 index + update en 3 endpoints = 1 semana con cleanup.

---

## Lo que NO tocar (o posponer)

- **Refactor total del grid a Algolia / Meilisearch**: tentador pero el search actual ya tiene fuzzy + did-you-mean + boosts + rating. El bottleneck esta en los gaps comerciales (#1, #2, #3), no en search quality. Posponer minimo 6 meses.

- **AI chatbot para recomendar productos**: hay `PersonalizedRecommendations` que ya funciona y consume `recommendations-personalized.db.ts`. Un chatbot LLM seria cool pero no mueve la aguja vs arreglar el checkout.

- **Multi-idioma (quechua, ingles)**: fuera de scope para Pucallpa 2026. Foco en castellano peruano con lenguaje simple.

- **Auto-translate de reviews**: overkill.

- **NFTs / web3 / crypto payments**: no, por favor.

- **Reemplazar framer-motion por otra libreria de animacion**: no rompe nada, no bloquea negocio. Posponer hasta que el equipo pueda dedicarle tiempo.

- **Componentes ya existentes que parecen mejorables pero funcionan**: `SponsoredBadge`, `SponsoredAdminPanel`, `StoreRegistrationForm`, `ProductBadges`, `SearchAutocomplete`. Tocarlos hoy es bike-shedding.

- **Mover `StoreProduct.volumePricingTiers` de JSON a tabla relacional**: el JSON funciona para 90% de los casos. Solo migrar si surge una query compleja.

---

> Scout reporte: auditoria ejecutada 2026-04-09. Los gaps P0 (#1, #2, #3, #6) concentran 80% del impacto. Recomiendo paquete "Sprint C Wave 4: Marketplace Core Commercial" (4-5 semanas) con los 4 P0 juntos, luego wave de P1 (#4, #5, #7, #8, #9, #12, #14) en 3-4 semanas mas.
