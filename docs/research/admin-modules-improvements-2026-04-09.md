# Admin Modules — Research de mejoras 2026-04-09

> **Scout:** ADMIN-MODULES-SCOUT (general-purpose research agent)
> **Scope:** 17 módulos del sidebar + 4 categorías especiales (documentos, marketplace, mi-tienda, config).
> **Lectura base:**
> - `app/admin/_lib/tab-categories.ts` (17 BASIC_MODULES + TIENDA + CONFIG)
> - `app/admin/page.tsx` (281 líneas, post-refactor Sesión 2)
> - `components/admin/unified/*` (29 módulos "unificados" con dashboard + tabs internos)
> - `lib/db/*.db.ts` (41 DB classes)
> - `lib/forecasting/`, `lib/credit/`, `lib/churn/`, `lib/recommendations/` (motores de IA heurística existentes)
> - `docs/TECH-DEBT.md` y `docs/ROADMAP-24-WEEKS.md`

---

## 📊 Mapa de módulos (estado actual)

Leyenda: 🟢 sólido · 🟡 parcial (funciona pero le faltan features clave) · 🔴 débil

### Módulos de negocio core

| Módulo | Archivo principal | Estado | Nota clave |
|---|---|---|---|
| **asistente-ia + analytics-pro** | `AICommandCenter`, `AnalyticsProDashboard`, `RFMSegmentationPanel` | 🟢 | RFM ya implementado (API `/api/customers/rfm` + panel); HITL aprobaciones activas |
| **ventas-caja (POS)** | `POSCajaModule` + `components/admin/pos/*` (26 componentes) | 🟢 | POS muy rico: offline queue, kiosco, voice, express, split payment, bundles, fiados directo, metrics strip |
| **pedidos** | `OrdersTab/` dir | 🟢 | Centraliza pedidos WhatsApp + online + mostrador |
| **inventario** | `InventarioAlmacenesModule`, `BatchesTab`, `KardexTab`, `ExpiryAlertsDashboard` | 🟡 | Stock/kardex/lotes/vencimientos OK; falta **FEFO real enforceado** en salida de venta, conteo cíclico ABC, valuación PEPS/promedio |
| **productos** | `ProductsAdminTab`, `PriceSchedulerTab`, `PromotionsTab` | 🟢 | Bulk editor, price history, scheduler, barcode, QR, competitor tracker |
| **compras** | `ComprasModule` + `components/admin/compras/*` | 🟡 | Tiene CxPCalendar, SupplierScorecard, SupplierComparator, SugerenciasCompraTab; **falta receiving con 3-way-match y ASN, RFQ masivo** |
| **plata (finanzas)** | `FinanzasModule` (1000+ líneas) | 🟡 | P&L, gastos, rentabilidad, presupuesto, cash flow, break-even, money leak detector, historial cierres; **falta conciliación bancaria real, balance general, libro mayor, flujo caja *real* proyectado 13 semanas** |
| **clientes (CRM)** | `CRMClientesModule` + `Customer360Tab`, `CustomerHeatmap`, `CustomerGeoMap`, `ChurnPrediction`, `AutoSegments` | 🟡 | Dashboard muy visual, RFM API ya existe pero **NO está integrada al CRMClientesModule** — vive aislada en `analytics/RFMSegmentationPanel` |
| **fiados** | `FiadosModule`, `CobranzaInteligente` (escalado 4 niveles WhatsApp) | 🟢 | Escalado automático nivel 1-4 implementado, bien resuelto |
| **turnos** | `TurnosModule`, `ShiftControlTab`, `CashAuditTab`, `ShiftHandover` | 🟢 | Apertura/cierre con conteo, handover, ranking cajero |
| **recetas** | `RecetasModule`, `RecetarioAdminTab` | 🔴 | Solo CRUD de recetas + lotes producidos. **NO calcula costo por receta, NO descuenta ingredientes de stock, NO tiene margen vs precio de venta** |
| **prestamos** | `PrestamosModule` + `PrestamoTimeline`, `LoanCalculator` | 🟢 | 3 sistemas amortización (Francés/Alemán/Americano), mora, cuotas, documentos |
| **auditoria** | `AuditLogTab`, `AuditTrailModule` | 🟡 | Log hay; falta dashboard de **anomalías con ML** (hay `AnomalyDetectionTab` pero no conectado al flujo) |
| **devoluciones-proveedor** | `DevolucionesProveedorModule` | 🟡 | Funcional pero sin workflow de aprobación ni motivo tipificado |
| **tesoreria** | `TesoreriaModule` + `TreasuryDashboard`, `CheckManagementTab`, `BankReconciliationTab` | 🟡 | Tiene vistas; **conciliación bancaria es UI sin backend real ligado a extractos CSV/OFX** |
| **promociones** | `PromotionsTab`, `CouponsTab`, `FlashSaleCreator`, `BundlesTab` | 🟢 | Cupones, flash sales, bundles, volume discounts, gift cards, A/B tests |
| **scoring** | `ScoringCrediticioTab` + `lib/credit/scoring-engine.ts` | 🟢 | Engine de 5 factores (historial, puntualidad, ticket, antigüedad, loyalty); **7 TODOs** pendientes en el Tab |

