"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Lock, Search, Download, User, LogIn, Settings, Shield, Eye, RefreshCw, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";
import type { SecurityLogEntry } from "@/app/api/security-logs/route";

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  auth:     { label: "Autenticación", icon: LogIn,    color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" },
  data:     { label: "Datos",         icon: Eye,      color: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400" },
  config:   { label: "Configuración", icon: Settings, color: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" },
  security: { label: "Seguridad",     icon: Shield,   color: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
};

const SEVERITY_COLORS = {
  info:     "bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400",
  warning:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function SecurityLogsTab() {
  const [logs, setLogs] = useState<SecurityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterSuccess, setFilterSuccess] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filterCategory !== "all") params.set("category", filterCategory);
      if (filterSeverity !== "all") params.set("severity", filterSeverity);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await fetch(`/api/security-logs?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLogs(data.logs ?? []);
      setIsDemo(!!data.demo);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterSeverity, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = logs;
    if (filterSuccess !== "all") list = list.filter(l => filterSuccess === "success" ? l.success : !l.success);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l => l.action.toLowerCase().includes(q) || l.actor.toLowerCase().includes(q) || l.details.toLowerCase().includes(q));
    }
    return list;
  }, [logs, search, filterSuccess]);

  // KPIs calculados del total de logs cargados (sin filtro de búsqueda)
  const today = new Date().toISOString().slice(0, 10);
  const todayCount   = logs.filter(l => l.timestamp.startsWith(today)).length;
  const criticalCount = logs.filter(l => l.severity === "critical").length;
  const failedAuth   = logs.filter(l => l.category === "auth" && !l.success).length;
  const roleChanges  = logs.filter(l => l.category === "config").length;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Lock className="h-6 w-6 text-primary" /> Logs de Seguridad
            {isDemo && <span className="text-xs font-normal text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">datos demo</span>}
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Auditoría de accesos, cambios y eventos de seguridad</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={load} disabled={loading} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface text-gray-400">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button onClick={() => exportToCSV(filtered.map(l => ({ fecha: fmtDate(l.timestamp), actor: l.actor, accion: l.action, categoria: l.category, severidad: l.severity, ip: l.ip, exito: l.success ? "Sí" : "No", detalles: l.details })), "logs-seguridad")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Alerta crítica */}
      {!loading && criticalCount > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl p-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400 font-semibold">
            {criticalCount} evento{criticalCount > 1 ? "s" : ""} crítico{criticalCount > 1 ? "s" : ""} detectado{criticalCount > 1 ? "s" : ""}. Revisa los logs marcados en rojo.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Eventos hoy",           value: todayCount,    color: "text-emerald-500" },
          { label: "Alertas críticas",       value: criticalCount, color: criticalCount > 0 ? "text-red-500" : "text-gray-400" },
          { label: "Intentos fallidos auth", value: failedAuth,   color: failedAuth > 0 ? "text-amber-500" : "text-gray-400" },
          { label: "Cambios de config",      value: roleChanges,  color: "text-violet-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            {loading
              ? <div className="h-7 w-12 bg-gray-100 dark:bg-surface rounded animate-pulse mt-1" />
              : <p className={cn("text-xl sm:text-2xl font-extrabold", k.color)}>{k.value}</p>}
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-4 space-y-3">
        {/* Búsqueda + fechas */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm"
              placeholder="Buscar acción, usuario, detalle…" />
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-xs" />
            <span className="text-xs text-gray-400">—</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-xs" />
          </div>
        </div>
        {/* Chips */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-400">Categoría:</span>
            {["all", "auth", "data", "config", "security"].map(c => (
              <button key={c} onClick={() => setFilterCategory(c)}
                className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors",
                  filterCategory === c ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>
                {c === "all" ? "Todas" : CATEGORY_CONFIG[c].label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-400">Severidad:</span>
            {["all", "info", "warning", "critical"].map(s => (
              <button key={s} onClick={() => setFilterSeverity(s)}
                className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors",
                  filterSeverity === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>
                {s === "all" ? "Todas" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-400">Resultado:</span>
            {["all", "success", "failed"].map(s => (
              <button key={s} onClick={() => setFilterSuccess(s)}
                className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors",
                  filterSuccess === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>
                {s === "all" ? "Todos" : s === "success" ? "Exitosos" : "Fallidos"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Logs */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <Lock className="h-10 w-10 mb-2" />
          <p className="text-sm">Sin eventos para los filtros seleccionados</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 font-semibold">{filtered.length} evento{filtered.length !== 1 ? "s" : ""}</p>
          {filtered.map(l => {
            const Cat = CATEGORY_CONFIG[l.category] ?? CATEGORY_CONFIG.auth;
            const CatIcon = Cat.icon;
            return (
              <div key={l.id} className={cn("bg-white dark:bg-card rounded-xl border p-4", l.severity === "critical" ? "border-red-200 dark:border-red-900/30" : l.severity === "warning" ? "border-amber-100 dark:border-amber-900/20" : "border-gray-200 dark:border-card-border")}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", Cat.color)}>
                    <CatIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-bold text-sm text-gray-900 dark:text-foreground">{l.action}</span>
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", SEVERITY_COLORS[l.severity])}>{l.severity}</span>
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5",
                        l.success ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400")}>
                        {l.success ? <CheckCircle className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                        {l.success ? "Éxito" : "Fallo"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-muted mb-1">{l.details}</p>
                    <div className="flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
                      <span className="flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{l.actor}</span>
                      {l.ip !== "—" && <span>IP: {l.ip}</span>}
                      <span>{fmtDate(l.timestamp)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
