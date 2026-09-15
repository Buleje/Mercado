---
name: bsm-design-system
description: Design system de Buleje/Bodega San Martín — identidad "editorial de selva", tokens reales de globals.css, primitivos del DS y single-sources, recetas visuales firma (carnet premium, gauges, gradientes por categoría, filtros h-12), sistema de motion v4, y modo creativo con guardrails. Usar ANTES de crear/editar componentes UI y cuando Brandon pida diseño nuevo, "modo creativo", "premium", o "que se vea mejor".
user-invocable: true
model: sonnet
allowed-tools: Read, Grep, Glob
argument-hint: "[tokens|primitivos|recetas|motion|creativo]"
---

# Design System — Buleje (verificado 2026-07-04)

UI custom (**NO shadcn/ui**). Single source de estilo = `app/globals.css` (~3200 líneas: `@theme` inline `:60`, editorial light `:1921+`, dark `.dark` `:2177+`).

## 1. Identidad: "editorial de selva"

No es un SaaS genérico — es una bodega amazónica premium con lenguaje editorial:

| Ingrediente | Concreto |
|---|---|
| **Turquesa del logo** | `--accent` `#00A0A0` light / `#14C2C2` dark. Hover `--accent-600`, pressed/texto-AA `--accent-dark` |
| **Coral** (secundario/warning) | `#ff6b5b` — reemplaza al naranja en TODA la marca |
| **Display serif** | Instrument Serif vía `.font-display` (peso 400, italic solo explícito). Body = sans del sistema. OJO: Socio Buleje usa **sans bold, NO serif** (decisión 2026-07-04) |
| **Textura editorial** | `.noise-texture-bg` (SVG fractalNoise, opacity .035 light / .06 dark) |
| **Radius disciplinado** | `--radius-xs…xl` = 4/6/8/12/16px — nada >16px salvo overlays. Excepción: filtros storefront `rounded-2xl` |
| **Greca amazónica** | patrón SVG sutil identidad shipibo en superficies premium (ver receta carnet §4) |

## 2. Tokens núcleo (usar SIEMPRE, nunca hex)

| Token | Light | Dark |
|---|---|---|
| `--surface-canvas / -sunken / -raised` | `#fff / #fafafa / #fff` | `#0d1117 / #161b22 / #1c2230` |
| `--text-primary / -secondary / -tertiary` | `#0a0a0a / #525252 / #737373` | `#f0f3f7 / #b8c0cc / #a3aab5` |
| `--rule-soft / -base / -strong` | `#f5f5f5 / #e5e5e5 / #171717` | `#1f2530 / #2e3645 / #4c5566` |
| `--accent` + `-soft/-muted/-glow` | `#00A0A0` + rgba .06/.13/.28 | `#14C2C2` + rgba .10/.20/.24 |
| `--data-{success,warning,error,info}-500` | teal / coral / `#ef4444` / `#0ea5e9` | brights |
| `--data-1…8` (dataviz) | mono + 4 acentos | invertidos |
| `--ts-2xs…3xl` | 10→30px (mínimos: ver bsm-typography-rules) | = |
| `--shadow-sm…xl` | alias `--elev-1…4` | = |

Alias sin sufijo: `--data-success` = `-500` pero `--data-warning/error/info` = `-700` en light.

## 3. Gotchas que rompen diseños (verificados)

1. **Remap anti-naranja** (`@theme :60-90`): `amber-*` → escala **coral** y `orange-*` → escala **teal**. Un `bg-amber-400` copiado de internet renderiza coral. Es intencional (identidad); no "arreglarlo".
2. **`max-w-{sm,md,lg,xl}` valen ~2×** (720/960/1200/1440px) por override `--container-*`. Modales/popovers → rem explícito (`max-w-[28rem]`).
3. Dark mode = **clase `.dark`** (`@custom-variant`), toggle `localStorage buleje-theme`; admin tiene overrides scoped `[data-admin-shell="true"]`.
4. Storefront hard-reload siempre arranca light (sessionStorage) — verificar ambos temas igual.

## 4. Antes de crear: primitivos existentes (reusar, no clonar)

- **`@buleje/design-system`** (barrel `packages/design-system/src/index.ts`): tipografía canónica `PageTitle/SectionTitle/CardTitle/BodyText/Caption/Label/Kicker` · layout `AdminPage/AdminSection/AdminGrid` · feedback `*Alert/EmptyState/LoadingState` · data `StatCard/ChartWrapper/DataTable/BadgeStatus` · store `ProductCard{Hero,Grid,Compact}`, `StoreCardCanonical`, `RecipeCardCanonical` · helpers `cn/undoToast/useInView/useSwipe`. Iconos: `@buleje/design-system/icons` (fuera del barrel).
- **`components/ui-system/`**: `motion.ts` (§5), `UnifiedHero`, `SegmentedControl`, `QuantityStepper`, `BottomSheet`, `SmartSearchBar`, `AnimatedPrice`, `CountUp`, `ConfettiBurst`, `Shimmer`, `SkeletonEditorial`, `EmptyStatePresets`, `BulejeLoader`, `LazyImage`, `VirtualList`, `StickyMobileCTA`.
- **Single sources marketplace** (`components/marketplace/`): `PaymentIcons` (arte ORIGINAL Yape/Plin/Efectivo — nunca logos oficiales), `ProductPhotoFallback` (único "sin foto"), `StoreAvatar` (logo→letra). Gradientes de recetas: `lib/recipe-gradients.ts`.
- Antes de crear un primitivo: `grep -rn "function <X>\|const <X> =" --include="*.tsx"` (shadow-detector) — los clones internos ya causaron bugs.

