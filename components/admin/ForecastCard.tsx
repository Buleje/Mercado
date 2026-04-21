"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Loader2 } from "@buleje/design-system/icons";
import { cn, formatCurrency } from "@/lib/utils";
import { calculateForecast, type ForecastResult } from "@/lib/forecasting";

interface Props {
  className?: string;
}

export default function ForecastCard({ className }: Props) {
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch("/api/sales");
        if (!res.ok) throw new Error("error");
        const raw = await res.json();
        // La API devuelve array directo o { data: [] }
        const sales = Array.isArray(raw) ? raw : (raw.data ?? []);
        if (!cancelled) {
          setResult(calculateForecast(sales));
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const maxRev = result
    ? Math.max(...result.dailyBreakdown.map((d) => d.revenue), 1)
    : 1;

  const confidenceStyle: Record<string, string> = {
    alta: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
    media: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-yellow-950/40 dark:text-[var(--data-warning)]",
    baja: "bg-gray-100 text-[var(--text-secondary)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]",
  };

  const TrendIcon =
    result?.trend === "subiendo" ? TrendingUp :
    result?.trend === "bajando" ? TrendingDown : Minus;

  const trendColor =
    result?.trend === "subiendo" ? "text-[var(--data-success)] dark:text-[var(--data-success)]" :
    result?.trend === "bajando" ? "text-[var(--data-error)] dark:text-[var(--data-error)]" :
    "text-[var(--text-tertiary)] dark:text-muted";

  const trendLabel: Record<string, string> = {
    subiendo: "Tendencia al alza",
    bajando: "Tendencia a la baja",
    estable: "Tendencia estable",
  };

  return (
    <div className={cn(
      "bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-5",
      className,
    )}>
      <div className="flex items-center justify-between mb-4">
        <CardTitle className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
          Prediccion de la semana
        </CardTitle>
        {result && (
          <span className={cn(
            "text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full",
            confidenceStyle[result.confidence],
          )}>
            Confianza {result.confidence}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <LoadingState />
      )}

      {/* Error */}
      {!loading && error && (
        <p className="text-sm text-[var(--text-tertiary)] dark:text-muted py-4 text-center">
          No se pudo calcular la prediccion.
        </p>
      )}

      {/* Result */}
      {!loading && result && (
        <div className="space-y-6">
          {/* Revenue headline */}
          <div>
            <p className="text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground">
              {formatCurrency(result.predictedRevenue)}
            </p>
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">
              estimado en ventas los próximos 7 días
            </p>
          </div>

          {/* Trend + days */}
          <div className="flex items-center gap-4 text-xs">
            <div className={cn("flex items-center gap-1 font-semibold", trendColor)}>
              <TrendIcon className="w-3.5 h-3.5" />
              {trendLabel[result.trend]}
            </div>
          </div>

          {/* Mini bar chart — 7 días */}
          <div>
            <div className="flex items-end gap-1.5 h-16">
              {result.dailyBreakdown.map((day) => {
                const pct = maxRev > 0 ? (day.revenue / maxRev) * 100 : 0;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full relative" style={{ height: "48px" }}>
                      <div
                        className="absolute bottom-0 left-0 right-0 rounded-t-sm bg-primary/70 dark:bg-[var(--accent-soft)] transition-all duration-[var(--dur-slow)]"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                    <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)] dark:text-muted">
                      {day.dayName.slice(0, 2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Best / Worst day */}
          <div className="flex gap-3">
            <div className="flex-1 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-xl p-2.5 text-center">
              <p className="text-[length:var(--ts-2xs)] text-[var(--data-success)] dark:text-[var(--data-success)] font-semibold mb-0.5">
                Mejor dia
              </p>
              <p className="text-sm font-extrabold text-[var(--data-success)] dark:text-[var(--data-success)]">
                {result.bestDay}
              </p>
            </div>
            <div className="flex-1 bg-[var(--data-error-50)] dark:bg-red-950/20 rounded-xl p-2.5 text-center">
              <p className="text-[length:var(--ts-2xs)] text-[var(--data-error)] dark:text-[var(--data-error)] font-semibold mb-0.5">
                Peor dia
              </p>
              <p className="text-sm font-extrabold text-[var(--data-error)] dark:text-[var(--data-error)]">
                {result.worstDay}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
