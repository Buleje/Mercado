"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Clock, TrendingUp, Receipt, DollarSign } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface MetricsData {
  turnoActivo: boolean;
  turnoId?: string;
  turnoMinutos?: number;
  totalVentas?: number;
  cantidadVentas?: number;
  ticketPromedio?: number;
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function POSMetricsStrip() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const retryCountRef = useRef(0);
  const fetchRef = useRef<() => void>(() => {});

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/pos/metrics");
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setFetchError(false);
        retryCountRef.current = 0;
      } else {
        // API responded but with error (e.g., 401, 500)
        setFetchError(true);
        // Retry up to 3 times with backoff on first load
        if (retryCountRef.current < 3) {
          retryCountRef.current++;
          setTimeout(() => fetchRef.current(), retryCountRef.current * 2000);
        }
      }
    } catch {
      // Network error
      setFetchError(true);
      if (retryCountRef.current < 3) {
        retryCountRef.current++;
        setTimeout(() => fetchRef.current(), retryCountRef.current * 2000);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRef.current = fetchMetrics;
  }, [fetchMetrics]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60_000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  // Loading skeletons
  if (loading) {
    return (
      <div className="h-9 bg-slate-50 dark:bg-slate-800/50 border-b border-[var(--rule-soft)] dark:border-card-border flex items-center gap-4 px-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
          />
        ))}
      </div>
    );
  }

  // Fetch error — show "Verificando..." instead of misleading "Sin turno activo"
  if (fetchError && !data) {
    return (
      <div className="h-9 bg-gray-50 dark:bg-slate-800/50 border-b border-[var(--rule-soft)] dark:border-card-border flex items-center justify-center gap-2 px-4">
        <Clock className="h-3.5 w-3.5 text-[var(--text-tertiary)] animate-pulse" />
        <span className="text-xs font-semibold text-[var(--text-tertiary)] dark:text-muted">
          Verificando turno...
        </span>
        <button
          onClick={() => { retryCountRef.current = 0; void fetchMetrics(); }}
          className="text-xs font-bold text-primary hover:underline ml-1"
        >
          Reintentar
        </button>
      </div>
    );
  }

  // No active turno (API responded successfully with turnoActivo: false)
  if (!data || !data.turnoActivo) {
    return (
      <div className="h-9 bg-[var(--data-warning-50)] dark:bg-amber-950/20 border-b border-[var(--data-warning)] dark:border-[var(--data-warning)]/30 flex items-center justify-center gap-2 px-4">
        <Clock className="h-3.5 w-3.5 text-[var(--data-warning)]" />
        <span className="text-xs font-semibold text-[var(--data-warning)] dark:text-[var(--data-warning)]">
          Sin turno activo
        </span>
        <a
          href="/admin#turnos"
          className="text-xs font-bold text-[var(--data-warning)] dark:text-[var(--data-warning)] underline hover:no-underline ml-1"
        >
          Abrir turno
        </a>
      </div>
    );
  }

  const items = [
    {
      icon: Clock,
      label: "Turno",
      value: formatMinutes(data.turnoMinutos ?? 0),
      color: "text-[var(--data-success)] dark:text-[var(--data-success)]",
    },
    {
      icon: DollarSign,
      label: "Ventas",
      value: `S/ ${(data.totalVentas ?? 0).toFixed(0)}`,
      color: "text-[var(--data-success)] dark:text-[var(--data-success)]",
    },
    {
      icon: Receipt,
      label: "Transacciones",
      value: String(data.cantidadVentas ?? 0),
      color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)]",
    },
    {
      icon: TrendingUp,
      label: "Ticket",
      value: `S/ ${(data.ticketPromedio ?? 0).toFixed(1)}`,
      color: "text-[var(--data-warning)] dark:text-[var(--data-warning)]",
    },
  ];

  return (
    <div className="h-9 bg-slate-50 dark:bg-slate-800/50 border-b border-[var(--rule-soft)] dark:border-card-border flex items-center gap-3 sm:gap-5 px-4 overflow-x-auto scrollbar-hide">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 shrink-0">
          <item.icon className={cn("h-3.5 w-3.5", item.color)} />
          <span className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] dark:text-muted hidden sm:inline">
            {item.label}:
          </span>
          <span className={cn("text-[length:var(--ts-xs)] font-bold", item.color)}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
