# Session Handoff — 2026-05-21

> Sprint perf + SEO storefront. 18 commits, working tree limpio.

## Resumen ejecutivo

Sprint completo de optimización del flujo `/tiendas` → `/marketplace/[slug]`:

- **FOUC eliminado** en /tiendas y storefront (skeleton matched, chrome modeOverride, Suspense streaming).
- **Bundle storefront −60KB** (5 componentes lazy: ChatBubble, StoreReviews, StorePoliciesBlock, SharedMobileNavDrawer, ClosedNowBanner).
- **SPA navigation Link prefetch** en cards de tienda (antes full reload).
- **SEO pro completo**: 6 JSON-LD schemas (incl. nuevo ItemList con 30 Products + Offer InStock PEN), hreflang es-PE + x-default, SpeakableSpecification para voice search.
- **Bug Next 16 cerrado**: `Uncached data` error en /tiendas/layout.tsx (Suspense boundaries).

## Commits de la sesión (18)

```
36af2e78  chore(reports): screenshots verificación seo pro + suspense fix
f5042b16  feat(seo): suspense fix uncached data + hreflang + speakable + bundle pro
c78f8603  chore(reports): screenshot storefront + verificación json-ld itemlist seo v3
8c4fbb75  feat(seo): json-ld itemlist con productos del catálogo storefront
d97b52c9  chore(reports): screenshot final storefront post-v7
3604ecb3  perf(storefront): lazy sharedmobilenavdrawer + closednowbanner (~28kb más)
88d75a12  chore(reports): screenshots verificación visual storefront v6
289cb6fb  perf(storefront): lazy load chatbubble + reviews + policies (~32kb bundle)
bc138836  perf(storefront): suspense fallback usa skeleton matched
d1379f13  perf(marketplace): consumers pasan Next Link a StoreCard.renderLink
704877a0  feat(design-system): store-card slot renderLink para SPA navigation
f7b7a502  chore(reports): screenshots auditoría visual — tiendas Rappi-style
adff8d49  feat(marketplace): pulido visual tiendas — loading skeleton
6f33ff90  chore(hooks): baja threshold load-1min en mem-guard 25 → 14
835ac6e9  perf(tiendas): elimina chips legacy + ExplorarTracker out of initial bundle
c447def2  chore(security): override uuid/postcss/@hono-node-server para 8 moderate
8612edbe  perf(tiendas): elimina FOUC residual del Footer + duplicación de "Ordenar"
0f8fcb4b  perf(tiendas): elimina flash de chrome + skeleton matched + stale-while-revalidate
```

## Archivos modificados / creados clave

| Archivo | Cambio principal |
|---|---|
| `app/tiendas/layout.tsx` | Suspense boundaries (NavbarSkeleton fallback), removidos ConditionalPromoBar/SecondaryNav, modeOverride="tiendas-only" |
| `app/tiendas/loading.tsx` | Skeleton matched al grid final (filter bar + 8 cards aspect 4:3) |
| `app/tiendas/page.tsx` | `alternates.languages { es-PE, x-default }` |
| `app/tiendas/TiendasClient.tsx` | Skip refetch redundante, stale-while-revalidate, eliminado QuickFilterChips legacy, ExplorarTracker lazy |
| `app/marketplace/[slug]/page.tsx` | Suspense fallback usa StoreDetailLoading, ChatBubbleLazy import, `ProductsItemListJsonLd` 30 productos, hreflang, speakable |
| `app/marketplace/[slug]/loading.tsx` | Reescrito skeleton matched (hero + stats + filter + grid 8 cards) |
| `app/marketplace/[slug]/producto/[productId]/page.tsx` | hreflang es-PE + x-default |
| `components/marketplace/MarketplaceNavbar.tsx` | Prop `modeOverride` vence al hook client (anti-FOUC) |
| `components/Footer.tsx` | Prop `modeOverride` para footer compacto en /tiendas |
| `components/marketplace/MarketplaceFilters.tsx` | Gate `{!extraSort && ...}` desktop bar — fin duplicado Ordenar |
| `components/marketplace/store-detail/StoreDetailClient.tsx` | Lazy: StoreReviews, StorePoliciesBlock, SharedMobileNavDrawer, ClosedNowBanner |
| `components/marketplace/ChatBubble/ChatBubbleLazy.tsx` | NUEVO — wrapper client-only dynamic ssr:false |
| `packages/design-system/src/store-card.tsx` | Slot `renderLink` para SPA navigation |
| `components/marketplace/MarketplaceStoresView.tsx` | renderLink={Link} de next/link |
| `components/marketplace/MarketplaceGrid.tsx` | renderLink={Link} |
| `components/marketplace/explorar/RecommendationsStrip.tsx` | renderLink={Link} |

## SEO inventory final del proyecto

