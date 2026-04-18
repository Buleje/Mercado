# ADR-072: Shadow Tokens Governance

**Estado:** Aceptado
**Fecha:** 2026-04-17
**Contexto ADR:** Cierra la pila de governance iniciada en ADR-068/069/070/071.

---

## Contexto

Ya gobernamos color, tipografia y movimiento. El ultimo vector de deriva visual es **elevacion/sombras**. Patrones detectados:

- `shadow-sm`, `shadow`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl` mezclados sin regla.
- `shadow-[0_4px_12px_rgba(0,0,0,0.1)]` arbitrarios en 40+ sitios.
- `shadow-indigo-500/30`, `shadow-emerald-500/40` (colored shadows ya cubiertos por ADR-068, pero renace de vez en cuando).
- `drop-shadow-*`, `drop-shadow-lg`, `drop-shadow-2xl` decorativos.

Sin escala consistente, las cartas flotan en "niveles" visuales arbitrarios y la profundidad del UI se pierde.

## Decision

### Escala de shadow oficial

Tokens en `app/globals.css` (reutilizando los `--elev-N` existentes como base):

```css
--shadow-none: none;
--shadow-sm: var(--elev-1);    /* Hover subtle, card flat */
--shadow-md: var(--elev-2);    /* Dropdown, popover */
--shadow-lg: var(--elev-3);    /* Modal, drawer */
--shadow-xl: var(--elev-4);    /* Toast elevado, hero lift */
```

Reglas semanticas:
- **none** — default. Cards planos, rows de tabla, backgrounds.
- **sm** — hover feedback, elementos al flotar ligeramente.
- **md** — elementos que se abren sobre el contenido: dropdowns, popovers, cards activos.
- **lg** — layers modales: dialogs, drawers, sheets.
- **xl** — layers maximos: toasts notorios, hero CTAs destacados.

### Reglas de enforcement (lint)

Nuevas reglas en `scripts/lint-design-tokens.ts`:

1. **`no-arbitrary-shadow`** (error) — `shadow-\[[^\]]+\]` prohibido. Usar `shadow-[var(--shadow-*)]` o escalas Tailwind estandar (`shadow-sm/md/lg/xl`).
2. **`no-shadow-2xl`** (warning) — `shadow-2xl` es excesivo. Usa `shadow-[var(--shadow-xl)]`.
3. **`no-drop-shadow-decorative`** (warning) — `drop-shadow-(lg|xl|2xl)` rara vez justifica. Usar `shadow-*` normal.

Colored shadows ya estan cubiertos por `no-colored-shadow` (ADR-068).

### Migrator automatico

Reglas en `scripts/migrate-decorative-colors.ts`:

```ts
{
  id: "shadow-arbitrary-sm",
  pattern: /shadow-\[0_(1|2)px[^\]]+\]/g,
  replacement: "shadow-[var(--shadow-sm)]",
},
{
  id: "shadow-arbitrary-md",
  pattern: /shadow-\[0_(4|6|8)px[^\]]+\]/g,
  replacement: "shadow-[var(--shadow-md)]",
},
{
  id: "shadow-arbitrary-lg",
  pattern: /shadow-\[0_(12|16|20)px[^\]]+\]/g,
  replacement: "shadow-[var(--shadow-lg)]",
},
{
  id: "shadow-arbitrary-xl",
  pattern: /shadow-\[0_(24|32|48)px[^\]]+\]/g,
  replacement: "shadow-[var(--shadow-xl)]",
},
{
  id: "shadow-2xl-to-xl",
  pattern: /(?<![\w-])shadow-2xl(?!\w)/g,
  replacement: "shadow-[var(--shadow-xl)]",
},
```

### Tokens JS

Export en `packages/design-system/src/tokens.ts`:

```ts
export const shadow = {
  none: "var(--shadow-none)",
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
  xl: "var(--shadow-xl)",
} as const;
```

## Shadows en animate-* de Tailwind

`animate-pulse`, `animate-bounce`, `animate-spin`, `animate-ping` tienen duraciones fijas dentro de Tailwind (2s, 1s, 1s, 1s respectivamente). **No requieren tokens** porque son animations predefinidas con proposito claro.

Si necesitas customizar duracion de animate-*, usa:
```tsx
<div className="animate-pulse [animation-duration:var(--dur-slow)]">
```

Esto combina el keyframe de Tailwind con nuestro token de duracion. `animation-duration` override NO esta cubierto por ADR-071 porque es legitimo para animations de feedback visual (skeletons, indicators).

## Consecuencias

### Positivas

- **Profundidad coherente:** 5 niveles (none/sm/md/lg/xl) cubren 95% de casos.
- **Dark mode aware:** los `--elev-N` ya tienen versiones dark. Los nuevos `--shadow-*` heredan.
- **Bundle mas pequeno:** Tailwind genera menos variantes `shadow-[arbitrary]`.
- **Semantico:** el nombre del token describe la intencion (drawer, modal, toast) no el pixel count.

### Negativas / tradeoffs

- Requiere migracion de ~60 ocurrencias de `shadow-[arbitrary]` detectadas.
- Designer debe aprender los 5 niveles semanticos.
- `shadow-2xl` en Tailwind deja de usarse — solo `shadow-xl` es valido.

### Bypasses autorizados

- Animations custom con `[animation-duration:var(--dur-*)]` combinando con `animate-*` de Tailwind.
- `shadow-*` con intent semantico (`shadow-red-500/20` alert state) — solo si pasa code review.

## Implementacion

- [x] Tokens `--shadow-*` en globals.css.
- [x] Export en `tokens.ts` del workspace.
- [ ] Reglas migrator (seguir a aplicar).
- [ ] Reglas lint con severity error/warning.
- [ ] Aplicar bulk de migracion.

## Referencias

- ADR-068 — armonia estricta (no colored shadows).
- ADR-069 — design system governance framework.
- ADR-070 — typography tokens.
- ADR-071 — motion tokens.
- Material Design Elevation — https://m3.material.io/styles/elevation/overview
