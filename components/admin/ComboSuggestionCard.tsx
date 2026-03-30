"use client";

import { useState, useEffect, useCallback } from "react";
import { ShoppingBag, ArrowRight, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import type { Sale } from "@/types/erp";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ComboSuggestion {
  products: [string, string];
  count: number;
}

// ── Co-occurrence analysis ─────────────────────────────────────────────────────

function analyzeCoOccurrence(sales: Sale[]): ComboSuggestion[] {
  const coMap: Record<string, number> = {};

  for (const sale of sales) {
    const items = sale.items ?? [];
    if (items.length < 2) continue;

    const names = items
      .map((i) => (i.name ?? "").trim())
      .filter(Boolean);

    for (let a = 0; a < names.length; a++) {
      for (let b = a + 1; b < names.length; b++) {
        const key = [names[a], names[b]].sort().join("|||");
        coMap[key] = (coMap[key] ?? 0) + 1;
      }
    }
  }

  return Object.entries(coMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => {
      const [p1, p2] = key.split("|||");
      return { products: [p1, p2] as [string, string], count };
    });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ComboSuggestionCard() {
  const router = useRouter();
  const [combos, setCombos] = useState<ComboSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAndAnalyze = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/sales?limit=100");
      if (!res.ok) throw new Error("Error al cargar ventas");

      const sales: Sale[] = await res.json();
      const suggestions = analyzeCoOccurrence(sales);
      setCombos(suggestions);
    } catch {
      setError("No se pudieron analizar las ventas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAndAnalyze();
  }, [fetchAndAnalyze]);

  const handleCreateCombo = () => {
    router.push("/admin/bundles");
  };

  return (
    <div className="rounded-lg border border-border bg-card dark:bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-[#0f766e]" />
          <span className="text-sm font-semibold text-foreground dark:text-foreground">
            Combos sugeridos
          </span>
        </div>
        <button
          onClick={fetchAndAnalyze}
          disabled={loading}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted dark:hover:bg-muted/50 transition-colors disabled:opacity-50"
          title="Actualizar"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Basado en productos comprados juntos en los ultimos 100 pedidos
      </p>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Analizando ventas...</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && combos.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay suficientes ventas con multiples productos para sugerir combos.
        </p>
      )}

      {/* Combo list */}
      {!loading && !error && combos.length > 0 && (
        <ul className="space-y-2">
          {combos.map((combo, idx) => (
            <li
              key={idx}
              className="flex items-center justify-between gap-3 rounded-md bg-muted dark:bg-muted/40 border border-border px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground dark:text-foreground truncate">
                  {combo.products[0]}
                </span>
                <span className="text-muted-foreground shrink-0">+</span>
                <span className="text-sm font-medium text-foreground dark:text-foreground truncate">
                  {combo.products[1]}
                </span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                {combo.count} {combo.count === 1 ? "vez" : "veces"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* CTA */}
      {!loading && combos.length > 0 && (
        <button
          onClick={handleCreateCombo}
          className={cn(
            "w-full flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            "bg-[#0f766e] text-white hover:bg-[#0d5f58]"
          )}
        >
          Crear combo
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
