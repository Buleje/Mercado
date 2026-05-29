# Planes pendientes módulo forestal — SUNAT + PWA offline

> Investigación 2026-05-28 (Batch 4, frente B/D). Read-only research; NO implementado aún.
> Estos dos frentes se difirieron por riesgo (zona de peligro facturación / app-shell PWA).

---

## PLAN 1 — Despacho de producto forestal → comprobante SUNAT

### Mapa de capas SUNAT (verificado)
| Capa | Archivo | Rol |
|---|---|---|
| HTTP client | `lib/sunat/nubefact-client.ts` | `sendInvoice()` → Nubefact. **Funciona** |
| Payload builder | `lib/sunat/invoice-builder.ts` | `buildBoleta()`, `buildFactura()` |
| Facade alto nivel | `lib/integrations/sunat.ts` | `emitirBoleta()`, `emitirFactura()` — orquesta rate-limit + idempotencia + SunatDB |
| Route admin (legacy) | `app/api/sunat/emit/route.ts:84` | usa `prisma.order` directo (viola regla #1) + `sendInvoice()` directo → causa 401/404 |
| Worker de cola | `lib/sunat/invoice-worker.ts` | `runSunatWorker()` + `initSunatWorkerSubscription()` |
| EventBus | `lib/sunat/sale-events.ts` | `sunatEventBus.emitSaleCreated()` |

### Bugs confirmados
- **Worker no suscrito (P0):** `initSunatWorkerSubscription()` (`lib/sunat/invoice-worker.ts:280`) **nunca se llama en `instrumentation.ts`**. El bus es un EventEmitter en memoria → sin suscriptor, los eventos de `emit-on-sale` se pierden silenciosamente. **Fix de 1 línea** que repara la emisión automática de TODAS las ventas (no solo forestal).
- **Cliente legacy:** `app/api/sunat/emit/route.ts` usa prisma directo + `sendInvoice()` directo en vez de la facade `lib/integrations/sunat.ts`.

### Camino seguro (NO crear endpoint nuevo de emisión)
```
ForestCtpDB.create(section="despacho")
  → reusar lib/integrations/sunat.ts :: emitirBoleta()/emitirFactura()  (idempotencia por orderId=entry.id)
  → guardar sunatInvoiceId en el entry
```
**Gap:** `ForestCtpEntry` no tiene precio/cliente. Requiere migración: `precioUnitario`, `totalVenta`, `clienteRuc/Dni/Nombre`, `sunatInvoiceId`, `tipoComprobante` (todas NULLABLE).

### Plan paso a paso
1. **Hotfix P0:** agregar `initSunatWorkerSubscription()` en `instrumentation.ts` (bloque `NEXT_RUNTIME === "nodejs"`). Repara emisión automática general.
2. Migración: campos precio/cliente/comprobante en `ForestCtpEntry` (+ `ForestLothEntry` despacho_producto).
3. `ForestCtpDB.create()`: tras crear, si `tipoComprobante !== "ticket"` y precio > 0 → `emitirBoleta/Factura()`, await el update con `sunatInvoiceId`.
4. UI form despacho: campos precio, tipo comprobante, DNI/RUC (solo si ≠ ticket).
5. Test en sandbox Nubefact → verificar `SunatInvoice.status="accepted"`.

### Riesgos
- Doble emisión → mitigado por idempotencia `orderId=entry.id` ya implementada.
- Correlativo se quema con precio 0 → validar precio > 0 antes de emitir.
- Zona de peligro (facturación): hacer en PREVIEW primero.

---

## PLAN 2 — PWA offline para captura de campo (LO-TH)

### Estado PWA actual (sólido)
| Componente | Estado |
|---|---|
| Service Worker | **Activo** — `public/sw.js` vanilla JS v15 (sin Workbox) |
| Registrar | `components/ServiceWorkerRegistrar.tsx` (off en dev) |
| Manifest | `app/manifest.ts` dinámico tenant-aware |
| Background Sync | parcial — `sync-pos-sales` para ventas POS (`sw.js:311`) |
| IndexedDB | parcial — DB `buleje-offline` store `pendingSales` (`sw.js:338`) |

**El patrón base ya existe** (POS offline). Falta replicarlo para `ForestLothEntry`.
**Gap:** el SW ignora `/admin` (`sw.js:165`) → el form de campo vive en `/admin/forestal`, necesita manejo propio del shell.

### Plan paso a paso (MVP primero)
1. `sw.js openOfflineDB()`: bump a v2, agregar store `pendingLothEntries` (idempotente con `objectStoreNames.contains`).
2. `sw.js` handler `sync` tag `sync-loth-entries` → `syncLothEntries()` (POST `/api/admin/forestal/loth`).
3. Pre-cache shell `/admin/forestal` en `install`.
4. `hooks/useOfflineLothQueue.ts`: `enqueue/getPending/syncNow/markSynced` + auto-sync en evento `online`.
5. `LothEntryForm`: banner "Sin conexión — guardando localmente"; submit offline → encolar + toast; badge con count pendiente.
6. **Fase 2:** Background Sync real + foto offline (base64 en IndexedDB) + GPS auto.

### Riesgos
- Bump IndexedDB v1→v2 sin borrar `pendingSales` → guard con `contains()`.
- Background Sync no soportado en iOS Safari → sync manual como MVP.
- Cache shell stale → cache-first solo shell, JS con hash inmutable.
