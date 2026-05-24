"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  HeartPulse,
  Database,
  Globe,
  Server,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Wifi,
  HardDrive,
  Activity,
  Timer,
  Download,
} from "@buleje/design-system/icons";
import SAHealthScore from "@/components/superadmin/_shared/SAHealthScore";
import { AdminTabShell } from "../_components/_shared";

const TenantMonitorPanel = dynamic(
  () => import("@/components/superadmin/TenantMonitorPanel"),
  { ssr: false },
);

// ── Types ─────────────────────────────────────────────────────────────────

interface HealthCheck {
  name: string;
  status: "ok" | "degraded" | "error" | "checking";
  latency: number;
  detail?: string;
  icon: React.ReactNode;
}

interface HealthData {
  status: string;
  timestamp: string;
  uptime: number;
  responseTimeMs: number;
  checks: {
    database: {
      status: string;
      latencyMs: number;
      circuitBreaker?: string;
    };
  };
}

interface AdminHealthMetric {
  label: string;
  value: string | number;
  unit?: string;
  status: "ok" | "warning" | "critical";
}

interface AdminHealthData {
  services: Array<{ name: string; status: string; latencyMs: number; detail?: string }>;
  metrics: AdminHealthMetric[];
  incidents: Array<{ id: string; severity: string; message: string; since: string }>;
}

// ── Status helpers ────────────────────────────────────────────────────────

const STATUS_META: Record<
  HealthCheck["status"],
  { label: string; cls: string; dot: string }
> = {
  ok: {
    label: "Operativo",
    cls: "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 text-[var(--data-success-500)]",
    dot: "bg-[var(--data-success-500)]",
  },
  degraded: {
    label: "Degradado",
    cls: "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  error: {
    label: "Error",
    cls: "border-rose-300/60 bg-rose-50/60 text-[var(--accent)] dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-[var(--accent)]",
    dot: "bg-rose-500",
  },
  checking: {
    label: "Verificando…",
    cls: "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)]",
    dot: "bg-[var(--text-tertiary)] animate-pulse",
  },
};

