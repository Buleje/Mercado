"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityEntry } from "./ActivityTracker";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Alert {
  id: string;
  type: AlertType;
  label: string;
  count: number;
  details: string;
  severity: "high" | "medium";
  entries: ActivityEntry[];
}

type AlertType =
  | "anulaciones_masivas"
  | "cambio_precio_extremo"
  | "eliminaciones_masivas"
  | "ip_diferente";

// ── Pattern detection ──────────────────────────────────────────────────────────

function detectPatterns(logs: ActivityEntry[]): Alert[] {
  const now = Date.now();
  const oneHourAgo = now - 3_600_000;

  const alerts: Alert[] = [];

  // 1. More than 3 cancellations in 1 hour
  const recentAnulaciones = logs.filter(
    (e) => e.action === "venta_anular" && new Date(e.timestamp).getTime() > oneHourAgo
  );
  if (recentAnulaciones.length > 3) {
    alerts.push({
      id: "anulaciones_masivas",
      type: "anulaciones_masivas",
      label: "Multiples anulaciones de venta",
      count: recentAnulaciones.length,
      details: `${recentAnulaciones.length} anulaciones en la ultima hora`,
      severity: "high",
      entries: recentAnulaciones.slice(0, 5),
    });
  }

  // 2. Price change > 50% — stored in details as "old:X|new:Y"
  const precioChanges = logs.filter((e) => e.action === "precio_cambio");
  const extremePriceChanges = precioChanges.filter((e) => {
    const match = e.details.match(/old:([\d.]+)\|new:([\d.]+)/i);
    if (!match) return false;
    const oldPrice = parseFloat(match[1]);
    const newPrice = parseFloat(match[2]);
    if (!oldPrice || !newPrice) return false;
    const changePct = Math.abs((newPrice - oldPrice) / oldPrice) * 100;
    return changePct > 50;
  });
  if (extremePriceChanges.length > 0) {
    alerts.push({
      id: "cambio_precio_extremo",
      type: "cambio_precio_extremo",
      label: "Cambio de precio extremo",
      count: extremePriceChanges.length,
      details: `${extremePriceChanges.length} precio${extremePriceChanges.length !== 1 ? "s" : ""} con variacion mayor al 50%`,
      severity: "high",
      entries: extremePriceChanges.slice(0, 5),
    });
  }

  // 3. More than 5 deletions
  const recentEliminaciones = logs.filter(
    (e) => e.action === "producto_eliminar" && new Date(e.timestamp).getTime() > oneHourAgo
  );
  if (recentEliminaciones.length >= 5) {
    alerts.push({
      id: "eliminaciones_masivas",
      type: "eliminaciones_masivas",
      label: "Eliminaciones masivas",
      count: recentEliminaciones.length,
      details: `${recentEliminaciones.length} eliminaciones en la ultima hora`,
      severity: "high",
      entries: recentEliminaciones.slice(0, 5),
    });
  }

  // 4. IP change detection (stored in details as "ip:X.X.X.X")
  const loginEntries = logs.filter((e) => e.action === "config_cambio" && e.details.startsWith("ip:"));
  const ips = loginEntries.map((e) => e.details.replace("ip:", "").trim());
  const uniqueIps = [...new Set(ips)];
  if (uniqueIps.length > 1) {
    alerts.push({
      id: "ip_diferente",
      type: "ip_diferente",
      label: "Acceso desde IP diferente",
      count: uniqueIps.length,
      details: `IPs detectadas: ${uniqueIps.join(", ")}`,
      severity: "medium",
      entries: loginEntries.slice(0, 5),
    });
  }

  return alerts;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SuspiciousActivityAlert() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);

  const analyze = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/activity-log?limit=50");
      let logs: ActivityEntry[] = [];
      if (res.ok) {
        const data = await res.json();
        logs = Array.isArray(data) ? data : (data.logs ?? []);
      } else {
        // Fallback to localStorage
        const { getLocalActivityLog } = await import("./ActivityTracker");
        logs = getLocalActivityLog().slice(0, 50);
      }
      setAlerts(detectPatterns(logs));
    } catch {
      // Fallback to localStorage silently
      try {
        const { getLocalActivityLog } = await import("./ActivityTracker");
        const logs = getLocalActivityLog().slice(0, 50);
        setAlerts(detectPatterns(logs));
      } catch {
        setAlerts([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void analyze();
    const interval = setInterval(analyze, 60_000); // re-check every minute
    return () => clearInterval(interval);
  }, [analyze]);

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.id));
  const highCount = visibleAlerts.filter((a) => a.severity === "high").length;
  const totalCount = visibleAlerts.length;

  if (totalCount === 0) return null;

  return (
    <div className="relative">
      {/* Trigger badge */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
          highCount > 0
            ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-950/60"
            : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-950/50"
        )}
        aria-label={`${totalCount} alerta${totalCount !== 1 ? "s" : ""} de actividad sospechosa`}
      >
        <AlertTriangle size={15} className="shrink-0" />
        <span>{totalCount} alerta{totalCount !== 1 ? "s" : ""}</span>
        {/* Red dot for high severity */}
        {highCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {highCount}
          </span>
        )}
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div
          className={cn(
            "absolute right-0 top-full mt-2 w-96 z-50 rounded-xl",
            "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700",
            "overflow-hidden"
          )}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-500" />
              <span className="font-semibold text-sm text-gray-800 dark:text-white">Actividad sospechosa</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={analyze}
                disabled={loading}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Actualizar"
              >
                <RefreshCw size={13} className={cn(loading && "animate-spin")} />
              </button>
              <button
                onClick={() => setExpanded(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Cerrar"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Alert list */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {visibleAlerts.map((alert) => (
              <div key={alert.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold",
                        alert.severity === "high" ? "bg-red-500" : "bg-amber-500"
                      )}
                    >
                      {alert.count}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{alert.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{alert.details}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setExpandedAlert(expandedAlert === alert.id ? null : alert.id)}
                      className="text-xs text-[#00B4A6] hover:underline"
                    >
                      {expandedAlert === alert.id ? "Ocultar" : "Ver"}
                    </button>
                    <button
                      onClick={() => setDismissed((prev) => new Set([...prev, alert.id]))}
                      className="p-0.5 text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
                      aria-label="Ignorar alerta"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>

                {/* Expanded entries */}
                {expandedAlert === alert.id && (
                  <div className="mt-2 space-y-1 pl-7">
                    {alert.entries.map((entry, i) => (
                      <div
                        key={i}
                        className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{entry.details}</span>
                        <span className="shrink-0 tabular-nums text-gray-400 dark:text-gray-500">
                          {fmtDate(entry.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
