# MEMORIA DEL PROYECTO — Bodega San Martín ERP

> **Última actualización:** 17 de marzo de 2026
> **Versión del sistema:** v14.4 — Fase 1 completada (ComisionesTab conectado a datos reales + cálculo por tramos)
> **Propósito:** Documento vivo de referencia para toda implementación, mejora o diagnóstico del sistema.

---

## 1. VISIÓN GENERAL DEL PRODUCTO

**Bodega San Martín** es un sistema integral de e-commerce + POS + ERP para una bodega/minimarket real ubicada en **Pucallpa, Perú**. Combina tienda online, terminal de punto de venta, y un panel administrativo con **107 módulos** que cubren finanzas, inventario, RRHH, logística, marketing, CRM, analytics, proveedores, compras, tesorería y control empresarial.

**Objetivo:** Ser el ERP más completo y profesional para gestión de bodegas/minimarkets en Perú.

---

## 2. STACK TECNOLÓGICO

| Capa | Tecnología |
|------|-----------|
| **Framework** | Next.js 16.1.6 (App Router, Turbopack) |
| **UI** | React 19.2.3, TypeScript 5 |
| **Estilos** | Tailwind CSS 4, dark mode completo |
| **Iconos** | Lucide React |
| **Base de datos** | PostgreSQL + Prisma 7.4.2 |
| **Auth** | bcryptjs, sessions, RBAC (admin/cajero/almacenero) |
| **Email** | Nodemailer 8.0.1 |
| **PDF** | jsPDF + jsPDF-autotable |
| **Mapas** | Leaflet 1.9.4 |
| **Animaciones** | Framer Motion 12.35, GSAP 3.14 |
| **Push** | web-push 3.6.7 |
| **Barcode** | Quagga2 |
| **Validación** | Zod 4.3.6 |
| **Analytics** | Google Analytics, GTM, Microsoft Clarity, Sentry |
| **Mobile** | Capacitor (iOS/Android) |
| **Pagos** | Yape QR, efectivo, tarjeta |
| **Messaging** | WhatsApp API |
| **Testing** | Vitest 4.0, Testing Library |

---

## 3. ARQUITECTURA DEL PROYECTO

```
bodega-san-martin/
├── app/
│   ├── (store)/              # Tienda pública (home, catálogo, cuenta, pedidos, búsqueda)
│   │   ├── layout.tsx
│   │   ├── page.tsx          # Home
│   │   ├── tienda/page.tsx   # Catálogo
│   │   ├── cuenta/           # Mi cuenta
│   │   ├── mis-pedidos/      # Historial pedidos
│   │   └── buscar/           # Búsqueda
│   ├── admin/
│   │   └── page.tsx          # Panel admin (107 tabs, ~6000 líneas)
│   ├── api/                  # 56+ rutas API REST
│   ├── cms/                  # CMS routes
│   ├── pedido/               # Flujo de pedido
│   └── venta/                # Flujo de venta
├── components/
│   ├── admin/                # 85 componentes de tabs admin
│   ├── blocks/               # Bloques de layout CMS
│   ├── ui/                   # Primitivos UI
│   └── *.tsx                 # ~90 componentes de tienda pública
├── contexts/                 # 9 contexts (cart, customer, theme, settings, etc.)
├── hooks/                    # 16 custom hooks
├── lib/                      # Utilidades, auth, mailer, prisma, rate-limit, etc.
├── data/                     # Datos estáticos (products.ts)
├── prisma/                   # Schema + migraciones
├── public/                   # Assets estáticos
└── __tests__/                # Tests unitarios
```

---

## 4. PANEL ADMIN — MÓDULOS COMPLETOS (133 tabs)

### Registrados en `app/admin/page.tsx`

Cada tab se carga con `next/dynamic` + `TabSpinner` para lazy loading.

