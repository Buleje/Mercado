"use client";
import { useState, useMemo } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, ShoppingCart, Boxes, DollarSign, Download, Eye } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

/* ── Types ── */
type AnomalyType = "venta-alta" | "venta-baja" | "stock-inusual" | "precio-anomalo" | "fraude-potencial" | "patron-raro";
type Severity = "baja" | "media" | "alta" | "critica";
type Anomaly = {
  id: number; date: string; type: AnomalyType; severity: Severity;
  title: string; description: string; module: string; value: number; expected: number; deviation: number;
  resolved: boolean;
};

/* ── Helpers ── */
function fmt(n: number) { return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }

const TYPE_CONFIG: Record<AnomalyType, { label: string; color: string; icon: any }> = {
  "venta-alta": { label: "Venta Inusual Alta", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: TrendingUp },
  "venta-baja": { label: "Venta Inusual Baja", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: TrendingDown },
  "stock-inusual": { label: "Stock Inusual", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: Boxes },
  "precio-anomalo": { label: "Precio Anómalo", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: DollarSign },
  "fraude-potencial": { label: "Fraude Potencial", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: AlertTriangle },
  "patron-raro": { label: "Patrón Raro", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: ShoppingCart },
};
const SEV_COLORS: Record<Severity, string> = {
  baja: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  media: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  alta: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  critica: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

/* ── Seed Data ── */
const ANOMALIES: Anomaly[] = [];

export default function AnomalyDetectionTab() {
  const [filter, setFilter] = useState<AnomalyType | "todas">("todas");
  const [sevFilter, setSevFilter] = useState<Severity | "todas">("todas");
  const [showResolved, setShowResolved] = useState(false);
  const [selected, setSelected] = useState<Anomaly | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<number>>(new Set(ANOMALIES.filter(a => a.resolved).map(a => a.id)));

  const filtered = useMemo(() => {
    return ANOMALIES.filter(a => {
      if (filter !== "todas" && a.type !== filter) return false;
      if (sevFilter !== "todas" && a.severity !== sevFilter) return false;
      const isResolved = resolvedIds.has(a.id);
      if (!showResolved && isResolved) return false;
      return true;
    });
  }, [filter, sevFilter, showResolved, resolvedIds]);

  const unresolvedCount = ANOMALIES.filter(a => !resolvedIds.has(a.id)).length;
  const criticalCount = ANOMALIES.filter(a => !resolvedIds.has(a.id) && (a.severity === "critica" || a.severity === "alta")).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" /> Detección de Anomalías
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-1">Detección automática de patrones inusuales en ventas, stock y operaciones</p>
        </div>
        <button onClick={() => exportToCSV(ANOMALIES.map(a => ({ Fecha: a.date, Tipo: a.type, Severidad: a.severity, Titulo: a.title, Valor: a.value, Esperado: a.expected })), "anomalias")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Sin Resolver</p>
          <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">{unresolvedCount}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Críticas/Altas</p>
          <p className="text-2xl font-extrabold text-red-600 dark:text-red-400 mt-1">{criticalCount}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Total Detectadas</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground mt-1">{ANOMALIES.length}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-muted uppercase">Resueltas</p>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">{resolvedIds.size}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={filter} onChange={e => setFilter(e.target.value as AnomalyType | "todas")} className="px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm font-semibold text-gray-900 dark:text-foreground outline-none focus:border-primary">
          <option value="todas">Todos los tipos</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={sevFilter} onChange={e => setSevFilter(e.target.value as Severity | "todas")} className="px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm font-semibold text-gray-900 dark:text-foreground outline-none focus:border-primary">
          <option value="todas">Todas severidades</option>
          <option value="critica">Crítica</option><option value="alta">Alta</option>
          <option value="media">Media</option><option value="baja">Baja</option>
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-muted cursor-pointer">
          <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} className="rounded" />
          Mostrar resueltas
        </label>
      </div>

      {/* Anomaly cards */}
      <div className="space-y-3">
        {filtered.map(a => {
          const config = TYPE_CONFIG[a.type];
          const Icon = config.icon;
          const isResolved = resolvedIds.has(a.id);
          return (
            <div key={a.id} className={cn("bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5 hover:shadow-md transition-shadow", isResolved && "opacity-60")}>
              <div className="flex items-start gap-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", config.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-900 dark:text-foreground">{a.title}</h3>
                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", SEV_COLORS[a.severity])}>{a.severity.toUpperCase()}</span>
                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", config.color)}>{config.label}</span>
                    {isResolved && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">✓ Resuelta</span>}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-muted mt-1">{a.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 dark:text-muted">
                    <span>{fmtDate(a.date)}</span>
                    <span>Módulo: {a.module}</span>
                    <span>Valor: {typeof a.value === "number" && a.value > 10 ? fmt(a.value) : a.value}</span>
                    <span>Esperado: {typeof a.expected === "number" && a.expected > 10 ? fmt(a.expected) : a.expected}</span>
                    <span className={cn("font-bold", a.deviation > 0 ? "text-red-500" : "text-blue-500")}>
                      Desviación: {a.deviation > 0 ? "+" : ""}{a.deviation}%
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setSelected(a)} className="p-2 rounded-lg text-gray-400 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><Eye className="h-4 w-4" /></button>
                  {!isResolved && (
                    <button onClick={() => setResolvedIds(prev => new Set([...prev, a.id]))} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors">
                      Resolver
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-gray-400 dark:text-muted py-12">No se encontraron anomalías con estos filtros.</p>}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">{selected.title}</h3>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-accent text-xl font-bold">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600 dark:text-muted">{selected.description}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><span className="text-xs text-gray-400">Fecha</span><p className="font-bold">{fmtDate(selected.date)}</p></div>
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><span className="text-xs text-gray-400">Módulo</span><p className="font-bold">{selected.module}</p></div>
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><span className="text-xs text-gray-400">Valor Detectado</span><p className="font-bold text-red-500">{selected.value}</p></div>
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><span className="text-xs text-gray-400">Valor Esperado</span><p className="font-bold text-emerald-500">{selected.expected}</p></div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-4">
                <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-1">Recomendación</h4>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  {selected.type === "fraude-potencial" ? "Revisar cámaras de seguridad y confrontar con el empleado. Verificar recibos anulados." :
                   selected.type === "stock-inusual" ? "Realizar conteo físico inmediato. Revisar movimientos de almacén y mermas." :
                   selected.type === "precio-anomalo" ? "Corregir precio en el sistema. Verificar si se pueden revertir las ventas afectadas." :
                   selected.type === "venta-baja" ? "Verificar si hubo problemas operativos, corte de luz o cierre parcial." :
                   "Monitorear la situación. Si se repite, investigar causa raíz."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
