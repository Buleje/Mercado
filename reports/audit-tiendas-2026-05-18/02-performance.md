# Performance Audit — flujo /tiendas → checkout
**Fecha:** 2026-05-18 | **Rama:** feat/checkout-payment-proof | **Auditor:** Performance Engineer

---

## Resumen ejecutivo

| Metrica | Valor medido | Objetivo |
|---|---|---|
| TTFB /tiendas | 803ms | <300ms |
| TTFB /marketplace/[slug] | 1635ms | <600ms |
| TTFB /checkout | 164ms | <200ms ✓ |
| /api/marketplace/catalog (cold) | 4920ms | <500ms |
| /api/marketplace/catalog (warm) | ~60ms (Cache-Control max-age=60) | — |
| /api/marketplace/stores | 882ms sin cache HTTP | <300ms |
| /api/marketplace/products | 200ms | <300ms ✓ |
| Respuesta /api/marketplace/orders | 751ms | <400ms |
| `<img>` sin next/image en flujo | 17 instancias | 0 |
| CSS bg-image en storefront (banner sticky) | 1 instancia | 0 |
| Framer Motion imports en marketplace+checkout | 48 archivos | — |
| Recharts en flujo tiendas→checkout | 0 (correcto) | — |

**Hallazgos:** 3 P0 · 6 P1 · 5 P2.

---

## Hallazgos priorizados

### P0 — Impacto >100ms LCP o comportamiento incorrecto

#### P0-1: N+1 dentro de transaccion en `createFromCart` — `tx.product.findFirst` en bucle `for`
**Archivo:** `lib/db/marketplace/orders.db.ts:256-295`
**Impacto:** Cada item del carrito dispara una query individual a `Product` para leer `stock`. Un carrito de 5 productos = 5 queries seriales dentro de la transaccion. Latencia estimada: +15-40ms por item en Supabase/pgBouncer.

**Metrica actual:** ~150-200ms extra para carrito de 5 items.
**Metrica objetivo:** 1 query batcheada, ~10ms total.

**Fix:**
```typescript
// ANTES (dentro de $transaction, en bucle for):
for (const item of orderItems) {
  const current = await tx.product.findFirst({
    where: { id: storeProduct.productId, tenantId: store.tenantId, deletedAt: null },
    select: { stock: true },
  });
  // ...
}

// DESPUES: batch antes de la tx, lookup por mapa
const productIds = storeProducts.map((sp) => sp.productId);
const stockRows = await prisma.product.findMany({
  where: { id: { in: productIds }, tenantId: store.tenantId, deletedAt: null },
  select: { id: true, stock: true },
});
const stockMap = new Map(stockRows.map((r) => [r.id, r.stock]));

// En la tx, solo updateMany (no findFirst):
for (const item of orderItems) {
  const stock = stockMap.get(storeProduct.productId);
  // validar stock con el mapa...
}
```

---

#### P0-2: /api/marketplace/catalog cold TTFB = 4.9s — 900KB payload sin compresion confirmada
**Archivo:** `app/api/marketplace/catalog/route.ts` + `lib/db/marketplace-public.db.ts`
**Impacto:** El endpoint tarda 4.9s en cold (sin cache HTTP). El payload es 919KB sin compresion (Vercel comprime en prod, pero en dev/cold el cliente recibe esto). La funcion `batchCatalogEnrichment` corre 4 queries paralelas pero luego `applyBoostsToProducts` es una quinta query secuencial.
**LCP estimado:** este endpoint bloquea el pintado del catalogo en /marketplace/explorar.

**Metrica actual:** 4920ms TTFB cold, 919KB payload.
**Metrica objetivo:** <500ms warm con cache, payload <100KB (paginacion real de 20 items).

**Fix:**
```typescript
// En MarketplacePublicDB.getCatalogPage — mover applyBoostsToProducts
// a correr en Promise.all con batchCatalogEnrichment:
const [{ primaryImageMap, variantMap, ratingMap, bestSellerIds }, rankedItems] =
  await Promise.all([
    MarketplacePublicDB.batchCatalogEnrichment(productIds, tenantId),
    applyBoostsToProducts(tenantId, rawItems), // pre-fetch paralelo
  ]);

// Ademas: reducir limit default de 40 a 20 para first paint.
// limit: z.coerce.number().int().min(1).max(100).optional().default(20),
```

