"use client";

/**
 * VendorHealthDashboard — Salud RENIEC/SUNAT de vendors aprobados.
 *
 * Lee GET /api/superadmin/vendor-health (summary persistido por el cron
 * vendor-identity-recheck) y muestra:
 *   - Health score con ring SVG visual
 *   - 8 KPIs (total, checked, changed, notif/WA/email/grace, errors)
 *   - Lista de alerts con filtros (kind + búsqueda)
 *   - Vendors en gracia con acción "limpiar"
 *   - Trigger manual del cron desde el dashboard
 *   - Auto-refresh 60s opt-in
 *   - Export CSV de alerts
 *
 * Atajos: `/` busca · `R` recarga · `Esc` limpia filtros
 * Audit ref: TD-058 — UI consume del cron diario.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  ExternalLink,
  Clock,
  Calendar,
  Trash2,
  Search,
  Download,
  Loader2,
  Play,
  AlertTriangle,
  HeartPulse,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Types ───────────────────────────────────────────────────────────────────

interface SummaryAlert {
  vendorId: string;
  tenantSlug: string | null;
  kind: "ruc-changed" | "ruc-not-found" | "dni-not-found";
  detail: string;
}

interface SummaryGrace {
  tenantId: string;
  tenantSlug: string | null;
  vendorId: string;
  businessName: string;
  kind: "ruc-changed" | "ruc-not-found" | "dni-not-found";
  until: string;
  graceDays: number;
  reason?: string;
  acknowledgedBy: string;
}

interface VendorHealthResponse {
  stale: boolean;
  neverRun: boolean;
  message?: string;
  ageMinutes?: number;
  healthScore?: number;
  alertsByKind?: Record<string, number>;
  summary: {
    lastRunAt: string;
    total: number;
    checked: number;
    changed: number;
    errors: number;
    notifiedCount?: number;
    waSentCount?: number;
    emailSentCount?: number;
    gracedCount?: number;
    alerts: SummaryAlert[];
    graces?: SummaryGrace[];
  } | null;
}

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; text: string; tone: ToastTone };

const KIND_LABEL: Record<SummaryAlert["kind"], string> = {
  "ruc-changed": "RUC degradado",
  "ruc-not-found": "RUC no encontrado",
  "dni-not-found": "DNI desaparecido",
};

const KIND_DOT: Record<SummaryAlert["kind"], string> = {
  "ruc-changed": "bg-teal-500",
  "ruc-not-found": "bg-rose-500",
  "dni-not-found": "bg-teal-500",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "ahora mismo";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportAlertsCSV(alerts: SummaryAlert[]) {
  const headers = ["VendorId", "TenantSlug", "Kind", "Detail"];
  const rows = alerts.map((a) => [a.vendorId, a.tenantSlug ?? "", a.kind, a.detail]);
  const csv = "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vendor_health_alerts_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Health Ring (SVG) ───────────────────────────────────────────────────────

function HealthRing({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const tone =
    score >= 95
      ? { stroke: "stroke-emerald-500", text: "text-emerald-600 dark:text-emerald-400" }
      : score >= 80
        ? { stroke: "stroke-teal-500", text: "text-teal-600 dark:text-teal-400" }
        : { stroke: "stroke-rose-500", text: "text-rose-600 dark:text-rose-400" };
  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90" aria-hidden>
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="10"
          className="stroke-[var(--rule-soft)]"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(tone.stroke, "transition-all duration-700")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-3xl font-extrabold tabular-nums", tone.text)}>{score}</span>
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          /100
        </span>
      </div>
    </div>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  color = "neutral",
  hint,
}: {
  label: string;
  value: number;
  color?: "neutral" | "success" | "warning" | "error" | "info";
  hint?: string;
}) {
  const tone = {
    neutral: "text-[var(--text-primary)]",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-teal-600 dark:text-teal-400",
    error: "text-rose-600 dark:text-rose-400",
    info: "text-sky-600 dark:text-sky-400",
  }[color];
  return (
    <div
      className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3.5 sm:p-4 hover:shadow-sm transition"
      title={hint}
    >
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className={cn("font-display text-2xl sm:text-3xl font-extrabold tabular-nums mt-1", tone)}>
        {value}
      </p>
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="rounded-2xl bg-[var(--surface-sunken)] h-36" />
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-[var(--surface-sunken)] h-20" />
        ))}
      </div>
      <div className="rounded-2xl bg-[var(--surface-sunken)] h-48" />
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function VendorHealthDashboard() {
  const [data, setData] = useState<VendorHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearingTenant, setClearingTenant] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<SummaryAlert["kind"] | "all">("all");

  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(1);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Toast helper ─────────────────────────────────────────────────────
  const pushToast = useCallback((text: string, tone: ToastTone = "info") => {
    const id = toastId.current++;
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  // ── Fetch summary ────────────────────────────────────────────────────
  const fetchSummary = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/vendor-health", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as VendorHealthResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  // ── Debounce search ──────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw), 200);
    return () => clearTimeout(t);
  }, [searchRaw]);

  // ── Auto refresh ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => fetchSummary(true), 60_000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchSummary]);

  // ── Keyboard ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select";
      if (e.key === "Escape" && !inField) {
        setSearchRaw("");
        setKindFilter("all");
      }
      if (inField) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void fetchSummary();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fetchSummary]);

  // ── Actions ──────────────────────────────────────────────────────────
  const clearGrace = async (tenantId: string, tenantSlug: string | null) => {
    const ok = window.confirm(
      `¿Borrar grace activo de "${tenantSlug ?? tenantId}"?\n\nEl próximo cron volverá a alertar a este vendor.`,
    );
    if (!ok) return;
    setClearingTenant(tenantId);
    try {
      const res = await fetch(
        `/api/superadmin/vendor-grace?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: csrfHeaders({}),
        },
      );
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        pushToast(`Error: ${errJson.error ?? `HTTP ${res.status}`}`, "error");
        return;
      }
      pushToast("Grace limpiado", "success");
      await fetchSummary(true);
    } catch (err) {
      pushToast(`Error: ${err instanceof Error ? err.message : "red"}`, "error");
    } finally {
      setClearingTenant(null);
    }
  };

  const triggerCron = async () => {
    const ok = window.confirm(
      "¿Disparar la re-verificación AHORA?\n\nEsto consume cuota RENIEC/SUNAT (≤200 vendors). Solo cuando hay urgencia o estás validando un cambio.",
    );
    if (!ok) return;
    setTriggering(true);
    try {
      const res = await fetch("/api/superadmin/vendor-health/trigger", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        pushToast(body.error ?? `Error: HTTP ${res.status}`, "error");
        return;
      }
      pushToast("Cron disparado · refrescando en 5s", "success");
      setTimeout(() => fetchSummary(true), 5000);
    } catch (err) {
      pushToast(`Error: ${err instanceof Error ? err.message : "red"}`, "error");
    } finally {
      setTriggering(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────
  const summary = data?.summary ?? null;

  const filteredAlerts = useMemo(() => {
    if (!summary) return [];
    const q = search.trim().toLowerCase();
    return summary.alerts.filter((a) => {
      if (kindFilter !== "all" && a.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        a.vendorId.toLowerCase().includes(q) ||
        (a.tenantSlug?.toLowerCase().includes(q) ?? false) ||
        a.detail.toLowerCase().includes(q) ||
        KIND_LABEL[a.kind].toLowerCase().includes(q)
      );
    });
  }, [summary, search, kindFilter]);

  const filteredGraces = useMemo(() => {
    if (!summary?.graces) return [];
    const q = search.trim().toLowerCase();
    return summary.graces.filter((g) => {
      if (kindFilter !== "all" && g.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        g.businessName.toLowerCase().includes(q) ||
        (g.tenantSlug?.toLowerCase().includes(q) ?? false) ||
        g.acknowledgedBy.toLowerCase().includes(q) ||
        (g.reason?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [summary, search, kindFilter]);

  // ── Render: error ────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div
        role="alert"
        className="rounded-2xl border-2 border-rose-300 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/30 p-5"
      >
        <p className="flex items-center gap-2 text-base font-bold text-rose-700 dark:text-rose-300">
          <AlertTriangle className="h-5 w-5" aria-hidden />
          No se pudo cargar la salud de vendors
        </p>
        <p className="mt-1 text-sm text-rose-600 dark:text-rose-300/80">{error}</p>
        <button
          type="button"
          onClick={() => fetchSummary()}
          className="mt-3 inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Reintentar
        </button>
      </div>
    );
  }

  // ── Render: skeleton ─────────────────────────────────────────────────
  if (loading && !data) return <Skeleton />;

  // ── Render: never run ────────────────────────────────────────────────
  if (data?.neverRun) {
    return (
      <div className="space-y-4">
        <ActionBar
          refreshing={refreshing}
          triggering={triggering}
          autoRefresh={autoRefresh}
          setAutoRefresh={setAutoRefresh}
          onRefresh={() => fetchSummary()}
          onTrigger={triggerCron}
          hideExport
        />
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] p-8 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
            <Clock className="h-7 w-7 text-[var(--text-tertiary)]" aria-hidden />
          </div>
          <p className="text-base font-extrabold text-[var(--text-primary)]">
            Esperando primer run del cron
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-md mx-auto">
            {data?.message ??
              "Próxima corrida: 02:00 UTC diario. Podés dispararlo ahora con el botón “Ejecutar ahora”."}
          </p>
        </div>
        <Toasts toasts={toasts} />
      </div>
    );
  }

  if (!summary) return null;

  const healthScore = data?.healthScore ?? 0;
  const alertsByKind = data?.alertsByKind ?? {};
  const stale = data?.stale ?? false;
  const ageMinutes = data?.ageMinutes ?? 0;

  return (
    <div className="space-y-5">
      <Toasts toasts={toasts} />

      {/* ── Action bar ──────────────────────────────────── */}
      <ActionBar
        refreshing={refreshing}
        triggering={triggering}
        autoRefresh={autoRefresh}
        setAutoRefresh={setAutoRefresh}
        onRefresh={() => fetchSummary()}
        onTrigger={triggerCron}
        onExport={summary.alerts.length > 0 ? () => exportAlertsCSV(summary.alerts) : undefined}
      />

      {/* ── Stale banner ─────────────────────────────────── */}
      {stale && (
        <div
          role="alert"
          className="flex items-start sm:items-center gap-3 rounded-2xl border-2 border-teal-300 bg-teal-50 dark:bg-teal-500/10 dark:border-teal-500/30 px-4 py-3"
        >
          <ShieldAlert
            className="h-5 w-5 text-teal-700 dark:text-teal-300 shrink-0 mt-0.5 sm:mt-0"
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-teal-900 dark:text-teal-100">
              Último run hace {Math.round(ageMinutes / 60)}h — el cron debería correr cada 24h.
            </p>
            <p className="text-xs text-teal-800 dark:text-teal-200 mt-0.5">
              Disparalo manualmente o revisá <code className="font-mono">/api/cron/health</code>.
            </p>
          </div>
        </div>
      )}

      {/* ── Hero score + meta ────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <HealthRing score={healthScore} />
          <div className="flex-1 min-w-0">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
              Health score
            </p>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] mt-0.5">
              {healthScore >= 95
                ? "Todo bajo control"
                : healthScore >= 80
                  ? "Atención requerida"
                  : "Acción urgente"}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {summary.total - summary.alerts.length} de {summary.total} vendors activos sin alertas
              RENIEC/SUNAT.
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-[var(--text-tertiary)]">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                Último run: <strong>{fmtRelative(summary.lastRunAt)}</strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <HeartPulse className="h-3.5 w-3.5" aria-hidden />
                Cron diario · 02:00 UTC
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 sm:gap-3">
        <Kpi label="Total" value={summary.total} hint="Vendors aprobados con tenant" />
        <Kpi label="Verificados" value={summary.checked} color="success" />
        <Kpi
          label="Con cambios"
          value={summary.changed}
          color={summary.changed > 0 ? "warning" : "neutral"}
        />
        <Kpi
          label="Notif. panel"
          value={summary.notifiedCount ?? 0}
          color={(summary.notifiedCount ?? 0) > 0 ? "warning" : "neutral"}
        />
        <Kpi
          label="WhatsApp"
          value={summary.waSentCount ?? 0}
          color={(summary.waSentCount ?? 0) > 0 ? "info" : "neutral"}
        />
        <Kpi
          label="Email"
          value={summary.emailSentCount ?? 0}
          color={(summary.emailSentCount ?? 0) > 0 ? "info" : "neutral"}
        />
        <Kpi
          label="En gracia"
          value={summary.gracedCount ?? 0}
          hint="Vendors con extensión ack self-service"
        />
        <Kpi
          label="Errores"
          value={summary.errors}
          color={summary.errors > 0 ? "error" : "neutral"}
        />
      </div>

      {/* ── Alerts breakdown chips ───────────────────────── */}
      {summary.alerts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mr-1">
            Tipos:
          </p>
          {(Object.keys(KIND_LABEL) as SummaryAlert["kind"][]).map((kind) => {
            const count = alertsByKind[kind] ?? 0;
            if (count === 0) return null;
            const active = kindFilter === kind;
            return (
              <button
                key={kind}
                onClick={() => setKindFilter(active ? "all" : kind)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 h-9 px-3 rounded-full border-2 text-xs font-bold transition",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]"
                    : "border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", KIND_DOT[kind])} aria-hidden />
                {KIND_LABEL[kind]}
                <span className="ml-1 tabular-nums text-[var(--text-tertiary)]">{count}</span>
              </button>
            );
          })}
          {kindFilter !== "all" && (
            <button
              onClick={() => setKindFilter("all")}
              className="text-xs font-bold text-[var(--accent)] hover:underline ml-1"
            >
              Limpiar filtro
            </button>
          )}
        </div>
      )}

      {/* ── Search ─────────────────────────────────────────── */}
      {(summary.alerts.length > 0 || (summary.graces?.length ?? 0) > 0) && (
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none"
            aria-hidden
          />
          <input
            ref={searchRef}
            type="search"
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Buscar en alertas y graces (vendorId, slug, detalle…)"
            aria-label="Buscar alertas"
            className="w-full h-11 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] pl-9 pr-3 text-base sm:text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>
      )}

      {/* ── Empty success ─────────────────────────────────── */}
      {summary.alerts.length === 0 && (summary.graces?.length ?? 0) === 0 && (
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/30 p-5 flex items-start sm:items-center gap-3">
          <ShieldCheck
            className="h-6 w-6 text-emerald-600 dark:text-emerald-300 shrink-0"
            aria-hidden
          />
          <div>
            <p className="text-base font-extrabold text-emerald-900 dark:text-emerald-100">
              Todo limpio
            </p>
            <p className="text-sm text-emerald-800 dark:text-emerald-200/90">
              Todos los vendors aprobados están al día con RENIEC + SUNAT.
            </p>
          </div>
        </div>
      )}

      {/* ── Alerts list ───────────────────────────────────── */}
      {summary.alerts.length > 0 && (
        <section>
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
              Vendors con alertas ({filteredAlerts.length} / {summary.alerts.length})
            </p>
          </div>
          {filteredAlerts.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] p-6 text-center text-sm text-[var(--text-tertiary)]">
              Ningún resultado para los filtros activos.
            </div>
          ) : (
            <ul className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] divide-y divide-[var(--rule-soft)] overflow-hidden">
              {filteredAlerts.map((a) => (
                <li
                  key={a.vendorId + a.kind}
                  className="flex items-start gap-3 p-3 sm:p-3.5 hover:bg-[var(--surface-sunken)]/50 transition-colors"
                >
                  <span
                    className={cn("h-2.5 w-2.5 rounded-full mt-2 shrink-0", KIND_DOT[a.kind])}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-extrabold text-[var(--text-primary)]">
                        {KIND_LABEL[a.kind]}
                      </p>
                      {a.tenantSlug && (
                        <a
                          href={`/superadmin/tenants?slug=${a.tenantSlug}`}
                          className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden />
                          {a.tenantSlug}
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 break-words">
                      {a.detail}
                    </p>
                    <p className="text-[length:var(--ts-2xs)] font-mono text-[var(--text-tertiary)] mt-1 truncate">
                      vendor: {a.vendorId}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Graces list ───────────────────────────────────── */}
      {(summary.graces?.length ?? 0) > 0 && (
        <section>
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
            Vendors en período de gracia ({filteredGraces.length} / {summary.graces?.length})
          </p>
          {filteredGraces.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] p-6 text-center text-sm text-[var(--text-tertiary)]">
              Ningún grace coincide con los filtros.
            </div>
          ) : (
            <ul className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] divide-y divide-[var(--rule-soft)] overflow-hidden">
              {filteredGraces.map((g) => {
                const untilDate = new Date(g.until);
                const daysLeft = Math.max(
                  0,
                  Math.ceil((untilDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
                );
                const urgent = daysLeft <= 2;
                return (
                  <li
                    key={g.tenantId + g.vendorId}
                    data-testid="grace-row"
                    className="p-3 sm:p-3.5 hover:bg-[var(--surface-sunken)]/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "inline-flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
                          urgent
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                            : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
                        )}
                      >
                        <Calendar className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                          {g.businessName}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {KIND_LABEL[g.kind]} ·{" "}
                          <span
                            className={cn(
                              "font-bold",
                              urgent
                                ? "text-rose-700 dark:text-rose-300"
                                : "text-[var(--text-primary)]",
                            )}
                          >
                            vence en {daysLeft}d
                          </span>{" "}
                          (
                          {untilDate.toLocaleDateString("es-PE", {
                            day: "numeric",
                            month: "short",
                          })}
                          )
                        </p>
                        {g.reason && (
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] italic mt-1 break-words">
                            &ldquo;{g.reason}&rdquo;
                          </p>
                        )}
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1">
                          Reconocido por <span className="font-bold">{g.acknowledgedBy}</span>
                          {g.tenantSlug && (
                            <>
                              {" · "}
                              <a
                                href={`/superadmin/tenants?slug=${g.tenantSlug}`}
                                className="font-bold text-[var(--accent)] hover:underline"
                              >
                                {g.tenantSlug}
                              </a>
                            </>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => clearGrace(g.tenantId, g.tenantSlug)}
                        disabled={clearingTenant === g.tenantId}
                        aria-label={`Limpiar grace de ${g.businessName}`}
                        className="inline-flex h-11 px-3 items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-500/15 disabled:opacity-50 transition-colors shrink-0"
                      >
                        {clearingTenant === g.tenantId ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-4 w-4" aria-hidden />
                        )}
                        <span className="hidden sm:inline">Limpiar</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ── Footer ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] pt-2 border-t border-[var(--rule-soft)]">
        <p>
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
          limpiar filtros
        </p>
        <p>Último run: {new Date(summary.lastRunAt).toLocaleString("es-PE")}</p>
      </div>
    </div>
  );
}

// ── Action bar ──────────────────────────────────────────────────────────────

function ActionBar({
  refreshing,
  triggering,
  autoRefresh,
  setAutoRefresh,
  onRefresh,
  onTrigger,
  onExport,
  hideExport,
}: {
  refreshing: boolean;
  triggering: boolean;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  onRefresh: () => void;
  onTrigger: () => void;
  onExport?: () => void;
  hideExport?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        title="Recargar (R)"
        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition disabled:opacity-50"
      >
        <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
        Recargar
      </button>
      <button
        type="button"
        onClick={onTrigger}
        disabled={triggering}
        title="Ejecutar el cron de re-verificación ahora"
        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 text-sm font-extrabold text-white hover:opacity-90 transition disabled:opacity-50"
      >
        {triggering ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Play className="h-4 w-4 fill-current" aria-hidden />
        )}
        Ejecutar ahora
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
      {!hideExport && onExport && (
        <button
          type="button"
          onClick={onExport}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition"
        >
          <Download className="h-4 w-4" aria-hidden />
          CSV
        </button>
      )}
    </div>
  );
}

// ── Toasts ─────────────────────────────────────────────────────────────────

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