| # | Tab ID | Label | Componente | Módulo | Fase |
|---|--------|-------|-----------|--------|------|
| 1 | `dashboard` | Dashboard | DashboardTab | Analytics | Base |
| 2 | `pos` | Punto de Venta | POSView | Ventas | Base |
| 3 | `inventario` | Inventario | InventoryTab | Inventario | Base |
| 4 | `pedidos` | Pedidos | OrdersTab | Ventas | Base |
| 5 | `proveedores` | Proveedores | SuppliersTab | Compras | Base |
| 6 | `compras` | Compras | PurchaseOrdersTab | Compras | Base |
| 7 | `cuentas` | Cuentas | PayablesTab | Finanzas | Base |
| 8 | `caja` | Caja | CashRegisterTab | Finanzas | Base |
| 9 | `clientes` | Clientes | CustomersTab | CRM | Base |
| 10 | `promociones` | Promociones | PromotionsTab | Marketing | Base |
| 11 | `reseñas` | Reseñas | ReviewsTab | CRM | Base |
| 12 | `actividad` | Actividad | ActivityLogTab | Auditoría | Base |
| 13 | `cupones` | Cupones | CouponsTab | Marketing | Batch 2 |
| 14 | `devoluciones` | Devoluciones | ReturnsTab | Ventas | Batch 2 |
| 15 | `reportes` | Reportes | ReportsTab | Analytics | Batch 2 |
| 16 | `historial-precios` | Historial Precios | PriceHistoryTab | Inventario | Batch 3 |
| 17 | `prediccion` | Predicción IA | DemandPredictionTab | IA | Batch 3 |
| 18 | `entregas` | Entregas | DeliveryCalendarTab | Logística | Batch 3 |
| 19 | `chat` | Chat Interno | AdminChatTab | Comunicación | Batch 3 |
| 20 | `evaluaciones` | Evaluaciones | SupplierEvaluationsTab | Compras | Batch 3 |
| 21 | `fidelizacion` | Fidelización | LoyaltyTab | CRM | Batch 4 |
| 22 | `auto-reorden` | Auto-Reorden | AutoReorderTab | Inventario | Batch 4 |
| 23 | `gastos` | Gastos | ExpensesTab | Finanzas | Batch 4 |
| 24 | `combos` | Combos | BundlesTab | Ventas | Batch 4 |
| 25 | `notificaciones` | Notificaciones | NotificationsTab | CRM | Batch 5 |
| 26 | `pagina-inicio` | Página de Inicio | HomepageEditorTab | CMS | Session 3 |
| 27 | `categorias-editor` | Categorías | CategoriesEditorTab | CMS | Session 3 |
| 28 | `combos-editor` | Editor Combos | CombosEditorTab | CMS | Session 3 |
| 29 | `delivery-horarios` | Horarios Delivery | DeliveryScheduleTab | Logística | Session 3 |
| 30 | `metricas-conversion` | Métricas | ConversionMetricsTab | Analytics | Session 3 |
| 31 | `permisos-roles` | Permisos Roles | RolePermissionsTab | Seguridad | Session 3 |
| 32 | `configuracion` | Configuración | SettingsTab | Config | Base |
| 33 | `usuarios-admin` | Usuarios Admin | AdminUsersTab | Seguridad | Batch 5 |
| 34 | `ab-tests` | A/B Testing | ABTestsTab | Marketing | Batch 5 |
| 35 | `encuestas` | Encuestas | SurveysTab | CRM | Batch 5 |
| 36 | `abc-analysis` | Análisis ABC | ABCAnalysisTab | Analytics | Batch 5 |
| 37 | `clv` | CLV / Cohortes | CLVAnalyticsTab | Analytics | Batch 5 |
| 38 | `margenes` | Márgenes | MarginDashboardTab | Finanzas | Batch 5 |
| 39 | `segmentos` | Segmentación | CustomerSegmentationTab | CRM | Batch 5 |
| 40 | `metas` | Metas & KPIs | GoalsTab | Gestión | ERP Fase 1 |
| 41 | `tareas` | Tareas | TasksTab | Gestión | ERP Fase 1 |
| 42 | `flujos` | Flujos de Trabajo | WorkflowTemplatesTab | Gestión | ERP Fase 1 |
| 43 | `pl` | P&L / Resultados | PLTab | Finanzas | ERP Fase 1 |
| 44 | `flujo-caja` | Flujo de Caja | CashFlowTab | Finanzas | ERP Fase 1 |
| 45 | `cuentas-cobrar` | Cuentas x Cobrar | AccountsReceivableTab | Finanzas | ERP Fase 1 |
| 46 | `tesoreria` | Tesorería | TreasuryTab | Finanzas | ERP Fase 1 |
| 47 | `facturacion` | Facturación | InvoicingTab | Legal/Tax | ERP Fase 1 |
| 48 | `impuestos` | IGV / Impuestos | TaxTab | Legal/Tax | ERP Fase 1 |
| 49 | `turnos` | Control de Turnos | ShiftControlTab | RRHH | ERP Fase 1 |
| 50 | `lotes` | Lotes & Vencimientos | BatchesTab | Inventario | ERP Fase 2 |
| 51 | `kardex` | Kardex | KardexTab | Inventario | ERP Fase 2 |
| 52 | `almacenes` | Multi-Almacén | WarehouseTab | Inventario | ERP Fase 2 |
| 53 | `rrhh` | Recursos Humanos | HRTab | RRHH | ERP Fase 2 |
| 54 | `nomina` | Nómina | PayrollTab | RRHH | ERP Fase 2 |
| 55 | `contratos` | Contratos | PurchaseContractsTab | Compras | ERP Fase 2 |
| 56 | `presupuestos` | Presupuestos | BudgetTab | Finanzas | ERP Fase 4 |
| 57 | `centros-costo` | Centros de Costo | CostCenterTab | Finanzas | ERP Fase 4 |
| 58 | `conciliacion` | Conciliación Bancaria | BankReconciliationTab | Finanzas | ERP Fase 4 |
| 59 | `documentos` | Gestión Documental | DocumentManagerTab | Gestión | ERP Fase 4 |
| 60 | `rentabilidad` | Rentabilidad | ProfitabilityTab | Analytics | ERP Fase 4 |
| 61 | `calidad` | Control de Calidad | QualityControlTab | Calidad | ERP Fase 4 |
| 62 | `activos` | Activos Fijos | AssetManagerTab | Finanzas | ERP Fase 4 |
| 63 | `balance-general` | Balance General | BalanceSheetTab | Finanzas | ERP Fase 5 |
| 64 | `auditoria` | Auditoría Avanzada | AuditLogTab | Control | ERP Fase 5 |
| 65 | `proyectos` | Proyectos & CAPEX | ProjectsTab | Finanzas | ERP Fase 5 |
| 66 | `plan-compras` | Plan de Compras | PurchasePlanningTab | Compras | ERP Fase 5 |
| 67 | `sucursales` | Multi-Sucursal | BranchesTab | Operaciones | ERP Fase 5 |
| 68 | `seguros` | Pólizas & Seguros | InsuranceTab | Legal | ERP Fase 5 |
| 69 | `benchmark` | Benchmark Precios | PriceBenchmarkTab | Analytics | ERP Fase 5 |
| 70 | `marketing` | Marketing Automation | MarketingAutomationTab | Marketing | ERP Fase 6 |
| 71 | `crm` | CRM Avanzado | CRMTab | CRM | ERP Fase 6 |
| 72 | `bi` | Business Intelligence | BusinessIntelligenceTab | Analytics | ERP Fase 6 |
| 73 | `mermas` | Gestión de Mermas | ShrinkageTab | Inventario | ERP Fase 6 |
| 74 | `e-facturacion` | Facturación Electrónica | EInvoiceTab | Finanzas | ERP Fase 6 |
| 75 | `referidos` | Programa de Referidos | ReferralTab | Marketing | ERP Fase 6 |
| 76 | `devoluciones-avanzadas` | Devoluciones Avanzada | AdvancedReturnsTab | Operaciones | ERP Fase 6 |
| 77 | `soporte` | Soporte & Tickets | SupportTicketsTab | Soporte | ERP Fase 6 |
| 78 | `portal-proveedor` | Portal Proveedor | SupplierPortalTab | Proveedores | ERP Fase 7 |
| 79 | `cotizaciones` | Cotizaciones (RFQ) | RFQTab | Compras | ERP Fase 7 |
| 80 | `calidad-proveedor` | Calidad Proveedor | SupplierQualityTab | Compras | ERP Fase 7 |
| 81 | `aprobacion-compras` | Aprobación Compras | PurchaseApprovalTab | Compras | ERP Fase 7 |
| 82 | `recepcion` | Recepción & Verificación | ReceivingTab | Compras | ERP Fase 7 |
| 83 | `pagos-proveedor` | Pagos Proveedores | SupplierPaymentsTab | Tesorería | ERP Fase 7 |
| 84 | `arqueo-caja` | Arqueo de Caja | CashAuditTab | Tesorería | ERP Fase 7 |
| 85 | `proyeccion-liquidez` | Proyección Liquidez | LiquidityForecastTab | Tesorería | ERP Fase 7 |
| 86 | `cheques` | Gestión de Cheques | CheckManagementTab | Tesorería | ERP Fase 7 |
| 87 | `centro-cobros` | Centro de Cobros | CollectionCenterTab | Tesorería | ERP Fase 7 |
| 88 | `forecast-ventas` | Forecast Ventas | SalesForecastTab | Analytics | Fase 8 |
| 89 | `anomalias` | Detección Anomalías | AnomalyDetectionTab | Analytics | Fase 8 |
| 90 | `bcg-matrix` | Matriz BCG | BCGMatrixTab | Analytics | Fase 8 |
| 91 | `pareto` | Análisis Pareto | ParetoAnalysisTab | Analytics | Fase 8 |
| 92 | `kanban` | Kanban Board | KanbanBoardTab | Operaciones | Fase 8 |
| 93 | `transferencias` | Transferencias | WarehouseTransferTab | Inventario | Fase 8 |
| 94 | `inventario-fisico` | Inventario Físico | PhysicalInventoryTab | Inventario | Fase 8 |
| 95 | `kits` | Gestor de Kits | KitManagerTab | Inventario | Fase 8 |
| 96 | `ubicaciones` | Ubicaciones | WarehouseLocationTab | Inventario | Fase 8 |
| 97 | `calendario` | Calendario Compartido | SharedCalendarTab | Operaciones | Fase 8 |
| 98 | `break-even` | Break-Even | BreakEvenTab | Finanzas | Fase 8 |
| 99 | `simulador` | Simulador Escenarios | ScenarioSimulatorTab | Finanzas | Fase 8 |
| 100 | `presupuesto-real` | Presupuesto vs Real | BudgetVsRealTab | Finanzas | Fase 8 |
| 101 | `estacionalidad` | Estacionalidad | SeasonalityTab | Finanzas | Fase 8 |
| 102 | `reorden-dinamico` | Reorden Dinámico | DynamicReorderTab | Inventario | Fase 8 |
| 103 | `notas-rapidas` | Notas Rápidas | QuickNotesTab | Utilidad | Fase 8 |
| 104 | `filtros-guardados` | Filtros Guardados | SavedFiltersTab | Utilidad | Fase 8 |
| 105 | `recordatorios` | Recordatorios | SmartRemindersTab | Utilidad | Fase 8 |
| 106 | `plantillas-mensaje` | Plantillas Mensaje | MessageTemplatesTab | Comunicación | Fase 8 |
| 107 | `dashboard-ejecutivo` | Dashboard Ejecutivo | ExecutiveDashboardTab | Analytics | Fase 9 |
| 108 | `alertas-automaticas` | Alertas Automáticas | AutoAlertEngineTab | Operaciones | Fase 9 |
| 109 | `reglas-negocio` | Reglas de Negocio | BusinessRulesTab | Operaciones | Fase 9 |
| 110 | `importar-exportar` | Importar / Exportar | ImportExportTab | Config | Fase 9 |
| 111 | `comparador-periodos` | Comparador Períodos | PeriodComparatorTab | Analytics | Fase 9 |
| 112 | `rutas-delivery` | Rutas Delivery | DeliveryRoutesTab | Operaciones | Fase 10 |
| 113 | `flota` | Gestión de Flota | FleetManagementTab | Operaciones | Fase 10 |
| 114 | `seguimiento-envios` | Seguimiento Envíos | ShipmentTrackingTab | Operaciones | Fase 10 |
| 115 | `costos-envio` | Costos de Envío | ShippingCostsTab | Finanzas | Fase 10 |
| 116 | `logistica-devoluciones` | Logística Devoluciones | ReturnLogisticsTab | Operaciones | Fase 10 |
| 117 | `nps` | NPS & Satisfacción | NPSTab | CRM | Fase 11 |
| 118 | `programa-puntos` | Programa de Puntos | PointsProgramTab | CRM | Fase 11 |
| 119 | `segmentos-auto` | Segmentos Automáticos | AutoSegmentsTab | CRM | Fase 11 |
| 120 | `hub-comunicaciones` | Hub Comunicaciones | CommunicationHubTab | Comunicación | Fase 11 |
| 121 | `wish-lists` | Wish Lists | WishListAdminTab | CRM | Fase 11 |
| 122 | `cliente-360` | Cliente 360° | Customer360Tab | CRM | Fase 11 |
| 123 | `kpi-personalizado` | KPI Personalizado | CustomKPITab | Analytics | Fase 12 |
| 124 | `reportes-auto` | Reportes Automáticos | AutoReportsTab | Analytics | Fase 12 |
| 125 | `mapa-calor` | Mapa de Calor | HeatMapTab | Analytics | Fase 12 |
| 126 | `tablero-metas` | Tablero de Metas | GoalTrackerTab | Operaciones | Fase 12 |
| 127 | `analisis-cesta` | Análisis de Cesta | BasketAnalysisTab | Analytics | Fase 12 |
| 128 | `backup-restaurar` | Backup & Restaurar | BackupRestoreTab | Config | Fase 13 |
| 129 | `logs-seguridad` | Logs de Seguridad | SecurityLogsTab | Calidad | Fase 13 |
| 130 | `cumplimiento` | Cumplimiento & Legal | ComplianceTab | Legal | Fase 13 |
| 131 | `webhooks` | Webhooks | WebhooksTab | Config | Fase 13 |
| 132 | `salud-sistema` | Salud del Sistema | SystemHealthTab | Config | Fase 13 |

