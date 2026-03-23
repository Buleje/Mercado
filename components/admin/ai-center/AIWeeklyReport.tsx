"use client";

import { useState, useMemo } from "react";
import { Download, FileText, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

// ── Types ──────────────────────────────────────────────────────────────────────

type ReportSection = {
  title: string;
  content: string;
};

type WeeklyReport = {
  id: string;
  generatedAt: string;
  weekLabel: string;
  sections: ReportSection[];
  recommendations: string[];
};

type SavedReport = {
  id: string;
  generatedAt: string;
  weekLabel: string;
};

// ── Report generator ───────────────────────────────────────────────────────────

function generateReport(data: BusinessData | null): WeeklyReport | null {
  if (!data) return null;

  const { products, orders, sales, customers, expenses } = data;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const twoWeekAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);

  const validOrders = orders.filter((o) => o.status !== "cancelado");

  const revAndTxns = (from: string, to: string) => {
    const ord = validOrders.filter((o) => {
      const d = o.createdAt?.slice(0, 10) ?? "";
      return d >= from && d <= to;
    });
    const sal = sales.filter((s) => {
      const d = s.createdAt?.slice(0, 10) ?? "";
      return d >= from && d <= to;
    });
    return {
      rev: ord.reduce((s, o) => s + o.total, 0) + sal.reduce((s, sl) => s + sl.total, 0),
      txns: ord.length + sal.length,
    };
  };

  const thisWeek = revAndTxns(weekAgo, today);
  const lastWeek = revAndTxns(twoWeekAgo, weekAgo);
  const weekDelta = lastWeek.rev > 0 ? ((thisWeek.rev - lastWeek.rev) / lastWeek.rev) * 100 : 0;
  const avgTicket = thisWeek.txns > 0 ? thisWeek.rev / thisWeek.txns : 0;

  const fmt = (n: number) => `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Best day of the week
  const dayRevs: { label: string; rev: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const ds = d.toISOString().slice(0, 10);
    const r = revAndTxns(ds, ds);
    dayRevs.push({ label: d.toLocaleDateString("es-PE", { weekday: "long" }), rev: r.rev });
  }
  const bestDay = dayRevs.sort((a, b) => b.rev - a.rev)[0];

  // Inventory
  const activeProducts = products.filter((p) => p.active !== false);
  const outOfStock = activeProducts.filter((p) => (p.stock ?? 0) === 0);
  const lowStock = activeProducts.filter(
    (p) => p.stock != null && p.stockMin != null && p.stock > 0 && p.stock <= p.stockMin
  );

  // Customers
  const newWeek = customers.filter((c) => (c.createdAt?.slice(0, 10) ?? "") >= weekAgo).length;
  const recentBuyers = new Set<string>();
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo)) {
    if (s.customerPhone) recentBuyers.add(s.customerPhone);
  }
  for (const o of validOrders.filter((o) => (o.createdAt?.slice(0, 10) ?? "") >= weekAgo)) {
    if (o.customer?.phone) recentBuyers.add(o.customer.phone);
  }
  const activeCustomers = recentBuyers.size;

  // Top products
  const qtyMap: Record<string, { name: string; qty: number; rev: number }> = {};
  for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo)) {
    for (const i of s.items) {
      const pid = String(i.productId);
      if (!qtyMap[pid]) qtyMap[pid] = { name: i.name, qty: 0, rev: 0 };
      qtyMap[pid].qty += i.quantity;
      qtyMap[pid].rev += i.price * i.quantity;
    }
  }
  const topProducts = Object.values(qtyMap).sort((a, b) => b.qty - a.qty).slice(0, 3);

  // Finances
  const expWeek = expenses.totalWeek ?? expenses.totalMonth ? (expenses.totalMonth! / 4) : 0;
  const profit = thisWeek.rev - expWeek;
  const margin = thisWeek.rev > 0 ? (profit / thisWeek.rev) * 100 : 0;

  // Cancelled
  const cancelledWeek = orders.filter(
    (o) => o.status === "cancelado" && (o.createdAt?.slice(0, 10) ?? "") >= weekAgo
  ).length;

  const weekLabel = `${new Date(weekAgo).toLocaleDateString("es-PE", { day: "numeric", month: "short" })} - ${new Date(today).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}`;

  // ── Sections ────────────────────────────────────────────────────────

  const sections: ReportSection[] = [
    {
      title: "Resumen Ejecutivo",
      content: thisWeek.rev > 0
        ? `Esta semana vendiste ${fmt(thisWeek.rev)}, un ${weekDelta >= 0 ? "+" : ""}${weekDelta.toFixed(1)}% ${weekDelta >= 0 ? "mas" : "menos"} que la semana anterior (${fmt(lastWeek.rev)}). Procesaste ${thisWeek.txns} transacciones con un ticket promedio de ${fmt(avgTicket)}. El negocio ${weekDelta >= 0 ? "mantiene una tendencia positiva" : "requiere atencion en el area de ventas"} esta semana.`
        : `Esta semana no se registraron ventas en el sistema. Verifica que el punto de venta este correctamente configurado y registrando las transacciones.`,
    },
    {
      title: "Ventas",
      content: (() => {
        let text = `Las ventas de la semana totalizaron ${fmt(thisWeek.rev)} en ${thisWeek.txns} transacciones. `;
        if (bestDay && bestDay.rev > 0) text += `Tu mejor dia fue el ${bestDay.label} con ${fmt(bestDay.rev)}. `;
        if (topProducts.length > 0) {
          text += `Los productos mas vendidos fueron: ${topProducts.map((p) => `${p.name} (${p.qty} unidades)`).join(", ")}. `;
        }
        if (cancelledWeek > 0) text += `Se cancelaron ${cancelledWeek} pedido${cancelledWeek > 1 ? "s" : ""} durante la semana.`;
        return text;
      })(),
    },
    {
      title: "Inventario",
      content: outOfStock.length === 0 && lowStock.length === 0
        ? `El inventario se mantuvo en buen estado durante la semana. Los ${activeProducts.length} productos activos tienen niveles de stock adecuados. No se registraron quiebres de stock significativos.`
        : `La semana mostro problemas de inventario que requieren atencion. ${outOfStock.length > 0 ? `${outOfStock.length} producto${outOfStock.length > 1 ? "s" : ""} se agotaron: ${outOfStock.slice(0, 3).map((p) => p.name).join(", ")}${outOfStock.length > 3 ? "..." : ""}. ` : ""}${lowStock.length > 0 ? `Adicionalmente, ${lowStock.length} producto${lowStock.length > 1 ? "s" : ""} llegaron a stock critico: ${lowStock.slice(0, 3).map((p) => p.name).join(", ")}.` : ""}`,
    },
    {
      title: "Clientes",
      content: `Esta semana atendiste a ${activeCustomers} clientes activos${newWeek > 0 ? `, incorporando ${newWeek} cliente${newWeek > 1 ? "s" : ""} nuevo${newWeek > 1 ? "s" : ""}` : ""}. ${customers.length > 0 ? `Tu base total es de ${customers.length} clientes registrados. ` : ""}${activeCustomers < customers.length * 0.3 ? `Solo el ${((activeCustomers / customers.length) * 100).toFixed(0)}% de tu base compro esta semana — hay oportunidad de reactivacion.` : "La participacion de clientes esta en un nivel saludable."}`,
    },
    {
      title: "Finanzas",
      content: (() => {
        let text = `Ingresos de la semana: ${fmt(thisWeek.rev)}. `;
        if (expWeek > 0) {
          text += `Gastos estimados del periodo: ${fmt(expWeek)}. `;
          text += `Utilidad aproximada: ${fmt(profit)} (margen ${margin.toFixed(1)}%). `;
          text += margin >= 20
            ? "El margen se mantiene en un rango saludable para el tipo de negocio."
            : "El margen esta por debajo del 20% recomendado — revisar estructura de costos.";
        } else {
          text += "No hay datos de gastos para calcular el margen de esta semana.";
        }
        return text;
      })(),
    },
  ];

  // ── Recommendations ──────────────────────────────────────────────────

  const recommendations: string[] = [];

  if (outOfStock.length > 0) {
    recommendations.push(`Reponer urgente: ${outOfStock.slice(0, 2).map((p) => p.name).join(" y ")} estan agotados — cada dia sin stock es revenue perdido.`);
  }
  if (weekDelta < -10) {
    recommendations.push("Las ventas bajaron mas del 10% esta semana. Analizar si fue por falta de stock, menos trafico o competencia. Considera una promocion de fin de semana.");
  } else if (weekDelta > 10) {
    recommendations.push(`Excelente semana — creciste ${weekDelta.toFixed(0)}% vs la anterior. Asegurate de mantener stock de los productos mas vendidos para sostener el ritmo.`);
  }
  if (newWeek === 0) {
    recommendations.push("No captaste clientes nuevos esta semana. Considera una accion de marketing simple: descuento para primera compra o referidos.");
  }
  if (margin > 0 && margin < 15) {
    recommendations.push(`Margen del ${margin.toFixed(1)}% — por debajo del objetivo. Revisa los precios de tus productos mas vendidos y considera reducir gastos variables.`);
  }
  if (cancelledWeek > 2) {
    recommendations.push(`${cancelledWeek} pedidos cancelados esta semana. Investiga las causas principales: puede ser problemas de stock, tiempos de entrega o errores en el sistema.`);
  }
  if (recommendations.length < 3) {
    recommendations.push("Revisa semanalmente los precios de tus 5 productos mas vendidos comparandolos con competidores cercanos.");
  }

  return {
    id: `report-${Date.now()}`,
    generatedAt: now.toISOString(),
    weekLabel,
    sections,
    recommendations: recommendations.slice(0, 3),
  };
}

// ── PDF Export ─────────────────────────────────────────────────────────────────

async function exportToPDF(report: WeeklyReport) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 20;
  const pageWidth = 210;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const addText = (text: string, fontSize: number, bold = false, color: [number, number, number] = [30, 30, 30]) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, contentWidth);
    if (y + lines.length * (fontSize * 0.4) > 280) {
      doc.addPage();
      y = margin;
    }
    doc.text(lines, margin, y);
    y += lines.length * (fontSize * 0.4) + 2;
    return y;
  };

  // Header
  doc.setFillColor(45, 106, 79);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Bodega San Martin — Reporte Semanal", margin, 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Semana: ${report.weekLabel}  |  Generado: ${new Date(report.generatedAt).toLocaleDateString("es-PE")}`, margin, 20);

  y = 38;

  // Sections
  for (const section of report.sections) {
    addText(section.title, 12, true, [45, 106, 79]);
    addText(section.content, 9, false, [50, 50, 50]);
    y += 3;
  }

  // Recommendations
  y += 2;
  addText("Recomendaciones", 12, true, [45, 106, 79]);
  report.recommendations.forEach((rec, i) => {
    addText(`${i + 1}. ${rec}`, 9, false, [50, 50, 50]);
  });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text("Centro de Comando IA — Bodega San Martin", margin, 287);
  doc.text(`Pagina 1 de ${doc.internal.pages.length - 1}`, pageWidth - margin, 287, { align: "right" });

  doc.save(`reporte-semanal-${report.weekLabel.replace(/\s/g, "-")}.pdf`);
}

