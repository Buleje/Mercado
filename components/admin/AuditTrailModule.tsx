"use client";
import { useState, useEffect, useCallback } from "react";
import { Shield, Search, RefreshCw, ChevronLeft, ChevronRight, User, Clock, FileText } from "@buleje/design-system/icons";
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
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const LIMIT = 30;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      } else {
        setError(`No se pudo cargar el registro de auditoría (HTTP ${res.status})`);
      }
    } catch (e) {
      setError("No se pudo cargar el registro de auditoría — revisá tu conexión.");
      console.error("[AuditTrail] fetch error", e);
    }
    setLoading(false);
  }, [page, entityFilter, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / LIMIT);

  const actionColor = (action: string) => {
    if (action === "CREATE") return "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]";
    if (action === "UPDATE") return "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]";
    if (action === "DELETE") return "bg-red-100 text-[var(--data-error-700)] dark:bg-red-900/30 dark:text-red-400";
    return "bg-[var(--surface-sunken)] text-[var(--text-primary)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]";
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por usuario..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-3 py-2 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg text-sm bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/30"
          />
        </div>
        <select
          value={entityFilter}
          onChange={e => { setEntityFilter(e.target.value); setPage(0); }}
          className="px-3 py-2 border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg text-sm bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#9b5de5]/30"
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
          className="min-h-[44px] min-w-[44px] px-3 py-2 bg-[var(--surface-sunken)] rounded-lg text-sm hover:bg-[var(--rule-soft)] dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
          title="Actualizar"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Banner de error */}
      {error && (
        <div className="rounded-xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 px-4 py-3 flex items-start gap-2.5">
          <Shield className="h-4 w-4 text-[var(--data-error-500)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[var(--data-error-700)]">{error}</p>
            <button
              type="button"
              onClick={() => fetchLogs()}
              className="text-xs font-bold text-[var(--data-error-700)] underline mt-1 hover:no-underline"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="h-6 w-6 border-2 border-[#9b5de5] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-tertiary)] text-sm">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No se encontraron registros</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)]/50">
                <tr>
                  <th className="text-left p-3 font-medium text-[var(--text-secondary)]">Fecha</th>
                  <th className="text-left p-3 font-medium text-[var(--text-secondary)]">Acción</th>
                  <th className="text-left p-3 font-medium text-[var(--text-secondary)]">Entidad</th>
                  <th className="text-left p-3 font-medium text-[var(--text-secondary)]">Detalle</th>
                  <th className="text-left p-3 font-medium text-[var(--text-secondary)]">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr
                    key={log.id}
                    className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] hover:bg-[var(--surface-alt)] dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
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
                        <FileText className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />
                        <span className="text-xs font-medium text-[var(--text-secondary)]">{log.entity}</span>
                        {log.entityId && (
                          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-mono">
                            #{log.entityId.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 max-w-xs">
                      <p className="text-xs text-[var(--text-secondary)] truncate">{log.detail || "—"}</p>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />
                        <span className="text-xs text-[var(--text-secondary)]">{log.user || "sistema"}</span>
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)]/50 dark:bg-gray-800/30">
            <span className="text-xs text-[var(--text-secondary)]">{total} registros</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] disabled:opacity-40 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-[var(--surface-alt)] dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs text-[var(--text-secondary)]">{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg bg-[var(--surface-raised)] border border-[var(--rule-base)] disabled:opacity-40 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-[var(--surface-alt)] dark:hover:bg-gray-700 transition-colors"
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
