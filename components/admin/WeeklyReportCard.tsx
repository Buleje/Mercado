"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Download, Loader2, RefreshCw, TrendingUp, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type TopProduct = {
  name: string;
  quantity: number;
  revenue: number;
};

type DashboardData = {
  totalSales: number;
  totalOrders: number;
  averageTicket: number;
  topProducts: TopProduct[];
  lowStockAlerts: number;
  cashBalance: number;
};

type Sale = {
  id: string;
  createdAt: string;
  total: number;
  payment?: string;
  items?: { name: string; quantity: number; price: number }[];
};

type ExpenseSummary = {
  total?: number;
  byCategory?: Record<string, number>;
};

type WeeklyData = {
  dashboard: DashboardData | null;
  sales: Sale[];
  expenses: ExpenseSummary | null;
  margin: number;
  weekLabel: string;
  salesByDay: { label: string; total: number }[];
  lowStockCount: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function buildSalesByDay(sales: Sale[]): { label: string; total: number }[] {
  const DAYS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  const map: Record<string, number> = {};
  const { monday } = getWeekRange();

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    map[key] = 0;
  }

  for (const s of sales) {
    const key = s.createdAt.slice(0, 10);
    if (key in map) map[key] = (map[key] ?? 0) + (s.total ?? 0);
  }

  return Object.entries(map).map(([date, total]) => ({
    label: DAYS[new Date(date + "T12:00:00").getDay()],
    total,
  }));
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function WeeklyReportCard() {
  const [data, setData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, salesRes, expRes] = await Promise.all([
        fetch("/api/daily-report").then(r => r.ok ? r.json() : null).catch(() => null),
        fetch("/api/sales").then(r => r.ok ? r.json() : []).catch(() => []),
        fetch("/api/expenses/summary").then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const { monday, sunday } = getWeekRange();
      const allSales: Sale[] = Array.isArray(salesRes) ? salesRes : [];
      const weekSales = allSales.filter(s => {
        const d = new Date(s.createdAt);
        return d >= monday && d <= sunday;
      });

      const weekTotal = weekSales.reduce((sum, s) => sum + (s.total ?? 0), 0);
      const totalCost = weekSales.reduce((sum, s) => {
        const itemCost = (s.items ?? []).reduce((a, i) => a + i.price * i.quantity * 0.6, 0);
        return sum + itemCost;
      }, 0);
      const margin = weekTotal > 0 ? ((weekTotal - totalCost) / weekTotal) * 100 : 0;

      const weekLabel = `${monday.toLocaleDateString("es-PE", { day: "numeric", month: "short" })} — ${sunday.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })}`;

      setData({
        dashboard: dashRes,
        sales: weekSales,
        expenses: expRes,
        margin,
        weekLabel,
        salesByDay: buildSalesByDay(weekSales),
        lowStockCount: dashRes?.lowStockAlerts ?? 0,
      });
    } catch {
      setError("No se pudo cargar el reporte semanal.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh cada semana (7 dias en ms)
    const id = setInterval(fetchData, 7 * 24 * 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  const handleDownloadPdf = useCallback(async () => {
    if (!data) return;
    setGeneratingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const now = new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });

      // Header
      doc.setFillColor(45, 106, 79);
      doc.rect(0, 0, 210, 28, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("Buleje", 14, 12);
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Reporte Semanal de Gestion", 14, 20);
      doc.text(now, 196, 20, { align: "right" });

      // Periodo
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.text(`Semana: ${data.weekLabel}`, 14, 36);

      // KPIs
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(45, 106, 79);
      doc.text("RESUMEN FINANCIERO", 14, 46);

      const weekTotal = data.sales.reduce((sum, s) => sum + (s.total ?? 0), 0);
      const expTotal = (data.expenses as { total?: number } | null)?.total ?? 0;

      autoTable(doc, {
        startY: 50,
        head: [["Metrica", "Valor"]],
        body: [
          ["Ventas de la semana", fmt(weekTotal)],
          ["Numero de transacciones", String(data.sales.length)],
          ["Ticket promedio", fmt(data.sales.length > 0 ? weekTotal / data.sales.length : 0)],
          ["Margen promedio estimado", `${data.margin.toFixed(1)}%`],
          ["Gastos del periodo", fmt(expTotal)],
          ["Alertas de stock bajo", String(data.lowStockCount)],
        ],
        headStyles: { fillColor: [45, 106, 79], textColor: 255, fontStyle: "bold", fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        alternateRowStyles: { fillColor: [245, 250, 247] },
        margin: { left: 14, right: 14 },
      });

      // Ventas por dia
      const afterKpis = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(45, 106, 79);
      doc.text("VENTAS POR DIA", 14, afterKpis);

      autoTable(doc, {
        startY: afterKpis + 4,
        head: [["Dia", "Total (S/)"]],
        body: data.salesByDay.map(d => [d.label, fmt(d.total)]),
        headStyles: { fillColor: [45, 106, 79], textColor: 255, fontStyle: "bold", fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        alternateRowStyles: { fillColor: [245, 250, 247] },
        margin: { left: 14, right: 14 },
      });

      // Top productos
      const afterDays = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(45, 106, 79);
      doc.text("TOP 5 PRODUCTOS", 14, afterDays);

      const topProducts = (data.dashboard?.topProducts ?? []).slice(0, 5);
      autoTable(doc, {
        startY: afterDays + 4,
        head: [["Producto", "Cantidad", "Ingresos"]],
        body: topProducts.map(p => [p.name, String(p.quantity), fmt(p.revenue)]),
        headStyles: { fillColor: [45, 106, 79], textColor: 255, fontStyle: "bold", fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        alternateRowStyles: { fillColor: [245, 250, 247] },
        margin: { left: 14, right: 14 },
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.setFont("helvetica", "normal");
        doc.text("Buleje — Reporte generado automaticamente", 14, 290);
        doc.text(`Pag. ${i} / ${pageCount}`, 196, 290, { align: "right" });
      }

      doc.save(`reporte-semanal-${data.weekLabel.replace(/\s/g, "-")}.pdf`);
    } catch {
      alert("Error al generar el PDF. Intente de nuevo.");
    } finally {
      setGeneratingPdf(false);
    }
  }, [data]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const weekTotal = data?.sales.reduce((sum, s) => sum + (s.total ?? 0), 0) ?? 0;
  const maxDay = data ? Math.max(...data.salesByDay.map(d => d.total), 1) : 1;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900  overflow-hidden">
      {/* Header */}
      <div className="bg-[#00B4A6] px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-white" />
          <span className="text-white font-semibold text-sm">Reporte Semanal</span>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="text-white/70 hover:text-white transition-colors"
          aria-label="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Body */}
      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-[#00B4A6]" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-500 dark:text-red-400 text-center py-6">{error}</p>
        ) : data ? (
          <div className="space-y-5">
            {/* Periodo */}
            <p className="text-xs text-gray-500 dark:text-gray-400">{data.weekLabel}</p>

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Ventas</p>
                <p className="text-base font-bold text-gray-900 dark:text-white">{fmt(weekTotal)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Margen</p>
                <p className="text-base font-bold text-[#00B4A6] dark:text-emerald-400">
                  {data.margin.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Transac.</p>
                <p className="text-base font-bold text-gray-900 dark:text-white">{data.sales.length}</p>
              </div>
            </div>

            {/* Ventas por dia — barras simples */}
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                Ventas por dia
              </p>
              <div className="flex items-end gap-1 h-16">
                {data.salesByDay.map((d, i) => {
                  const pct = maxDay > 0 ? (d.total / maxDay) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t-sm bg-[#00B4A6] dark:bg-emerald-600 min-h-[2px] transition-all"
                        style={{ height: `${Math.max(pct, 2)}%` }}
                        title={fmt(d.total)}
                      />
                      <span className="text-[9px] text-gray-400">{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top productos */}
            {(data.dashboard?.topProducts?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
                  <Package className="h-3.5 w-3.5" />
                  Top productos
                </p>
                <ul className="space-y-1">
                  {(data.dashboard?.topProducts ?? []).slice(0, 5).map((p, i) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 dark:text-gray-300 truncate max-w-[60%]">{p.name}</span>
                      <span className="text-gray-500 dark:text-gray-400">{p.quantity} uds — {fmt(p.revenue)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Stock bajo */}
            {data.lowStockCount > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {data.lowStockCount} {data.lowStockCount === 1 ? "producto" : "productos"} con stock bajo
                </p>
              </div>
            )}

            {/* Boton PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={generatingPdf}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors",
                "bg-[#00B4A6] hover:bg-[#245a41] text-white",
                "disabled:opacity-60 disabled:cursor-not-allowed"
              )}
            >
              {generatingPdf ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generando PDF...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Descargar PDF
                </>
              )}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
