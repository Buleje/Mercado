---
paths:
  - "components/**"
  - "app/t/**"
  - "app/(store)/**"
  - "app/marketplace/**"
---

# Reglas al tocar UI visible

- Sin hex hardcodeados — tokens del DS (`@buleje/design-system`). Paleta oficial: primary `#00A0A0`, coral `#FF6B5B`, texto sobre claro `#007F7F` (solo vía tokens).
- Tipografía storefront: body `text-base` mínimo, filtros `h-12 border-2 rounded-2xl` (skill `bsm-typography-rules`).
- `gray-*` siempre con variante `dark:`. Rojo = `--data-error-*` (NO existe `--data-danger-*`).
- Tokens dark reales: `--color-card/foreground/muted` (no `--card`).
- NO emojis genéricos en UI — Lucide icons o SVG custom.
- `"use client"` PRIMERA línea, solo si hay interactividad; imports después del directive.
- Máx ~300 líneas por componente; lógica a `hooks/`.
- No modales bloqueantes en pantallas de entrada; si hay modal: click-fuera + Escape.
- Copy: tuteo peruano (Cobra/Elige/"por ti"), nunca voseo.
- No anidar `<button>` dentro de `<a>` (StoreCardCanonical gotcha).
- `overflow:hidden` en un ancestro rompe `position:sticky`.
- Páginas `(store)` NO renderean su propio nav/footer (el layout lo da).
- Next metadata: re-declarar `robots`/`alternates` en una page PISA el root (no merge) — heredar robots, re-declarar alternates completo.