---

## 5. ROADMAP ERP — FASES DE MEJORA

### Fase 1 ✅ COMPLETADA — Finanzas & Operaciones Core
| Módulo | Estado |
|--------|--------|
| P&L / Resultados | ✅ |
| Flujo de Caja | ✅ |
| Cuentas por Cobrar | ✅ |
| Tesorería | ✅ |
| Facturación | ✅ |
| IGV / Impuestos | ✅ |
| Control de Turnos | ✅ |
| Metas & KPIs | ✅ |
| Tareas | ✅ |
| Flujos de Trabajo | ✅ |

### Fase 2 ✅ COMPLETADA — Inventario Avanzado & RRHH
| Módulo | Estado |
|--------|--------|
| Lotes & Vencimientos | ✅ |
| Kardex de Inventario | ✅ |
| Multi-Almacén | ✅ |
| Recursos Humanos | ✅ |
| Nómina | ✅ |
| Contratos con Proveedores | ✅ |

### Fase 3 ✅ COMPLETADA — Análisis Avanzado & Automatización
| Módulo | Estado |
|--------|--------|
| Dashboard Ejecutivo (resumen multi-módulo) | ✅ (Fase 9) |
| Auditoría Financiera | ✅ (Logs Seguridad, Fase 13) |
| Proyección de Demanda Mejorada | ✅ (Forecast Ventas, Fase 8) |

