"use client";

import { SectionTitle } from "@buleje/design-system";
import { useMemo, useState } from "react";
import { X, Search, ArrowUpDown, ArrowUp, ArrowDown, Package, AlertTriangle, TrendingUp, TrendingDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbProduct, DbInventoryMovement } from "@/lib/jsondb";
import { useScrollLock } from "@/hooks/use-scroll-lock";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  products: DbProduct[];
  movements: DbInventoryMovement[];
  onClose: () => void;
}

type SortKey = "name" | "stock" | "cost" | "margin" | "movement" | "price";
type SortDir = "asc" | "desc";

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeLastMovementDays(productId: number, movements: DbInventoryMovement[]): number | null {
  let latestTs = 0;
  for (const m of movements) {
    if (m.productId !== productId) continue;
    const ts = new Date(m.createdAt).getTime();
    if (ts > latestTs) latestTs = ts;
  }
  if (latestTs === 0) return null; // nunca tuvo movimiento
  return Math.floor((Date.now() - latestTs) / 86_400_000);
}

function computeMargin(product: DbProduct): { pct: number; soles: number } | null {
  const cost = product.costPrice ?? 0;
  const price = product.price ?? 0;
  if (cost <= 0 || price <= 0) return null;
  const soles = price - cost;
  const pct = (soles / price) * 100;
  return { pct, soles };
}

function computeSalesPerWeek(productId: number, movements: DbInventoryMovement[]): number {
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  let totalSold = 0;
  for (const m of movements) {
    if (m.productId !== productId) continue;
    const ts = new Date(m.createdAt).getTime();
    if (ts < thirtyDaysAgo) continue;
    const type = (m.type ?? "").toLowerCase();
    if (type === "venta" || type === "venta_online") {
      totalSold += Math.abs(m.quantity ?? 0);
    }
  }
  return totalSold / 4.3;
}

