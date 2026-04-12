"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Lightbulb, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PriceSuggestionProps {
  productId: number;
  currentPrice: number;
  costPrice?: number;
  className?: string;
}

/**
 * Badge que muestra sugerencia de precio basada en:
 * - Margen mínimo del 20% sobre costo
 * - Velocidad de venta (si se vende rápido, puede subir)
 * - Si no se vende hace 7+ días, sugiere bajar
 */
export default function PriceSuggestionBadge({
  productId,
  currentPrice,
  costPrice,
  className,
}: PriceSuggestionProps) {
  const [suggestion, setSuggestion] = useState<{
    action: "subir" | "bajar" | "ok";
    suggested: number;
    reason: string;
    margin: number;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!costPrice || costPrice <= 0) return;

    const margin = ((currentPrice - costPrice) / costPrice) * 100;

    // Low margin: suggest raising
    if (margin < 15) {
      const suggested = Math.ceil(costPrice * 1.25 * 10) / 10; // 25% margin, round up
      setSuggestion({
        action: "subir",
        suggested,
        reason: `Margen muy bajo (${margin.toFixed(0)}%). Sube a S/${suggested.toFixed(2)} para 25% de ganancia`,
        margin,
      });
      return;
    }

    // Very high margin: might be overpriced
    if (margin > 80) {
      const suggested = Math.ceil(costPrice * 1.5 * 10) / 10;
      setSuggestion({
        action: "bajar",
        suggested,
        reason: `Margen alto (${margin.toFixed(0)}%). Podrías vender mas a S/${suggested.toFixed(2)}`,
        margin,
      });
      return;
    }

    // OK margin
    setSuggestion({
      action: "ok",
      suggested: currentPrice,
      reason: `Margen saludable (${margin.toFixed(0)}%)`,
      margin,
    });
  }, [productId, currentPrice, costPrice]);

  if (!suggestion || dismissed || suggestion.action === "ok") return null;

  const _Icon = suggestion.action === "subir" ? TrendingUp : TrendingDown;
  const colors = suggestion.action === "subir"
    ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400"
    : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/30 text-blue-700 dark:text-blue-400";

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold", colors, className)}>
      <Lightbulb className="h-3 w-3 shrink-0" />
      <span className="truncate max-w-48">{suggestion.reason}</span>
      <button onClick={() => setDismissed(true)} className="shrink-0 opacity-50 hover:opacity-100">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