### Fase 4 ✅ COMPLETADA — Madurez ERP & Control Empresarial
| Módulo | Estado |
|--------|--------|
| Presupuestos por Depto/Categoría | ✅ |
| Centros de Costo | ✅ |
| Conciliación Bancaria | ✅ |
| Gestión Documental | ✅ |
| Análisis de Rentabilidad | ✅ |
| Control de Calidad | ✅ |
| Activos Fijos (depreciación) | ✅ |

### Fase 5 ✅ COMPLETADA — Estrategia, Control & Expansión
| Módulo | Estado |
|--------|--------|
| Balance General (BalanceSheetTab) | ✅ |
| Auditoría Avanzada (AuditLogTab) | ✅ |
| Proyectos & CAPEX (ProjectsTab) | ✅ |
| Plan de Compras (PurchasePlanningTab) | ✅ |
| Multi-Sucursal (BranchesTab) | ✅ |
| Pólizas & Seguros (InsuranceTab) | ✅ |
| Benchmark Precios (PriceBenchmarkTab) | ✅ |

### Fase 6 ✅ COMPLETADA — Marketing, CRM, BI & Soporte
| Módulo | Estado |
|--------|--------|
| Marketing Automation (MarketingAutomationTab) | ✅ |
| CRM Avanzado (CRMTab) | ✅ |
| Business Intelligence (BusinessIntelligenceTab) | ✅ |
| Gestión de Mermas (ShrinkageTab) | ✅ |
| Facturación Electrónica (EInvoiceTab) | ✅ |
| Programa de Referidos (ReferralTab) | ✅ |
| Devoluciones Avanzada (AdvancedReturnsTab) | ✅ |
| Soporte & Tickets (SupportTicketsTab) | ✅ |

### Fase 7 ✅ COMPLETADA — Proveedores, Compras & Tesorería

**🏭 Proveedores & Compras (5 módulos)**
| Módulo | Estado |
|--------|--------|
| Portal Proveedor (SupplierPortalTab) | ✅ |
| Cotizaciones Comparativas / RFQ (RFQTab) | ✅ |
| Calidad de Proveedores (SupplierQualityTab) | ✅ |
| Aprobación de Compras (PurchaseApprovalTab) | ✅ |
| Recepción & Verificación (ReceivingTab) | ✅ |

**💰 Tesorería & Caja (5 módulos)**
| Módulo | Estado |
|--------|--------|
| Pagos a Proveedores (SupplierPaymentsTab) | ✅ |
| Arqueo de Caja Digital (CashAuditTab) | ✅ |
| Proyección de Liquidez (LiquidityForecastTab) | ✅ |
| Gestión de Cheques (CheckManagementTab) | ✅ |
| Centro de Cobros (CollectionCenterTab) | ✅ |

### Fase 8 ✅ COMPLETADA — Analytics, Operaciones, Finanzas & UX Premium

**📊 Analytics (4 módulos)**
| Módulo | Estado |
|--------|--------|
| Forecast de Ventas (SalesForecastTab) | ✅ |
| Detección de Anomalías (AnomalyDetectionTab) | ✅ |
| Matriz BCG (BCGMatrixTab) | ✅ |
| Análisis Pareto (ParetoAnalysisTab) | ✅ |

**⚙️ Operaciones (2 módulos)**
| Módulo | Estado |
|--------|--------|
| Kanban Board (KanbanBoardTab) | ✅ |
| Calendario Compartido (SharedCalendarTab) | ✅ |

**📦 Inventario (5 módulos)**
| Módulo | Estado |
|--------|--------|
| Transferencias (WarehouseTransferTab) | ✅ |
| Inventario Físico (PhysicalInventoryTab) | ✅ |
| Gestor de Kits (KitManagerTab) | ✅ |
| Ubicaciones Almacén (WarehouseLocationTab) | ✅ |
| Reorden Dinámico (DynamicReorderTab) | ✅ |

