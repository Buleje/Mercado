"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, ChevronDown, Activity, Loader2 } from "lucide-react";

interface ActivityLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  detail: string;
  user: string;
  tenantId: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  pages: number;
  total: number;
  limit: number;
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pages: 1, total: 0, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterTenant, setFilterTenant] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterEntity, setFilterEntity] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadActivity = useCallback(async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (filterTenant) params.set("tenant", filterTenant);
      if (filterAction) params.set("action", filterAction);
      if (filterEntity) params.set("entity", filterEntity);

      const res = await fetch(`/api/superadmin/activity?${params}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setError("Error al cargar actividad");
        return;
      }
      const data = await res.json() as { logs: ActivityLog[]; pagination: Pagination };
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, [filterTenant, filterAction, filterEntity]);

  useEffect(() => {
    void loadActivity(1);
  }, [loadActivity]);

  // Auto-refresh cada 30s
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      void loadActivity(pagination.page);
    }, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadActivity, pagination.page]);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });

  const inputCls =
    "bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-[var(--text-primary)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40";
  const selectCls = `appearance-none ${inputCls} pr-8 text-[var(--text-secondary)] cursor-pointer`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Log de actividad</h1>
        <p className="text-gray-500 text-sm mt-1">
          {pagination.total} registros — se actualiza automáticamente cada 30 s
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={filterTenant}
            onChange={(e) => setFilterTenant(e.target.value)}
            placeholder="Filtrar por tenant ID…"
            className={`w-full ${inputCls} pl-9`}
          />
        </div>

        <div className="relative">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className={selectCls}
          >
            <option value="">Todas las acciones</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="login">Login</option>
            <option value="plan_change">Plan change</option>
            <option value="suspend">Suspend</option>
            <option value="activate">Activate</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={filterEntity}
            onChange={(e) => setFilterEntity(e.target.value)}
            className={selectCls}
          >
            <option value="">Todas las entidades</option>
            <option value="product">Product</option>
            <option value="order">Order</option>
            <option value="customer">Customer</option>
            <option value="tenant">Tenant</option>
            <option value="admin_user">Admin User</option>
            <option value="category">Category</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error)] dark:border-[var(--data-error)] text-[var(--data-error)] dark:text-[var(--data-error)] rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          {error}
          <button
            type="button"
            onClick={() => void loadActivity(pagination.page)}
            className="underline hover:no-underline text-xs"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden shadow-sm dark:shadow-none">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando actividad…
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
            No hay registros de actividad
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-base)] text-gray-400 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Usuario</th>
                  <th className="text-left px-4 py-3">Acción</th>
                  <th className="text-left px-4 py-3">Entidad</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Tenant</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors"
                  >
                    <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {fmtDate(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                      {log.user}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-50 dark:bg-teal-900/30 text-[var(--accent)]">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                      <span>{log.entity}</span>
                      {log.entityId && (
                        <span className="ml-1 font-mono text-gray-400 truncate max-w-24 inline-block align-bottom">
                          {log.entityId}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-400 hidden md:table-cell">
                      {log.tenantId}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 hidden lg:table-cell max-w-xs truncate">
                      {log.detail || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginación */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void loadActivity(pagination.page - 1)}
            disabled={pagination.page <= 1 || loading}
            className="px-4 py-2 rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] text-sm disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            ← Anterior
          </button>
          <span className="text-gray-400 text-sm">
            Página {pagination.page} de {pagination.pages}
          </span>
          <button
            type="button"
            onClick={() => void loadActivity(pagination.page + 1)}
            disabled={pagination.page >= pagination.pages || loading}
            className="px-4 py-2 rounded-xl bg-[var(--surface-sunken)] text-[var(--text-secondary)] text-sm disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
