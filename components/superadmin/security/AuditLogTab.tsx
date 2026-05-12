"use client";

/**
 * AuditLogTab — Registro de auditoría con filtros + paginación.
 *
 * Mejoras 2026-05-11:
 *  - Stat row: total, login success/failed/locked, unique IPs
 *  - Quick filter chips (Solo failures / Solo logins / Solo 2FA)
 *  - Table consistente con resto Security Center
 *  - Pagination compacta
 *
 * Datos REALES desde GET /api/superadmin/security?days=30.
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
  CheckCircle2,
  Activity,
  Ban,
  Globe,
  CheckCheck,
  ScrollText,
  type LucideIcon,
} from "@buleje/design-system/icons";

interface AuditEvent {
  id: string;
  action: string;
  detail: string;
  ipAddress: string | null;
  createdAt: string;
}

const ACTION_META: Record<
  string,
  { label: string; cls: string; dot: string }
> = {
  login_success: {
    label: "login_success",
    cls: "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 text-[var(--data-success-500)]",
    dot: "bg-[var(--data-success-500)]",
  },
  login_failed: {
    label: "login_failed",
    cls: "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  login_locked: {
    label: "login_locked",
    cls: "border-rose-300/60 bg-rose-50/60 text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  login_honeypot: {
    label: "login_honeypot",
    cls: "border-rose-300/60 bg-rose-50/60 text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  "2fa_failed": {
    label: "2fa_failed",
    cls: "border-rose-300/60 bg-rose-50/60 text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  "2fa_challenge": {
    label: "2fa_challenge",
    cls: "border-sky-300/60 bg-sky-50/60 text-sky-700 dark:border-sky-700/40 dark:bg-sky-950/30 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  logout: {
    label: "logout",
    cls: "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
    dot: "bg-[var(--text-tertiary)]",
  },
  sessions_revoked_all: {
    label: "sessions_revoked_all",
    cls: "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300",
    dot: "bg-amber-500",
  },
};

function actionMeta(action: string) {
  return (
    ACTION_META[action] ?? {
      label: action,
      cls: "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
      dot: "bg-[var(--text-tertiary)]",
    }
  );
}

const PAGE_SIZE = 15;

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractUser(detail: string): string {
  const m = detail.match(/(?:username|user|por)[:\s]+([\w.@-]+)/i);
  return m ? m[1] : "—";
}

type QuickFilter = "all" | "failures" | "logins" | "twofa";

export function AuditLogTab() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterUser, setFilterUser] = useState<string>("");
  const [page, setPage] = useState(1);
  const [feedback, setFeedback] = useState<{ title: string; description?: string } | null>(null);
  const [days, setDays] = useState<number>(30);
  const [quick, setQuick] = useState<QuickFilter>("all");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/security?days=${days}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { data: { events: AuditEvent[] } };
      setEvents(data.data.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stats = useMemo(() => {
    const success = events.filter((e) => e.action === "login_success").length;
    const failed = events.filter((e) =>
      ["login_failed", "2fa_failed", "login_honeypot"].includes(e.action),
    ).length;
    const locked = events.filter((e) => e.action === "login_locked").length;
    const uniqueIPs = new Set(events.map((e) => e.ipAddress).filter(Boolean)).size;
    return { total: events.length, success, failed, locked, uniqueIPs };
  }, [events]);

  const filtered = useMemo(() => {
    const q = filterUser.trim().toLowerCase();
    return events.filter((e) => {
      if (filterAction && e.action !== filterAction) return false;
      if (q && !e.detail.toLowerCase().includes(q)) return false;
      if (quick === "failures" && !["login_failed", "2fa_failed", "login_honeypot", "login_locked"].includes(e.action))
        return false;
      if (quick === "logins" && !["login_success", "login_failed", "logout"].includes(e.action))
        return false;
      if (quick === "twofa" && !["2fa_challenge", "2fa_failed"].includes(e.action))
        return false;
      return true;
    });
  }, [events, filterAction, filterUser, quick]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const uniqueActions = useMemo(
    () => Array.from(new Set(events.map((e) => e.action))).sort(),
    [events],
  );

  const handleExportCsv = () => {
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
    a.download = `audit-log-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback({
      title: "Export generado",
      description: `Se descargó un CSV con ${filtered.length} registro${filtered.length === 1 ? "" : "s"}.`,
    });
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/5 px-4 py-3 text-[var(--data-success-500)]"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-display text-sm font-extrabold">{feedback.title}</p>
            {feedback.description && (
              <p className="text-xs opacity-90 mt-0.5">{feedback.description}</p>
            )}
          </div>
        </div>
      )}

      {/* ─── Stats row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniStat icon={Activity} label="Total" value={stats.total} tone="accent" />
        <MiniStat icon={CheckCheck} label="Logins OK" value={stats.success} tone="success" />
        <MiniStat
          icon={AlertTriangle}
          label="Fallos"
          value={stats.failed}
          tone={stats.failed > 5 ? "warning" : "neutral"}
        />
        <MiniStat
          icon={Ban}
          label="Lockouts"
          value={stats.locked}
          tone={stats.locked > 0 ? "danger" : "neutral"}
        />
        <MiniStat icon={Globe} label="IPs únicas" value={stats.uniqueIPs} tone="neutral" />
      </div>

      {/* ─── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick filter chips */}
          <div className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
            {(["all", "failures", "logins", "twofa"] as const).map((f) => {
              const isActive = quick === f;
              const label =
                f === "all"
                  ? "Todos"
                  : f === "failures"
                    ? "Solo fallos"
                    : f === "logins"
                      ? "Solo logins"
                      : "Solo 2FA";
              return (
                <button
                  key={f}
                  onClick={() => {
                    setQuick(f);
                    setPage(1);
                  }}
                  className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    isActive
                      ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Days select */}
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="h-9 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value={1}>Últimas 24h</option>
            <option value={7}>Últimos 7d</option>
            <option value={30}>Últimos 30d</option>
            <option value={90}>Últimos 90d</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export CSV
          </button>
          <a
            href="/superadmin/activity"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            Log completo
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      </div>

      {/* ─── Table ───────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <ScrollText className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                Registro de auditoría
              </h3>
              <p className="text-xs text-[var(--text-tertiary)]">
                {filtered.length} {filtered.length === 1 ? "registro" : "registros"} · ventana{" "}
                {days}d
              </p>
            </div>
          </div>
        </header>

        {/* Inline filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap p-4 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]"
              aria-hidden
            />
            <input
              value={filterUser}
              onChange={(e) => {
                setFilterUser(e.target.value);
                setPage(1);
              }}
              placeholder="Filtrar por contenido del detalle…"
              className="w-full rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>
          <select
            value={filterAction}
            onChange={(e) => {
              setFilterAction(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="">Todas las acciones</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {loading && events.length === 0 ? (
          <div className="flex items-center gap-2 px-5 py-12 text-[var(--text-tertiary)] text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando audit log…
          </div>
        ) : error ? (
          <div
            role="alert"
            className="m-5 rounded-xl border border-rose-300/60 bg-rose-50/40 p-4 flex items-start gap-2 text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="text-sm">{error}</span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule-soft)] text-left text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
                    <th className="px-5 py-3 font-extrabold">Fecha</th>
                    <th className="px-3 py-3 font-extrabold">Acción</th>
                    <th className="px-3 py-3 font-extrabold">Detalle</th>
                    <th className="px-3 py-3 font-extrabold">Usuario</th>
                    <th className="px-5 py-3 font-extrabold">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft)]">
                  {pageRows.map((entry) => {
                    const meta = actionMeta(entry.action);
                    return (
                      <tr
                        key={entry.id}
                        className="transition hover:bg-[var(--surface-sunken)]/50"
                      >
                        <td className="px-5 py-3 whitespace-nowrap text-[var(--text-secondary)]">
                          {fmtDateTime(entry.createdAt)}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[length:var(--ts-2xs)] font-bold ${meta.cls}`}
                          >
                            <span className={`h-1 w-1 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 max-w-md">
                          <p className="truncate text-[var(--text-secondary)]">{entry.detail}</p>
                        </td>
                        <td className="px-3 py-3 text-[var(--text-secondary)]">
                          {extractUser(entry.detail)}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-[var(--text-tertiary)]">
                          {entry.ipAddress ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <div className="px-5 py-12 text-center">
                          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
                            <ScrollText
                              className="h-5 w-5 text-[var(--text-tertiary)]"
                              aria-hidden
                            />
                          </div>
                          <p className="font-display text-sm font-extrabold text-[var(--text-primary)]">
                            {events.length === 0
                              ? `Sin eventos en los últimos ${days} días`
                              : "Sin resultados con los filtros actuales"}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3">
                <p className="text-xs text-[var(--text-tertiary)]">
                  Página{" "}
                  <span className="font-bold text-[var(--text-primary)]">{safePage}</span> de{" "}
                  <span className="font-bold text-[var(--text-primary)]">{totalPages}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="inline-flex items-center gap-1 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="inline-flex items-center gap-1 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 disabled:opacity-40"
                  >
                    Siguiente
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "accent" | "success" | "warning" | "danger" | "neutral";
}) {
  const iconBg = {
    accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
    success: "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    danger: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
    neutral: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
  }[tone];
  return (
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3.5">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </p>
      </div>
      <p className="mt-2 font-display text-xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}
