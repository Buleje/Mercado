"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw, Database, Cpu, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HealthPayload, HealthService } from "@/app/api/admin/health/route";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  operativo: { icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", label: "Operativo" },
  degradado:  { icon: AlertTriangle, color: "text-amber-500",  bg: "bg-amber-50 dark:bg-amber-900/20",   label: "Degradado" },
  caido:      { icon: XCircle,       color: "text-red-500",    bg: "bg-red-50 dark:bg-red-900/20",       label: "Caído" },
};

const SERVICE_ICONS: Record<string, React.ElementType> = {
  database: Database,
  cache:    Zap,
  api:      Activity,
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function HealthSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-20 bg-gray-100 dark:bg-surface rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => <div key={i} className="h-32 bg-gray-100 dark:bg-surface rounded-xl" />)}
      </div>
      <div className="h-28 bg-gray-100 dark:bg-surface rounded-2xl" />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SystemHealthTab() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: HealthPayload = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <HealthSkeleton />;

  if (error) return (
    <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 p-6 text-center">
      <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
      <p className="font-bold text-red-700 dark:text-red-400">Error al cargar health check</p>
      <p className="text-xs text-red-500 mt-1">{error}</p>
      <button onClick={() => load()} className="mt-3 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-red-500 hover:bg-red-600">
        Reintentar
      </button>
    </div>
  );

  if (!data) return null;

  const services = data.services;
  const metrics = data.metrics;
  const incidents = data.incidents;

  const overallStatus =
    services.some(s => s.status === "caido") ? "caido" :
    services.some(s => s.status === "degradado") ? "degradado" :
    "operativo";
  const OverallIcon = STATUS_CONFIG[overallStatus].icon;
  const operativeCount = services.filter(s => s.status === "operativo").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Salud del Sistema
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">
            Monitoreo de servicios en tiempo real · Última verificación: {fmtDate(data.checkedAt)}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          {refreshing ? "Verificando…" : "Actualizar"}
        </button>
      </div>

      {/* Overall status banner */}
      <div className={cn("rounded-2xl p-5 flex items-center gap-4", STATUS_CONFIG[overallStatus].bg)}>
        <OverallIcon className={cn("h-10 w-10 shrink-0", STATUS_CONFIG[overallStatus].color)} />
        <div>
          <h3 className={cn("text-lg font-extrabold", STATUS_CONFIG[overallStatus].color)}>
            {overallStatus === "operativo"
              ? "Todos los sistemas operativos"
              : overallStatus === "degradado"
              ? "Algunos servicios degradados"
              : "Servicios caídos detectados"}
          </h3>
          <p className="text-xs text-gray-500 dark:text-muted">
            {operativeCount}/{services.length} servicios operativos
            {incidents.filter(i => i.status === "open").length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-bold">
                {incidents.filter(i => i.status === "open").length} incidente(s) activo(s)
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Service cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {services.map((s: HealthService) => {
          const SC = STATUS_CONFIG[s.status];
          const SIcon = SC.icon;
          const ServiceIcon = SERVICE_ICONS[s.id] ?? Activity;
          return (
            <div key={s.id} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ServiceIcon className="h-4 w-4 text-gray-400" />
                  <h4 className="font-bold text-sm text-gray-900 dark:text-foreground">{s.name}</h4>
                </div>
                <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full", SC.bg, SC.color)}>
                  <SIcon className="h-3 w-3" />{SC.label}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-muted mb-3">{s.description}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs font-extrabold text-gray-900 dark:text-foreground">{s.uptime}</p>
                  <p className="text-[9px] text-gray-400">Uptime</p>
                </div>
                <div>
                  <p className={cn(
                    "text-xs font-extrabold",
                    s.responseTime < 200 ? "text-emerald-500" : s.responseTime < 500 ? "text-amber-500" : "text-red-500"
                  )}>{s.responseTime}ms</p>
                  <p className="text-[9px] text-gray-400">Latencia</p>
                </div>
                <div>
                  <p className="text-[9px] text-gray-400">{fmtDate(s.lastCheck)}</p>
                  <p className="text-[9px] text-gray-400">Verificado</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Metrics */}
      {metrics.length > 0 && (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
          <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-4 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" /> Métricas clave
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
            {metrics.map(m => {
              const pct = Math.min(100, (m.value / m.max) * 100);
              const barColor =
                m.status === "critical" ? "bg-red-500" :
                m.status === "warning"  ? "bg-amber-500" :
                "bg-emerald-500";
              return (
                <div key={m.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-700 dark:text-foreground">{m.label}</span>
                    <span className="text-xs font-extrabold text-gray-900 dark:text-foreground">{m.value} {m.unit}</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Incidents */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
        <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> Incidentes
        </h3>
        {incidents.length === 0 ? (
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm">
            <CheckCircle className="h-4 w-4" />
            <span className="font-semibold">Sin incidentes activos</span>
          </div>
        ) : (
          <div className="space-y-2">
            {incidents.map(inc => (
              <div key={inc.id} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-card-border last:border-0">
                <div className={cn(
                  "h-2.5 w-2.5 rounded-full shrink-0",
                  inc.severity === "critical" ? "bg-red-500" : inc.severity === "warning" ? "bg-amber-500" : "bg-blue-500"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-foreground">{inc.title}</p>
                  <p className="text-[10px] text-gray-400">{fmtDate(inc.createdAt)}</p>
                </div>
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                  inc.status === "resolved"
                    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                    : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                )}>
                  {inc.status === "resolved" ? "Resuelto" : "Activo"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
