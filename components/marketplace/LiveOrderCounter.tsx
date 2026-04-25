"use client";

/**
 * LiveOrderCounter — Social proof city-level del marketplace.
 *
 * Muestra: "1.247 pedidos entregados esta semana en Pucallpa"
 * Polling cada 5 minutos desde /api/marketplace/stats/week.
 * Si el endpoint falla, muestra fallback estático.
 *
 * MK-62 — Sprint 3 marketplace blueprint.
 */

import { useEffect, useState } from "react";
import { Truck } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface WeekStats {
  deliveredOrders: number;
  activeStores: number;
}

const POLL_MS = 5 * 60 * 1000;
const FALLBACK: WeekStats = { deliveredOrders: 1247, activeStores: 28 };

interface Props {
  variant?: "footer" | "inline";
  className?: string;
}

export default function LiveOrderCounter({ variant = "inline", className }: Props) {
  const [stats, setStats] = useState<WeekStats>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/marketplace/stats/week", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as WeekStats;
        if (cancelled) return;
        setStats({
          deliveredOrders: Number(data.deliveredOrders ?? FALLBACK.deliveredOrders),
          activeStores: Number(data.activeStores ?? FALLBACK.activeStores),
        });
      } catch {
        // mantener fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (variant === "footer") {
    return (
      <div className={cn("flex items-center justify-center gap-3 py-6 text-center", className)}>
        <Truck className="h-5 w-5 text-[var(--accent)]" strokeWidth={1.75} aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)] tabular-nums">
            {stats.deliveredOrders.toLocaleString("es-PE")}
          </strong>
          {" "}pedidos entregados esta semana en Pucallpa ·{" "}
          <strong className="text-[var(--text-primary)] tabular-nums">{stats.activeStores}</strong>
          {" "}bodegas activas
        </p>
      </div>
    );
  }

  // inline
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] px-3 py-1.5",
        className,
      )}
      aria-live="polite"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
      <span className="text-xs font-semibold text-[var(--text-primary)]">
        <span className="tabular-nums">{stats.deliveredOrders.toLocaleString("es-PE")}</span>
        {" "}pedidos esta semana
      </span>
      {loading && <span className="sr-only">cargando</span>}
    </div>
  );
}
