# Bundle audit + lazy load — Runbook

> **Pentest 2026-05-18 Sprint D #7.** Setup ya está en el repo (`@next/bundle-analyzer`).
> Brandon corre el audit cuando quiera + aplica los lazy loads en la siguiente
> sesión iterativa. Esto NO bloquea seguridad — es perf que Lighthouse mide.

## Correr el análisis (1 comando)

```bash
ANALYZE=true npm run build
# Genera: .next/analyze/client.html, server.html, edge.html
# Abre client.html en browser → mapa de chunks por tamaño.
```

`next.config.ts` ya tiene el wrapper `withBundleAnalyzer` condicionado a
`ANALYZE=true` — no hace overhead en builds normales.

## Top sospechosos a lazy-loadear (basado en grep heurístico)

| Componente | Ruta | Por qué pesa | Lazy fix |
|---|---|---|---|
| **`TiendasMap`** | `/tiendas` | Leaflet + ubigeo-peru | Ya está con `dynamic({ ssr: false })` ✅ |
| **`PromoBannerRenderer` + framer-motion** | `/tiendas` | framer en bundle initial | Wrap en `dynamic` |
| **`NotificationsMenu`** | Navbar admin | framer-motion + lista 100+ | Ya `dynamic` ✅ |
| **`DiscoverMegaMenu`** | Navbar marketplace | Posibles imports grandes | Audit |
| **`StoryHero` / `StoryCarousel`** | Storefront | Carrusel + imágenes | `dynamic` con loading skeleton |
| **`SunatInvoiceModal`** | Admin | jsPDF + html2canvas grande | `dynamic({ ssr: false })` |
| **Chart libs (Recharts)** | Admin dashboard | Imports masivos | Ya lazy en algunos lugares ✅ |
| **`@buleje/design-system/icons`** | Todos lados | Lucide tree-shake auto | OK si import individual |
| **Editor visual (CMS)** | `/panel`, `/cms` | TipTap o similar | Verificar y `dynamic` |

## Patrón Next 16 para lazy

```tsx
import dynamic from "next/dynamic";

const HeavyComponent = dynamic(
  () => import("@/components/heavy/HeavyComponent"),
  {
    ssr: false,           // si depende de window
    loading: () => <Skeleton />,
  }
);
```

## Target Lighthouse

| Métrica | Antes (estimado) | Target post-fix |
|---|---|---|
| LCP | 2.5–3.0s | < 2.0s |
| TBT | 300–500ms | < 200ms |
| FCP | 1.5s | < 1.0s |
| Total bundle initial | ~600KB | < 400KB |
| Lighthouse Performance | 75–85 | 95+ |

## Verificación post-fix

```bash
# 1. Bundle analyzer
ANALYZE=true npm run build

# 2. Lighthouse local (Chrome DevTools)
npm run dev
# Browser → DevTools → Lighthouse → run on /tiendas

# 3. PageSpeed Insights production
# https://pagespeed.web.dev/?url=https%3A%2F%2Fbuleje.pe%2Ftiendas
```

## TODO bloqueante para Brandon

1. [ ] Correr `ANALYZE=true npm run build`
2. [ ] Abrir `.next/analyze/client.html`, identificar top 3 chunks pesados
3. [ ] Aplicar `dynamic()` a los 3 (excepto si ya está)
4. [ ] Re-correr Lighthouse antes/después para medir delta
5. [ ] Si score < 90, considerar Phase B (image responsive + edge cache)