### Módulos transversales (IA & analítica)

| Módulo | Estado | Nota |
|---|---|---|
| `AnalyticsProModule` (`BCGMatrix`, `ABCAnalysis`, `Pareto`, `PeakHours`, `BasketAnalysis`, `CLV`) | 🟢 | Muy rico; problema es que vive lejos del módulo que lo necesita (ABC debería estar dentro de Inventario) |
| `ChurnPrediction` + `lib/churn/health-scorer.ts` | 🟡 | Score existe por tenant (B2B), **falta churn por cliente B2C en el CRM** |
| `DemandPrediction` + `lib/forecasting/demand-predictor.ts` | 🟡 | Motor de media móvil ponderada; **falta estacionalidad real y weather-aware (WeatherDemandPredictor es mock)** |
| `SmartReorderCard` + `lib/forecasting/auto-reorder.ts` | 🟡 | Cálculo existe, no dispara OC automática |

---

## 🎯 Mejoras de alto impacto — Top 18

| # | Módulo | Mejora | Tipo | Impacto | Esfuerzo | Prio |
|---|---|---|---|---|---|---|
| 1 | CRM | Integrar `RFMSegmentationPanel` dentro de `CRMClientesModule` (tab "Segmentos") + accionar campañas masivas por segmento | completar | 🔴 alto | S | P0 |
| 2 | Finanzas | **Flujo de caja rodante 13 semanas** real (ingresos cobrados + payables por vencer + fiados por cobrar + nómina + AR aging) | nueva | 🔴 alto | M | P0 |
| 3 | Inventario | **FEFO enforceado** en venta/despacho: bloquear selección de lote nuevo si hay lote próximo a vencer | completar | 🔴 alto | M | P0 |
| 4 | Recetas | **Calculadora de costo-por-receta** que lea precios actuales de productos + descuente stock al producir lote + margen vs precio venta | nueva | 🔴 alto | M | P0 |
| 5 | Compras | **Orden de compra sugerida automática** desde `lib/forecasting/auto-reorder.ts` → crea OC draft con proveedor preferido + cantidad óptima | completar | 🔴 alto | M | P0 |
| 6 | CRM / Churn | **Churn B2C por cliente final**: score de riesgo por customer + tab "En riesgo" con acciones (cupón recuperación, WhatsApp) | nueva | 🔴 alto | M | P1 |
| 7 | Inventario | **Conteo cíclico ABC**: auto-genera hoja de conteo semanal/mensual, prioriza SKUs A > B > C | nueva | 🟠 medio | M | P1 |
| 8 | Finanzas | **Conciliación bancaria real** (upload CSV/OFX → match automático contra movimientos internos con tolerancia de S/0.50) | completar | 🔴 alto | L | P1 |
| 9 | POS | **Modo offline-first completo**: `usePOSOffline` existe pero no usa IndexedDB persistente para carritos + sincroniza al volver online | completar | 🟠 medio | M | P1 |
| 10 | Scoring Crédito | Resolver los 7 TODOs del `ScoringCrediticioTab` (re-score automático post-venta, historial de cambios, explicabilidad) | completar | 🟠 medio | S | P1 |
| 11 | Compras | **Scorecard proveedor visible en PuntoDeCompraTab** (hoy vive aislado en un tab propio) + alerta roja si gradeD al crear OC | completar | 🟠 medio | S | P1 |
| 12 | Admin transversal | **Export universal CSV/Excel/PDF** — hoy 20+ tabs implementan su propio export. Crear `useTableExport()` hook + botón estándar en `AdminModuleHeader` | completar | 🟠 medio | M | P1 |
| 13 | Admin transversal | **Quick actions por módulo** en Command Palette (Ctrl+K) — hoy es solo navegación. Añadir "Registrar gasto", "Nueva venta", "Cobrar fiado", "Crear OC" | expansión | 🟠 medio | S | P1 |
| 14 | Analytics | Mover `ABCAnalysisTab` + `ExpiryDashboard` a **dentro** del módulo Inventario (hoy están sueltos en Analytics-Pro) | completar | 🟠 medio | S | P2 |
| 15 | Finanzas | **Libro mayor automático** (asientos dobles por cada venta/compra/gasto/fiado/préstamo) — foundation para balance general contable real | nueva | 🔴 alto | XL | P2 |
| 16 | Loyalty | **Persistir `LoyaltyTransaction`** (TD-030 abierto) — hoy solo se guarda el balance, no el historial de puntos acumulados/canjeados | completar | 🟠 medio | S | P1 |
| 17 | Admin mobile | **Bottom bar móvil real con 5 accesos directos** (POS / Fiados / Pedidos / Inventario / Más) — `AdminMobileBottomBar` existe pero poco usado | completar | 🟠 medio | S | P1 |
| 18 | Admin transversal | **Empty states accionables** en módulos vacíos: hoy solo CRM lo hace. Inventario/Compras/Fiados/Recetas muestran tabla vacía | expansión | 🟡 bajo | S | P2 |

