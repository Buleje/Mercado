---
applyTo: "**/layout.tsx,**/page.tsx,**/loading.tsx"
---

# Performance Web — Bodega San Martín

## Core Web Vitals — targets

| Métrica | Target | Herramienta |
|---------|--------|-------------|
| LCP (mayor elemento visible) | < 2.5s | Lighthouse, Vercel Speed Insights |
| FID / INP (interactividad) | < 100ms | Chrome DevTools |
| CLS (layout shift) | < 0.1 | Lighthouse |
| TTFB (primer byte) | < 800ms | Vercel Analytics |

## Imágenes — next/image (obligatorio)

```tsx
import Image from "next/image";

// CORRECTO:
<Image
  src="/product.jpg"
  alt="Producto"
  width={400}
  height={400}
  priority={isAboveTheFold}  // solo para LCP images
  className="object-cover"
/>

// INCORRECTO:
<img src="/product.jpg" />  // Nunca — no optimiza
```

## Fuentes — next/font (ya configurado)

```typescript
// Ya configurado en app/layout.tsx con Geist Sans + Geist Mono
// No agregar fuentes adicionales sin justificación — cada fuente extra = LCP delay
```

## Lazy loading de componentes grandes

```tsx
import dynamic from "next/dynamic";

// Componentes pesados del admin (140+ tabs):
const CheckoutModal = dynamic(() => import("@/components/CheckoutModal"), {
  loading: () => <LoadingSkeleton />,
  ssr: false  // Modal no necesita SSR
});

// Charts (Recharts — pesado):
const RevenueChart = dynamic(() => import("@/components/admin/RevenueChart"), {
  loading: () => <div className="h-64 animate-pulse bg-zinc-100" />,
  ssr: false
});
```

## Server Components por defecto (Next.js 16)

```tsx
// Sin "use client" = Server Component → cero JS en el bundle del cliente
// Añadir "use client" SOLO cuando necesites:
// - useState, useEffect, useRef
// - Event handlers (onClick, onChange)
// - Browser APIs (localStorage, window)
// - Contextos React

// "use client" lo más abajo posible en el árbol
```

## Caching de páginas (Next.js 16)

```tsx
// app/page.tsx — estático por defecto
export const revalidate = 300; // ISR: revalidar cada 5min

// app/admin/page.tsx — dinámico (datos en tiempo real)
export const dynamic = "force-dynamic";
```

## Bundle analysis

```bash
cd bodega-san-martin
npm run analyze  # Genera report de bundle — ver qué es pesado
```

## Gotchas

- **Turbopack** — es el bundler por defecto en Next.js 16. No configurar Webpack manual sin razón
- **`dynamic()` con `ssr: false`** para modales y charts — no necesitan SSR y son pesados
- **`priority` en images LCP** — solo el primer elemento visible above-the-fold
- **Framer Motion** — usar `LazyMotion` + `domAnimation` para reducir bundle size
- **Recharts** — lazy load siempre, pesa mucho en el bundle inicial

## Anti-patrones

- NO importar librerías pesadas en Server Components innecesariamente
- NO usar `<img>` sin next/image
- NO marcar todo como `"use client"` — mantener Server Components donde sea posible
- NO olvidar `loading.tsx` en rutas con datos lentos
