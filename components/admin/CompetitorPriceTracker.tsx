"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown, Minus, Search, BarChart3 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Competitor = {
  id: string;
  name: string;
};

type ProductPrice = {
  productId: string;
  productName: string;
  myPrice: number;
  prices: Record<string, number | null>; // competitorId → price
};

type TrackerData = {
  competitors: Competitor[];
  products: ProductPrice[];
};

// ── Storage ───────────────────────────────────────────────────────────────────

const LS_KEY = "buleje-competitor-prices";

function loadData(): TrackerData {
  if (typeof window === "undefined") return { competitors: [], products: [] };
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as TrackerData) : { competitors: [], products: [] };
  } catch { return { competitors: [], products: [] }; }
}

function saveData(data: TrackerData) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function diffPercent(myPrice: number, competitorPrice: number): { value: number; label: string; cheaper: boolean } {
  if (myPrice === 0 || competitorPrice === 0) return { value: 0, label: "–", cheaper: true };
  const diff = ((competitorPrice - myPrice) / myPrice) * 100;
  return {
    value: diff,
    label: `${diff > 0 ? "+" : ""}${diff.toFixed(0)}%`,
    cheaper: diff >= 0, // positive = competitor is more expensive = I'm cheaper
  };
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CompetitorPriceTracker() {
  const [data, setData] = useState<TrackerData>({ competitors: [], products: [] });
  const [newCompetitor, setNewCompetitor] = useState("");
  const [newProduct, setNewProduct] = useState("");
  const [newMyPrice, setNewMyPrice] = useState("");
  const [search, setSearch] = useState("");
  const [editingCell, setEditingCell] = useState<{ productId: string; competitorId: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    setData(loadData());
  }, []);

  const persist = useCallback((next: TrackerData) => {
    setData(next);
    saveData(next);
  }, []);

  // Add competitor
  const addCompetitor = useCallback(() => {
    if (!newCompetitor.trim()) return;
    const competitor: Competitor = { id: `comp-${Date.now()}`, name: newCompetitor.trim() };
    persist({ ...data, competitors: [...data.competitors, competitor] });
    setNewCompetitor("");
  }, [newCompetitor, data, persist]);

  // Remove competitor
  const removeCompetitor = useCallback((id: string) => {
    const updated = {
      competitors: data.competitors.filter(c => c.id !== id),
      products: data.products.map(p => {
        const prices = { ...p.prices };
        delete prices[id];
        return { ...p, prices };
      }),
    };
    persist(updated);
  }, [data, persist]);

  // Add product
  const addProduct = useCallback(() => {
    if (!newProduct.trim()) return;
    const product: ProductPrice = {
      productId: `prod-${Date.now()}`,
      productName: newProduct.trim(),
      myPrice: parseFloat(newMyPrice) || 0,
      prices: {},
    };
    persist({ ...data, products: [...data.products, product] });
    setNewProduct("");
    setNewMyPrice("");
  }, [newProduct, newMyPrice, data, persist]);

  // Remove product
  const removeProduct = useCallback((id: string) => {
    persist({ ...data, products: data.products.filter(p => p.productId !== id) });
  }, [data, persist]);

  // Update competitor price
  const updatePrice = useCallback((productId: string, competitorId: string, price: number | null) => {
    const updated = {
      ...data,
      products: data.products.map(p =>
        p.productId === productId
          ? { ...p, prices: { ...p.prices, [competitorId]: price } }
          : p
      ),
    };
    persist(updated);
    setEditingCell(null);
  }, [data, persist]);

  // Update my price
  const updateMyPrice = useCallback((productId: string, price: number) => {
    const updated = {
      ...data,
      products: data.products.map(p =>
        p.productId === productId ? { ...p, myPrice: price } : p
      ),
    };
    persist(updated);
    setEditingCell(null);
  }, [data, persist]);

  // Filtered products
  const filtered = useMemo(() => {
    if (!search.trim()) return data.products;
    const s = search.toLowerCase();
    return data.products.filter(p => p.productName.toLowerCase().includes(s));
  }, [data.products, search]);

  // Insights
  const insights = useMemo(() => {
    let cheaperCount = 0;
    let totalCompared = 0;
    let bestOpportunity: { name: string; gap: number } | null = null;

    for (const product of data.products) {
      for (const comp of data.competitors) {
        const compPrice = product.prices[comp.id];
        if (compPrice == null || compPrice === 0 || product.myPrice === 0) continue;
        totalCompared++;
        if (product.myPrice < compPrice) cheaperCount++;
        const gap = compPrice - product.myPrice;
        if (gap > 0 && (!bestOpportunity || gap > bestOpportunity.gap)) {
          bestOpportunity = { name: product.productName, gap };
        }
      }
    }

    return { cheaperCount, totalCompared, bestOpportunity };
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary text-white flex items-center justify-center ">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <SectionTitle className="text-lg font-bold text-[var(--text-primary)]">Tracker de Competencia</SectionTitle>
          <p className="text-xs text-[var(--text-tertiary)]">
            {data.competitors.length} competidores · {data.products.length} productos
          </p>
        </div>
      </div>

      {/* Insights */}
      {insights.totalCompared > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-3">
            <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-semibold">
              <TrendingUp className="inline h-3.5 w-3.5 mr-1" />
              Eres más barato en {insights.cheaperCount} de {insights.totalCompared} comparaciones
            </p>
          </div>
          {insights.bestOpportunity && (
            <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] rounded-xl p-3">
              <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] font-semibold">
                Oportunidad: puedes subir &quot;{insights.bestOpportunity.name}&quot; S/{insights.bestOpportunity.gap.toFixed(2)} y seguir competitivo
              </p>
            </div>
          )}
        </div>
      )}

      {/* IDEA 5: Sugerencia de Precio Inteligente */}
      {data.products.length > 0 && data.competitors.length > 0 && (() => {
        const suggestions = data.products.map(product => {
          const compPrices = data.competitors
            .map(c => product.prices[c.id])
            .filter((p): p is number => p != null && p > 0);
          if (compPrices.length === 0) return null;
          const avg = compPrices.reduce((s, p) => s + p, 0) / compPrices.length;
          const diff = product.myPrice - avg;
          const sugerido = Math.max(0, avg - 0.50);
          // Estimacion de ganancia/ahorro mensual (asumiendo 30 unidades/mes promedio)
          const unitsMes = 30;
          const gananciaExtra = diff < 0 ? (sugerido - product.myPrice) * unitsMes : 0;
          return {
            ...product,
            avg,
            diff,
            sugerido,
            gananciaExtra,
            status: diff > 1 ? "caro" as const : diff < -1 ? "barato" as const : "alineado" as const,
          };
        }).filter(Boolean);

        const caros = suggestions.filter(s => s?.status === "caro");
        const baratos = suggestions.filter(s => s?.status === "barato");

        if (suggestions.length === 0) return null;
        return (
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
            <p className="text-xs font-bold text-[var(--text-primary)] mb-3 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              Sugerencia de Precio Inteligente
            </p>
            <div className="space-y-2">
              {suggestions.slice(0, 6).map(s => {
                if (!s) return null;
                return (
                  <div key={s.productId} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-surface/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{s.productName}</p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">
                        Mi precio: S/{s.myPrice.toFixed(2)} · Promedio: S/{s.avg.toFixed(2)}
                      </p>
                    </div>
                    {s.status === "caro" && (
                      <div className="text-right shrink-0">
                        <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-500)]">S/{Math.abs(s.diff).toFixed(2)} mas caro</p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Sugerido: S/{s.sugerido.toFixed(2)}</p>
                      </div>
                    )}
                    {s.status === "barato" && (
                      <div className="text-right shrink-0">
                        <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-500)]">S/{Math.abs(s.diff).toFixed(2)} mas barato</p>
                        {s.gananciaExtra > 0 && <p className="text-[length:var(--ts-2xs)] text-[var(--data-success-500)]">Puedes subir a S/{s.sugerido.toFixed(2)} (+S/{s.gananciaExtra.toFixed(0)}/mes)</p>}
                      </div>
                    )}
                    {s.status === "alineado" && (
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">Alineado</span>
                    )}
                    {s.status !== "alineado" && (
                      <button
                        onClick={() => updateMyPrice(s.productId, s.sugerido)}
                        className="shrink-0 px-2 py-1 rounded-lg bg-primary text-white text-[length:var(--ts-2xs)] font-bold hover:bg-primary-dark transition-colors"
                      >
                        Ajustar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {(caros.length > 0 || baratos.length > 0) && (
              <div className="mt-3 pt-2 border-t border-[var(--rule-soft)] dark:border-card-border flex gap-3 text-[length:var(--ts-2xs)]">
                {caros.length > 0 && <span className="text-[var(--data-warning-500)] font-bold">{caros.length} productos mas caros que la competencia</span>}
                {baratos.length > 0 && <span className="text-[var(--data-success-500)] font-bold">{baratos.length} con margen para subir</span>}
              </div>
            )}
          </div>
        );
      })()}

      {/* Add competitor */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3">
        <p className="text-xs font-bold text-[var(--text-tertiary)] mb-2">Agregar competidor</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newCompetitor}
            onChange={e => setNewCompetitor(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addCompetitor()}
            placeholder='Ej: "Bodega Pérez", "Market Plaza"'
            className="flex-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={addCompetitor}
            disabled={!newCompetitor.trim()}
            className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {data.competitors.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {data.competitors.map(c => (
              <span key={c.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-surface text-xs font-medium text-[var(--text-secondary)]">
                {c.name}
                <button onClick={() => removeCompetitor(c.id)} className="text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors">
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Add product */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3">
        <p className="text-xs font-bold text-[var(--text-tertiary)] mb-2">Agregar producto a comparar</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newProduct}
            onChange={e => setNewProduct(e.target.value)}
            placeholder="Nombre del producto"
            className="flex-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <input
            type="number"
            value={newMyPrice}
            onChange={e => setNewMyPrice(e.target.value)}
            placeholder="Mi precio"
            step="0.10"
            className="w-24 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            onClick={addProduct}
            disabled={!newProduct.trim()}
            className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      {data.products.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      )}

      {/* Price comparison table */}
      {filtered.length > 0 && data.competitors.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] dark:border-card-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-surface">
                <th className="text-left px-3 py-2.5 text-xs font-bold text-[var(--text-tertiary)]">Producto</th>
                <th className="text-right px-3 py-2.5 text-xs font-bold text-primary">Mi precio</th>
                {data.competitors.map(c => (
                  <th key={c.id} className="text-right px-3 py-2.5 text-xs font-bold text-[var(--text-tertiary)]">{c.name}</th>
                ))}
                <th className="text-center px-3 py-2.5 text-xs font-bold text-[var(--text-tertiary)] w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map(product => (
                <tr key={product.productId} className="hover:bg-gray-50/50 dark:hover:bg-surface/50 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-[var(--text-primary)] text-xs">{product.productName}</td>
                  <td className="px-3 py-2.5 text-right">
                    {editingCell?.productId === product.productId && editingCell?.competitorId === "my" ? (
                      <input
                        type="number"
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={() => { updateMyPrice(product.productId, parseFloat(editValue) || 0); }}
                        onKeyDown={e => { if (e.key === "Enter") updateMyPrice(product.productId, parseFloat(editValue) || 0); }}
                        step="0.10"
                        className="w-20 px-2 py-1 rounded-lg border border-primary text-xs text-right bg-white dark:bg-card focus:outline-none text-[var(--text-primary)]"
                      />
                    ) : (
                      <button
                        onClick={() => { setEditingCell({ productId: product.productId, competitorId: "my" }); setEditValue(String(product.myPrice)); }}
                        className="text-xs font-bold text-primary hover:underline"
                      >
                        S/{product.myPrice.toFixed(2)}
                      </button>
                    )}
                  </td>
                  {data.competitors.map(comp => {
                    const compPrice = product.prices[comp.id];
                    const diff = compPrice != null ? diffPercent(product.myPrice, compPrice) : null;
                    const isEditing = editingCell?.productId === product.productId && editingCell?.competitorId === comp.id;

                    return (
                      <td key={comp.id} className="px-3 py-2.5 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => updatePrice(product.productId, comp.id, editValue ? parseFloat(editValue) : null)}
                            onKeyDown={e => { if (e.key === "Enter") updatePrice(product.productId, comp.id, editValue ? parseFloat(editValue) : null); }}
                            step="0.10"
                            className="w-20 px-2 py-1 rounded-lg border border-[var(--rule-base)] text-xs text-right bg-white dark:bg-card focus:outline-none text-[var(--text-primary)]"
                          />
                        ) : (
                          <button
                            onClick={() => { setEditingCell({ productId: product.productId, competitorId: comp.id }); setEditValue(compPrice != null ? String(compPrice) : ""); }}
                            className="text-xs text-[var(--text-secondary)] hover:underline"
                          >
                            {compPrice != null ? (
                              <span className="flex items-center justify-end gap-1">
                                S/{compPrice.toFixed(2)}
                                {diff && (
                                  <span className={cn(
                                    "text-[length:var(--ts-2xs)] font-bold",
                                    diff.cheaper ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]"
                                  )}>
                                    {diff.cheaper ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />}
                                    {diff.label}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
                                <Minus className="inline h-3 w-3" /> click
                              </span>
                            )}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2.5 text-center">
                    <button
                      onClick={() => removeProduct(product.productId)}
                      className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {data.products.length === 0 && data.competitors.length === 0 && (
        <div className="text-center py-12 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">Sin datos de competencia</p>
          <p className="text-xs mt-1">Agrega competidores y productos para empezar a comparar precios.</p>
        </div>
      )}

      {data.products.length === 0 && data.competitors.length > 0 && (
        <div className="text-center py-8 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
          <p className="text-sm">Agrega productos para comparar precios con {data.competitors.map(c => c.name).join(", ")}.</p>
        </div>
      )}
    </div>
  );
}