---

## 📝 Detalle por cada mejora

### 1. CRM — Integrar RFM + campañas por segmento

**Tipo:** completar
**Impacto:** Duplicar la efectividad del módulo CRM. Hoy hay DOS implementaciones de RFM que no se hablan: `app/api/customers/rfm/route.ts` (7 segmentos, cuartiles, 124 líneas) y `components/admin/analytics/RFMSegmentationPanel.tsx` (6 segmentos, thresholds hardcoded). Ninguna está cableada al CRMClientesModule que es donde el usuario realmente busca clientes. Un dueño de bodega puede ver VIPs/En-riesgo en Analytics Pro pero no puede actuar desde ahí.
**Esfuerzo:** S (1 sesión)
**Prio:** P0
**Qué es:** agregar un tab "Segmentos RFM" en `CRMClientesModule.tsx` que consuma `/api/customers/rfm`, muestre cards por segmento con conteo + LTV promedio, y al click abra `MassMessageSender` preconfigurado con el segmento.
**Por qué:** activa la feature más rentable del CRM (reactivación de "En riesgo" y "Dormido") sin escribir motor nuevo — el motor ya existe.
**Cómo:**
- Añadir tab `"segmentos-rfm"` al array `TABS` de `CRMClientesModule.tsx:41`.
- Reutilizar `RFMSegmentationPanel` o crear `CRMSegmentosRFMTab` que fetchee `/api/customers/rfm`.
- Botón por segmento → `navigateTab("mensajes")` con `prefilledSegment` en query.
- `MassMessageSender.tsx` acepta ya filtros; pasar `segment=en_riesgo` como pre-filtro.
**Riesgos:** duplicación de lógica RFM (dos thresholds distintos). Unificar a una sola fuente: borrar la del panel, dejar la del endpoint.
**Dependencias:** ninguna. El schema de `Order.customerPhone` ya existe.

---

### 2. Finanzas — Flujo de caja rodante 13 semanas

**Tipo:** nueva
**Impacto:** Es el reporte #1 que pide cualquier dueño de bodega: "¿cuánto dinero voy a tener dentro de 2 semanas?". Hoy el `CashFlowProjection.tsx` proyecta solo 30 días sin incluir AR aging, payables reales ni nómina.
**Esfuerzo:** M (2 sesiones)
**Prio:** P0
**Qué es:** tabla 13 semanas × (Saldo inicial · Cobros esperados · Fiados a cobrar · Pagos proveedores · Nómina · Préstamos · Saldo final). Colores: rojo si cae a negativo cualquier semana.
**Por qué:** anti-crisis de liquidez. Sin esto, el dueño descubre que no tiene para la planilla del viernes el mismo viernes.
**Cómo:**
- Crear `app/api/finance/cashflow-rolling/route.ts` que combine:
  - `purchases.db` → payables con `dueDate` próximos 13 semanas.
  - `fiados.db` → cuotas con `fechaVence` próximas.
  - `orders.db` + `sales.db` → histórico últimos 13 semanas para proyectar ingresos (media móvil).
  - `prestamos.db` → cuotas propias a pagar.
  - `treasury.db` → nómina recurrente si existe.
- Crear `CashFlowRollingTab.tsx` en `components/admin/finanzas/` con tabla + chart de línea.
- Agregar tab "Flujo 13 semanas" dentro de `FinanzasModule` → `flujo-caja`.
**Riesgos:** proyección de ventas requiere historial mínimo de 8 semanas. Fallback a cash-only si no hay datos.
**Dependencias:** `lib/forecasting/demand-predictor.ts` puede reusarse para el lado de ingresos.

---

### 3. Inventario — FEFO enforceado en venta

**Tipo:** completar
**Impacto:** Pérdida real por vencimientos. Hoy `BatchesTab` muestra vencimientos pero el POS no elige automáticamente el lote más cercano a vencer. En bodega con perecibles (lácteos, embutidos), esto genera S/200-500/mes de merma evitable.
**Esfuerzo:** M (2 sesiones)
**Prio:** P0
**Qué es:** al vender un producto con lotes múltiples, el backend selecciona el lote con `expiryDate` más cercano y > hoy. UI del POS muestra qué lote se descontó.
**Cómo:**
- Modificar `lib/db/sales.db.ts` función de descuento de stock: si producto tiene lotes, hacer `batches.db` findMany ordered by `expiryDate asc` y descontar del primero con stock.
- Alerta en `PuntoCompraView` si el lote elegido vence < 7 días: "⚠ Este producto vence pronto — considera ofrecer descuento".
- Config por producto: `productos.forceFEFO = true/false` (algunos no aplican — abarrotes secos).
**Riesgos:** rompe la app POS offline si no hay datos de lote. Fallback: si offline → FIFO por createdAt.
**Dependencias:** `batches.db.ts` ya expone la data necesaria. `products.db` necesita flag nuevo `useFEFO`.

