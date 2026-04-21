---
applyTo: "contexts/cart-context.tsx, contexts/customer-context.tsx"
---

# state-management — instrucciones para editar contexts críticos

Estos contexts pisan producción directamente. Leer antes de editar.

## Archivos cubiertos

| Archivo | Tamaño | Por qué es danger zone |
|---|---|---|
| `contexts/cart-context.tsx` | ~500 líneas | State machine de cart + BroadcastChannel multi-tab + hidratación localStorage + validación remota |
| `contexts/customer-context.tsx` | ~250 líneas | Sesión de cliente + tenant isolation + session cookies |

## Invariantes NO negociables

1. **Jamás borrar el carrito en hidratación** sin señal EXPLÍCITA de "producto inexistente". `/api/products?active=true` devuelve solo el tenant actual; en marketplace el carrito cruza múltiples stores — si TODOS los items "desaparecerían", preservar. Bug real 2026-04-19: agregar desde store → abrir sidebar → carrito vacío.

2. **`hydratedRef.current` debe marcar true DESPUÉS de todos los dispatch iniciales.** Si se marca antes, el efecto de persistencia se dispara con estado parcial y sobrescribe localStorage con basura. Siempre al final del `useEffect` de hydration.

3. **BroadcastChannel debe ser scoped por `tenantSlug`.** `buleje-cart-sync-{slug}`. Si dos tenants comparten channel, mensajes cruzan entre carritos y se mezclan productos. Ver `getBroadcastChannel(slug)` en cart-context.

4. **TAB_ID para evitar self-echo.** BroadcastChannel emite al emisor — sin filtro, el emisor recibe su propio mensaje y dispara loop infinito. Skip si `event.data.tabId === TAB_ID`.

5. **`localStorage.setItem` siempre vía `sk(slug, key)`.** Builds tenant-scoped keys `buleje-{slug}-{key}`. Nunca hardcodear la clave sin el prefijo de tenant.

6. **Fire-and-forget en tareas no críticas** (CLAUDE.md regla #7): validación remota, sync cross-tab. `.catch(() => {})` aceptable. NUNCA bloquear hidratación por un fetch.

## Patrón de hidratación seguro

```tsx
useEffect(() => {
  const s = slugRef.current;
  try {
    const saved = localStorage.getItem(sk(s, "cart"));
    const items = saved ? JSON.parse(saved) : [];
    if (Array.isArray(items) && items.length > 0) {
      dispatch({ type: "HYDRATE", payload: items });

      // Validación remota: best-effort, nunca destructiva.
      fetch("/api/products?active=true")
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          const products = Array.isArray(data) ? data : [];
          if (products.length === 0) return; // respuesta dudosa → no tocar
          const validIds = new Set(products.map(p => p.id));
          const validItems = items.filter(i => validIds.has(i.id));

          // Guard: preservar si TODOS desaparecerían (multi-store marketplace).
          if (validItems.length === 0 && items.length > 0) return;

          if (validItems.length !== items.length) {
            dispatch({ type: "HYDRATE", payload: validItems });
            localStorage.setItem(sk(s, "cart"), JSON.stringify(validItems));
          }
        })
        .catch(() => { /* cart stays as-is */ });
    }
  } catch {}
  hydratedRef.current = true; // ← SIEMPRE al final
}, []);
```

## Cambios que requieren ADR adicional

- Cambiar el shape de `CartItem` (afecta localStorage de usuarios existentes).
- Cambiar el nombre de `STORAGE_KEY` o el prefijo `buleje-` (rompe multi-tab).
- Quitar `BroadcastChannel` sync.
- Agregar fetch de datos NO-idempotentes dentro de la hidratación.

## Tests recomendados

- Agregar item con ID que NO está en el response de `/api/products` → carrito se preserva.
- 2 tabs abren cart → ambos se sincronizan sin echo loop.
- Tenant change (login/logout) → cart correcto para el tenant actual.
- localStorage con JSON corrupto → silent fallback, no throw.

## Handshake antes de editar

Antes de tocar cart-context, confirmar:
- [ ] ¿Afecta shape de CartItem persistido? (si sí → ADR + migración)
- [ ] ¿Cambia el contrato de hidratación? (si sí → revisar guards)
- [ ] ¿Agrego fetch en hidratación? (si sí → defensivo, fire-and-forget, con guard de "no borrar todo")
- [ ] ¿Hay test que cubra el nuevo comportamiento?
