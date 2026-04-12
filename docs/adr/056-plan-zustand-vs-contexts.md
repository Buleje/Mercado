# ADR-056 — Plan: Migrar 11 React Contexts a Zustand

**Fecha:** 2026-04-10
**Estado:** 📋 PLANNED · Esfuerzo M · Bloque: Refactor · #09 del backlog

## Contexto
`contexts/` tiene 11 providers:
```
cart-context, compare-context, customer-context, favorites-context,
promotions-context, reviews-context, settings-context, tenant-context,
theme-context, toast-context, wishlist-context
```

Problemas:
- **Re-renders en cascada**: cualquier cambio en `cart-context` re-renderiza todos los consumidores, aunque solo dependan de `cartCount`
- **Provider hell** en `app/layout.tsx`: 11 providers anidados
- **DX**: cada context es un boilerplate de ~80 líneas (provider + hook + types + reducer)
- **SSR/CSR boundary**: contextos con `useState` fuerzan `"use client"` en árboles grandes → mata PPR

## Decisión tentativa
Migrar los 11 contexts a **Zustand v5** con:
- Un store por dominio (cart, customer, theme, etc.)
- Selectors con shallow equality → zero wasted re-renders
- `persist` middleware para cart/favorites/wishlist/theme (reemplaza localStorage manual)
- `subscribeWithSelector` para eventos cross-store (ej: clear favorites on logout)
- Compatible con SSR via `createStore` + hydration pattern
- **Mantener**: `tenant-context` como React Context real (se resuelve en layout, no muta después)

**Por qué Zustand y no Jotai**:
- Zustand es más simple para stores con muchos campos
- Jotai es mejor para estado atómico granular — no es el caso aquí
- Zustand ya está en el radar del equipo (framer-motion usa Zustand internamente)

## Plan de ejecución (3 sprints · ~15h)

### Sprint 1 — Infraestructura + 3 stores piloto (6h)
- [ ] `npm i zustand`
- [ ] Crear `lib/stores/` con convención:
  ```ts
  // lib/stores/cart-store.ts
  export const useCartStore = create<CartState>()(
    persist(
      subscribeWithSelector((set, get) => ({
        items: [],
        addItem: (item) => set((s) => ({ items: [...s.items, item] })),
        // ...
      })),
      { name: "buleje-cart" }
    )
  );
  ```
- [ ] Migrar: `cart-context`, `theme-context`, `toast-context` (los 3 más sencillos y de mayor impacto)
- [ ] Tests: verificar re-render count con `@testing-library/react`

### Sprint 2 — Migrar los 7 restantes (6h)
- [ ] compare, customer, favorites, promotions, reviews, settings, wishlist
- [ ] Cada migration: crear store → reemplazar `useContext` en callers → borrar context legacy
- [ ] Snapshot de bundle size pre/post

### Sprint 3 — SSR + cleanup (3h)
- [ ] Hydration helper `lib/stores/hydrate.tsx` para server-side data
- [ ] Borrar `contexts/*.tsx` legacy (excepto `tenant-context`)
- [ ] Reducir providers en `app/layout.tsx`
- [ ] Medir: re-renders por interacción (React DevTools Profiler)

## Consecuencias esperadas
- ✅ Re-renders por interacción: ~60% menos (medición real post-migration)
- ✅ Bundle size: -10KB (Zustand es 1KB vs 11 contexts × boilerplate)
- ✅ DX: `const count = useCartStore((s) => s.items.length)` vs context consumer
- ✅ BroadcastChannel multi-tab compatible con `subscribeWithSelector`
- ⚠️ Curva de aprendizaje: developers nuevos deben entender selectors

## Riesgos
| Riesgo | Mitigación |
|---|---|
| Hydration mismatch en SSR | Pattern oficial Zustand: `createStore` + provider |
| Persist conflict con BroadcastChannel | Handler custom en `subscribeWithSelector` |
| Stale closures en acciones | Usar `get()` en vez de closure sobre `set` |
| Refactor masivo de consumers | Codemod con jscodeshift para `useContext → useStore` |

## Bloqueadores
- Confirmar que `cart-context` + BroadcastChannel sigue funcionando igual
- Tests E2E del checkout multi-tab deben pasar

## Alternativas
- **Jotai** — mejor para state atómico extremo. Descartado por menor fit con cart (arrays largos).
- **Redux Toolkit** — demasiado boilerplate, demasiado "enterprise".
- **Valtio** — similar a Zustand pero con proxy — más mágico, menos explícito.
- **Quedarse con React Context** — status quo. Aceptable si el performance no es crítico.

## Referencias
- `contexts/*.tsx` (11 providers a migrar)
- Zustand v5 docs
- Jotai docs (descartado)
- ADR-055 refactor admin/page.tsx (sinergia — menos state cross-tab)
