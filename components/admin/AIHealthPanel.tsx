"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Zap,
  Bot,
  Database,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Activity,
  Heart,
} from "@buleje/design-system/icons";

// ── Types ────────────────────────────────────────────────────────────────────

interface SubsystemCheck {
  name: string;
  status: "ok" | "warning" | "error";
  detail: string;
  category: "seguridad" | "rendimiento" | "agentes" | "datos";
}

interface HealthResponse {
  status: "healthy" | "warning" | "degraded" | "critical";
  score: number;
  total: number;
  ok: number;
  warnings: number;
  errors: number;
  checks: SubsystemCheck[];
  timestamp: string;
}

// ── Category config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG = {
  seguridad: { icon: Shield, color: "#ef4444", label: "Seguridad" },
  rendimiento: { icon: Zap, color: "#ff6b5b", label: "Rendimiento" },
  agentes: { icon: Bot, color: "var(--accent)", label: "Agentes IA" },
  datos: { icon: Database, color: "#8b5cf6", label: "Datos" },
} as const;

const STATUS_CONFIG = {
  ok: { icon: CheckCircle2, color: "var(--accent)", label: "OK" },
  warning: { icon: AlertTriangle, color: "#ff6b5b", label: "Advertencia" },
  error: { icon: XCircle, color: "#ef4444", label: "Error" },
} as const;

const OVERALL_CONFIG = {
  healthy: { color: "var(--accent)", label: "Todo funciona perfecto", icon: CheckCircle2 },
  warning: { color: "#ff6b5b", label: "Funciona con advertencias", icon: AlertTriangle },
  degraded: { color: "#ff6b5b", label: "Algunos sistemas con problemas", icon: Activity },
  critical: { color: "#ef4444", label: "Problemas críticos detectados", icon: XCircle },
} as const;

// ── Component ────────────────────────────────────────────────────────────────

const AUTO_REFRESH_SECONDS = 5 * 60; // 5 minutes

export default function AIHealthPanel() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [animateIn, setAnimateIn] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAnimateIn(false);
    try {
      const res = await fetch("/api/ai-assistant/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setTimeout(() => setAnimateIn(true), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
      setCountdown(AUTO_REFRESH_SECONDS);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const refreshInterval = setInterval(fetchHealth, AUTO_REFRESH_SECONDS * 1000);
    const tickInterval = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? AUTO_REFRESH_SECONDS : prev - 1));
    }, 1000);
    return () => {
      clearInterval(refreshInterval);
      clearInterval(tickInterval);
    };
  }, [fetchHealth]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-primary/20 border-t-[var(--accent)] animate-spin" />
          <Heart className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-primary animate-pulse" />
        </div>
        <p className="text-sm text-[var(--text-tertiary)]">Revisando sistemas de IA...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <XCircle className="h-12 w-12 text-[var(--data-error-500)]" />
        <p className="text-sm text-[var(--data-error-500)]">Error al verificar: {error}</p>
        <button
          onClick={fetchHealth}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-[#009e92] transition-colors text-sm"
        >
          <RefreshCw className="h-4 w-4" /> Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const overall = OVERALL_CONFIG[data.status];
  const OverallIcon = overall.icon;
  const categories = Object.keys(CATEGORY_CONFIG) as (keyof typeof CATEGORY_CONFIG)[];

  return (
    <div className="space-y-6">
      {/* ── Score ring + status ─────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="relative">
          {/* Animated ring */}
          <svg width="140" height="140" viewBox="0 0 140 140" className="transform -rotate-90">
            <circle
              cx="70" cy="70" r="60"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-[var(--text-tertiary)] dark:text-[var(--text-primary)]"
            />
            <circle
              cx="70" cy="70" r="60"
              fill="none"
              stroke={overall.color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 60}`}
              strokeDashoffset={`${2 * Math.PI * 60 * (1 - (animateIn ? data.score / 100 : 0))}`}
              style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)" }}
            />
          </svg>
          {/* Score text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-3xl font-bold transition-all duration-[var(--dur-slower)]"
              style={{ color: overall.color }}
            >
              {data.score}%
            </span>
            <span className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">
              Salud IA
            </span>
          </div>
          {/* Pulse ring for healthy */}
          {data.status === "healthy" && (
            <div
              className="absolute inset-0 rounded-full animate-ping opacity-20"
              style={{ border: `2px solid ${overall.color}` }}
            />
          )}
        </div>

        <div className="text-center">
          <p className="text-lg font-semibold text-[var(--text-primary)]">
            <span className="inline-flex items-center gap-2">
              <OverallIcon className="h-5 w-5" style={{ color: overall.color }} />
              <span>{overall.label}</span>
            </span>
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            {data.ok} activos · {data.warnings} advertencias · {data.errors} errores
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchHealth}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--surface-sunken)] text-[var(--text-secondary)] rounded-full hover:bg-[var(--rule-soft)] dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Actualizar
          </button>
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">
            Auto-refresh en {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* ── Checks grouped by category ─────────────────────────────────── */}
      {categories.map((cat, catIdx) => {
        const config = CATEGORY_CONFIG[cat];
        const CatIcon = config.icon;
        const checks = data.checks.filter((c) => c.category === cat);
        if (checks.length === 0) return null;

        return (
          <div
            key={cat}
            className="rounded-xl border border-[var(--rule-base)] overflow-hidden"
            style={{
              opacity: animateIn ? 1 : 0,
              transform: animateIn ? "translateY(0)" : "translateY(20px)",
              transition: `all 0.5s cubic-bezier(0.4, 0, 0.2, 1) ${catIdx * 150}ms`,
            }}
          >
            {/* Category header */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-sunken)]/50 border-b border-[var(--rule-base)]">
              <CatIcon className="h-4 w-4" style={{ color: config.color }} />
              <span className="text-sm font-semibold text-[var(--text-secondary)]">
                {config.label}
              </span>
              <span className="ml-auto text-xs text-[var(--text-tertiary)]">
                {checks.filter((c) => c.status === "ok").length}/{checks.length}
              </span>
            </div>

            {/* Checks */}
            <div className="divide-y divide-gray-100 dark:divide-gray-700/30">
              {checks.map((check, checkIdx) => {
                const statusConf = STATUS_CONFIG[check.status];
                const StatusIcon = statusConf.icon;

                return (
                  <div
                    key={check.name}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--surface-alt)]/50 dark:hover:bg-gray-800/30 transition-colors"
                    style={{
                      opacity: animateIn ? 1 : 0,
                      transform: animateIn ? "translateX(0)" : "translateX(-10px)",
                      transition: `all 0.4s ease ${catIdx * 150 + checkIdx * 80}ms`,
                    }}
                  >
                    <StatusIcon
                      className="h-5 w-5 mt-0.5 shrink-0"
                      style={{ color: statusConf.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {check.name}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        {check.detail}
                      </p>
                    </div>
                    {/* Animated dot for OK status */}
                    {check.status === "ok" && (
                      <span
                        className="relative flex h-2.5 w-2.5 mt-1.5 shrink-0"
                      >
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-soft)] opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--accent-soft)]" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── Activity pulse bar (animated) ──────────────────────────────── */}
      <div className="flex items-center justify-center gap-2 py-3">
        <Activity className="h-4 w-4 text-primary animate-pulse" />
        <span className="text-xs text-[var(--text-tertiary)]">
          Última verificación: {new Date(data.timestamp).toLocaleTimeString("es-PE")}
        </span>
      </div>
    </div>
  );
}