## 5. Recetas firma (copy-paste con paths)

**Hero premium teal** (`components/socio-buleje/SocioHero.tsx:48`):
```css
background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 55%, #0d3b3b 100%)
```

**Carnet/tarjeta premium** (`SocioHero.tsx:135-180`): gradiente 125deg análogo + greca SVG `<pattern width=26>` + brillo diagonal `absolute -inset-y-10 -left-1/4 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/20 to-transparent` + chip metálico `bg-gradient-to-br from-amber-200 to-amber-400 ring-1 ring-inset ring-amber-500/40` (renderiza dorado-coral por el remap).

**Gauge semicircular** (`SocioCalculadora.tsx:37,131`): SVG `viewBox="0 0 240 138"`, track `stroke=var(--surface-sunken) strokeWidth=16 strokeLinecap=round`, fill con `<linearGradient>`.

**Card de categoría con impacto** (`components/store/RecetarioClient.tsx:216`): gradiente 135deg por categoría (desde `lib/recipe-gradients.ts`) + ícono Lucide gigante `h-20 w-20 text-white/95 drop-shadow group-hover:scale-110` + orbes decorativos `rounded-full bg-white/15 blur-xl`.

**Filtros storefront** (`store-detail/StoreCatalog.tsx:356`): `h-12 text-base rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]`. Variante hero editorial: mismo patrón con `rounded-none`, hover invierte a `--text-primary` (`StoreHero.tsx:223`).

**Escalera de tiers gamificada** (`components/customer/socio-buleje/SocioTierBadge.tsx`): bronce→plata→oro→diamante, 3 variantes (icon/chip/card con % al próximo tier).

## 6. Motion (sistema v4 — ADR-062)

- **Canónico**: `components/ui-system/motion.ts` — `EASE.editorial [0.22,1,0.36,1]` (default entradas), `entrance` (modals/sheets), `snap`, `exit`, `bounce` (solo celebración); `DURATION` 0.08→0.8s; variants `fadeUp` etc. Importar de ahí, no inventar cubic-beziers.
- **CSS espejo**: `--ease-editorial/out-expo/bounce-soft`, `--motion-fast/base/slow/deliberate` (150/250/400/600ms), `--dur-*`.
- **Capas**: Framer Motion (111 archivos) para UI interactiva · GSAP lazy solo scroll-triggered complejo · CSS keyframes (~67: `skeleton-shimmer`, `confettiBurst`, `cartBounce`, `glowPulse`, `morphBlob`, `num-flip-in`, view transitions `bsm-vt-*`) para ambiente.
- `prefers-reduced-motion` mata todo repo-wide — nunca animar sin fallback estático legible.

## 7. Modo creativo (innovar sin romper)

Cuando Brandon pida "modo creativo" / "premium" / "sorprendeme": **combinar ingredientes firma en formas nuevas**, no importar estéticas ajenas.

1. Elegí 2-3 ingredientes de §1/§5 (ej. gradiente teal profundo + greca + num-flip-in) y componelos distinto — nunca los 6 juntos (ruido).
2. Un elemento héroe por vista (gauge, carnet, ícono gigante) — el resto respira con espacios y `--surface-sunken`.
3. Gradientes SIEMPRE anclados en tokens (`var(--accent)` → `var(--accent-dark)` → tinte profundo) o en `lib/recipe-gradients.ts`; jamás arcoíris arbitrario.
4. Checklist de salida: ambos temas ✓ · contraste AA (`--text-tertiary` ya está fixeado, no bajar de ahí) ✓ · touch 44px ✓ · tipografía ≥ mínimos de bsm-typography-rules ✓ · motion con EASE canónico + reduced-motion ✓ · `/preview <ruta>` light+dark como evidencia.

## 8. Reglas duras (sin excepción)

1. NO shadcn/ui — primitivos propios (§4).
2. Color solo vía tokens; hex nuevos únicamente como tinte profundo de gradiente firma (ej. `#0d3b3b`).
3. Dual-render tablas: desktop `<table>` / mobile cards (`hidden sm:block` + `sm:hidden`).
4. Toda UI nueva funciona en light Y dark (verificar ambos, no asumir).
5. `aria-hidden` en decorativos (orbes, grecas, partículas); `aria-live="polite"` en tickers.
6. Spacing: `px-4 sm:px-6 lg:px-8`, container `max-w-7xl`, gaps `gap-3/4/6`.