**💰 Finanzas (4 módulos)**
| Módulo | Estado |
|--------|--------|
| Break-Even (BreakEvenTab) | ✅ |
| Simulador de Escenarios (ScenarioSimulatorTab) | ✅ |
| Presupuesto vs Real (BudgetVsRealTab) | ✅ |
| Estacionalidad (SeasonalityTab) | ✅ |

**🛠️ Utilidad & Comunicación (4 módulos)**
| Módulo | Estado |
|--------|--------|
| Notas Rápidas (QuickNotesTab) | ✅ |
| Filtros Guardados (SavedFiltersTab) | ✅ |
| Recordatorios Inteligentes (SmartRemindersTab) | ✅ |
| Plantillas de Mensaje (MessageTemplatesTab) | ✅ |

**🎨 UX Premium**
| Mejora | Estado |
|--------|--------|
| Tabs favoritos (estrella + localStorage) | ✅ |
| Tabs recientes (últimos 5) | ✅ |
| Búsqueda fuzzy en sidebar | ✅ |
| Modo compacto (toggle spacing) | ✅ |
| Modo enfoque (sidebar oculto) | ✅ |

### Fase 9 ✅ COMPLETADA — Ejecutivo & Automatización

| Módulo | Estado |
|--------|--------|
| Dashboard Ejecutivo (ExecutiveDashboardTab) | ✅ |
| Alertas Automáticas (AutoAlertEngineTab) | ✅ |
| Reglas de Negocio (BusinessRulesTab) | ✅ |
| Importar / Exportar (ImportExportTab) | ✅ |
| Comparador de Períodos (PeriodComparatorTab) | ✅ |

### Fase 10 ✅ COMPLETADA — Logística & Delivery

| Módulo | Estado |
|--------|--------|
| Rutas Delivery (DeliveryRoutesTab) | ✅ |
| Gestión de Flota (FleetManagementTab) | ✅ |
| Seguimiento Envíos (ShipmentTrackingTab) | ✅ |
| Costos de Envío (ShippingCostsTab) | ✅ |
| Logística Devoluciones (ReturnLogisticsTab) | ✅ |

### Fase 11 ✅ COMPLETADA — Experiencia del Cliente

| Módulo | Estado |
|--------|--------|
| NPS & Satisfacción (NPSTab) | ✅ |
| Programa de Puntos (PointsProgramTab) | ✅ |
| Segmentos Automáticos (AutoSegmentsTab) | ✅ |
| Hub Comunicaciones (CommunicationHubTab) | ✅ |
| Wish Lists (WishListAdminTab) | ✅ |
| Cliente 360° (Customer360Tab) | ✅ |

### Fase 12 ✅ COMPLETADA — Inteligencia & Reportes

| Módulo | Estado |
|--------|--------|
| KPI Personalizado (CustomKPITab) | ✅ |
| Reportes Automáticos (AutoReportsTab) | ✅ |
| Mapa de Calor (HeatMapTab) | ✅ |
| Tablero de Metas (GoalTrackerTab) | ✅ |
| Análisis de Cesta (BasketAnalysisTab) | ✅ |

### Fase 13 ✅ COMPLETADA — Cumplimiento & Plataforma

| Módulo | Estado |
|--------|--------|
| Backup & Restaurar (BackupRestoreTab) | ✅ |
| Logs de Seguridad (SecurityLogsTab) | ✅ |
| Cumplimiento & Legal (ComplianceTab) | ✅ |
| Webhooks (WebhooksTab) | ✅ |
| Salud del Sistema (SystemHealthTab) | ✅ |

### Fase 14 ✅ COMPLETADA — Módulos Prácticos de Alta Utilidad

| Módulo | Ubicación | Estado |
|--------|-----------|--------|
| Campañas de Marketing (CampañasTab) | VentasMarketingModule → pestaña "Campañas" | ✅ |
| Comisiones del Equipo (ComisionesTab) | RRHHModule → pestaña "Comisiones" | ✅ |
| Impresión de Etiquetas (EtiquetasTab) | CatalogoTiendaModule → pestaña "Etiquetas" | ✅ |

---

## 6. API ROUTES (56+ endpoints)

```
/api/ab-tests/            /api/activity-log/       /api/admin/
/api/admin-chat/          /api/admin-users/        /api/analytics/
/api/auth/                /api/auto-reorder/       /api/backup/
/api/barcode-lookup/      /api/birthday-coupons/   /api/bundles/
/api/campaigns/           /api/cart/               /api/cash-registers/
/api/chat/                /api/cms/                /api/commissions/
/api/coupons/             /api/customer-notifications/
/api/customer-preferences/ /api/customers/          /api/daily-digest/
/api/delivery-slots/      /api/demand-prediction/  /api/email-automation/
/api/expenses/            /api/goals/              /api/inventory-movements/
/api/invoices/            /api/loyalty/            /api/notifications/
/api/orders/              /api/payables/           /api/price-history/
/api/product-search/      /api/products/           /api/promotions/
/api/purchases/           /api/pwa-icon/           /api/recommendations/
/api/referrals/           /api/reorder-alerts/     /api/returns/
/api/reviews/             /api/sales/              /api/search/
/api/settings/            /api/shopping-feed/      /api/shopping-lists/
/api/stock-alerts/        /api/suggestions/        /api/supplier-evaluations/
/api/suppliers/           /api/surveys/            /api/tasks/
```

---

## 7. CONTEXTS (Estado Global)

| Archivo | Propósito |
|---------|-----------|
| `cart-context.tsx` | Carrito de compras (items, total, checkout) |
| `compare-context.tsx` | Comparador de productos |
| `customer-context.tsx` | Sesión y datos del cliente |
| `favorites-context.tsx` | Lista de favoritos |
| `promotions-context.tsx` | Promociones activas |
| `reviews-context.tsx` | Reseñas del usuario |
| `settings-context.tsx` | Config global de la tienda (homepage, banners, horarios) |
| `theme-context.tsx` | Dark/light mode |
| `toast-context.tsx` | Notificaciones toast |

---

