# ADR-073: Iconography Tokens Governance

**Estado:** Aceptado
**Fecha:** 2026-04-17
**Contexto ADR:** Extiende ADR-068/069/070/071/072. Cierra la pila de governance visual.

---

## Contexto

Ya gobernamos color, tipografia, motion y shadow. El ultimo vector de deriva es **iconografia**: tamanos y strokes de iconos (lucide-react).

Patrones detectados:
- `<Icon className="h-3 w-3" />` mezclado con `h-3.5`, `h-4`, `h-4.5`, `h-5`, `h-6`, `h-7`.
- `strokeWidth={1.5}`, `{1.75}`, `{2}`, `{2.25}`, `{2.5}` sin regla.
- Algunos iconos inline sin `className` — tamano default (24px) que rompe alineacion tipografica.
- Mezcla de familias: lucide-react (default) + emojis + SVG inline ad-hoc.

Sin escala, los iconos rompen el grid visual y el ritmo de lectura.

## Decision

Definimos una escala de tamanos + stroke-width semanticos para iconos.

### Escala de tamaño (lucide-react)

| Token | Size | Uso |
|---|---|---|
| `icon-xs` | `h-3 w-3` (12px) | Badges, chips, inline en text-xs |
| `icon-sm` | `h-3.5 w-3.5` (14px) | Labels, tags, dentro de Chip |
| `icon-md` | `h-4 w-4` (16px) | **Default**. Inline con text-sm/base |
| `icon-lg` | `h-5 w-5` (20px) | Buttons medianos, KPI iconos |
| `icon-xl` | `h-6 w-6` (24px) | Hero cards, section headers |
| `icon-2xl` | `h-8 w-8` (32px) | Empty states, hero illustrations |
| `icon-3xl` | `h-10 w-10` (40px) | FAB, avatar placeholders |

### Stroke width semantico

| Token | Value | Uso |
|---|---|---|
| `stroke-thin` | `1.25` | Iconos de fondo, ilustraciones sutiles |
| `stroke-default` | `1.75` | **Default**. Buttons, labels, UI general |
| `stroke-bold` | `2` | Iconos activos, seleccionados |
| `stroke-heavy` | `2.5` | Check marks, confirmaciones |

### Reglas de enforcement (lint)

Nuevas reglas en `scripts/lint-design-tokens.ts`:

1. **`warn-arbitrary-icon-size`** (warning) — `h-(3\.5|4\.5|5\.5|7)` en elementos con siblings `w-*` iguales probablemente es un icono fuera de escala. Sugiere estandar.
2. **`warn-stroke-width-arbitrary`** (warning) — `strokeWidth=\{[^1-3]\d?\}` fuera de la escala 1.25/1.75/2/2.5.

(Ambas warning porque hay casos legitimos donde `h-3.5` es el tamano correcto para un icono dentro de un badge de texto `[10px]`. La regla sugiere, no bloquea.)

### Helpers en `<PrimaryButton>` e `<IconBadge>`

Las sizes del design-system ya incluyen iconos en la escala correcta:

```tsx
// PrimaryButton size="md" → usa icon-md (h-4 w-4) internamente
<PrimaryButton leftIcon={<Plus className="h-4 w-4" />}>Nuevo</PrimaryButton>

// IconBadge size="md" → box de h-9 w-9, icono dentro debe ser h-4 w-4 o similar
<IconBadge size="md"><Check className="h-4 w-4" /></IconBadge>
```

Los consumidores pasan iconos con el tamano correcto — el componente no los modifica internamente.

### Tailwind CSS custom

Agregamos utilities en `globals.css`:

```css
/* Iconography sizes (ADR-073) */
.icon-xs  { width: 0.75rem; height: 0.75rem; }   /* 12px */
.icon-sm  { width: 0.875rem; height: 0.875rem; } /* 14px */
.icon-md  { width: 1rem; height: 1rem; }         /* 16px */
.icon-lg  { width: 1.25rem; height: 1.25rem; }   /* 20px */
.icon-xl  { width: 1.5rem; height: 1.5rem; }     /* 24px */
.icon-2xl { width: 2rem; height: 2rem; }         /* 32px */
.icon-3xl { width: 2.5rem; height: 2.5rem; }     /* 40px */
```

Uso:
```tsx
<Plus className="icon-md" />      // En lugar de "h-4 w-4"
<Crown className="icon-2xl" />    // En lugar de "h-8 w-8"
```

Esto mantiene compatibilidad: los consumers pueden seguir usando `h-4 w-4` o migrar a `icon-md`. Ambos funcionan.

## Consecuencias

### Positivas

- **Coherencia visual:** iconos respetan un grid de 8pt.
- **A11y:** tamanos mayores a 16px aseguran target mobile-friendly.
- **Onboarding:** contributors nuevos tienen 7 opciones semanticas en vez de arbitrariedad.
- **Backward compat:** `h-4 w-4` sigue siendo valido — `icon-md` es alias.

### Negativas / tradeoffs

- Las 522 ocurrencias existentes de `h-X w-X` iconos se mantienen — migracion gradual.
- Algunos casos legitimos fuera de escala (ej. `h-3.5` en badges con text-[10px]) — warning no bloquea.

### Bypasses autorizados

- `h-3.5 w-3.5` (14px) — legitimo cuando el icono acompana texto de 11-12px.
- `h-4.5 w-4.5` — legitimo para alineacion pixel-perfect en cards especificas.
- strokeWidth custom — legitimo para decorativos con comment explicativo.

## Implementacion

- [x] ADR-073 publicado.
- [ ] Utilities CSS `.icon-*` en `globals.css`.
- [ ] Reglas lint (warnings, no bloqueo).
- [ ] Sugerencia: componente `<Icon>` wrapper futuro con `size` prop.

## Referencias

- ADR-068 — armonia estricta.
- ADR-069 — governance framework.
- ADR-070 — typography tokens.
- ADR-071 — motion tokens.
- ADR-072 — shadow tokens.
- Lucide docs — https://lucide.dev/guide/
- Material Icons — 24px grid baseline.