function StatusBadge({ status }: { status: HealthCheck["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider ${meta.cls}`}
    >
      <span className={`h-1 w-1 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const AUTO_REFRESH_SECONDS = 30;

// ── Main page ─────────────────────────────────────────────────────────────

export default function SystemHealthPage() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [overallStatus, setOverallStatus] = useState<HealthCheck["status"]>("checking");
  const [uptime, setUptime] = useState(0);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [adminMetrics, setAdminMetrics] = useState<AdminHealthMetric[]>([]);
  const [incidents, setIncidents] = useState<AdminHealthData["incidents"]>([]);
  const [healthScore, setHealthScore] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS);
  const [activeTab, setActiveTab] = useState<"system" | "tenants">("system");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runChecks = useCallback(async () => {
    setLoading(true);
    const results: HealthCheck[] = [];
    let score = 100;

    // 1. API Health endpoint
    try {
      const start = Date.now();
      const res = await fetch("/api/health");
      const latency = Date.now() - start;
      const data: HealthData = res.ok ? await res.json() : ({} as HealthData);

      results.push({
        name: "API Server",
        status: res.ok ? "ok" : "degraded",
        latency,
        detail: `Tiempo de respuesta: ${data.responseTimeMs ?? latency}ms`,
        icon: <Server className="w-4 h-4" strokeWidth={1.75} aria-hidden />,
      });

      const dbStatus: HealthCheck["status"] = data.checks?.database?.status === "ok" ? "ok" : "error";
      results.push({
        name: "Base de datos",
        status: dbStatus,
        latency: data.checks?.database?.latencyMs ?? 0,
        detail: data.checks?.database?.circuitBreaker
          ? `Circuit breaker: ${data.checks.database.circuitBreaker}`
          : `Latencia: ${data.checks?.database?.latencyMs ?? "?"}ms`,
        icon: <Database className="w-4 h-4" strokeWidth={1.75} aria-hidden />,
      });

      if (!res.ok) score -= 30;
      if (dbStatus === "error") score -= 40;
      setUptime(data.uptime ?? 0);
    } catch {
      results.push({
        name: "API Server",
        status: "error",
        latency: 0,
        detail: "No se pudo conectar",
        icon: <Server className="w-4 h-4" strokeWidth={1.75} aria-hidden />,
      });
      results.push({
        name: "Base de datos",
        status: "error",
        latency: 0,
        detail: "No verificable",
        icon: <Database className="w-4 h-4" strokeWidth={1.75} aria-hidden />,
      });
      score -= 70;
    }

    // 2. Auth endpoint
    try {
      const start = Date.now();
      const res = await fetch("/api/superadmin/auth");
      const latency = Date.now() - start;
      results.push({
        name: "Autenticación",
        status: res.status === 401 || res.ok ? "ok" : "error",
        latency,
        detail: res.ok ? "Sesión activa" : "Sin sesión (respuesta correcta)",
        icon: <Wifi className="w-4 h-4" strokeWidth={1.75} aria-hidden />,
      });
      if (!res.ok && res.status !== 401) score -= 10;
    } catch {
      results.push({
        name: "Autenticación",
        status: "error",
        latency: 0,
        detail: "No se pudo verificar",
        icon: <Wifi className="w-4 h-4" strokeWidth={1.75} aria-hidden />,
      });
      score -= 10;
    }

    // 3. Static assets
    try {
      const start = Date.now();
      const res = await fetch("/icon?health-check", { method: "HEAD" });
      const latency = Date.now() - start;
      results.push({
        name: "Archivos estáticos",
        status: res.ok ? "ok" : "degraded",
        latency,
        detail: res.ok ? "Edge assets accesibles" : "Bucket inaccesible",
        icon: <HardDrive className="w-4 h-4" strokeWidth={1.75} aria-hidden />,
      });
      if (!res.ok) score -= 5;
    } catch {
      results.push({
        name: "Archivos estáticos",
        status: "error",
        latency: 0,
        detail: "No se pudo verificar",
        icon: <HardDrive className="w-4 h-4" strokeWidth={1.75} aria-hidden />,
      });
      score -= 5;
    }

    // 4. Products API
    try {
      const start = Date.now();
      const res = await fetch("/api/products?limit=1&active=true");
      const latency = Date.now() - start;
      results.push({
        name: "API Productos",
        status: res.ok ? "ok" : "degraded",
        latency,
        detail: res.ok ? "Catálogo accesible" : `Status: ${res.status}`,
        icon: <Globe className="w-4 h-4" strokeWidth={1.75} aria-hidden />,
      });
      if (!res.ok) score -= 15;
    } catch {
      results.push({
        name: "API Productos",
        status: "error",
        latency: 0,
        detail: "No se pudo conectar",
        icon: <Globe className="w-4 h-4" strokeWidth={1.75} aria-hidden />,
      });
      score -= 15;
    }

    // 5. Fetch admin health metrics (latency, orders/hour, cache)
    try {
      const res = await fetch("/api/admin/health");
      if (res.ok) {
        const adminData: AdminHealthData = await res.json();
        setAdminMetrics(adminData.metrics ?? []);
        setIncidents(adminData.incidents ?? []);
        if (adminData.incidents?.length > 0) score -= 10 * adminData.incidents.length;
      }
    } catch {
      // Non-critical
    }

    setChecks(results);
    setLastChecked(new Date());
    setLoading(false);
    setHealthScore(Math.max(0, Math.min(100, score)));

    if (results.some((c) => c.status === "error")) setOverallStatus("error");
    else if (results.some((c) => c.status === "degraded")) setOverallStatus("degraded");
    else setOverallStatus("ok");
  }, []);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  // Keyboard: "R" re-verifica (sin foco en campos)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const inField =
        el?.tagName === "INPUT" ||
        el?.tagName === "TEXTAREA" ||
        el?.tagName === "SELECT" ||
        el?.isContentEditable;
      if (!inField && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        runChecks();
        setCountdown(AUTO_REFRESH_SECONDS);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runChecks]);

  // CSV export de checks de sistema + servicios (RFC 4180 + BOM)
  const exportCsv = useCallback(() => {
    const esc = (c: string | number) => `"${String(c).replace(/"/g, '""')}"`;
    const headers = ["Check", "Estado", "Latencia (ms)", "Detalle"];
    const rows = checks.map((c) => [c.name, c.status, c.latency ?? "", c.detail ?? ""]);
    const csv =
      "﻿" +
      [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `health-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [checks]);

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    setCountdown(AUTO_REFRESH_SECONDS);
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          runChecks();
          return AUTO_REFRESH_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, runChecks]);

  const overallMeta = {
    ok: {
      icon: CheckCircle2,
      label: "Todos los sistemas operativos",
      bg: "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5",
      iconCls: "text-[var(--data-success-500)]",
    },
    degraded: {
      icon: AlertTriangle,
      label: "Algunos servicios degradados",
      bg: "border-amber-300/60 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/20",
      iconCls: "text-amber-600 dark:text-amber-400",
    },
    error: {
      icon: XCircle,
      label: "Problemas detectados",
      bg: "border-rose-300/60 bg-rose-50/40 dark:border-rose-700/40 dark:bg-rose-950/20",
      iconCls: "text-rose-600 dark:text-rose-400",
    },
    checking: {
      icon: RefreshCw,
      label: "Verificando sistemas…",
      bg: "border-[var(--rule-base)] bg-[var(--surface-canvas)]",
      iconCls: "text-[var(--text-tertiary)] animate-spin",
    },
  }[overallStatus];

  const OverallIcon = overallMeta.icon;

  return (
    <AdminTabShell
      title="Salud del sistema"
      description="Estado en tiempo real de servicios, latencia y métricas operativas. Auto-refresh cada 30 segundos."
      icon={HeartPulse}
      kicker="Plataforma · Observabilidad"
      stats={
        <>
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 min-w-[88px]">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
              Score
            </p>
            <p
              className={`font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none ${
                healthScore >= 80
                  ? "text-[var(--data-success-500)]"
                  : healthScore >= 50
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-[var(--accent)] dark:text-[var(--accent)]"
              }`}
            >
              {healthScore}
            </p>
          </div>
          {uptime > 0 && (
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 min-w-[88px]">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
                Uptime
              </p>
              <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none text-[var(--text-primary)]">
                {formatUptime(uptime)}
              </p>
            </div>
          )}
        </>
      }
    >
      {/* ─── Overall status banner ──────────────────────────────── */}
      <section
        className={`flex flex-col sm:flex-row items-start sm:items-center gap-5 rounded-2xl border-2 p-5 ${overallMeta.bg}`}
      >
        <SAHealthScore score={healthScore} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <OverallIcon
              className={`h-6 w-6 ${overallMeta.iconCls}`}
              strokeWidth={1.75}
              aria-hidden
            />
            <h2 className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
              {overallMeta.label}
            </h2>
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-tertiary)] flex-wrap">
            {uptime > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                Uptime: <strong className="text-[var(--text-secondary)]">{formatUptime(uptime)}</strong>
              </span>
            )}
            {lastChecked && (
              <span className="inline-flex items-center gap-1">
                <RefreshCw className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                Último chequeo:{" "}
                <strong className="text-[var(--text-secondary)]">
                  {lastChecked.toLocaleTimeString("es-PE")}
                </strong>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              runChecks();
              setCountdown(AUTO_REFRESH_SECONDS);
            }}
            disabled={loading}
            title="Verificar (R)"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              strokeWidth={2.25}
            />
            Verificar
          </button>
          <button
            onClick={exportCsv}
            disabled={checks.length === 0}
            title="Exportar CSV"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2.25} />
            CSV
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-extrabold uppercase tracking-wider transition ${
              autoRefresh
                ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/20"
                : "border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40"
            }`}
          >
            <Timer className="h-3 w-3" strokeWidth={2.5} />
            {autoRefresh ? `Auto ${countdown}s` : "Auto off"}
          </button>
        </div>
      </section>

      {/* ─── Tabs ───────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1 w-fit">
        {([
          { key: "system" as const, label: "Sistema", icon: HeartPulse },
          { key: "tenants" as const, label: "Tiendas", icon: Activity },
        ]).map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${
                isActive
                  ? "bg-[var(--surface-raised)] text-[var(--accent)] shadow-sm"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {label}
            </button>
          );
        })}
      </div>

      {activeTab === "system" && (
        <>
          {/* ─── Active incidents ──────────────────────────────── */}
          {incidents.length > 0 && (
            <section className="rounded-2xl border-2 border-rose-300/60 bg-rose-50/40 dark:border-rose-700/40 dark:bg-rose-950/30 overflow-hidden">
              <header className="flex items-center gap-3 border-b border-rose-300/40 dark:border-rose-700/30 px-5 py-3.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-[var(--accent)] dark:bg-rose-900/50 dark:text-[var(--accent)]">
                  <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <div>
                  <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--accent)] dark:text-[var(--accent)]">
                    Incidentes activos
                  </h3>
                  <p className="text-xs text-[var(--accent)]/80 dark:text-[var(--accent)]/80">
                    {incidents.length} incidente{incidents.length === 1 ? "" : "s"} requieren atención
                  </p>
                </div>
              </header>
              <ul className="divide-y divide-rose-200/60 dark:divide-rose-800/40">
                {incidents.map((inc) => (
                  <li
                    key={inc.id}
                    className="flex items-center gap-3 px-5 py-3 text-sm text-[var(--accent)] dark:text-[var(--accent)]"
                  >
                    <XCircle className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                    <span className="font-semibold flex-1">{inc.message}</span>
                    <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]/80 dark:text-[var(--accent)]/80 shrink-0">
                      {(() => {
                        // Brandon 2026-05-21 audit fix #9: guard contra
                        // "Invalid Date" cuando inc.since es null/undefined
                        // o no parseable. Antes mostraba "DESDE INVALID DATE".
                        if (!inc.since) return "ahora";
                        const d = new Date(inc.since);
                        if (isNaN(d.getTime())) return "ahora";
                        return `desde ${d.toLocaleTimeString("es-PE")}`;
                      })()}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ─── Admin metrics (KPIs) ───────────────────────────── */}
          {adminMetrics.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {adminMetrics.map((m) => {
                const tone =
                  m.status === "ok" ? "accent" : m.status === "warning" ? "warning" : "danger";
                const iconBg = {
                  accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
                  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
                  danger: "bg-rose-100 text-[var(--accent)] dark:bg-rose-900/50 dark:text-[var(--accent)]",
                }[tone];
                const valueTone =
                  m.status === "ok"
                    ? "text-[var(--text-primary)]"
                    : m.status === "warning"
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-[var(--accent)] dark:text-[var(--accent)]";
                return (
                  <div
                    key={m.label}
                    className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}
                      >
                        <Activity className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      </span>
                      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-tight">
                        {m.label}
                      </p>
                    </div>
                    <p
                      className={`mt-3 font-display text-3xl font-extrabold tabular-nums tracking-tight ${valueTone}`}
                    >
                      {m.value}
                      {m.unit && (
                        <span className="text-base font-bold ml-1 opacity-70">{m.unit}</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── Individual service checks ──────────────────────── */}
          <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
            <header className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                  <Server className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <div>
                  <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
                    Servicios monitoreados
                  </h3>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {checks.length} check{checks.length === 1 ? "" : "s"} ejecutados ·{" "}
                    {checks.filter((c) => c.status === "ok").length} OK
                  </p>
                </div>
              </div>
            </header>
            {checks.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
                  <HeartPulse
                    className="h-5 w-5 text-[var(--text-tertiary)]"
                    aria-hidden
                  />
                </div>
                <p className="font-display text-sm font-extrabold text-[var(--text-primary)]">
                  Iniciando verificación de sistemas…
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--rule-soft)]">
                {checks.map((check) => (
                  <li
                    key={check.name}
                    className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-[var(--surface-sunken)]/50"
                  >
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] shrink-0">
                      {check.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-[var(--text-primary)]">
                          {check.name}
                        </span>
                        <StatusBadge status={check.status} />
                      </div>
                      {check.detail && (
                        <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">
                          {check.detail}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`font-mono text-sm font-extrabold tabular-nums ${
                          check.latency > 1000
                            ? "text-[var(--accent)] dark:text-[var(--accent)]"
                            : check.latency > 500
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-[var(--text-secondary)]"
                        }`}
                      >
                        {check.latency > 0 ? `${check.latency}ms` : "—"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {activeTab === "tenants" && <TenantMonitorPanel />}
    </AdminTabShell>
  );
}
