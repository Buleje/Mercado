"use client";

import { useState, useMemo, useCallback } from "react";
import { Download, FileText, Clock, ChevronDown, ChevronUp, MessageCircle, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, BarChart3, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BusinessData } from "./AICommandCenter";

/* ── Types ── */
type SectionGrade = "excelente" | "bien" | "regular" | "alerta" | "critico";

type ReportSection = {
  title: string;
  emoji: string;
  content: string;
  grade: SectionGrade;
  highlights: string[];
};

type KPISummary = {
  label: string;
  value: string;
  delta?: number;
  unit?: string;
};

type Recommendation = {
  text: string;
  priority: "critica" | "importante" | "sugerencia";
  category: string;
};

type WeeklyReport = {
  id: string;
  generatedAt: string;
  weekLabel: string;
  kpis: KPISummary[];
  sections: ReportSection[];
  recommendations: Recommendation[];
  overallGrade: SectionGrade;
  readingTimeMin: number;
};

type SavedReport = {
  id: string;
  generatedAt: string;
  weekLabel: string;
  grade: SectionGrade;
};

const GRADE_CONFIG: Record<SectionGrade, { label: string; emoji: string; color: string; bg: string }> = {
  excelente: { label: "Excelente", emoji: "🌟", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  bien: { label: "Bien", emoji: "✅", color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30" },
  regular: { label: "Regular", emoji: "➡️", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
  alerta: { label: "Alerta", emoji: "⚠️", color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/30" },
  critico: { label: "Crítico", emoji: "🔴", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30" },
};

/* ── Report Generator ── */
function generateReport(data: BusinessData | null): WeeklyReport | null {
  if (!data) return null;

  const { products, orders, sales, customers, expenses } = data;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const twoWeekAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);

  const validOrders = orders.filter((o) => o.status !== "cancelado");

  const revAndTxns = (from: string, to: string) => {
    const ord = validOrders.filter((o) => { const d = o.createdAt?.slice(0, 10) ?? ""; return d >= from && d <= to; });
    const sal = sales.filter((s) => { const d = s.createdAt?.slice(0, 10) ?? ""; return d >= from && d <= to; });
    return {
      rev: ord.reduce((s, o) => s + o.total, 0) + sal.reduce((s, sl) => s + sl.total, 0),
      txns: ord.length + sal.length,
    };
  };

  const thisWeek = revAndTxns(weekAgo, today);
  const lastWeek = revAndTxns(twoWeekAgo, weekAgo);
  const weekDelta = lastWeek.rev > 0 ? ((thisWeek.rev - lastWeek.rev) / lastWeek.rev) * 100 : 0;
  const avgTicket = thisWeek.txns > 0 ? thisWeek.rev / thisWeek.txns : 0;
  const lastAvgTicket = lastWeek.txns > 0 ? lastWeek.rev / lastWeek.txns : 0;
  const ticketDelta = lastAvgTicket > 0 ? ((avgTicket - lastAvgTicket) / lastAvgTicket) * 100 : 0;

  const fmt = (n: number) => `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Best/worst day
  const dayRevs: { label: string; rev: number; date: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const ds = d.toISOString().slice(0, 10);
    const r = revAndTxns(ds, ds);
    dayRevs.push({ label: d.toLocaleDateString("es-PE", { weekday: "long" }), rev: r.rev, date: ds });
  }
  const sorted = [...dayRevs].sort((a, b) => b.rev - a.rev);
  const bestDay = sorted[0];
  const worstDay = sorted[sorted.length - 1];

  // Inventory
  const activeProducts = products.filter((p) => p.active !== false);
  const outOfStock = activeProducts.filter((p) => (p.stock ?? 0) === 0);
  const lowStock = activeProducts.filter((p) => p.stock != null && p.stockMin != null && p.stock > 0 && p.stock <= p.stockMin);
  const expiringProducts = activeProducts.filter((p) => {
    if (!p.expiryDate) return false;
    const daysLeft = Math.ceil((new Date(p.expiryDate).getTime() - Date.now()) / 86400000);
    return daysLeft <= 7 && daysLeft >= 0;
  });

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
  const customerRetention = customers.length > 0 ? (activeCustomers / customers.length) * 100 : 0;

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
  const topProducts = Object.values(qtyMap).sort((a, b) => b.qty - a.qty).slice(0, 5);

  // Finances
  const expWeek = expenses.totalWeek ?? (expenses.totalMonth ? expenses.totalMonth / 4 : 0);
  const profit = thisWeek.rev - expWeek;
  const margin = thisWeek.rev > 0 ? (profit / thisWeek.rev) * 100 : 0;

  // Fiados
  const fiados = orders.filter((o) => o.status === "FIADO" || (o as Record<string, unknown>).paymentMethod === "FIADO");
  const totalDebt = fiados.reduce((s, o) => s + (o.total ?? 0), 0);

  // Cancelled
  const cancelledWeek = orders.filter((o) => o.status === "cancelado" && (o.createdAt?.slice(0, 10) ?? "") >= weekAgo).length;

  const weekLabel = `${new Date(weekAgo).toLocaleDateString("es-PE", { day: "numeric", month: "short" })} - ${new Date(today).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}`;

  // ── KPIs ──
  const kpis: KPISummary[] = [
    { label: "Ventas", value: fmt(thisWeek.rev), delta: weekDelta, unit: "vs semana anterior" },
    { label: "Transacciones", value: String(thisWeek.txns), delta: lastWeek.txns > 0 ? ((thisWeek.txns - lastWeek.txns) / lastWeek.txns) * 100 : 0 },
    { label: "Ticket Promedio", value: fmt(avgTicket), delta: ticketDelta },
    { label: "Clientes Activos", value: String(activeCustomers), unit: `de ${customers.length}` },
    { label: "Margen", value: `${margin.toFixed(1)}%`, unit: margin >= 20 ? "saludable" : "bajo" },
    { label: "Fiados", value: fmt(totalDebt), unit: `${fiados.length} pendientes` },
  ];

  // ── Grade per section ──
  const salesGrade: SectionGrade = weekDelta > 10 ? "excelente" : weekDelta > 0 ? "bien" : weekDelta > -10 ? "regular" : weekDelta > -20 ? "alerta" : "critico";
  const inventoryGrade: SectionGrade = outOfStock.length === 0 && lowStock.length === 0 ? "excelente" : outOfStock.length <= 2 && lowStock.length <= 3 ? "bien" : outOfStock.length <= 5 ? "regular" : "alerta";
  const customersGrade: SectionGrade = customerRetention > 40 ? "excelente" : customerRetention > 25 ? "bien" : customerRetention > 15 ? "regular" : "alerta";
  const financesGrade: SectionGrade = margin >= 25 ? "excelente" : margin >= 20 ? "bien" : margin >= 15 ? "regular" : margin >= 10 ? "alerta" : "critico";

  // ── Sections ──
  const sections: ReportSection[] = [
    {
      title: "Resumen Ejecutivo",
      emoji: "📊",
      grade: salesGrade,
      highlights: [
        `${fmt(thisWeek.rev)} en ventas`,
        `${weekDelta >= 0 ? "+" : ""}${weekDelta.toFixed(1)}% vs anterior`,
        `${thisWeek.txns} transacciones`,
      ],
      content: thisWeek.rev > 0
        ? `Esta semana vendiste ${fmt(thisWeek.rev)}, un ${weekDelta >= 0 ? "+" : ""}${weekDelta.toFixed(1)}% ${weekDelta >= 0 ? "más" : "menos"} que la semana anterior (${fmt(lastWeek.rev)}). Procesaste ${thisWeek.txns} transacciones con un ticket promedio de ${fmt(avgTicket)}${ticketDelta !== 0 ? ` (${ticketDelta >= 0 ? "+" : ""}${ticketDelta.toFixed(1)}%)` : ""}. ${bestDay && bestDay.rev > 0 ? `Tu mejor día fue el ${bestDay.label} con ${fmt(bestDay.rev)}.` : ""} ${worstDay && sorted.length > 1 ? `El día más flojo fue el ${worstDay.label}.` : ""}`
        : `No se registraron ventas esta semana. Verifica que el punto de venta esté configurado correctamente.`,
    },
    {
      title: "Ventas",
      emoji: "🛒",
      grade: salesGrade,
      highlights: topProducts.slice(0, 3).map((p) => `${p.name}: ${p.qty} und`),
      content: (() => {
        let text = `Ventas totales: ${fmt(thisWeek.rev)} en ${thisWeek.txns} transacciones. `;
        if (topProducts.length > 0) {
          text += `Los más vendidos: ${topProducts.slice(0, 3).map((p) => `${p.name} (${p.qty} und, ${fmt(p.rev)})`).join(", ")}. `;
        }
        if (cancelledWeek > 0) {
          text += `Hubo ${cancelledWeek} pedido${cancelledWeek > 1 ? "s" : ""} cancelado${cancelledWeek > 1 ? "s" : ""} esta semana. `;
        }
        // Category analysis
        const categories: Record<string, number> = {};
        for (const s of sales.filter((s) => (s.createdAt?.slice(0, 10) ?? "") >= weekAgo)) {
          for (const i of s.items) {
            const cat = (i as Record<string, unknown>).category as string ?? "General";
            categories[cat] = (categories[cat] ?? 0) + i.price * i.quantity;
          }
        }
        const topCats = Object.entries(categories).sort(([, a], [, b]) => b - a).slice(0, 3);
        if (topCats.length > 1) {
          text += `Categorías principales: ${topCats.map(([c, v]) => `${c} (${fmt(v)})`).join(", ")}.`;
        }
        return text;
      })(),
    },
    {
      title: "Inventario",
      emoji: "📦",
      grade: inventoryGrade,
      highlights: [
        `${activeProducts.length} productos activos`,
        outOfStock.length > 0 ? `${outOfStock.length} agotados` : "Sin agotados",
        expiringProducts.length > 0 ? `${expiringProducts.length} por vencer` : "Sin vencimientos",
      ],
      content: (() => {
        let text = `${activeProducts.length} productos activos en catálogo. `;
        if (outOfStock.length > 0) {
          text += `⚠️ ${outOfStock.length} producto${outOfStock.length > 1 ? "s" : ""} agotado${outOfStock.length > 1 ? "s" : ""}: ${outOfStock.slice(0, 3).map((p) => p.name).join(", ")}${outOfStock.length > 3 ? "..." : ""}. `;
        }
        if (lowStock.length > 0) {
          text += `${lowStock.length} con stock bajo: ${lowStock.slice(0, 3).map((p) => `${p.name} (${p.stock} und)`).join(", ")}. `;
        }
        if (expiringProducts.length > 0) {
          text += `${expiringProducts.length} producto${expiringProducts.length > 1 ? "s" : ""} por vencer esta semana — aplicar descuento o retirar. `;
        }
        if (outOfStock.length === 0 && lowStock.length === 0 && expiringProducts.length === 0) {
          text += "Todos los niveles de inventario están saludables. No se detectaron quiebres ni productos próximos a vencer.";
        }
        return text;
      })(),
    },
    {
      title: "Clientes",
      emoji: "👥",
      grade: customersGrade,
      highlights: [
        `${activeCustomers} activos esta semana`,
        `${newWeek} nuevos`,
        `${customerRetention.toFixed(0)}% retención`,
      ],
      content: `${activeCustomers} clientes compraron esta semana (${customerRetention.toFixed(0)}% de tu base de ${customers.length}). ${newWeek > 0 ? `Se incorporaron ${newWeek} cliente${newWeek > 1 ? "s" : ""} nuevo${newWeek > 1 ? "s" : ""}.` : "No se captaron clientes nuevos."} ${customerRetention < 20 ? "La retención es baja — considera ofertas de reactivación para clientes inactivos." : customerRetention > 40 ? "La participación de clientes es excelente." : "La retención está en un nivel aceptable."}`,
    },
    {
      title: "Finanzas",
      emoji: "💰",
      grade: financesGrade,
      highlights: [
        `Utilidad: ${fmt(profit)}`,
        `Margen: ${margin.toFixed(1)}%`,
        totalDebt > 0 ? `Fiados: ${fmt(totalDebt)}` : "Sin fiados",
      ],
      content: (() => {
        let text = `Ingresos: ${fmt(thisWeek.rev)}. `;
        if (expWeek > 0) {
          text += `Gastos estimados: ${fmt(expWeek)}. Utilidad: ${fmt(profit)} (margen ${margin.toFixed(1)}%). `;
          text += margin >= 20 ? "El margen está en rango saludable." : "El margen está por debajo del 20% recomendado — revisar costos.";
        } else {
          text += "Sin datos de gastos para calcular margen.";
        }
        if (totalDebt > 0) {
          text += ` Fiados pendientes: ${fmt(totalDebt)} de ${fiados.length} cliente${fiados.length > 1 ? "s" : ""}.`;
        }
        return text;
      })(),
    },
    {
      title: "Plan Próxima Semana",
      emoji: "🎯",
      grade: "bien",
      highlights: ["Acciones priorizadas", "Basadas en datos", "Enfoque semana entrante"],
      content: (() => {
        const actions: string[] = [];
        if (outOfStock.length > 0) actions.push(`Reabastecer ${outOfStock.length} productos agotados antes del lunes.`);
        if (weekDelta < -10) actions.push("Lanzar una promoción de inicio de semana para recuperar ventas.");
        if (newWeek === 0) actions.push("Implementar acción de captación: descuento de primera compra o programa de referidos.");
        if (margin < 15) actions.push("Revisar precios de los 10 productos más vendidos para mejorar margen.");
        if (totalDebt > 500) actions.push(`Priorizar cobro de fiados — S/${totalDebt.toFixed(0)} pendientes.`);
        if (expiringProducts.length > 0) actions.push(`Liquidar ${expiringProducts.length} productos por vencer con descuento.`);
        if (actions.length === 0) actions.push("Mantener el ritmo actual y enfocarse en optimizar el ticket promedio.");
        actions.push("Revisar proveedores y comparar precios para la siguiente compra.");
        return actions.slice(0, 4).map((a, i) => `${i + 1}. ${a}`).join(" ");
      })(),
    },
  ];

  // ── Recommendations ──
  const recommendations: Recommendation[] = [];

  if (outOfStock.length > 0) {
    recommendations.push({ text: `Reponer urgente: ${outOfStock.slice(0, 2).map((p) => p.name).join(" y ")} — cada día sin stock pierde ventas.`, priority: "critica", category: "inventario" });
  }
  if (weekDelta < -15) {
    recommendations.push({ text: `Ventas cayeron ${Math.abs(weekDelta).toFixed(0)}%. Investigar causa: ¿stock? ¿competencia? ¿estacionalidad?`, priority: "critica", category: "ventas" });
  }
  if (margin > 0 && margin < 15) {
    recommendations.push({ text: `Margen ${margin.toFixed(1)}% — por debajo del objetivo. Subir precios de productos de alta rotación.`, priority: "importante", category: "finanzas" });
  }
  if (totalDebt > 500) {
    recommendations.push({ text: `S/${totalDebt.toFixed(0)} en fiados. Contactar morosos esta semana — ofrecer descuento por pago inmediato.`, priority: "importante", category: "cobranza" });
  }
  if (newWeek === 0) {
    recommendations.push({ text: "Cero clientes nuevos. Lanzar promo de referidos: 10% descuento al que recomiende.", priority: "importante", category: "clientes" });
  }
  if (cancelledWeek > 2) {
    recommendations.push({ text: `${cancelledWeek} pedidos cancelados. Investigar causas: disponibilidad, tiempos, errores.`, priority: "importante", category: "operaciones" });
  }
  if (expiringProducts.length > 0) {
    recommendations.push({ text: `${expiringProducts.length} productos por vencer — liquidar con descuento antes de perderlos.`, priority: "importante", category: "inventario" });
  }
  if (weekDelta > 15) {
    recommendations.push({ text: `Gran semana (+${weekDelta.toFixed(0)}%). Asegurar stock de los más vendidos para mantener ritmo.`, priority: "sugerencia", category: "ventas" });
  }
  if (customerRetention < 20) {
    recommendations.push({ text: `Solo ${customerRetention.toFixed(0)}% de retención. Enviar WhatsApp a clientes inactivos con oferta.`, priority: "sugerencia", category: "clientes" });
  }
  recommendations.push({ text: "Comparar precios de tus 5 productos más vendidos con competidores cercanos.", priority: "sugerencia", category: "precios" });

  // Overall grade
  const grades = sections.map((s) => s.grade);
  const gradeScore = { excelente: 5, bien: 4, regular: 3, alerta: 2, critico: 1 };
  const avgScore = grades.reduce((s, g) => s + gradeScore[g], 0) / grades.length;
  const overallGrade: SectionGrade = avgScore >= 4.5 ? "excelente" : avgScore >= 3.5 ? "bien" : avgScore >= 2.5 ? "regular" : avgScore >= 1.5 ? "alerta" : "critico";

  return {
    id: `report-${Date.now()}`,
    generatedAt: now.toISOString(),
    weekLabel,
    kpis,
    sections,
    recommendations: recommendations.slice(0, 5),
    overallGrade,
    readingTimeMin: Math.max(2, Math.ceil(sections.reduce((s, sec) => s + sec.content.length, 0) / 800)),
  };
}

/* ── PDF Export ── */
async function exportToPDF(report: WeeklyReport) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 20;
  const contentWidth = 170;
  let y = margin;

  const addText = (text: string, fontSize: number, bold = false, color: [number, number, number] = [30, 30, 30]) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, contentWidth);
    if (y + lines.length * (fontSize * 0.4) > 280) { doc.addPage(); y = margin; }
    doc.text(lines, margin, y);
    y += lines.length * (fontSize * 0.4) + 2;
  };

  doc.setFillColor(45, 106, 79);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Buleje — Reporte Semanal", margin, 12);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Semana: ${report.weekLabel}  |  Generado: ${new Date(report.generatedAt).toLocaleDateString("es-PE")}  |  Calificación: ${GRADE_CONFIG[report.overallGrade].label}`, margin, 20);
  y = 38;

  // KPIs
  addText("Indicadores Clave", 12, true, [45, 106, 79]);
  const kpiLine = report.kpis.map((k) => `${k.label}: ${k.value}${k.delta ? ` (${k.delta >= 0 ? "+" : ""}${k.delta.toFixed(1)}%)` : ""}`).join("  |  ");
  addText(kpiLine, 9, false, [50, 50, 50]);
  y += 3;

  for (const section of report.sections) {
    addText(`${section.emoji} ${section.title} — ${GRADE_CONFIG[section.grade].label}`, 11, true, [45, 106, 79]);
    addText(section.content, 9, false, [50, 50, 50]);
    y += 3;
  }

  y += 2;
  addText("Recomendaciones", 12, true, [45, 106, 79]);
  report.recommendations.forEach((rec, i) => {
    const prefix = rec.priority === "critica" ? "[CRÍTICA] " : rec.priority === "importante" ? "[IMPORTANTE] " : "";
    addText(`${i + 1}. ${prefix}${rec.text}`, 9, false, [50, 50, 50]);
  });

  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text("Centro de Comando IA — Buleje", margin, 287);
  doc.save(`reporte-semanal-${report.weekLabel.replace(/\s/g, "-")}.pdf`);
}

/* ── WhatsApp Share ── */
function generateWhatsAppSummary(report: WeeklyReport): string {
  let msg = `📊 *Reporte Semanal — ${report.weekLabel}*\n`;
  msg += `Calificación: ${GRADE_CONFIG[report.overallGrade].emoji} ${GRADE_CONFIG[report.overallGrade].label}\n\n`;

  msg += `📈 *KPIs:*\n`;
  report.kpis.forEach((k) => {
    msg += `• ${k.label}: ${k.value}${k.delta ? ` (${k.delta >= 0 ? "+" : ""}${k.delta.toFixed(1)}%)` : ""}${k.unit ? ` ${k.unit}` : ""}\n`;
  });

  msg += `\n🔑 *Highlights:*\n`;
  report.sections.slice(0, 3).forEach((s) => {
    msg += `${s.emoji} ${s.title}: ${GRADE_CONFIG[s.grade].emoji}\n`;
    s.highlights.slice(0, 2).forEach((h) => { msg += `  • ${h}\n`; });
  });

  msg += `\n💡 *Recomendaciones Top:*\n`;
  report.recommendations.slice(0, 3).forEach((r, i) => {
    msg += `${i + 1}. ${r.text}\n`;
  });

  return msg;
}

/* ── Saved Reports ── */
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
    const entry: SavedReport = { id: report.id, generatedAt: report.generatedAt, weekLabel: report.weekLabel, grade: report.overallGrade };
    const updated = [entry, ...existing].slice(0, 12);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

/* ── Component ── */
interface Props {
  data: BusinessData | null;
}

export default function AIWeeklyReport({ data }: Props) {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [exporting, setExporting] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [savedReports] = useState<SavedReport[]>(loadSavedReports);
  const [showAllRecs, setShowAllRecs] = useState(false);

  const generated = useMemo(() => generateReport(data), [data]);

  const handleGenerate = useCallback(() => {
    if (!generated) return;
    setReport(generated);
    saveReportToHistory(generated);
    setExpandedSections(new Set([generated.sections[0]?.title]));
  }, [generated]);

  const handleExport = useCallback(async () => {
    if (!report) return;
    setExporting(true);
    try { await exportToPDF(report); } catch (e) { console.error("[AIWeeklyReport] PDF export failed:", e); }
    finally { setExporting(false); }
  }, [report]);

  const handleWhatsApp = useCallback(() => {
    if (!report) return;
    const text = generateWhatsAppSummary(report);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }, [report]);

  const toggleSection = useCallback((title: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  }, []);

  const priorityOrder = { critica: 0, importante: 1, sugerencia: 2 };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Reporte Semanal IA
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Análisis narrativo generado con datos reales
          </p>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <>
              <button onClick={handleWhatsApp} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors">
                <MessageCircle className="w-3 h-3" /> WhatsApp
              </button>
              <button onClick={handleExport} disabled={exporting} className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors", "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50", exporting && "opacity-50 cursor-not-allowed")}>
                <Download className="w-3 h-3" /> PDF
              </button>
            </>
          )}
          <button onClick={handleGenerate} disabled={!data} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors", "bg-[#00B4A6] text-white hover:bg-[#009690]", !data && "opacity-40 cursor-not-allowed")}>
            <FileText className="w-3.5 h-3.5" />
            {report ? "Regenerar" : "Generar reporte"}
          </button>
        </div>
      </div>

      {!report ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <FileText className="w-10 h-10 text-gray-200 dark:text-gray-700" />
          <p className="text-sm text-gray-400 text-center">Genera el reporte para ver un resumen completo del negocio.</p>
          {savedReports.length > 0 && (
            <div className="mt-2 text-center">
              <p className="text-xs text-gray-400 mb-1">Reportes anteriores:</p>
              {savedReports.slice(0, 4).map((r) => (
                <div key={r.id} className="flex items-center gap-1.5 text-xs text-gray-400 justify-center">
                  <Clock className="w-3 h-3" /> {r.weekLabel} {GRADE_CONFIG[r.grade]?.emoji ?? ""}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Overall grade + week info */}
          <div className="flex items-center gap-3 mb-4">
            <div className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold", GRADE_CONFIG[report.overallGrade].color, GRADE_CONFIG[report.overallGrade].bg)}>
              {GRADE_CONFIG[report.overallGrade].emoji} Semana {GRADE_CONFIG[report.overallGrade].label}
            </div>
            <span className="text-xs text-gray-400">{report.weekLabel}</span>
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" /> ~{report.readingTimeMin} min lectura
            </span>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
            {report.kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2.5 text-center">
                <div className="text-sm font-bold text-gray-800 dark:text-gray-200">{kpi.value}</div>
                <div className="text-[10px] text-gray-500 font-medium">{kpi.label}</div>
                {kpi.delta !== undefined && kpi.delta !== 0 && (
                  <div className={cn("text-[10px] font-bold flex items-center justify-center gap-0.5", kpi.delta > 0 ? "text-emerald-600" : "text-red-500")}>
                    {kpi.delta > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {kpi.delta > 0 ? "+" : ""}{kpi.delta.toFixed(1)}%
                  </div>
                )}
                {kpi.unit && !kpi.delta && (
                  <div className="text-[10px] text-gray-400">{kpi.unit}</div>
                )}
              </div>
            ))}
          </div>

          {/* Sections */}
          <div className="flex flex-col gap-2 mb-4">
            {report.sections.map((section) => {
              const isExp = expandedSections.has(section.title);
              const grCfg = GRADE_CONFIG[section.grade];
              return (
                <div key={section.title} className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    onClick={() => toggleSection(section.title)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{section.emoji}</span>
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{section.title}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold", grCfg.color, grCfg.bg)}>
                        {grCfg.emoji} {grCfg.label}
                      </span>
                    </div>
                    {isExp ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                  </button>
                  {!isExp && (
                    <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                      {section.highlights.map((h, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                          {h}
                        </span>
                      ))}
                    </div>
                  )}
                  {isExp && (
                    <div className="px-4 pb-3 border-t border-gray-100 dark:border-gray-800">
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed pt-2">{section.content}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Recommendations */}
          <div className="rounded-lg bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10 border border-[#00B4A6]/15 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-[#00B4A6] dark:text-[#2dd4bf] uppercase tracking-wide">
                Recomendaciones ({report.recommendations.length})
              </h3>
              {report.recommendations.length > 3 && (
                <button onClick={() => setShowAllRecs(!showAllRecs)} className="text-[10px] text-[#00B4A6] dark:text-[#2dd4bf] hover:underline">
                  {showAllRecs ? "Ver menos" : "Ver todas"}
                </button>
              )}
            </div>
            <ol className="flex flex-col gap-2">
              {(showAllRecs ? report.recommendations : report.recommendations.slice(0, 3))
                .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
                .map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <span className={cn(
                      "mt-0.5 flex-shrink-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center",
                      rec.priority === "critica" ? "bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400" :
                      rec.priority === "importante" ? "bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400" :
                      "bg-[#00B4A6]/20 text-[#00B4A6] dark:text-[#2dd4bf]"
                    )}>
                      {rec.priority === "critica" ? "!" : rec.priority === "importante" ? "•" : String(i + 1)}
                    </span>
                    <div>
                      <span>{rec.text}</span>
                      <span className="text-[10px] text-gray-400 ml-1 capitalize">[{rec.category}]</span>
                    </div>
                  </li>
                ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}