## 8. HOOKS PERSONALIZADOS

| Hook | Propósito |
|------|-----------|
| `use-ab-test` | Selección de variante A/B |
| `use-advanced-search` | Búsqueda avanzada con filtros |
| `use-cached-data` | Cache de datos con SWR-like pattern |
| `use-first-order` | Detectar primer pedido del cliente |
| `use-in-view` | Intersection Observer hook |
| `use-keyboard-shortcuts` | Atajos de teclado globales |
| `use-local-storage` | Persistencia en localStorage tipada |
| `use-magnetic` | Efecto magnético para UI |
| `use-notifications` | Centro de notificaciones |
| `use-optimized-image` | Lazy loading + blur placeholder |
| `use-pagination` | Paginación client-side |
| `use-preferences` | Preferencias del usuario |
| `use-ripple` | Efecto ripple Material-like |
| `use-scroll-lock` | Bloqueo de scroll para modales |
| `use-tilt` | Efecto 3D tilt |
| `use-toast` | Sistema de toast |

---

## 9. PATRONES DE CÓDIGO OBLIGATORIOS

### Tab Admin Component Pattern
```tsx
"use client";
import { useState, useMemo } from "react";
import { IconName, ... } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// Types, Helpers, Seed data fuera del componente

export default function NombreTab() {
  // Estado con useState
  // Datos filtrados con useMemo
  // Handlers como funciones internas
  
  return (
    <div className="space-y-6">
      {/* Header con título + botones */}
      {/* KPIs en grid */}
      {/* Alertas condicionales */}
      {/* Filtros */}
      {/* Tabla o cards */}
      {/* Modal de detalle */}
    </div>
  );
}
```

### Page.tsx Registration Pattern
```tsx
// 1. Dynamic import con TabSpinner
const NuevoTab = dynamic(() => import("@/components/admin/NuevoTab"), { loading: TabSpinner });

// 2. Agregar al type Tab union
type Tab = "..." | "nuevo-id";

// 3. Agregar a ALL_TABS array
{ id: "nuevo-id" as Tab, label: "Nuevo Módulo", icon: IconName },

// 4. Agregar render block
{tab === "nuevo-id" && <NuevoTab />}
```

### Convenciones de Estilo (Tailwind)
- Bordes: `border-gray-200 dark:border-card-border`
- Fondos tarjeta: `bg-white dark:bg-card`
- Fondos superficie: `bg-gray-50 dark:bg-surface`
- Texto principal: `text-gray-900 dark:text-foreground`
- Texto secundario: `text-gray-500 dark:text-muted`
- Hover: `hover:bg-gray-50 dark:hover:bg-accent`
- Bordes redondeados: `rounded-2xl` (cards), `rounded-xl` (botones, inputs)
- Fuentes: `font-extrabold` (títulos), `font-bold` (subtítulos), `font-semibold` (labels)

### Dinero
```tsx
function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
```

### Fechas
```tsx
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}
```

---

## 10. COMPONENTES DE TIENDA PÚBLICA (90+)

Tienda completa con: Hero, Products, Cart, Checkout, FAQ, About, Contact, Benefits, Testimonials, CategoryBubbles, FeaturedCarousel, CombosSection, DailySpecial, FlashDeals, RecipeSuggestions, WhatsApp integration, PWA install prompt, Cookie consent, Exit intent modal, Referral banner, Social proof toast, Spin wheel, y más.

---

## 11. BASE DE DATOS (Prisma Schema)

**Modelos principales:** Product, Customer, Order, OrderItem, Review, Settings, Supplier, PurchaseOrder, Payable, SavedCart, SavedLocation, Invoice, Shift, Task, Goal, ABTest, Survey, Notification, y 20+ más.

---

## 12. SEGURIDAD IMPLEMENTADA

- ✅ RBAC con 3 roles (admin, cajero, almacenero)
- ✅ `requireAdmin` middleware en rutas API sensibles
- ✅ `CRON_SECRET` en rutas de cron jobs
- ✅ Rate limiting en API routes
- ✅ bcryptjs para contraseñas
- ✅ Session management
- ✅ CORS configurado

---

## 13. INTEGRACIONES

- **Sentry** — Error tracking
- **Google Analytics + GTM** — Analytics
- **Microsoft Clarity** — Heatmaps
- **WhatsApp API** — Notificaciones y pedidos
- **Nodemailer** — Email transaccional
- **Web Push** — Notificaciones push
- **Yape QR** — Pagos móviles
- **Leaflet** — Mapas de delivery
- **Capacitor** — App móvil iOS/Android

---

## 14. GAPS CONOCIDOS

- [ ] SearchAction URL declarada en schema pero sin página funcional
- [ ] CombosSection.tsx en tienda sigue usando COMBO_TEMPLATES hardcodeados (no lee settings)
- [ ] Algunos componentes con warnings de Tailwind v4 (bg-gradient-to-r → bg-linear-to-r)

---

## 15. HISTORIAL DE MEJORAS

### Batch 1 (Inicial)
- Yape QR, Capacitor app, push subs DB, stock alerts, CI/CD

### Batch 2
- Cart persist DB, loyalty points, PDF reports, birthday coupons, post-delivery rating

### Batch 3
- Birthday input, BackInStock real, daily digest email, WhatsApp auto status, customer timeline

### Batch 4
- Smart cross-sell (co-purchase SQL), auto WhatsApp on order, low stock badges, supplier reorder alerts, RFM segmentation

### Batch 5
- Rate limiting, notifications center, sales trends + 7-day forecast, notification preferences, bulk operations

### Session 3 — Ideas Prioritarias
1. Homepage Live Editor
2. Banner/Promo Management
3. Category Ordering
4. Dynamic Combo Editor

---

## 12. GUÍA DE MIGRACIONES PRISMA CON SUPABASE

### Problema conocido

`prisma migrate dev` **no funciona** con Supabase porque requiere crear y destruir una shadow database. El connection pooler de Supabase (pgBouncer) bloquea estas operaciones DDL. Error típico:

```
Error: P3006 — Migration failed to apply cleanly to the shadow database.
```

### Solución estándar para este proyecto

**Nunca usar `prisma migrate dev` directamente.** Seguir estos pasos:

#### Paso 1 — Crear el SQL de migración manualmente

Crear la carpeta y el archivo SQL con nombre cronológico:

```
prisma/migrations/YYYYMMDDHHMMSS_nombre_descriptivo/migration.sql
```

Usar guards `IF NOT EXISTS` / `DO $$ BEGIN ... END $$` para idempotencia.

#### Paso 2 — Aplicar el SQL directamente a la BD

```bash
npx prisma db execute --file "prisma/migrations/NOMBRE/migration.sql"
```

#### Paso 3 — Registrar la migración en el historial de Prisma

```bash
npx prisma migrate resolve --applied "NOMBRE_DE_LA_MIGRACION"
```

#### Paso 4 — Regenerar el cliente Prisma

```bash
npx prisma generate
```

#### Verificar estado

```bash
npx prisma migrate status
# Debe decir: "Database schema is up to date!"
```

### Baseline de migraciones ya aplicadas (sin historial)

Si la BD tiene tablas pero `_prisma_migrations` está vacío o desincronizado:

```bash
# Marcar cada migración existente como aplicada, sin re-ejecutar su SQL:
npx prisma migrate resolve --applied "20260307161913_init"
npx prisma migrate resolve --applied "20260309160725_add_new_fields"
# ... repetir para cada migración ya presente en la BD
```

Luego usar `prisma migrate deploy` para aplicar solo las genuinamente nuevas.

### Nota sobre `migrate deploy` en producción

`prisma migrate deploy` tampoco usa shadow DB y es seguro para Supabase, pero **sí ejecuta el SQL** de las migraciones no marcadas como applied. Usarlo solo cuando el SQL es nuevo y no ha sido ejecutado aún.
5. API Auth Protection
6. Conversion Metrics
7. Delivery Schedule
8. Granular Roles (RBAC)
9. Server-side Pagination
10. FAQ/About Editor

### ERP Fase 1 ✅
- P&L, Flujo de Caja, Cuentas por Cobrar, Tesorería, Facturación, IGV/Impuestos, Control de Turnos, Metas, Tareas, Flujos

### ERP Fase 2 ✅
- Lotes & Vencimientos, Kardex, Multi-Almacén, RRHH, Nómina, Contratos Proveedores

### ERP Fase 4 ✅
- Presupuestos (BudgetTab), Centros de Costo (CostCenterTab), Conciliación Bancaria (BankReconciliationTab)
- Gestión Documental (DocumentManagerTab), Rentabilidad (ProfitabilityTab)
- Control de Calidad (QualityControlTab), Activos Fijos (AssetManagerTab)
- 7 nuevos módulos registrados en page.tsx, total: 63 tabs

### ERP Fase 5 ✅
- Balance General (BalanceSheetTab), Auditoría Avanzada (AuditLogTab), Proyectos & CAPEX (ProjectsTab)
- Plan de Compras (PurchasePlanningTab), Multi-Sucursal (BranchesTab)
- Pólizas & Seguros (InsuranceTab), Benchmark Precios (PriceBenchmarkTab)
- 7 nuevos módulos registrados en page.tsx, total: 70 tabs

### ERP Fase 6 ✅
- Marketing Automation (MarketingAutomationTab), CRM Avanzado (CRMTab), Business Intelligence (BusinessIntelligenceTab)
- Gestión de Mermas (ShrinkageTab), Facturación Electrónica (EInvoiceTab)
- Programa de Referidos (ReferralTab), Devoluciones Avanzada (AdvancedReturnsTab), Soporte & Tickets (SupportTicketsTab)
- 8 nuevos módulos registrados en page.tsx, total: 78 tabs

### ERP Fase 7 ✅
- 🏭 Proveedores & Compras: Portal Proveedor (SupplierPortalTab), Cotizaciones RFQ (RFQTab), Calidad Proveedor (SupplierQualityTab), Aprobación Compras (PurchaseApprovalTab), Recepción & Verificación (ReceivingTab)
- 💰 Tesorería & Caja: Pagos Proveedores (SupplierPaymentsTab), Arqueo de Caja (CashAuditTab), Proyección Liquidez (LiquidityForecastTab), Gestión Cheques (CheckManagementTab), Centro de Cobros (CollectionCenterTab)
- 10 nuevos módulos registrados en page.tsx, total: 88 tabs

### ERP Fase 8 ✅ — Analytics Avanzado, Operaciones, Finanzas & UX Premium

**📊 Analytics (4 módulos)**
- Forecast de Ventas (SalesForecastTab), Detección de Anomalías (AnomalyDetectionTab)
- Matriz BCG (BCGMatrixTab), Análisis Pareto (ParetoAnalysisTab)

**⚙️ Operaciones (2 módulos)**
- Kanban Board (KanbanBoardTab), Calendario Compartido (SharedCalendarTab)

**📦 Inventario (5 módulos)**
- Transferencias (WarehouseTransferTab), Inventario Físico (PhysicalInventoryTab)
- Gestor de Kits (KitManagerTab), Ubicaciones Almacén (WarehouseLocationTab), Reorden Dinámico (DynamicReorderTab)

**💰 Finanzas (4 módulos)**
- Break-Even (BreakEvenTab), Simulador de Escenarios (ScenarioSimulatorTab)
- Presupuesto vs Real (BudgetVsRealTab), Estacionalidad (SeasonalityTab)

**🛠️ Utilidad & Comunicación (4 módulos)**
- Notas Rápidas (QuickNotesTab), Filtros Guardados (SavedFiltersTab)
- Recordatorios Inteligentes (SmartRemindersTab), Plantillas de Mensaje (MessageTemplatesTab)