---

### 4. Recetas — Calculadora de costo real + descuento stock

**Tipo:** nueva
**Impacto:** El módulo Recetas hoy es básicamente un recetario "bonito" para mostrar en la tienda. No sirve para el negocio: no calcula costo, no descuenta ingredientes, no da margen. Para una bodega que produce (jugos, sanguches, ceviche, desayunos), esto es el módulo más inútil del panel.
**Esfuerzo:** M (2 sesiones)
**Prio:** P0
**Qué es:**
- Cada receta calcula `costoTotal` = Σ(ingrediente.cantidad × producto.currentCost).
- Al registrar producción de un lote: descuenta los ingredientes de stock vía `InventoryMovement type = "receta_produccion"`.
- Muestra margen: `precioVenta - costoTotal / precioVenta * 100`.
**Cómo:**
- `components/admin/recetas/RecetarioAdminTab.tsx` ya tiene `Ingrediente.productoId` opcional. Forzarlo.
- Crear endpoint `POST /api/recetas/[id]/produccion` que:
  - Valida stock suficiente de todos los ingredientes.
  - Crea `InventoryMovement` negativos por cada ingrediente.
  - Crea `InventoryMovement` positivo por el producto resultante (si existe).
  - Registra el lote producido con `costoCalculado` congelado.
- Añadir columnas `costoTotal`, `margen` a la UI del `RecetarioAdminTab`.
- `RecetasModule.tsx` dashboard: KPI "Margen promedio de recetas", alerta si alguna < 20%.
**Riesgos:** recetas con ingredientes "productos artesanales" sin costo de compra registrado. Solución: warning + sugerir costo manual.
**Dependencias:** `recetas.db.ts` necesita campo `costoCalculado` y `ProductionBatch` necesita FK a receta.

---

### 5. Compras — OC sugerida auto-creada desde auto-reorder

**Tipo:** completar
**Impacto:** `lib/forecasting/auto-reorder.ts` calcula reposición sugerida pero nadie crea la OC automáticamente. El dueño tiene que re-escribirla a mano. Automatizar esto ahorra 1-2 horas/semana.
**Esfuerzo:** M (1-2 sesiones)
**Prio:** P0
**Qué es:** cron diario que revisa stock vs ROP (reorder point) y si hay productos por debajo, crea una OC en estado `draft` agrupada por proveedor preferido del producto. Notificación WhatsApp al dueño: "Tienes 3 OC sugeridas para revisar".
**Cómo:**
- Worker en `lib/workers/` o cron en `app/api/cron/auto-reorder-oc`.
- Consumir `autoReorder()` de `lib/forecasting/auto-reorder.ts`.
- Agrupar por `product.preferredSupplierId`.
- Crear `PurchaseOrder` en `draft` via `purchases.db.ts`.
- Integrar con `SugerenciasCompraTab` ya existente: mostrar OCs draft pendientes de aprobar.
**Riesgos:** spam de OCs. Mitigación: sólo crear una OC/proveedor/semana máximo.
**Dependencias:** `products` necesita `preferredSupplierId` + `reorderPoint` + `safetyStock` (ya existen en el schema).

---

### 6. CRM — Churn B2C por cliente final

**Tipo:** nueva
**Impacto:** `lib/churn/health-scorer.ts` existe pero mide churn **B2B** (tenants que dejan de usar la plataforma). No hay churn por cliente final de la bodega. El CRM tiene `ChurnPrediction.tsx` pero es un widget UI sin backend real.
**Esfuerzo:** M (2 sesiones)
**Prio:** P1
**Qué es:** score 0-100 por cliente basado en:
- Días desde última compra vs su promedio histórico (señal fuerte).
- Reducción de ticket medio últimos 30d vs 90d.
- Drop en frecuencia semanal.
- Quejas / NPS bajo si existe.
**Cómo:**
- Crear `lib/churn/customer-churn.ts` reusando el patrón de `health-scorer.ts`.
- Endpoint `GET /api/customers/[phone]/churn-score`.
- Tab "En riesgo" dentro del CRMClientesModule con lista ordenada + 1 click → enviar cupón recuperación por WhatsApp.
- Cron diario que marca clientes con score > 70 como `atRisk = true`.
**Riesgos:** falsos positivos en clientes estacionales. Añadir `seasonality` al modelo (comprar 1×/mes es normal para algunos).
**Dependencias:** MassMessageSender + templates de recuperación en `WhatsAppTemplates.tsx`.

