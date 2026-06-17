"use client";

/**
 * AuthSessionsTab — Sesiones activas + 2FA + login chart + política.
 *
 * Mejoras 2026-05-24:
 *  - Auto-refresh 60s opt-in con indicador
 *  - Toast inline (sustituye feedback alert persistente)
 *  - Search debounced en sesiones (user/ip/UA)
 *  - CSV export de sesiones
 *  - Cards mobile + tabla desktop (sin overflow)
 *  - Keyboard: / busca · R recarga · Esc limpia
 *  - Skeleton loading reemplaza spinner solitario
 *  - Tonos rose-700/dark:rose-300 correctos (NO var(--accent))
 *  - Force-logout via hook unificado con CSRF estricto
 *
 * Disclaimer honesto: las sesiones del superadmin son JWT stateless. La lista
 * se deriva del audit log (último login_success sin logout posterior).
 */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  Lock,
  Key,
  ShieldCheck,
  Smartphone,
  Monitor,
  AlertTriangle,
  Loader2,
  LogOut,
  Info,
  Users,
  CheckCircle2,
  Search,
  Download,
  RefreshCw,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  user: string;
  ip: string | null;
  userAgent: string | null;
  startedAt: string;
  lastSeen: string;
  isCurrent: boolean;
}

interface PostureData {
  totpCoverage: {
    enrolled: number;
    total: number;
    admins: Array<{ username: string; totpEnabled: boolean; lastLoginAt: string | null }>;
  };
  loginSeries7d: Array<{ day: string; failed: number; succeeded: number; iso: string }>;
}

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; text: string; tone: ToastTone };

const PASSWORD_POLICY = {
  minLength: 12,
  expirationDays: 90,
  lockoutAttempts: 5,
  lockoutMinutes: 15,
};

// ─── Helpers ────────────────────────────────────────────────────────────

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (diffMin < 1) return "hace instantes";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  return `hace ${Math.round(diffH / 24)}d`;
}

