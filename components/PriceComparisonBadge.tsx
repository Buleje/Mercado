"use client";

import { useCachedData } from "@/hooks/use-cached-data";
import { TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface PriceComparisonBadgeProps {
  productId: number;
}

type ComparisonData = {
  myPrice: number;
  marketAverage: number;
  savings: number;
  savingsPercent: number;
  cheaperThanMarket: boolean;
  competitorCount: number;
};

/**
 * Shows a badge on the product page comparing our price to the market average.
 * Only renders when admin has configured competitor prices.
 * "Más barato que el mercado" or "Precio alineado al mercado".
 */
export default function PriceComparisonBadge({ productId }: PriceComparisonBadgeProps) {
  const { data } = useCachedData<{ comparison: ComparisonData | null }>(
    `price-comparison-${productId}`,
    async () => {
      const res = await fetch(`/api/price-comparison?productId=${productId}`);
      if (!res.ok) return { comparison: null };
      return res.json();
    },
    { staleTime: 15 * 60 * 1000, refetchOnFocus: false },
  );

  const comparison = data?.comparison;
  if (!comparison) return null;

  const { cheaperThanMarket, savingsPercent, marketAverage, competitorCount } = comparison;

  // Only show if there's a meaningful difference (>2%)
  if (Math.abs(savingsPercent) < 2) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold border",
        cheaperThanMarket
          ? "bg-emerald-50 dark:bg-emerald-900/15 border-emerald-200 dark:border-[var(--data-success-500)]/40 text-[var(--data-success-700)] dark:text-emerald-400"
          : "bg-emerald-50 dark:bg-emerald-900/15 border-emerald-200 dark:border-[var(--data-success-500)]/40 text-[var(--data-success-700)] dark:text-emerald-400"
      )}
    >
      {cheaperThanMarket ? (
        <>
          <TrendingDown className="h-4 w-4 shrink-0" />
          <span>
            <strong>{Math.abs(savingsPercent).toFixed(0)}% más barato</strong> que el promedio del mercado
            <span className="text-muted font-normal ml-1">(S/{marketAverage.toFixed(2)} en {competitorCount} tienda{competitorCount > 1 ? "s" : ""})</span>
          </span>
        </>
      ) : (
        <>
          <TrendingUp className="h-4 w-4 shrink-0" />
          <span>
            Precio de mercado: S/{marketAverage.toFixed(2)}
            <span className="text-muted font-normal ml-1">(basado en {competitorCount} tienda{competitorCount > 1 ? "s" : ""})</span>
          </span>
        </>
      )}
    </div>
  );
}
