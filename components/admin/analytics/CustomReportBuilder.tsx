"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
type Metric = "ventas" | "margen" | "stock" | "clientes" | "pedidos";
type Grouping = "dia" | "semana" | "mes";
type PaymentFilter = "todos" | "efectivo" | "yape" | "plin" | "tarjeta";

interface ReportConfig {
  id: string;
  name: string;
  metrics: Metric[];
  period: { from: string; to: string };
  grouping: Grouping;
  category: string;
  payment: PaymentFilter;
  createdAt: string;
}

interface ReportRow {
  period: string;
  ventas?: number;
  margen?: number;
  stock?: number;
  clientes?: number;
  pedidos?: number;
}

// ── Data source (simulated from real API shape) ────────────────────────────────
// In production these would be passed as props or fetched
interface CustomReportBuilderProps {
  sales?: { total: number; createdAt: string; payment?: string; items?: { name?: string; price?: number; quantity?: number; productId?: string | number }[] }[];
  products?: { id: string | number; name: string; category?: string; price?: number; costPrice?: number; stock?: number }[];
  customers?: { phone?: string; createdAt?: string }[];
  orders?: { id: string; status: string; createdAt: string; total: number }[];
}

// ── Constants ──────────────────────────────────────────────────────────────────
const METRIC_LABELS: Record<Metric, string> = {
  ventas: "Ventas (S/)",
  margen: "Margen (%)",
  stock: "Stock total",
  clientes: "Clientes nuevos",
  pedidos: "Pedidos",
};

const GROUPING_LABELS: Record<Grouping, string> = {
  dia: "Por dia",
  semana: "Por semana",
  mes: "Por mes",
};

const PAYMENT_LABELS: Record<PaymentFilter, string> = {
  todos: "Todos los metodos",
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
};

const STORAGE_KEY = "analyticsReportTemplates";

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtNum(n: number, metric: Metric): string {
  if (metric === "ventas") {
    return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (metric === "margen") return `${n.toFixed(1)}%`;
  return n.toLocaleString("es-PE");
}

function getPeriodKey(dateStr: string, grouping: Grouping): string {
  const d = new Date(dateStr);
  if (grouping === "dia") return d.toISOString().slice(0, 10);
  if (grouping === "mes") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  // Week: ISO week
  const startOfWeek = new Date(d);
  startOfWeek.setDate(d.getDate() - d.getDay() + 1);
  return `Sem ${startOfWeek.toISOString().slice(0, 10)}`;
}

function formatPeriodLabel(key: string, grouping: Grouping): string {
  if (grouping === "dia") {
    try {
      return new Date(key + "T12:00:00").toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });
    } catch { return key; }
  }
  if (grouping === "mes") {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  }
  return key;
}