---

### 7. Inventario — Conteo cíclico ABC

**Tipo:** nueva
**Impacto:** evita el conteo físico anual maratónico (cierra la bodega un día completo). Contar A (20% SKUs, 80% ventas) cada 2 semanas, B mensual, C trimestral.
**Esfuerzo:** M (2 sesiones)
**Prio:** P1
**Qué es:** generador automático de hojas de conteo priorizadas por clase ABC (ya existe `ABCAnalysisTab`).
**Cómo:**
- Reusar lógica de `ABCAnalysisTab.tsx` para clasificar productos.
- Crear `app/api/inventory/cycle-count/generate?class=A` que emite PDF/Excel con SKUs a contar.
- Tab "Conteo Cíclico" dentro de `InventarioAlmacenesModule`.
- Al cerrar el conteo: auto-crear `InventoryMovement` de ajuste por cada discrepancia + registrar en `ShrinkageTab`.
**Riesgos:** ninguno mayor.
**Dependencias:** `ConteoFisicoWizard.tsx` ya existe — extenderlo.

---

### 8. Finanzas — Conciliación bancaria real (OFX/CSV match)

**Tipo:** completar
**Impacto:** `BankReconciliationTab.tsx` existe pero es UI sin backend real. Sin esto el dueño nunca sabe si el efectivo del día cuadra con el depósito bancario.
**Esfuerzo:** L (3 sesiones)
**Prio:** P1
**Qué es:** upload de extracto bancario (CSV BCP/Interbank/BBVA) → match automático contra movimientos de caja + fiados cobrados + depósitos, con tolerancia S/0.50. UI muestra "no conciliado" en rojo.
**Cómo:**
- Parser en `lib/finance/bank-statement-parser.ts` soportando los 3 formatos mayores peruanos.
- Tabla `BankStatement` + `BankTransaction` en schema (nueva migración).
- Algoritmo de match: fecha ± 2 días + monto ± S/0.50 + descripción fuzzy (string-similarity).
- UI: split view "banco | sistema" con botón "conciliar" por fila.
**Riesgos:** formatos CSV peruanos cambian. Hacer el parser por perfil ("BCP", "Interbank", "Generic").
**Dependencias:** migración nueva de DB (ADR requerido).

---

### 9. POS — Offline-first persistente (IndexedDB)

**Tipo:** completar
**Impacto:** cortes de internet en Pucallpa son frecuentes. El POS hoy tiene `usePOSOffline` pero al cerrar la pestaña se pierde el carrito.
**Esfuerzo:** M (2 sesiones)
**Prio:** P1
**Qué es:** persistir carritos abiertos + ventas pendientes de sincronizar en IndexedDB.
**Cómo:**
- Reusar `lib/indexeddb-cart.ts` (ya existe para el storefront) y extender para POS.
- `components/admin/pos/usePOSOffline.ts` → `db.pos.carts.put()` en cada cambio.
- Al reconectar: flush queue hacia `/api/sales` con idempotency key.
- Badge naranja en POS: "X ventas pendientes de sincronizar".
**Riesgos:** conflictos de stock si mismo producto se vende en 2 dispositivos offline. Mitigación: lock optimista + resolver al sync.
**Dependencias:** `pos-offline-queue.ts` ya existe — conectarlo a IndexedDB.

---

### 10. Scoring Crédito — Resolver 7 TODOs abiertos

**Tipo:** completar
**Impacto:** el motor de scoring ya está (`lib/credit/scoring-engine.ts`, 5 factores) pero tiene 7 TODOs visibles en `ScoringCrediticioTab.tsx`. Completarlos desbloquea fiado digital (Ola 2, ADR 021).
**Esfuerzo:** S (1 sesión)
**Prio:** P1
**Qué es:** resolver los 7 `// TODO:` en el Tab:
- Re-score automático post-venta (hoy es manual).
- Historial de cambios de score visibles por cliente.
- Explicabilidad: "¿por qué mi score bajó?" con breakdown.
- Botón "Recalcular todos" con progress bar.
**Cómo:** grep `TODO` en `components/admin/ScoringCrediticioTab.tsx` + `app/api/credit/score-history/[customerId]/route.ts` (ya existe el endpoint).
**Riesgos:** ninguno.
**Dependencias:** TD-030 abierto (LoyaltyTransaction) — el scoring lee loyalty points pero sin historial.

---

### 11. Compras — Scorecard proveedor en PuntoDeCompraTab

