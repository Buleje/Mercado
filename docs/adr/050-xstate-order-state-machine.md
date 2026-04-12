# ADR-050 — XState state machine explícita para Order

**Fecha:** 2026-04-10
**Estado:** ✅ APPLIED (módulo + tests) · ⏳ PENDING (integrar en orders.db.ts)
**Bloque:** Refactor de zonas peligrosas · #08 del backlog 2026-04-10

## Contexto
`lib/db/orders.db.ts` tiene la state machine **implícita** en condicionales sueltos:
```ts
if (opts.status) { where.status = { in: statuses }; }
// ...
status: { in: ["pendiente", "confirmado"] }  // scattered magic values
```
Sin guardas explícitas se pueden producir:
- Pedidos que saltan estados (`pendiente` → `entregado` directo)
- Cancelaciones sobre `entregado` (inválido)
- Race conditions en writes paralelos
- Bugs invisibles porque "compila y pasa tests felices"

Los 5 estados canónicos están en `lib/db/misc.db.ts`:
```ts
export type OrderStatus = "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";
```

## Decisión
1. Módulo nuevo `lib/state-machines/order-machine.ts` con:
   - **`orderMachine`** — máquina XState v5 con contexto tipado y acciones que mutan `OrderContext`.
   - **`isValidTransition(from, event)`** — validador puro O(1), usable en el boundary de `OrdersDB.updateStatus`.
   - **`assertTransition(from, event)`** — versión que lanza con mensaje descriptivo (fail-loud).
2. Tests en `__tests__/state-machines/order-machine.test.ts` — 23/23 passing.
3. **No se toca `orders.db.ts` en este ADR** — es módulo paralelo. La migración se hace en otro sprint con:
   - Añadir `assertTransition(current, EVENT)` al inicio de `OrdersDB.updateStatus`
   - Emitir `ActivityLog` con `{ from, to, event, by }` por cada transición
   - Reemplazar checks ad-hoc en API routes por llamadas a `isValidTransition`

## Consecuencias
- ✅ Visualización gratis en https://stately.ai/viz (pegar el JSON de `orderMachine.config`)
- ✅ Documentación ejecutable: la máquina ES la especificación
- ✅ Tests unitarios cubren 20 transiciones (4 eventos × 5 estados)
- ✅ Migración incremental — no rompe nada hoy
- ⚠️ Sale también necesita una máquina similar (próximo ADR)
- ⚠️ La máquina no maneja fulfillment parcial (cuando un pedido se entrega en varias partes). Si el negocio lo requiere, añadir estado `parcialmente_entregado`.

## Alternativas consideradas
- **Boolean flags en lugar de estados** — lo que hay hoy. Funciona pero es incomprensible después de 6 meses.
- **Implementación propia con enum + switch** — más simple pero sin visualización, sin historial, sin inspection.
- **XState v4** — v5 es más type-safe y tiene mejor inference con TypeScript 5.

## Comando para verificar
```bash
cd bodega-san-martin
npx tsc --noEmit              # debe pasar
npx vitest run __tests__/state-machines/   # 23/23
```

## Referencias
- `lib/state-machines/order-machine.ts` (nuevo)
- `__tests__/state-machines/order-machine.test.ts` (nuevo)
- `lib/db/orders.db.ts` (a modificar en siguiente sprint)
- `lib/db/misc.db.ts` L89 OrderStatus type
- XState v5 docs · Statecharts by David Harel
