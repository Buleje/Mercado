"use client";
import { useState, useEffect, useCallback } from "react";
import { Shield, Search, RefreshCw, ChevronLeft, ChevronRight, User, Clock, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  detail?: string;
  user?: string;
  createdAt: string;
  [key: string]: unknown;
}

export default function AuditTrailModule() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const LIMIT = 30;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(page * LIMIT),
      });
      if (entityFilter) params.set("entity", entityFilter);
      if (search) params.set("user", search);

      const res = await fetch(`/api/audit-trail?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch {}
    setLoading(false);
  }, [page, entityFilter, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / LIMIT);

  const actionColor = (action: string) => {
    if (action === "CREATE") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (action === "UPDATE") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (action === "DELETE") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
  };

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        title="Auditoría"
        description="Registro de todas las acciones del sistema"
        icon={Shield}
        iconColor="#9b5de5"
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por usuario..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/30"
          />
        </div>
        <select
          value={entityFilter}
          onChange={e => { setEntityFilter(e.target.value); setPage(0); }}
          className="px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/30"
        >
          <option value="">Todas las entidades</option>
          <option value="Sale">Ventas</option>
          <option value="Product">Productos</option>
          <option value="Purchase">Compras</option>
          <option value="Customer">Clientes</option>
          <option value="Order">Pedidos</option>
          <option value="Settings">Configuración</option>
          <option value="Payable">Cuentas por pagar</option>
        </select>
        <button
          onClick={fetchLogs}
          className="min-h-[44px] min-w-[44px] px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
          title="Actualizar"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="h-6 w-6 border-2 border-[#9b5de5] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No se encontraron registros</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Fecha</th>
                  <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Acción</th>
                  <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Entidad</th>
                  <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Detalle</th>
                  <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr
                    key={log.id}
                    className="border-t border-[var(--rule-soft)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span className="text-xs font-mono">
                          {new Date(log.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                          {" "}
                          {new Date(log.createdAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full", actionColor(log.action))}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3 w-3 text-gray-400 shrink-0" />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{log.entity}</span>
                        {log.entityId && (
                          <span className="text-[length:var(--ts-2xs)] text-gray-400 font-mono">
                            #{log.entityId.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 max-w-xs">
                      <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{log.detail || "—"}</p>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-gray-400 shrink-0" />
                        <span className="text-xs text-gray-600 dark:text-gray-300">{log.user || "sistema"}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-soft)] dark:border-card-border bg-gray-50/50 dark:bg-gray-800/30">
            <span className="text-xs text-gray-500">{total} registros</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-[var(--rule-base)] disabled:opacity-40 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs text-gray-500">{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-[var(--rule-base)] disabled:opacity-40 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
