---
name: bsm-design-system
description: Design system de Buleje/Bodega San Martin. Paleta de colores, tipografia, animaciones, patrones responsive, dark mode, a11y. Usar ANTES de crear/editar componentes UI para mantener consistencia visual.
user-invocable: true
model: sonnet
allowed-tools: Read, Grep, Glob
argument-hint: "[colores|animaciones|responsive|componente]"
---

# Design System — Buleje (Bodega San Martin)

UI custom (NO shadcn/ui). Componentes propios en `/components/ui/`. Tailwind CSS 4 con CSS custom properties.

## Paleta de colores

### CSS Variables (definidas en `/app/globals.css`)

| Variable | Light | Dark | Uso |
|---|---|---|---|
| `--brand-primary` | `#00B4A6` | `#2dd4bf` | Acciones principales, links, focus |
| `--brand-primary-light` | `#33C4B8` | — | Highlights |
| `--brand-secondary` | `#f97316` | `#fb923c` | Acciones secundarias |
| `--brand-danger` | `#ef4444` | — | Errores, destructivos |
| `--brand-info` | `#0ea5e9` | — | Informativo |
| `--color-card` | `#ffffff` | `#152220` | Fondo de tarjetas |
| `--color-muted` | `#6b7280` | `#9ca3af` | Texto secundario |

**Semanticos:** Success `#10b981`, Warning `#f59e0b`, Purple `#8b5cf6`

## Tipografia

- **Font principal:** Geist Sans (`--font-geist-sans`), cargada via `next/font/google`
- **Monospace:** Geist Mono (`--font-geist-mono`)
- **Display:** `swap`, preload false, subset `latin`
- **Sin type scale explicito** — usar clases Tailwind: `text-sm`, `text-base`, `text-lg`

## Animaciones (3 capas)

| Capa | Libreria | Cuando usar | Import |
|---|---|---|---|
| **Interacciones UI** | Framer Motion v12 | Modales, dropdowns, cards, transiciones | `import { motion, AnimatePresence } from "framer-motion"` |
| **Entradas complejas** | GSAP v3.14 (lazy) | Scroll-triggered, staggered, 3D | `import("gsap").then(({ gsap }) => {...})` |
| **Ambiente/performance** | CSS @keyframes | Particles, shimmer, blobs, progress | Clases en `globals.css` |

**Keyframes disponibles (20+):** `shimmer`, `fadeIn`, `fadeUp`, `scaleIn`, `pop`, `bounceY`, `toastIn/Out`, `cartBounce`, `morphBlob`, `floatUp`, `glowPulse`, `ripple`, `gradientShift`

**Easings:** CSS `ease-in-out`, GSAP `back.out(1.3)` y `power3.out`, JS `Math.pow` para ease-out quart

## Responsive (mobile-first)

| Breakpoint | Uso |
|---|---|
| `sm` (640px) | Tablas → cards mobile |
| `md` (768px) | Grids admin |
| `lg` (1024px) | 2 columnas hero |
| `xl` (1280px) | Hero expandido |

**Patron dual-render:**
```tsx
<div className="hidden sm:block"><DesktopTable /></div>
<div className="sm:hidden"><MobileCards /></div>
```

**Spacing:** `px-4 sm:px-6 lg:px-8`, container `max-w-7xl`, gaps `gap-3/4/6/12`
**Touch:** min 44px en mobile (`min-height: 44px !important` via CSS)
**Safe areas:** `pb-safe`, `pt-safe` para notch iOS

## Dark mode

- Clase `.dark` en `<html>`, toggle via `localStorage.getItem("buleje-theme")`
- Flash prevention con inline script en layout head
- Fallback a `matchMedia("(prefers-color-scheme:dark)")`

## Accesibilidad

1. Skip-to-content link: `sr-only focus:not-sr-only`
2. Focus visible: `outline: 2px solid var(--color-primary); outline-offset: 2px`
3. Reduced motion: `@media (prefers-reduced-motion: reduce)` desactiva todas las animaciones
4. Decorativos: `aria-hidden="true"` en CustomCursor, FloatingParticles, HeroIllustration
5. Live regions: `aria-live="polite"` en LiveActivityTicker

## Reglas para el agente

1. **Nunca usar shadcn/ui** — componentes custom en `/components/ui/`
2. **Colores via CSS vars** — `var(--brand-primary)` no hex hardcodeado
3. **Framer Motion para UI**, GSAP solo para scroll-triggered complejos
4. **Dual-render** para tablas (desktop table + mobile cards)
5. **Dark mode** — toda UI nueva debe funcionar en ambos temas
6. **44px touch targets** en mobile
7. **`aria-hidden`** en elementos decorativos