// ── Sort Icon ─────────────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ExpandedStockModal({ products, movements, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useScrollLock(true);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  // F5: pre-indexar movimientos por productId — evita O(n*m) cuadratico
  const movementsByProduct = useMemo(() => {
    const m = new Map<number, DbInventoryMovement[]>();
    for (const mv of movements) {
      const arr = m.get(mv.productId) ?? [];
      arr.push(mv);
      m.set(mv.productId, arr);
    }
    return m;
  }, [movements]);

  const enriched = useMemo(() => {
    return products
      .filter(p => p.active !== false)
      .map(p => {
        const productMovements = movementsByProduct.get(p.id) ?? [];
        const margin = computeMargin(p);
        const daysSinceMove = computeLastMovementDays(p.id, productMovements);
        const salesWeek = computeSalesPerWeek(p.id, productMovements);
        return { ...p, margin, daysSinceMove, salesWeek };
      });
  }, [products, movementsByProduct]);

  const filtered = useMemo(() => {
    let result = enriched;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || (p.barcode ?? "").includes(q));
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "stock": cmp = (a.stock ?? 0) - (b.stock ?? 0); break;
        case "cost": cmp = (a.costPrice ?? 0) - (b.costPrice ?? 0); break;
        case "price": cmp = a.price - b.price; break;
        case "margin": cmp = (a.margin?.pct ?? -1) - (b.margin?.pct ?? -1); break;
        case "movement": {
          const aVal = a.daysSinceMove ?? 9999;
          const bVal = b.daysSinceMove ?? 9999;
          cmp = aVal - bVal;
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [enriched, search, sortKey, sortDir]);

  return (
    <div className="modal-backdrop flex items-center justify-center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--surface-raised)] w-[95vw] max-w-7xl h-[90vh] rounded-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)] shrink-0">
          <div>
            <SectionTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Inventario completo</SectionTitle>
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{filtered.length} productos activos</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar producto..."
                className="pl-9 pr-3 py-2 w-56 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-gray-50 dark:bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition-colors">
              <X className="h-5 w-5 text-[var(--text-secondary)]" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 dark:bg-surface z-10">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted w-12">#</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted cursor-pointer select-none" onClick={() => toggleSort("name")}>
                  <span className="inline-flex items-center gap-1">Producto <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Categoría</th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted cursor-pointer select-none" onClick={() => toggleSort("stock")}>
                  <span className="inline-flex items-center gap-1">Stock <SortIcon col="stock" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted cursor-pointer select-none" onClick={() => toggleSort("cost")}>
                  <span className="inline-flex items-center gap-1">Costo <SortIcon col="cost" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted cursor-pointer select-none" onClick={() => toggleSort("price")}>
                  <span className="inline-flex items-center gap-1">Precio <SortIcon col="price" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted cursor-pointer select-none" onClick={() => toggleSort("margin")}>
                  <span className="inline-flex items-center gap-1">Margen <SortIcon col="margin" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted cursor-pointer select-none" onClick={() => toggleSort("movement")}>
                  <span className="inline-flex items-center gap-1">Movimiento <SortIcon col="movement" sortKey={sortKey} sortDir={sortDir} /></span>
                </th>
                <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Rotación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {filtered.map((p, i) => {
                const lowStock = (p.stock ?? 0) > 0 && (p.stock ?? 0) <= (p.stockMin ?? 5);
                const noStock = (p.stock ?? 0) === 0;
                const noMovement = p.daysSinceMove === null || p.daysSinceMove > 30;
                const recentMove = p.daysSinceMove !== null && p.daysSinceMove <= 7;

                return (
                  <tr key={p.id} className={cn("hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors", noStock && "bg-[var(--data-error-50)]/30 dark:bg-red-950/10")}>
                    <td className="px-4 py-3 text-xs text-[var(--text-tertiary)] font-mono">{i + 1}</td>

                    {/* Producto */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-2.5 w-2.5 rounded-full shrink-0",
                          noStock ? "bg-[var(--data-error-500)]" : lowStock ? "bg-[var(--data-warning-500)]" : "bg-[var(--accent-soft)]"
                        )} />
                        <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate max-w-[220px]">{p.name}</span>
                      </div>
                    </td>

                    {/* Categoría */}
                    <td className="px-4 py-3 text-[var(--text-secondary)] dark:text-muted capitalize text-xs">{p.category}</td>

                    {/* Stock */}
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold",
                        noStock ? "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/30 dark:text-[var(--data-error-500)]" :
                        lowStock ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-amber-950/30 dark:text-[var(--data-warning-500)]" :
                        "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]"
                      )}>
                        {noStock && <AlertTriangle className="h-3 w-3" />}
                        {p.stock ?? 0}
                      </span>
                    </td>

                    {/* Costo */}
                    <td className="px-4 py-3">
                      {p.costPrice != null && p.costPrice > 0
                        ? <span className="font-mono text-xs text-[var(--text-secondary)]">S/{Number(p.costPrice).toFixed(2)}</span>
                        : <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">—</span>
                      }
                    </td>

                    {/* Precio venta */}
                    <td className="px-4 py-3 font-bold text-primary text-xs">S/{Number(p.price).toFixed(2)}</td>

                    {/* Margen */}
                    <td className="px-4 py-3">
                      {p.margin ? (
                        <div className="flex flex-col">
                          <span className={cn("text-xs font-bold",
                            p.margin.pct >= 30 ? "text-[var(--data-success-500)]" :
                            p.margin.pct >= 15 ? "text-[var(--data-warning-500)]" :
                            "text-[var(--data-error-500)]"
                          )}>
                            {Number(p.margin.pct).toFixed(0)}%
                          </span>
                          <span className="text-xs text-[var(--text-secondary)] dark:text-muted">
                            S/{Number(p.margin.soles).toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">—</span>
                      )}
                    </td>

                    {/* Movimiento (sin movimiento / con movimiento) */}
                    <td className="px-4 py-3">
                      {p.daysSinceMove === null ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/30 dark:text-[var(--data-error-500)]">
                          Nunca vendido
                        </span>
                      ) : noMovement ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/30 dark:text-[var(--data-error-500)]">
                          <TrendingDown className="h-3 w-3" /> {p.daysSinceMove}d sin mov.
                        </span>
                      ) : recentMove ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]">
                          <TrendingUp className="h-3 w-3" /> Hace {p.daysSinceMove}d
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-amber-950/30 dark:text-[var(--data-warning-500)]">
                          Hace {p.daysSinceMove}d
                        </span>
                      )}
                    </td>

                    {/* Rotación */}
                    <td className="px-4 py-3">
                      {(() => {
                        const spw = p.salesWeek;
                        if (spw > 10) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-orange-950/30 dark:text-[var(--data-warning-500)]">Rápido</span>;
                        if (spw >= 3) return <span className="text-xs text-[var(--text-secondary)] dark:text-muted">Normal</span>;
                        if (spw >= 1) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-yellow-950/30 dark:text-[var(--data-warning-500)]">Lento</span>;
                        if ((p.stock ?? 0) > 0) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/30 dark:text-[var(--data-error-500)]">Sin rotar</span>;
                        return <span className="text-xs text-[var(--text-tertiary)]">—</span>;
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)]">
              <Package className="h-10 w-10 mb-2" />
              <p className="text-sm font-medium">Sin resultados</p>
            </div>
          )}
        </div>

        {/* Footer summary */}
        <div className="px-6 py-3 border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-gray-50 dark:bg-surface flex flex-wrap items-center gap-4 text-xs shrink-0">
          <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{filtered.length} productos</span>
          <span className="text-[var(--data-error-500)] font-semibold">{filtered.filter(p => (p.stock ?? 0) === 0).length} sin stock</span>
          <span className="text-[var(--data-error-500)] font-semibold">{filtered.filter(p => p.daysSinceMove === null || (p.daysSinceMove ?? 0) > 30).length} sin movimiento</span>
          <span className="text-[var(--data-warning-500)] font-semibold">{filtered.filter(p => p.margin && p.margin.pct < 15).length} margen bajo (&lt;15%)</span>
          <span className="text-[var(--data-success-500)] font-semibold">{filtered.filter(p => p.margin && p.margin.pct >= 30).length} margen alto (&gt;30%)</span>
        </div>
      </div>
    </div>
  );
}
