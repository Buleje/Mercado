# Buleje — Historial de mejoras

> Snapshot histórico extraído de `MEMORIA-PROYECTO.md` el 2026-04-26 para
> mantener MEMORIA viva y compacta. Aquí vive lo *terminado* — listados de
> tabs, roadmap completado, batches y fases ERP. Nada de esto debería
> guiar trabajo nuevo (los listados de tabs ya están en `app/admin/page.tsx`,
> los modelos en `prisma/schema.prisma`, los endpoints en `app/api/`).
>
> Si necesitás contexto **vivo** (decisiones, patrones, gaps), usá MEMORIA-PROYECTO.md.

---

## 1. Panel admin — 133 tabs registradas en `app/admin/page.tsx`

Cada tab se carga con `next/dynamic` + `TabSpinner`. Lista completa por fase:

| # | Tab ID | Componente | Módulo | Fase |
|---|--------|-----------|--------|------|
| 1 | dashboard | DashboardTab | Analytics | Base |
| 2 | pos | POSView | Ventas | Base |
| 3 | inventario | InventoryTab | Inventario | Base |
| 4 | pedidos | OrdersTab | Ventas | Base |
| 5 | proveedores | SuppliersTab | Compras | Base |
| 6 | compras | PurchaseOrdersTab | Compras | Base |
| 7 | cuentas | PayablesTab | Finanzas | Base |
| 8 | caja | CashRegisterTab | Finanzas | Base |
| 9 | clientes | CustomersTab | CRM | Base |
| 10 | promociones | PromotionsTab | Marketing | Base |
| 11 | reseñas | ReviewsTab | CRM | Base |
| 12 | actividad | ActivityLogTab | Auditoría | Base |
| 13-15 | cupones, devoluciones, reportes | — | — | Batch 2 |
| 16-20 | historial-precios, prediccion, entregas, chat, evaluaciones | — | — | Batch 3 |
| 21-24 | fidelizacion, auto-reorden, gastos, combos | — | — | Batch 4 |
| 25 | notificaciones | NotificationsTab | CRM | Batch 5 |
| 26-31 | pagina-inicio, categorias-editor, combos-editor, delivery-horarios, metricas-conversion, permisos-roles | — | CMS/Logística | Session 3 |
| 32-39 | configuracion, usuarios-admin, ab-tests, encuestas, abc-analysis, clv, margenes, segmentos | — | — | Batch 5 |
| 40-49 | metas, tareas, flujos, pl, flujo-caja, cuentas-cobrar, tesoreria, facturacion, impuestos, turnos | — | Finanzas/RRHH | ERP Fase 1 |
| 50-55 | lotes, kardex, almacenes, rrhh, nomina, contratos | — | Inventario/RRHH | ERP Fase 2 |
| 56-62 | presupuestos, centros-costo, conciliacion, documentos, rentabilidad, calidad, activos | — | Finanzas/Calidad | ERP Fase 4 |
| 63-69 | balance-general, auditoria, proyectos, plan-compras, sucursales, seguros, benchmark | — | Finanzas/Estrategia | ERP Fase 5 |
| 70-77 | marketing, crm, bi, mermas, e-facturacion, referidos, devoluciones-avanzadas, soporte | — | Marketing/CRM/BI | ERP Fase 6 |
| 78-87 | portal-proveedor, cotizaciones, calidad-proveedor, aprobacion-compras, recepcion, pagos-proveedor, arqueo-caja, proyeccion-liquidez, cheques, centro-cobros | — | Proveedores/Tesorería | ERP Fase 7 |
| 88-106 | forecast-ventas, anomalias, bcg-matrix, pareto, kanban, transferencias, inventario-fisico, kits, ubicaciones, calendario, break-even, simulador, presupuesto-real, estacionalidad, reorden-dinamico, notas-rapidas, filtros-guardados, recordatorios, plantillas-mensaje | — | Multi | Fase 8 (UX Premium) |
| 107-111 | dashboard-ejecutivo, alertas-automaticas, reglas-negocio, importar-exportar, comparador-periodos | — | Ejecutivo/Automatización | Fase 9 |
| 112-116 | rutas-delivery, flota, seguimiento-envios, costos-envio, logistica-devoluciones | — | Logística | Fase 10 |
| 117-122 | nps, programa-puntos, segmentos-auto, hub-comunicaciones, wish-lists, cliente-360 | — | CRM Cliente | Fase 11 |
| 123-127 | kpi-personalizado, reportes-auto, mapa-calor, tablero-metas, analisis-cesta | — | Analytics/BI | Fase 12 |
| 128-132 | backup-restaurar, logs-seguridad, cumplimiento, webhooks, salud-sistema | — | Plataforma/Legal | Fase 13 |
| 133+ | campañas, comisiones, etiquetas | — | Marketing/RRHH | Fase 14 |

> Para listado autoritativo + componentes exactos: `app/admin/page.tsx`.

---

## 2. Roadmap ERP — Fases completadas (Fases 1-14)

