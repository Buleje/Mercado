---
applyTo: "**/*.tsx,**/*.css,**/tailwind*"
---

# UI/UX Design — Buleje

## Tokens de marca

```css
/* Colores principales */
--brand-primary: #2d6a4f;    /* Verde — botones primarios, highlights */
--brand-secondary: #f4a261;  /* Naranja — CTAs secundarios, badges */

/* Uso en Tailwind 4: */
bg-[#2d6a4f]    text-[#2d6a4f]    border-[#2d6a4f]
bg-[#f4a261]    text-[#f4a261]
```

## Dark mode

```tsx
// Siempre incluir variantes dark: en componentes
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <button className="bg-[#2d6a4f] hover:bg-[#245a42] dark:bg-[#2d6a4f] dark:hover:bg-[#1e4d38]">
    Agregar al carrito
  </button>
</div>
```

## Paleta secundaria (zinc/neutral)

```
Fondos: bg-zinc-50 / dark:bg-zinc-900
Tarjetas: bg-white / dark:bg-zinc-800
Bordes: border-zinc-200 / dark:border-zinc-700
Texto secundario: text-zinc-500 / dark:text-zinc-400
```

## Tipografía (Geist)

```tsx
// next/font configurado en app/layout.tsx
// Geist Sans: UI text
// Geist Mono: precios, códigos, métricas, IDs
<span className="font-mono text-lg font-bold">S/ 12.50</span>
```

## Animaciones

```tsx
// Framer Motion 12 — para transiciones de UI complejas
import { motion, AnimatePresence } from "framer-motion";
<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>

// GSAP 3 — para animaciones de scroll y secuencias complejas
import gsap from "gsap";
gsap.from(".hero-text", { opacity: 0, y: 50, duration: 0.8 });

// Tailwind transitions — para hover/focus simples
className="transition-colors duration-200"
```

## Componentes de UI — estructura

```
components/
  ui/                  — Primitivos reutilizables (Button, Input, Badge, Modal)
  admin/               — Tabs y módulos del panel admin (140+ componentes)
  checkout/            — Sub-componentes del CheckoutModal
  CheckoutModal.tsx    — Flujo completo (119 KB — danger zone)
  CartSidebar.tsx      — Carrito lateral (39 KB)
  CategoryCatalog.tsx  — Grid de productos (33 KB)
  CustomerModal.tsx    — Modal de cliente (35 KB)
```

## Patrones de layout

```tsx
// Panel admin — tabs + card + table
<Tabs defaultValue="overview">
  <TabsList><TabsTrigger value="overview">Resumen</TabsTrigger></TabsList>
  <TabsContent value="overview"><Card>...</Card></TabsContent>
</Tabs>

// Mobile — Sheet para nav lateral, AlertDialog para confirmaciones destructivas
<Sheet><SheetContent side="left">...</SheetContent></Sheet>
<AlertDialog>...</AlertDialog>
```

## Anti-patrones de diseño

- **NO usar colores off-brand** — morado/indigo fueron eliminados del proyecto
- **NO glassmorphism excesivo** — solo en hero sections, no en tablas ni listas
- **NO gradientes rainbow** — usar zinc/neutral con UN acento
- **NO olvidar estados** — todo componente necesita empty, loading y error state
- **NO botones sin tipo** — siempre `type="button"` o `type="submit"` explícito

## Responsive — breakpoints Tailwind

```tsx
// Mobile-first siempre
<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">

// Touch targets mínimo 44x44px en mobile
<button className="min-h-[44px] px-4">

// Ocultar en mobile, mostrar en desktop
<span className="hidden md:inline">Ver detalles</span>
```

## Estados obligatorios en componentes

```tsx
// Siempre manejar los 3:
if (isLoading) return <LoadingSkeleton />;
if (error) return <ErrorState message={error} onRetry={refetch} />;
if (!data.length) return <EmptyState message="No hay productos" />;
```

## Gotchas

- **Tailwind 4** — sintaxis levemente distinta a Tailwind 3. Usar `@import "tailwindcss"` no `@tailwind base`
- **`dark:` variants** — configurar `darkMode: 'class'` (ya configurado en globals)
- **Framer Motion** — `AnimatePresence` necesario para unmount animations
- **Precios en Geist Mono** — siempre usar `font-mono` para valores numéricos monetarios
