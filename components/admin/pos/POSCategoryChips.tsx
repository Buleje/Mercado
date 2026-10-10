"use client";

import { useMemo } from "react";
import { Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { categories } from "@/data/products";
import { CATEGORY_ICONS, prettyCategory, type Product } from "@/components/admin/pos/pos-shared";

/** Chips de categoría del POS, sacadas del inventario real. */
export default function POSCategoryChips({ products, category, setCategory }: { products: Product[]; category: string; setCategory: (id: string) => void }) {
  // Categorías del POS derivadas del INVENTARIO real (productos cargados desde
  // /api/products), no de la lista estática. Refleja exactamente las categorías
  // que el dueño usa en su inventario (incluye las propias, ej. pollería).
  const posCategories = useMemo(() => {
    const seen = new Set<string>();
    const present: string[] = [];
    for (const p of products) {
      const cat = (p.category ?? "").trim();
      if (cat && !seen.has(cat)) {
        seen.add(cat);
        present.push(cat);
      }
    }
    const knownLabel = new Map(categories.map((c) => [c.id, c.label]));
    const ordered = present
      .map((id) => ({ id, label: knownLabel.get(id) ?? prettyCategory(id) }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
    return [{ id: "todos", label: "Todos" }, ...ordered];
  }, [products]);

  return (
            <div className="relative">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide scroll-smooth snap-x pt-1 pb-1">
                {posCategories.map((c) => {
                  const Icon = CATEGORY_ICONS[c.id] ?? Package;
                  const active = category === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCategory(c.id)}
                      aria-pressed={active}
                      className={cn(
                        "snap-start shrink-0 inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border text-sm font-semibold transition-all duration-[var(--dur-fast)]",
                        active
                          ? "bg-primary text-white border-primary shadow-[var(--shadow-sm)]"
                          : "bg-[var(--surface-raised)] text-[var(--text-secondary)] dark:text-muted border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary/40 hover:text-primary hover:bg-primary/5 dark:hover:bg-primary/10",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="whitespace-nowrap">{c.label}</span>
                    </button>
                  );
                })}
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-[var(--surface-raised)] to-transparent"
              />
            </div>
  );
}
