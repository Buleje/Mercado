# Bug Hunting Panel Admin — Findings (2026-05-17)

Auditoría sobre `components/admin/**`, `app/api/admin/**`, `app/api/sales`, `app/api/orders`, `app/api/turnos`, `lib/db/*.db.ts`.

## Resumen

| Severidad | Cantidad |
|---|---|
| **P0** (data corruption / seguridad / bloqueo) | 4 |
| **P1** (cálculo/UX incorrecta + tenant leak) | 5 |
| **P2** (deuda técnica / mejoras) | 3 |

---

## P0 — críticos

### P0-1. Cajero NUNCA puede cerrar/ver su propio turno (ABAC roto)

- **Archivos:** `app/api/turnos/[id]/cerrar/route.ts:54` · `app/api/turnos/[id]/summary/route.ts:40`
- **Reproducer:** login como `role=cajero`, abrir un turno con su propio `adminUserId`, intentar cerrarlo → siempre `403 No tenés permiso para cerrar el turno de otro cajero`.
- **Causa raíz:** se compara `existing.adminUserId !== auth.username`. `Turno.adminUserId` referencia `AdminUser.id` (CUID, ver `prisma/schema.prisma:2034`), mientras `auth.username` es el username del JWT (string humano). Son tipos distintos → siempre diferentes → cajero bloqueado.
- **Fix sugerido:** resolver primero con `AdminUsersDB.resolveIdByUsername(auth.tenantId, auth.username)` (igual que `app/api/turnos/activo/route.ts:25`) y comparar `existing.adminUserId !== resolvedId`.
- **Test de regresión:** integración — abrir turno cajero A, cerrar como A → 200; cerrar como B → 403.

### P0-2. `cobrarPorCliente` — race condition reescribe saldo (TOCTOU dentro de tx)

- **Archivo:** `lib/db/fiados.db.ts:549-561`
- **Reproducer:** dos POS cobrando al mismo cliente con dos fiados pendientes en paralelo (read commited default de Postgres). Ambas tx leen `saldo=100` → ambas escriben `saldo=80` (en vez de `60`). Pérdida de S/20 de deuda.
- **Causa raíz:** dentro de la $transaction, hace `const saldo = Number(fiado.saldo)` y luego `data: { saldo: newSaldo }` (SET, no DECREMENT). El comentario "Y2 FIX 2026-05-07" afirma atomicidad pero la implementación real **no** usa `{ decrement }`. La hermana `cobrarBatch` (líneas 469-471) sí lo hace correctamente.
- **Fix sugerido:** reemplazar `data: { saldo: newSaldo, status: ... }` por `data: { saldo: { decrement: payment }, status: newSaldo <= 0.01 ? "PAGADO" : "ACTIVO" }`. Idealmente re-leer post-update para confirmar el status.
- **Test de regresión:** Vitest con `Promise.all([cobrarPorCliente(...), cobrarPorCliente(...)])` y assert que `sum(saldo final) + sum(pagos) === saldo inicial`.

### P0-3. `payable.update` sin `tenantId` en WHERE (potential cross-tenant write)

- **Archivo:** `lib/db/finance.db.ts:117-120` (dentro de `addPayment`)
- **Reproducer:** la $transaction valida ownership con `findFirst({ id, tenantId })`, pero al hacer `tx.payable.update({ where: { id } })` omite `tenantId`. Si el `id` fuera reutilizado o adivinado, un POST con `id` de otro tenant + ownership rota podría escribir. Defense-in-depth roto.
- **Causa raíz:** `update` con `where: { id }` (PK única global) no fuerza el filtro multi-tenant; depende solo del `findFirst` previo en la línea 100.
- **Fix sugerido:** usar `updateMany({ where: { id, tenantId }, data })` o `update({ where: { id_tenantId: { id, tenantId } } })` si existe el compound unique.
- **Test de regresión:** assert que `tx.payable.update` falla si la PK pertenece a otro tenant.

### P0-4. Pagación in-memory: `orders.slice(...)` carga TODAS las órdenes en RAM

- **Archivos:** `app/api/orders/route.ts:162-177` · `app/api/sales/route.ts:103-110`
- **Reproducer:** un tenant con 50k órdenes hace `GET /api/orders?page=2&limit=20`. El backend hace `OrdersDB.getAllFiltered(...)` (load todo) y luego `orders.slice(20, 40)`. RAM 50MB+ por request → OOM en Vercel Fluid (512MB) bajo carga.
- **Causa raíz:** la "Legacy: offset pagination" hace filtrado en JS sobre el resultset completo en vez de `skip/take` en Prisma.
- **Fix sugerido:** migrar a cursor/offset DB-side (`OrdersDB.getAllFilteredPaginated(...)` con `skip:(page-1)*limit, take:limit`), retornando `{items, total}`.
- **Test de regresión:** k6 con tenant de 10k órdenes → p95 < 500ms; assert que no se carga `findMany` sin `take`.

---

## P1 — graves

### P1-1. Status comparisons con mayúsculas/minúsculas inconsistentes

Confirmé el patrón TreasuryDashboard (corregido). Quedan **leaks similares** en componentes que tratan `fiado.status` como **lowercase** cuando el enum DB es **UPPERCASE**:

| Archivo:línea | Comparación | Enum real | Impacto |
|---|---|---|---|
| `components/admin/CreditScoreCard.tsx:90` | `o.status !== "pagado"` | `OrderStatus` usa lowercase (`pagado` no es valor — los valores son `pendiente/confirmado/preparando/en_camino/entregado/cancelado`). | Aquí `o` es Order: **no existe** `"pagado"` en `OrderStatus` enum → filtro siempre `true` → todas las órdenes cuentan como impagas. **Score crediticio defectuoso para todos los clientes**. |
| `components/admin/CheckManagementTab.tsx:60-61` | `p.status === "pagado"` | depende del shape — verificar contra fuente | Estado de cheques nunca match. |