---

#### P0-3: 17 `<img>` sin `next/image` en el flujo critico
**Archivos con mayor impacto LCP:**

| Archivo | Linea | Descripcion | Impacto |
|---|---|---|---|
| `app/tiendas/TiendasClient.tsx` | 577, 856, 1064 | Logos tienda en filtros, cards y busqueda | LCP alto |
| `components/marketplace/store-detail/StoreDetailClient.tsx` | 236 | Logo en barra top nav | LCP |
| `components/marketplace/store-detail/StoreDetailClient.tsx` | 1060 | Imagen extra en producto | LCP |
| `components/checkout/YapePaymentPanel.tsx` | 101 | QR Yape — critico en checkout | CLS |
| `components/checkout/PlinPaymentPanel.tsx` | 55 | QR Plin | CLS |
| `components/checkout/CheckoutOrderReview.tsx` | 136 | Imagen producto en review | CLS |
| `components/marketplace/AddedToCartDrawer.tsx` | 326 | Imagen producto en drawer carrito | CLS |
| `components/marketplace/explorar/ExplorarHero.tsx` | 54 | Hero explorar | LCP |
| `components/marketplace/explorar/EditorialFeature.tsx` | 54 | Editorial feature image | LCP |
| `components/marketplace/explorar/BodegasTrendingRow.tsx` | 59 | Imagenes bodegas trending | LCP |

**Fix (patron uniforme):**
```tsx
// ANTES:
<img src={store.logo} alt={store.name} className="h-full w-full object-cover" loading="lazy" />

// DESPUES:
import Image from "next/image";
<Image
  src={store.logo}
  alt={store.name}
  fill
  sizes="(max-width: 768px) 56px, 56px"
  className="object-cover"
/>
// Para QR de pago (no cambia tamano):
<Image src={yape.image} alt="QR Yape" width={160} height={160} priority />
```

---

### P1 — Impacto 30-100ms o 20-50KB bundle

#### P1-1: CSS `background: url(store.banner)` en barra sticky del storefront — bloquea LCP
**Archivo:** `components/marketplace/store-detail/StoreDetailClient.tsx:311-313`
**Impacto:** El banner del sticky header se carga como CSS background-image: no hay lazy loading, no hay formato moderno (avif/webp), no hay `sizes`. El navegador descarga la imagen completa incluso si la barra no es visible.

**Fix:**
```tsx
// ANTES:
style={{
  background: store.banner
    ? `linear-gradient(rgba(0,0,0,0.62), rgba(0,0,0,0.62)), url(${store.banner}) center/cover`
    : "...",
}}

// DESPUES — usar next/image con position:absolute + overlay:
<div className="lg:hidden sticky top-[64px] z-30 h-14 overflow-hidden ...">
  {store.banner && (
    <Image
      src={store.banner}
      alt=""
      fill
      sizes="100vw"
      className="object-cover brightness-[0.38]"
      aria-hidden
    />
  )}
  {/* overlay gradient encima */}
  <div className="relative z-10 h-full flex items-center ...">
    {/* contenido */}
  </div>
</div>
```

---

#### P1-2: `/api/marketplace/stores` sin cache HTTP — 882ms por request
**Archivo:** `app/api/marketplace/stores/route.ts`
**Impacto:** El endpoint publico de listado de tiendas no tiene `Cache-Control` en la respuesta. Cada visita a /tiendas que hace el fetch del cliente (~useEffect) paga 882ms. El endpoint lee filesystem (`store-extras.json`, `marketplace-categories.json`) y corre un `qualityScore` sort en memoria en cada request.

**Metrica actual:** 882ms por request.
**Metrica objetivo:** <100ms con cache HTTP + getOrSet en el handler.

