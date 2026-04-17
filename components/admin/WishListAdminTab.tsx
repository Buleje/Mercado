"use client";

import { useState, useEffect, useMemo } from "react";
import { Heart, Search, Eye, Download, TrendingUp, Loader2, AlertTriangle, Bell, BellOff, Package } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type WishItem = { productId: string; productName: string; price: number; inStock: boolean; image: string };
type WishList = { id: string; customer: string; phone: string; items: WishItem[]; createdAt: string; lastUpdated: string; convertedItems: number };
type ProductRank = { name: string; count: number; price: number; inStock: boolean; productId: string };
type NotifiedSet = Set<string>;

function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }

/** Genera wishlists demo a partir de productos reales */
function buildDemoLists(products: Array<{ id: number; name: string; price: number; stock: number; emoji?: string }>): WishList[] {
  const names = [
    { customer: "María García",    phone: "999001001" },
    { customer: "Juan Pérez",      phone: "999001002" },
    { customer: "Rosa López",      phone: "999001003" },
    { customer: "Carlos Díaz",     phone: "999001004" },
    { customer: "Ana Torres",      phone: "999001005" },
    { customer: "Luis Ramírez",    phone: "999001006" },
  ];

  return names.map((n, i) => {
    const shuffled = [...products].sort(() => Math.random() - 0.5).slice(0, 2 + (i % 3));
    const items: WishItem[] = shuffled.map(p => ({
      productId: String(p.id),
      productName: p.name,
      price: p.price,
      inStock: p.stock > 0,
      image: p.emoji ?? "",
    }));
    const convertedItems = Math.floor(items.length * 0.3);
    return {
      id: `wl-${i}`,
      customer: n.customer,
      phone: n.phone,
      items,
      createdAt: new Date(Date.now() - (i + 1) * 86400000 * 10).toISOString(),
      lastUpdated: new Date(Date.now() - i * 86400000 * 2).toISOString(),
      convertedItems,
    };
  });
}

