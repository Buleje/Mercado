# Motion de Buleje (sistema v4)

Tokens y reglas: ADR-071 (`docs/adr/071-motion-tokens-governance.md`).

- **Canónico**: `components/ui-system/motion.ts`. Importar de ahí; no inventar cubic-beziers.
  - `EASE`: `editorial` (default de entradas) · `snap` (press/tap) · `soft` (hover, cambio de tema) · `entrance` (modals, sheets, dropdowns) · `exit` (salidas rápidas) · `bounce` (solo celebración). `expo` y `bounceSoft` son alias legacy: no usar.
  - `DURATION` (s): `micro` 0,08 · `fast` 0,16 · `base` 0,24 · `slow` 0,4 · `deliberate` 0,6 · `theatrical` 0,8.
  - Variants: `fadeUp` `fadeIn` `scaleIn` `slideInLeft` `slideInRight` `staggerContainer` `staggerChild` `listStagger` `revealOnView` `pageEnter` `modalVariants` `popoverVariants` `drawerVariants`.
- **CSS espejo**: `--ease-editorial` `--ease-snap` `--ease-soft` `--ease-entrance` `--ease-exit` `--ease-bounce`; `--dur-micro/fast/base/slow/slower` = 80/160/240/400/600 ms. `--motion-fast/base/slow/deliberate` (150/250/400/600 ms) es la familia anterior.
- **Capas**: Framer Motion (`m` bajo `LazyMotion`; provider en `components/MotionProvider.tsx`) para UI interactiva · GSAP en lazy, solo para scroll complejo · CSS `@keyframes` para ambiente (`skeleton-shimmer`, `confettiBurst`, `cartBounce`, `glowPulse`, `morphBlob`, `num-flip-in`, view transitions `bsm-vt-*`).
- **`prefers-reduced-motion`**: `app/globals.css` lleva animaciones y transiciones a ~0 ms en todo el repo y pone en 0 las `--dur-*`. Aun así, nunca animar sin un estado estático legible.
