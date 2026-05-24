# Auditoría de Performance — Buleje 2026-05-23

## Resumen ejecutivo

| Area | Estado | Hallazgos |
|------|--------|-----------|
| Bundle size | CRITICO | 2 chunks sin gzip >900KB; 68 archivos recharts totales |
| Imagenes | MODERADO | 26 `<img>` raw en components/; 5 CSS bg-image publicos sin next/image |
| Dynamic imports | BUENO | 133 tabs admin con next/dynamic; 2 RSC leaking recharts |
| Cache strategy | BUENO | 35 "use cache" + 69 cacheLife/Tag; 0 force-dynamic violaciones |
| Contexts | MODERADO | 3 contexts sin useMemo en value (tenant, settings, promotions) |
| Fuentes | BUENO | next/font/google en layout.tsx; sin @import externos |
| Delivery polling | MODERADO | 10 setIntervals sin visibility guard |
| PostHog | BUENO | lazy import con requestIdleCallback (fix previo 2026-05-12) |
| Warmup | AUSENTE | No existe /api/warmup ni fire-and-forget de rutas pesadas |

## P0 — Critico

| # | Hallazgo | Archivo | Impacto | Accion |
|---|----------|---------|---------|--------|
| P0-01 | 2 chunks >900KB (947KB + 910KB) — 3G Pucallpa = 4-6s extra | `.next/static/chunks/097x2mx805khr.js`, `0o9fn77msnld9.js` | TTI +4-6s | `npm run analyze` para diagnosticar |
| P0-02 | 2 RSC importando recharts sin "use client" | `components/admin/inventario/DemandForecast.tsx:15`, `components/admin/InventoryMetricsTab.tsx:31` | Bundle +~120KB gzip extra SSR | Agregar `"use client"` (2 min) |
| P0-03 | 10 setIntervals en delivery sin `document.hidden` guard | `PartnerMap.tsx`, `StreaksAndBonusCard.tsx`, `EarningsTodayHero.tsx`, `PartnerDashboard.tsx`, `HotZonesPanel.tsx`, `RiderScoreCard.tsx`, `OfferCard.tsx` | CPU/batería Android | Agregar check `if (document.hidden) return` |

## P1 — Alto

| # | Hallazgo | Archivo | Impacto | Accion |
|---|----------|---------|---------|--------|
| P1-01 | `tenant-context`: `value` inline sin useMemo | `contexts/tenant-context.tsx:129` | Re-render cascada toda la app store | useMemo con 5 deps |
| P1-02 | `settings-context` value inline 9 props | `contexts/settings-context.tsx:283` | Re-render cascada store+admin | useMemo |
| P1-03 | `promotions-context` value con promotions array nuevo | `contexts/promotions-context.tsx:60` | Re-renders ProductCard, banner | useMemo |
| P1-04 | 26 `<img>` HTML raw en components/ | SettingsModule, StoreAnalyticsModule, PaymentStep, SectionRenderer, ProductQRGenerator | LCP alto mobile | Migrar a `<Image>` next/image |
| P1-05 | CSS `background-image` en hero/banners sin next/image | `PromoBannerRenderer.tsx:304`, `TiendaHero.tsx:96`, `BundlesTab.tsx:212`, `HeroBlock.tsx:87` | LCP alto | `<Image fill objectFit="cover">` |
| P1-06 | Sin /api/warmup | No existe | TTFB alto en primera carga admin | Crear endpoint + fire-and-forget en useAdminPrefetch |

## P2 — Moderado

| # | Hallazgo | Accion |
|---|----------|--------|
| P2-01 | `perf-measure-patch.js` sincrono bloqueante | `<Script strategy="afterInteractive">` |
| P2-02 | `back-nav-refresh.js` con `defer` nativo | `<Script>` de Next |
| P2-03 | ratio cache: 283 getOrSet vs 681 writes (41%) | getOrSet en DB analytics/stats |
| P2-04 | Sin `size-limit` configurado | Thresholds CI |
| P2-05 | `dashboard-data-context` solo 2 useMemo/CB | Auditar value memoización |

## Estado positivo confirmado

- Fonts: `next/font/google` sin @import externos ✅
- PostHog: lazy + requestIdleCallback ✅
- `force-dynamic`: 0 violaciones activas en `app/` pages (28 en `api/` ver security) ✅
- Cart context: 19 useMemo/useCallback + value memoizado ✅
- html-to-image: dynamic on-demand ✅
- Admin 133 tabs: todos con next/dynamic ✅
- GPU hints: 97 usos will-change/transform/translateZ ✅
- `"use cache"`: 35 usos en app/; cacheLife/Tag 69 ✅

## Top 10 Quick Wins

| # | Accion | Esfuerzo | Impacto |
|---|--------|----------|---------|
| 1 | `"use client"` a DemandForecast + InventoryMetricsTab | 2 min | Elimina recharts SSR |
| 2 | useMemo en tenant-context value | 5 min | INP -20ms |
| 3 | useMemo en settings-context value | 5 min | INP -15ms |
| 4 | useMemo en promotions-context value | 5 min | Re-renders ProductCard -N |
| 5 | Visibility guard en 10 setIntervals delivery | 20 min | CPU/batería -60% bg |
| 6 | Script→`<Script>` afterInteractive | 5 min | LCP -50ms |
| 7 | size-limit en package.json | 15 min | CI gate |
| 8 | Migrar top 3 `<img>` a next/image | 1h | LCP -200ms |
| 9 | CSS bg-image → `<Image fill>` | 20 min | LCP home |
| 10 | `npm run analyze` para chunks 900KB | 10 min | Diagnóstico base |

## Métricas snapshot

| Metrica | Actual | Objetivo |
|---------|--------|----------|
| Chunk más grande | 947KB | <250KB |
| 2do chunk | 910KB | <250KB |
| Archivos recharts | 68 | — |
| RSC recharts sin "use client" | 2 | 0 |
| `<img>` raw | 26 | 0 |
| CSS bg-image | 5 | 0 |
| setIntervals sin guard | 10 | 0 |
| Contexts sin useMemo | 3 | 0 |
| force-dynamic violaciones (pages) | 0 | 0 |
| "use cache" en app/ | 35 | creciente |
