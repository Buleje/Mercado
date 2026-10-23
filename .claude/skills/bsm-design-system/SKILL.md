---
name: bsm-design-system
description: "Diseño de Buleje: tokens, primitivos del DS y reglas duras de UI (sin hex, claro y oscuro, tamaños mínimos). Usar cuando vayas a crear o editar una pantalla o componente visible (tienda, marketplace, panel), o Brandon pida «que se vea mejor», «premium» o «modo creativo»."
user-invocable: true
model: sonnet
allowed-tools: Read, Grep, Glob
---

# Diseño - Buleje

UI propia, **sin shadcn/ui**. Un solo origen de estilo: `app/globals.css`. Identidad «editorial de selva»: turquesa del logo + coral, mucho aire, serif de display solo en tienda y marketplace.

## Tokens: por nombre, nunca hex

| Grupo | Tokens |
|---|---|
| Superficie | `--surface-canvas` `-sunken` `-raised` |
| Texto | `--text-primary` `-secondary` `-tertiary` (no bajar de ahí: AA) |
| Borde | `--rule-soft` `-base` `-strong` |
| Acento | `--accent`; hover `-600`; pressed y texto sobre claro `-dark`; texto sobre tinte `-ink`; `-soft` `-muted` `-glow`. Tailwind `bg-primary` (`--color-primary`): familia paralela casi igual |
| Estado | `--data-{success,warning,error,info}-{50,100,500,600,700}` (coral = warning) |
| Tipo | `--ts-2xs..3xl` (10 a 30 px; en el panel 2xs = 12 px) |
| Forma | `--radius-xs..xl` = 4/6/8/12/16 px (nada >16 salvo overlays); `--shadow-sm..xl` |

Valores por tema: `rg -n -- '--accent' app/globals.css`, no de memoria. Claro por defecto; oscuro = clase `.dark`, guardada por pestaña en `sessionStorage`.

## Primitivos: reusar, no clonar

- `@buleje/design-system` (`packages/design-system/src/index.ts`): `PageTitle/SectionTitle/CardTitle/Kicker`, `AdminPage/AdminSection/AdminGrid`, `InfoAlert/WarningAlert/ErrorAlert/SuccessAlert`, `EmptyState/LoadingState`, `StatCard/ChartWrapper/DataTable/BadgeStatus`, `ProductCard{Hero,Grid,Compact}`, `StoreCardCanonical`, `RecipeCardCanonical`, `cn/undoToast/useInView/useSwipe`. Íconos: `@buleje/design-system/icons`.
- `components/ui-system/` (hay más: `ls` antes): `motion.ts`, `UnifiedHero/SegmentedControl/QuantityStepper/BottomSheet/SmartSearchBar/AnimatedPrice/CountUp/ConfettiBurst/Shimmer/SkeletonEditorial/EmptyStatePresets/BulejeLoader/LazyImage/VirtualList/StickyMobileCTA`.
- `components/marketplace/`: `PaymentIcons` (arte propio, nunca logos oficiales), `ProductPhotoFallback` (único «sin foto»), `StoreAvatar`.
- Antes de crear uno: `rg -n "function <X>|const <X> ="` (los clones ya causaron bugs).

## Trampas

1. `amber-*` pinta **coral** y `orange-*` pinta **turquesa** (remap en `@theme inline`; intencional, no lo «arregles»).
2. `max-w-{xs..xl}` = escala de Tailwind (320-576 px); más ancho: `max-w-2xl..7xl` o rem.

## Reglas duras

1. Sin hex: solo tokens (salvo el tinte profundo de un gradiente firma).
2. Todo en claro Y oscuro, con contraste AA.
3. Mínimos: body de tienda `text-base`; filtros y CTA `h-12`; táctil 44 px; nunca `text-[10px]`.
4. `aria-hidden` en decorativos; con `prefers-reduced-motion`, un estado estático legible.

## Más detalle

Leer según la tarea, en `.claude/skills/bsm-design-system/references/`: `recetas.md` (carnet y hero premium, gauge, filtros de tienda, espaciado y tablas, **modo creativo**) y `motion.md` (animación).

Evidencia visual: `node scripts/qa-capturas.mjs` (claro y oscuro, 1 llamada); leer 1 imagen.