- **Causa raíz:** mezcla de enums Prisma:
  - `OrderStatus` → lowercase, sin `pagado`
  - `FiadoStatus` → UPPERCASE (`ACTIVO/PAGADO/VENCIDO/CANCELADO`)
  - `Payable.status` → string libre con valores `pendiente/parcial/pagado` (no enum)
- **Fix sugerido:** en `CreditScoreCard:90`, cambiar criterio: `!o.paidAt && o.status !== "entregado"` o usar Payable real. Tipar `Order.status` con literal del enum.
- **Test de regresión:** snapshot del score esperado para 3 clientes con historial conocido.

### P1-2. `prisma.turno.findUnique({ where: { id } })` sin `tenantId`

- **Archivos:** `app/api/turnos/[id]/cerrar/route.ts:40` · `app/api/turnos/[id]/summary/route.ts:30`
- **Causa raíz:** se hace `findUnique({ where: { id } })` y luego se valida `existing.tenantId !== auth.tenantId`. Funciona pero requiere round-trip extra y rompe el patrón regla #3. Si el adversario adivina un CUID de otro tenant verá un objeto antes del 404 (timing oracle muy débil pero existe).
- **Fix sugerido:** `prisma.turno.findFirst({ where: { id, tenantId: auth.tenantId } })` o migrar a `TurnosDB.getById(tenantId, id)`.

### P1-3. `Number(p.amount).toFixed(2)` cuando `p.amount` puede ser `undefined`

- **Archivos:** `components/admin/PayablesTab.tsx:202,287` · `components/admin/ReceivingTab.tsx:487` · `components/admin/CheckManagementTab.tsx:217`
- **Reproducer:** si la API responde una row sin `amount` (p.ej. compra parcialmente persistida), `Number(undefined)` → `NaN` → `"NaN".toFixed(2)` → `"NaN"` mostrado al usuario.
- **Causa raíz:** `Number(undefined) === NaN`, sin guard.
- **Fix sugerido:** helper `fmt(n?: unknown) { const x = Number(n); return Number.isFinite(x) ? x.toFixed(2) : "0.00"; }`.

### P1-4. `fetch(...).then(r => r.ok ? r.json() : [])` swallow silencioso

- **Archivos:** `components/admin/NotificationsTab.tsx:38-39` · `LiquidityForecastTab.tsx:147-148` · `ShiftControlTab.tsx:113-114` · `PurchaseOrdersTab.tsx:297` · `BundlesTab.tsx:32`
- **Reproducer:** API 500 → UI muestra "0 facturas pendientes" sin error visible. Imposible detectar incidentes en producción sin tail de logs.
- **Causa raíz:** la rama `r.ok === false` retorna `[]` o `null` enmascarando todos los errores 4xx/5xx.
- **Fix sugerido:** patrón estándar — si `!r.ok`, `throw new Error(...)` y mostrar toast `useToast()`. Vital en `LiquidityForecastTab` (dinero).

### P1-5. `try { ... } catch { /* fire-and-forget */ }` en invalidación de caché

- **Archivos:** `app/api/payables/[id]/route.ts:66-69, 95-98` (PATCH/DELETE)
- **Causa raíz:** si `invalidateAdminCache.afterPayable` falla (Redis down), el caché queda stale → bodeguero ve cuentas "pagadas" como "pendientes" hasta TTL.
- **Fix sugerido:** loguear con `logger.warn` en vez de comentario "fire-and-forget" mudo. Es OK no propagar el error pero NO esconderlo.

---

## P2 — deuda

### P2-1. `sales-anomalies.db.ts:222` — `findUnique` sin tenantId
- **Archivo:** `lib/db/sales-anomalies.db.ts:222`. Mismo patrón P1-2: filtra después por `existing.tenantId !== tenantId`. Funciona, pero rompe regla #3.

### P2-2. `cierre-diario.db.ts:141` — `product.findUnique({ where: { id: topProductId } })`
- Cross-tenant potencial si `topProductId` viene calculado de un agregado del propio tenant — bajo riesgo pero anti-patrón.

### P2-3. `subscriptions.db.ts:255` — `subscription.findUnique({ where: { id } })`
- Sin tenantId. Suscripciones son cross-platform (SaaS) — verificar que no se exponga a endpoint admin tenant.

---

## Patrones recomendados (resumen)

| Patrón | Reemplazo |
|---|---|
| `update({ where: { id }, ... })` post-findFirst | `updateMany({ where: { id, tenantId }, ... })` |
| `saldo: newSaldo` post-read | `saldo: { decrement: amount }` |
| `orders.slice(start, end)` post-`findMany` | `findMany({ skip, take })` |
| `r.ok ? r.json() : []` | `if (!r.ok) throw new Error(...)` + toast |
| `auth.username` para FK | `AdminUsersDB.resolveIdByUsername(...)` |
| `Number(x).toFixed(...)` | guard `Number.isFinite(x)` |

## Próximos pasos sugeridos
1. P0-1 (cajero turno cerrar) → bloquea operación real, fix prioritario.
2. P0-2 (race fiados) → riesgo financiero, fix con test de concurrencia.
3. P0-4 (paginación in-memory) → tira cold-starts en escala.
4. Sweep masivo de P1-4 (fetch swallow) — afecta confianza en producción.
