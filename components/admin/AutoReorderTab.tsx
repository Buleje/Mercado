"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Loader2, CheckCircle2, ShoppingCart, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type LowStockProduct = {
  id: string; name: string; stock: number; stockMin: number; stockMax: number;
  price: number; category: string; unit: string; suggestedQty: number;
};
type Supplier = { id: string; name: string; phone: string; categories: string[] };

export default function AutoReorderTab() {
  const [products, setProducts] = useState<LowStockProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/auto-reorder").then(r => r.ok ? r.json() : []),
      fetch("/api/suppliers").then(r => r.ok ? r.json() : []),
    ]).then(([prods, sups]) => {
      if (active) {
        setProducts(prods);
        setSuppliers(sups);
        setLoading(false);
      }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tick]);

  const toggleAll = () => {
    if (selected.size === products.length) setSelected(new Set());
    else setSelected(new Set(products.map(p => p.id)));
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const stockLevel = (p: LowStockProduct) => {
    const ratio = p.stockMin > 0 ? p.stock / p.stockMin : 1;
    if (ratio <= 0.3) return "critical";
    if (ratio <= 0.7) return "low";
    return "warning";
  };

  const levelStyle = (l: string) => {
    if (l === "critical") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    if (l === "low") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  };

  const generatePO = async () => {
    if (selected.size === 0 || !supplierId) return;
    setCreating(true);
    const items = products
      .filter(p => selected.has(p.id))
      .map(p => ({ productId: p.id, productName: p.name, quantity: p.suggestedQty, unitCost: p.price * 0.7 }));

    const total = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId, items, total }),
    });
    if (res.ok) {
      const po = await res.json();
      setCreated(po.id);
      setSelected(new Set());
      setTick(v => v + 1);
    }
    setCreating(false);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const critical = products.filter(p => stockLevel(p) === "critical").length;
  const low = products.filter(p => stockLevel(p) === "low").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><RefreshCw className="h-6 w-6 text-primary" />Auto-Reorden Inteligente</h2>
        <button onClick={() => setTick(v => v + 1)} className="px-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl hover:bg-gray-50 dark:hover:bg-surface transition flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5" />Actualizar</button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-center">
          <p className="text-2xl font-extrabold text-red-600">{critical}</p>
          <p className="text-xs text-red-500">Crítico</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-center">
          <p className="text-2xl font-extrabold text-amber-600">{low}</p>
          <p className="text-xs text-amber-500">Bajo</p>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-4 text-center">
          <p className="text-2xl font-extrabold text-yellow-600">{products.length - critical - low}</p>
          <p className="text-xs text-yellow-500">Advertencia</p>
        </div>
      </div>

      {created && (
        <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />Orden de compra creada: <span className="font-mono font-bold">{created.slice(0, 8)}</span>
          <button onClick={() => setCreated(null)} className="ml-auto text-xs underline">Cerrar</button>
        </div>
      )}

      {products.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl">
          <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
          <p className="font-bold text-gray-900 dark:text-foreground">Inventario en buen estado</p>
          <p className="text-sm text-gray-400">No hay productos con stock bajo</p>
        </div>
      ) : (
        <>
          {/* Generate PO bar */}
          <div className="flex items-center gap-3 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.size === products.length} onChange={toggleAll} className="rounded" />
              <span className="font-bold text-gray-700 dark:text-foreground">{selected.size} seleccionados</span>
            </label>
            <ArrowRight className="h-4 w-4 text-gray-300 hidden sm:block" />
            <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm flex-1 min-w-40">
              <option value="">Seleccionar proveedor...</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={generatePO} disabled={selected.size === 0 || !supplierId || creating} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}Generar Orden
            </button>
          </div>

          {/* Product table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-200 dark:border-card-border">
                  <th className="pb-2 pr-2"></th>
                  <th className="pb-2 pr-3">Producto</th>
                  <th className="pb-2 pr-3">Categoría</th>
                  <th className="pb-2 pr-3 text-center">Stock</th>
                  <th className="pb-2 pr-3 text-center">Mín</th>
                  <th className="pb-2 pr-3 text-center">Máx</th>
                  <th className="pb-2 pr-3 text-center">Sugerido</th>
                  <th className="pb-2 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                {products.map(p => {
                  const level = stockLevel(p);
                  return (
                    <tr key={p.id} className={cn("hover:bg-gray-50 dark:hover:bg-surface transition", selected.has(p.id) && "bg-primary/5")}>
                      <td className="py-3 pr-2"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} className="rounded" /></td>
                      <td className="py-3 pr-3 font-bold text-gray-900 dark:text-foreground">{p.name}</td>
                      <td className="py-3 pr-3 text-gray-500 capitalize">{p.category}</td>
                      <td className="py-3 pr-3 text-center font-extrabold">{p.stock} {p.unit}</td>
                      <td className="py-3 pr-3 text-center text-gray-400">{p.stockMin}</td>
                      <td className="py-3 pr-3 text-center text-gray-400">{p.stockMax}</td>
                      <td className="py-3 pr-3 text-center font-bold text-primary">{p.suggestedQty} {p.unit}</td>
                      <td className="py-3 text-center">
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase", levelStyle(level))}>
                          {level === "critical" ? "Crítico" : level === "low" ? "Bajo" : "Alerta"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
