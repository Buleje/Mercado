# Delta — Marketplace Tier 2 (sesión 2026-04-16)

## Items Tier 2 — estado final

| # | Item | Estado | Commit |
|---|---|---|---|
| 13 | Dynamic sitemap (stores + products + zones) | ✅ | `984204f` |
| 14 | Canonical per zone (`?zona=X`) | ✅ | `ec3340a` |
| 6 | Server Component + `"use cache"` initial fetch | ✅ | `ec3340a` |
| 8 | Hover prefetch 500ms | ✅ | `08c58ce` |
| 3 | Live viewers social proof | ✅ | `08c58ce` |
| 5 | Undo add-to-cart toast | ✅ | `1adf3c3` |

**Tier 2 completado: 6 de 6 items (100%).** El Server Component migration — lo que había quedado deferido del Tier 1 — también cerrado.

## Métricas delta (Tier 2 solo)

| Métrica | Antes Tier 2 | Final Tier 2 | Δ |
|---|---|---|---|
| Tests marketplace | 36 | **45** (+9 nuevos) | +9 |
| Tests globales passing | 2913 | **2928** | +15 |
| Tests failing | 0 | 0 | = |
| TSC errors | 0 | 0 | = |
| Commits ráfaga Tier 2 | 0 | **4** | +4 |

## Archivos nuevos creados

| Archivo | Propósito |
|---|---|
| `lib/marketplace/initial-stores.ts` | Server-only fetcher con `"use cache"` para first paint |
| `hooks/use-hover-prefetch.ts` | Prefetch 500ms hover con cancelación |
| `hooks/use-cart-with-undo.ts` | Wrapper de useMarketplaceCart con toast de deshacer |
| `components/marketplace/LiveViewers.tsx` | Social proof "N personas viendo" con threshold |
| `app/api/marketplace/stores/[slug]/live-viewers/route.ts` | Endpoint real Upstash (stub si no hay Redis) |
| `__tests__/hooks/use-hover-prefetch.test.ts` | 4 tests del hook |
| `__tests__/hooks/use-cart-with-undo.test.ts` | 6 tests del hook |
| `__tests__/marketplace/LiveViewers.test.tsx` | 5 tests del componente |

## Archivos modificados

- `app/marketplace/page.tsx` — async Server Component + generateMetadata
- `app/sitemap.ts` — dynamic stores + products + zones
- `components/marketplace/MarketplaceContent.tsx` — initialStores prop
- `components/marketplace/MarketplaceGrid.tsx` — hover prefetch + LiveViewers
- `components/marketplace/UnifiedProductCard.tsx` — undo cart wiring
- `components/marketplace/ProductQuickView.tsx` — undo cart wiring
- `components/marketplace/StoreDetail.tsx` — undo cart wiring

## Commits de la ráfaga Tier 2

```
1adf3c3 feat(marketplace): undo toast on add-to-cart across 3 entry points
08c58ce feat(marketplace): hover prefetch + live viewers social proof
ec3340a feat(marketplace): server component initial fetch + canonical per zone
984204f feat(seo): dynamic sitemap with stores + products + zones
```

## Patrón de orquestación aplicado

- **3 agentes paralelos** (SEO, Prefetch+SocialProof, UndoCart)
- **Main thread**: Server Component migration (MarketplaceContent prop + page.tsx SSR wire)
- **Auto-fix** de issues introducidos por agentes:
  - `next/dist/lib/utils` import (no existe en Next 16) → inline type
  - `StoreProduct.updatedAt` (no existe en schema) → fallback `now`
  - `let marketplacePages` → `const`
  - Empty `.catch(() => {})` en route danger zone → `logger.warn`
- **0 regresiones** · **0 uso de HUSKY=0**

## Impacto esperado post-deploy

| Métrica | Expectativa |
|---|---|
| **Google index coverage** | ~5 → potencial 10k+ URLs (x2000) |
| **Long-tail traffic (3-6 meses)** | +3-5x |
| **SERP canonical correctness** | Sin penalización por duplicate content |
| **LCP mobile 3G** | −30 a −40% (SSR stores eliminates waterfall) |
| **Percibed speed en navegación** | Click → page loaded (prefetch hover) |
| **Trust / social proof** | "N viendo ahora" cuando >= 3 (real data only) |
| **Add-to-cart anxiety** | Reducida (3s undo window) |

## Session totals — Día 2026-04-16

| Métrica | Inicio del día | Final Tier 2 | Delta |
|---|---|---|---|
| Commits del programa | 0 | **54** | +54 |
| TSC errors | 83 | **0** | −83 |
| Tests failing | 71 | **0** | −71 |
| Tests passing | 2543 | **2928** | **+385** |
| Hex codes JSX | 1898 | **~1324** | −574 (−30%) |
| Sub-proyectos cerrados | 0 | 1 (#3 ✅) | +1 |
| Sub-proyectos en progreso | 0 | 2 (#1 30%, Marketplace Tier 1+2 ~85%) | +2 |
| MCPs nuevos activos | 0 | **4** (github, sentry, memory, sequential-thinking) | +4 |
| Skills creados | 0 | **4** (ultra-impact, pr-describer, visual-regression, migration-planner) | +4 |
| Hooks creados | 0 | **1** (hex-code-guard) | +1 |
| Archivos nuevos en marketplace | 0 | **8** | +8 |

## Tier 3 — qué queda para próxima sesión

De mi plan original Tier 1-3:
- #4 Checkout friction reduction (danger zone — checkout squad)
- #9 Split MarketplaceContent 750→300 LOC
- #10 Virtualization grid con react-window
- #17-21 Mobile UX polish (pull-to-refresh, sticky filter, bottom sheet)
- #22-24 Trust (horarios en vivo, entrega por GPS, reviews preview)

Y extras sugeridos por agentes:
- Registrar visita POST desde StoreDetail (activar el contador real de LiveViewers)
- Aplicar hover prefetch también a UnifiedProductCard
- Toast bottom-center en mobile
- Refrescar LiveViewers cada 60s

## URLs del dev server

- Marketplace: http://localhost:3001/marketplace
- Marketplace filtrado: http://localhost:3001/marketplace?zona=pucallpa-centro
- Sitemap: http://localhost:3001/sitemap.xml