**Tipo:** completar
**Impacto:** `SupplierScorecard.tsx` ya existe con 5 métricas y grade A-D pero solo se ve en el tab "Proveedores". Al crear una OC, no hay alerta si el proveedor tiene grade D (retrasa, no cumple). Decisión a ciegas.
**Esfuerzo:** S (1 sesión)
**Prio:** P1
**Qué es:** en `PuntoDeCompraTab.tsx` al seleccionar proveedor mostrar mini-scorecard (grade + 2 métricas críticas: on-time %, completion %). Si grade D → warning modal.
**Cómo:**
- Importar `SupplierScorecard` en `components/admin/compras/PuntoDeCompraTab.tsx`.
- Crear versión compacta `SupplierScorecardMini.tsx` (solo grade circle + 2 barras).
- Fetchear al cambiar `supplierId`.
**Riesgos:** ninguno.
**Dependencias:** endpoint `/api/proveedores/[id]/scorecard` ya existe.

---

### 12. Admin transversal — Hook universal `useTableExport()`

**Tipo:** completar
**Impacto:** hay 20+ implementaciones distintas de "exportar a CSV" repartidas en los Tabs. Inconsistencia de formato, bugs por módulo. Un hook unificado elimina deuda y habilita export estándar (CSV + Excel + PDF) en cualquier tab.
**Esfuerzo:** M (2 sesiones)
**Prio:** P1
**Qué es:** hook `useTableExport<T>({ data, columns, filename })` con 3 métodos: `toCSV()`, `toExcel()` (usar `lib/export-excel.ts` que ya existe), `toPDF()` (usar `jspdf`).
**Cómo:**
- Crear `hooks/use-table-export.ts`.
- Añadir botón dropdown "Export" en `components/admin/shared/AdminModuleHeader.tsx` que recibe el hook por props.
- Migrar gradualmente los 20 tabs (empezar por los más usados: `CRMTab`, `PurchaseOrdersTab`, `ExpensesTab`, `BatchesTab`).
**Riesgos:** regresión en exports específicos. Mitigación: tests snapshot del CSV generado.
**Dependencias:** `lib/export-excel.ts` ya existe.

---

### 13. Admin transversal — Quick actions en Command Palette

**Tipo:** expansión
**Impacto:** `AdminCommandPalette.tsx` ya existe (Ctrl+K con navegación + búsqueda de productos/clientes) pero **no ejecuta acciones**. Añadir "Registrar gasto rápido", "Nueva venta manual", "Cobrar fiado", "Crear OC" convierte el admin en 3x más rápido.
**Esfuerzo:** S (1 sesión)
**Prio:** P1
**Qué es:** agregar categoría "Acción rápida" con 8-10 comandos que abren modales existentes sin salir del contexto actual.
**Cómo:**
- Extender `useCommandItems` hook en `app/admin/_hooks/` con items tipo `{ category: "Acción", onSelect: () => openGastoModal() }`.
- Reusar modales existentes (`GastoModal`, `FiadoFormModal`, `OCCreatorModal`).
- Shortcut global: Ctrl+Shift+G = gasto, Ctrl+Shift+V = venta, etc. (ya hay `useKeyboardShortcuts`).
**Riesgos:** conflicto con shortcuts del sistema operativo. Usar Alt+ como alternativa.
**Dependencias:** `AdminCommandPalette.tsx` ya soporta la categoría "Acción" (ver `CATEGORY_ORDER`).

---

### 14. Analytics — Reubicar ABC + Expiry en su módulo natural

**Tipo:** completar
**Impacto:** `ABCAnalysisTab` vive en `AnalyticsProModule` pero conceptualmente pertenece a Inventario. Un dueño de bodega no entra a "Analytics Pro" para hacer conteo cíclico — entra a Inventario. Lo mismo con `ExpiryDashboardTab` (vive separado).
**Esfuerzo:** S (1 sesión)
**Prio:** P2
**Qué es:** mover los tabs dentro del módulo semántico correcto sin romper imports.
**Cómo:**
- Añadir `abc-analysis` y `vencimientos` a los `TABS` de `InventarioAlmacenesModule.tsx`.
- Eliminar del array de `AnalyticsProModule` (o dejarlo como alias hacia Inventario).
- Actualizar `tab-categories.ts` si aplica.
**Riesgos:** breadcrumbs/deep-links rotos. Redirect en `useAdminNavigateEvent`.

---

### 15. Finanzas — Libro mayor automático (foundation contable)

**Tipo:** nueva
**Impacto:** es la base para cualquier reporte contable real (balance general, estado de resultados auditable, cierre contable mensual). Hoy el `BalanceSheetTab` muestra números pero no tiene sustento en partida doble.
**Esfuerzo:** XL (sprint dedicado)
**Prio:** P2 (no urgente pero es lo que separa un ERP real de un dashboard)
**Qué es:** cada venta/compra/gasto/fiado/préstamo genera asientos en Debe/Haber vs un plan de cuentas simplificado (Caja, Ventas, IGV, Clientes, Proveedores, Inventario, Gastos).
**Cómo:**
- ADR nuevo: "Plan de Cuentas Bodega Peruana" con 30-40 cuentas.
- Nueva tabla `AccountingEntry` (fecha, cuenta, debe, haber, refId, refType).
- Trigger hooks en `sales.db.ts`, `purchases.db.ts`, `expenses.db.ts`, `fiados.db.ts` que emiten asientos.
- `lib/finance/chart-of-accounts.ts` con las reglas por tipo de transacción.
- Tab "Libro Mayor" en `FinanzasModule` con filtros por cuenta + rango fechas.
**Riesgos:** alto. Requiere revisión de contador. Activar detrás de feature flag.
**Dependencias:** migración Prisma grande. Bloquea por 1 sprint completo.