// ── Saved reports key ──────────────────────────────────────────────────────────

const STORAGE_KEY = "ai-weekly-reports";

function loadSavedReports(): SavedReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveReportToHistory(report: WeeklyReport) {
  try {
    const existing = loadSavedReports();
    const entry: SavedReport = { id: report.id, generatedAt: report.generatedAt, weekLabel: report.weekLabel };
    const updated = [entry, ...existing].slice(0, 10);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  data: BusinessData | null;
}

export default function AIWeeklyReport({ data }: Props) {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [exporting, setExporting] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [savedReports] = useState<SavedReport[]>(loadSavedReports);

  const generated = useMemo(() => generateReport(data), [data]);

  const handleGenerate = () => {
    if (!generated) return;
    setReport(generated);
    saveReportToHistory(generated);
    setExpandedSection(null);
  };

  const handleExport = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await exportToPDF(report);
    } catch (e) {
      console.error("[AIWeeklyReport] PDF export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Reporte Semanal IA
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Texto narrativo generado con datos reales del negocio
          </p>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700",
                "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700",
                exporting && "opacity-50 cursor-not-allowed"
              )}
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? "Exportando..." : "Descargar PDF"}
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={!data}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              "bg-[#2d6a4f] text-white hover:bg-[#245a42]",
              !data && "opacity-40 cursor-not-allowed"
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            {report ? "Regenerar" : "Generar reporte"}
          </button>
        </div>
      </div>

      {!report ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <FileText className="w-10 h-10 text-gray-200 dark:text-gray-700" />
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center">
            Genera el reporte semanal para ver un resumen narrativo completo del negocio.
          </p>
          {savedReports.length > 0 && (
            <div className="mt-2 text-center">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Reportes anteriores:</p>
              <div className="flex flex-col gap-1">
                {savedReports.slice(0, 3).map((r) => (
                  <div key={r.id} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    {r.weekLabel} — {new Date(r.generatedAt).toLocaleDateString("es-PE")}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#2d6a4f]/10 text-[#2d6a4f] dark:text-[#52b788] font-semibold">
              Semana: {report.weekLabel}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Generado {new Date(report.generatedAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          {/* Sections */}
          <div className="flex flex-col gap-2 mb-4">
            {report.sections.map((section) => {
              const isExp = expandedSection === section.title;
              return (
                <div key={section.title} className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    onClick={() => setExpandedSection(isExp ? null : section.title)}
                  >
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{section.title}</span>
                    {isExp ? (
                      <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                  </button>
                  {isExp && (
                    <div className="px-4 pb-3 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed pt-2">
                        {section.content}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Recommendations */}
          <div className="rounded-lg bg-[#2d6a4f]/5 dark:bg-[#2d6a4f]/10 border border-[#2d6a4f]/15 p-4">
            <h3 className="text-xs font-semibold text-[#2d6a4f] dark:text-[#52b788] uppercase tracking-wide mb-2">
              Recomendaciones de la semana
            </h3>
            <ol className="flex flex-col gap-2">
              {report.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-[#2d6a4f]/20 text-[#2d6a4f] dark:text-[#52b788] text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  {rec}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