| Schema / Meta | Home `/` | `/tiendas` | Storefront `/marketplace/[slug]` | Producto `/producto/[id]` |
|---|---|---|---|---|
| canonical | OK | OK | OK | OK |
| hreflang es-PE + x-default | (root) | NUEVO | NUEVO | NUEVO |
| OpenGraph 1200×630 + alt | OK | OK | OK | OK |
| Twitter summary_large + image alt | OK | OK | OK | OK |
| Robots prod/dev + bots IA | OK (root) | | | |
| Sitemap dinámico stores+productos+recetas | OK | | | |
| WebSite + SearchAction | OK | | | |
| Organization sameAs | OK | | | |
| FAQPage | OK | | | |
| Restaurant/LocalBusiness + geo + opening + priceRange + paymentAccepted + parentOrganization + contactPoint | | | OK | |
| AggregateRating | | (per-store en ItemList) | OK (si reseñas) | OK |
| BreadcrumbList | (3 niveles) | (3 niveles) | OK 3 niveles | OK 4 niveles |
| CollectionPage + ItemList(LocalBusiness) | | OK 12 stores | | |
| ItemList(Product) + Offer InStock PEN | | | OK 15-30 productos NUEVO | |
| Product + brand + sku + Offer | | | | OK |
| **SpeakableSpecification** | | | NUEVO | |
| Service Worker network-only HTML | OK (root) | | | |
| Preconnect Supabase CDN | OK (root) | | | |

## Métricas perf finales (warm, localhost)

| Página | TTFB | Notas |
|---|---|---|
| `/tiendas` | 0.15–0.20s | Skeleton matched + 0 deltas en 7 frames |
| `/marketplace/[slug]` cold | 0.22–0.39s | HTML SSR ~440KB (con productos prerendered) |
| Transición /tiendas → storefront | firstContent 716ms (antes 1557ms, -54%) | SPA navigation con Link prefetch |
| Skeleton storefront visible | t=400ms post-click | Antes: icono Paiche hasta 800ms |

## Verificaciones live (Playwright)

```js
// /marketplace/pizza-pucallpa (extraído del DOM)
{
  jsonld_types: [OnlineStore, Organization, SiteNavigationElement,
                 Restaurant, BreadcrumbList, ItemList],
  speakable_present: true,
  speakable_selectors: ["#store-hero-heading", "#store-hero-tagline"],
  hreflang_es_PE: true,
  hreflang_x_default: true,
  twitter_image_alt: "Pizzeria Daily Fresh — Restaurante en Calleria",
  restaurant_priceRange: "S/ 5 - S/ 100",
  restaurant_paymentAccepted: "Cash, Yape, Plin",
  itemList_count: 15,
  breadcrumb_levels: 3,
}
```

## Screenshots clave en `reports/`

- `tiendas-perf-after-desktop.jpg` / `mobile.jpg` — Round 1 /tiendas
- `tiendas-perf-v2-desktop.jpg` / `mobile.jpg` — Round 2 Footer fix
- `tiendas-perf-v3-desktop.jpg` — Round 3 chips legacy
- `storefront-perf-v5-after.jpg` — Suspense fallback fix
- `storefront-v6-t500ms.jpg` + `transition.jpg` — v6 lazy load
- `storefront-v7-final.jpg` — full page post-v7
- `storefront-seo-v3-full.jpg` — SEO ItemList confirmado
- `tiendas-seo-pro-fix-uncached.jpg` — Suspense fix Next 16
- `storefront-seo-pro-final.jpg` — Estado final SEO pro

## TODO pendiente cuando vuelvas

1. **Validar Rich Results en producción**: cuando deploy, correr el HTML por `search.google.com/test/rich-results` para confirmar Restaurant + ItemList + BreadcrumbList + Speakable detectados.

2. **Lighthouse SEO 100**: correr Lighthouse en producción y confirmar SEO score 100. Cualquier warning, ajustar.

3. **Cargar horarios en Pizzeria Daily Fresh** desde el admin: actualmente `openingHoursSpecification` viene vacío (Restaurant sin OpeningHours = pierde rich snippet de horario en Google).

4. **38 archivos sin commitear de sesiones previas** (los del inicio de esta sesión): revisar si hay trabajo pendiente del sprint anterior (filtros visuales, etc.). No son del scope perf+SEO de hoy.

5. **`Restaurant.parentOrganization` referencia `${baseUrl}/#organization`**: el `Organization` solo se emite en home `/`. Google merge por `@id` cross-page debería funcionar, pero conviene verificar en Rich Results Test que la entidad enlazada se reconozca.

6. **Patrón compound-learning detectado**: `app/marketplace/[slug]/page.tsx` editado 4x en esta sesión. Candidato para encapsular los JSON-LD helpers en un module separado (`lib/marketplace/seo-schemas.ts`) si se vuelve a tocar en >2 sesiones más.

## Reglas críticas respetadas

- ADR-075 (DS single source of truth): el slot `renderLink` mantiene el DS framework-agnostic.
- Regla #4 CLAUDE.md (Next 16 cache components): `"use cache"` + cacheLife/Tag + Suspense para uncached data.
- Regla #1 CLAUDE.md: solo `lib/db/*.db.ts`, nunca prisma.* directo.
- Skill `bsm-typography-rules`: skeletons con `h-12 rounded-2xl border-2`, sin emojis.
- Dark mode: solo tokens DS (`--surface-sunken`, `--rule-soft`, etc.), nunca hex.

## Cómo retomar

Cuando vuelvas:
1. `git pull` (si trabajaste desde otro lado).
2. Ver este archivo para contexto.
3. Iniciar dev: `npm run dev` (Turbopack default).
4. Para validar visualmente, navegar a `http://localhost:3000/tiendas` → click en una tienda. Skeleton matched + SPA navigation deberían ser instantáneos, sin flash.
5. Para validar SEO: abrir consola del browser sin error "Uncached data" + extraer JSON-LD con `[...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent))`.
