"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Clock, TrendingUp, Receipt, DollarSign, HandCoins } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface PaymentBreakdownEntry {
  metodo: string;
  total: number;
  pct: number;
}

interface TopProductoEntry {
  nombre: string;
  cantidad: number;
}

interface MetricsData {
  turnoActivo: boolean;
  turnoId?: string;
  adminUserId?: string;
  turnoMinutos?: number;
  totalVentas?: number;
  cantidadVentas?: number;
  ticketPromedio?: number;
  paymentBreakdown?: PaymentBreakdownEntry[];
  topProductos?: TopProductoEntry[];
  comisionEstimada?: number;
  comisionRate?: number;
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
      <div className="h-9 bg-slate-50 dark:bg-slate-800/50 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center gap-4 px-4">
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
      <div className="h-9 bg-gray-50 dark:bg-slate-800/50 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-center gap-2 px-4">
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

  // No active turno — no renderizar strip redundante.
  // La barra superior de POSCajaModule ya muestra "Sin turno" + CTA "Abrir Turno".
  if (!data || !data.turnoActivo) {
    return null;
  }

  const items: Array<{ icon: typeof Clock; label: string; value: string; color: string; title?: string }> = [
    {
      icon: Clock,
      label: "Turno",
      value: formatMinutes(data.turnoMinutos ?? 0),
      color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    },
    {
      icon: DollarSign,
      label: "Ventas",
      value: `S/ ${(data.totalVentas ?? 0).toFixed(0)}`,
      color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
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
      color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
    },
  ];

  // Mi comision estimada (visible solo si hubo ventas)
  if ((data.totalVentas ?? 0) > 0 && (data.comisionEstimada ?? 0) > 0) {
    items.push({
      icon: HandCoins,
      label: "Mi comision",
      value: `S/ ${(data.comisionEstimada ?? 0).toFixed(2)}`,
      color: "text-primary",
      title: `Estimada al ${data.comisionRate ?? 2.5}% sobre ventas`,
    });
  }

  // Metodo dominante (top 1 paymentBreakdown) — pista visual rapida
  const topPay = data.paymentBreakdown?.[0];
  const topProd = data.topProductos?.[0];

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
      <div className="h-9 flex items-center gap-3 sm:gap-5 px-4 overflow-x-auto scrollbar-hide">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 shrink-0" title={item.title}>
            <item.icon className={cn("h-3.5 w-3.5", item.color)} />
            <span className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] dark:text-muted hidden sm:inline">
              {item.label}:
            </span>
            <span className={cn("text-[length:var(--ts-xs)] font-bold", item.color)}>
              {item.value}
            </span>
          </div>
        ))}
        {topPay && topPay.total > 0 && (
          <div className="hidden md:flex items-center gap-1.5 shrink-0 pl-3 border-l border-[var(--rule-soft)] dark:border-[var(--rule-base)]" title={`${topPay.pct}% de las ventas`}>
            <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] dark:text-muted">
              Top pago:
            </span>
            <span className="text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] capitalize">
              {topPay.metodo} ({topPay.pct}%)
            </span>
          </div>
        )}
        {topProd && (
          <div className="hidden lg:flex items-center gap-1.5 shrink-0 pl-3 border-l border-[var(--rule-soft)] dark:border-[var(--rule-base)]" title={`${topProd.cantidad} unidades vendidas`}>
            <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] dark:text-muted">
              Top producto:
            </span>
            <span className="text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate max-w-[200px]">
              {topProd.nombre} ×{topProd.cantidad}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
