"use client";

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, Loader2, ArrowUpRight, ArrowDownRight,
  Download, Search, X, User, Calendar,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import type { Product } from "@/types/erp";

// ── Types ─────────────────────────────────────────────────────────────────────

type PriceRecord = {
  id: string;
  productId: number;
  oldPrice: number;
  newPrice: number;
  changedAt: string;
  changedBy?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-PE", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PriceHistoryTabProps {
  /** Si se pasa, carga sólo el historial de ese producto (modo "editor de producto") */
  productId?: number;
}

export default function PriceHistoryTab({ productId }: PriceHistoryTabProps) {
  const [history, setHistory] = useState<PriceRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(productId != null ? String(productId) : "");

  useEffect(() => {
    let active = true;
    const historyUrl = productId != null
      ? `/api/products/${productId}/price-history`
      : "/api/price-history";

    Promise.all([
      fetch(historyUrl),
      productId == null ? fetch("/api/products") : Promise.resolve(null),
    ])
      .then(([hRes, pRes]) =>
        Promise.all([
          hRes.ok ? hRes.json() : [],
          pRes && pRes.ok ? pRes.json() : [],
        ])
      )
      .then(([h, p]: [PriceRecord[], Product[]]) => {
        if (!active) return;
        setHistory(h);
        setProducts(p);
        setLoading(false);
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [productId]);

  const productMap = useMemo(
    () => Object.fromEntries(products.map(p => [p.id, p.name])),
    [products],
  );

  const filtered = useMemo(() => {
    let list = filter
      ? history.filter(h => h.productId === Number(filter))
      : history;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(h => {
        const name = (productMap[h.productId] ?? "").toLowerCase();
        return name.includes(q) || (h.changedBy ?? "").toLowerCase().includes(q);
      });
    }
    return [...list].sort(
      (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
    );
  }, [history, filter, search, productMap]);

  if (loading) {
    return (
      <LoadingState />
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          Historial de Precios
        </SectionTitle>
        <button
          onClick={() =>
            exportToCSV(
              filtered.map(h => ({
                fecha: fmtDate(h.changedAt),
                producto: productMap[h.productId] ?? `#${h.productId}`,
                precio_anterior: h.oldPrice,
                precio_nuevo: h.newPrice,
                cambio_pct: h.oldPrice > 0
                  ? `${((h.newPrice - h.oldPrice) / h.oldPrice * 100).toFixed(1)}%`
                  : "N/A",
                modificado_por: h.changedBy ?? "—",
              })),
              "historial-precios"
            )
          }
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors"
        >
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* Filters */}
      {productId == null && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Producto o usuario…"
              className="w-full pl-9 pr-9 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-foreground" />
              </button>
            )}
          </div>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="px-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm text-[var(--text-primary)] dark:text-foreground"
          >
            <option value="">Todos los productos</option>
            {[...new Set(history.map(h => h.productId))].map(pid => (
              <option key={pid} value={pid}>
                {productMap[pid] ?? `Producto #${pid}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <p className="text-center text-[var(--text-tertiary)] dark:text-muted py-8">
          No hay cambios de precios registrados
        </p>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-gray-50 dark:bg-surface border-b border-[var(--rule-base)] dark:border-card-border">
                <tr>
                  <th className="text-left px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Fecha</span>
                  </th>
                  {productId == null && (
                    <th className="text-left px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">Producto</th>
                  )}
                  <th className="text-right px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">Precio anterior</th>
                  <th className="text-right px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">Precio nuevo</th>
                  <th className="text-right px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">% Cambio</th>
                  <th className="text-left px-4 py-3 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] hidden sm:table-cell">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> Modificado por</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-card-border">
                {filtered.map(h => {
                  const diff   = h.newPrice - h.oldPrice;
                  const pct    = h.oldPrice > 0 ? (diff / h.oldPrice) * 100 : null;
                  const isUp   = diff > 0;
                  return (
                    <tr key={h.id} className="hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors">
                      <td className="px-4 py-3 text-xs text-[var(--text-secondary)] dark:text-muted whitespace-nowrap">
                        {fmtDate(h.changedAt)}
                      </td>
                      {productId == null && (
                        <td className="px-4 py-3 font-semibold text-[var(--text-primary)] dark:text-foreground">
                          {productMap[h.productId] ?? `Producto #${h.productId}`}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right text-[var(--text-tertiary)] line-through">
                        {fmt(h.oldPrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-[var(--text-primary)] dark:text-foreground">
                        {fmt(h.newPrice)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          "inline-flex items-center gap-0.5 text-xs font-bold",
                          isUp ? "text-[var(--data-error)]" : "text-[var(--data-success)]"
                        )}>
                          {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                          {pct != null ? `${isUp ? "+" : ""}${pct.toFixed(1)}%` : "N/A"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-secondary)] dark:text-muted hidden sm:table-cell">
                        {h.changedBy ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-[var(--rule-soft)] dark:border-card-border bg-gray-50 dark:bg-surface">
            <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{filtered.length} cambio{filtered.length !== 1 ? "s" : ""} registrado{filtered.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      )}
    </div>
  );
}
