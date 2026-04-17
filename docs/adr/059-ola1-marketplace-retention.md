# ADR-059: Ola 1 — Retención Marketplace (Favoritos, Listas, Cupones, Historial, Comparador)

## Estado

🟡 **Propuesta** — Zod schemas + UI independiente desplegados 2026-04-16. Schema Prisma pendiente de ejecución bajo migration-planner + database-engineer.

## Fecha

2026-04-16

## Contexto

El marketplace de Buleje ya tiene tráfico inicial y órdenes reales, pero carece de los **mecanismos de retención** que un e-commerce moderno necesita para que el cliente vuelva: historial de pedidos visible, favoritos persistentes, listas de compras reutilizables, comparador de precios entre tiendas, cupones aplicables en checkout y sistema de referidos.

El plan de trabajo (`docs/superpowers/plans/2026-04-13-ola1-compra-recurrente.md`) — especificado el 2026-04-13 con su design doc hermano — propone **5 features interconectadas** que, ejecutadas en conjunto, empujan el KPI "Retención 30 días" definido en `docs/VISION_2027.md` (meta > 80%):

| # | Feature | Ruta nueva | Dolor que resuelve |
|---|---------|------------|--------------------|
| 1 | Historial de pedidos + Reorder 1-click | `/marketplace/mi-cuenta/pedidos` | Cliente olvida qué compró; no repite compra |
| 2 | Favoritos DB-backed (reemplaza localStorage) | `/marketplace/mi-cuenta/favoritos` | Favoritos se pierden al cambiar de dispositivo |
| 3 | Comparador de precios entre tiendas (extensión) | `/marketplace/productos/[id]/precios` | Cliente no sabe si está pagando más |
| 4 | Listas de compras recurrentes | `/marketplace/mi-cuenta/listas` | Tiene que reconstruir el carrito cada semana |
| 5 | Cupones aplicables + Referidos trackeados | `/marketplace/mi-cuenta/cupones`, `/referidos` | No hay incentivo para traer amigos |

La infraestructura ya contiene parcialmente algunos artefactos:

- `GET /api/me/order-history` — paginado listo, sin UI todavía
- `POST /api/me/reorder/[orderId]` — valida stock/precio, sin UI todavía
- `GET /api/me/favorites?ids=1,2,3` — enriquece desde localStorage (fallback temporal)
- `GET /api/me/referral-status` — devuelve código + contador
- `components/marketplace/PriceCompare.tsx` — componente de comparador (usa `/api/marketplace/compare`)
- `components/marketplace/ReorderButton.tsx` — CTA "repetir último pedido"
- `lib/db/coupons.db.ts` + `CouponsDB` en `lib/jsondb.ts` — validación de cupones funcionando
- `prisma/schema.prisma:906` — `ShoppingList` + `ShoppingListItem` declarados, sin rutas API aún
- `Customer.referralCode` + `Customer.referredBy` — ya en schema (sin flow completo)

Por otro lado, **faltan componentes críticos** antes de poder desplegar la Ola 1 completa:

1. 2 modelos Prisma nuevos: `Favorite` y `CouponRedemption`
2. Extensiones a `ShoppingList`/`ShoppingListItem`/`Coupon` (campo `storeId`, `notes`, `isDefault`, `sortOrder`)
3. 7 rutas API nuevas bajo `/api/marketplace/*` (favoritos, listas, listas/items, my-coupons, my-referral, referral/register, cron/birthday-coupons)
4. 14 componentes UI nuevos bajo `components/marketplace/*`
5. 7 páginas nuevas bajo `app/marketplace/mi-cuenta/*`
6. 6 archivos de tests para DB layer y API routes
7. Wiring en `UnifiedProductCard`, `MarketplaceNavbar`, `MarketplaceCheckoutModal`

## Opciones consideradas

### Opción A — Implementar todo de una sesión en 1 PR gigante

- ✅ Feature completo de una vez — efecto visible inmediato
- ❌ Toca zona peligrosa (`schema.prisma`, `MarketplaceCheckoutModal`) sin audit-first documentado
- ❌ PR > 40 archivos — difícil de revisar + rollback catastrófico si algo falla
- ❌ Rompe la regla 12 de CLAUDE.md (ADR nuevo para cambios arquitectónicos) si no se formaliza antes

### Opción B — Stack incremental en 3 PRs atomicos por dominio

