# Audit Fiados — Mi Pollo (mi-pollo.localhost:3000)

**Fecha:** 2026-05-17
**Branch:** `feat/checkout-payment-proof`
**Auditor:** Claude (Opus 4.7) + smoke en mi-pollo
**Alcance:** módulo Fiados + vínculos con POS, Treasury, Caja, Analytics, Cierre Diario, Customer

---

## Resumen ejecutivo

| Estado | Cantidad |
|---|---|
| Endpoints | 9 (fiados, cobrar, cobro-masivo, [id], [id]/pagar, analytics, fiado-resumen, 2 crons) |
| Componentes UI | 16 (FiadosModule + 6 propios + 9 consumidores) |
| Tests | 27 verdes (FiadosDB business logic + cobrar API) — **950ms** |
| Smoke CRUD | ✓ crear / pago parcial / cobrar / overpayment 404 / detail |
| Race condition | ✓ sin overpayment (decrement atómico funciona) · ✗ 503 indistinto vs 409 |
| Hallazgos | **2 P0, 5 P1, 6 P2** |

**Veredicto:** Módulo funciona en happy path y resiste overpayment, pero tiene 2 bugs que muestran data incorrecta al dueño y 1 que puede cargar deuda al cliente equivocado.

---

## P0 — Bloquean confianza en datos del dueño

### P0-1 · TreasuryDashboard cuenta TODOS los fiados como pendientes

**Archivo:** `components/admin/TreasuryDashboard.tsx:309`

```tsx
${fiados.filter(f => f.status !== "pagado").length} clientes pendientes
```

**Problema:** el enum `FiadoStatus` en Prisma es UPPERCASE (`PAGADO`), pero la comparación usa lowercase (`"pagado"`). `"PAGADO" !== "pagado"` siempre es `true` → el contador **incluye los fiados ya pagados** como "pendientes".

