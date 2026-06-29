import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "../components/admin/unified");
fs.mkdirSync(dir, { recursive: true });

const modules = [
  {
    name: "POSCajaModule",
    imports: [
      ["POSView", "@/components/admin/POSView"],
      ["CashRegisterTab", "@/components/admin/CashRegisterTab"],
      ["CashAuditTab", "@/components/admin/CashAuditTab"],
      ["ShiftControlTab", "@/components/admin/ShiftControlTab"],
    ],
    tabs: [
      ["pos", "Punto de Venta"],
      ["caja", "Caja Registradora"],
      ["arqueo", "Arqueo de Caja"],
      ["turnos", "Control de Turnos"],
    ],
  },
  {
    name: "InventarioAlmacenesModule",
    imports: [
      ["InventoryTab", "@/components/admin/InventoryTab"],
      ["KardexTab", "@/components/admin/KardexTab"],
      ["BatchesTab", "@/components/admin/BatchesTab"],
      ["PhysicalInventoryTab", "@/components/admin/PhysicalInventoryTab"],
      ["ShrinkageTab", "@/components/admin/ShrinkageTab"],
      ["WarehouseTab", "@/components/admin/WarehouseTab"],
      ["WarehouseLocationTab", "@/components/admin/WarehouseLocationTab"],
      ["WarehouseTransferTab", "@/components/admin/WarehouseTransferTab"],
    ],
    tabs: [
      ["stock", "Stock"],
      ["kardex", "Kardex"],
      ["lotes", "Lotes y Vcto"],
      ["fisico", "Inv. Físico"],
      ["mermas", "Mermas"],
      ["almacenes", "Almacenes"],
      ["ubicaciones", "Ubicaciones"],
      ["transferencias", "Transferencias"],
    ],
  },
  {
    name: "ReposicionModule",
    imports: [
      ["AutoReorderTab", "@/components/admin/AutoReorderTab"],
      ["DynamicReorderTab", "@/components/admin/DynamicReorderTab"],
      ["DemandPredictionTab", "@/components/admin/DemandPredictionTab"],
    ],
    tabs: [
      ["auto", "Auto-Reorden"],
      ["dinamico", "Reorden Dinámico"],
      ["prediccion", "Predicción IA"],
    ],
  },
  {
    name: "CatalogoTiendaModule",
    imports: [
      ["CategoriesEditorTab", "@/components/admin/CategoriesEditorTab"],
      ["CombosEditorTab", "@/components/admin/CombosEditorTab"],
      ["BundlesTab", "@/components/admin/BundlesTab"],
      ["KitManagerTab", "@/components/admin/KitManagerTab"],
      ["HomepageEditorTab", "@/components/admin/HomepageEditorTab"],
    ],
    tabs: [
      ["categorias", "Categorías"],
      ["combos-editor", "Editor Combos"],
      ["combos", "Combos / Bundles"],
      ["kits", "Kits"],
      ["homepage", "Página de Inicio"],
    ],
  },
  {
    name: "PreciosPromosModule",
    imports: [
      ["PriceBenchmarkTab", "@/components/admin/PriceBenchmarkTab"],
      ["PriceHistoryTab", "@/components/admin/PriceHistoryTab"],
      ["PromotionsTab", "@/components/admin/PromotionsTab"],
      ["CouponsTab", "@/components/admin/CouponsTab"],
      ["ABTestsTab", "@/components/admin/ABTestsTab"],
    ],
    tabs: [
      ["benchmark", "Benchmark"],
      ["historial", "Historial"],
      ["promociones", "Promociones"],
      ["cupones", "Cupones"],
      ["ab-tests", "A/B Tests"],
    ],
  },
  {
    name: "ComprasModule",
    imports: [
      ["PurchaseOrdersTab", "@/components/admin/PurchaseOrdersTab"],
      ["PurchasePlanningTab", "@/components/admin/PurchasePlanningTab"],
      ["PurchaseApprovalTab", "@/components/admin/PurchaseApprovalTab"],
      ["PurchaseContractsTab", "@/components/admin/PurchaseContractsTab"],
      ["RFQTab", "@/components/admin/RFQTab"],
      ["ReceivingTab", "@/components/admin/ReceivingTab"],
    ],
    tabs: [
      ["ordenes", "Órdenes"],
      ["planificacion", "Planificación"],
      ["aprobaciones", "Aprobaciones"],
      ["contratos", "Contratos"],
      ["cotizaciones", "Cotizaciones (RFQ)"],
      ["recepcion", "Recepción"],
    ],
  },
  {
    name: "ProveedoresModule",
    imports: [
      ["SuppliersTab", "@/components/admin/SuppliersTab"],
      ["SupplierPortalTab", "@/components/admin/SupplierPortalTab"],
      ["SupplierEvaluationsTab", "@/components/admin/SupplierEvaluationsTab"],
      ["SupplierQualityTab", "@/components/admin/SupplierQualityTab"],
      ["SupplierPaymentsTab", "@/components/admin/SupplierPaymentsTab"],
    ],
    tabs: [
      ["directorio", "Directorio"],
      ["portal", "Portal"],
      ["evaluaciones", "Evaluaciones"],
      ["calidad", "Calidad"],
      ["pagos", "Pagos"],
    ],
  },
  {
    name: "LogisticaModule",
    imports: [
      ["DeliveryCalendarTab", "@/components/admin/DeliveryCalendarTab"],
      ["DeliveryRoutesTab", "@/components/admin/DeliveryRoutesTab"],
      ["DeliveryScheduleTab", "@/components/admin/DeliveryScheduleTab"],
      ["ShipmentTrackingTab", "@/components/admin/ShipmentTrackingTab"],
      ["ShippingCostsTab", "@/components/admin/ShippingCostsTab"],
      ["FleetManagementTab", "@/components/admin/FleetManagementTab"],
      ["ReturnLogisticsTab", "@/components/admin/ReturnLogisticsTab"],
    ],
    tabs: [
      ["calendario", "Calendario"],
      ["rutas", "Rutas"],
      ["horarios", "Horarios"],
      ["seguimiento", "Seguimiento"],
      ["costos", "Costos Envío"],
      ["flota", "Flota"],
      ["logistica-rev", "Logística Reversa"],
    ],
  },
  {
    name: "DevolucionesCalidadModule",
    imports: [
      ["ReturnsTab", "@/components/admin/ReturnsTab"],
      ["AdvancedReturnsTab", "@/components/admin/AdvancedReturnsTab"],
      ["QualityControlTab", "@/components/admin/QualityControlTab"],
      ["AnomalyDetectionTab", "@/components/admin/AnomalyDetectionTab"],
    ],
    tabs: [
      ["devoluciones", "Devoluciones"],
      ["avanzadas", "Avanzadas"],
      ["calidad", "Control Calidad"],
      ["anomalias", "Anomalías"],
    ],
  },
  // VentasMarketingModule: recipe OBSOLETO removido (2026-06-28). La
  // consolidación real pasó por CrecimientoHubModule (MarketingAutomationTab) y
  // AnalisisHubModule (ForecastingDashboard); SalesForecastTab/ConversionMetricsTab/
  // ReferralTab quedaron huérfanos y se borraron. Este script ya no es
  // source-of-truth (los unified se editan a mano), pero se limpia la receta
  // para no referenciar archivos inexistentes.
  {
    name: "CRMClientesModule",
    imports: [
      ["CRMTab", "@/components/admin/CRMTab"],
      ["Customer360Tab", "@/components/admin/Customer360Tab"],
      ["CustomerSegmentationTab", "@/components/admin/CustomerSegmentationTab"],
      ["AutoSegmentsTab", "@/components/admin/AutoSegmentsTab"],
      ["CLVAnalyticsTab", "@/components/admin/CLVAnalyticsTab"],
    ],
    tabs: [
      ["crm", "CRM"],
      ["vista-360", "Vista 360°"],
      ["segmentacion", "Segmentación"],
      ["segmentos-auto", "Segmentos Auto"],
      ["clv", "CLV / Cohortes"],
    ],
  },
  {
    name: "FidelizacionModule",
    imports: [
      ["LoyaltyTab", "@/components/admin/LoyaltyTab"],
      ["PointsProgramTab", "@/components/admin/PointsProgramTab"],
      ["WishListAdminTab", "@/components/admin/WishListAdminTab"],
    ],
    tabs: [
      ["fidelizacion", "Fidelización"],
      ["puntos", "Programa Puntos"],
      ["wishlist", "Wish Lists"],
    ],
  },
  {
    name: "EncuestasSoporteModule",
    imports: [
      ["NPSTab", "@/components/admin/NPSTab"],
      ["SurveysTab", "@/components/admin/SurveysTab"],
      ["SupportTicketsTab", "@/components/admin/SupportTicketsTab"],
    ],
    tabs: [
      ["nps", "NPS"],
      ["encuestas", "Encuestas"],
      ["soporte", "Tickets"],
    ],
  },
  {
    name: "AnalyticsBIModule",
    imports: [
      ["BusinessIntelligenceTab", "@/components/admin/BusinessIntelligenceTab"],
      ["HeatMapTab", "@/components/admin/HeatMapTab"],
      ["ABCAnalysisTab", "@/components/admin/ABCAnalysisTab"],
      ["ParetoAnalysisTab", "@/components/admin/ParetoAnalysisTab"],
      ["BCGMatrixTab", "@/components/admin/BCGMatrixTab"],
      ["BasketAnalysisTab", "@/components/admin/BasketAnalysisTab"],
      ["CustomKPITab", "@/components/admin/CustomKPITab"],
    ],
    tabs: [
      ["bi", "Business Intelligence"],
      ["mapa-calor", "Mapa de Calor"],
      ["abc", "Análisis ABC"],
      ["pareto", "Pareto"],
      ["bcg", "Matriz BCG"],
      ["cesta", "Análisis Cesta"],
      ["kpi", "KPIs Personalizados"],
    ],
  },
  {
    name: "ProyeccionesModule",
    imports: [
      ["ScenarioSimulatorTab", "@/components/admin/ScenarioSimulatorTab"],
      ["SeasonalityTab", "@/components/admin/SeasonalityTab"],
      ["PeriodComparatorTab", "@/components/admin/PeriodComparatorTab"],
    ],
    tabs: [
      ["simulador", "Simulador"],
      ["estacionalidad", "Estacionalidad"],
      ["comparador", "Comparador"],
    ],
  },
  {
    name: "FinanzasModule",
    imports: [
      ["PLTab", "@/components/admin/PLTab"],
      ["BalanceSheetTab", "@/components/admin/BalanceSheetTab"],
      ["CashFlowTab", "@/components/admin/CashFlowTab"],
      ["BudgetTab", "@/components/admin/BudgetTab"],
      ["BudgetVsRealTab", "@/components/admin/BudgetVsRealTab"],
      ["BreakEvenTab", "@/components/admin/BreakEvenTab"],
      ["ProfitabilityTab", "@/components/admin/ProfitabilityTab"],
    ],
    tabs: [
      ["pl", "P&G"],
      ["balance", "Balance General"],
      ["flujo-caja", "Flujo de Caja"],
      ["presupuestos", "Presupuestos"],
      ["ppto-real", "Ppto vs Real"],
      ["break-even", "Punto Equilibrio"],
      ["rentabilidad", "Rentabilidad"],
      ["margenes", "Márgenes"],
    ],
  },
  {
    name: "TesoreríaModule",
    imports: [
      ["TreasuryTab", "@/components/admin/TreasuryTab"],
      ["LiquidityForecastTab", "@/components/admin/LiquidityForecastTab"],
      ["CheckManagementTab", "@/components/admin/CheckManagementTab"],
      ["BankReconciliationTab", "@/components/admin/BankReconciliationTab"],
      ["CollectionCenterTab", "@/components/admin/CollectionCenterTab"],
      ["AccountsReceivableTab", "@/components/admin/AccountsReceivableTab"],
    ],
    tabs: [
      ["tesoreria", "Tesorería"],
      ["liquidez", "Proyección Liquidez"],
      ["cheques", "Cheques"],
      ["conciliacion", "Conciliación"],
      ["cobros", "Centro Cobros"],
      ["cxc", "Cuentas x Cobrar"],
    ],
  },
  {
    name: "FacturacionModule",
    imports: [
      ["InvoicingTab", "@/components/admin/InvoicingTab"],
      ["EInvoiceTab", "@/components/admin/EInvoiceTab"],
      ["TaxTab", "@/components/admin/TaxTab"],
      ["PayablesTab", "@/components/admin/PayablesTab"],
    ],
    tabs: [
      ["facturacion", "Facturación"],
      ["e-factura", "Factura Electrónica"],
      ["impuestos", "Impuestos"],
      ["cxp", "Cuentas x Pagar"],
    ],
  },
  {
    name: "GastosActivosModule",
    imports: [
      ["ExpensesTab", "@/components/admin/ExpensesTab"],
      ["CostCenterTab", "@/components/admin/CostCenterTab"],
      ["InsuranceTab", "@/components/admin/InsuranceTab"],
      ["AssetManagerTab", "@/components/admin/AssetManagerTab"],
    ],
    tabs: [
      ["gastos", "Gastos"],
      ["centros-costo", "Centros de Costo"],
      ["seguros", "Pólizas y Seguros"],
      ["activos", "Activos Fijos"],
    ],
  },
  {
    name: "RRHHModule",
    imports: [
      ["HRTab", "@/components/admin/HRTab"],
      ["PayrollTab", "@/components/admin/PayrollTab"],
      ["BranchesTab", "@/components/admin/BranchesTab"],
    ],
    tabs: [
      ["rrhh", "Recursos Humanos"],
      ["nomina", "Nómina"],
      ["sucursales", "Sucursales"],
    ],
  },
  {
    name: "ProyectosTareasModule",
    imports: [
      ["ProjectsTab", "@/components/admin/ProjectsTab"],
      ["TasksTab", "@/components/admin/TasksTab"],
      ["KanbanBoardTab", "@/components/admin/KanbanBoardTab"],
      ["GoalsTab", "@/components/admin/GoalsTab"],
      ["GoalTrackerTab", "@/components/admin/GoalTrackerTab"],
    ],
    tabs: [
      ["proyectos", "Proyectos"],
      ["tareas", "Tareas"],
      ["kanban", "Kanban"],
      ["metas", "Metas & KPIs"],
      ["tablero", "Tablero Metas"],
    ],
  },
  {
    name: "ComunicacionesModule",
    imports: [
      ["CommunicationHubTab", "@/components/admin/CommunicationHubTab"],
      ["AdminChatTab", "@/components/admin/AdminChatTab"],
      ["MessageTemplatesTab", "@/components/admin/MessageTemplatesTab"],
      ["NotificationsTab", "@/components/admin/NotificationsTab"],
    ],
    tabs: [
      ["hub", "Hub"],
      ["chat", "Chat Interno"],
      ["plantillas", "Plantillas"],
      ["notificaciones", "Notificaciones"],
    ],
  },
  {
    name: "AlertasAutomModule",
    imports: [
      ["AutoAlertEngineTab", "@/components/admin/AutoAlertEngineTab"],
      ["SmartRemindersTab", "@/components/admin/SmartRemindersTab"],
      ["WorkflowTemplatesTab", "@/components/admin/WorkflowTemplatesTab"],
      ["BusinessRulesTab", "@/components/admin/BusinessRulesTab"],
    ],
    tabs: [
      ["alertas", "Alertas Automáticas"],
      ["recordatorios", "Recordatorios"],
      ["flujos", "Flujos de Trabajo"],
      ["reglas", "Reglas de Negocio"],
    ],
  },
  {
    name: "ReportesDocModule",
    imports: [
      ["ReportsTab", "@/components/admin/ReportsTab"],
      ["AutoReportsTab", "@/components/admin/AutoReportsTab"],
      ["ImportExportTab", "@/components/admin/ImportExportTab"],
      ["DocumentManagerTab", "@/components/admin/DocumentManagerTab"],
    ],
    tabs: [
      ["reportes", "Reportes"],
      ["auto", "Automáticos"],
      ["importar-exportar", "Importar / Exportar"],
      ["documentos", "Documentos"],
    ],
  },
  {
    name: "AgendaUtilidadesModule",
    imports: [
      ["SharedCalendarTab", "@/components/admin/SharedCalendarTab"],
      ["QuickNotesTab", "@/components/admin/QuickNotesTab"],
      ["SavedFiltersTab", "@/components/admin/SavedFiltersTab"],
    ],
    tabs: [
      ["calendario", "Calendario"],
      ["notas", "Notas Rápidas"],
      ["filtros", "Filtros Guardados"],
    ],
  },
  {
    name: "SeguridadModule",
    imports: [
      ["AdminUsersTab", "@/components/admin/AdminUsersTab"],
      ["RolePermissionsTab", "@/components/admin/RolePermissionsTab"],
      ["SecurityLogsTab", "@/components/admin/SecurityLogsTab"],
      ["AuditLogTab", "@/components/admin/AuditLogTab"],
      ["ActivityLogTab", "@/components/admin/ActivityLogTab"],
      ["ComplianceTab", "@/components/admin/ComplianceTab"],
    ],
    tabs: [
      ["usuarios", "Usuarios"],
      ["roles", "Roles y Permisos"],
      ["logs", "Logs Seguridad"],
      ["auditoria", "Auditoría"],
      ["actividad", "Actividad"],
      ["cumplimiento", "Cumplimiento"],
    ],
  },
  {
    name: "SistemaModule",
    imports: [
      ["SystemHealthTab", "@/components/admin/SystemHealthTab"],
      ["BackupRestoreTab", "@/components/admin/BackupRestoreTab"],
      ["WebhooksTab", "@/components/admin/WebhooksTab"],
    ],
    tabs: [
      ["salud", "Salud del Sistema"],
      ["backup", "Backup y Restaurar"],
      ["webhooks", "Webhooks"],
    ],
  },
];