1. **PR-1 (este ADR + Zod schemas + UI puro independiente)** — 0 riesgo, 0 zona peligrosa, deployable.
2. **PR-2 (schema migration + DB layer + route handlers)** — requiere migration-planner + database-engineer, raw SQL manual bajo el patrón de ADR-017/020 (pooler session mode puerto 5432, no `prisma migrate dev`).
3. **PR-3 (wiring UI: páginas `/mi-cuenta/*` + inclusión en `UnifiedProductCard`, `MarketplaceNavbar`, `MarketplaceCheckoutModal`)** — bloqueado por PR-2.

- ✅ Cada PR auditable aislado, rollback quirúrgico
- ✅ PR-1 entrega valor (schemas reutilizables, ADR como fuente de verdad) sin tocar zona peligrosa
- ✅ PR-2 respeta el patrón de migraciones ya probado en Ola 1 anterior (TD-019/020/021/030/031/032)
- ✅ PR-3 sólo toca UI con backend garantizado — zero data loss
- ❌ 3x overhead de review + deploys
- ❌ Efecto para usuario final aparece recién con PR-3

### Opción C — Empezar por backend (DB + API) y dejar UI al final

- ✅ Features listas para ser consumidas por el app móvil (Capacitor) en paralelo
- ❌ Schema.prisma cambia antes de tener un ADR — rompe zona peligrosa hook
- ❌ Sin UI, no hay manera de validar end-to-end — bugs de contrato API descubiertos tarde

## Decisión

**Elegimos la Opción B — 3 PRs atómicos.** Este ADR cubre el PR-1, que sienta la base documental y los schemas Zod reutilizables.

### Alcance del PR-1 (este ADR)

| Entregable | Archivos | Riesgo |
|-----------|----------|--------|
| ADR (este doc) | `docs/adr/059-ola1-marketplace-retention.md` | 0 |
| Zod: favoritos | `lib/validations/favorite.schema.ts` | 0 |
| Zod: listas de compras | `lib/validations/shopping-list.schema.ts` | 0 |
| Zod: cupones (validate + redeem) | `lib/validations/coupon-redeem.schema.ts` | 0 |

**Gates del PR-1:**
- `npx tsc --noEmit` → 0 errores
- `npm run lint` → limpio
- Sin cambios en zona peligrosa (`schema.prisma`, `CheckoutModal`, `cart-context`, `role-permissions`)
- Sin cambios en runtime existente (puro código nuevo, aditivo)

### Alcance del PR-2 (futuro, bloqueado por agent team)

**Disparo:** `/audit-first schema.prisma` → ADR-020 addendum con SQL concreto → agent team `database-engineer + migration-planner + backend-platform-engineer` en paralelo.

**Orden estricto:**

1. **Paso 0 — Verificación drift:** `scripts/verify-ola1-retention-schema.ts` (read-only) comprueba que `Favorite`, `CouponRedemption`, y columnas nuevas de `ShoppingList`/`Coupon` no existen ya por drift.
2. **Paso 1 — SQL raw manual:** `scripts/apply-ola1-retention.sql` ejecutado vía pooler session mode puerto 5432 (no `prisma migrate dev`). Patrón heredado de ADR-017.
3. **Paso 2 — Schema sync:** editar `prisma/schema.prisma` a mano con los 2 modelos nuevos + 3 extensiones + 6 relaciones, correr `npx prisma validate && npx prisma format && npx prisma generate`.
4. **Paso 3 — DB layer:** `lib/db/favorites.db.ts`, `lib/db/shopping-lists.db.ts`, extensión a `lib/db/coupons.db.ts` con `redeemCoupon()` + `getMyCoupons()`. Cada uno con test unitario siguiendo el patrón `lib/db/*.test.ts` existente.
5. **Paso 4 — Route handlers:** las 7 rutas bajo `/api/marketplace/*` con el patrón estándar `requireCustomer → safeParse → DB class → logActivity → invalidateByPrefix`.
6. **Paso 5 — Cron handler:** `/api/cron/birthday-coupons` — genera cupones automáticos cuando un cliente cumple años (ya hay `Customer.birthday` y `Customer.fechaNacimiento`).