// ── Step indicators ────────────────────────────────────────────────────────────
function StepBadge({ step, current }: { step: number; current: number }) {
  return (
    <div
      className={cn(
        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
        current === step
          ? "bg-[#00B4A6] text-white"
          : current > step
          ? "bg-[#00B4A6]/30 text-[#00B4A6] dark:text-[#2dd4bf]"
          : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500"
      )}
    >
      {step}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function CustomReportBuilder({
  sales = [],
  products = [],
  customers = [],
  orders: _orders = [],
}: CustomReportBuilderProps) {
  const [step, setStep] = useState<number>(1);

  // Step 1 — Metrics
  const [selectedMetrics, setSelectedMetrics] = useState<Metric[]>(["ventas"]);

  // Step 2 — Period & grouping
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [grouping, setGrouping] = useState<Grouping>("dia");

  // Step 3 — Filters
  const [category, setCategory] = useState<string>("todas");
  const [payment, setPayment] = useState<PaymentFilter>("todos");

  // Templates
  const [templates, setTemplates] = useState<ReportConfig[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [exporting, setExporting] = useState(false);

  // Load templates from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setTemplates(JSON.parse(stored));
    } catch {}
  }, []);

  // Categories from products
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => { if (p.category) cats.add(p.category); });
    return ["todas", ...Array.from(cats).sort()];
  }, [products]);

  // Build report data
  const reportRows = useMemo<ReportRow[]>(() => {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59);

    const inRange = (dateStr: string) => {
      const d = new Date(dateStr);
      return d >= fromDate && d <= toDate;
    };

    const filteredSales = sales.filter((s) => {
      if (!inRange(s.createdAt)) return false;
      if (payment !== "todos" && s.payment !== payment) return false;
      if (category !== "todas") {
        const hasCategory = (s.items ?? []).some((item) => {
          const prod = products.find((p) => String(p.id) === String(item.productId));
          return prod?.category === category;
        });
        if (!hasCategory) return false;
      }
      return true;
    });

    // Aggregate by grouping key
    const map: Record<string, ReportRow> = {};

    filteredSales.forEach((s) => {
      const key = getPeriodKey(s.createdAt, grouping);
      if (!map[key]) map[key] = { period: formatPeriodLabel(key, grouping) };

      if (selectedMetrics.includes("ventas")) {
        map[key].ventas = (map[key].ventas ?? 0) + (s.total ?? 0);
      }
      if (selectedMetrics.includes("margen")) {
        let saleRevenue = 0;
        let saleCost = 0;
        (s.items ?? []).forEach((item) => {
          const prod = products.find((p) => String(p.id) === String(item.productId));
          const price = item.price ?? 0;
          const cost = prod?.costPrice ?? price * 0.6;
          const qty = item.quantity ?? 1;
          saleRevenue += price * qty;
          saleCost += cost * qty;
        });
        const margin = saleRevenue > 0 ? ((saleRevenue - saleCost) / saleRevenue) * 100 : 0;
        const existing = map[key].margen ?? 0;
        const count = map[key].pedidos ?? 0;
        map[key].margen = (existing * count + margin) / (count + 1);
      }
      if (selectedMetrics.includes("pedidos")) {
        map[key].pedidos = (map[key].pedidos ?? 0) + 1;
      }
    });

    // Customers new in period
    if (selectedMetrics.includes("clientes")) {
      customers.forEach((c) => {
        if (!c.createdAt || !inRange(c.createdAt)) return;
        const key = getPeriodKey(c.createdAt, grouping);
        if (!map[key]) map[key] = { period: formatPeriodLabel(key, grouping) };
        map[key].clientes = (map[key].clientes ?? 0) + 1;
      });
    }

    // Stock: single snapshot per period row (total current stock)
    if (selectedMetrics.includes("stock")) {
      const totalStock = products.reduce((s, p) => s + (p.stock ?? 0), 0);
      Object.keys(map).forEach((key) => {
        map[key].stock = totalStock;
      });
    }

    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, row]) => row);
  }, [sales, products, customers, from, to, grouping, category, payment, selectedMetrics]);

  // Save template
  const saveTemplate = useCallback(() => {
    if (!templateName.trim()) return;
    const config: ReportConfig = {
      id: Date.now().toString(),
      name: templateName.trim(),
      metrics: selectedMetrics,
      period: { from, to },
      grouping,
      category,
      payment,
      createdAt: new Date().toISOString(),
    };
    const updated = [...templates, config];
    setTemplates(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
    setTemplateName("");
  }, [templateName, selectedMetrics, from, to, grouping, category, payment, templates]);

  // Load template
  const loadTemplate = (t: ReportConfig) => {
    setSelectedMetrics(t.metrics);
    setFrom(t.period.from);
    setTo(t.period.to);
    setGrouping(t.grouping);
    setCategory(t.category);
    setPayment(t.payment);
    setStep(1);
  };

  // Delete template
  const deleteTemplate = (id: string) => {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  };

  // Export CSV
  const exportCSV = () => {
    if (reportRows.length === 0) return;
    const headers = ["Periodo", ...selectedMetrics.map((m) => METRIC_LABELS[m])];
    const rows = reportRows.map((row) =>
      [row.period, ...selectedMetrics.map((m) => {
        const val = row[m];
        return val !== undefined ? String(val) : "0";
      })].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-${from}-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export PDF
  const exportPDF = async () => {
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "landscape" });
      const title = `Reporte Analytics — ${from} al ${to}`;
      doc.setFontSize(16);
      doc.text(title, 14, 16);
      doc.setFontSize(10);
      doc.text(`Generado: ${new Date().toLocaleString("es-PE")}`, 14, 24);

      const headers = ["Periodo", ...selectedMetrics.map((m) => METRIC_LABELS[m])];
      let y = 34;
      const colW = 40;

      // Header row
      doc.setFont("helvetica", "bold");
      headers.forEach((h, i) => doc.text(h, 14 + i * colW, y));
      y += 7;
      doc.setFont("helvetica", "normal");

      reportRows.forEach((row) => {
        if (y > 190) { doc.addPage(); y = 14; }
        const cells = [row.period, ...selectedMetrics.map((m) => {
          const val = row[m];
          return val !== undefined ? fmtNum(val, m) : "—";
        })];
        cells.forEach((cell, i) => doc.text(String(cell), 14 + i * colW, y));
        y += 6;
      });

      doc.save(`reporte-${from}-${to}.pdf`);
    } catch (e) {
      console.error("[CustomReportBuilder] PDF export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  const toggleMetric = (m: Metric) => {
    setSelectedMetrics((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  };

  return (
    <div className="flex flex-col gap-5 text-sm">
      {/* Step header */}
      <div className="flex items-center gap-3">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <button onClick={() => setStep(s)} className="flex items-center gap-1.5">
              <StepBadge step={s} current={step} />
              <span className={cn(
                "text-xs font-medium",
                step === s ? "text-[#00B4A6] dark:text-[#2dd4bf]" : "text-gray-500 dark:text-gray-400"
              )}>
                {s === 1 ? "Metricas" : s === 2 ? "Periodo" : "Filtros"}
              </span>
            </button>
            {s < 3 && <div className="w-8 h-px bg-gray-200 dark:bg-gray-700" />}
          </div>
        ))}
      </div>

      {/* Step 1 — Metrics */}
      {step === 1 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Selecciona las metricas a incluir:
          </p>
          <div className="grid grid-cols-1 gap-2">
            {(Object.entries(METRIC_LABELS) as [Metric, string][]).map(([key, label]) => (
              <label
                key={key}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                  selectedMetrics.includes(key)
                    ? "bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20 border-[#00B4A6]/40 text-[#00B4A6] dark:text-[#2dd4bf]"
                    : "bg-white dark:bg-card border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-[#00B4A6]/40"
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedMetrics.includes(key)}
                  onChange={() => toggleMetric(key)}
                  className="accent-[#00B4A6]"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
          <button
            onClick={() => setStep(2)}
            disabled={selectedMetrics.length === 0}
            className="mt-2 px-4 py-2 rounded-lg bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#245a41] disabled:opacity-50 transition-colors"
          >
            Siguiente: Periodo
          </button>
        </div>
      )}

      {/* Step 2 — Period & grouping */}
      {step === 2 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Periodo:</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Desde</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-0.5 w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-card text-gray-800 dark:text-foreground"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Hasta</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-0.5 w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-card text-gray-800 dark:text-foreground"
              />
            </div>
          </div>

          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-1">Agrupar por:</p>
          <div className="flex gap-2">
            {(Object.entries(GROUPING_LABELS) as [Grouping, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setGrouping(key)}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  grouping === key
                    ? "bg-[#00B4A6] text-white border-[#00B4A6]"
                    : "text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-[#00B4A6]"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setStep(1)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Atras
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-1 px-3 py-2 rounded-lg bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#245a41] transition-colors"
            >
              Siguiente: Filtros
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Filters */}
      {step === 3 && (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Categoria de producto:</p>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-card text-gray-800 dark:text-foreground"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c === "todas" ? "Todas las categorias" : c}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Metodo de pago:</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(PAYMENT_LABELS) as [PaymentFilter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setPayment(key)}
                  className={cn(
                    "px-2 py-1 rounded-lg text-xs border transition-colors",
                    payment === key
                      ? "bg-[#00B4A6] text-white border-[#00B4A6]"
                      : "text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-[#00B4A6]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-1">
            <button
              onClick={() => setStep(2)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Atras
            </button>
            <button
              onClick={() => setStep(4)}
              className="flex-1 px-3 py-2 rounded-lg bg-[#00B4A6] text-white text-sm font-medium hover:bg-[#245a41] transition-colors"
            >
              Ver reporte
            </button>
          </div>
        </div>
      )}

      {/* Preview table (visible when step >= 4, rendered below steps) */}
      {step >= 4 && (
        <div className="flex flex-col gap-3">
          {/* Edit + export buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStep(1)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Editar reporte
            </button>
            <button
              onClick={exportCSV}
              disabled={reportRows.length === 0}
              className="px-3 py-1.5 rounded-lg bg-[#f97316] text-white text-xs font-medium hover:bg-[#e8923d] disabled:opacity-50 transition-colors"
            >
              Exportar CSV
            </button>
            <button
              onClick={exportPDF}
              disabled={reportRows.length === 0 || exporting}
              className="px-3 py-1.5 rounded-lg bg-[#00B4A6] text-white text-xs font-medium hover:bg-[#245a41] disabled:opacity-50 transition-colors"
            >
              {exporting ? "Generando PDF..." : "Exportar PDF"}
            </button>
          </div>

          {/* Data table */}
          <div className="overflow-auto max-h-64 rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0">
                  <th className="text-left px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    Periodo
                  </th>
                  {selectedMetrics.map((m) => (
                    <th key={m} className="text-right px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {METRIC_LABELS[m]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportRows.length === 0 && (
                  <tr>
                    <td colSpan={selectedMetrics.length + 1} className="text-center py-6 text-gray-400 dark:text-gray-500">
                      Sin datos para los filtros seleccionados
                    </td>
                  </tr>
                )}
                {reportRows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
                      {row.period}
                    </td>
                    {selectedMetrics.map((m) => (
                      <td key={m} className="px-2 py-1.5 text-right text-gray-600 dark:text-gray-300">
                        {row[m] !== undefined ? fmtNum(row[m]!, m) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right">
            {reportRows.length} filas — {from} al {to} — agrupado por {GROUPING_LABELS[grouping]}
          </p>

          {/* Save template */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Guardar como plantilla</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Nombre de la plantilla..."
                className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-card text-gray-800 dark:text-foreground placeholder-gray-400 dark:placeholder-gray-500"
              />
              <button
                onClick={saveTemplate}
                disabled={!templateName.trim()}
                className="px-3 py-1.5 rounded-lg bg-[#00B4A6] text-white text-xs font-medium hover:bg-[#245a41] disabled:opacity-50 transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved templates */}
      {templates.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Plantillas guardadas</p>
          <div className="flex flex-col gap-1.5">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-card"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 dark:text-foreground truncate">{t.name}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                    {t.metrics.map((m) => METRIC_LABELS[m]).join(", ")} — {t.period.from} al {t.period.to}
                  </p>
                </div>
                <button
                  onClick={() => loadTemplate(t)}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[#00B4A6] dark:text-[#2dd4bf] border border-[#00B4A6]/30 hover:bg-[#00B4A6]/10 transition-colors"
                >
                  Cargar
                </button>
                <button
                  onClick={() => deleteTemplate(t.id)}
                  className="px-2 py-1 rounded text-[10px] font-medium text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Borrar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
