# ADR-096 — `CartItem.storeSlug` para evitar items cross-tenant fantasma

- **Estado:** Accepted
- **Fecha:** 2026-05-06
- **Autor:** Brandon (con apoyo de claude-code)
- **Tags:** multi-tenancy, cart, IDOR, ux, danger-zone

## Contexto

Reporte de Brandon 2026-05-06 desde storefront `/t/mi-pollo`:

> "se puso logo y datos de la tienda original pero los items y productos de otra tienda y no tiene sentido"

Logs `/api/orders`:
```
[orders] admin cross-tenant — tratado como checkout público
  { adminTenant: "main", storefrontTenant: "cmoevpwfk0000l4vzwq6revm5" }
[orders] Error response: { error: "invalid_product", productId: 1252384 }
```

`productId 1252384` existe en `main`, no en `mi-pollo`. El cart del navegador hidrataba items de un tenant en el storefront de otro.

**Causa raíz**: `CartItem` no tenía marca de origen. Cuando el usuario navegaba entre `/marketplace` (slug=main) y `/t/mi-pollo` (slug=mi-pollo), la validación remota usaba `/api/marketplace/products/check-exists` que cruza stores — los items "existen" globalmente y por eso no se purgan, pero no son del tenant del storefront actual → 400 al checkout.

## Decisión

Añadir campo opcional `storeSlug?: string` al tipo `CartItem`:

```ts
export type CartItem = Product & {
  quantity: number;
  note?: string;
  storeSlug?: string;  // ← NEW
};
```

### Reglas de uso

1. **Al añadir** (`ADD_ITEM`, `ADD_MULTIPLE`): el reducer captura `slugRef.current` y lo persiste en el item.
2. **Al hidratar**: items con `storeSlug` distinto al `tenantSlug` actual se **descartan** antes de pasar al state. Items legacy (`storeSlug === undefined`) se **preservan** — asumimos que pertenecen al tenant actual (compatibilidad).
3. **Al sincronizar multi-tab** (BroadcastChannel): el receptor también filtra por slug actual.

### Invariantes preservadas (skill `state-management`)

- **#1 — No borrar carrito por API dudosa**: el filtro por `storeSlug` es **determinístico** (no depende de fetch). Items legacy se preservan. ✅
- **#2 — `hydratedRef` al final**: sin cambio. ✅
- **#3 — BroadcastChannel scoped por slug**: sin cambio. ✅
- **#4 — TAB_ID self-echo**: sin cambio. ✅
- **#5 — `sk(slug, key)`**: sin cambio. ✅
- **#6 — Fire-and-forget remoto**: sin cambio (validación local, instantánea). ✅

## Consecuencias

**Positivas**:
- Cero items cross-tenant fantasma en checkout.
- Backward-compatible: items legacy en localStorage de usuarios reales siguen funcionando.
- No requiere migración de datos.

**Negativas**:
- En multi-tienda intencional (un cliente compra de varias bodegas en el marketplace), este cart per-tenant es estricto. El marketplace ya tiene su propio context (`useMarketplaceCart`) que sí cruza stores.

**Neutras**:
- Cambio de shape (`CartItem.storeSlug?`) es retro-compatible: localStorage existente se hidrata sin error.

## Plan de fallback

Si por alguna razón el filtro descarta items legítimos, el comportamiento se controla con un feature flag local:

```ts
const STRICT_TENANT_FILTER = true; // toggle si bug
```

Si `STRICT_TENANT_FILTER = false`, items con `storeSlug` mismatch sólo se loggean (warning) sin descartarse.

## Tests recomendados

1. Cart con item `storeSlug="main"` se monta CartProvider con `tenantSlug="mi-pollo"` → item descartado, cart vacío.
2. Cart con item sin `storeSlug` (legacy) en CartProvider `tenantSlug="X"` → item preservado.
3. Add item con slug actual → persistido con `storeSlug` correcto.
4. BroadcastChannel: tab A en main añade item → tab B en mi-pollo recibe pero descarta.

## Referencias

- Skill: `.github/instructions/state-management.instructions.md`
- Endpoint relacionado: `app/api/orders/route.ts` (devuelve `invalid_product` si productId no existe en tenant del header).
- Bug previo similar: 2026-04-19 (cart-hydration-patch-v1, comentario línea 238 cart-context.tsx).
- Sesión anterior: ADR-093 (Cross-tenant guard pattern).