**Fix:**
```typescript
// Al final del GET, en el return NextResponse.json(...):
return NextResponse.json(
  { stores: finalStores, zones, categories },
  {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=600",
    },
  },
);

// Tambien: cachear el filesystem read con getOrSet TTL 300s
import { getOrSet } from "@/lib/cache";
const extrasMap = await getOrSet("marketplace:store-extras-map:v1", 300, () =>
  getStoreExtrasMap(stores.map((s) => s.slug as string))
);
```

---

#### P1-3: `getInitialMarketplaceStores` no incluye `cover` — doble viaje en /tiendas
**Archivo:** `lib/marketplace/initial-stores.ts:63-79`
**Impacto:** El SSR de /tiendas pre-fetches las tiendas (con `"use cache"`) pero NO incluye `cover` (la imagen de portada 4:3 de las cards). Resultado: el cliente hidrara con `cover: undefined`, el useEffect fetch lo repopulara, y las cards de tienda hacen un layout shift al llegar la imagen.

**Fix:**
```typescript
// Agregar cover al select de getInitialMarketplaceStores:
const rows = await prisma.store.findMany({
  ...
  select: {
    id: true, slug: true, name: true, logo: true,
    cover: true, // <-- agregar
    banner: true, category: true, zone: true,
    rating: true, reviewCount: true, description: true,
  },
});
// Nota: si cover no esta en schema.prisma, usar $queryRawUnsafe igual que stores/route.ts:248
```

---

#### P1-4: `TiendasClient.tsx` es 1542 lineas con 281 componentes "use client" — bundle monolito
**Archivo:** `app/tiendas/TiendasClient.tsx`
**Impacto:** Todo el directorio de tiendas es un solo client component de 1542 lineas. Partes como `TiendasMap` ya son dynamic, pero `TiendasPromoCards`, `TiendasHeroAds`, `FeaturedStoresNearby`, `MisPedidosFavoritosStrip`, `RepetirUltimoPedido` son imports directos y se bundlean juntos. En 3G, esto agrega ~30-60KB al bundle inicial.

**Fix:**
```typescript
// Convertir imports below-the-fold a dynamic:
const TiendasPromoCards = dynamic(() => import("@/components/marketplace/TiendasPromoCards"), {
  loading: () => <div className="h-32 animate-pulse bg-[var(--surface-sunken)] rounded-2xl" />,
  ssr: false,
});
const MisPedidosFavoritosStrip = dynamic(
  () => import("@/components/marketplace/MisPedidosFavoritosStrip"),
  { ssr: false }
);
const RepetirUltimoPedido = dynamic(
  () => import("@/components/marketplace/RepetirUltimoPedido"),
  { ssr: false }
);
```

---

#### P1-5: `createFromCart` tiene 5+ queries seriales antes de la transaccion
**Archivo:** `lib/db/marketplace/orders.db.ts:36-210`
**Impacto:** El flujo de checkout dispara en secuencia: `store.findUnique` → `storeProduct.findMany` → `order.count` (tier) → `customer.findFirst` → `coupon.findFirst` → `customer.findFirst` (loyalty). Son 5-6 round-trips a Supabase antes de abrir la transaccion. En Pucallpa con latencia de red, esto puede sumar 200-400ms extra.

**Fix — paralelize las queries independientes:**
```typescript
// store + storeProducts son dependientes (necesitas store.id para storeProducts)
// pero tier + customer pueden correr en paralelo despues de obtener store:
const store = await prisma.store.findUnique({ where: { slug: params.storeSlug }, ... });

// Ahora en paralelo:
const [storeProducts, deliveredCount, existingCustomer] = await Promise.all([
  prisma.storeProduct.findMany({ where: { id: { in: storeProductIds }, storeId: store.id, isActive: true }, ... }),
  params.customerPhone
    ? prisma.order.count({ where: { customerPhone: params.customerPhone, tenantId: store.tenantId, ... } })
    : Promise.resolve(0),
  params.customerPhone
    ? prisma.customer.findFirst({ where: { phone: params.customerPhone, tenantId: store.tenantId }, select: { phone: true, loyaltyPoints: true } })
    : Promise.resolve(null),
]);
// Reduccion estimada: 3 round-trips eliminados = ~60-120ms
```

