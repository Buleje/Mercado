"use client";

/**
 * Reporte Bancario — el PDF imprimible que se lleva al banco.
 *
 * Vivía dentro de `FinanzasModule.tsx` (1.420 líneas). Salió de ahí en la
 * unificación de Mi Plata: es una acción del módulo, no parte de su navegación.
 */

import { toast } from "sonner";
import {
  fetchFinanzas, n, monthIngresos,
  type SaleRaw, type OrderRaw,
} from "@/components/admin/finanzas/shared";

export function generarReporteBancario() {
  Promise.all([
    fetchFinanzas<Record<string, unknown> | null>("/api/expenses/summary", null),
    fetchFinanzas<unknown[]>("/api/sales?limit=5000", []),
    fetchFinanzas<Record<string, unknown> | null>("/api/analytics/kpis-v2", null),
    fetchFinanzas<unknown[]>("/api/orders?limit=5000", []),
  ])
    .then(([expenses, sales, kpis, orders]) => {
      const now = new Date();
      const allSales = (Array.isArray(sales) ? sales : []) as SaleRaw[];
      const allOrders = (Array.isArray(orders) ? orders : []) as OrderRaw[];
      const meses: Array<{ mes: string; ingresos: number; gastos: number; utilidad: number }> = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = d.toISOString().slice(0, 7);
        const label = d.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
        const ingresos = monthIngresos(monthKey, allSales, allOrders);
        let gastos = 0;
        if (expenses?.monthly && Array.isArray(expenses.monthly)) {
          const m = (expenses.monthly as Array<{ month: string; total?: number }>).find((e) => e.month === monthKey);
          gastos = n(m?.total);
        }
        meses.push({ mes: label, ingresos: Math.round(ingresos), gastos: Math.round(gastos), utilidad: Math.round(ingresos - gastos) });
      }

      const totalIngresos = meses.reduce((s, m) => s + m.ingresos, 0);
      const totalGastos = meses.reduce((s, m) => s + m.gastos, 0);
      const totalUtilidad = totalIngresos - totalGastos;
      const margen = totalIngresos > 0 ? ((totalUtilidad / totalIngresos) * 100).toFixed(1) : "0";
      const clientesActivos = kpis?.clientesActivos ?? kpis?.customersActive ?? "--";

      // Proyeccion
      const avgIngresosMensual = totalIngresos / 6;
      const proyeccion = Math.round(avgIngresosMensual * 1.05);

      const tablaRows = meses.map(m =>
        `<tr><td style="padding:8px;border:1px solid #ddd">${m.mes}</td><td style="padding:8px;border:1px solid #ddd;text-align:right">S/${m.ingresos.toLocaleString("es-PE")}</td><td style="padding:8px;border:1px solid #ddd;text-align:right">S/${m.gastos.toLocaleString("es-PE")}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-weight:bold;color:${m.utilidad >= 0 ? "var(--color-primary)" : "#e63946"}">S/${m.utilidad.toLocaleString("es-PE")}</td></tr>`
      ).join("");

      // Barras simples CSS
      const maxVal = Math.max(...meses.map(m => m.ingresos), 1);
      const barrasHtml = meses.map(m =>
        `<div style="display:flex;align-items:end;gap:4px;flex:1;flex-direction:column;text-align:center"><div style="background:var(--color-primary);width:30px;height:${Math.round((m.ingresos / maxVal) * 120)}px;border-radius:4px 4px 0 0"></div><div style="font-size:10px;color:#666">${m.mes.split(" ")[0].slice(0, 3)}</div></div>`
      ).join("");

      const fecha = now.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte Financiero - Buleje</title><style>:root{--color-primary:#00A0A0}body{font-family:'Segoe UI',Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#333;font-size:14px}h1{color:var(--color-primary);border-bottom:3px solid var(--color-primary);padding-bottom:10px;font-size:22px}h2{color:#333;margin-top:30px;font-size:16px;border-bottom:1px solid #ddd;padding-bottom:5px}table{width:100%;border-collapse:collapse;margin:15px 0}th{background:#f8f9fa;padding:10px 8px;border:1px solid #ddd;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.5px}td{padding:8px;font-size:13px}.kpi{display:inline-block;background:#f8f9fa;border:1px solid #ddd;border-radius:8px;padding:15px 20px;margin:5px;text-align:center;min-width:150px}.kpi-label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px}.kpi-value{font-size:20px;font-weight:bold;color:var(--color-primary);margin-top:4px}.footer{margin-top:40px;padding-top:15px;border-top:1px solid #ddd;color:#999;font-size:11px;text-align:center}@media print{body{padding:20px}}</style></head><body><h1>REPORTE FINANCIERO — Buleje</h1><p style="color:#666;font-size:12px">Período: últimos 6 meses &middot; Generado el ${fecha}</p><h2>1. Datos del Negocio</h2><table><tr><td style="padding:8px;border:1px solid #ddd;width:200px;font-weight:bold">Razon Social</td><td style="padding:8px;border:1px solid #ddd">Buleje</td></tr><tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Ubicacion</td><td style="padding:8px;border:1px solid #ddd">Pucallpa, Ucayali, Peru</td></tr><tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold">Giro</td><td style="padding:8px;border:1px solid #ddd">Comercio minorista - Abarrotes</td></tr></table><h2>2. Resumen de Ingresos</h2><table><thead><tr><th>Mes</th><th style="text-align:right">Ingresos</th><th style="text-align:right">Gastos</th><th style="text-align:right">Utilidad</th></tr></thead><tbody>${tablaRows}<tr style="background:#f0f0f0;font-weight:bold"><td style="padding:8px;border:1px solid #ddd">TOTAL</td><td style="padding:8px;border:1px solid #ddd;text-align:right">S/${totalIngresos.toLocaleString("es-PE")}</td><td style="padding:8px;border:1px solid #ddd;text-align:right">S/${totalGastos.toLocaleString("es-PE")}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;color:${totalUtilidad >= 0 ? "var(--color-primary)" : "#e63946"}">S/${totalUtilidad.toLocaleString("es-PE")}</td></tr></tbody></table><h2>3. Tendencia de Ingresos</h2><div style="display:flex;align-items:end;gap:8px;height:140px;padding:10px;background:#fafafa;border:1px solid #eee;border-radius:8px">${barrasHtml}</div><h2>4. Indicadores Clave</h2><div style="display:flex;flex-wrap:wrap;gap:5px"><div class="kpi"><div class="kpi-label">Margen de utilidad</div><div class="kpi-value">${margen}%</div></div><div class="kpi"><div class="kpi-label">Clientes activos</div><div class="kpi-value">${clientesActivos}</div></div><div class="kpi"><div class="kpi-label">Ingreso prom./mes</div><div class="kpi-value">S/${Math.round(avgIngresosMensual).toLocaleString("es-PE")}</div></div></div><h2>5. Proyeccion</h2><p>Basado en la tendencia de los últimos 6 meses, el ingreso estimado para el próximo mes es: <strong style="color:var(--color-primary);font-size:18px">S/${proyeccion.toLocaleString("es-PE")}</strong></p><div class="footer">Generado el ${fecha} — Buleje &middot; Este reporte es de caracter informativo</div></body></html>`;

      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
      }
    })
    .catch(() => {
      toast.error("Error al generar el reporte. Intenta nuevamente.");
    });
}
