"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Activity, Filter, Trash2, Search, Package, ShoppingCart, Users, Star, Settings, Truck, FileText, HandCoins, Megaphone, Calculator, Boxes } from "lucide-react";
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
  crear: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  editar: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  eliminar: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  estado: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  otro: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/activity-log?limit=200");
      if (res.ok) setEntries(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const entities = ["todos", ...Array.from(new Set(entries.map(e => e.entity)))];

  const filtered = entries.filter(e => {
    if (entityFilter !== "todos" && e.entity !== entityFilter) return false;
    if (filter) {
      const q = filter.toLowerCase();
      return e.detail.toLowerCase().includes(q) || e.action.toLowerCase().includes(q) || e.entity.toLowerCase().includes(q);
    }
    return true;
  });

  const clearLog = async () => {
    if (!confirm("¿Limpiar todo el log de actividad?")) return;
    await fetch("/api/activity-log", { method: "DELETE" });
    setEntries([]);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-extrabold text-foreground">Log de Actividad</h2>
          <span className="text-xs text-muted">({filtered.length})</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={load} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Actualizar
          </button>
          <button onClick={clearLog} className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-600 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
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
            onChange={e => setFilter(e.target.value)}
            placeholder="Buscar en el log..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter className="h-4 w-4 text-muted" />
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
            className="text-sm bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-primary/30 outline-none"
          >
            {entities.map(e => (
              <option key={e} value={e}>{e === "todos" ? "Todas las entidades" : e.charAt(0).toUpperCase() + e.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Log entries */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl divide-y divide-gray-100 dark:divide-card-border overflow-hidden">
        {loading && entries.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted text-sm">
            {entries.length === 0 ? "No hay actividad registrada aún" : "Sin resultados para este filtro"}
          </div>
        ) : (
          filtered.slice(0, 100).map(entry => {
            const Icon = ENTITY_ICONS[entry.entity] ?? Activity;
            return (
              <div key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                <div className="mt-0.5 h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md", getActionColor(entry.action))}>
                      {entry.action}
                    </span>
                    <span className="text-xs text-muted capitalize">{entry.entity}</span>
                    {entry.entityId && <span className="text-[10px] text-muted font-mono">#{entry.entityId.slice(0, 8)}</span>}
                  </div>
                  <p className="text-sm text-foreground mt-0.5 line-clamp-2">{entry.detail}</p>
                </div>
                <div className="text-[10px] text-muted whitespace-nowrap shrink-0 mt-1">
                  {entry.user && <span className="block text-right font-medium">{entry.user}</span>}
                  {timeAgo(entry.createdAt)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
