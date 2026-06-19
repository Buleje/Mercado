"use client";

/**
 * OverviewTab — Vista consolidada del Security Center.
 *
 * Hero KPIs (4) + Health Score ring + Login trend sparkline +
 * Eventos recientes con filtro + Postura + IPs sospechosas +
 * Lista de admins (TOTP enrolment).
 *
 * Mejoras 2026-05-24:
 *  - Time range selector (24h / 7d / 30d)
 *  - Mini sparkline derivado de loginSeries
 *  - Auto-refresh 60s opt-in (con indicador)
 *  - Search debounced sobre eventos
 *  - Toast inline (reemplaza alert/banner-only)
 *  - Skeleton loading
 *  - Keyboard: / busca · R recarga · Esc limpia
 *  - Export CSV de eventos
 *  - Health score visual SVG ring (consistente con vendor-health)
 *  - Lista de admins TOTP — destaca quién falta enrolar
 *  - Tonos rose semánticos correctos (NO var(--accent))
 *  - Tap targets ≥44px
 *
 * Datos REALES:
 *  - GET /api/superadmin/security/posture
 *  - GET /api/superadmin/security?days=N
 */

import { useVisiblePolling } from "@/components/superadmin/_shared/useVisiblePolling";
import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Ban,
  Users,
  Globe,
  Lock,
  Shield,
  AlertTriangle,
  Info,
  TrendingUp,
  CheckCircle2,
  Search,
  RefreshCw,
  Download,
  Clock,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────

interface PostureResponse {
  data: {
    vulnerabilities: { count: number; connected: boolean; scannerName: string | null };
    loginsFailed24h: number;
    ipsBlocked: number;
    activeSessions: number;
    totpCoverage: {
      enrolled: number;
      total: number;
      admins: Array<{ username: string; totpEnabled: boolean; lastLoginAt: string | null }>;
    };
    loginSeries7d: Array<{ day: string; failed: number; succeeded: number; iso: string }>;
    generatedAt: string;
  };
}

interface SecurityEvent {
  id: string;
  action: string;
  detail: string;
  ipAddress: string | null;
  createdAt: string;
}

interface SecurityEventsResponse {
  data: {
    events: SecurityEvent[];
    summary: Record<string, number>;
    uniqueIPs: number;
    suspiciousIPs: Array<{ ip: string; failedAttempts: number }>;
  };
}

type Severity = "critical" | "high" | "medium" | "low" | "info";
type TimeRange = "24h" | "7d" | "30d";
type ToastTone = "success" | "error" | "info";
type Toast = { id: number; text: string; tone: ToastTone };

const SEVERITY_META: Record<
  Severity,
  { icon: LucideIcon; label: string; cls: string; dot: string }
> = {
  critical: {
    icon: ShieldAlert,
    label: "Crítica",
    cls: "border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  high: {
    icon: ShieldAlert,
    label: "Alta",
    cls: "border-rose-300/60 bg-rose-50 text-rose-700 dark:border-rose-700/40 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  medium: {
    icon: AlertTriangle,
    label: "Media",
    cls: "border-teal-300/60 bg-teal-50 text-teal-700 dark:border-teal-700/40 dark:bg-teal-500/15 dark:text-teal-300",
    dot: "bg-teal-500",
  },
  low: {
    icon: Info,
    label: "Baja",
    cls: "border-sky-300/60 bg-sky-50 text-sky-700 dark:border-sky-700/40 dark:bg-sky-500/15 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  info: {
    icon: Shield,
    label: "Info",
    cls: "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
    dot: "bg-[var(--text-tertiary)]",
  },
};

const ACTION_META: Record<string, { severity: Severity; title: string }> = {
  login_success: { severity: "info", title: "Login exitoso" },
  login_failed: { severity: "medium", title: "Login fallido" },
  login_locked: { severity: "high", title: "IP bloqueada por lockout" },
  login_honeypot: { severity: "high", title: "Bot detectado (honeypot)" },
  "2fa_failed": { severity: "high", title: "2FA fallido" },
  "2fa_challenge": { severity: "info", title: "Desafío 2FA emitido" },
  logout: { severity: "info", title: "Logout" },
  sessions_revoked_all: { severity: "high", title: "Force logout global" },
};