| Fase | Título | Módulos clave |
|---|---|---|
| **1** ✅ | Finanzas & Operaciones Core | P&L, Flujo de Caja, Cuentas por Cobrar, Tesorería, Facturación, IGV, Turnos, Metas, Tareas, Flujos |
| **2** ✅ | Inventario Avanzado & RRHH | Lotes, Kardex, Multi-Almacén, RRHH, Nómina, Contratos Proveedores |
| **3** ✅ | Análisis Avanzado & Automatización | Dashboard Ejecutivo (Fase 9), Auditoría Financiera (Fase 13), Forecast (Fase 8) |
| **4** ✅ | Madurez ERP & Control Empresarial | Presupuestos, Centros Costo, Conciliación Bancaria, Doc Manager, Rentabilidad, QC, Activos Fijos |
| **5** ✅ | Estrategia, Control & Expansión | Balance General, Auditoría Avanzada, Proyectos/CAPEX, Plan Compras, Multi-Sucursal, Seguros, Benchmark |
| **6** ✅ | Marketing, CRM, BI & Soporte | Marketing Automation, CRM Avanzado, BI, Mermas, e-Factura, Referidos, Devoluciones Avanzada, Tickets |
| **7** ✅ | Proveedores, Compras & Tesorería | Portal Proveedor, RFQ, Calidad Prov, Aprobación, Recepción, Pagos Prov, Arqueo, Liquidez, Cheques, Cobros |
| **8** ✅ | Analytics, Operaciones, Finanzas & UX Premium | Forecast Ventas, Anomalías, BCG, Pareto, Kanban, Calendario, Transferencias, Inv Físico, Kits, Ubicaciones, Reorden, Break-Even, Simulador, Pres vs Real, Estacionalidad, Notas, Filtros, Recordatorios, Plantillas + 5 mejoras UX (favoritos, recientes, fuzzy search, modo compacto, modo enfoque) |
| **9** ✅ | Ejecutivo & Automatización | Dashboard Ejecutivo, Alertas Automáticas, Reglas de Negocio, Import/Export, Comparador Períodos |
| **10** ✅ | Logística & Delivery | Rutas Delivery, Flota, Seguimiento Envíos, Costos Envío, Logística Devoluciones |
| **11** ✅ | Experiencia del Cliente | NPS, Programa Puntos, Segmentos Auto, Hub Comunicaciones, Wish Lists, Cliente 360° |
| **12** ✅ | Inteligencia & Reportes | KPI Personalizado, Reportes Auto, Mapa Calor, Tablero Metas, Análisis Cesta |
| **13** ✅ | Cumplimiento & Plataforma | Backup/Restore, Logs Seguridad, Compliance, Webhooks, Salud Sistema |
| **14** ✅ | Módulos Prácticos de Alta Utilidad | Campañas Marketing, Comisiones del Equipo, Impresión Etiquetas |

---

## 3. Batches iniciales

| Batch | Entregables |
|---|---|
| **1 (Inicial)** | Yape QR, Capacitor app, push subs DB, stock alerts, CI/CD |
| **2** | Cart persist DB, loyalty points, PDF reports, birthday coupons, post-delivery rating |
| **3** | Birthday input, BackInStock real, daily digest email, WhatsApp auto status, customer timeline |
| **4** | Smart cross-sell (co-purchase SQL), auto WhatsApp on order, low stock badges, supplier reorder alerts, RFM segmentation |
| **5** | Rate limiting, notifications center, sales trends + 7-day forecast, notification preferences, bulk operations |

### Session 3 — ideas prioritarias (todas implementadas)
1. Homepage Live Editor · 2. Banner/Promo Management · 3. Category Ordering · 4. Dynamic Combo Editor · 5. API Auth Protection · 6. Conversion Metrics · 7. Delivery Schedule · 8. Granular Roles (RBAC) · 9. Server-side Pagination · 10. FAQ/About Editor

---

## 4. Detalle Fase 14 — Campañas / Comisiones / Etiquetas (17-mar-2026)

Las 3 features se entregaron en sub-fases:

### Fase 14.0 — UI inicial
- **Campañas:** segmentación, multi-canal, programación, métricas, conectado a `/api/campaigns/notify`
- **Comisiones:** tasas configurables por cajero, períodos, estados pago, conectado a `/api/commissions`
- **Etiquetas:** selector productos, 3 tamaños, copias, preview, impresión nativa A4

### Fase 1 (persistencia campañas)
- Modelo `Campaign` añadido a schema (segment, channel, status, metrics, scheduling)
- API CRUD `/api/campaigns/route.ts` (GET/POST/PATCH/DELETE) protegidos con `requireAdmin`
- `CampañasTab.tsx` conectado a API real, skeleton loader, fallback optimista
- `cashierId` en POS ya existía en `/api/sales`

### Fase 2 (UX campañas)
- `GET /api/campaigns/audience-count?segment=X` estima destinatarios reales por segmento (vip=loyaltyTier oro/diamante, inactivos=30d sin sales, cumpleaños=mes actual, deudores=creditBalance<0)
- `CreateModal`: dropdown "Usar plantilla" + contador audiencia en tiempo real (debounce 400ms)
- Modal detalle: embudo visual de campaña con barras CSS

### Fase 3 (Comisiones BD + PDF campañas)
- Modelo `CommissionRule` (cashierId, minSales, maxSales, rate, label, tenantId)
- API CRUD `/api/commission-rules/route.ts`
- `ComisionesTab` rediseñado con reglas por tramos en BD + tasa plana legacy
- `CampañasTab.exportCampaignPDF` con jsPDF + autotable

### Fase 1 final (Comisiones datos reales + tramos)
- `GET /api/commissions?from=&to=` valida 0 errores, agrupa `Sale` por cashierId, resuelve nombres desde `AdminUser`, calcula COGS real (o 70% fallback)
- `useMemo` recalculado por tramos con lookup en `dbRules`
- Columna "Tasa" muestra `{rate}% ({tierLabel})`

---

*Snapshot generado el 2026-04-26 desde MEMORIA-PROYECTO.md previo (797 líneas → 200 líneas vivas + este histórico).*
