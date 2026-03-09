"use client";

import { useCompare } from "@/contexts/compare-context";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import Image from "next/image";
import { X, GitCompareArrows, Plus, Package, Trash2 } from "lucide-react";
import { categories } from "@/data/products";

export default function CompareBar() {
  const { items, remove, clear, open, setOpen } = useCompare();

  if (items.length === 0) return null;

  return (
    <>
      {/* Floating bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 animate-[fadeUp_0.3s_ease-out_both]">
        <GitCompareArrows className="h-5 w-5 text-primary shrink-0" />
        <div className="flex items-center gap-2">
          {items.map(p => (
            <div key={p.id} className="relative h-10 w-10 rounded-lg overflow-hidden border border-gray-100 dark:border-card-border bg-gray-50 dark:bg-surface shrink-0">
              {p.image ? (
                <Image src={p.image} alt={p.name} fill className="object-cover" sizes="40px" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-gray-300"><Package className="h-4 w-4" /></div>
              )}
              <button onClick={() => remove(p.id)} className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white rounded-full flex items-center justify-center">
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
          {items.length < 3 && (
            <div className="h-10 w-10 rounded-lg border-2 border-dashed border-gray-300 dark:border-card-border flex items-center justify-center text-gray-300">
              <Plus className="h-4 w-4" />
            </div>
          )}
        </div>
        <button
          onClick={() => setOpen(true)}
          disabled={items.length < 2}
          className="bg-primary text-white text-sm font-bold rounded-xl px-4 py-2 hover:bg-primary-dark active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          Comparar ({items.length})
        </button>
        <button onClick={clear} className="text-gray-400 hover:text-red-500 transition-colors">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Compare modal */}
      {open && <CompareModal />}
    </>
  );
}

function CompareModal() {
  const { items, clear, setOpen } = useCompare();
  const { addItem } = useCart();
  const { showToast } = useToast();

  const catLabel = (cat: string) => categories.find(c => c.id === cat)?.label ?? cat;

  const rows: { label: string; values: string[] }[] = [
    { label: "Precio", values: items.map(p => `S/${p.price.toFixed(2)}`) },
    { label: "Categoría", values: items.map(p => catLabel(p.category)) },
    { label: "Unidad", values: items.map(p => p.unit) },
    { label: "Badge", values: items.map(p => p.badge ?? "—") },
  ];

  // Highlight cheapest
  const minPrice = Math.min(...items.map(p => p.price));

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div className="bg-white dark:bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-auto border border-gray-200 dark:border-card-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-card-border">
          <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5 text-primary" /> Comparar productos
          </h2>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Product headers */}
        <div className="grid gap-4 p-5" style={{ gridTemplateColumns: `120px repeat(${items.length}, 1fr)` }}>
          <div />
          {items.map(p => (
            <div key={p.id} className="text-center">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 dark:bg-surface mb-2 mx-auto max-w-28">
                {p.image ? (
                  <Image src={p.image} alt={p.name} fill className="object-cover" sizes="120px" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-gray-300"><Package className="h-8 w-8" /></div>
                )}
              </div>
              <h3 className="font-bold text-foreground text-sm leading-tight line-clamp-2">{p.name}</h3>
            </div>
          ))}

          {/* Comparison rows */}
          {rows.map(row => (
            <>
              <div key={row.label} className="text-xs font-semibold text-muted flex items-center">{row.label}</div>
              {row.values.map((val, i) => (
                <div
                  key={`${row.label}-${i}`}
                  className={`text-sm font-semibold text-center text-foreground ${row.label === "Precio" && items[i].price === minPrice ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                >
                  {val}
                  {row.label === "Precio" && items[i].price === minPrice && (
                    <span className="block text-xs text-emerald-500 font-bold">Más barato</span>
                  )}
                </div>
              ))}
            </>
          ))}

          {/* Add to cart row */}
          <div className="text-xs font-semibold text-muted flex items-center">Acción</div>
          {items.map(p => (
            <div key={`action-${p.id}`} className="flex justify-center">
              <button
                onClick={() => { addItem(p as never); showToast(p.name, p.image); }}
                className="flex items-center gap-1.5 bg-primary text-white rounded-xl px-3 py-2 text-xs font-bold hover:bg-primary-dark active:scale-95 transition-all"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar
              </button>
            </div>
          ))}
        </div>

        <div className="p-5 pt-0 flex justify-end">
          <button onClick={clear} className="text-sm font-semibold text-gray-400 hover:text-red-500 transition-colors">
            Limpiar comparación
          </button>
        </div>
      </div>
    </div>
  );
}
