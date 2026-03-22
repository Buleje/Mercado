"use client";

import { useState, useEffect } from "react";
import { TrendingUp, Loader2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import type { Product } from "@/types/erp";

type PriceRecord = { id: string; productId: number; oldPrice: number; newPrice: number; changedAt: string };

export default function PriceHistoryTab() {
  const [history, setHistory] = useState<PriceRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/price-history"), fetch("/api/products")])
      .then(([hRes, pRes]) => Promise.all([hRes.ok ? hRes.json() : [], pRes.ok ? pRes.json() : []]))
      .then(([h, p]: [PriceRecord[], Product[]]) => {
        if (!active) return;
        setHistory(h);
        setProducts(p);
        setLoading(false);
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const productMap = Object.fromEntries(products.map(p => [p.id, p.name]));
  const filtered = filter ? history.filter(h => h.productId === Number(filter)) : history;
  const sorted = [...filtered].sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><TrendingUp className="h-6 w-6 text-primary" />Historial de Precios</h2>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm">
          <option value="">Todos los productos</option>
          {[...new Set(history.map(h => h.productId))].map(pid => (
            <option key={pid} value={pid}>{productMap[pid] || `Producto #${pid}`}</option>
          ))}
        </select>
      </div>

      {sorted.length === 0 && <p className="text-center text-gray-400 dark:text-muted py-8">No hay cambios de precios registrados</p>}

      <div className="space-y-2">
        {sorted.map(h => {
          const diff = h.newPrice - h.oldPrice;
          const pctChange = h.oldPrice > 0 ? ((diff / h.oldPrice) * 100).toFixed(1) : "N/A";
          const isUp = diff > 0;
          return (
            <div key={h.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 flex flex-wrap items-center gap-2 sm:gap-4">
              <div className={`p-2 rounded-xl ${isUp ? "bg-red-50 dark:bg-red-900/20" : "bg-emerald-50 dark:bg-emerald-900/20"}`}>
                {isUp ? <ArrowUpRight className="h-5 w-5 text-red-500" /> : <ArrowDownRight className="h-5 w-5 text-emerald-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-900 dark:text-foreground truncate">{productMap[h.productId] || `Producto #${h.productId}`}</p>
                <p className="text-xs text-gray-400">{new Date(h.changedAt).toLocaleString()}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-gray-400 line-through">S/{h.oldPrice.toFixed(2)}</span>
                  <span className="font-extrabold text-gray-900 dark:text-foreground">S/{h.newPrice.toFixed(2)}</span>
                </div>
                <span className={`text-xs font-bold ${isUp ? "text-red-500" : "text-emerald-500"}`}>
                  {isUp ? "+" : ""}{pctChange}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