const RANGE_DAYS: Record<TimeRange, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
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

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportEventsCSV(events: SecurityEvent[]) {
  const headers = ["ID", "Action", "Detail", "IP", "CreatedAt"];
  const data = events.map((e) => [e.id, e.action, e.detail, e.ipAddress ?? "", e.createdAt]);
  const csv =
    "﻿" +
    [headers, ...data].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `security_events_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Health score 0-100 derivado de varios factores defensivos. */
function computeHealth(p: PostureResponse["data"]): number {
  let score = 100;
  if (p.vulnerabilities.count > 0) score -= Math.min(p.vulnerabilities.count * 5, 30);
  if (p.loginsFailed24h > 10) score -= Math.min((p.loginsFailed24h - 10) * 2, 20);
  if (p.ipsBlocked > 0) score -= Math.min(p.ipsBlocked * 3, 15);
  const totpPct =
    p.totpCoverage.total === 0
      ? 100
      : (p.totpCoverage.enrolled / p.totpCoverage.total) * 100;
  if (totpPct < 100) score -= Math.round((100 - totpPct) * 0.35);
  return Math.max(0, Math.min(100, score));
}

// ─── Health Ring (SVG) ───────────────────────────────────────────────────

function HealthRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const tone =
    score >= 90
      ? { stroke: "stroke-emerald-500", text: "text-emerald-600 dark:text-emerald-400" }
      : score >= 70
        ? { stroke: "stroke-teal-500", text: "text-teal-600 dark:text-teal-400" }
        : { stroke: "stroke-rose-500", text: "text-rose-600 dark:text-rose-400" };
  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90" aria-hidden>
        <circle cx="44" cy="44" r={radius} fill="none" strokeWidth="8"
          className="stroke-[var(--rule-soft)]" />
        <circle cx="44" cy="44" r={radius} fill="none" strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className={cn(tone.stroke, "transition-all duration-700")} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-xl font-extrabold tabular-nums", tone.text)}>{score}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          /100
        </span>
      </div>
    </div>
  );
}

// ─── Sparkline (login series) ────────────────────────────────────────────

function LoginSparkline({
  series,
}: {
  series: Array<{ day: string; failed: number; succeeded: number }>;
}) {
  if (series.length === 0) {
    return (
      <p className="text-xs text-[var(--text-tertiary)] py-4 text-center">
        Sin datos de login en la ventana
      </p>
    );
  }
  const max = Math.max(1, ...series.flatMap((s) => [s.failed, s.succeeded]));
  const w = 100;
  const h = 40;
  const stepX = w / Math.max(1, series.length - 1);
  const yFor = (v: number) => h - (v / max) * h;
  const path = (key: "failed" | "succeeded") =>
    series.map((s, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${yFor(s[key]).toFixed(1)}`).join(" ");
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-12">
        <path d={path("succeeded")} fill="none" className="stroke-emerald-500" strokeWidth="1.5" />
        <path d={path("failed")} fill="none" className="stroke-rose-500" strokeWidth="1.5" />
      </svg>
      <div className="mt-1 flex items-center justify-between text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Exitosos
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          Fallidos
        </span>
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-[var(--surface-sunken)] h-32" />
        ))}
      </div>
      <div className="rounded-2xl bg-[var(--surface-sunken)] h-32" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-2xl bg-[var(--surface-sunken)] h-96" />
        <div className="rounded-2xl bg-[var(--surface-sunken)] h-96" />
      </div>
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

