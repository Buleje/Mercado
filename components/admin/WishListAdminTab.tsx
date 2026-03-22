"use client";

import { useState, useMemo } from "react";
import { Heart, Search, Eye, Download, TrendingUp } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type WishItem = { productId: string; productName: string; price: number; inStock: boolean; image: string };
type WishList = { id: string; customer: string; email: string; items: WishItem[]; createdAt: string; lastUpdated: string; convertedItems: number };

const SEED: WishList[] = [];

function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }

export default function WishListAdminTab() {
  const [lists] = useState(SEED);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "oos">("all");

  const filtered = useMemo(() => {
    let result = lists;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l => l.customer.toLowerCase().includes(q) || l.items.some(i => i.productName.toLowerCase().includes(q)));
    }
    if (filterType === "oos") {
      result = result.filter(l => l.items.some(i => !i.inStock));
    }
    return result;
  }, [lists, search, filterType]);

  const totalItems = lists.reduce((s, l) => s + l.items.length, 0);
  const outOfStock = lists.reduce((s, l) => s + l.items.filter(i => !i.inStock).length, 0);
  const potentialRevenue = lists.reduce((s, l) => s + l.items.reduce((all, i) => all + i.price, 0), 0);
  const conversionRate = totalItems > 0 ? ((lists.reduce((s, l) => s + l.convertedItems, 0) / totalItems) * 100).toFixed(0) : "0";

  // Most wished products
  const productCounts = (() => {
    const allItems = lists.flatMap(l => l.items);
    const grouped = allItems.reduce<Record<string, { name: string; count: number; price: number; inStock: boolean }>>((acc, i) => {
      const existing = acc[i.productId];
      return { ...acc, [i.productId]: existing ? { ...existing, count: existing.count + 1 } : { name: i.productName, count: 1, price: i.price, inStock: i.inStock } };
    }, {});
    return Object.values(grouped).sort((a, b) => b.count - a.count);
  })();

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><Heart className="h-6 w-6 text-primary" /> Listas de Deseos</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Análisis de wishlists para decisiones de stock y marketing</p>
        </div>
        <button onClick={() => exportToCSV(lists.flatMap(l => l.items.map(i => ({ cliente: l.customer, producto: i.productName, precio: i.price, en_stock: i.inStock ? "Sí" : "No" }))), "wishlists")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10"><Download className="h-3.5 w-3.5" /> CSV</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Listas activas", value: lists.length, color: "text-blue-500" },
          { label: "Productos deseados", value: totalItems, color: "text-violet-500" },
          { label: "Sin stock deseados", value: outOfStock, color: "text-red-500" },
          { label: "Ingreso potencial", value: fmt(potentialRevenue), color: "text-emerald-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Top products card */}
      <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
        <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-3 flex flex-wrap items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Productos más deseados</h3>
        <div className="flex flex-wrap gap-2">
          {productCounts.slice(0, 6).map(p => (
            <div key={p.name} className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border text-xs", p.inStock ? "border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface" : "border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-950/10")}>
              <span className="font-bold text-gray-900 dark:text-foreground">{p.name}</span>
              <span className="text-gray-400">×{p.count}</span>
              {!p.inStock && <span className="text-[9px] font-bold text-red-600">SIN STOCK</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" placeholder="Buscar cliente o producto…" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setFilterType("all")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", filterType === "all" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Todas</button>
          <button onClick={() => setFilterType("oos")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", filterType === "oos" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Con sin stock</button>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(l => (
          <div key={l.id} className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border overflow-hidden">
            <button onClick={() => setExpandedId(expandedId === l.id ? null : l.id)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors">
              <div className="flex flex-wrap items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-pink-100 dark:bg-pink-900/20 flex items-center justify-center"><Heart className="h-5 w-5 text-pink-500" /></div>
                <div className="text-left">
                  <h4 className="font-bold text-sm text-gray-900 dark:text-foreground">{l.customer}</h4>
                  <p className="text-xs text-gray-500 dark:text-muted">{l.items.length} productos · {fmt(l.items.reduce((s, i) => s + i.price, 0))} potencial</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {l.items.some(i => !i.inStock) && <span className="text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">{l.items.filter(i => !i.inStock).length} sin stock</span>}
                <span className="text-[10px] text-gray-400">Act: {fmtDate(l.lastUpdated)}</span>
                <Eye className="h-4 w-4 text-gray-400" />
              </div>
            </button>
            {expandedId === l.id && (
              <div className="px-5 pb-4 border-t border-gray-100 dark:border-card-border pt-3">
                <div className="space-y-2">
                  {l.items.map(i => (
                    <div key={i.productId} className="flex items-center justify-between py-2 px-3 rounded-xl bg-gray-50 dark:bg-surface">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg">{i.image}</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-foreground">{i.productName}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-bold text-gray-700 dark:text-foreground">{fmt(i.price)}</span>
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", i.inStock ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>{i.inStock ? "En stock" : "Agotado"}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                  <span>Creada: {fmtDate(l.createdAt)} · Convertidos: {l.convertedItems}/{l.items.length}</span>
                  <span className="text-primary font-semibold">{l.email}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
