"use client";

import { useEffect, useState, useCallback } from "react";
import { GitMerge, Plus, RefreshCw, ArrowRight, TrendingUp } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import ProductImage from "./ProductImage";

interface SaleItem {
  name?: string;
  price?: number;
  imageUrl?: string;
  image?: string;
}

interface SaleRecord {
  items?: SaleItem[];
}

interface ComboPair {
  a: string;
  b: string;
  priceA: number;
  priceB: number;
  imageA?: string;
  imageB?: string;
  count: number;
  confidence: number;
  totalSales: number;
}

function buildCombos(sales: SaleRecord[]): ComboPair[] {
  const coMap: Record<string, { count: number; pa: number; pb: number; ia?: string; ib?: string }> = {};
  const totalSales = Math.max(sales.length, 1);

  for (const sale of sales) {
    const items = (sale.items ?? []).filter((i) => (i.name ?? "").trim());
    if (items.length < 2) continue;
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const ia = items[a];
        const ib = items[b];
        const sorted = [
          { name: ia.name!, price: ia.price ?? 0, image: ia.imageUrl ?? ia.image },
          { name: ib.name!, price: ib.price ?? 0, image: ib.imageUrl ?? ib.image },
        ].sort((x, y) => x.name.localeCompare(y.name));
        const key = `${sorted[0].name}|||${sorted[1].name}`;
        const prev = coMap[key];
        coMap[key] = {
          count: (prev?.count ?? 0) + 1,
          pa: sorted[0].price || prev?.pa || 0,
          pb: sorted[1].price || prev?.pb || 0,
          ia: prev?.ia ?? sorted[0].image,
          ib: prev?.ib ?? sorted[1].image,
        };
      }
    }
  }

  return Object.entries(coMap)
    .sort((x, y) => y[1].count - x[1].count)
    .slice(0, 6)
    .map(([key, v]) => {
      const [a, b] = key.split("|||");
      return {
        a,
        b,
        priceA: v.pa,
        priceB: v.pb,
        imageA: v.ia,
        imageB: v.ib,
        count: v.count,
        confidence: Math.round((v.count / totalSales) * 100),
        totalSales,
      };
    });
}

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TabCombos() {
  const [combos, setCombos] = useState<ComboPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/sales?limit=200");
      if (!res.ok) throw new Error("err");
      const data = await res.json();
      setCombos(buildCombos(Array.isArray(data) ? data : []));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback((combo: ComboPair) => {
    window.location.href = `/admin/bundles?a=${encodeURIComponent(combo.a)}&b=${encodeURIComponent(combo.b)}`;
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-48 rounded-2xl bg-[var(--surface-sunken)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] p-6 text-center">
        <p className="text-sm font-bold text-[var(--data-error-500)]">No se pudieron cargar las ventas.</p>
        <button onClick={load} className="mt-2 text-xs font-bold text-[var(--data-error-500)] underline">
          Reintentar
        </button>
      </div>
    );
  }

  if (combos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--rule-base)] p-12 text-center">
        <GitMerge className="mx-auto mb-3 h-12 w-12 text-[var(--text-tertiary)]" />
        <p className="text-base font-bold text-[var(--text-primary)]">Sin combos aún</p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Necesitamos más ventas con varios productos para detectar combos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-extrabold text-[var(--text-primary)]">Combos detectados</p>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Productos comprados juntos en las últimas 200 ventas
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {combos.map((combo, idx) => {
          const fullPrice = combo.priceA + combo.priceB;
          const comboPrice = fullPrice * 0.9;
          const accent =
            combo.confidence >= 20
              ? "var(--data-success)"
              : combo.confidence >= 10
                ? "var(--data-info, #3b82f6)"
                : "var(--text-tertiary)";

          return (
            <div
              key={idx}
              className="group rounded-2xl border border-[var(--rule-base)] bg-white p-5 transition-shadow hover:shadow-md"
              style={{ ["--combo-accent" as string]: accent }}
            >
              {/* Header con badge confianza */}
              <div className="flex items-center justify-between mb-4">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: "color-mix(in oklab, var(--combo-accent) 12%, white)",
                    color: "var(--combo-accent)",
                  }}
                >
                  <TrendingUp className="h-3 w-3" />
                  {combo.confidence}% confianza
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] tabular-nums">
                  {combo.count} veces
                </span>
              </div>

              {/* Visual del combo */}
              <div className="flex items-center justify-center gap-3 py-2">
                <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                  <ProductImage name={combo.a} imageUrl={combo.imageA} size="lg" rounded="xl" />
                  <p className="text-xs font-bold text-[var(--text-primary)] text-center line-clamp-2 leading-tight">
                    {combo.a}
                  </p>
                  {combo.priceA > 0 && (
                    <p className="text-xs font-medium tabular-nums text-[var(--text-secondary)]">
                      {fmt(combo.priceA)}
                    </p>
                  )}
                </div>

                <div className="shrink-0 flex flex-col items-center">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)]">
                    <Plus className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={3} />
                  </span>
                </div>

                <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                  <ProductImage name={combo.b} imageUrl={combo.imageB} size="lg" rounded="xl" />
                  <p className="text-xs font-bold text-[var(--text-primary)] text-center line-clamp-2 leading-tight">
                    {combo.b}
                  </p>
                  {combo.priceB > 0 && (
                    <p className="text-xs font-medium tabular-nums text-[var(--text-secondary)]">
                      {fmt(combo.priceB)}
                    </p>
                  )}
                </div>
              </div>

              {/* Precio sugerido */}
              {fullPrice > 0 && (
                <div className="mt-4 flex items-end justify-between border-t border-[var(--rule-soft)] pt-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Precio combo (-10%)
                    </p>
                    <p className="text-2xl font-extrabold tabular-nums leading-none text-[var(--text-primary)]">
                      {fmt(comboPrice)}
                    </p>
                    <p className="text-xs font-medium text-[var(--text-tertiary)] line-through tabular-nums mt-0.5">
                      {fmt(fullPrice)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCreate(combo)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-2 text-xs font-bold text-white",
                      "hover:bg-[var(--text-secondary)] transition-colors",
                    )}
                  >
                    Crear combo
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
