"use client";

import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertCircle,
  BarChart2,
  HelpCircle,
  DollarSign,
  Target,
} from "@buleje/design-system/icons";
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
  Subir:     { label: "Subir precio",  badge: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]", icon: TrendingUp,   kpiColor: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" },
  Bajar:     { label: "Bajar precio",  badge: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]",                 icon: TrendingDown, kpiColor: "text-[var(--data-error-600)] dark:text-red-400" },
  OK:        { label: "Precio OK",     badge: "bg-gray-100 text-[var(--text-secondary)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]",                icon: Minus,        kpiColor: "text-[var(--text-tertiary)]" },
  "Sin datos": { label: "Sin datos",   badge: "bg-gray-100 text-[var(--text-tertiary)] dark:bg-gray-800 dark:text-[var(--text-secondary)]",                icon: HelpCircle,   kpiColor: "text-[var(--text-tertiary)]" },
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
        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary dark:bg-primary rounded-full border-2 border-white dark:border-[var(--rule-base)] shadow"
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
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            <BarChart2 className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="font-display text-xl leading-tight">
              Mi precio vs promedio
            </CardTitle>
            <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
              Top {withData.length} productos con datos de competencia
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm font-bold">
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm bg-primary" />
            <span className="text-[var(--text-secondary)]">Mi precio</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm bg-[var(--secondary)]" />
            <span className="text-[var(--text-secondary)]">Promedio</span>
          </span>
        </div>
      </div>
      <div className="space-y-4">
        {withData.map((p) => (
          <div key={p.id} className="space-y-2">
            <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
              {p.name}
            </p>
            <div className="flex items-center gap-3">
              <div
                className="h-6 bg-primary rounded-md transition-all"
                style={{ width: `${(p.myPrice / maxVal) * 100}%` }}
              />
              <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)] whitespace-nowrap">
                S/{Number(p.myPrice).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="h-6 bg-[var(--secondary)] rounded-md transition-all"
                style={{ width: `${(p.avgPrice! / maxVal) * 100}%` }}
              />
              <span className="text-sm font-bold tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
                S/{p.avgPrice!.toFixed(2)}
              </span>
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
        headers: csrfHeaders({ "Content-Type": "application/json" }),
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
      <div className="space-y-6 animate-pulse">
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8">
          <div className="h-7 w-64 bg-[var(--surface-sunken)] rounded-lg mb-4" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-[var(--surface-sunken)] rounded-xl" />
            ))}
          </div>
        </div>
        <div className="h-64 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 px-5 py-4 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-xl">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--data-error-500)]/15 shrink-0">
          <AlertCircle className="h-4 w-4 text-[var(--data-error-500)]" />
        </span>
        <p className="text-sm font-bold text-[var(--data-error-500)] flex-1">{error}</p>
        <button
          type="button"
          onClick={load}
          className="text-sm font-bold text-[var(--data-error-500)] underline hover:no-underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-12 text-center shadow-sm">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-4">
          <BarChart2 className="h-8 w-8 text-[var(--text-tertiary)]" />
        </span>
        <p className="font-display text-xl font-extrabold text-[var(--text-primary)]">
          Sin productos para analizar
        </p>
        <p className="text-base text-[var(--text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
          Activá productos en el marketplace para ver el análisis competitivo de precios.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 1. Hero card con KPIs ──────────────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Target className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Precios competitivos
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-snug">
                Comparación de tus precios vs el promedio del mercado. {products.length} {products.length === 1 ? "producto analizado" : "productos analizados"}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Actualizar análisis
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
                <TrendingUp className="h-5 w-5 text-[var(--data-success-500)]" />
              </span>
            </div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Por debajo del mercado
            </p>
            <p className="text-3xl font-extrabold tabular-nums text-[var(--data-success-500)] leading-tight mt-2">
              {countBelow}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              {countBelow === 1 ? "producto con precio bajo" : "productos con precio bajo"}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--data-error-100)]">
                <TrendingDown className="h-5 w-5 text-[var(--data-error-500)]" />
              </span>
            </div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Por encima del mercado
            </p>
            <p className="text-3xl font-extrabold tabular-nums text-[var(--data-error-500)] leading-tight mt-2">
              {countAbove}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              {countAbove === 1 ? "producto con precio alto" : "productos con precio alto"}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </span>
            </div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Oportunidad estimada
            </p>
            <p className="text-3xl font-extrabold tabular-nums text-primary leading-tight mt-2">
              S/{opportunityIncome.toFixed(2)}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              Ingreso extra si subís los precios bajos
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. Gráfico comparativo ─────────────────────────────────── */}
      <PriceComparisonChart products={products} />

      {/* ── 3. Tabla análisis por producto ─────────────────────────── */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 sm:px-8 py-5 border-b border-[var(--rule-base)] flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <BarChart2 className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl leading-tight">
                Análisis por producto
              </CardTitle>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Sugerencia automática basada en precio promedio del mercado
              </p>
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-lg text-sm font-bold uppercase tracking-wider bg-[var(--surface-sunken)] text-[var(--text-tertiary)] tabular-nums shrink-0">
            {products.length} {products.length === 1 ? "producto" : "productos"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--surface-sunken)] border-b border-[var(--rule-base)]">
              <tr>
                <th className="text-left px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Producto</th>
                <th className="text-right px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] whitespace-nowrap">Mi precio</th>
                <th className="text-right px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden sm:table-cell">Promedio</th>
                <th className="text-right px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden md:table-cell">Mín</th>
                <th className="text-right px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden md:table-cell">Máx</th>
                <th className="text-center px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] hidden sm:table-cell">Competidores</th>
                <th className="text-center px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Sugerencia</th>
                <th className="text-center px-4 py-4 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {products.map((p) => {
                const cfg = SUGGESTION_CONFIG[p.suggestion];
                const SugIcon = cfg.icon;
                const canApply =
                  p.suggestion !== "OK" && p.suggestion !== "Sin datos" && p.avgPrice !== null;

                return (
                  <tr key={p.id} className="hover:bg-[var(--surface-sunken)] transition-colors">
                    <td className="px-4 py-4">
                      <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight max-w-[200px] truncate">
                        {p.name}
                      </p>
                      {p.avgPrice && p.minPrice !== null && p.maxPrice !== null && (
                        <div className="mt-2 sm:hidden">
                          <PriceBar
                            myPrice={p.myPrice}
                            minPrice={p.minPrice}
                            maxPrice={p.maxPrice}
                            avgPrice={p.avgPrice}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right text-base font-extrabold tabular-nums text-[var(--text-primary)] whitespace-nowrap">
                      S/{Number(p.myPrice).toFixed(2)}
                    </td>
                    <td className="px-4 py-4 text-right text-sm tabular-nums text-[var(--text-secondary)] hidden sm:table-cell whitespace-nowrap">
                      {p.avgPrice !== null ? (
                        <div>
                          <p className="font-bold">S/{Number(p.avgPrice).toFixed(2)}</p>
                          {p.minPrice !== null && p.maxPrice !== null && (
                            <div className="mt-2">
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
                        <span className="text-[var(--text-tertiary)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right text-sm tabular-nums text-[var(--text-tertiary)] hidden md:table-cell whitespace-nowrap">
                      {p.minPrice !== null ? `S/${Number(p.minPrice).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-4 text-right text-sm tabular-nums text-[var(--text-tertiary)] hidden md:table-cell whitespace-nowrap">
                      {p.maxPrice !== null ? `S/${Number(p.maxPrice).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-4 text-center text-sm font-bold text-[var(--text-secondary)] hidden sm:table-cell tabular-nums">
                      {p.competitorCount}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold whitespace-nowrap", cfg.badge)}>
                        <SugIcon className="h-3.5 w-3.5" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {canApply ? (
                        <button
                          type="button"
                          disabled={applying === p.id}
                          onClick={() => handleApplySuggestion(p)}
                          className="inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold bg-primary hover:bg-primary-dark text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-24 justify-center"
                        >
                          {applying === p.id && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                          Aplicar
                        </button>
                      ) : (
                        <span className="text-sm text-[var(--text-tertiary)] font-bold">—</span>
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
