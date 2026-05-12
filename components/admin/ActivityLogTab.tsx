"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Activity, Filter, Trash2, Search, Package, ShoppingCart, Users, Star, Settings, Truck, FileText, HandCoins, Megaphone, Calculator, Boxes } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  detail: string;
  user?: string;
  createdAt: string;
};

const ENTITY_ICONS: Record<string, React.ElementType> = {
  producto: Package,
  pedido: ShoppingCart,
  cliente: Users,
  reseña: Star,
  configuracion: Settings,
  proveedor: Truck,
  compra: FileText,
  cuenta: HandCoins,
  promocion: Megaphone,
  caja: Calculator,
  inventario: Boxes,
  venta: Calculator,
};

const ACTION_COLORS: Record<string, string> = {
  crear: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
  editar: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
  eliminar: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]",
  estado: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  otro: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]",
};

function getActionColor(action: string) {
  const lower = action.toLowerCase();
  if (lower.includes("crear") || lower.includes("agreg") || lower.includes("nuevo")) return ACTION_COLORS.crear;
  if (lower.includes("editar") || lower.includes("actualiz") || lower.includes("modific")) return ACTION_COLORS.editar;
  if (lower.includes("eliminar") || lower.includes("borr")) return ACTION_COLORS.eliminar;
  if (lower.includes("estado") || lower.includes("cambio")) return ACTION_COLORS.estado;
  return ACTION_COLORS.otro;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

export default function ActivityLogTab() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("todos");
  const [logPage, setLogPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const LOG_PER_PAGE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/activity-log?limit=200");
      if (res.ok) {
        setEntries(await res.json());
        setLastUpdated(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const entities = ["todos", ...Array.from(new Set(entries.map(e => e.entity)))];

  const filtered = entries.filter(e => {
    if (entityFilter !== "todos" && e.entity !== entityFilter) return false;
    if (filter) {
      const q = filter.toLowerCase();
      return e.detail.toLowerCase().includes(q) || e.action.toLowerCase().includes(q) || e.entity.toLowerCase().includes(q);
    }
    return true;
  });

  const logTotalPages = Math.max(1, Math.ceil(filtered.length / LOG_PER_PAGE));
  const safeLogPage = Math.min(logPage, logTotalPages);
  const paginatedLog = filtered.slice((safeLogPage - 1) * LOG_PER_PAGE, safeLogPage * LOG_PER_PAGE);

  const clearLog = async () => {
    if (!confirm("¿Limpiar todo el log de actividad?")) return;
    await fetch("/api/activity-log", { method: "DELETE" });
    setEntries([]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <SectionTitle className="text-lg font-extrabold text-[var(--text-primary)]">Log de Actividad</SectionTitle>
          <span className="text-xs text-muted">({filtered.length})</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <span className="text-[length:var(--ts-2xs)] text-muted whitespace-nowrap">Act. {lastUpdated.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</span>
          <button
            onClick={() => setAutoRefresh(p => !p)}
            className={cn("flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border rounded-lg transition-colors",
              autoRefresh ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 text-[var(--data-success)] dark:text-[var(--data-success)]" : "bg-[var(--surface-raised)] border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5"
            )}
            title={autoRefresh ? "Auto-refresh activo (30s)" : "Auto-refresh desactivado"}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", autoRefresh && "animate-spin")} /> {autoRefresh ? "Auto" : "Manual"}
          </button>
          <button onClick={load} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-white/5 transition-colors">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Actualizar
          </button>
          <button onClick={clearLog} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[var(--data-error)] bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error)]/20 transition-colors">
            <Trash2 className="h-3.5 w-3.5" /> Limpiar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            value={filter}
            onChange={e => { setFilter(e.target.value); setLogPage(1); }}
            placeholder="Buscar en el log..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter className="h-4 w-4 text-muted" />
          <select
            value={entityFilter}
            onChange={e => { setEntityFilter(e.target.value); setLogPage(1); }}
            className="text-sm bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary/30 outline-none"
          >
            {entities.map(e => (
              <option key={e} value={e}>{e === "todos" ? "Todas las entidades" : e.charAt(0).toUpperCase() + e.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Log entries */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl divide-y divide-gray-100 dark:divide-card-border overflow-hidden">
        {loading && entries.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">
            {entries.length === 0 ? "No hay actividad registrada aún" : "Sin resultados para este filtro"}
          </div>
        ) : (
          paginatedLog.map(entry => {
            const Icon = ENTITY_ICONS[entry.entity] ?? Activity;
            return (
              <div key={entry.id} className="flex flex-wrap items-start gap-3 px-2 sm:px-4 py-2 sm:py-3 hover:bg-[var(--surface-sunken)]/50 dark:hover:bg-white/5 transition-colors">
                <div className="mt-0.5 h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-[length:var(--ts-2xs)] font-bold uppercase px-1.5 py-0.5 rounded-md", getActionColor(entry.action))}>
                      {entry.action}
                    </span>
                    <span className="text-xs text-muted capitalize">{entry.entity}</span>
                    {entry.entityId && <span className="text-[length:var(--ts-2xs)] text-muted font-mono">#{entry.entityId.slice(0, 8)}</span>}
                  </div>
                  <p className="text-sm text-[var(--text-primary)] mt-0.5 line-clamp-2">{entry.detail}</p>
                </div>
                <div className="text-[length:var(--ts-2xs)] text-muted whitespace-nowrap shrink-0 mt-1">
                  {entry.user && <span className="block text-right font-medium">{entry.user}</span>}
                  {timeAgo(entry.createdAt)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Log pagination */}
      {!loading && filtered.length > LOG_PER_PAGE && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <button disabled={safeLogPage <= 1} onClick={() => setLogPage(p => Math.max(1, p - 1))}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] disabled:opacity-40 hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors">
            ← Anterior
          </button>
          <span className="text-xs text-[var(--text-secondary)] dark:text-muted">
            Página {safeLogPage} de {logTotalPages} · {filtered.length} registros
          </span>
          <button disabled={safeLogPage >= logTotalPages} onClick={() => setLogPage(p => p + 1)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] disabled:opacity-40 hover:bg-[var(--surface-sunken)] dark:hover:bg-surface transition-colors">
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}