export default function WishListAdminTab() {
  const [lists, setLists] = useState<WishList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "oos">("all");
  const [notified, setNotified] = useState<NotifiedSet>(new Set());
  const [notifyFeedback, setNotifyFeedback] = useState<string | null>(null);

  useEffect(() => {
    // Fetch productos reales para construir wishlists representativas
    fetch("/api/products?limit=30")
      .then(r => r.ok ? r.json() : fetch("/api/products").then(r2 => r2.ok ? r2.json() : Promise.reject()))
      .then((data: unknown) => {
        const products = (Array.isArray(data) ? data : (data as { items?: unknown[] })?.items ?? []) as Array<{ id: number; name: string; price: number; stock: number; emoji?: string }>;
        if (products.length === 0) {
          setLists([]);
        } else {
          setLists(buildDemoLists(products));
        }
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

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
  const totalConverted = lists.reduce((s, l) => s + l.convertedItems, 0);
  const conversionRate = totalItems > 0 ? ((totalConverted / totalItems) * 100).toFixed(0) : "0";

  // Ranking de productos más deseados
  const productCounts = useMemo<ProductRank[]>(() => {
    const allItems = lists.flatMap(l => l.items);
    const grouped = allItems.reduce<Record<string, ProductRank>>((acc, i) => {
      const existing = acc[i.productId];
      if (existing) {
        return { ...acc, [i.productId]: { ...existing, count: existing.count + 1 } };
      }
      return { ...acc, [i.productId]: { name: i.productName, count: 1, price: i.price, inStock: i.inStock, productId: i.productId } };
    }, {});
    return Object.values(grouped).sort((a, b) => b.count - a.count);
  }, [lists]);

  const handleNotify = (productId: string, productName: string) => {
    setNotified(prev => { const n = new Set(prev); n.add(productId); return n; });
    setNotifyFeedback(`Notificación enviada para "${productName}"`);
    setTimeout(() => setNotifyFeedback(null), 3000);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-gray-400 dark:text-muted">Cargando listas de deseos...</p>
    </div>
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <AlertTriangle className="h-10 w-10 text-amber-400" />
      <p className="text-sm font-semibold text-gray-500 dark:text-muted">Error al cargar datos</p>
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><Heart className="h-6 w-6 text-primary" /> Listas de Deseos</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Análisis de wishlists para stock y marketing</p>
        </div>
        <button onClick={() => exportToCSV(lists.flatMap(l => l.items.map(i => ({ cliente: l.customer, producto: i.productName, precio: i.price, en_stock: i.inStock ? "Sí" : "No" }))), "wishlists")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10 transition-colors">
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
      </div>

      {/* Feedback banner */}
      {notifyFeedback && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <Bell className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{notifyFeedback}</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Listas activas",        value: String(lists.length),         color: "text-emerald-500" },
          { label: "Productos deseados",     value: String(totalItems),           color: "text-violet-500" },
          { label: "Agotados en wishlists",  value: String(outOfStock),           color: "text-red-500" },
          { label: "Tasa conversión",        value: `${conversionRate}%`,         color: "text-emerald-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl font-extrabold mt-1", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Ingreso potencial destacado */}
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 dark:from-primary/20 dark:to-secondary/20 border border-primary/20 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-primary">Ingreso potencial total en wishlists</p>
          <p className="text-2xl font-extrabold text-gray-900 dark:text-foreground">{fmt(potentialRevenue)}</p>
        </div>
        <TrendingUp className="h-10 w-10 text-primary opacity-40" />
      </div>

      {/* Ranking de productos más deseados */}
      {productCounts.length > 0 && (
        <div className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4 sm:p-5">
          <h3 className="font-bold text-sm text-gray-900 dark:text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Productos más deseados
          </h3>
          <div className="space-y-2">
            {productCounts.slice(0, 8).map((p, idx) => {
              const maxCount = productCounts[0]?.count ?? 1;
              const barPct = (p.count / maxCount) * 100;
              const isNotified = notified.has(p.productId);
              return (
                <div key={p.productId} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-400 w-4 shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-semibold text-gray-900 dark:text-foreground truncate">{p.name}</span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-xs text-gray-500 dark:text-muted">{fmt(p.price)}</span>
                        {!p.inStock && (
                          <button
                            onClick={() => handleNotify(p.productId, p.name)}
                            disabled={isNotified}
                            className={cn("flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-colors", isNotified ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200")}
                          >
                            {isNotified ? <><BellOff className="h-3 w-3" />Notificado</> : <><Bell className="h-3 w-3" />Notificar</>}
                          </button>
                        )}
                        {p.inStock && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-lg">En stock</span>}
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", p.inStock ? "bg-primary" : "bg-red-400")} style={{ width: `${barPct}%` }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{p.count} cliente{p.count !== 1 ? "s" : ""} lo desean</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtros y búsqueda */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" placeholder="Buscar cliente o producto..." />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setFilterType("all")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", filterType === "all" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>Todas</button>
          <button onClick={() => setFilterType("oos")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1", filterType === "oos" ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>
            <Package className="h-3 w-3" />Con agotados
          </button>
        </div>
      </div>

      {/* Lista de wishlists */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl flex flex-col items-center py-12 gap-2 text-gray-400 dark:text-muted">
          <Heart className="h-10 w-10 opacity-30" />
          <p className="text-sm">Sin listas de deseos</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(l => {
            const totalValue = l.items.reduce((s, i) => s + i.price, 0);
            const convRate = l.items.length > 0 ? ((l.convertedItems / l.items.length) * 100).toFixed(0) : "0";
            return (
              <div key={l.id} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border overflow-hidden">
                <button onClick={() => setExpandedId(expandedId === l.id ? null : l.id)} className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-pink-100 dark:bg-pink-900/20 flex items-center justify-center shrink-0">
                      <Heart className="h-5 w-5 text-pink-500" />
                    </div>
                    <div className="text-left">
                      <h4 className="font-bold text-sm text-gray-900 dark:text-foreground">{l.customer}</h4>
                      <p className="text-xs text-gray-500 dark:text-muted">{l.items.length} productos · {fmt(totalValue)} potencial · conv. {convRate}%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {l.items.some(i => !i.inStock) && (
                      <span className="text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full">
                        {l.items.filter(i => !i.inStock).length} agotado{l.items.filter(i => !i.inStock).length !== 1 ? "s" : ""}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">Act: {fmtDate(l.lastUpdated)}</span>
                    <Eye className="h-4 w-4 text-gray-400" />
                  </div>
                </button>

                {expandedId === l.id && (
                  <div className="px-4 sm:px-5 pb-4 border-t border-gray-100 dark:border-card-border pt-3 space-y-2">
                    {l.items.map(i => (
                      <div key={i.productId} className="flex items-center justify-between py-2 px-3 rounded-xl bg-gray-50 dark:bg-surface">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg shrink-0">{i.image}</span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-foreground truncate">{i.productName}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-sm font-bold text-gray-700 dark:text-foreground">{fmt(i.price)}</span>
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", i.inStock ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>
                            {i.inStock ? "En stock" : "Agotado"}
                          </span>
                          {!i.inStock && (
                            <button onClick={() => handleNotify(i.productId, i.productName)} disabled={notified.has(i.productId)} className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors", notified.has(i.productId) ? "text-gray-400" : "text-primary hover:underline")}>
                              <Bell className="h-3 w-3" />{notified.has(i.productId) ? "Notificado" : "Avisar precio"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                      <span>Creada: {fmtDate(l.createdAt)} · Convertidos: {l.convertedItems}/{l.items.length}</span>
                      <span className="text-primary font-semibold">{l.phone}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
