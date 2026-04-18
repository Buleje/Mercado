# ADR-070: Typography Tokens Governance

**Estado:** Aceptado
**Fecha:** 2026-04-17
**Contexto ADR:** Extiende ADR-068 (armonia) y ADR-069 (design system governance).

---

## Contexto

Con gradientes y colores arbitrarios bajo control (ADR-068/069), el siguiente vector de inconsistencia es la **tipografia**: tamanos, pesos, espaciados y alturas de linea arbitrarias.

Ejemplos de deriva detectados:
- `text-[10px]`, `text-[11px]`, `text-[9px]`, `text-[13px]` — escalas no estandar.
- `font-bold`, `font-extrabold`, `font-black`, `font-semibold` mezclados sin regla clara.
- `leading-tight`, `leading-snug`, `leading-none` vs literals (`leading-[1.2]`).
- `tracking-[0.06em]`, `tracking-[0.2em]`, `tracking-[0.25em]` — letter-spacings arbitrarios.

## Decision

Definimos una escala tipografica estandar con tokens CSS, respaldada por lint + migrator siguiendo el patron de ADR-069.

### Escala tipografica oficial

Tokens disponibles en `app/globals.css` (a agregar):

```css
:root {
  /* Sizes */
  --text-2xs: 0.625rem;   /* 10px — badges, sparklines */
  --text-xs:  0.75rem;    /* 12px — labels, timestamps */
  --text-sm:  0.875rem;   /* 14px — body default */
  --text-base:1rem;       /* 16px — reading body */
  --text-lg:  1.125rem;   /* 18px — subtitulos */
  --text-xl:  1.25rem;    /* 20px — titulos seccion */
  --text-2xl: 1.5rem;     /* 24px — H2 modulo */
  --text-3xl: 1.875rem;   /* 30px — hero KPI */

  /* Weights semantic */
  --fw-regular: 400;
  --fw-medium: 500;
  --fw-bold: 700;
  --fw-extrabold: 800;  /* uso exclusivo KPI values */

  /* Line heights */
  --lh-tight: 1.2;
  --lh-snug: 1.4;
  --lh-normal: 1.6;

  /* Letter spacings */
  --ls-tight: -0.01em;   /* headings */
  --ls-normal: 0;
  --ls-wide: 0.06em;     /* section kickers */
  --ls-wider: 0.2em;     /* uppercase labels */
}
```

### Reglas de enforcement (lint)

Agregar a `scripts/lint-design-tokens.ts`:

1. **Prohibir tamanos arbitrarios** — `text-\[(\d+(\.\d+)?)(px|rem|em)\]` → usar `text-xs/sm/base/lg/xl/2xl/3xl`. Excepcion: `text-[10px]` para tabular KPIs < 14px pueden usar `text-2xs` (nuevo).

2. **Prohibir letter-spacing arbitrario** — `tracking-\[[^\]]+\]` → usar `tracking-tight/normal/wide/wider`.

3. **Prohibir line-height literal** — `leading-\[[^\]]+\]` → usar escala Tailwind (`leading-tight/snug/normal/relaxed`).

4. **Warning sobre peso no semantico** — `font-(medium|semibold|bold|extrabold|black)` debe seguir una regla:
   - `font-medium` → inputs, labels.
   - `font-bold` → botones, card titles.
   - `font-extrabold` → solo KPI values, metric hero cards.
   - `font-black` prohibido (demasiado pesado).

### Migrator automatico

Agregar reglas a `scripts/migrate-decorative-colors.ts` (renombrar a `migrate-design-tokens.ts`):

```ts
{
  id: "text-arbitrary-size-2xs",
  pattern: /text-\[(10|9)px\]/g,
  replacement: "text-2xs",
},
{
  id: "text-arbitrary-size-xs",
  pattern: /text-\[(11|12)px\]/g,
  replacement: "text-xs",
},
{
  id: "tracking-arbitrary-wide",
  pattern: /tracking-\[0\.0[4-9]em\]/g,
  replacement: "tracking-wide",
},
{
  id: "tracking-arbitrary-wider",
  pattern: /tracking-\[0\.[1-3][0-9]em\]/g,
  replacement: "tracking-wider",
},
{
  id: "font-black-to-extrabold",
  pattern: /\bfont-black\b/g,
  replacement: "font-extrabold",
},
```

### Componentes tipograficos

Crear `components/admin/shared/Text.tsx` con variantes:

```tsx
<Text variant="kicker">SECCION</Text>        // uppercase wider xs
<Text variant="label">Campo</Text>            // xs medium tertiary
<Text variant="body">Texto</Text>             // sm normal primary
<Text variant="heading">Titulo</Text>         // xl bold primary tight
<Text variant="kpi-value">S/ 1,234</Text>     // 2xl extrabold tabular
<Text variant="kpi-delta">+12%</Text>         // xs bold success/error
```

Variantes encapsulan `size + weight + leading + tracking + color` en una sola prop. Previene 100% la combinacion arbitraria.

## Consecuencias

### Positivas

- **Escala predecible:** 8 tamanos, 4 pesos, 3 line-heights, 4 letter-spacings. Cero arbitrariedad.
- **Rendimiento CSS:** tokens CSS reducen el bundle (Tailwind ve menos variants arbitrarios → mejor tree-shake).
- **Accesibilidad:** size ratios consistentes mejoran lectura; pesos estandar ayudan a lectores de pantalla con consistencia de jerarquia.
- **Internationalization ready:** tokens semanticos sobreviven cambio de fuente principal (Geist → Inter) sin reescribir UI.

### Negativas / tradeoffs

- Requiere migracion de ~300 ocurrencias de `text-[Xpx]` detectadas en el codigo actual.
- Diseñadores pueden querer tamanos fuera de escala — la respuesta es: pide agregar un token, no ad-hoc.
- El componente `<Text>` agrega overhead minimo (una wrap span con className).

### Bypasses autorizados

- Prop `className` en `<Text>` permite override explicito con comentario `// typo-override: <razon>`.
- Nuevo token debe crearse via PR con nombre descriptivo (no `--text-xxs`, sino `--text-micro-kpi-spark`).

## Implementacion (fases)

### Fase 1 — Fundacion (1 PR)
- [x] ADR-070 publicado (este documento).
- [ ] Agregar tokens `--text-*`, `--fw-*`, `--lh-*`, `--ls-*` a `app/globals.css`.
- [ ] Crear componente `<Text>` en `components/admin/shared/Text.tsx` con variantes.
- [ ] Agregar stories `Text.stories.tsx`.
- [ ] Tests Vitest del componente.

### Fase 2 — Lint + Migrator (1 PR)
- [ ] Agregar reglas typography al `lint-design-tokens.ts`.
- [ ] Agregar reglas migracion al `migrate-decorative-colors.ts` (renombrado a `migrate-design-tokens`).
- [ ] Correr `:fix:apply` y auditar cambios.

### Fase 3 — Rollout gradual (3-5 PRs)
- [ ] Migrar `components/admin/inicio/**` (dashboards).
- [ ] Migrar `components/admin/unified/**` (modulos principales).
- [ ] Migrar `components/store/**` y `components/customer/**`.
- [ ] Activar lint severity `error` para typography rules.

## Referencias

- ADR-068 — armonia estricta (gradientes/shadows).
- ADR-069 — governance framework (lint + migrator + componentes + storybook).
- Design Tokens Community Group — https://design-tokens.github.io/community-group/format/
- Tailwind v4 theme — https://tailwindcss.com/docs/theme (CSS vars first-class).
