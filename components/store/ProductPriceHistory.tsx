"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type PricePoint = {
  date:  string;  // ISO date
  price: number;
};

type PriceHistoryResponse = {
  history?:      PricePoint[];
  currentPrice?: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "S/ " + n.toFixed(2);
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

function MiniChart({ points }: { points: PricePoint[] }) {
  if (points.length === 0) return null;

  const prices = points.map(p => p.price);
  const min    = Math.min(...prices);
  const max    = Math.max(...prices);
  const range  = max - min || 1;

  // Show at most 15 bars so they fit
  const visible = points.length > 15 ? points.slice(-15) : points;

  return (
    <div className="flex items-end gap-0.5 h-12" aria-hidden="true">
      {visible.map((p, i) => {
        const heightPct = ((p.price - min) / range) * 100;
        const isLast    = i === visible.length - 1;
        const isMin     = p.price === min;
        const isMax     = p.price === max;
        return (
          <div
            key={p.date + i}
            className="relative flex-1 group"
            title={`${dayLabel(p.date)}: ${fmt(p.price)}`}
          >
            <div
              className={cn(
                "w-full rounded-t-sm transition-all",
                isLast  ? "bg-[var(--accent)]" :
                isMax   ? "bg-red-400 dark:bg-[var(--data-error-500)]" :
                isMin   ? "bg-emerald-400 dark:bg-[var(--data-success-500)]" :
                "bg-[var(--rule-soft)] dark:bg-gray-700"
              )}
              style={{ height: `${Math.max(heightPct, 8)}%` }}
            />
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 dark:bg-gray-900 text-white text-[length:var(--ts-2xs)] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {fmt(p.price)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ProductPriceHistoryProps {
  productId: number;
}

export default function ProductPriceHistory({ productId }: ProductPriceHistoryProps) {
  const [history, setHistory]         = useState<PricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    setError(false);

    fetch(`/api/products/${productId}/price-history`)
      .then(res => {
        if (!res.ok) throw new Error("Error fetching price history");
        return res.json() as Promise<PriceHistoryResponse>;
      })
      .then(data => {
        setHistory(data.history ?? []);
        setCurrentPrice(data.currentPrice ?? null);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-600 py-2">
        <div className="w-3 h-3 border-2 border-[var(--rule-base)] dark:border-gray-600 border-t-[var(--accent)] rounded-full animate-spin" />
        Cargando historial...
      </div>
    );
  }

  if (error || (history.length === 0 && currentPrice === null)) {
    return null;
  }

  // Only current price, no history
  if (history.length === 0 && currentPrice !== null) {
    return (
      <p className="text-xs text-[var(--text-tertiary)]">
        Precio actual: {fmt(currentPrice)}
      </p>
    );
  }

  const oldest      = history[0];
  const monthAgoStr = oldest ? `Hace 1 mes costaba ${fmt(oldest.price)}` : null;

  const currentPriceDisplay = currentPrice ?? history[history.length - 1]?.price;
  const firstPrice          = history[0]?.price;
  const priceDiff           = firstPrice !== undefined && currentPriceDisplay !== undefined
    ? currentPriceDisplay - firstPrice
    : null;

  return (
    <div className="space-y-2 py-1">
      {/* Chart */}
      <MiniChart points={history} />

      {/* Legend */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {monthAgoStr && (
          <p className="text-xs text-[var(--text-tertiary)]">{monthAgoStr}</p>
        )}
        {priceDiff !== null && Math.abs(priceDiff) > 0.01 && (
          <span
            className={cn(
              "text-xs font-medium px-1.5 py-0.5 rounded-md",
              priceDiff > 0
                ? "bg-red-100 text-[var(--data-error-600)] dark:bg-red-900/30 dark:text-red-400"
                : "bg-emerald-100 text-[var(--data-success-600)] dark:bg-emerald-900/30 dark:text-emerald-400"
            )}
          >
            {priceDiff > 0 ? "+" : ""}{fmt(Math.abs(priceDiff))} vs hace 30 dias
          </span>
        )}
      </div>

      {/* Axis labels */}
      {history.length >= 2 && (
        <div className="flex justify-between text-[length:var(--ts-2xs)] text-gray-300 dark:text-gray-600">
          <span>{dayLabel(history[0].date)}</span>
          <span>{dayLabel(history[history.length - 1].date)}</span>
        </div>
      )}
    </div>
  );
}
