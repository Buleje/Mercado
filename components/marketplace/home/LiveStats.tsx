"use client";

/**
 * LiveStats — barra de social proof + actividad en vivo.
 *
 * Muestra 3-4 contadores animados (NumberFlow on scroll) con datos como
 * "X pedidos hoy · Y bodegas activas · Z minutos promedio".
 *
 * Psicologia: prueba social en tiempo real — ver que "1.247 vecinos
 * compraron hoy" genera urgencia y confianza.
 *
 * Datos hoy: hardcoded mock con leve randomizacion para sentir vida.
 * Cuando haya endpoint real `/api/marketplace/live-stats`, reemplazar.
 */

import { useEffect, useState } from "react";
import NumberFlow from "@number-flow/react";
import { Truck, Store, Package, Users, type LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type Stat = {
  Icon: LucideIcon;
  value: number;
  label: string;
  suffix?: string;
};

type ApiStats = {
  ordersToday: number;
  shoppersToday: number;
  activeStores: number;
  avgDeliveryMin: number;
};

function buildStats(api: ApiStats): Stat[] {
  return [
    { Icon: Package, value: api.ordersToday, label: "pedidos hoy" },
    { Icon: Users, value: api.shoppersToday, label: "vecinos comprando" },
    { Icon: Store, value: api.activeStores, label: "bodegas activas" },
    { Icon: Truck, value: api.avgDeliveryMin, label: "min promedio", suffix: "" },
  ];
}

export default function LiveStats() {
  const [stats, setStats] = useState<Stat[]>(() =>
    buildStats({ ordersToday: 0, shoppersToday: 0, activeStores: 0, avgDeliveryMin: 0 }),
  );

  useEffect(() => {
    let cancelled = false;
    let live: ReturnType<typeof setInterval> | null = null;

    const fetchStats = async () => {
      try {
        const res = await fetch("/api/marketplace/live-stats", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.data) setStats(buildStats(json.data));
      } catch {
        /* silent */
      }
    };

    // Initial fetch + cada 30s para sensación live (server cachea 60s)
    fetchStats();
    live = setInterval(fetchStats, 30_000);

    return () => {
      cancelled = true;
      if (live) clearInterval(live);
    };
  }, []);

  return (
    <section
      aria-label="Estadisticas del marketplace en vivo"
      className="w-full py-4 sm:py-6"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            "rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
            "px-5 sm:px-8 py-4 sm:py-5",
            "grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6",
          )}
        >
          {stats.map((s, i) => {
            const Icon = s.Icon;
            return (
              <div key={i} className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-lg sm:text-xl font-black text-[var(--text-primary)] tabular-nums leading-none">
                    <NumberFlow value={s.value} format={{ useGrouping: true }} />
                    {s.suffix}
                  </p>
                  <p className="mt-0.5 text-[length:var(--ts-2xs)] sm:text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                    {s.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
