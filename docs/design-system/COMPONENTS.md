# Design System — Components Guide

**Package:** `@buleje/design-system`
**ADRs:** 068 (armonia), 069 (governance), 070 (typography), 071 (motion).

Guia practica de los componentes primitivos del design system. Cada seccion tiene API reference + ejemplos + anti-patterns.

---

## Table of contents

1. [`<PrimaryButton>`](#primarybutton)
2. [`<IconBadge>`](#iconbadge)
3. [`<Text>`](#text)
4. [`cn()` utility](#cn-utility)
5. [Tokens exports](#tokens-exports)
6. [Migration guide](#migration-guide)
7. [Anti-patterns](#anti-patterns)

---

## `<PrimaryButton>`

Boton unificado del producto. **4 variantes** × **3 tamanos** + loading, disabled, `asChild` (Radix Slot).

### API

```tsx
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
  asChild?: boolean;
};
```

### Ejemplos

**Boton simple:**
```tsx
import { PrimaryButton } from "@buleje/design-system";

<PrimaryButton onClick={handleSave}>Guardar</PrimaryButton>
```

**Con icono izquierdo:**
```tsx
import { Plus } from "lucide-react";

<PrimaryButton size="md" leftIcon={<Plus className="h-4 w-4" />}>
  Nueva campana
</PrimaryButton>
```

**Link estilizado (asChild):**
```tsx
import Link from "next/link";

<PrimaryButton asChild rightIcon={<ArrowRight className="h-4 w-4" />}>
  <Link href="/destino">Ir al destino</Link>
</PrimaryButton>
```

**Loading state:**
```tsx
<PrimaryButton loading disabled={savingCampaign}>
  Guardando
</PrimaryButton>
```

**Variantes:**
| Variant | Uso |
|---|---|
| `primary` (default) | Accion principal. Negro puro / blanco en dark. |
| `secondary` | Accion secundaria. Fondo surface-raised, borde. |
| `ghost` | Accion terciaria. Sin fondo, hover sunken. |
| `danger` | Destructiva. Data-error bg. |

### Tamanos

| Size | Min height | Uso |
|---|---|---|
| `sm` | 32px | Dense admin tables, badges |
| `md` (default) | 40px | UI general |
| `lg` | 44px | CTAs a11y-first, mobile targets |

### Anti-patterns

**No hagas:**
```tsx
// Boton custom replicando tokens
<button className="bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90 px-4 py-2 rounded-lg font-semibold">
  Guardar
</button>

// PrimaryButton con asChild + multiples hijos
<PrimaryButton asChild>
  <div>
    <span>Uno</span>
    <span>Dos</span>  {/* ❌ Slot requiere UN hijo */}
  </div>
</PrimaryButton>
```

---

## `<IconBadge>`

Chip/badge de icono para numerar pasos, marcar tiers, envolver iconos. **6 tamanos** × **2 shapes** × **5 intents**.

### API

```tsx
type Props = {
  children: ReactNode;
  size?: "xs" | "sm" | "md" | "step" | "lg" | "xl";
  shape?: "circle" | "square";
  intent?: "primary" | "muted" | "success" | "warning" | "danger";
  asDiv?: boolean;  // default es <span>
};
```

### Ejemplos

**Step number:**
```tsx
<IconBadge size="xs">1</IconBadge>
```

**Icon container cuadrado:**
```tsx
import { Crown } from "lucide-react";

<IconBadge size="xl" shape="square">
  <Crown className="h-7 w-7" />
</IconBadge>
```

**Check de completado:**
```tsx
import { Check } from "lucide-react";

<IconBadge intent="success">
  <Check className="h-4 w-4" />
</IconBadge>
```

### Intents

| Intent | Uso |
|---|---|
| `primary` (default) | Step activo, accent neutro |
| `muted` | Disabled, pending, inactivo |
| `success` | Completado, validado |
| `warning` | Atencion, pendiente |
| `danger` | Error, rechazado |

### Anti-patterns

**No hagas:**
```tsx
// Span custom replicando tokens
<span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] text-xs">
  1
</span>

// IconBadge con border + ring complejos (no aplica)
<IconBadge className="border-2 animate-ping">...</IconBadge>
// Para ese caso, inline con tokens. Ver ADR-069 "opt-outs".
```

---

## `<Text>`

Primitive tipografico con variantes semanticas. Reemplaza combinaciones arbitrarias de `text-[Xpx] font-X leading-X tracking-X`.

### API

```tsx
type Variant =
  | "kicker"     // uppercase tiny label
  | "label"      // xs medium tertiary
  | "body"       // sm normal primary (default)
  | "heading"    // xl bold tight
  | "title"      // 2xl extrabold tight
  | "kpi-value"  // 2xl extrabold tabular-nums
  | "kpi-delta"  // xs bold tabular
  | "caption";   // 2xs tertiary

type Props = HTMLAttributes<HTMLElement> & {
  variant?: Variant;
  as?: ElementType;
  children: ReactNode;
};
```

### Ejemplos

```tsx
import { Text } from "@buleje/design-system";

// Default <p> body
<Text>Texto corriente.</Text>

// H2 con token automatico
<Text variant="title">Modulo de ventas</Text>

// Kicker de seccion (uppercase tracking-wider)
<Text variant="kicker">RESUMEN DE HOY</Text>

// KPI value con tabular-nums
<Text variant="kpi-value">S/ 1,234.56</Text>

// Delta colorizado con intent semantico
<Text variant="kpi-delta" className="text-[var(--data-success)]">+12.3%</Text>

// Override del elemento default
<Text variant="body" as="article">Contenido long-form.</Text>
```

### Default elements per variant

| Variant | Default |
|---|---|
| `kicker` | `<span>` |
| `label` | `<span>` |
| `body` | `<p>` |
| `heading` | `<h3>` |
| `title` | `<h2>` |
| `kpi-value` | `<p>` |
| `kpi-delta` | `<span>` |
| `caption` | `<span>` |

Si necesitas otro elemento, usa `as="h1"` o similar.

### Anti-patterns

**No hagas:**
```tsx
// Combinacion arbitraria replicando un variant
<p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">SECCION</p>
// → usa <Text variant="kicker">SECCION</Text>

// text-[11.5px] fuera de escala
<span className="text-[11.5px]">...</span>
// → usa text-[length:var(--ts-xs)] o sube a xs
```

---

## `cn()` utility

Merger de className con clsx + tailwind-merge.

```tsx
import { cn } from "@buleje/design-system";

const className = cn(
  "bg-white p-4",
  isActive && "ring-2 ring-[var(--text-primary)]",
  disabled && "opacity-50",
  customClass
);
```

Tailwind-merge resuelve conflictos: `cn("p-2", "p-4")` → `"p-4"`.

---

## Tokens exports

Para usar tokens en logica JS (inline styles, framer-motion, canvas):

```tsx
import { colors, typography, space, motion } from "@buleje/design-system";

// Inline style con token CSS var
<div style={{ background: colors.surfaceSunken }}>...</div>

// Framer-motion con duracion token
<motion.div
  animate={{ opacity: 1 }}
  transition={{ duration: 0.24, ease: "easeOut" }}
  // TODO: usar motion.duration.base tras conversion a numero
/>

// Space grid consistente
<div style={{ padding: space[4], gap: space[2] }}>...</div>
```

---

## Migration guide

### De patron inline a componente shared

**Antes:**
```tsx
<button className="bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90 px-4 py-2 rounded-lg text-sm font-bold">
  Guardar
</button>
```

**Despues:**
```tsx
import { PrimaryButton } from "@buleje/design-system";

<PrimaryButton>Guardar</PrimaryButton>
```

### Automatizacion

Si ves violacion en tu PR:
```bash
# Ver que migraria el script
npm run lint:design:fix

# Aplicar cambios
npm run lint:design:fix:apply

# Re-verificar
npm run lint:design
```

---

## Anti-patterns (generales)

### 1. No cambiar variant por className

**Mal:**
```tsx
<PrimaryButton className="bg-red-500">  {/* ❌ Overridea token */}
```

**Bien:**
```tsx
<PrimaryButton variant="danger">  {/* ✓ Intent semantico */}
```

### 2. No cambiar size por className

**Mal:**
```tsx
<PrimaryButton className="h-8 text-xs px-2">  {/* ❌ Rompe coherencia */}
```

**Bien:**
```tsx
<PrimaryButton size="sm">  {/* ✓ Escala oficial */}
```

### 3. No abusar de className para override

className es para espaciado/posicionamiento externo (margen, ancho), no para override de tokens internos del componente.

**Ok:**
```tsx
<PrimaryButton className="w-full mt-4">Full width</PrimaryButton>
```

**Mal:**
```tsx
<PrimaryButton className="bg-purple-500 text-white">  {/* ❌ */}
```

---

## Storybook

```bash
npm run storybook
```

Todos los componentes tienen stories autogeneradas. Busca `Design System/` en el panel lateral.

## Tests

```bash
npm test -- __tests__/components/shared/
```

44 tests actuales cubren API, variants, sizes, intents, accessibility.

## Feedback

Si encuentras que necesitas un patron que NO encaja con los componentes actuales:
1. Verifica si es un opt-out legitimo (ADR-069 criterio de elegibilidad).
2. Si deberia entrar al sistema, abre PR con story + test + variant nueva.
3. No agregues props novedosas sin justificar con 3+ consumidores.