function gen(m) {
  const importLines = m.imports
    .map(([name, importPath]) => `const ${name} = dynamic(() => import("${importPath}"), { loading: S });`)
    .join("\n");

  const tabDefs = m.tabs
    .map(([id, label]) => `  { id: "${id}" as const, label: "${label}" },`)
    .join("\n");

  const renders = m.tabs
    .map(([id], i) => `      {sub === "${id}" && <${m.imports[i][0]} />}`)
    .join("\n");

  return `"use client";
import { useState } from "react";
import dynamic from "next/dynamic";

const S = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

${importLines}

const TABS = [
${tabDefs}
];

export default function ${m.name}() {
  const [sub, setSub] = useState(TABS[0].id);
  return (
    <div className="space-y-6">
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-card-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={\`px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-colors border-b-2 \${
              sub === t.id
                ? "border-primary text-primary"
                : "border-transparent text-gray-500 dark:text-muted hover:text-gray-700 dark:hover:text-foreground"
            }\`}
          >
            {t.label}
          </button>
        ))}
      </div>
${renders}
    </div>
  );
}
`;
}

let count = 0;
for (const m of modules) {
  const filePath = path.join(dir, `${m.name}.tsx`);
  fs.writeFileSync(filePath, gen(m), "utf-8");
  count++;
  console.log(`  ✓ ${m.name}.tsx`);
}
console.log(`\nCreated ${count} unified module files in components/admin/unified/`);
