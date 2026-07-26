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

import { useCallback, useState } from "react";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { Truck } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface WeekStats {
  deliveredOrders: number;
  activeStores: number;
}

const POLL_MS = 5 * 60 * 1000;
// Fallback SOLO para evitar undefined antes del primer fetch — ya NO usamos
// los 1.247 / 28 hardcoded como social proof inflado. Si la DB devuelve
// menos del threshold (50 pedidos / 5 tiendas), ocultamos el counter
// completamente: mejor no mostrar nada que mostrar "3 pedidos esta semana"
// que se siente poco creíble.
const FALLBACK: WeekStats = { deliveredOrders: 0, activeStores: 0 };

// Thresholds — abajo de estos números, el counter NO renderiza nada.
const MIN_ORDERS_TO_SHOW = 50;
const MIN_STORES_TO_SHOW = 5;

interface Props {
  variant?: "footer" | "inline";
  className?: string;
}

export default function LiveOrderCounter({ variant = "inline", className }: Props) {
  const [stats, setStats] = useState<WeekStats>(FALLBACK);
  const [loading, setLoading] = useState(true);

  // perf audit: polling con guard de visibilidad (pausa en pestaña background).
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/marketplace/stats/week", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json() as WeekStats;
      setStats({
        deliveredOrders: Number(data.deliveredOrders ?? FALLBACK.deliveredOrders),
        activeStores: Number(data.activeStores ?? FALLBACK.activeStores),
      });
    } catch {
      // mantener fallback
    } finally {
      setLoading(false);
    }
  }, []);
  useVisiblePolling(load, POLL_MS);

  // Threshold guard: si los números reales son demasiado bajos, ocultar el
  // counter en vez de mostrar social proof anémico ("3 pedidos esta semana").
  // En cold-start (loading=true) tampoco mostramos hasta saber el dato real.
  if (loading) return null;
  if (stats.deliveredOrders < MIN_ORDERS_TO_SHOW) return null;

  if (variant === "footer") {
    return (
      <div className={cn("flex items-center justify-center gap-3 py-6 text-center", className)}>
        <Truck className="h-5 w-5 text-[var(--accent)]" strokeWidth={1.75} aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)] tabular-nums">
            {stats.deliveredOrders.toLocaleString("es-PE")}
          </strong>
          {" "}pedidos entregados esta semana en Ciudad Constitución
          {stats.activeStores >= MIN_STORES_TO_SHOW && (
            <>
              {" · "}
              <strong className="text-[var(--text-primary)] tabular-nums">
                {stats.activeStores}
              </strong>
              {" "}bodegas activas
            </>
          )}
        </p>
      </div>
    );
  }

  // inline
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-primary/10 dark:bg-primary/15 px-3 py-1.5",
        className,
      )}
      aria-live="polite"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
      <span className="text-xs font-semibold text-[var(--text-primary)]">
        <span className="tabular-nums">{stats.deliveredOrders.toLocaleString("es-PE")}</span>
        {" "}pedidos esta semana
      </span>
    </div>
  );
}