**🎨 UX Premium (5 mejoras en page.tsx)**
- ⭐ **Tabs favoritos:** Estrella en sidebar, sección "Favoritos" fija arriba, localStorage persistente
- 🕐 **Tabs recientes:** Últimos 5 visitados en sección "Recientes" del sidebar
- 🔍 **Búsqueda fuzzy:** Campo de filtro en sidebar con matching tolerante a acentos (subsequence)
- 📐 **Modo compacto:** Toggle en header que reduce padding/spacing del contenido
- 🎯 **Modo enfoque:** Oculta sidebar completamente, contenido ocupa todo el ancho, botón flotante para restaurar

- 19 nuevos módulos + 5 mejoras UX, total: 107 tabs

---

## 16. NOTAS TÉCNICAS IMPORTANTES

1. **`next/dynamic` en Next.js 16:** El segundo argumento DEBE ser un object literal inline, NO una variable.
2. **TabSpinner compartido:** Componente de loading usado por todos los dynamic imports.
3. **`exportToCSV` de `@/lib/utils`:** Función de exportación CSV usada en todos los tabs.
4. **`cn()` de `@/lib/utils`:** Utility de className merge (clsx + tailwind-merge).
5. **Iconos:** Todo de `lucide-react`. Verificar imports antes de agregar nuevos.
6. **No declarar componentes dentro del render:** Causa re-render. Extraer fuera del componente.
7. **Moneda local:** Perú — Soles (PEN), formato `S/ X,XXX.XX`.
8. **Idioma UI:** Español (Perú). Labels, placeholders y mensajes en español.
9. **Datos seed:** Todos los tabs tienen datos de demostración realistas para Perú.

---

*Este documento se actualiza automáticamente con cada fase de mejora del sistema.*

### ERP Fase 14 ✅ (17 de marzo de 2026)
- Campañas de Marketing (CampañasTab): segmentación, multi-canal, programación, métricas, conectado a `/api/campaigns/notify`
- Comisiones del Equipo (ComisionesTab): tasas configurables por cajero, períodos, estados pago, conectado a `/api/commissions`
- Impresión de Etiquetas (EtiquetasTab): selector de productos, 3 tamaños, copias, preview, impresión nativa A4

### ERP Fase 1 (persistencia campañas) ✅ (17 de marzo de 2026)
- Modelo `Campaign` añadido a `prisma/schema.prisma` con todos los campos (segment, channel, status, metrics, scheduling)
- `prisma generate` ejecutado — Prisma Client regenerado con `prisma.campaign.*`
- API CRUD `/api/campaigns/route.ts` creada: GET (listado por tenant), POST (crea + estima audiencia real), PATCH (actualiza status/métricas), DELETE — todos protegidos con `requireAdmin`
- `CampañasTab.tsx` conectado a API real: carga inicial con `useEffect + fetch GET`, `handleCreate` → POST, `handleSend` → PATCH (status completada) + POST notify, `handleDelete` → DELETE; skeleton loader mientras carga; fallback optimista en caso de error de red
- `cashierId` en POS: ya existía desde antes (`auth.username` en `/api/sales`) — sin cambios necesarios
### ERP Fase 2 (UX campañas) ✅ (17 de marzo de 2026)
- `GET /api/campaigns/audience-count?segment=X` — nuevo endpoint, estima destinatarios reales por segmento desde BD (vip=loyaltyTier oro/diamante, inactivos=sales.none 30d, cumpleanos=birthday mes actual, deudores=creditBalance<0)
- `CreateModal` mejorado: dropdown "Usar plantilla" carga `/api/message-templates` y aplica body al textarea; contador de audiencia en tiempo real (debounce 400ms) muestra destinatarios estimados bajo el selector de segmento
- Modal de detalle mejorado: embudo de campaña visual con barras CSS (Entregados/Abiertos/Conversiones como % de totalAudience), visible solo cuando hay datos
### ERP Fase 3 (Comisiones BD + PDF campañas) ✅ (17 de marzo de 2026)
- Modelo `CommissionRule` añadido a `prisma/schema.prisma` (tramos por cajero: cashierId, minSales, maxSales, rate, label, tenantId)
- `prisma generate` + `prisma db push` ejecutados — tabla `CommissionRule` creada en BD
- API CRUD `/api/commission-rules/route.ts`: GET (listado por tenant), POST (crear tramo), PATCH (actualizar), DELETE — protegidos con `requireAdmin`
- `ComisionesTab.tsx` rediseñado: panel de configuración con reglas guardadas en BD, formulario para nueva regla por tramos, sección de tasa plana rápida (legacy); funciones `loadDbRules`, `handleAddTier`, `handleDeleteTier` conectadas a la API
- `CampañasTab.tsx`: función `exportCampaignPDF` añadida con jsPDF + autotable (encabezado, nombre+estado, bloque de mensaje, tabla de métricas con % de audiencia); botón "PDF" en footer del modal de detalle junto a Eliminar y Enviar
### ERP Fase 1 (Comisiones datos reales + tramos) ✅ (17 de marzo de 2026)
- `GET /api/commissions?from=&to=` ya existía — revisado y validado (0 errores): agrupa `Sale` por cashierId, resuelve nombres desde `AdminUser`, calcula COGS real (o 70% fallback)
- `ComisionesTab.tsx` `loadData()`: tras recibir datos reales de la API, sincroniza `rules` con todos los cajeros reales (preserva estado `paid`, agrega entrada default para nuevos)
- `withCommissions` useMemo: reemplazado por cálculo por tramos — busca en `dbRules` el tramo aplicable a `s.revenue` del cajero (minSales ≤ revenue < maxSales, maxSales null = sin límite), cae a tasa plana si no hay tramo en BD; expone `tierLabel` para mostrar nombre del tramo
- Columna "Tasa" en tabla desktop: muestra `{rate}% ({tierLabel})` cuando hay tramo activo; tarjeta mobile muestra label junto al %
- `loadDbRules`: eliminada la lógica de sincronización de tasa plana (redundante ahora que el useMemo hace lookup directo)