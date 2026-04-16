"use client";

import { useState, useMemo } from "react";
import {
  ShieldCheck, Download, Search, Plus, X, Eye, CheckCircle,
  AlertTriangle, Clipboard,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type InspectionResult = "aprobado" | "observado" | "rechazado";
type InspectionType = "recepcion" | "almacen" | "exhibicion";

type Inspection = {
  id: string;
  date: string;
  product: string;
  batch: string;
  type: InspectionType;
  inspector: string;
  result: InspectionResult;
  temp: string;
  appearance: string;
  expiry: string;
  observations: string;
  corrective: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

const RESULT_META: Record<InspectionResult, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  aprobado:  { label: "Aprobado",  color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", icon: CheckCircle },
  observado: { label: "Observado", color: "text-amber-700 dark:text-amber-400",    bg: "bg-amber-100 dark:bg-amber-900/30",    icon: AlertTriangle },
  rechazado: { label: "Rechazado", color: "text-red-700 dark:text-red-400",         bg: "bg-red-100 dark:bg-red-900/30",        icon: AlertTriangle },
};

const TYPE_META: Record<InspectionType, { label: string }> = {
  recepcion:  { label: "Recepción" },
  almacen:    { label: "Almacén" },
  exhibicion: { label: "Exhibición" },
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SEED: Inspection[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function QualityControlTab() {
  const [inspections, setInspections] = useState<Inspection[]>(SEED);
  const [search, setSearch] = useState("");
  const [filterResult, setFilterResult] = useState<InspectionResult | "todos">("todos");
  const [filterType, setFilterType] = useState<InspectionType | "todos">("todos");
  const [detail, setDetail] = useState<Inspection | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    product: "", batch: "", type: "recepcion" as InspectionType, inspector: "",
    result: "aprobado" as InspectionResult, temp: "", appearance: "", expiry: "",
    observations: "", corrective: "",
  });

  const filtered = useMemo(() => {
    let list = [...inspections];
    if (filterResult !== "todos") list = list.filter(i => i.result === filterResult);
    if (filterType !== "todos") list = list.filter(i => i.type === filterType);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.product.toLowerCase().includes(q) || i.batch.toLowerCase().includes(q) || i.inspector.toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [inspections, filterResult, filterType, search]);

  const stats = useMemo(() => {
    const total = inspections.length;
    const aprobados = inspections.filter(i => i.result === "aprobado").length;
    const observados = inspections.filter(i => i.result === "observado").length;
    const rechazados = inspections.filter(i => i.result === "rechazado").length;
    return { total, aprobados, observados, rechazados, pctAprobado: total > 0 ? (aprobados / total) * 100 : 0 };
  }, [inspections]);

  function addInspection() {
    if (!form.product.trim() || !form.batch.trim()) return;
    const now = new Date().toISOString().split("T")[0];
    const newI: Inspection = {
      id: `q${Date.now()}`, date: now, product: form.product.trim(), batch: form.batch.trim(),
      type: form.type, inspector: form.inspector.trim() || "—", result: form.result,
      temp: form.temp.trim(), appearance: form.appearance.trim(), expiry: form.expiry,
      observations: form.observations.trim(), corrective: form.corrective.trim(),
    };
    setInspections(prev => [newI, ...prev]);
    setForm({ product: "", batch: "", type: "recepcion", inspector: "", result: "aprobado", temp: "", appearance: "", expiry: "", observations: "", corrective: "" });
    setShowForm(false);
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Control de Calidad
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Inspecciones, no conformidades y acciones correctivas</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Nueva inspección
          </button>
          <button onClick={() => exportToCSV(filtered.map(i => ({ fecha: i.date, producto: i.product, lote: i.batch, tipo: TYPE_META[i.type].label, inspector: i.inspector, resultado: i.result, temp: i.temp, apariencia: i.appearance, vencimiento: i.expiry, observaciones: i.observations, correctiva: i.corrective })), "control-calidad")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total inspecciones", value: String(stats.total), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Aprobados", value: String(stats.aprobados), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Observados", value: String(stats.observados), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
          { label: "Rechazados", value: String(stats.rechazados), color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
          { label: "% Aprobación", value: `${stats.pctAprobado.toFixed(0)}%`, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alert */}
      {stats.rechazados > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex flex-wrap items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-red-700 dark:text-red-400 text-sm">Productos rechazados</p>
            <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">{stats.rechazados} inspección(es) con rechazo activo — revisar acciones correctivas.</p>
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3 sm:p-5 space-y-3">
          <h3 className="font-bold text-sm text-gray-900 dark:text-foreground">Nueva inspección</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <input value={form.product} onChange={e => setForm(p => ({ ...p, product: e.target.value }))} placeholder="Producto *" className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            <input value={form.batch} onChange={e => setForm(p => ({ ...p, batch: e.target.value }))} placeholder="Lote *" className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as InspectionType }))} className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground">
              {(Object.keys(TYPE_META) as InspectionType[]).map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
            </select>
            <input value={form.inspector} onChange={e => setForm(p => ({ ...p, inspector: e.target.value }))} placeholder="Inspector" className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            <select value={form.result} onChange={e => setForm(p => ({ ...p, result: e.target.value as InspectionResult }))} className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground">
              {(Object.keys(RESULT_META) as InspectionResult[]).map(r => <option key={r} value={r}>{RESULT_META[r].label}</option>)}
            </select>
            <input value={form.temp} onChange={e => setForm(p => ({ ...p, temp: e.target.value }))} placeholder="Temperatura" className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            <input value={form.appearance} onChange={e => setForm(p => ({ ...p, appearance: e.target.value }))} placeholder="Apariencia" className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            <input type="date" value={form.expiry} onChange={e => setForm(p => ({ ...p, expiry: e.target.value }))} className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" title="Vencimiento" />
            <input value={form.observations} onChange={e => setForm(p => ({ ...p, observations: e.target.value }))} placeholder="Observaciones" className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
            <input value={form.corrective} onChange={e => setForm(p => ({ ...p, corrective: e.target.value }))} placeholder="Acción correctiva" className="col-span-full sm:col-span-2 px-3 py-2 border border-gray-200 dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-3 py-2 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-surface">Cancelar</button>
            <button onClick={addInspection} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90">Registrar</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Producto, lote, inspector..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-lg bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterResult} onChange={e => setFilterResult(e.target.value as InspectionResult | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los resultados</option>
          {(Object.keys(RESULT_META) as InspectionResult[]).map(r => <option key={r} value={r}>{RESULT_META[r].label}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value as InspectionType | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los tipos</option>
          {(Object.keys(TYPE_META) as InspectionType[]).map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface/50 border-b border-gray-200 dark:border-card-border">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Resultado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Fecha</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Producto</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Lote</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Tipo</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Inspector</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Observaciones</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Sin inspecciones.</td></tr>}
              {filtered.map(i => {
                const meta = RESULT_META[i.result];
                const Icon = meta.icon;
                return (
                  <tr key={i.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors">
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", meta.bg, meta.color)}><Icon className="h-3 w-3" />{meta.label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(i.date)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-gray-800 dark:text-foreground">{i.product}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-mono text-gray-500">{i.batch}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-500 dark:text-muted">{TYPE_META[i.type].label}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-600 dark:text-muted">{i.inspector}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-500 max-w-50 truncate">{i.observations || "—"}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <button onClick={() => setDetail(i)} className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"><Eye className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-sm flex flex-wrap items-center gap-2"><Clipboard className="h-4 w-4 text-primary" /> Detalle de inspección</h3>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Fecha", fmtDate(detail.date)], ["Producto", detail.product], ["Lote", detail.batch],
                ["Tipo inspección", TYPE_META[detail.type].label], ["Inspector", detail.inspector],
                ["Resultado", RESULT_META[detail.result].label], ["Temperatura", detail.temp || "—"],
                ["Apariencia", detail.appearance || "—"], ["Vencimiento", detail.expiry ? fmtDate(detail.expiry) : "—"],
                ["Observaciones", detail.observations || "—"], ["Acción correctiva", detail.corrective || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-2 sm:gap-4">
                  <span className="text-gray-500 dark:text-muted shrink-0">{k}</span>
                  <span className="font-semibold text-gray-800 dark:text-foreground text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
