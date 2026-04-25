"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, ChevronDown, Activity, Loader2 } from "@buleje/design-system/icons";
import {
  ADMIN_TOKENS,
  AdminTabShell,
  AdminEmptyState,
} from "../_components/_shared";

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
    "bg-[var(--surface-canvas)] border border-[var(--rule-soft)] text-[var(--text-primary)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40";
  const selectCls = `appearance-none ${inputCls} pr-8 text-[var(--text-secondary)] cursor-pointer`;

  return (
    <AdminTabShell
      title="Log de actividad"
      description={`${pagination.total} registros — se actualiza automáticamente cada 30 s.`}
      icon={Activity}
    >
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
        <div className={`${ADMIN_TOKENS.errorBanner} flex items-center justify-between`}>
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
      {loading ? (
        <div className={`${ADMIN_TOKENS.card} flex items-center justify-center gap-3 py-20 text-[var(--text-tertiary)]`}>
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> Cargando actividad…
        </div>
      ) : logs.length === 0 ? (
        <AdminEmptyState
          icon={Activity}
          title="Sin registros de actividad"
          description="Aún no hay eventos registrados con los filtros actuales."
        />
      ) : (
        <div className={`${ADMIN_TOKENS.card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-soft)] text-[var(--text-tertiary)] text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3">Fecha</th>
                  <th className="text-left px-4 py-3">Usuario</th>
                  <th className="text-left px-4 py-3">Acción</th>
                  <th className="text-left px-4 py-3">Entidad</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Tenant</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-[var(--surface-sunken)]/50 transition-colors"
                  >
                    <td className="px-5 py-3 text-xs text-[var(--text-tertiary)] whitespace-nowrap">
                      {fmtDate(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                      {log.user}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--accent-soft)] text-[var(--accent)]">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                      <span>{log.entity}</span>
                      {log.entityId && (
                        <span className="ml-1 font-mono text-[var(--text-tertiary)] truncate max-w-24 inline-block align-bottom">
                          {log.entityId}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-[var(--text-tertiary)] hidden md:table-cell">
                      {log.tenantId}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-tertiary)] hidden lg:table-cell max-w-xs truncate">
                      {log.detail || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Paginación */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void loadActivity(pagination.page - 1)}
            disabled={pagination.page <= 1 || loading}
            className="px-4 py-2 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] text-sm disabled:opacity-40 hover:bg-[var(--surface-raised)] transition-colors"
          >
            ← Anterior
          </button>
          <span className="text-[var(--text-tertiary)] text-sm">
            Página {pagination.page} de {pagination.pages}
          </span>
          <button
            type="button"
            onClick={() => void loadActivity(pagination.page + 1)}
            disabled={pagination.page >= pagination.pages || loading}
            className="px-4 py-2 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] text-sm disabled:opacity-40 hover:bg-[var(--surface-raised)] transition-colors"
          >
            Siguiente →
          </button>
        </div>
      )}
    </AdminTabShell>
  );
}
