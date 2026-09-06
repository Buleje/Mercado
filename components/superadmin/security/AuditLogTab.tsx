"use client";

/**
 * AuditLogTab — Registro de auditoría con filtros + paginación.
 *
 * Mejoras 2026-05-24:
 *  - Auto-refresh 60s opt-in con indicador
 *  - Toast inline reemplaza feedback alert persistente
 *  - Search debounced 200ms en detail
 *  - Skeleton loading reemplaza spinner solitario
 *  - Keyboard: / busca · R recarga · Esc limpia filtros
 *  - Page size selector (15/50/100)
 *  - CSV export RFC 4180 + BOM UTF-8 (antes manual con bug en quotes)
 *  - Tap targets ≥44px en pagination + chips
 *  - Tonos rose/emerald correctos (5 sitios usaban var(--accent) y
 *    var(--data-success-500) inconsistentes)
 *
 * Datos REALES desde GET /api/superadmin/security?days=N (ya endurecido
 * con rate-limit + no-store en este commit).
 */

import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Download,
  FileText,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Activity,
  Ban,
  Globe,
  CheckCheck,
  ScrollText,
  RefreshCw,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

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
    cls: "border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  login_failed: {
    label: "login_failed",
    cls: "border-teal-300/60 bg-teal-50 text-teal-700 dark:border-teal-700/40 dark:bg-teal-500/15 dark:text-teal-300",
    dot: "bg-teal-500",
  },
  login_locked: {
    label: "login_locked",
    cls: "border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  login_honeypot: {
    label: "login_honeypot",
    cls: "border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  "2fa_failed": {
    label: "2fa_failed",
    cls: "border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  "2fa_challenge": {
    label: "2fa_challenge",
    cls: "border-sky-300/60 bg-sky-50 text-sky-700 dark:border-sky-700/40 dark:bg-sky-500/15 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  logout: {
    label: "logout",
    cls: "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
    dot: "bg-[var(--text-tertiary)]",
  },
  sessions_revoked_all: {
    label: "sessions_revoked_all",
    cls: "border-teal-300/60 bg-teal-50 text-teal-700 dark:border-teal-700/40 dark:bg-teal-500/15 dark:text-teal-300",
    dot: "bg-teal-500",
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

type QuickFilter = "all" | "failures" | "logins" | "twofa";
type PageSize = 15 | 50 | 100;
type ToastTone = "success" | "error" | "info";
type Toast = { id: number; text: string; tone: ToastTone };

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg backdrop-blur",
            t.tone === "success" && "bg-emerald-600 text-white",
            t.tone === "error" && "bg-rose-600 text-white",
            t.tone === "info" && "bg-slate-800 text-white",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-[var(--surface-sunken)] h-24" />
        ))}
      </div>
      <div className="rounded-2xl bg-[var(--surface-sunken)] h-16" />
      <div className="rounded-2xl bg-[var(--surface-sunken)] h-96" />
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AuditLogTab() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterDetailRaw, setFilterDetailRaw] = useState<string>("");
  const [filterDetail, setFilterDetail] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(15);
  const [days, setDays] = useState<number>(30);
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(1);
  const searchRef = useRef<HTMLInputElement>(null);

  const pushToast = useCallback((text: string, tone: ToastTone = "info") => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setFilterDetail(filterDetailRaw);
      setPage(1);
    }, 200);
    return () => clearTimeout(t);
  }, [filterDetailRaw]);

  const reload = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setRefreshing(true);
      setError(null);
      try {
        const res = await fetch(`/api/superadmin/security?days=${days}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { data: { events: AuditEvent[] } };
        setEvents(data.data.events);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al cargar";
        setError(msg);
        if (silent) pushToast(`Refresh fallido: ${msg}`, "error");
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [days, pushToast],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  // Auto-refresh 60s
  useVisiblePolling(() => void reload(true), 60_000, autoRefresh);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select";
      if (e.key === "Escape" && !inField) {
        if (filterDetailRaw || filterAction || quick !== "all") {
          setFilterDetailRaw("");
          setFilterAction("");
          setQuick("all");
          setPage(1);
        }
      }
      if (inField) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void reload();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filterDetailRaw, filterAction, quick, reload]);

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
    const q = filterDetail.trim().toLowerCase();
    return events.filter((e) => {
      if (filterAction && e.action !== filterAction) return false;
      if (q && !e.detail.toLowerCase().includes(q)) return false;
      if (
        quick === "failures" &&
        !["login_failed", "2fa_failed", "login_honeypot", "login_locked"].includes(e.action)
      )
        return false;
      if (quick === "logins" && !["login_success", "login_failed", "logout"].includes(e.action))
        return false;
      if (quick === "twofa" && !["2fa_challenge", "2fa_failed"].includes(e.action))
        return false;
      return true;
    });
  }, [events, filterAction, filterDetail, quick]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const uniqueActions = useMemo(
    () => Array.from(new Set(events.map((e) => e.action))).sort(),
    [events],
  );

  const handleExportCsv = () => {
    const headers = ["Fecha", "Accion", "Detalle", "IP"];
    const rows = filtered.map((e) => [
      fmtDateTime(e.createdAt),
      e.action,
      e.detail,
      e.ipAddress ?? "",
    ]);
    const csv =
      "﻿" +
      [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast(`CSV descargado · ${filtered.length} registros`, "success");
  };

  if (loading && events.length === 0) return <Skeleton />;

  return (
    <div className="space-y-6">
      <Toasts toasts={toasts} />

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
                  aria-pressed={isActive}
                  className={cn(
                    "inline-flex h-10 items-center rounded-lg px-3 text-xs font-bold transition",
                    isActive
                      ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <select
            value={days}
            onChange={(e) => {
              setDays(parseInt(e.target.value, 10));
              setPage(1);
            }}
            aria-label="Ventana de tiempo"
            className="h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value={1}>Últimas 24h</option>
            <option value={7}>Últimos 7d</option>
            <option value={30}>Últimos 30d</option>
            <option value={90}>Últimos 90d</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => reload()}
            disabled={refreshing}
            title="Recargar (R)"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
              aria-hidden
            />
            Recargar
          </button>
          <label className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] cursor-pointer hover:border-[var(--accent)]/40">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Auto 60s
          </label>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-40"
          >
            <Download className="h-4 w-4" aria-hidden />
            CSV ({filtered.length})
          </button>
          <a
            href="/superadmin/activity"
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            <FileText className="h-4 w-4" aria-hidden />
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
                {filtered.length} {filtered.length === 1 ? "registro" : "registros"} ·
                ventana {days}d
              </p>
            </div>
          </div>
        </header>

        {/* Inline filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap p-4 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
              aria-hidden
            />
            <input
              ref={searchRef}
              type="search"
              value={filterDetailRaw}
              onChange={(e) => setFilterDetailRaw(e.target.value)}
              placeholder="Filtrar por contenido del detalle…"
              aria-label="Buscar en detalles"
              className="w-full h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
            />
          </div>
          <select
            value={filterAction}
            onChange={(e) => {
              setFilterAction(e.target.value);
              setPage(1);
            }}
            aria-label="Filtrar por acción"
            className="h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="">Todas las acciones</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(parseInt(e.target.value, 10) as PageSize);
              setPage(1);
            }}
            aria-label="Filas por página"
            className="h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value={15}>15 por página</option>
            <option value={50}>50 por página</option>
            <option value={100}>100 por página</option>
          </select>
        </div>

        {error ? (
          <div
            role="alert"
            className="m-5 rounded-xl border-2 border-rose-300 bg-rose-50 p-4 flex items-start gap-2 text-rose-700 dark:border-rose-700/40 dark:bg-rose-500/10 dark:text-rose-300"
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
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[length:var(--ts-2xs)] font-bold",
                              meta.cls,
                            )}
                          >
                            <span className={cn("h-1 w-1 rounded-full", meta.dot)} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 max-w-md">
                          <p className="truncate text-[var(--text-secondary)]" title={entry.detail}>
                            {entry.detail}
                          </p>
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
                          {(filterDetailRaw || filterAction || quick !== "all") && (
                            <button
                              onClick={() => {
                                setFilterDetailRaw("");
                                setFilterAction("");
                                setQuick("all");
                                setPage(1);
                              }}
                              className="mt-3 h-10 px-4 rounded-xl text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10"
                            >
                              Limpiar filtros
                            </button>
                          )}
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
                  <span className="font-bold text-[var(--text-primary)]">
                    {safePage}
                  </span>{" "}
                  de{" "}
                  <span className="font-bold text-[var(--text-primary)]">
                    {totalPages}
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="inline-flex h-11 items-center gap-1 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="inline-flex h-11 items-center gap-1 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 disabled:opacity-40"
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-right">
        Atajos:{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono border border-[var(--rule-soft)]">
          /
        </kbd>{" "}
        buscar ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono border border-[var(--rule-soft)]">
          R
        </kbd>{" "}
        recargar ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono border border-[var(--rule-soft)]">
          Esc
        </kbd>{" "}
        limpiar
      </p>
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
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    warning: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
    danger: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    neutral: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
  }[tone];
  return (
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3.5">
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg", iconBg)}>
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
