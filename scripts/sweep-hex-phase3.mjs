#!/usr/bin/env node
/**
 * ADR-074 Phase 3 — Sweep dirigido de hex emerald/green a teal brand (#00B4A6)
 * en archivos donde el color representa SEMÁNTICA DE ÉXITO (no categoría).
 *
 * Excluye:
 *  - Palettes categóricas (CAT_COLORS, PAY_COLORS, PROV_COLORS): primera ocurrencia
 *    en la constante representa categoría (verde=frutas-verduras, verde=efectivo, etc.)
 *    No las tocamos — el user explicitó que chart palettes categóricas legítimas se respetan.
 *  - Tenant branding presets (StoreCustomizer, StoreCreativeMode): son opciones de color
 *    que el tenant elige; no son "success semantic".
 *  - Email templates HTML (color inlines para email clients que no soportan CSS vars).
 *  - AdminSidebar borderColor por grupo de módulos: categórico.
 *  - DeliveryRoutes/SalesOrders status palette: ya coloreada por estado específico.
 *
 * Archivos target (success semantic -> teal brand):
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

// Mapa archivo -> pares [from, to] para reemplazo literal.
// Tocamos SOLO ocurrencias claras de success semantic, no categorías.
const TARGETS = [
  // AIHealthPanel: ok/healthy status -> success
  ["components/admin/AIHealthPanel.tsx", [
    ['ok: { icon: CheckCircle2, color: "#22c55e"', 'ok: { icon: CheckCircle2, color: "#00B4A6"'],
    ['healthy: { color: "#22c55e"', 'healthy: { color: "#00B4A6"'],
  ]],
  // CreditScoreCard: color==="green" stroke -> success
  ["components/admin/CreditScoreCard.tsx", [
    ['color === "green" ? "#10b981"', 'color === "green" ? "#00B4A6"'],
  ]],
  // CustomKPITab: trend up -> success
  ["components/admin/CustomKPITab.tsx", [
    ['trend === "up" ? "#10b981"', 'trend === "up" ? "#00B4A6"'],
  ]],
  // LiveSalesWidget: goal reached -> success
  ["components/admin/LiveSalesWidget.tsx", [
    ['goalPct >= 100 ? "#10B981"', 'goalPct >= 100 ? "#00B4A6"'],
  ]],
  // NPSTab: score positive -> success
  ["components/admin/NPSTab.tsx", [
    ['nps >= 50 ? "#10b981"', 'nps >= 50 ? "#00B4A6"'],
  ]],
  // PrestamosDashboard: Pagados/recuperacion status -> success
  ["components/admin/prestamos/PrestamosDashboard.tsx", [
    ['{ name: "Pagados", value: statusCounts.PAGADO, color: "#10b981" }', '{ name: "Pagados", value: statusCounts.PAGADO, color: "#00B4A6" }'],
    ['accentColor="#10b981"', 'accentColor="#00B4A6"'],
    ['cuotasVencidas > 0 ? "#dc2626" : "#10b981"', 'cuotasVencidas > 0 ? "#dc2626" : "#00B4A6"'],
    ['tasaRecuperacion > 80 ? "#10b981"', 'tasaRecuperacion > 80 ? "#00B4A6"'],
  ]],
  // PrestamosModule: same semantic as dashboard
  ["components/admin/PrestamosModule.tsx", [
    ['{ name: "Pagados", value: statusCounts.PAGADO, color: "#10b981" }', '{ name: "Pagados", value: statusCounts.PAGADO, color: "#00B4A6" }'],
    ['accentColor="#10b981"', 'accentColor="#00B4A6"'],
    ['cuotasVencidas > 0 ? "#dc2626" : "#10b981"', 'cuotasVencidas > 0 ? "#dc2626" : "#00B4A6"'],
    ['tasaRecuperacion > 80 ? "#10b981"', 'tasaRecuperacion > 80 ? "#00B4A6"'],
    ['.paid { color: #059669; font-weight: bold; }', '.paid { color: #00B4A6; font-weight: bold; }'],
    ['.paid { color: #059669; }', '.paid { color: #00B4A6; }'],
  ]],
  // shared/RevenueChart.tsx: Revenue area stroke -> success (es el chart principal del hero)
  ["components/admin/shared/RevenueChart.tsx", [
    ['<stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />', '<stop offset="0%" stopColor="#00B4A6" stopOpacity={0.3} />'],
    ['<stop offset="100%" stopColor="#10b981" stopOpacity={0} />', '<stop offset="100%" stopColor="#00B4A6" stopOpacity={0} />'],
  ]],
  // BusinessOverviewChart: ventas area gradient -> success
  ["components/admin/smart-dashboard/BusinessOverviewChart.tsx", [
    ['<stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />', '<stop offset="0%" stopColor="#00B4A6" stopOpacity={0.15} />'],
    ['<stop offset="100%" stopColor="#10b981" stopOpacity={0} />', '<stop offset="100%" stopColor="#00B4A6" stopOpacity={0} />'],
  ]],
  // FinancialDashboard: KPI border "borderColor='#10b981'" (ingreso-positive)
  ["components/admin/shared/FinancialDashboard.tsx", [
    ['borderColor="#10b981"', 'borderColor="#00B4A6"'],
  ]],
  // BreakEvenTab: stroke color semántico (break-even line)
  ["components/admin/BreakEvenTab.tsx", [
    ['stroke="#10b981"', 'stroke="#00B4A6"'],
  ]],
  // FiadosModule: cobrados bar (success)
  ["components/admin/FiadosModule.tsx", [
    ['<Bar dataKey="cobrados" fill="#22c55e"', '<Bar dataKey="cobrados" fill="#00B4A6"'],
  ]],
  // cash-register/CashRegisterChart: ingresos stream
  ["components/admin/cash-register/CashRegisterChart.tsx", [
    ['stopColor="#22c55e" stopOpacity={0.4}', 'stopColor="#00B4A6" stopOpacity={0.4}'],
    ['stopColor="#22c55e" stopOpacity={0}', 'stopColor="#00B4A6" stopOpacity={0}'],
    ['stroke="#22c55e"', 'stroke="#00B4A6"'],
  ]],
  // inicio/CajaCharts: ingresos series
  ["components/admin/inicio/CajaCharts.tsx", [
    ['<Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} barSize={24} />',
     '<Bar dataKey="ingresos" name="Ingresos" fill="#00B4A6" radius={[4, 4, 0, 0]} barSize={24} />'],
    ['stroke="#10b981" fill="#10b98120" strokeWidth={2}', 'stroke="#00B4A6" fill="#00B4A620" strokeWidth={2}'],
    ['<Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />',
     '<Bar dataKey="ingresos" name="Ingresos" fill="#00B4A6" radius={[4, 4, 0, 0]} />'],
  ]],
  // inicio/CajaDashboard: Ventas/balance positivo
  ["components/admin/inicio/CajaDashboard.tsx", [
    ['{ concepto: "Ventas (pedidos)", monto: pOrders.reduce((a, o) => a + o.total, 0), tipo: "ingreso", color: "#10b981" }',
     '{ concepto: "Ventas (pedidos)", monto: pOrders.reduce((a, o) => a + o.total, 0), tipo: "ingreso", color: "#00B4A6" }'],
    ['utilidadNeta >= 0 ? "#10b981" : "#ef4444"', 'utilidadNeta >= 0 ? "#00B4A6" : "#ef4444"'],
  ]],
  // inicio/ClientesDashboard: tier top "S/ 500+" / "8+ compras" success
  ["components/admin/inicio/ClientesDashboard.tsx", [
    ['{ label: "S/ 500+", min: 500.01, max: Infinity, color: "#10b981" }',
     '{ label: "S/ 500+", min: 500.01, max: Infinity, color: "#00B4A6" }'],
    ['{ label: "8+ compras", min: 8, max: Infinity, color: "#10b981" }',
     '{ label: "8+ compras", min: 8, max: Infinity, color: "#00B4A6" }'],
  ]],
  // inicio/ComprasDashboard: Pagado (success)
  ["components/admin/inicio/ComprasDashboard.tsx", [
    ['{ key: "pagado", label: "Pagado", color: "#10b981" }', '{ key: "pagado", label: "Pagado", color: "#00B4A6" }'],
  ]],
  // inicio/InicioDashboard: Entregados success
  ["components/admin/inicio/InicioDashboard.tsx", [
    ['{ etapa: "Entregados", cantidad: allOrders.filter(o => o.status === "entregado").length, color: "#10b981" }',
     '{ etapa: "Entregados", cantidad: allOrders.filter(o => o.status === "entregado").length, color: "#00B4A6" }'],
  ]],
  // inicio/VentasDashboard: Entregados success + emerald spark
  ["components/admin/inicio/VentasDashboard.tsx", [
    ['{ etapa: "Entregados", cantidad: allPeriodOrders.filter(o => o.status === "entregado").length, color: "#10b981" }',
     '{ etapa: "Entregados", cantidad: allPeriodOrders.filter(o => o.status === "entregado").length, color: "#00B4A6" }'],
    ['spark: "#10b981"', 'spark: "#00B4A6"'],
  ]],
  // dashboard/DashboardVentasSection: svg stroke accent
  ["components/admin/dashboard/DashboardVentasSection.tsx", [
    ['stroke="#10b981" strokeWidth="2" strokeDasharray="3 2"', 'stroke="#00B4A6" strokeWidth="2" strokeDasharray="3 2"'],
    ['fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 3"',
     'fill="none" stroke="#00B4A6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 3"'],
  ]],
  // analytics/RFMSegmentationPanel: Champions icon color
  ["components/admin/analytics/RFMSegmentationPanel.tsx", [
    ['icon: Crown, color: "#059669"', 'icon: Crown, color: "#00B4A6"'],
  ]],
  // ai-center/ResumenSection: isToday fill
  ["components/admin/ai-center/sections/ResumenSection.tsx", [
    ['fill={entry.isToday ? "#059669" : "#6ee7b7"}', 'fill={entry.isToday ? "#00B4A6" : "#6ee7b7"}'],
  ]],
  // SalesOrdersTab: tiempo procesamiento umbral -> success
  ["components/admin/SalesOrdersTab.tsx", [
    ['tiempoProcesamiento.promedio < 30 ? \'#10b981\' : tiempoProcesamiento.promedio < 60 ? \'#f59e0b\' : \'#ef4444\'',
     'tiempoProcesamiento.promedio < 30 ? \'#00B4A6\' : tiempoProcesamiento.promedio < 60 ? \'#f59e0b\' : \'#ef4444\''],
  ]],
  // unified/FinanzasModule: health score total>70 success
  ["components/admin/unified/FinanzasModule.tsx", [
    ['score.total > 70 ? "#22c55e" : score.total >= 40 ? "#f59e0b" : "#ef4444"',
     'score.total > 70 ? "#00B4A6" : score.total >= 40 ? "#f59e0b" : "#ef4444"'],
    ['f.pts === f.max ? "#22c55e" : f.pts >= f.max * 0.6 ? "#f59e0b" : "#ef4444"',
     'f.pts === f.max ? "#00B4A6" : f.pts >= f.max * 0.6 ? "#f59e0b" : "#ef4444"'],
  ]],
  // TesoreriaModule: Ingresos area stroke/gradient (CAJA_FISICA dejamos = categoría cuenta)
  ["components/admin/TesoreriaModule.tsx", [
    ['<stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />', '<stop offset="0%" stopColor="#00B4A6" stopOpacity={0.3} />'],
    ['<stop offset="100%" stopColor="#10b981" stopOpacity={0} />', '<stop offset="100%" stopColor="#00B4A6" stopOpacity={0} />'],
    ['<Area type="monotone" dataKey="ingresos" stroke="#10b981" fill="url(#tresoIngGrad)" strokeWidth={2} />',
     '<Area type="monotone" dataKey="ingresos" stroke="#00B4A6" fill="url(#tresoIngGrad)" strokeWidth={2} />'],
  ]],
  // DeliveryTab/LiveMap: .completada { background: #16a34a } -> teal
  ["components/admin/DeliveryTab/LiveMap.tsx", [
    ['background: #16a34a;', 'background: #00B4A6;'],
  ]],
  // prestamos/PrestamoTimeline: (verificar después si hay hex residual)
];

let touched = 0;
let changes = 0;
const failed = [];

for (const [rel, pairs] of TARGETS) {
  const path = join(ROOT, rel);
  let src;
  try { src = readFileSync(path, "utf8"); }
  catch (e) { failed.push({ rel, err: e.message }); continue; }
  let out = src;
  let fileChanges = 0;
  for (const [from, to] of pairs) {
    const idx = out.indexOf(from);
    if (idx < 0) {
      failed.push({ rel, missingFrom: from.slice(0, 60) });
      continue;
    }
    out = out.split(from).join(to);
    fileChanges++;
  }
  if (out !== src) {
    writeFileSync(path, out, "utf8");
    touched++;
    changes += fileChanges;
  }
}

console.log(`Files modified: ${touched}`);
console.log(`Total substitutions: ${changes}`);
if (failed.length) {
  console.log(`\nFailures (${failed.length}):`);
  for (const f of failed) console.log(" ", f);
}