---

### 16. Loyalty — Persistir LoyaltyTransaction (TD-030)

**Tipo:** completar
**Impacto:** `docs/TECH-DEBT.md` TD-030: el historial de puntos no persiste, solo balance. Audit loyalty roto. Cliente no puede ver "¿cuántos puntos gané en esta compra?".
**Esfuerzo:** S (1 sesión — el script ya está escrito)
**Prio:** P1
**Qué es:** correr `scripts/apply-td030-loyalty-transaction.ts` + integrar lectura en `LoyaltyTab.tsx`.
**Cómo:**
- Migración `prisma/migrations/<td030>/`.
- Reescribir `app/api/marketplace/loyalty/route.ts` para crear `LoyaltyTransaction` + actualizar balance en transacción.
- Nueva sección "Historial" en `LoyaltyTab.tsx` al seleccionar cliente.
**Riesgos:** ninguno — ya hay script preparado.
**Dependencias:** TD-030 en TECH-DEBT.

---

### 17. Admin mobile — Bottom bar con 5 accesos + modo kiosco

**Tipo:** completar
**Impacto:** un bodeguero en su teléfono necesita 5 cosas: POS rápido, cobrar fiado, registrar gasto, ver pedido nuevo, inventario. `AdminMobileBottomBar.tsx` existe pero no está en el layout principal móvil.
**Esfuerzo:** S (1 sesión)
**Prio:** P1
**Qué es:** bottom bar fija en mobile (viewport < 768px) con 5 iconos + badge de pedidos nuevos.
**Cómo:**
- Verificar si `AdminMobileBottomBar.tsx` está usado en `AdminNavigation` — probablemente no.
- Añadir al final de `AdminMainContent` con `sm:hidden`.
- Configurable: permitir al usuario elegir los 5 accesos desde Config.
- Badge rojo en "Pedidos" si `useNewOrderNotification` tiene pendientes.
**Riesgos:** overlap con swipe gestures existentes.
**Dependencias:** ninguna.

---

### 18. Admin transversal — Empty states accionables

**Tipo:** expansión
**Impacto:** usuario nuevo entra a Inventario, ve tabla vacía, no sabe qué hacer. CRM ya resolvió esto con botón "Importar Clientes". Replicar en los 10 módulos que siguen con tabla vacía.
**Esfuerzo:** S (1 sesión)
**Prio:** P2
**Qué es:** crear `components/admin/shared/EmptyStateAction.tsx` con icono + título + descripción + botón primario (acción contextual) + botón secundario (importar).
**Cómo:**
- Componente base reusable.
- Integrar en: `BatchesTab`, `PurchaseOrdersTab`, `ExpensesTab`, `FiadosModule`, `RecetarioAdminTab`, `SuppliersTab`, `PromotionsTab`, `BundlesTab`, `PrestamosModule`, `ProductsAdminTab`.
- Acciones CTA reales: "Crear primer lote", "Nueva OC", "Registrar gasto", etc.
**Riesgos:** ninguno.

---

## 🏆 Top 5 mejoras que DEBEN arrancarse ya