**Constraints para PR-2:**
- Todo nuevo modelo tiene `tenantId: String` + `@@index([tenantId])` (regla 3 CLAUDE.md + multi-tenant-guard skill).
- Todas las FK con `onDelete: Cascade` salvo `Coupon.orderId` (SetNull — la orden puede borrarse antes que la redemption).
- `Favorite` con unique `(customerPhone, productId, tenantId)` para evitar duplicados.
- `CouponRedemption` con unique `(couponId, customerPhone, tenantId)` para enforcement del "1 uso por cliente".

### Alcance del PR-3 (futuro, bloqueado por PR-2)

14 componentes UI + 7 páginas + wiring en 4 componentes existentes. Bajo agent team `frontend-engineer + checkout-specialist + qa-reliability-engineer` porque toca `MarketplaceCheckoutModal` (zona peligrosa).

## Consecuencias

### Positivas

- **Desbloquea el próximo sprint sin tocar zona peligrosa hoy.** El ADR + los Zod schemas son 4 archivos deployables con 0 riesgo.
- **KPI retención 30 días** pasa a ser medible: una vez que PR-2 + PR-3 mergeen, las órdenes repetidas se pueden contar por `Customer.phone` con comparativa mes a mes.
- **Base multi-tenant preservada:** cada nuevo modelo hereda el patrón `tenantId + @@index([tenantId])` ya probado.
- **Reusa infraestructura existente:** no duplica rutas ni componentes (extensión sobre `PriceCompare`, `ReorderButton`, `/api/me/*`).
- **Sirve de precedente para Ola 2/3:** la descomposición en 3 PRs atómicos puede replicarse para cada ola posterior.

### Negativas

- **PR-1 aislado parece "solo papeleo"** sin feature visible para el usuario. Mitigación: el usuario verá la feature solo al cierre de PR-3, pero el flujo de aprobación incremental reduce riesgo de rollback catastrófico.
- **Ventana total de 3 sesiones** vs 1 sesión grande. Mitigación: aceptable porque no hay dependencias cross-ola bloqueantes.
- **Schema drift temporal en PR-2** entre `schema.prisma` y la DB real (ya visto en ADR-017). Mitigación: `scripts/verify-ola1-retention-schema.ts` como control.

### Riesgos

1. **Brandon quiera saltarse al PR-3 directo.** Mitigación: este ADR documenta el gate.
2. **`MarketplaceCheckoutModal` en PR-3 deja bugs de cupones.** Mitigación: `checkout-squad` obligatorio (danger-zone hook ya enforza esto).
3. **Schema gap en producción** si `Favorite` se queda en schema sin SQL real aplicado. Mitigación: Paso 0 del PR-2 detecta drift antes de editar schema.
4. **Performance hit en listado de favoritos** si cliente tiene 100 favoritos. Mitigación: hard cap en `MAX_FAVORITES = 100` + `orderBy createdAt desc` + paginación si llega a límite.
5. **Cupones "1 uso por cliente" bypasseable** si el usuario cambia de teléfono. Mitigación: combinar con `CouponRedemption.customerPhone` + `Customer.documento` en futuro (fuera de scope de PR-1).

## Referencias

- `docs/superpowers/specs/2026-04-13-ola1-compra-recurrente-design.md` — design doc
- `docs/superpowers/plans/2026-04-13-ola1-compra-recurrente.md` — plan detallado con ~30 archivos
- `docs/adr/016-plan-maestro-24-weeks.md` — roadmap maestro (Ola 1 de retención es parte del Sprint 3 "Retención")
- `docs/adr/017-ola1-migrations-indices-strategy.md` — precedente de migraciones raw SQL zero-downtime
- `docs/adr/020-ola1-migration-plan.md` — precedente de ejecución unificada de migraciones Ola 1 anterior
- `docs/adr/011-delivery-raw-sql-pattern.md` — patrón raw SQL cuando `prisma migrate dev` no aplica
- `docs/VISION_2027.md` — KPI "Retención 30 días > 80%"
- `CLAUDE.md` reglas 1, 2, 3, 5, 9, 12 — aplicadas en los 3 PRs
- `components/marketplace/PriceCompare.tsx` — comparador ya en producción
- `components/marketplace/ReorderButton.tsx` — CTA reorder ya en producción
- `app/api/me/order-history/route.ts` — endpoint listo, solo falta UI
- `app/api/me/reorder/[orderId]/route.ts` — endpoint listo, solo falta UI
