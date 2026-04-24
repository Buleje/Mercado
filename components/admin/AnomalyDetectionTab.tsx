"use client";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, ShoppingCart, Boxes, DollarSign, Download, Eye } from "@buleje/design-system/icons";
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

const TYPE_CONFIG: Record<AnomalyType, { label: string; color: string; icon: typeof TrendingUp }> = {
  "venta-alta": { label: "Venta Inusual Alta", color: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]", icon: TrendingUp },
  "venta-baja": { label: "Venta Inusual Baja", color: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]", icon: TrendingDown },
  "stock-inusual": { label: "Stock Inusual", color: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]", icon: Boxes },
  "precio-anomalo": { label: "Precio Anómalo", color: "bg-[var(--surface-sunken)] text-[var(--text-primary)]", icon: DollarSign },
  "fraude-potencial": { label: "Fraude Potencial", color: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]", icon: AlertTriangle },
  "patron-raro": { label: "Patrón Raro", color: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]", icon: ShoppingCart },
};
const SEV_COLORS: Record<Severity, string> = {
  baja: "bg-gray-100 text-[var(--text-secondary)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]",
  media: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]",
  alta: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]",
  critica: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]",
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
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-[var(--data-warning)]" /> Detección de Anomalías
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-1">Detección automática de patrones inusuales en ventas, stock y operaciones</p>
        </div>
        <button onClick={() => exportToCSV(ANOMALIES.map(a => ({ Fecha: a.date, Tipo: a.type, Severidad: a.severity, Titulo: a.title, Valor: a.value, Esperado: a.expected })), "anomalias")} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted uppercase">Sin Resolver</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-warning)] dark:text-[var(--data-warning)] mt-1">{unresolvedCount}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted uppercase">Críticas/Altas</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-error)] dark:text-[var(--data-error)] mt-1">{criticalCount}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted uppercase">Total Detectadas</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground mt-1">{ANOMALIES.length}</p>
        </div>
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted uppercase">Resueltas</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success)] dark:text-[var(--data-success)] mt-1">{resolvedIds.size}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={filter} onChange={e => setFilter(e.target.value as AnomalyType | "todas")} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm font-semibold text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary">
          <option value="todas">Todos los tipos</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={sevFilter} onChange={e => setSevFilter(e.target.value as Severity | "todas")} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm font-semibold text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary">
          <option value="todas">Todas severidades</option>
          <option value="critica">Crítica</option><option value="alta">Alta</option>
          <option value="media">Media</option><option value="baja">Baja</option>
        </select>
        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] dark:text-muted cursor-pointer">
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
            <div key={a.id} className={cn("bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-5 hover:shadow-sm transition-shadow", isResolved && "opacity-60")}>
              <div className="flex flex-wrap items-start gap-2 sm:gap-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", config.color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground">{a.title}</CardTitle>
                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", SEV_COLORS[a.severity])}>{a.severity.toUpperCase()}</span>
                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", config.color)}>{config.label}</span>
                    {isResolved && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]">Resuelta</span>}
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-1">{a.description}</p>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-xs text-[var(--text-tertiary)] dark:text-muted">
                    <span>{fmtDate(a.date)}</span>
                    <span>Módulo: {a.module}</span>
                    <span>Valor: {typeof a.value === "number" && a.value > 10 ? fmt(a.value) : a.value}</span>
                    <span>Esperado: {typeof a.expected === "number" && a.expected > 10 ? fmt(a.expected) : a.expected}</span>
                    <span className={cn("font-bold", a.deviation > 0 ? "text-[var(--data-error)]" : "text-[var(--data-success)]")}>
                      Desviación: {a.deviation > 0 ? "+" : ""}{a.deviation}%
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button onClick={() => setSelected(a)} className="p-2 rounded-lg text-[var(--text-tertiary)] dark:text-muted hover:bg-gray-100 dark:hover:bg-accent"><Eye className="h-4 w-4" /></button>
                  {!isResolved && (
                    <button onClick={() => setResolvedIds(prev => new Set([...prev, a.id]))} className="px-3 py-1.5 rounded-lg bg-[var(--accent-soft)] text-white text-xs font-bold hover:bg-[var(--accent-soft)] transition-colors">
                      Resolver
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-[var(--text-tertiary)] dark:text-muted py-12">No se encontraron anomalías con estos filtros.</p>}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="modal-backdrop p-4" onClick={() => setSelected(null)}>
          <div className="bg-white dark:bg-card rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-card-border flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{selected.title}</CardTitle>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-gray-100 dark:hover:bg-accent text-base sm:text-xl font-bold">×</button>
            </div>
            <div className="px-3 sm:px-6 py-5 space-y-4">
              <p className="text-sm text-[var(--text-secondary)] dark:text-muted">{selected.description}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><span className="text-xs text-[var(--text-tertiary)]">Fecha</span><p className="font-bold">{fmtDate(selected.date)}</p></div>
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><span className="text-xs text-[var(--text-tertiary)]">Módulo</span><p className="font-bold">{selected.module}</p></div>
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><span className="text-xs text-[var(--text-tertiary)]">Valor Detectado</span><p className="font-bold text-[var(--data-error)]">{selected.value}</p></div>
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-3"><span className="text-xs text-[var(--text-tertiary)]">Valor Esperado</span><p className="font-bold text-[var(--data-success)]">{selected.expected}</p></div>
              </div>
              <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl p-4">
                <h4 className="text-sm font-bold text-[var(--data-success)] dark:text-[var(--data-success)] mb-1">Recomendación</h4>
                <p className="text-xs text-[var(--data-success)] dark:text-[var(--data-success)]">
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
