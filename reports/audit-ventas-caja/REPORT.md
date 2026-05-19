# Auditoría completa — Módulo VENTAS-CAJA
**Fecha:** 2026-05-17 · **Branch:** `feat/checkout-payment-proof` · **Tenant test:** `main` · **Auth:** qaadmin

**Alcance:** `/admin?tab=ventas-caja` → componentes (POSCajaModule, POSView 2483L, TurnosModule 2147L, pos/**, SalesHistoryTab, VoiceCommandPOS) + 9 endpoints + 4 DB classes (~1,600 LOC en endpoints).

**Método:** 4 agentes en paralelo (Code Review, Security OWASP, Bug Hunt, QA Plan) + smoke runtime con curl + cookies qaadmin.

---

## Resultado smoke runtime (curl directo)

| # | Caso | Resultado | OK |
|---|------|-----------|----|
| 1 | GET /api/sales autenticado | 200 — items con `costPrice`/`totalCogs` | ✅ |
| 2 | GET /api/sales sin auth | 401 | ✅ |
| 3 | GET /api/admin/transactions sin auth | 401 | ✅ |
| 4 | POST /api/sales/devolucion sin auth | 403 | ✅ |
| 5 | POST /api/sales con `{}` | 400 Zod | ✅ |
| 6 | POST /api/sales sin x-csrf-token | 403 | ✅ |
| 7 | POST con quantity=-5 | 400 ("Too small: >0") | ✅ |
| 8 | POST con price=-100 | 400 ("Too small: >=0") | ✅ |
| 9 | POST 2x con mismo `idempotencyKey` | mismo ID + `_deduplicated:true` | ✅ |
| 10 | **POST con `amountPaid=1`, total=24.9** | **201 — venta creada con `change:-23.9`** | **🔴 BUG** |
| 11 | GET /turnos/fake-id/summary | 404 | ✅ |
| 12 | x-tenant-id ajeno injectado | ignorado, usa sesión | ✅ |
| 13 | Perf last-purchase | 3.6 s | 🟡 lento |
| 14 | Perf transactions?limit=20 | 1.4 s | 🟡 lento |

---

## 🔴 CRÍTICOS — bloquear antes de merge

### C1. Tenant leak `?? "main"` en 3 endpoints
**Archivos:** `app/api/sales/devolucion/route.ts:33`, `app/api/customers/[phone]/fiado-resumen/route.ts:29`, `app/api/customers/[phone]/last-purchase/route.ts:33`
**Bug:** `const tenantId = auth.tenantId ?? "main"`. Si el JWT canónico llega sin `tenantId`, devoluciones y PII de clientes se aplican contra `"main"`. Viola CLAUDE.md regla #3.
**Fix:** copiar patrón de `app/api/admin/transactions/route.ts:52` → `if (!auth.tenantId) return 401`.

### C2. Total persistido tal como llega del cliente (vector de fraude)
**Archivo:** `app/api/sales/route.ts` — `SalesDB.add()` guarda `total` y `totalCogs` directamente del payload, sin recomputar desde `items[].price * quantity` con precios DB.
**Repro:** cajero edita `total` en DevTools → registra venta de S/2000 como S/2.
**Fix:** ignorar `total` del payload, recalcular server-side desde items hidratados con precios de DB (mismo patrón que `/api/orders`).

### C3. `amountPaid < total` aceptado en efectivo
**Confirmado en smoke #10:** venta creada con `change:-23.9`. No hay guard `amountPaid >= total` cuando `payment === "efectivo"` o `split`.
**Consecuencia:** deuda silenciosa, arqueo de turno descuadra sin trazabilidad.
**Fix:** validar en `SaleSchema` (Zod refine) + en handler antes de `SalesDB.add()`.

### C4. QR Yape/Plin con `document.write` sin sanitizar
**Archivo:** `components/admin/pos/POSPaymentModal.tsx:807`
**Bug:** popup imprime QR interpolando `merchantPhone` sin escape. Si el merchant carga teléfono `"><script>alert(1)</script>` → XSS en popup. Además depende de `chart.googleapis.com` externo (SSRF/CSP).
**Fix:** mover a Server Action / `/api/qr` con whitelist de dominio + `escapeHtml()` en todos los campos del ticket.

---

## 🟠 ALTOS — fix esta semana

### A1. IDOR cajero cierra turno ajeno
**Archivo:** `app/api/turnos/[id]/cerrar/route.ts:24,40-46`
**Bug:** rol `cajero` permitido pero solo valida `tenantId`, no `existing.adminUserId === auth.username`. Cajero malicioso cierra turno de compañero con `cierreEfectivo` falsificado.
**Fix:** scope por `adminUserId` salvo management.

### A2. IDOR cajero ve summary de turno ajeno
**Archivo:** `app/api/turnos/[id]/summary/route.ts:24,30-32`
**Bug:** mismo patrón. Cajero ve `ventasTotal`, top productos y métodos de pago de compañero.
**Fix:** mismo guard que A1. Patrón ya está en `/api/turnos/activo:27-34`.

### A3. IDOR `?cashierId=` en GET /api/sales
**Archivo:** `app/api/sales/route.ts:73-75`
**Bug:** filtro `cashierId` no se cruza contra `auth.username`.
**Fix:** si `auth.role === "cajero"`, forzar `cashierId === auth.username`.

### A4. Rate-limit STRICT pre-auth en POST /api/sales
**Archivo:** `app/api/sales/route.ts:122-128`
**Bug:** `applyRateLimit` corre antes de `requireAdmin`. 11 POST anónimos congelan el POS de toda la bodega (NAT comparte IP).
**Fix:** invertir orden o usar `applyRateLimitWithTenant` post-auth.

### A5. Voice command sin confirmación
**Archivo:** `components/admin/VoiceCommandPOS.tsx:50`
**Bug:** regex `/\b(cobrar|total|pagar|cerrar|terminar|listo|finalizar)\b/` dispara checkout. Decir "ya está listo el cliente" → cobra solo. Sin guard de carrito vacío.
**Fix:** requerir prefijo `"buleje cobrar"` o pedir confirmación visual antes de `onCheckout()`.

### A6. Cierre turno pierde composición de denominaciones
**Archivo:** `components/admin/TurnosModule.tsx:373-376`
**Bug:** UI captura billetes/monedas pero solo envía `cierreEfectivo` agregado. Cero evidencia auditable.
**Fix:** agregar `denomCounts` al body POST + persistir en `Turno.notas` o nueva columna. Validar suma server-side.

### A7. Race condition fiado fuera de transacción
**Archivo:** `components/admin/POSView.tsx:1371-1398`
**Bug:** se crea la `Sale`, luego un 2º fetch crea el `Fiado`. Si el 2º falla (red, 5xx), venta queda sin deuda asociada. Error solo en `console.warn`.
**Fix:** mover creación de fiado dentro del `$transaction` de `SalesDB.add()`. Rollback si falla.

### A8. Fiado sin chequear límite de crédito
**Archivo:** `app/api/sales/route.ts` (handler POST)
**Bug:** `payment === "fiado"` se acepta sin validar `customer.creditBalance + nuevaDeuda <= creditLimit`.
**Fix:** chequear `CustomersDB.getCreditStatus(tenantId, phone)` antes del `SalesDB.add()`.

### A9. Mismatch `cashierId` vs `turno.adminUserId`
**Archivo:** `lib/db/turnos.db.ts:86` + `app/api/turnos/[id]/cerrar/route.ts:53`
**Bug:** `aggregate({ where: { cashierId: existing.adminUserId } })` falla si admin abrió turno asignado a María pero cobró él mismo → `ventasTotal=0` y diferencia gigante.
**Fix:** agregar FK `Sale.turnoId` o validar que `Sale.cashierId === turno.adminUserId` al crear venta.

### A10. KPIs incorrectos cuando >1000 transacciones
**Archivo:** `lib/db/transactions.db.ts:148-153, 270-272`
**Bug:** `source=all` carga `take:1000` × 2 (sales + orders) en RAM; sum/avg se calcula sobre dataset capped → KPIs "Total vendido" y "Ticket promedio" subreportan en silencio.
**Fix:** usar `prisma.sale.aggregate` autoritativo. Banner "KPIs sobre primeros 1000" si `total > MERGE_HARD_CAP`. Bajar cap a 300.

### A11. SalesHistoryTab export loop sin guard
**Archivo:** `components/admin/SalesHistoryTab.tsx:174-194`
**Bug:** `while(true)` hasta 50 páginas. Sin `AbortController`, sin debounce. Doble-click = 100 fetches.
**Fix:** `if (exporting) return` + `AbortController` + `catch (e) { setError(e) }`.

### A12. `/api/customers?limit=500` sin paginación real
**Archivo:** `components/admin/pos/POSPaymentModal.tsx:168-178`
**Bug:** tenants con >500 clientes pierden registros. Sin indicador.
**Fix:** búsqueda server-side por nombre/teléfono + paginación.

### A13. Devolución no incluye `owner` ni `manager` en roles
**Archivo:** `app/api/sales/devolucion/route.ts:30`
**Bug:** `["admin","cajero"]`. Owner real recibe 403.
**Fix:** `["admin","owner","manager","cajero"]`.

---

## 🟡 MEDIOS (12) y 🟢 BAJOS (6) — backlog

Resumen abreviado, detalles en agente reports:

- M1: `idempotencyKey` opcional + sin `cashierId` en dedup → un cajero ve venta ajena con key conocida
- M2: `applyRateLimit` sin `await` en `fiado-resumen` → rate limit silencioso
- M3: Cache no invalidado tras `SalesDB.add/delete`
- M4: ReDoS potencial `?q=%%%` en transactions
- M5: Movimiento de caja / loyalty fire-and-forget sin Sentry capture
- M6: `sales/export` sin rate limit (DoS + extracción masiva 10k filas)
- M7: IGV `/1.18` hardcodeado (no soporta exonerados Loreto)
- M8: `mapTurno(t: any)` + `eslint-disable` injustificado
- M9: VoiceCommand stale closure en `recognition.onend`
- M10: POSPaymentModal `useEffect` deps incompletas (riesgo de bucle)
- M11: TabMultiplexer no usado → re-fetch full al cambiar tab
- M12: `error.message.startsWith(...)` para clasificar business errors (acoplamiento frágil)
- B1-B6: focus trap modales, console.warn en prod, audit `userId=phone`, KPIs subreporte sin banner, preserve keys super-admin contaminan admin tenants, `clienteNombre` de cotización = teléfono.

---

## 📊 Cobertura de tests actual: ~12 %

| Módulo | Cobertura |
|---|---|
| TurnosDB (lib) | 40 % (23 tests) |
| FiadosDB (lib) | 20 % |
| POSView (e2e) | 25 % (sin flujo de venta real) |
| POSPaymentModal | 5 % |
| Devolución / Return | **0 %** ⚠️ (más peligroso) |
| SplitPayment, Voice, Kiosk | **0 %** |
| SalesHistoryTab + transactions.db | **0 %** (nuevos) |

**Tests P0 a escribir (orden):**
1. `__tests__/api-sales-devolucion.test.ts` — refund infinito, refund efectivo cajero, cross-tenant
2. `__tests__/api-turnos-cerrar.test.ts` — race 2×POST → 409, turno ajeno, diferencia
3. `__tests__/api-sales-create.test.ts` — `amountPaid<total`, fiado-sin-límite, idempotency
4. `e2e/pos-checkout-flow.spec.ts` — happy path completo

---

## ✅ Lo que SÍ está bien (no tocar)

- CSRF: 403 si falta `x-csrf-token` ✅
- Zod `safeParse` con mensajes claros ✅
- Anti-TOCTOU en stock (`updateMany` con `gte`) ✅
- Optimistic lock en cierre de turno ✅
- Retry con detección P2002 en correlativo SUNAT ✅
- CSV formula injection bloqueado ✅
- `x-tenant-id` header ajeno se ignora (usa sesión) ✅
- Idempotency funciona cuando se manda key ✅
- Sin `force-dynamic` en routes (cumple CLAUDE.md regla 4 + ADR-019) ✅

---

## 🎯 Top 5 a corregir HOY antes de commit

| Prio | Fix | Esfuerzo | Archivos |
|---|---|---|---|
| 1 | C1: quitar `?? "main"` en 3 routes → return 401 | 5 min | sales/devolucion + 2 customers |
| 2 | C3: validar `amountPaid >= total` server-side | 10 min | `app/api/sales/route.ts` + `SaleSchema` |
| 3 | A1+A2+A3: scope `adminUserId` para cajero en 3 endpoints | 20 min | turnos/cerrar, turnos/summary, sales (GET) |
| 4 | A11: `if (exporting) return` + AbortController en export Excel | 10 min | SalesHistoryTab.tsx |
| 5 | C2: recomputar total server-side desde items hidratados | 30 min | `app/api/sales/route.ts` + sales.db.ts |

**Total estimado:** 75 min para cerrar fraude + tenant leak.

---

## Archivos referencia

- Reports completos: `reports/audit-ventas-caja/REPORT.md` (este)
- Smoke runtime: `reports/audit-ventas-caja/smoke.txt`
- Screenshots: **pendiente** — Playwright shell no instalado. Correr `npx playwright install chromium-headless-shell` o `/preview /admin?tab=ventas-caja --auth` después.

## Comandos para re-correr la auditoría

```bash
# Smoke completo
source /tmp/bsm-auth.env && bash reports/audit-ventas-caja/smoke.txt

# Visual cuando playwright esté instalado
/preview /admin?tab=ventas-caja --auth
/preview /admin?tab=ventas-caja --auth --dark
```
