"use client";

/**
 * AuditLogTab — Registro completo de auditoría con filtros + paginación.
 *
 * Muestra las últimas acciones registradas con capacidad de filtro por
 * resource, user y action, export CSV (stub), y link al log completo
 * en /superadmin/activity.
 */

import { useMemo, useState } from "react";
import {
  Search,
  Download,
  FileText,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
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
import {
  AUDIT_LOG_ENTRIES,
  fmtDateTime,
} from "@/lib/mocks/security-events.mock";

const ACTION_BADGE: Record<string, BadgeStatusVariant> = {
  login: "info",
  logout: "neutral",
  read: "neutral",
  write: "info",
  update: "info",
  delete: "error",
  impersonate: "warning",
  rotate: "success",
};

const PAGE_SIZE = 10;

export function AuditLogTab() {
  const [filterResource, setFilterResource] = useState<string>("");
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterUser, setFilterUser] = useState<string>("");
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState<{ title: string; description?: string } | null>(null);

  const filtered = useMemo(() => {
    const q = filterUser.trim().toLowerCase();
    return AUDIT_LOG_ENTRIES.filter((e) => {
      if (filterResource && e.resource !== filterResource) return false;
      if (filterAction && e.action !== filterAction) return false;
      if (q && !e.user.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filterResource, filterAction, filterUser]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const uniqueResources = useMemo(
    () => Array.from(new Set(AUDIT_LOG_ENTRIES.map((e) => e.resource))).sort(),
    [],
  );
  const uniqueActions = useMemo(
    () => Array.from(new Set(AUDIT_LOG_ENTRIES.map((e) => e.action))).sort(),
    [],
  );

  /**
   * TODO: reemplazar con GET /api/superadmin/security/audit-log/export?format=csv
   * Por ahora genera feedback mock.
   */
  const handleExportCsv = () => {
    setFeedback({
      title: "Exportación generada (mock)",
      description: `Se generó un CSV con ${filtered.length} registros. El archivo real se enviará por correo al superadmin.`,
    });
  };

  const selectCls =
    "rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1.5 px-3 text-[length:var(--ts-sm)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)]/20";

  return (
    <div className="space-y-6">
      {feedback && (
        <SuccessAlert
          title={feedback.title}
          description={feedback.description}
        />
      )}

      <AdminSection
        title="Registro de auditoría"
        description={`${filtered.length} registros con los filtros actuales`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-[length:var(--ts-sm)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
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
              onChange={(e) => {
                setFilterUser(e.target.value);
                setPage(1);
              }}
              placeholder="Filtrar por usuario..."
              className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1.5 pl-8 pr-3 text-[length:var(--ts-sm)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)]/20"
            />
          </div>
          <select
            value={filterResource}
            onChange={(e) => {
              setFilterResource(e.target.value);
              setPage(1);
            }}
            className={selectCls}
          >
            <option value="">Todos los recursos</option>
            {uniqueResources.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={filterAction}
            onChange={(e) => {
              setFilterAction(e.target.value);
              setPage(1);
            }}
            className={selectCls}
          >
            <option value="">Todas las acciones</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <DataTable>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Recurso</th>
              <th>Detalle</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((entry) => (
              <tr key={entry.id}>
                <td className="whitespace-nowrap text-[var(--text-secondary)]">
                  {fmtDateTime(entry.timestamp)}
                </td>
                <td className="text-[var(--text-secondary)]">
                  {entry.user}
                </td>
                <td>
                  <BadgeStatus
                    variant={ACTION_BADGE[entry.action] ?? "neutral"}
                    label={entry.action}
                    size="sm"
                  />
                </td>
                <td className="font-mono text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  {entry.resource}
                </td>
                <td className="max-w-md">
                  <BodyText className="truncate text-[var(--text-secondary)]">
                    {entry.detail}
                  </BodyText>
                </td>
                <td className="font-mono text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  {entry.ip}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <Caption className="block py-6 text-center text-[var(--text-tertiary)]">
                    No hay registros que cumplan los filtros
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
      </AdminSection>
    </div>
  );
}
