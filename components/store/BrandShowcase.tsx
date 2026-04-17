"use client";

import { useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useStoreProducts } from "@/hooks/use-store-products";

// Marcas peruanas con colores de marca
const BRAND_META: Record<string, { color: string; bg: string }> = {
  "Gloria":       { color: "#1e40af", bg: "#dbeafe" },
  "Costeño":      { color: "#92400e", bg: "#fef3c7" },
  "Primor":       { color: "#15803d", bg: "#dcfce7" },
  "Alacena":      { color: "#dc2626", bg: "#fee2e2" },
  "Don Vittorio": { color: "#7c3aed", bg: "#ede9fe" },
  "Inca Kola":    { color: "#ca8a04", bg: "#fef9c3" },
  "Coca-Cola":    { color: "#dc2626", bg: "#fee2e2" },
  "Sublime":      { color: "#7c2d12", bg: "#fed7aa" },
  "Ariel":        { color: "#0369a1", bg: "#e0f2fe" },
  "Sapolio":      { color: "#00B4A6", bg: "#ccfbf1" },
  "Ajinomoto":    { color: "#dc2626", bg: "#fee2e2" },
  "Nicolini":     { color: "#1d4ed8", bg: "#dbeafe" },
  "Molitalia":    { color: "#b91c1c", bg: "#fee2e2" },
  "Laive":        { color: "#16a34a", bg: "#dcfce7" },
  "Backus":       { color: "#1e3a5f", bg: "#dbeafe" },
  "San Fernando": { color: "#ea580c", bg: "#fed7aa" },
  "Emsal":        { color: "#0891b2", bg: "#cffafe" },
  "Bell's":       { color: "#b45309", bg: "#fef3c7" },
};

export default function BrandShowcase() {
  const { products } = useStoreProducts();

  const brands = useMemo(() => {
    const brandMap = new Map<string, number>();
    for (const p of products) {
      const brand = (p as Record<string, unknown>).brand as string | undefined;
      if (brand) brandMap.set(brand, (brandMap.get(brand) || 0) + 1);
    }
    return Array.from(brandMap.entries())
      .map(([name, count]) => ({ name, count, ...(BRAND_META[name] || { color: "#6b7280", bg: "#f3f4f6" }) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [products]);

  if (brands.length < 2) return null;

  return (
    <section className="py-10 sm:py-14 bg-white dark:bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-6">
          <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-3">
            Marcas
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
            Compra por <span className="text-primary">marca</span>
          </h2>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
          {brands.map((brand) => (
            <Link
              key={brand.name}
              href={`/tienda?marca=${encodeURIComponent(brand.name)}`}
              className={cn(
                "snap-start shrink-0 flex flex-col items-center gap-2 px-5 py-4 rounded-2xl",
                "border border-[var(--rule-soft)] dark:border-card-border",
                "hover:shadow-lg hover:scale-105 transition-all duration-[var(--dur-base)] cursor-pointer",
                "min-w-[100px]"
              )}
              style={{ backgroundColor: brand.bg + "40" }}
            >
              {/* Brand initial circle */}
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center text-white font-extrabold text-lg shadow-sm"
                style={{ backgroundColor: brand.color }}
              >
                {brand.name.charAt(0)}
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-gray-900 dark:text-foreground whitespace-nowrap">{brand.name}</p>
                <p className="text-[length:var(--ts-2xs)] text-gray-500">{brand.count} producto{brand.count !== 1 ? "s" : ""}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
