"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  HeartPulse, Database, Globe, Server, RefreshCw,
  CheckCircle2, AlertTriangle, XCircle, Clock, Wifi, HardDrive,
  Activity, Timer,
} from "@buleje/design-system/icons";
import SAHealthScore from "@/components/superadmin/_shared/SAHealthScore";
import { AdminTabShell } from "../_components/_shared";

const TenantMonitorPanel = dynamic(() => import("@/components/superadmin/TenantMonitorPanel"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Status helpers ────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ok: "bg-[var(--data-success)]",
    degraded: "bg-[var(--data-warning)]",
    error: "bg-[var(--data-error)]",
    checking: "bg-gray-300 animate-pulse",
  };
  return <span className={`w-2.5 h-2.5 rounded-full ${colors[status] ?? colors.checking}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ok: "bg-[var(--data-success-100)] text-[var(--data-success)] dark:bg-[var(--data-success)]/30 dark:text-[var(--data-success)]",
    degraded: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]",
    error: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]",
    checking: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };
  const labels: Record<string, string> = {
    ok: "Operativo",
    degraded: "Degradado",
    error: "Error",
    checking: "Verificando...",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${styles[status] ?? styles.checking}`}>
      <StatusDot status={status} />
      {labels[status] ?? "Desconocido"}
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SystemHealthPage() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [overallStatus, setOverallStatus] = useState<"ok" | "degraded" | "error" | "checking">("checking");
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
      const data: HealthData = res.ok ? await res.json() : {} as HealthData;

      results.push({
        name: "API Server",
        status: res.ok ? "ok" : "degraded",
        latency,
        detail: `Tiempo de respuesta: ${data.responseTimeMs ?? latency}ms`,
        icon: <Server className="w-5 h-5" />,
      });

      const dbStatus = data.checks?.database?.status === "ok" ? "ok" as const : "error" as const;
      results.push({
        name: "Base de datos",
        status: dbStatus,
        latency: data.checks?.database?.latencyMs ?? 0,
        detail: data.checks?.database?.circuitBreaker
          ? `Circuit breaker: ${data.checks.database.circuitBreaker}`
          : `Latencia: ${data.checks?.database?.latencyMs ?? "?"}ms`,
        icon: <Database className="w-5 h-5" />,
      });

      if (!res.ok) score -= 30;
      if (dbStatus === "error") score -= 40;
      setUptime(data.uptime ?? 0);
    } catch {
      results.push({ name: "API Server", status: "error", latency: 0, detail: "No se pudo conectar", icon: <Server className="w-5 h-5" /> });
      results.push({ name: "Base de datos", status: "error", latency: 0, detail: "No verificable", icon: <Database className="w-5 h-5" /> });
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
        icon: <Wifi className="w-5 h-5" />,
      });
      if (!res.ok && res.status !== 401) score -= 10;
    } catch {
      results.push({ name: "Autenticación", status: "error", latency: 0, detail: "No se pudo verificar", icon: <Wifi className="w-5 h-5" /> });
      score -= 10;
    }

    // 3. Static assets
    try {
      const start = Date.now();
      const res = await fetch("/icon?health-check", { method: "HEAD" });
      const latency = Date.now() - start;
      results.push({ name: "Archivos estáticos", status: res.ok ? "ok" : "degraded", latency, icon: <HardDrive className="w-5 h-5" /> });
      if (!res.ok) score -= 5;
    } catch {
      results.push({ name: "Archivos estáticos", status: "error", latency: 0, icon: <HardDrive className="w-5 h-5" /> });
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
        icon: <Globe className="w-5 h-5" />,
      });
      if (!res.ok) score -= 15;
    } catch {
      results.push({ name: "API Productos", status: "error", latency: 0, detail: "No se pudo conectar", icon: <Globe className="w-5 h-5" /> });
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
      // Non-critical — metrics just won't show
    }

    setChecks(results);
    setLastChecked(new Date());
    setLoading(false);
    setHealthScore(Math.max(0, Math.min(100, score)));

    if (results.some((c) => c.status === "error")) setOverallStatus("error");
    else if (results.some((c) => c.status === "degraded")) setOverallStatus("degraded");
    else setOverallStatus("ok");
  }, []);

  // Initial check
  useEffect(() => { runChecks(); }, [runChecks]);

  // Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    setCountdown(AUTO_REFRESH_SECONDS);
    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          runChecks();
          return AUTO_REFRESH_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, runChecks]);

  const overallIcons = {
    ok: <CheckCircle2 className="w-8 h-8 text-[var(--data-success)]" />,
    degraded: <AlertTriangle className="w-8 h-8 text-[var(--data-warning)]" />,
    error: <XCircle className="w-8 h-8 text-[var(--data-error)]" />,
    checking: <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />,
  };
  const overallLabels = {
    ok: "Todos los sistemas operativos",
    degraded: "Algunos servicios degradados",
    error: "Problemas detectados",
    checking: "Verificando sistemas...",
  };
  // Ola 2: tokenized surface — color-mix con var(--data-*) 8% para un soft
  // background consistente en ambos temas, en lugar de bg-green-950/20 hardcoded.
  const overallColors = {
    ok: "border-[var(--data-success)] bg-[color-mix(in_oklch,var(--data-success)_8%,transparent)]",
    degraded: "border-[var(--data-warning)] bg-[color-mix(in_oklch,var(--data-warning)_8%,transparent)]",
    error: "border-[var(--data-error)] bg-[color-mix(in_oklch,var(--data-error)_8%,transparent)]",
    checking: "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
  };

  return (
    <AdminTabShell
      title="Salud del sistema"
      description="Estado en tiempo real de servicios, latencia y métricas operativas. Auto-refresh cada 30 s."
      icon={HeartPulse}
      kicker="Operaciones"
    >
      {/* Overall Status Banner + Health Score */}
      <div className={`rounded-xl border-2 p-6 flex items-center gap-6 ${overallColors[overallStatus]}`}>
        <SAHealthScore score={healthScore} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {overallIcons[overallStatus]}
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {overallLabels[overallStatus]}
            </h2>
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-[var(--text-tertiary)]">
            {uptime > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Uptime: {formatUptime(uptime)}
              </span>
            )}
            {lastChecked && (
              <span>Último chequeo: {lastChecked.toLocaleTimeString("es-PE")}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            onClick={() => { runChecks(); setCountdown(AUTO_REFRESH_SECONDS); }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] text-sm font-medium text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Verificar
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${autoRefresh ? "text-[var(--accent)] bg-[var(--accent-soft)]" : "text-[var(--text-tertiary)] bg-[var(--surface-sunken)]"}`}
          >
            <Timer className="w-3 h-3" />
            {autoRefresh ? `Auto (${countdown}s)` : "Auto-refresh off"}
          </button>
        </div>
      </div>

      {/* Tabs: System / Tenants */}
      <div className="flex gap-1 bg-[var(--surface-sunken)] rounded-xl p-1 max-w-xs">
        <button
          onClick={() => setActiveTab("system")}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "system" ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
        >
          <HeartPulse className="w-4 h-4 inline mr-1.5" />
          Sistema
        </button>
        <button
          onClick={() => setActiveTab("tenants")}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "tenants" ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
        >
          <Activity className="w-4 h-4 inline mr-1.5" />
          Tiendas
        </button>
      </div>

      {activeTab === "system" && (
        <>
          {/* Active Incidents */}
          {incidents.length > 0 && (
            <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error)] dark:border-[var(--data-error)] rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-[var(--data-error)] dark:text-[var(--data-error)] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Incidentes activos
              </h3>
              {incidents.map(inc => (
                <div key={inc.id} className="flex items-center gap-3 text-sm text-[var(--data-error)] dark:text-[var(--data-error)]">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>{inc.message}</span>
                  <span className="text-sm font-semibold text-[var(--data-error)] ml-auto">desde {new Date(inc.since).toLocaleTimeString("es-PE")}</span>
                </div>
              ))}
            </div>
          )}

          {/* Admin Metrics (latency, orders/hour, cache) */}
          {adminMetrics.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {adminMetrics.map(m => (
                <div key={m.label} className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-4">
                  <p className="text-sm font-semibold text-[var(--text-tertiary)]">{m.label}</p>
                  <p className={`text-3xl font-extrabold mt-1.5 tabular-nums ${m.status === "ok" ? "text-[var(--text-primary)]" : m.status === "warning" ? "text-[var(--data-warning)]" : "text-[var(--data-error)]"}`}>
                    {m.value}{m.unit ? <span className="text-base font-semibold ml-1">{m.unit}</span> : null}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Individual checks */}
          <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl divide-y divide-gray-100 dark:divide-gray-800">
            {checks.map((check) => (
              <div key={check.name} className="flex items-center gap-4 px-6 py-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center text-[var(--text-tertiary)] shrink-0">
                  {check.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-[var(--text-primary)]">{check.name}</span>
                    <StatusBadge status={check.status} />
                  </div>
                  {check.detail && (
                    <p className="text-sm text-[var(--text-tertiary)] mt-1 truncate">{check.detail}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-base font-mono font-bold tabular-nums ${check.latency > 1000 ? "text-[var(--data-error)]" : check.latency > 500 ? "text-[var(--data-warning)]" : "text-[var(--text-secondary)]"}`}>
                    {check.latency > 0 ? `${check.latency}ms` : "—"}
                  </span>
                </div>
              </div>
            ))}

            {checks.length === 0 && (
              <div className="px-6 py-12 text-center text-sm text-gray-400">
                <HeartPulse className="w-8 h-8 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                Iniciando verificación de sistemas...
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "tenants" && (
        <TenantMonitorPanel />
      )}
    </AdminTabShell>
  );
}
