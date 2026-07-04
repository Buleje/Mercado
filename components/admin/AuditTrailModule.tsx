"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Shield, Search, RefreshCw, ChevronLeft, ChevronRight, User, Clock, FileText, Globe,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import {
  categoryOf, actionLabel, CATEGORY_UI, CATEGORY_ORDER, type AuditCategory,
} from "@/components/admin/tabs/audit-categories";

interface AuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  detail?: string;
  user?: string;
  ipAddress?: string;
  createdAt: string;
  [key: string]: unknown;
}

interface Summary {
  total: number;
  byAction: Array<{ action: string; count: number }>;
}

type Period = "today" | "7d" | "30d" | "all";
const PERIODS: Array<{ id: Period; label: string }> = [
  { id: "today", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "all", label: "Todo" },
];

const ENTITIES = [
  ["", "Todas las entidades"], ["Sale", "Ventas"], ["Product", "Productos"],
  ["Purchase", "Compras"], ["Customer", "Clientes"], ["Order", "Pedidos"],
  ["Settings", "Configuración"], ["Payable", "Cuentas por pagar"],
] as const;

const LIMIT = 30;
const FILTER_CLS =
  "h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] transition-colors";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }),
    time: d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }),
  };
}

function ActionBadge({ action }: { action: string }) {
  const ui = CATEGORY_UI[categoryOf(action)];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[length:var(--ts-xs)] font-bold", ui.pill)}>
      {actionLabel(action)}
    </span>
  );
}

