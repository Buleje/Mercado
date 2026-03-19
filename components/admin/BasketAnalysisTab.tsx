"use client";

import { useState, useMemo } from "react";
import { ShoppingCart, ArrowRight, TrendingUp, BarChart3, Download, Link2, Package } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type Association = { productA: string; productB: string; support: number; confidence: number; lift: number; count: number };
type TopCombo = { products: string[]; frequency: number; avgTicket: number };

const ASSOCIATIONS: Association[] = [];

const TOP_COMBOS: TopCombo[] = [];

export default function BasketAnalysisTab() {
  const [sortBy, setSortBy] = useState<"support" | "confidence" | "lift" | "count">("count");
  const [minSupport, setMinSupport] = useState(0);

  const sorted = useMemo(() => {
    return ASSOCIATIONS.filter(a => a.support >= minSupport).sort((a, b) => b[sortBy] - a[sortBy]);
  }, [sortBy, minSupport]);

  const avgBasketSize = 3.4;
  const avgBasketValue = 54.20;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><ShoppingCart className="h-6 w-6 text-primary" /> Análisis de Cesta</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Descubre qué productos se compran juntos</p>
        </div>
        <button onClick={() => exportToCSV(sorted.map(a => ({ producto_a: a.productA, producto_b: a.productB, soporte: (a.support * 100).toFixed(1) + "%", confianza: (a.confidence * 100).toFixed(1) + "%", lift: a.lift.toFixed(1), transacciones: a.count })), "analisis-cesta")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10"><Download className="h-3.5 w-3.5" /> CSV</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Asociaciones detectadas", value: ASSOCIATIONS.length, color: "text-blue-500" },
          { label: "Tamaño prom. cesta", value: `${avgBasketSize} items`, color: "text-emerald-500" },
          { label: "Valor prom. cesta", value: `S/ ${avgBasketValue.toFixed(2)}`, color: "text-violet-500" },
          { label: "Combos top", value: TOP_COMBOS.length, color: "text-amber-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Top combos */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
        <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 flex items-center gap-2"><Package className="h-4 w-4 text-primary" /> Combos más frecuentes</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TOP_COMBOS.map((c, i) => (
            <div key={i} className="bg-gray-50 dark:bg-surface rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs font-extrabold text-primary">#{i + 1}</span>
                <span className="text-[10px] text-gray-400">{c.frequency}x /mes</span>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {c.products.map((p, j) => (
                  <span key={j} className="text-xs bg-white dark:bg-card px-2 py-1 rounded-lg border border-gray-200 dark:border-card-border font-semibold text-gray-700 dark:text-foreground flex items-center gap-1">
                    {j > 0 && <span className="text-gray-300">+</span>}
                    {p}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-muted">Ticket prom.: <b className="text-gray-900 dark:text-foreground">S/ {c.avgTicket.toFixed(2)}</b></p>
            </div>
          ))}
        </div>
      </div>

      {/* Association rules table */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-5 py-3 bg-gray-50 dark:bg-surface gap-2">
          <h3 className="font-bold text-sm text-gray-700 dark:text-foreground flex items-center gap-2"><Link2 className="h-4 w-4 text-primary" /> Reglas de asociación</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-gray-400">Ordenar:</span>
            {(["count", "confidence", "support", "lift"] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)} className={cn("px-2 py-0.5 rounded text-[10px] font-bold transition-colors", sortBy === s ? "bg-primary text-white" : "bg-gray-200 dark:bg-card text-gray-500 dark:text-muted")}>{s === "count" ? "Frecuencia" : s === "confidence" ? "Confianza" : s === "support" ? "Soporte" : "Lift"}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 dark:text-muted bg-gray-50 dark:bg-surface">
                <th className="px-4 py-2 font-bold">Producto A</th>
                <th className="px-4 py-2 font-bold" />
                <th className="px-4 py-2 font-bold">Producto B</th>
                <th className="px-4 py-2 font-bold text-right">Soporte</th>
                <th className="px-4 py-2 font-bold text-right">Confianza</th>
                <th className="px-4 py-2 font-bold text-right">Lift</th>
                <th className="px-4 py-2 font-bold text-right">Transacciones</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface/50">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-foreground">{a.productA}</td>
                  <td className="px-2 py-3"><ArrowRight className="h-3 w-3 text-gray-400" /></td>
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-foreground">{a.productB}</td>
                  <td className="px-4 py-3 text-right"><span className="text-xs font-bold text-blue-500">{(a.support * 100).toFixed(0)}%</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-12 h-1.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${a.confidence * 100}%` }} /></div>
                      <span className="text-xs font-bold text-emerald-500">{(a.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right"><span className={cn("text-xs font-bold", a.lift >= 2 ? "text-violet-500" : "text-gray-500")}>{a.lift.toFixed(1)}x</span></td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-gray-700 dark:text-foreground">{a.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