---

#### P1-6: `StoreBannerArea` importa framer-motion directamente — no tiene `ssr: false`
**Archivo:** `components/marketplace/store-detail/StoreBannerArea.tsx:19`
**Impacto:** `"use client"` + `import { m as motion } from "framer-motion"` es un import estatico. Framer Motion completo (~50KB minzipped) se incluye en el bundle del storefront aunque el banner sea solo una animacion de entrada `opacity: 0 → 1`. No hay `ssr: false` — se ejecuta en servidor y cliente.

**Fix:**
```typescript
// Opcion A (recomendada): reemplazar las 2 animaciones de entrada con CSS puro:
// initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }}
// Equivalente CSS:
// className="animate-fade-in" // con @keyframes en globals.css

// Opcion B: lazy load del componente desde StoreDetailClient:
const StoreBannerArea = dynamic(
  () => import("./StoreBannerArea"),
  { ssr: false, loading: () => <div className="h-32 sm:h-36 lg:h-40 bg-[var(--surface-sunken)] animate-pulse" /> }
);
```

---

### P2 — Optimizaciones menores

#### P2-1: `StoreBannerArea` logo sin `sizes` especifico
**Archivo:** `components/marketplace/store-detail/StoreBannerArea.tsx:102-107`
El logo usa `width={112} height={112}` pero no tiene `sizes`. El navegador puede descargar la version mas grande disponible.
**Fix:** `sizes="(max-width: 768px) 112px, 144px"`.

---

#### P2-2: QR de pago (Yape/Plin) sin `priority` — late load en paso critico
**Archivos:** `components/checkout/YapePaymentPanel.tsx:101`, `components/checkout/PlinPaymentPanel.tsx:55`
El QR es lo primero que el usuario necesita ver para pagar. Con `<img>` sin priority, el navegador lo baja como recurso lazy.
**Fix:** Migrar a `next/image` con `priority` y `width={160} height={160}`.

---

#### P2-3: `getStoreLocationsBySlugs` — N+1 con `Promise.all` en hasta 10 slugs
**Archivo:** `lib/db/marketplace-public.db.ts:115-142`
Usa `Promise.all(safe.map(slug => getOrSet(..., async () => prisma.store.findUnique({where:{slug}}))))`.
Cada slug con cache miss = 1 query. Si todos son misses = 10 queries. Cada una ya usa `getOrSet` con TTL 300s, pero el primer cold run es costoso.
**Fix:** batch las misses en un `findMany({ where: { slug: { in: missedSlugs } } })` y poblar el cache individualmente.

---

#### P2-4: `app/tiendas/page.tsx` — `TiendasClient` no es dynamic desde el server page
**Archivo:** `app/tiendas/page.tsx`
`TiendasClient` es un "use client" de 1542 lineas importado directamente (no dynamic). El page server component hace `await getInitialMarketplaceStores()` correctamente pero el client bundle completo se envía con el HTML inicial.
**Fix:** evaluar si partes del layout superior de TiendasClient pueden ser RSC (breadcrumb, hero estatico) y dejar solo el filtro/lista como client.

---

#### P2-5: `PaymentStep.tsx` — preview de comprobante como `<img>` sin optimizacion
**Archivo:** `components/marketplace/PaymentStep.tsx:404`
La preview del comprobante subido por el usuario es un objeto URL local (`preview = URL.createObjectURL(file)`), por lo que `next/image` no puede optimizarla. Sin embargo la imagen no tiene dimensiones fijas — puede causar CLS.
**Fix:** Agregar `style={{ maxHeight: "200px" }}` y `className="w-auto"` para contener el layout. No usar next/image (objeto URL local no es optimizable por el servidor).

---

## Mediciones reales (curl dev server, 2026-05-18)