**Vínculo:** mismo patrón ya documentado en `app/api/fiados/route.ts:20-28` (FIX 2026-05-07 P0 #3 que normalizó status con Zod). Es una regresión del mismo bug en el frontend.

**Fix:** `f.status !== "PAGADO"` (o `f.status === "ACTIVO" || f.status === "VENCIDO"` para excluir CANCELADO).

**Impacto:** el KPI "Por cobrar (fiados)" muestra # de clientes incorrecto. El monto (`kpis.porCobrar`) sí se calcula correcto en otra parte.

---

### P0-2 · "Fiado rápido" puede cargar deuda al cliente equivocado

**Archivo:** `components/admin/FiadosModule.tsx:338`

```tsx
body: JSON.stringify({
  customerId: quickFiadoForm.nombre.trim(),
  ...
})
```

**Problema:** el formulario "rápido" envía el **nombre** como `customerId`. El backend (`app/api/fiados/route.ts:45-49`) hace `findFirst` por `contains: input` insensitive → si hay 2 clientes con el mismo nombre (ej. dos "María", dos "Don Carlos"), la deuda se carga al primero encontrado.

**Caso real Pucallpa:** bodega con clientela barrial tiene varias "María" y "Carlos" — colisión casi segura.

**Fix:** el modal "fiado rápido" debe exigir teléfono, o usar autocomplete que devuelva phone unique (igual al modal completo). Backend debería retornar `409 Conflict + lista de matches` si hay >1 match por nombre.

**Impacto:** cobranza al cliente equivocado, conflicto familiar, pérdida de confianza.

---

## P1 — Errores de robustez, observabilidad o UX

### P1-1 · POSFiadoPanel silencia errores de cobro

**Archivo:** `components/admin/pos/POSFiadoPanel.tsx:77`

```tsx
} catch {
  // Silent fail
}
```

El cobro desde POS puede fallar silenciosamente: el cajero ve el botón "Confirmar" volver al estado normal pero **no sabe si el cobro pasó**. Si fue una falla de red, el cliente paga 2 veces o el cajero registra a mano y luego un cobro tardío crea duplicado.

**Fix:** distinguir 200/4xx/5xx/network; mostrar toast de error con el mensaje del backend; offrecer "Reintentar".

---

### P1-2 · GET /api/fiados devuelve `[]` HTTP 200 cuando hay error real

**Archivo:** `app/api/fiados/route.ts:124-126`

```ts
} catch (e) {
  logger.error("[fiados] GET error", ...);
  return NextResponse.json([], { status: 200 });
}
```

El frontend cree que "no hay fiados" cuando en realidad la DB está caída. KPI muestra S/0, dashboard miente. El audit log queda en server logs pero el dueño no se entera.

**Fix:** devolver `503` con `{ error, retryable: true }` y que el frontend muestre estado de error con "Reintentar".

---

### P1-3 · Race condition → HTTP 503 indistinto

**Archivo:** `app/api/fiados/[id]/pagar/route.ts:60` + `cobro-masivo/route.ts:135`

Smoke ejecutado: 5 cobros concurrentes S/30 sobre saldo S/100. Prisma rechazó 1 con write-conflict → endpoint devuelve `503 "Database error"` (mismo código que una DB caída).

**Fix:** detectar `P2034` (transaction conflict) y devolver `409 Conflict` + retry-after; opcionalmente envolver `registerPago` con `withDbRetry` (ya existe en `lib/db-retry.ts`, usado en GET pero no en POST).

---

### P1-4 · `fiado-resumen` viola regla #1 (prisma directo en route)

**Archivo:** `app/api/customers/[phone]/fiado-resumen/route.ts:39, 58`

Dos `prisma.fiado.aggregate/findFirst` directos con `// eslint-disable-next-line no-restricted-properties` y comentario "migration pendiente". Debería ir a `FiadosDB.resumenByCustomer(tenantId, phone)` para cumplir regla #1 CLAUDE.md (cache + audit + tenantId obligatorio en el wrapper).

---

### P1-5 · `cobro-masivo` viola regla #1 (logic en route)

**Archivo:** `app/api/fiados/cobro-masivo/route.ts:49-106`

Toda la transacción de cobro masivo está inlined en el handler con `prisma.$transaction` directo. Debería migrar a `FiadosDB.cobroMasivo(tenantId, payments, notas)` siguiendo el patrón de `registerPago` y `cobrarPorCliente`.

Bonus: el loop hace N+4 queries por pago (findFirst → update decrement → findFirst para releer → update status + create cuota). Se puede colapsar a 3 queries con `update().returning()` (Prisma soporta `data: { saldo: { decrement } }, select: ... }`).

---

## P2 — Mejoras de calidad / consistencia

### P2-1 · FiadosDB.list hace 2 round-trips innecesarios

**Archivo:** `lib/db/fiados.db.ts:83-94`

`findMany` de fiados + otro `findMany` de customers manual. Debería usar `include: { customer: { select: { name: true } } }` directo. El comentario dice "to avoid relation errors" pero la relación existe en el schema (`Fiado.customer @relation(fields: [customerId], references: [phone])`). Investigar y simplificar.

### P2-2 · `customers` lookup en list() sin tenantId

**Archivo:** `lib/db/fiados.db.ts:91`

```ts
prisma.customer.findMany({ where: { phone: { in: customerPhones } }, ... })
```

Hoy funciona porque `Customer.phone` es `@unique` global (TD-040 Phase 1). Pero la Phase 3 de ese mismo TD lo va a relajar a `@@unique([tenantId, phone])` → **bomba de tiempo**: cuando se haga el contract de TD-040, este lookup va a devolver names de OTROS tenants.

**Fix:** agregar `tenantId` al where ahora, sin esperar TD-040 Phase 3.

### P2-3 · `registerPago` perdió defense-in-depth en re-lectura

**Archivo:** `lib/db/fiados.db.ts:227-230`

```ts
const afterDecrement = await tx.fiado.findUnique({
  where: { id: fiadoId },  // ← sin tenantId
  include: { cuotas: ... },
});
```

Está dentro de tx y el decrement anterior sí lo tiene, así que es seguro hoy. Pero rompe el patrón "tenantId siempre" — si alguien refactoriza puede quitar el guard externo.

### P2-4 · FiadosModule tiene 7 `catch { /* ignore */ }`

**Archivo:** `components/admin/FiadosModule.tsx` (líneas 442, 512, 714, 741, 778, 805, 812)

Mismo patrón que P1-1: errores silenciados. Algunos son de localStorage (OK), otros de fetch (mal).

**Fix:** auditar caso por caso; localStorage puede quedar; fetch debe loggear con `logger.warn` y mostrar toast.

### P2-5 · `validateForNewFiado` regla 1 confusa

**Archivo:** `lib/db/fiados.db.ts:117, 151`

Doc-comment dice "Bloqueo si tiene >= 3 fiados con status VENCIDO" pero el test dice "Regla 1: máx 2 vencidos". Coherente (3 bloquea = max 2 permitido) pero confuso. Renombrar test a "Regla 1: bloquea con 3+ vencidos" o documentar mejor.

### P2-6 · Cobro inteligente no avisa de overpayment al cajero

**Archivo:** `app/api/fiados/cobrar/route.ts:55-60`

Devuelve `remaining` en el body pero la UI (`POSFiadoPanel.handleCobrar`) ni lo lee. Si el cajero cobra S/100 a un cliente con deuda S/70, el backend cobra S/70 + remaining=30 → el cajero cree que cobró S/100. **Trabajo manual de devolución no documentado.**

**Fix:** UI debe mostrar toast "Cobramos S/70, te sobran S/30 — devolver al cliente o usar para nuevo fiado".

---

## Vínculos detectados (16 archivos)

| Consumidor | Cómo usa fiados | Riesgo si Fiados cambia |
|---|---|---|
| `POSView` + `POSFiadoPanel` + `POSCustomerSearch` | `/fiado-resumen`, `/cobrar` | Alto — cajero ve deuda en tiempo real |
| `TreasuryDashboard` | `/api/fiados` lista | Alto — KPI dashboard tesorería (P0-1) |
| `unified/FinanzasModule` | `kpis-v2.fiadosVencidosMonto` | Medio |
| `unified/MetasLogrosModule` | lista para gamification | Bajo |
| `AccountsReceivableTab` + `PaymentCalendarView` | calendario cobros | Alto |
| `ScoringCrediticioTab` + `analytics/FiadoAnalyticsPanel` | score crediticio | Medio |
| `fiados/CobranzaInteligente` + `FiadoStats` + `FiadoModals` + `FiadoFormModal` + `FiadoTendenciaCobroChart` | propios | Alto |
| `ai-center/sections/FiadosSection` | recomendaciones AI | Bajo |
| `notifications/NotificationItem` | tipos de notif | Bajo |
| `AdminSidebar` | navegación | Bajo |
| 2 crons (`fiados-reminder`, `fiados-mark-vencido`) | recordatorios + status auto | Medio |

---

## Tests faltantes propuestos

| Test | Prioridad | Cobertura nueva |
|---|---|---|
| `treasury-dashboard-status-counter.test.tsx` | P0 | Verifica que filter use UPPERCASE |
| `fiados-quick-create-by-phone.test.ts` | P0 | Bloquea creación si nombre matchea >1 customer |
| `fiados-pagar-race-conflict.test.ts` | P1 | 5 cobros paralelos → expect 409 (no 503) en perdedor |
| `fiados-cobrar-remaining-ui.test.tsx` | P1 | UI muestra remaining cuando >0 |
| `fiados-getList-503-on-error.test.ts` | P1 | Cambiar `200 []` → `503 {error}` |
| `fiados-db-customer-lookup-tenant.test.ts` | P2 | `list()` filtra customers por tenantId |

---

## Plan de fix sugerido (priorizado)

1. **Hot-fix P0** (1 commit, ~30 LOC):
   - TreasuryDashboard:309 `"pagado"` → `"PAGADO"`
   - FiadosModule quickFiado → exigir teléfono o usar autocomplete con phone PK
   - Tests específicos de regresión para ambos

2. **Robustez P1** (1 commit, ~80 LOC):
   - POSFiadoPanel: error handling + toast
   - GET /api/fiados: 503 con retryable: true
   - POST /pagar y /cobro-masivo: detectar P2034 → 409
   - cobro-masivo: migrar a FiadosDB.cobroMasivo (regla #1)
   - fiado-resumen: migrar a FiadosDB.resumenByCustomer (regla #1)

3. **Calidad P2** (1 commit, ~60 LOC):
   - FiadosDB.list: include customer relation directa
   - lookup customers con tenantId (anti TD-040 Phase 3)
   - registerPago findUnique con tenantId
   - Cobrar UI: mostrar remaining
   - Limpiar catch ignored en FiadosModule

**ETA total:** ~2h con tests.

---

## Smoke ejecutado

```text
mi-pollo.localhost:3000 (qaadmin/Qa-admin-1234)
✓ Login OK (tenantId cmoevpwfk0000l4vzwq6revm5)
✓ GET /api/fiados → [] HTTP 200
✓ GET /api/fiados?status=ACTIVO → [] HTTP 200
✓ GET /api/analytics/fiado-analytics → estructura completa, totales 0
✓ GET /api/customers/abc/fiado-resumen → 400 "Teléfono inválido"
✓ POST /api/fiados (cliente nuevo 987654321, S/120.50, fechaVence) → 201
✓ POST /api/fiados/{id}/pagar S/50 → saldo 70.5, ACTIVO, 1 cuota
✓ GET /api/customers/987654321/fiado-resumen → montoPendiente=70.5
✓ POST /api/fiados/cobrar S/70.50 → totalCobrado=70.5, remaining=0
✓ Detalle final → saldo=0, status=PAGADO, 2 cuotas
✓ Overpayment a cliente sin activos → 404
✓ Race 5 cobros concurrentes → sin overpayment (decrement atómico) · 1 HTTP 503 (debería ser 409)

Tests: 27 passed (fiados-db-business-logic + api-fiados-cobrar), 950ms
```
