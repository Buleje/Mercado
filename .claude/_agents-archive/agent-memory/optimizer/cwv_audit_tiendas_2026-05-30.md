---
name: cwv-audit-tiendas-2026-05-30
description: Auditoría perf/CWV surface /tiendas + /marketplace/[slug] — 7 hallazgos P0-P2, framer estático, waterfall products+store, TiendasClient sin cache
metadata:
  type: project
---

Auditoría solo-lectura 2026-05-30. Surface: app/tiendas + app/marketplace/[slug].

**Hallazgos críticos:**

P0-A: `StoreDetailContent` (app/marketplace/[slug]/page.tsx:427) — waterfall serial: `getStoreBySlug` → `await productsRaw` → `await import(3 helpers)` → `Promise.all(3)`. Mínimo 3 RTTs seriales antes de llegar al Promise.all final.

P0-B: `TiendasPage` (app/tiendas/page.tsx:118) y `StoreDetailContent` NO tienen `"use cache"` a nivel de función. Solo `generateMetadata` tiene `"use cache"` en [slug]/page.tsx. Cada request golpea las DB helpers sin cache de Next 16 en la función del page.

P1-A: `framer-motion` importado ESTÁTICO en `MarketplaceStoresView.tsx:17` (`import { m } from "framer-motion"`). El componente es estático (no dynamic()), así que framer entra en el bundle inicial (~30KB gzip). `LazyMotion+domAnimation` en MotionProvider mitiga pero `m` sin `LazyMotion` scope en MSV carga el bundle completo.

P1-B: `useLastOrdersByStore` en `MarketplaceStoresView.tsx:554` — hook corre en CADA card render (no solo logged-in). Llama `useCustomerOrders` que hace fetch al mount para usuarios anónimos también.

P2-A: `StoreDetailContent` fetch 100 productos al SSR (limit: 100) sin paginación. Si una tienda tiene 100 productos, se serializan todos al cliente en el HTML inicial, inflando TTFB.

P2-B: `TiendasHeroAds` y `FeaturedStoresNearby` — ambos "use client" con fetch en useEffect. No tienen "use cache" porque son client-only. Correcto pero FeaturedStoresNearby hace fetch con `credentials: "include"` — incluye cookies aunque el usuario sea anónimo (overhead innecesario).

P2-C: `MarketplaceStoresView` doble render de subcategory chips: una lista mobile (overflow-x) y una lista desktop sidebar (hidden lg:flex). Ambas se renderizan en el DOM y subscriben al mismo state. Minor pero duplica nodos.

**Lo que YA está bien:**
- `getInitialMarketplaceStores` tiene `"use cache"` + `cacheLife("minutes")` + `cacheTag`
- `generateMetadata` en [slug] tiene `"use cache"`  
- `getStoreShowcaseByCategory` tiene `"use cache"`
- TiendasMap eliminado del toggle (ya no bloquea LCP)
- Framer envuelto en `LazyMotion+domAnimation` via MotionProvider
- MarketplaceStoresView ESTÁTICO (revertido de dynamic — back-nav fix aceptado)
- Skeleton TiendasLoading con dimensiones fijas (CLS ~0)
- `next/image` con `priority={index < 3}` en primeras cards (LCP candidate)
- dynamic(ssr:false) en 8 componentes desktop-only (buenos)

**Why:** Sesión 2026-05-30 auditoría completa solo-lectura.
**How to apply:** Al tocar [slug]/page.tsx, agregar "use cache" a StoreDetailContent. Al tocar TiendasPage, agregar "use cache". Al tocar MSV, mover framer a LazyMotion scope.