export function OverviewTab() {
  const [posture, setPosture] = useState<PostureResponse["data"] | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [suspiciousIPs, setSuspiciousIPs] = useState<
    SecurityEventsResponse["data"]["suspiciousIPs"]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
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
      const days = RANGE_DAYS[timeRange];
      try {
        const [pRes, eRes] = await Promise.all([
          fetch("/api/superadmin/security/posture", {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/superadmin/security?days=${days}`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);
        if (!pRes.ok || !eRes.ok) throw new Error(`HTTP ${pRes.status}/${eRes.status}`);
        const pData = (await pRes.json()) as PostureResponse;
        const eData = (await eRes.json()) as SecurityEventsResponse;
        setPosture(pData.data);
        setEvents(eData.data.events.slice(0, 50));
        setSuspiciousIPs(eData.data.suspiciousIPs ?? []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al cargar";
        setError(msg);
        if (silent) pushToast(`Refresh fallido: ${msg}`, "error");
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [timeRange, pushToast],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  // Auto-refresh 60s
  useVisiblePolling(() => void reload(true), 60_000, autoRefresh);

  // Custom event para botón "Actualizar" del Hero
  useEffect(() => {
    const handler = () => void reload();
    window.addEventListener("security-overview-refresh", handler);
    return () => window.removeEventListener("security-overview-refresh", handler);
  }, [reload]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select";
      if (e.key === "Escape" && !inField) {
        setSearchRaw("");
        setSeverityFilter("all");
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
  }, [reload]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((ev) => {
      const sev = ACTION_META[ev.action]?.severity ?? "info";
      if (severityFilter !== "all" && sev !== severityFilter) return false;
      if (!q) return true;
      return (
        ev.action.toLowerCase().includes(q) ||
        ev.detail.toLowerCase().includes(q) ||
        (ev.ipAddress?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [events, search, severityFilter]);

  if (loading && !posture) return <Skeleton />;

  if (error && !posture) {
    return (
      <div
        role="alert"
        className="rounded-2xl border-2 border-rose-300 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/30 p-5"
      >
        <div className="flex items-start gap-3 text-rose-700 dark:text-rose-300">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-display text-base font-extrabold">
              No se pudo cargar el panel
            </p>
            <p className="text-sm opacity-80 mt-0.5">{error}</p>
            <button
              onClick={() => reload()}
              className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-3.5 text-sm font-bold transition"
            >
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!posture) return null;

  const totpPct =
    posture.totpCoverage.total === 0
      ? 0
      : Math.round((posture.totpCoverage.enrolled / posture.totpCoverage.total) * 100);
  const healthScore = computeHealth(posture);
  const missingTotp = posture.totpCoverage.admins.filter((a) => !a.totpEnabled);

  return (
    <div className="space-y-6">
      <Toasts toasts={toasts} />

      {/* ─── Action bar ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] overflow-hidden">
          {(["24h", "7d", "30d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              aria-pressed={timeRange === r}
              className={cn(
                "px-3 text-sm font-bold transition",
                timeRange === r
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <button
          onClick={() => reload()}
          disabled={refreshing}
          title="Recargar (R)"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
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
          onClick={() => exportEventsCSV(filteredEvents)}
          disabled={filteredEvents.length === 0}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden />
          CSV ({filteredEvents.length})
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

      {/* ─── Health Score + Login Trend ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 flex items-center gap-4">
          <HealthRing score={healthScore} />
          <div className="min-w-0">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
              Health score
            </p>
            <h3 className="font-display text-lg font-extrabold text-[var(--text-primary)] mt-0.5">
              {healthScore >= 90
                ? "Postura sólida"
                : healthScore >= 70
                  ? "Atención requerida"
                  : "Acción urgente"}
            </h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              Vulns · logins · TOTP · IPs
            </p>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
              Logins últimos 7 días
            </h3>
            <span className="text-xs font-bold text-[var(--text-tertiary)]">
              {posture.loginSeries7d.reduce((a, s) => a + s.succeeded, 0)} ok ·{" "}
              {posture.loginSeries7d.reduce((a, s) => a + s.failed, 0)} fallidos
            </span>
          </div>
          <LoginSparkline series={posture.loginSeries7d} />
        </div>
      </div>

      {/* ─── KPIs Hero (4 cards) ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={ShieldAlert}
          label="Vulnerabilidades"
          value={posture.vulnerabilities.connected ? String(posture.vulnerabilities.count) : "—"}
          subtitle={
            posture.vulnerabilities.connected
              ? `Escáner: ${posture.vulnerabilities.scannerName}`
              : "Sin escáner conectado"
          }
          tone={posture.vulnerabilities.count > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          icon={Lock}
          label="Login fallidos 24h"
          value={String(posture.loginsFailed24h)}
          subtitle="Ventana últimas 24 horas"
          tone={posture.loginsFailed24h > 10 ? "warning" : "neutral"}
        />
        <KpiCard
          icon={Ban}
          label="IPs bloqueadas"
          value={String(posture.ipsBlocked)}
          subtitle="≥5 fails en 24h"
          tone={posture.ipsBlocked > 0 ? "danger" : "neutral"}
        />
        <KpiCard
          icon={Users}
          label="Sesiones activas"
          value={String(posture.activeSessions)}
          subtitle="Estimadas vía audit log"
          tone="success"
        />
      </div>

      {/* ─── Eventos + Postura ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Eventos (col 2) */}
        <section className="lg:col-span-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                <Shield className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                  Eventos recientes
                </h3>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {filteredEvents.length} de {events.length} en {timeRange}
                </p>
              </div>
            </div>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as Severity | "all")}
              aria-label="Filtrar por severidad"
              className="h-9 rounded-lg border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="all">Todas las severidades</option>
              <option value="critical">Críticas</option>
              <option value="high">Altas</option>
              <option value="medium">Medias</option>
              <option value="low">Bajas</option>
              <option value="info">Info</option>
            </select>
          </header>

          {/* Search row */}
          <div className="relative border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-2.5">
            <Search
              className="absolute left-7 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
              aria-hidden
            />
            <input
              ref={searchRef}
              type="search"
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              placeholder="Buscar action, detalle, IP…"
              aria-label="Buscar eventos"
              className="w-full h-9 rounded-lg border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          {filteredEvents.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
                <Shield className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
              </div>
              <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
                Sin eventos en la ventana
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                No hubo actividad que coincida con el filtro.
              </p>
              {(search || severityFilter !== "all") && (
                <button
                  onClick={() => {
                    setSearchRaw("");
                    setSeverityFilter("all");
                  }}
                  className="mt-3 h-10 px-4 rounded-xl text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-[var(--rule-soft)] max-h-[480px] overflow-y-auto">
              {filteredEvents.map((ev) => {
                const meta = ACTION_META[ev.action] ?? { severity: "info" as Severity, title: ev.action };
                const sev = SEVERITY_META[meta.severity];
                const Icon = sev.icon;
                return (
                  <li
                    key={ev.id}
                    className="group flex items-start gap-3 px-5 py-3 transition hover:bg-[var(--surface-sunken)]/50"
                  >
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border shrink-0 ${sev.cls}`}>
                      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-sm text-[var(--text-primary)]">
                          {meta.title}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${sev.cls}`}
                        >
                          <span className={`h-1 w-1 rounded-full ${sev.dot}`} />
                          {sev.label}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        {ev.detail}
                      </p>
                      {ev.ipAddress && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-1.5 py-0.5 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                          <Globe className="h-2.5 w-2.5" aria-hidden />
                          {ev.ipAddress}
                        </span>
                      )}
                    </div>
                    <time className="shrink-0 whitespace-nowrap text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      {fmtRelative(ev.createdAt)}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Postura (col 1) */}
        <aside className="space-y-4">
          {/* TOTP Coverage */}
          <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                  <ShieldCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <h4 className="font-display text-sm font-extrabold text-[var(--text-primary)]">
                    Cobertura TOTP 2FA
                  </h4>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    Superadmins con 2FA habilitado
                  </p>
                </div>
              </div>
              <span className="font-display text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
                {totpPct}%
              </span>
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  totpPct === 100 ? "bg-emerald-500" : totpPct >= 50 ? "bg-teal-500" : "bg-rose-500",
                )}
                style={{ width: `${totpPct}%` }}
                aria-hidden
              />
            </div>
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              {posture.totpCoverage.enrolled} de {posture.totpCoverage.total} enrolados
            </p>
            {missingTotp.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--rule-soft)]">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-teal-700 dark:text-teal-300 mb-1.5">
                  Falta enrolar
                </p>
                <ul className="space-y-1">
                  {missingTotp.map((a) => (
                    <li
                      key={a.username}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-bold text-[var(--text-primary)] truncate">
                        {a.username}
                      </span>
                      <span className="text-[var(--text-tertiary)] shrink-0 inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {a.lastLoginAt ? fmtRelative(a.lastLoginAt) : "nunca"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Checks postura */}
          <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
            <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
                <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <h4 className="font-display text-sm font-extrabold text-[var(--text-primary)]">
                Checks de postura
              </h4>
            </header>
            <ul className="divide-y divide-[var(--rule-soft)]">
              <PostureCheck
                icon={Lock}
                label="Lockout automático"
                status="ok"
                detail="5 intentos → 15 min bloqueo"
              />
              <PostureCheck
                icon={Shield}
                label="Auditoría activa"
                status="ok"
                detail="Registro continuo de acciones"
              />
              <PostureCheck
                icon={ShieldCheck}
                label="TOTP enrolado"
                status={totpPct === 100 ? "ok" : "warning"}
                detail={`${totpPct}% cobertura`}
              />
              <PostureCheck
                icon={Globe}
                label="CSRF estricto"
                status="ok"
                detail="Endpoints destructivos protegidos"
              />
            </ul>
          </div>
        </aside>
      </div>

      {/* ─── IPs sospechosas ────────────────────────────────── */}
      {suspiciousIPs.length > 0 && (
        <section className="rounded-2xl border-2 border-teal-300/60 bg-teal-50/30 overflow-hidden dark:border-teal-700/40 dark:bg-teal-950/20">
          <header className="flex items-center gap-3 border-b border-teal-200/60 dark:border-teal-700/40 px-5 py-3.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <h3 className="font-display text-base font-extrabold tracking-tight text-teal-800 dark:text-teal-200">
                IPs sospechosas detectadas
              </h3>
              <p className="text-xs text-teal-700/80 dark:text-teal-400/80">
                {suspiciousIPs.length} IP{suspiciousIPs.length === 1 ? "" : "s"} con ≥3 intentos
                fallidos en los últimos {timeRange}
              </p>
            </div>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-4">
            {suspiciousIPs.slice(0, 12).map((sip) => (
              <div
                key={sip.ip}
                className="flex items-center justify-between gap-3 rounded-xl border border-teal-300/40 bg-[var(--surface-raised)] px-3 py-2 dark:border-teal-700/30"
              >
                <span className="font-mono text-xs font-bold text-[var(--text-primary)] truncate">
                  {sip.ip}
                </span>
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold tabular-nums text-teal-800 dark:bg-teal-900/50 dark:text-teal-300">
                  <TrendingUp className="h-2.5 w-2.5" />
                  {sip.failedAttempts} fails
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Generated at */}
      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-right">
        Generado: {new Date(posture.generatedAt).toLocaleString("es-PE")}
      </p>
    </div>
  );
}

/* ───────────────────────── components ───────────────────────── */

function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  subtitle: string;
  tone: "neutral" | "warning" | "danger" | "success";
}) {
  const iconBg =
    tone === "warning"
      ? "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
      : tone === "danger"
        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
        : tone === "success"
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "bg-[var(--accent)]/10 text-[var(--accent)]";
  const valueTone =
    tone === "warning"
      ? "text-teal-700 dark:text-teal-300"
      : tone === "danger"
        ? "text-rose-700 dark:text-rose-300"
        : "text-[var(--text-primary)]";
  return (
    <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
      </div>
      <p className="mt-4 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className={`mt-1 font-display text-3xl font-extrabold tabular-nums tracking-tight ${valueTone}`}>
        {value}
      </p>
      <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">{subtitle}</p>
    </div>
  );
}

function PostureCheck({
  icon: Icon,
  label,
  status,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  status: "ok" | "warning" | "error";
  detail: string;
}) {
  const meta = {
    ok: {
      cls: "text-emerald-700 dark:text-emerald-300",
      dot: "bg-emerald-500",
      txt: "Activo",
    },
    warning: {
      cls: "text-teal-700 dark:text-teal-300",
      dot: "bg-teal-500",
      txt: "Revisar",
    },
    error: {
      cls: "text-rose-700 dark:text-rose-300",
      dot: "bg-rose-500",
      txt: "Inactivo",
    },
  }[status];
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <Icon
          className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]"
          strokeWidth={1.75}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text-primary)]">{label}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{detail}</p>
        </div>
      </div>
      <span className={`inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${meta.cls}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        {meta.txt}
      </span>
    </li>
  );
}
