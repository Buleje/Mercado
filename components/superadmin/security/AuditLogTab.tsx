"use client";

/**
 * AuditLogTab — Registro de auditoría con filtros + paginación.
 *
 * Datos REALES desde GET /api/superadmin/security?days=30 que lee de la
 * tabla activityLog. Filtros aplicados client-side sobre la página actual.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Search,
  Download,
  FileText,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from "@buleje/design-system/icons";
import {
  AdminSection,
  BadgeStatus,
  BodyText,
  Caption,
  DataTable,
  SuccessAlert,
} from "@buleje/design-system";
import type { BadgeStatusVariant } from "@buleje/design-system";

interface AuditEvent {
  id: string;
  action: string;
  detail: string;
  ipAddress: string | null;
  createdAt: string;
}

const ACTION_BADGE: Record<string, BadgeStatusVariant> = {
  login_success: "success",
  login_failed: "warning",
  login_locked: "error",
  login_honeypot: "error",
  "2fa_failed": "error",
  "2fa_challenge": "info",
  logout: "neutral",
  sessions_revoked_all: "warning",
};

const PAGE_SIZE = 10;

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Extrae el "user" del detail (formato variable: a veces "username: X", a veces no)
function extractUser(detail: string): string {
  const m = detail.match(/(?:username|user|por)[:\s]+([\w.@-]+)/i);
  return m ? m[1] : "—";
}

export function AuditLogTab() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterUser, setFilterUser] = useState<string>("");
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState<{ title: string; description?: string } | null>(null);
  const [days, setDays] = useState<number>(30);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/security?days=${days}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { data: { events: AuditEvent[] } };
      setEvents(data.data.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = filterUser.trim().toLowerCase();
    return events.filter((e) => {
      if (filterAction && e.action !== filterAction) return false;
      if (q && !e.detail.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, filterAction, filterUser]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const uniqueActions = useMemo(
    () => Array.from(new Set(events.map((e) => e.action))).sort(),
    [events],
  );

  const handleExportCsv = () => {
    // CSV client-side — sin endpoint extra. Cumple con el "Export CSV" funcional.
    const header = ["fecha", "accion", "detalle", "ip"].join(",");
    const rows = filtered.map((e) =>
      [
        fmtDateTime(e.createdAt),
        e.action,
        `"${e.detail.replace(/"/g, '""')}"`,
        e.ipAddress ?? "",
      ].join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback({
      title: "Export generado",
      description: `Se descargó un CSV con ${filtered.length} registro${filtered.length === 1 ? "" : "s"}.`,
    });
  };

  const selectCls =
    "rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1.5 px-3 text-[length:var(--ts-sm)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)]/20";

  return (
    <div className="space-y-6">
      {feedback && (
        <SuccessAlert title={feedback.title} description={feedback.description} />
      )}

      <AdminSection
        title="Registro de auditoría"
        description={`${filtered.length} registros con los filtros actuales (ventana: ${days}d)`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
              className={selectCls}
            >
              <option value={1}>Últimas 24h</option>
              <option value={7}>Últimos 7 días</option>
              <option value={30}>Últimos 30 días</option>
              <option value={90}>Últimos 90 días</option>
            </select>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-[length:var(--ts-sm)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Export CSV
            </button>
            <a
              href="/superadmin/activity"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-[length:var(--ts-sm)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              Ver log completo
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]"
              aria-hidden
            />
            <input
              value={filterUser}
              onChange={(e) => { setFilterUser(e.target.value); setPage(1); }}
              placeholder="Filtrar por contenido del detalle..."
              className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1.5 pl-8 pr-3 text-[length:var(--ts-sm)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)]/20"
            />
          </div>
          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
            className={selectCls}
          >
            <option value="">Todas las acciones</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {loading && events.length === 0 ? (
          <div className="flex items-center gap-2 py-8 text-[var(--text-tertiary)] text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando audit log…
          </div>
        ) : error ? (
          <div role="alert" className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/5 p-4 flex items-start gap-2 text-[var(--data-error-500)]">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="text-sm">{error}</span>
          </div>
        ) : (
          <>
            <DataTable>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Acción</th>
                  <th>Detalle</th>
                  <th>Usuario</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap text-[var(--text-secondary)]">{fmtDateTime(entry.createdAt)}</td>
                    <td>
                      <BadgeStatus
                        variant={ACTION_BADGE[entry.action] ?? "neutral"}
                        label={entry.action}
                        size="sm"
                      />
                    </td>
                    <td className="max-w-md">
                      <BodyText className="truncate text-[var(--text-secondary)]">{entry.detail}</BodyText>
                    </td>
                    <td className="text-[var(--text-secondary)]">{extractUser(entry.detail)}</td>
                    <td className="font-mono text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                      {entry.ipAddress ?? "—"}
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <Caption className="block py-6 text-center text-[var(--text-tertiary)]">
                        {events.length === 0
                          ? `No hay eventos de seguridad en los últimos ${days} días`
                          : "No hay registros que cumplan los filtros"}
                      </Caption>
                    </td>
                  </tr>
                )}
              </tbody>
            </DataTable>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <Caption className="text-[var(--text-tertiary)]">
                  Página {safePage} de {totalPages}
                </Caption>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1 text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3 w-3" aria-hidden />
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1 text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-40"
                  >
                    Siguiente
                    <ChevronRight className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </AdminSection>
    </div>
  );
}
