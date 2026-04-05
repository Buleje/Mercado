"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertCircle,
  BarChart2,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ──────────────────────────────────────────────────────────────────
type Suggestion = "Subir" | "Bajar" | "OK" | "Sin datos";

interface PricingProduct {
  id: string;
  productId: string;
  name: string;
  myPrice: number;
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  suggestion: Suggestion;
  competitorCount: number;
}

// ── Config de sugerencias ──────────────────────────────────────────────────
const SUGGESTION_CONFIG: Record<
  Suggestion,
  { label: string; badge: string; icon: React.ElementType; kpiColor: string }
> = {
  Subir:     { label: "Subir precio",  badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", icon: TrendingUp,   kpiColor: "text-emerald-600 dark:text-emerald-400" },
  Bajar:     { label: "Bajar precio",  badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",                 icon: TrendingDown, kpiColor: "text-red-600 dark:text-red-400" },
  OK:        { label: "Precio OK",     badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",                icon: Minus,        kpiColor: "text-gray-500 dark:text-gray-400" },
  "Sin datos": { label: "Sin datos",   badge: "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600",                icon: HelpCircle,   kpiColor: "text-gray-400" },
};

// ── Barra mini de comparación ──────────────────────────────────────────────
function PriceBar({
  myPrice,
  minPrice,
  maxPrice,
  avgPrice,
}: {
  myPrice: number;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
}) {
  if (maxPrice === minPrice) return null;
  const range = maxPrice - minPrice;
  const myPct  = Math.min(100, Math.max(0, ((myPrice - minPrice) / range) * 100));
  const avgPct = Math.min(100, Math.max(0, ((avgPrice - minPrice) / range) * 100));

  return (
    <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full w-full overflow-visible">
      {/* Barra promedio */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-gray-400 dark:bg-gray-500 rounded-full"
        style={{ left: `${avgPct}%` }}
        title={`Promedio: S/${avgPrice.toFixed(2)}`}
      />
      {/* Mi precio */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-[#00B4A6] dark:bg-[#00B4A6] rounded-full border-2 border-white dark:border-gray-900 shadow"
        style={{ left: `${myPct}%`, transform: "translate(-50%, -50%)" }}
        title={`Mi precio: S/${myPrice.toFixed(2)}`}
      />
    </div>
  );
}

// ── Gráfico de barras top 10 ───────────────────────────────────────────────
function PriceComparisonChart({ products }: { products: PricingProduct[] }) {
  const withData = products
    .filter((p) => p.avgPrice !== null)
    .slice(0, 10);

  if (withData.length === 0) return null;

  const allValues = withData.flatMap((p) => [p.myPrice, p.avgPrice!]);
  const maxVal = Math.max(...allValues) * 1.1;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <BarChart2 className="h-4 w-4 text-[#00B4A6]" />
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
          Mi precio vs promedio (top {withData.length})
        </h3>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#00B4A6]" /> Mi precio
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-[#f4a261]" /> Promedio
          </span>
        </div>
      </div>
      <div className="space-y-3">
        {withData.map((p) => (
          <div key={p.id} className="space-y-1">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
              {p.name}
            </p>
            <div className="flex items-center gap-2">
              {/* Mi precio */}
              <div className="flex-1 flex items-center gap-1">
                <div
                  className="h-5 bg-[#00B4A6] rounded-sm transition-all"
                  style={{ width: `${(p.myPrice / maxVal) * 100}%` }}
                />
                <span className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  S/{p.myPrice.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Promedio */}
              <div className="flex-1 flex items-center gap-1">
                <div
                  className="h-5 bg-[#f4a261] rounded-sm transition-all"
                  style={{ width: `${(p.avgPrice! / maxVal) * 100}%` }}
                />
                <span className="text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  S/{p.avgPrice!.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────
export default function CompetitivePricingTab() {
  const [products, setProducts] = useState<PricingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pricing/competitive");
      if (!res.ok) throw new Error("Error al cargar análisis");
      const data = await res.json();
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch {
      setError("No se pudo cargar el análisis de precios competitivos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleApplySuggestion(product: PricingProduct) {
    if (!product.avgPrice) return;
    const newPrice =
      product.suggestion === "Subir"
        ? Math.ceil(product.avgPrice * 100) / 100
        : Math.floor(product.avgPrice * 100) / 100;

    if (!confirm(`¿Cambiar precio de "${product.name}" a S/${newPrice.toFixed(2)}?`)) return;

    setApplying(product.id);
    try {
      const res = await fetch(`/api/products/${product.productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retailPrice: newPrice }),
      });
      if (!res.ok) throw new Error("Error al actualizar precio");
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id
            ? { ...p, myPrice: newPrice, suggestion: "OK" }
            : p
        )
      );
    } catch {
      alert("No se pudo actualizar el precio. Intenta nuevamente.");
    } finally {
      setApplying(null);
    }
  }

  // KPIs calculados
  const countBelow   = products.filter((p) => p.suggestion === "Subir").length;
  const countAbove   = products.filter((p) => p.suggestion === "Bajar").length;
  const opportunityIncome = products
    .filter((p) => p.suggestion === "Subir" && p.avgPrice)
    .reduce((sum, p) => sum + (p.avgPrice! - p.myPrice), 0);

  // ── Estados obligatorios ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
          ))}
        </div>
        <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl text-sm text-red-700 dark:text-red-400">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error}
        <button type="button" onClick={load} className="ml-auto text-xs underline font-bold">
          Reintentar
        </button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-gray-600">
        <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-semibold text-sm">Sin productos para analizar</p>
        <p className="text-xs mt-1">Activa productos en el marketplace para ver el análisis</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Por debajo del mercado
          </p>
          <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
            {countBelow}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            productos con precio bajo
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Por encima del mercado
          </p>
          <p className="text-3xl font-extrabold text-red-600 dark:text-red-400 mt-1">
            {countAbove}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            productos con precio alto
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Oportunidad estimada
          </p>
          <p className="text-3xl font-extrabold text-[#00B4A6] font-mono mt-1">
            S/{opportunityIncome.toFixed(2)}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            ingreso extra si subes precios bajos
          </p>
        </div>
      </div>

      {/* Gráfico */}
      <PriceComparisonChart products={products} />

      {/* Acciones y tabla */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
          Análisis por producto ({products.length})
        </h3>
        <button
          type="button"
          onClick={load}
          className="p-1.5 rounded-lg text-gray-400 hover:text-[#00B4A6] hover:bg-[#00B4A6]/10 transition-colors"
          title="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Producto
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  Mi precio
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">
                  Promedio
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">
                  Mín
                </th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">
                  Máx
                </th>
                <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">
                  Competidores
                </th>
                <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Sugerencia
                </th>
                <th className="text-center px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {products.map((p) => {
                const cfg = SUGGESTION_CONFIG[p.suggestion];
                const SugIcon = cfg.icon;
                const canApply =
                  p.suggestion !== "OK" && p.suggestion !== "Sin datos" && p.avgPrice !== null;

                return (
                  <tr
                    key={p.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900 dark:text-white leading-tight max-w-[180px] truncate">
                        {p.name}
                      </p>
                      {/* Barra visual mobile */}
                      {p.avgPrice && p.minPrice !== null && p.maxPrice !== null && (
                        <div className="mt-1.5 sm:hidden">
                          <PriceBar
                            myPrice={p.myPrice}
                            minPrice={p.minPrice}
                            maxPrice={p.maxPrice}
                            avgPrice={p.avgPrice}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-gray-900 dark:text-white whitespace-nowrap">
                      S/{p.myPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-600 dark:text-gray-400 hidden sm:table-cell whitespace-nowrap">
                      {p.avgPrice !== null ? (
                        <div>
                          <span>S/{p.avgPrice.toFixed(2)}</span>
                          {p.minPrice !== null && p.maxPrice !== null && (
                            <div className="mt-1">
                              <PriceBar
                                myPrice={p.myPrice}
                                minPrice={p.minPrice}
                                maxPrice={p.maxPrice}
                                avgPrice={p.avgPrice}
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500 dark:text-gray-400 hidden md:table-cell whitespace-nowrap">
                      {p.minPrice !== null ? `S/${p.minPrice.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500 dark:text-gray-400 hidden md:table-cell whitespace-nowrap">
                      {p.maxPrice !== null ? `S/${p.maxPrice.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400 hidden sm:table-cell">
                      {p.competitorCount}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap",
                          cfg.badge
                        )}
                      >
                        <SugIcon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {canApply ? (
                        <button
                          type="button"
                          disabled={applying === p.id}
                          onClick={() => handleApplySuggestion(p)}
                          className="
                            inline-flex items-center gap-1 px-3 py-1.5
                            rounded-lg text-xs font-bold
                            bg-[#00B4A6] hover:bg-[#009690]
                            text-white transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed
                            min-h-[32px]
                          "
                        >
                          {applying === p.id ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : null}
                          Aplicar
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
