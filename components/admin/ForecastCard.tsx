"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
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
    alta: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
    media: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
    baja: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };

  const TrendIcon =
    result?.trend === "subiendo" ? TrendingUp :
    result?.trend === "bajando" ? TrendingDown : Minus;

  const trendColor =
    result?.trend === "subiendo" ? "text-emerald-600 dark:text-emerald-400" :
    result?.trend === "bajando" ? "text-red-500 dark:text-red-400" :
    "text-gray-400 dark:text-muted";

  const trendLabel: Record<string, string> = {
    subiendo: "Tendencia al alza",
    bajando: "Tendencia a la baja",
    estable: "Tendencia estable",
  };

  return (
    <div className={cn(
      "bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5",
      className,
    )}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">
          Prediccion de la semana
        </h3>
        {result && (
          <span className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-full",
            confidenceStyle[result.confidence],
          )}>
            Confianza {result.confidence}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-[#0f766e]" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <p className="text-sm text-gray-400 dark:text-muted py-4 text-center">
          No se pudo calcular la prediccion.
        </p>
      )}

      {/* Result */}
      {!loading && result && (
        <div className="space-y-4">
          {/* Revenue headline */}
          <div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground">
              {formatCurrency(result.predictedRevenue)}
            </p>
            <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
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
                        className="absolute bottom-0 left-0 right-0 rounded-t-sm bg-[#0f766e]/70 dark:bg-emerald-600/70 transition-all duration-500"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-semibold text-gray-400 dark:text-muted">
                      {day.dayName.slice(0, 2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Best / Worst day */}
          <div className="flex gap-3">
            <div className="flex-1 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mb-0.5">
                Mejor dia
              </p>
              <p className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
                {result.bestDay}
              </p>
            </div>
            <div className="flex-1 bg-red-50 dark:bg-red-950/20 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-red-500 dark:text-red-400 font-semibold mb-0.5">
                Peor dia
              </p>
              <p className="text-sm font-extrabold text-red-600 dark:text-red-300">
                {result.worstDay}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