export default function AuditTrailModule() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [period, setPeriod] = useState<Period>("all");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(page * LIMIT),
        period,
        summary: "1",
      });
      if (entityFilter) params.set("entity", entityFilter);
      if (actionFilter) params.set("action", actionFilter);
      if (search) params.set("user", search);

      const res = await fetch(`/api/audit-trail?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        if (data.summary) setSummary(data.summary);
      } else {
        setError(`No se pudo cargar el registro de auditoría (HTTP ${res.status})`);
      }
    } catch (e) {
      setError("No se pudo cargar el registro de auditoría — revisá tu conexión.");
      console.error("[AuditTrail] fetch error", e);
    }
    setLoading(false);
  }, [page, entityFilter, actionFilter, search, period]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const totalPages = Math.ceil(total / LIMIT);

  // Conteo por categoría para las cards de resumen.
  const catCounts = useMemo(() => {
    const acc: Record<AuditCategory, number> = { crear: 0, cambiar: 0, borrar: 0, acceso: 0, otro: 0 };
    for (const { action, count } of summary?.byAction ?? []) acc[categoryOf(action)] += count;
    return acc;
  }, [summary]);

  return (
    <div className="space-y-5">
      <AdminModuleHeader
        title="Auditoría"
        description="Quién hizo qué y cuándo — el registro completo de tu tienda"
        icon={Shield}
      />

      {/* Resumen por categoría */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-2xl border-2 border-[var(--accent)]/25 bg-[var(--accent-soft)] p-4">
          <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--accent-dark)]">
            Total de acciones
          </p>
          <p className="mt-1 font-display text-3xl font-extrabold tabular-nums text-[var(--text-primary)]">
            {summary ? summary.total.toLocaleString("es-PE") : "—"}
          </p>
        </div>
        {CATEGORY_ORDER.filter((c) => c !== "otro" || catCounts.otro > 0).map((cat) => {
          const ui = CATEGORY_UI[cat];
          const Icon = ui.icon;
          return (
            <div key={cat} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `color-mix(in srgb, ${ui.accentVar} 14%, transparent)`, color: ui.accentVar }}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <p className="text-sm font-semibold text-[var(--text-secondary)]">{ui.label}</p>
              </div>
              <p className="mt-1.5 font-display text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">
                {summary ? catCounts[cat].toLocaleString("es-PE") : "—"}
              </p>
            </div>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="space-y-3">
        {/* Período segmentado */}
        <div className="inline-flex rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-1">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setPeriod(p.id); setPage(0); }}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-bold transition-colors",
                period === p.id
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input
              type="text"
              placeholder="Buscar por usuario..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className={cn(FILTER_CLS, "w-full pl-12 pr-4 placeholder:text-[var(--text-tertiary)]")}
            />
          </div>
          <select
            value={entityFilter}
            onChange={(e) => { setEntityFilter(e.target.value); setPage(0); }}
            className={cn(FILTER_CLS, "px-4 font-medium")}
          >
            {ENTITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
            className={cn(FILTER_CLS, "px-4 font-medium")}
          >
            <option value="">Todas las acciones</option>
            {(summary?.byAction ?? []).map(({ action, count }) => (
              <option key={action} value={action}>{actionLabel(action)} ({count})</option>
            ))}
          </select>
          <button
            onClick={fetchLogs}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            title="Actualizar"
            aria-label="Actualizar"
          >
            <RefreshCw className={cn("h-5 w-5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Banner de error */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-2xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 px-4 py-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-error-500)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--data-error-700)]">{error}</p>
            <button type="button" onClick={fetchLogs} className="mt-1 text-sm font-bold text-[var(--data-error-700)] underline hover:no-underline">
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Contenido */}
      <div className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        {loading ? (
          <div className="p-10 text-center">
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center">
            <Shield className="mx-auto mb-3 h-9 w-9 text-[var(--text-tertiary)] opacity-40" aria-hidden />
            <p className="text-base font-bold text-[var(--text-primary)]">No hay registros para estos filtros</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Probá ampliar el período o quitar filtros.</p>
          </div>
        ) : (
          <>
            {/* Desktop: tabla */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full">
                <thead className="bg-[var(--surface-sunken)]/60">
                  <tr>
                    {["Fecha", "Acción", "Entidad", "Detalle", "Usuario"].map((h) => (
                      <th key={h} className="p-3.5 text-left text-sm font-bold text-[var(--text-secondary)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const { day, time } = fmtDate(log.createdAt);
                    return (
                      <tr key={log.id} className="border-t border-[var(--rule-soft)] transition-colors hover:bg-[var(--surface-sunken)]/40">
                        <td className="whitespace-nowrap p-3.5">
                          <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                            <Clock className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                            <span className="text-sm tabular-nums">{day} · {time}</span>
                          </div>
                        </td>
                        <td className="p-3.5"><ActionBadge action={log.action} /></td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5">
                            <FileText className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                            <span className="text-sm font-semibold text-[var(--text-primary)]">{log.entity}</span>
                            {log.entityId && (
                              <span className="text-[length:var(--ts-xs)] font-mono text-[var(--text-tertiary)]">#{log.entityId.slice(0, 8)}</span>
                            )}
                          </div>
                        </td>
                        <td className="max-w-sm p-3.5">
                          <p className="truncate text-sm text-[var(--text-secondary)]" title={log.detail || undefined}>{log.detail || "—"}</p>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5">
                            <User className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                            <span className="text-sm font-medium text-[var(--text-primary)]">{log.user || "sistema"}</span>
                          </div>
                          {log.ipAddress && (
                            <div className="mt-0.5 flex items-center gap-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                              <Globe className="h-3 w-3 shrink-0" aria-hidden />
                              <span className="font-mono">{log.ipAddress.replace(/^::ffff:/, "")}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards */}
            <div className="divide-y divide-[var(--rule-soft)] sm:hidden">
              {logs.map((log) => {
                const { day, time } = fmtDate(log.createdAt);
                return (
                  <div key={log.id} className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <ActionBadge action={log.action} />
                      <span className="text-[length:var(--ts-xs)] tabular-nums text-[var(--text-tertiary)]">{day} · {time}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <FileText className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{log.entity}</span>
                      {log.entityId && (
                        <span className="text-[length:var(--ts-xs)] font-mono text-[var(--text-tertiary)]">#{log.entityId.slice(0, 8)}</span>
                      )}
                    </div>
                    {log.detail && <p className="mt-1 text-sm text-[var(--text-secondary)]">{log.detail}</p>}
                    <div className="mt-2 flex items-center gap-3 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5" aria-hidden /> {log.user || "sistema"}
                      </span>
                      {log.ipAddress && (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Globe className="h-3.5 w-3.5" aria-hidden /> {log.ipAddress.replace(/^::ffff:/, "")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/40 px-4 py-3">
            <span className="text-sm text-[var(--text-secondary)]">{total.toLocaleString("es-PE")} registros</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] transition-colors hover:border-[var(--accent)] disabled:opacity-40 disabled:hover:border-[var(--rule-base)]"
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold tabular-nums text-[var(--text-secondary)]">{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] transition-colors hover:border-[var(--accent)] disabled:opacity-40 disabled:hover:border-[var(--rule-base)]"
                aria-label="Página siguiente"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
