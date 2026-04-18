# ADR-071: Motion Tokens Governance

**Estado:** Aceptado
**Fecha:** 2026-04-17
**Contexto ADR:** Extiende ADR-069 (governance framework) y ADR-070 (typography tokens).

---

## Contexto

Con color y tipografia bajo control, el siguiente vector de inconsistencia es **movimiento** (animaciones y transiciones). Patrones detectados:

- `duration-300`, `duration-500`, `duration-700`, `duration-1000` mezclados sin regla.
- `duration-[300ms]`, `duration-[0.5s]`, `duration-[700ms]` arbitrarios.
- `transition-all duration-200 ease-in-out` repetido inline en 200+ sitios.
- `animate-pulse` + durations custom sin consistencia.
- `framer-motion` transitions con `duration: 0.3` literal en cada componente.

Sin escala consistente, el ritmo visual del producto se fragmenta y la percepcion de performance sufre (animaciones lentas se sienten pesadas; rapidas se pierden).

## Decision

Extendemos la pila de governance con tokens de duracion + easing semanticos.

### Escala de duration oficial

Tokens en `app/globals.css`:

```css
--dur-instant: 0ms;       /* No animar — reduced motion */
--dur-micro: 80ms;        /* Hover feedback inmediato */
--dur-fast: 160ms;        /* Small transitions (button press, tooltip) */
--dur-base: 240ms;        /* UI default (modal open, tab switch) */
--dur-slow: 400ms;        /* Complex transitions (accordion, drawer) */
--dur-slower: 600ms;      /* Page transitions, celebration */
```

Reglas semanticas:
- **micro (80ms)** — feedback instantaneo. Hover borders, focus rings, tooltip appear.
- **fast (160ms)** — feedback rapido. Button press, checkbox toggle, chip select.
- **base (240ms)** — UI default. Modal open, tab switch, dropdown menu.
- **slow (400ms)** — transiciones complejas. Accordion, drawer, page fade.
- **slower (600ms)** — celebracion. Confetti, hero reveal, payment success.

### Escala de easing (ya existente en ADR-068)

Tokens de easing ya existen:
- `--ease-editorial` — default para editorial UI.
- `--ease-snap` — inputs precisos.
- `--ease-soft` — hovers.
- `--ease-entrance` — elementos que aparecen.
- `--ease-exit` — elementos que desaparecen.
- `--ease-bounce` — celebraciones.

Uso combinado: `transition-[transform] duration-[var(--dur-base)] ease-[var(--ease-editorial)]`.

### Reglas de enforcement (lint)

Nuevas reglas en `scripts/lint-design-tokens.ts`:

1. **`no-arbitrary-duration`** (error) — `duration-\[\d+(ms|s)\]` prohibido. Usar tokens.
2. **`no-tailwind-duration-arbitrary`** (warning) — `duration-(75|100|150|200|300|500|700|1000)` sugerencia de migracion a tokens.
3. **`no-arbitrary-ease`** (error) — `ease-\[cubic-bezier[^\]]+\]` fuera de whitelist.
4. **`warn-framer-literal-duration`** (warning) — `duration:\s*[\d.]+` en JSX (framer-motion).

### Migrator automatico

Reglas en `scripts/migrate-decorative-colors.ts` (deberia renombrarse a `migrate-design-tokens.ts`):

```ts
{
  id: "duration-tailwind-to-token-micro",
  pattern: /\bduration-75\b/g,
  replacement: "duration-[var(--dur-micro)]",
},
{
  id: "duration-tailwind-to-token-fast",
  pattern: /\bduration-(100|150)\b/g,
  replacement: "duration-[var(--dur-fast)]",
},
{
  id: "duration-tailwind-to-token-base",
  pattern: /\bduration-(200|300)\b/g,
  replacement: "duration-[var(--dur-base)]",
},
{
  id: "duration-tailwind-to-token-slow",
  pattern: /\bduration-(400|500)\b/g,
  replacement: "duration-[var(--dur-slow)]",
},
{
  id: "duration-tailwind-to-token-slower",
  pattern: /\bduration-(700|1000)\b/g,
  replacement: "duration-[var(--dur-slower)]",
},
{
  id: "duration-arbitrary-ms-micro",
  pattern: /duration-\[(\d{1,2})ms\]/g,
  replacement: "duration-[var(--dur-micro)]",
},
{
  id: "duration-arbitrary-ms-fast",
  pattern: /duration-\[(1\d{2})ms\]/g,
  replacement: "duration-[var(--dur-fast)]",
},
```

### Reduced motion

Los tokens respetan `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-micro: 0ms;
    --dur-fast: 0ms;
    --dur-base: 0ms;
    --dur-slow: 0ms;
    --dur-slower: 0ms;
  }
}
```

(Pendiente de agregar al `globals.css` — marcado como TODO en memoria).

### Integracion con framer-motion

Para animaciones de framer-motion, exponer constantes en `tokens.ts`:

```ts
// packages/design-system/src/tokens.ts
export const motion = {
  duration: {
    micro: 0.08,  // 80ms
    fast: 0.16,   // 160ms
    base: 0.24,
    slow: 0.4,
    slower: 0.6,
  },
  ease: {
    editorial: [0.22, 1, 0.36, 1],
    snap: [0.4, 0, 0.1, 1],
    // ...
  },
};
```

Uso en componentes:
```tsx
import { motion as tokens } from "@buleje/design-system";

<motion.div
  transition={{ duration: tokens.duration.base, ease: tokens.ease.editorial }}
>
```

## Consecuencias

### Positivas

- **Ritmo consistente:** 6 duraciones, 6 curvas. Todo el producto se siente coherente.
- **Reduced motion accesible:** 1 media query desactiva TODA la animacion sin refactor.
- **Performance predecible:** no mas `duration: 1000` accidentales que congelan UI.
- **Shareable con framer-motion:** mismas constantes CSS + JS.

### Negativas / tradeoffs

- Requiere migracion de ~400 ocurrencias de `duration-*` detectadas.
- Designer debe pensar en escala semantica, no en milisegundos arbitrarios.
- Framer-motion literals son facil de olvidar — requiere lint watchdog.

## Referencias

- ADR-068 — armonia estricta.
- ADR-069 — design system governance (la pila completa).
- ADR-070 — typography tokens.
- Material Design Motion — https://m3.material.io/styles/motion
- Apple HIG Motion — https://developer.apple.com/design/human-interface-guidelines/motion