function deviceFromUA(ua: string | null): { label: string; isMobile: boolean } {
  if (!ua) return { label: "Desconocido", isMobile: false };
  const isMobile = /mobile|android|ios|iphone|ipad/i.test(ua);
  const browser =
    /Chrome\/[\d.]+/.exec(ua)?.[0] ??
    /Safari\/[\d.]+/.exec(ua)?.[0] ??
    /Firefox\/[\d.]+/.exec(ua)?.[0] ??
    "Browser";
  return { label: browser.split("/")[0] + (isMobile ? " mobile" : ""), isMobile };
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportSessionsCSV(rows: SessionRow[]) {
  const headers = ["ID", "User", "IP", "UserAgent", "StartedAt", "LastSeen", "IsCurrent"];
  const data = rows.map((r) => [
    r.id,
    r.user,
    r.ip ?? "",
    r.userAgent ?? "",
    r.startedAt,
    r.lastSeen,
    r.isCurrent ? "yes" : "no",
  ]);
  const csv =
    "﻿" +
    [headers, ...data].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `auth_sessions_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Skeleton ───────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-[var(--surface-sunken)] h-24" />
        ))}
      </div>
      <div className="rounded-2xl bg-[var(--surface-sunken)] h-20" />
      <div className="rounded-2xl bg-[var(--surface-sunken)] h-64" />
    </div>
  );
}

// ─── Toasts ─────────────────────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────────

export function AuthSessionsTab() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [posture, setPosture] = useState<PostureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");

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
    const t = setTimeout(() => setSearch(searchRaw), 200);
    return () => clearTimeout(t);
  }, [searchRaw]);

  const reload = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setRefreshing(true);
      setError(null);
      try {
        const [sRes, pRes] = await Promise.all([
          fetch("/api/superadmin/security/sessions", {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/superadmin/security/posture", {
            credentials: "include",
            cache: "no-store",
          }),
        ]);
        if (!sRes.ok || !pRes.ok)
          throw new Error(`HTTP ${sRes.status}/${pRes.status}`);
        const sData = (await sRes.json()) as { data: { sessions: SessionRow[] } };
        const pData = (await pRes.json()) as { data: PostureData };
        setSessions(sData.data.sessions);
        setPosture(pData.data);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al cargar";
        setError(msg);
        if (silent) pushToast(`Refresh fallido: ${msg}`, "error");
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [pushToast],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  // Custom event para botón "Actualizar" del Hero
  useEffect(() => {
    const handler = () => void reload();
    window.addEventListener("security-sessions-refresh", handler);
    return () => window.removeEventListener("security-sessions-refresh", handler);
  }, [reload]);

  // Auto-refresh 60s
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => void reload(true), 60_000);
    return () => clearInterval(t);
  }, [autoRefresh, reload]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select";
      if (e.key === "Escape" && !inField) setSearchRaw("");
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
  }, [reload]);

  const totpAdmins = posture?.totpCoverage.admins ?? [];
  const series = useMemo(() => posture?.loginSeries7d ?? [], [posture]);
  const totalFailures = useMemo(
    () => series.reduce((acc, p) => acc + p.failed, 0),
    [series],
  );
  const totalSuccess = useMemo(
    () => series.reduce((acc, p) => acc + p.succeeded, 0),
    [series],
  );
  const totpPct = posture
    ? posture.totpCoverage.total === 0
      ? 0
      : Math.round((posture.totpCoverage.enrolled / posture.totpCoverage.total) * 100)
    : 0;
  const successRate =
    totalFailures + totalSuccess === 0
      ? 100
      : Math.round((totalSuccess / (totalFailures + totalSuccess)) * 100);

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        s.user.toLowerCase().includes(q) ||
        (s.ip?.toLowerCase().includes(q) ?? false) ||
        (s.userAgent?.toLowerCase().includes(q) ?? false),
    );
  }, [sessions, search]);

  const handleRevokeAll = async () => {
    setRevoking(true);
    try {
      const res = await fetch("/api/superadmin/security/sessions/revoke", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      pushToast(
        "Logout global disparado · todas las sesiones invalidadas",
        "success",
      );
      setRevokeOpen(false);
      void reload();
    } catch (e) {
      pushToast(
        `Error al revocar: ${e instanceof Error ? e.message : "desconocido"}`,
        "error",
      );
    } finally {
      setRevoking(false);
    }
  };

  if (loading && !posture) return <Skeleton />;

  return (
    <div className="space-y-6">
      <Toasts toasts={toasts} />

      {/* ─── Action bar ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => reload()}
          disabled={refreshing}
          title="Recargar (R)"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-4 w-4", refreshing && "animate-spin")}
            aria-hidden
          />
          Recargar
        </button>
        <label className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] cursor-pointer hover:border-[var(--accent)]/40">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Auto 60s
        </label>
        <button
          onClick={() => exportSessionsCSV(filteredSessions)}
          disabled={filteredSessions.length === 0}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden />
          CSV ({filteredSessions.length})
        </button>
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">
          Atajos:{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono border border-[var(--rule-soft)]">
            /
          </kbd>{" "}
          buscar ·{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] font-mono border border-[var(--rule-soft)]">
            R
          </kbd>{" "}
          recargar
        </span>
      </div>

      {/* ─── KPIs row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniKpi
          icon={Users}
          label="Sesiones"
          value={sessions.length}
          subtitle="Ventana 8h"
          tone="accent"
        />
        <MiniKpi
          icon={CheckCircle2}
          label="Éxitos 7d"
          value={totalSuccess}
          subtitle={`${successRate}% tasa éxito`}
          tone="success"
        />
        <MiniKpi
          icon={AlertTriangle}
          label="Fallos 7d"
          value={totalFailures}
          subtitle={totalFailures > 10 ? "Sobre el umbral" : "Dentro del umbral"}
          tone={totalFailures > 10 ? "warning" : "neutral"}
        />
        <MiniKpi
          icon={ShieldCheck}
          label="TOTP 2FA"
          value={`${totpPct}%`}
          subtitle={`${posture?.totpCoverage.enrolled ?? 0} de ${posture?.totpCoverage.total ?? 0}`}
          tone={totpPct === 100 ? "success" : totpPct >= 50 ? "warning" : "danger"}
        />
      </div>

      {/* ─── Disclaimer + Force logout ───────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start gap-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-4">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
          <Info className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display text-sm font-extrabold text-[var(--text-primary)]">
            Cómo se calculan estas sesiones
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Las sesiones del superadmin son JWT stateless (sin tabla persistente).
            La lista se deriva del audit log: último login exitoso sin logout
            posterior por usuario, ventana de 8h. Para invalidación efectiva ante
            incidente, usá{" "}
            <strong className="text-[var(--text-primary)]">
              Forzar logout global
            </strong>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRevokeOpen(true)}
          className="shrink-0 inline-flex h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-extrabold uppercase tracking-wider text-white shadow-md hover:bg-rose-700 transition focus:outline-none focus:ring-2 focus:ring-rose-500/40"
        >
          <LogOut className="h-4 w-4" strokeWidth={2.5} />
          Forzar logout
        </button>
      </div>

      {/* ─── Sesiones activas ──────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <Users className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                Sesiones activas
              </h3>
              <p className="text-xs text-[var(--text-tertiary)]">
                {filteredSessions.length} de {sessions.length} en la ventana de 8 horas
              </p>
            </div>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
              aria-hidden
            />
            <input
              ref={searchRef}
              type="search"
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              placeholder="Buscar user, IP, UA…"
              aria-label="Buscar sesiones"
              className="w-full h-9 rounded-lg border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
            />
          </div>
        </header>

        {error ? (
          <div
            role="alert"
            className="m-5 rounded-xl border-2 border-rose-300 bg-rose-50 p-4 flex items-start gap-2 text-rose-700 dark:border-rose-700/40 dark:bg-rose-500/10 dark:text-rose-300"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="text-sm">{error}</span>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
              <Users className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
            </div>
            <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
              {sessions.length === 0
                ? "Sin sesiones activas"
                : "Ninguna sesión coincide"}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              {sessions.length === 0
                ? "No hay logins exitosos sin logout en las últimas 8 horas."
                : "Ajustá la búsqueda."}
            </p>
            {search && (
              <button
                onClick={() => setSearchRaw("")}
                className="mt-3 h-10 px-4 rounded-xl text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10"
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-[var(--rule-soft)]">
              {filteredSessions.map((s) => {
                const dev = deviceFromUA(s.userAgent);
                const DeviceIcon = dev.isMobile ? Smartphone : Monitor;
                return (
                  <li key={s.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-[var(--text-primary)] truncate">
                          {s.user}
                        </span>
                        {s.isCurrent && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                            Tú
                          </span>
                        )}
                      </div>
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">
                        {fmtRelative(s.startedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                      <span className="inline-flex items-center gap-1">
                        <DeviceIcon
                          className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
                          aria-hidden
                        />
                        {dev.label}
                      </span>
                      <span className="font-mono text-[var(--text-tertiary)] truncate">
                        {s.ip ?? "—"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule-soft)] text-left text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
                    <th className="px-5 py-3 font-extrabold">Usuario</th>
                    <th className="px-3 py-3 font-extrabold">Dispositivo</th>
                    <th className="px-3 py-3 font-extrabold">IP</th>
                    <th className="px-3 py-3 font-extrabold">Iniciada</th>
                    <th className="px-5 py-3 font-extrabold text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-soft)]">
                  {filteredSessions.map((s) => {
                    const dev = deviceFromUA(s.userAgent);
                    const DeviceIcon = dev.isMobile ? Smartphone : Monitor;
                    return (
                      <tr
                        key={s.id}
                        className="transition hover:bg-[var(--surface-sunken)]/50"
                      >
                        <td className="px-5 py-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-[var(--text-primary)]">
                              {s.user}
                            </span>
                            {s.isCurrent && (
                              <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
                                Sesión actual
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                            <DeviceIcon
                              className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
                              aria-hidden
                            />
                            {dev.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-[var(--text-tertiary)]">
                          {s.ip ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-[var(--text-secondary)]">
                          {fmtRelative(s.startedAt)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider",
                              s.isCurrent
                                ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                s.isCurrent ? "bg-[var(--accent)]" : "bg-emerald-500",
                              )}
                            />
                            {s.isCurrent ? "Tú" : "Activa"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ─── TOTP coverage + Chart ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* TOTP per user */}
        <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
          <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <Key className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                TOTP 2FA por superadmin
              </h3>
              <p className="text-xs text-[var(--text-tertiary)]">
                Estado del segundo factor de autenticación
              </p>
            </div>
          </header>
          {totpAdmins.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-[var(--text-tertiary)]">
                Sin superadmins registrados
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--rule-soft)]">
              {totpAdmins.map((u) => (
                <li
                  key={u.username}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-[var(--surface-sunken)]/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-lg",
                        u.totpEnabled
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
                      )}
                    >
                      <Key className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-[var(--text-primary)] truncate">
                        {u.username}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {u.lastLoginAt
                          ? `Último login ${fmtRelative(u.lastLoginAt)}`
                          : "Sin logins registrados"}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider",
                      u.totpEnabled
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        u.totpEnabled ? "bg-emerald-500" : "bg-teal-500",
                      )}
                    />
                    {u.totpEnabled ? "Habilitado" : "Pendiente"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Chart */}
        <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
          <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="flex-1">
              <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                Login failures — últimos 7 días
              </h3>
              <p className="text-xs text-[var(--text-tertiary)]">
                {totalFailures} fallidos de {totalFailures + totalSuccess} intentos
                totales
              </p>
            </div>
          </header>
          <LoginFailuresChart series={series} />
        </section>
      </div>

      {/* ─── Política de contraseñas ─────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Lock className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              Política de contraseñas
            </h3>
            <p className="text-xs text-[var(--text-tertiary)]">
              Reglas vigentes aplicadas a todos los usuarios admin
            </p>
          </div>
        </header>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-[var(--rule-soft)]">
          <PolicyField
            icon={Lock}
            label="Longitud mínima"
            value={`${PASSWORD_POLICY.minLength}`}
            unit="caracteres"
          />
          <PolicyField
            icon={Key}
            label="Complejidad"
            value="A·a·1·#"
            unit="May/min/núm/sym"
          />
          <PolicyField
            icon={ShieldCheck}
            label="Expiración"
            value={`${PASSWORD_POLICY.expirationDays}`}
            unit="días"
          />
          <PolicyField
            icon={Lock}
            label="Lockout"
            value={`${PASSWORD_POLICY.lockoutAttempts}→${PASSWORD_POLICY.lockoutMinutes}m`}
            unit="intentos → min bloqueo"
          />
        </div>
      </section>

      {/* ─── Confirm dialog ──────────────────────────────────────── */}
      <AlertDialog.Root open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/65 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-md rounded-3xl bg-[var(--surface-raised)] border border-[var(--rule-soft)] shadow-[var(--shadow-xl)] p-6">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                <AlertTriangle className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="flex-1 min-w-0">
                <AlertDialog.Title className="font-display text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
                  ¿Forzar logout global?
                </AlertDialog.Title>
                <AlertDialog.Description className="text-sm text-[var(--text-secondary)] mt-1.5">
                  Esto invalida <strong>todas las sesiones</strong> de superadmin
                  emitidas hasta ahora, <strong>incluyendo la tuya</strong>. Vas a
                  tener que volver a iniciar sesión inmediatamente.
                </AlertDialog.Description>
                <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                  Usalo ante un incidente sospechoso (cookie filtrado, equipo
                  robado, etc.). La acción queda registrada en el audit log.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <AlertDialog.Cancel asChild>
                <button
                  disabled={revoking}
                  className="h-11 px-4 rounded-xl text-sm font-bold border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] text-[var(--text-primary)] hover:border-[var(--rule-base)] disabled:opacity-50"
                >
                  Cancelar
                </button>
              </AlertDialog.Cancel>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  void handleRevokeAll();
                }}
                disabled={revoking}
                className="inline-flex h-11 items-center gap-2 px-4 rounded-xl text-sm font-extrabold uppercase tracking-wider bg-rose-600 hover:bg-rose-700 text-white shadow-md disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
              >
                {revoking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" strokeWidth={2.5} />
                )}
                Sí, cerrar todas
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

/* ───────────────────────── components ───────────────────────── */

function MiniKpi({
  icon: Icon,
  label,
  value,
  subtitle,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle: string;
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
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </span>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </p>
      </div>
      <p className="mt-2.5 font-display text-2xl font-extrabold tabular-nums tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{subtitle}</p>
    </div>
  );
}

function PolicyField({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="p-5">
      <div className="flex items-center gap-2">
        <Icon
          className="h-3.5 w-3.5 text-[var(--text-tertiary)]"
          strokeWidth={1.75}
          aria-hidden
        />
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </p>
      </div>
      <p className="mt-2 font-display text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      <p className="text-xs text-[var(--text-tertiary)]">{unit}</p>
    </div>
  );
}

function LoginFailuresChart({
  series,
}: {
  series: Array<{ day: string; failed: number; succeeded: number }>;
}) {
  const maxVal = Math.max(...series.map((d) => Math.max(d.failed, d.succeeded)), 1);

  if (series.length === 0) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="text-sm text-[var(--text-tertiary)]">Sin datos en la ventana</p>
      </div>
    );
  }

  return (
    <div className="p-5">
      {/* Bars con eje Y */}
      <div className="flex gap-3">
        <div className="flex flex-col justify-between h-40 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-mono tabular-nums">
          <span>{maxVal}</span>
          <span>{Math.round(maxVal / 2)}</span>
          <span>0</span>
        </div>
        <div className="flex-1 flex items-end gap-2 h-40">
          {series.map((d, i) => {
            const failedH = (d.failed / maxVal) * 100;
            const successH = (d.succeeded / maxVal) * 100;
            return (
              <div
                key={`${d.day}-${i}`}
                className="flex-1 flex flex-col items-center gap-1 group"
              >
                <div className="relative w-full flex-1 flex items-end gap-1">
                  <div
                    className="flex-1 rounded-t-md bg-emerald-500/30 transition-all group-hover:bg-emerald-500/60"
                    style={{ height: `${successH}%` }}
                    title={`${d.succeeded} éxitos`}
                  />
                  <div
                    className={cn(
                      "flex-1 rounded-t-md transition-all",
                      d.failed > 5
                        ? "bg-rose-500 group-hover:brightness-110"
                        : d.failed > 0
                          ? "bg-teal-500 group-hover:brightness-110"
                          : "bg-[var(--surface-sunken)]",
                    )}
                    style={{
                      height: `${Math.max(failedH, d.failed > 0 ? 2 : 0)}%`,
                    }}
                    title={`${d.failed} fallidos`}
                  />
                </div>
                <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                  {d.day}
                </p>
              </div>
            );
          })}
        </div>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[var(--rule-soft)]">
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className="h-3 w-3 rounded bg-emerald-500/30" />
          Éxitos
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className="h-3 w-3 rounded bg-teal-500" />
          Fallidos (≤5)
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className="h-3 w-3 rounded bg-rose-500" />
          Pico (&gt;5)
        </span>
      </div>
    </div>
  );
}