| # | Mejora | Justificación |
|---|---|---|
| **1** | **CRM + RFM integrado (#1)** | ROI inmediato. La infra ya existe (API + panel). Son 2 horas de cableado que activan reactivación de clientes dormidos — el ingreso incremental más barato del negocio. |
| **2** | **Flujo de caja 13 semanas (#2)** | Es el reporte que **todo dueño pide y ningún competidor peruano da bien**. Loyverse/Alegra no lo tienen. Diferenciador competitivo directo. |
| **3** | **FEFO enforceado en venta (#3)** | Pérdida monetaria medible (S/200-500/mes). Sin esto el módulo Batches es decorativo. Bodega con perecibles lo necesita ya. |
| **4** | **Recetas con costo + descuento stock (#4)** | El módulo Recetas hoy es 100% cosmético. Con esto se vuelve operacional: la bodega puede producir sanguches/jugos y saber margen real. Desbloquea vertical "bodega con cocina". |
| **5** | **OC sugerida auto-creada (#5)** | Ahorra 1-2h/semana al dueño. `auto-reorder.ts` ya calcula — solo falta emitir el draft. Es el tipo de automatización invisible que fideliza al dueño. |

---

## 🔥 Features transversales del panel admin

### Mobile (bodeguero en el teléfono)
- **[#17]** `AdminMobileBottomBar` existe pero no está cableado. Urgente.
- Modo "kiosco móvil": un solo botón gigante "Cobrar ahora" que abre POS directo.
- `useSwipeNavigation` (ya existe) entre módulos del sidebar — mejorar UX feedback.

### Shortcuts de teclado
- `useKeyboardShortcuts` ya expone `navigateTab`, `toggleTheme`, `setSearchOpen`. **Expandir con shortcuts de acción** (ver mejora #13): Alt+G gasto, Alt+V venta, Alt+F fiado, Alt+O OC.
- Cheatsheet visual en `showShortcuts` modal — ya existe, añadir los nuevos.

### Quick actions / bulk operations
- `BulkPriceUpdater`, `BulkInvoiceGenerator`, `BulkWeightCalculator` ya existen pero aislados. **Unificar en "Acciones masivas"** del Command Palette.
- Seleccionar N filas en cualquier tabla → bulk delete / bulk tag / bulk export.

### Export CSV / Excel / PDF
- **[#12]** 20+ implementaciones duplicadas. Consolidar con `useTableExport()` hook.
- `lib/export-excel.ts` ya existe — migrar a ese.
- PDFs: usar `jspdf` que ya está en el bundle (ver `OCPDFExport`, `CatalogPDFGenerator`, `PurchaseOrderPDF`).

### Import masivo
- `ExcelProductImporter`, `ImportCSVTab`, `CustomerImporter` ya existen. **Falta SupplierImporter y ExpenseImporter** (bulk registro de gastos históricos al migrar desde Excel casero).
- Import desde foto de comprobante → `InvoiceScannerModal` ya tiene OCR, solo falta el flujo admin.

### Onboarding del admin nuevo
- `OnboardingWizard` + `OnboardingTour` existen. **Falta onboarding por módulo**: la primera vez que entras a Inventario, un mini-tour de 3 pasos.
- `MorningSummaryModal` ya da resumen del día — puede ser el "daily standup" del dueño.

### Empty states
- **[#18]** Inconsistentes. Un componente base + migración a 10 módulos.

---

## 🧱 Lo que NO tocar

- **`components/checkout/**` + `CheckoutModal.tsx`** — zona peligrosa (ADR 015). Cualquier tocada requiere skill `checkout-flow` + checkout-squad.
- **`lib/auth/role-permissions.ts`** — 26 recursos × 6 roles. Romper acá bloquea módulos completos. Requiere skill `security-auth`.
- **`proxy.ts` + `lib/middleware/**`** — auth + CSP + tenant + rate limit (ADR 014). Intocable sin audit.
- **`prisma/schema.prisma`** — 131 modelos. Requiere DIRECT_URL + migration-planner + ADR. La mejora #15 (libro mayor) lo toca y necesita sprint dedicado.
- **`app/admin/page.tsx`** post-refactor (281 líneas) — NO volver a meter lógica acá, todo va en hooks bajo `_hooks/`.
- **`lib/credit/scoring-engine.ts`** — el engine de 5 factores es la base de Fiado Digital (ADR 021). Completarlo (#10) sí, reescribirlo NO.
- **`lib/db/sales.db.ts`** — core transaccional. La mejora #3 (FEFO) lo toca: requiere tests + idempotency + rollback plan.

---

## 📌 Notas finales del scout

- **Módulo más sólido:** POS (`ventas-caja`). 26 componentes en `components/admin/pos/`, cubre offline/express/fiado/split/voice/kiosco. Nada más que pedirle.
- **Módulo más débil:** **Recetas** (`RecetasModule` + `RecetarioAdminTab`). CRUD cosmético sin cálculo de costos, sin descuento de stock, sin margen. Es el mejor candidato a mejora #4.
- **Oportunidad más sorprendente:** **RFM ya está construido dos veces y no se usa.** Endpoint `app/api/customers/rfm/route.ts` (124 líneas, cuartiles, 7 segmentos) + `analytics/RFMSegmentationPanel.tsx` (6 segmentos distintos) ambos vivos — ninguno enlazado al CRM. Es dinero literalmente tirado: 2 horas de cableado = activar la feature más rentable del CRM.
- **Hallazgo secundario:** `lib/forecasting/auto-reorder.ts` + `lib/forecasting/demand-predictor.ts` están construidos y sin UI que los consuma al 100%. `SmartReorderCard` existe pero no crea OC. Media sesión = ahorro real para el dueño.
- **Deuda importante a respetar:** TD-030 (LoyaltyTransaction) bloquea explicabilidad del scoring. Cerrarlo junto con #16.
- **Alineación con roadmap:** Las mejoras #1, #2, #5 encajan en **Sprint 1 Fundamentos** (Dashboard aggregates + AI Insights). Las #3, #4, #9 caben en **Sprint 3 Pagos + Retención**. La #15 (libro mayor) es material de Sprint 5 o post-roadmap.
