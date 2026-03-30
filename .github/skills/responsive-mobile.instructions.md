---
applyTo: "**/components/**/*.tsx,**/app/**/*.tsx"
---

# Responsive & Mobile — Buleje

## Mobile-first siempre

```tsx
// Patrón correcto: mobile base → desktop override
<div className="
  flex flex-col gap-2        /* mobile */
  md:flex-row md:gap-4       /* tablet */
  lg:gap-6                   /* desktop */
">
```

## Touch targets mínimos (44x44px)

```tsx
// Botones táctiles — mínimo 44px de altura
<button className="min-h-[44px] min-w-[44px] px-4 py-2">
  Agregar
</button>

// En mobile, los items del carrito deben ser fácilmente tappables
<div className="py-3 px-4">  {/* Padding generoso para touch */}
```

## Breakpoints de Tailwind (mobile-first)

```
sm: 640px   → Tablet pequeña
md: 768px   → Tablet
lg: 1024px  → Desktop
xl: 1280px  → Desktop wide
2xl: 1536px → Ultra wide
```

## Capacitor — builds móviles

```bash
cd buleje
npm run app:build    # Build Next.js + sync Capacitor (iOS/Android)
```

## capacitor.config.json

```json
{
  "appId": "com.buleje.app",
  "appName": "Buleje",
  "webDir": "out"  // Carpeta de output de Next.js export
}
```

## Navegación admin en mobile

```tsx
// AdminBottomNav.tsx — barra inferior para mobile
// Solo visible en < md breakpoint
<AdminBottomNav className="md:hidden" />

// Sidebar en desktop
<AdminSidebar className="hidden md:block" />
```

## Gestos y scroll

```tsx
// Scroll horizontal en tablas
<div className="overflow-x-auto">
  <table className="min-w-full">...</table>
</div>

// Swipe en modales (Sheet component)
<Sheet>
  <SheetContent side="bottom">  {/* Bottom sheet en mobile */}
    ...
  </SheetContent>
</Sheet>
```

## Grid responsivo para catálogo de productos

```tsx
// CategoryCatalog.tsx — grid adaptativo
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
  {products.map(product => <ProductCard key={product.id} {...product} />)}
</div>
```

## Gotchas

- **`capacitor.config.json`** — `webDir: "out"` requiere `next export` (output: "export" en next.config.ts)
- **PWA manifest** — `/api/pwa-icon` genera iconos dinámicamente
- **iOS safe areas** — usar `env(safe-area-inset-*)` para notch/home indicator
- **Hover states** — en touch devices no hay hover; no depender de hover para funcionalidad
- **Font size < 16px en iOS** — causa zoom automático en inputs; usar mínimo 16px en inputs

## Anti-patrones

- NO usar `onClick` sin considerar accesibilidad táctil
- NO diseñar para desktop y adaptar a mobile — hacerlo al revés
- NO usar hover para revelar información crítica (touch no tiene hover)
- NO olvidar `viewport` meta tag en layout.tsx