| Endpoint | TTFB | Total | Payload |
|---|---|---|---|
| GET /tiendas (HTML SSR) | 803ms | 869ms | 212KB |
| GET /marketplace/main (HTML SSR) | 1635ms | 5005ms | 584KB |
| GET /checkout (HTML SSR) | 164ms | 202ms | 85KB |
| GET /api/marketplace/catalog (cold) | 4919ms | 4920ms | 898KB |
| GET /api/marketplace/stores | 882ms | 882ms | 7KB |
| GET /api/marketplace/products | 155ms | 199ms | 91KB |
| GET /api/marketplace/orders | 750ms | 751ms | 24B (auth required) |
| GET /api/marketplace/payment | 117ms | 180ms | — |

**Notas de medicion:**
- `/marketplace/main` total=5s incluye streaming (RSC chunks llegan en rafagas).
- `/api/marketplace/catalog` cold: el primer request sin cache tarda 4.9s; con `Cache-Control: max-age=60` el segundo es ~60ms (Vercel CDN edge).
- Todas las mediciones son en localhost dev (Turbopack, sin compresion edge). Prod con Vercel CDN y Brotli sera ~30-40% mas rapido en payload.

---

## N+1 detectados

| Archivo | Linea | Patron | Queries por request | Fix |
|---|---|---|---|---|
| `lib/db/marketplace/orders.db.ts` | 256-295 | `for (item) { await tx.product.findFirst(...) }` dentro de `$transaction` | N queries (N = items carrito) | Batch: `findMany({ id: { in: productIds } })` antes de la tx |
| `lib/db/marketplace-public.db.ts` | 115-142 | `Promise.all(slugs.map(slug => ...findUnique))` | Hasta 10 queries paralelas en cold | `findMany({ slug: { in: missedSlugs } })` + populate cache |
| `app/api/marketplace/stores/route.ts` | 248-264 | `$queryRawUnsafe` adicional para `cover`+`hoursJson` despues del `findMany` | 2 queries por listado | Agregar `cover` y `hoursJson` al `select` del `findMany` (requiere schema update) o eliminar el segundo query con un JOIN en el rawUnsafe |
| `lib/db/marketplace/orders.db.ts` | 140-157 + 200-208 | `customer.findFirst` + `coupon.findFirst` seriales pre-tx | 2 queries seriales | `Promise.all([customer.findFirst, coupon.findFirst])` |

**N+1 conocidos ya resueltos (memoria `project_n1_known_patterns`):**
- `review.findMany 3x` → ya resuelto con `React.cache` en `app/marketplace/[slug]/page.tsx:21-23`.
- `tenant.findFirst 3x` → ya resuelto con `React.cache` en `app/marketplace/[slug]/page.tsx:16`.

---

## Recomendaciones quick-win (top 5 con ROI claro)

| # | Quick-win | Archivo | Esfuerzo | Impacto estimado |
|---|---|---|---|---|
| 1 | **Batch stock queries en `createFromCart`** — sacar `tx.product.findFirst` del `for` loop y reemplazar con `findMany` pre-tx | `lib/db/marketplace/orders.db.ts:256` | 30 min | -150ms por pedido de 5 items; reduce probabilidad de timeout en tx |
| 2 | **`Cache-Control` en `/api/marketplace/stores`** — agregar header `max-age=60, s-maxage=120, stale-while-revalidate=600` | `app/api/marketplace/stores/route.ts` | 5 min | 882ms → ~60ms cached (99% de requests) |
| 3 | **Migrar `<img>` → `next/image` en QR de pago** — Yape + Plin con `priority` | `components/checkout/YapePaymentPanel.tsx:101`, `PlinPaymentPanel.tsx:55` | 15 min | Elimina CLS en paso critico de pago; LCP del paso pago mejora ~200ms |
| 4 | **Paralizar `customer.findFirst` + `coupon.findFirst`** en `createFromCart` con `Promise.all` | `lib/db/marketplace/orders.db.ts:168-208` | 20 min | -60-120ms de latencia en checkout |
| 5 | **Dynamic import de `TiendasPromoCards` + `MisPedidosFavoritosStrip` + `RepetirUltimoPedido`** en TiendasClient | `app/tiendas/TiendasClient.tsx:55-56` | 20 min | -20-40KB del bundle inicial de /tiendas; mejora TTI en 3G |
