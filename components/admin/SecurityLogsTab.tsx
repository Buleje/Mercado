"use client";

import { useState, useMemo } from "react";
import { Lock, Search, Filter, Download, AlertTriangle, User, LogIn, Settings, Shield, Eye } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type LogEntry = {
  id: string; timestamp: string; actor: string; action: string; category: "auth" | "data" | "config" | "security";
  severity: "info" | "warning" | "critical"; ip: string; details: string; success: boolean;
};

const SEED: LogEntry[] = [];

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  auth: { label: "Autenticación", icon: LogIn, color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
  data: { label: "Datos", icon: Eye, color: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400" },
  config: { label: "Configuración", icon: Settings, color: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" },
  security: { label: "Seguridad", icon: Shield, color: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
};

const SEVERITY_COLORS = {
  info: "bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

export default function SecurityLogsTab() {
  const [logs] = useState(SEED);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  const filtered = useMemo(() => {
    let list = logs;
    if (filterCategory !== "all") list = list.filter(l => l.category === filterCategory);
    if (filterSeverity !== "all") list = list.filter(l => l.severity === filterSeverity);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l => l.action.toLowerCase().includes(q) || l.actor.toLowerCase().includes(q) || l.details.toLowerCase().includes(q));
    }
    return list;
  }, [logs, search, filterCategory, filterSeverity]);

  const criticalCount = logs.filter(l => l.severity === "critical").length;
  const failedAuth = logs.filter(l => l.category === "auth" && !l.success).length;
  const todayCount = logs.filter(l => l.timestamp.startsWith("2025-07-13")).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><Lock className="h-6 w-6 text-primary" /> Logs de Seguridad</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Auditoría de accesos, cambios y eventos de seguridad</p>
        </div>
        <button onClick={() => exportToCSV(filtered.map(l => ({ fecha: fmtDate(l.timestamp), actor: l.actor, accion: l.action, categoria: l.category, severidad: l.severity, ip: l.ip, exito: l.success ? "Sí" : "No", detalles: l.details })), "logs-seguridad")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10"><Download className="h-3.5 w-3.5" /> CSV</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Eventos hoy", value: todayCount, color: "text-blue-500" },
          { label: "Alertas críticas", value: criticalCount, color: criticalCount > 0 ? "text-red-500" : "text-gray-400" },
          { label: "Intentos fallidos auth", value: failedAuth, color: failedAuth > 0 ? "text-amber-500" : "text-gray-400" },
          { label: "Total registros", value: logs.length, color: "text-violet-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-2xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" placeholder="Buscar en logs…" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">Categoría:</span>
          {["all", "auth", "data", "config", "security"].map(c => (
            <button key={c} onClick={() => setFilterCategory(c)} className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors", filterCategory === c ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>{c === "all" ? "Todas" : CATEGORY_CONFIG[c].label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">Severidad:</span>
          {["all", "info", "warning", "critical"].map(s => (
            <button key={s} onClick={() => setFilterSeverity(s)} className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors", filterSeverity === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>{s === "all" ? "Todas" : s.charAt(0).toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.map(l => {
          const Cat = CATEGORY_CONFIG[l.category];
          const CatIcon = Cat.icon;
          return (
            <div key={l.id} className={cn("bg-white dark:bg-card rounded-xl border p-4", l.severity === "critical" ? "border-red-200 dark:border-red-900/30" : "border-gray-200 dark:border-card-border")}>
              <div className="flex items-start gap-3">
                <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", Cat.color)}><CatIcon className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-bold text-sm text-gray-900 dark:text-foreground">{l.action}</span>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", SEVERITY_COLORS[l.severity])}>{l.severity}</span>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", l.success ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400")}>{l.success ? "✓ Éxito" : "✗ Fallo"}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-muted mb-1">{l.details}</p>
                  <div className="flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
                    <span><User className="h-2.5 w-2.5 inline mr-0.5" />{l.actor}</span>
                    <span>IP: {l.ip}</span>
                    <span>{fmtDate(l.timestamp)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
