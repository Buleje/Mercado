"use client";

/**
 * CatalogSortTabs — Audit mobile #6 (Brandon 2026-06-11).
 *
 * Tabs de orden para la sección "Todos los productos": un solo grid que se
 * REORDENA (Destacados · Nuevos · Menor precio · Mejor valorado) en vez de
 * tener 3 carruseles con productos repetidos. Setea `?sort=` que el catálogo
 * de la home ya consume (CatalogUrlSync → CatalogFilterContext → grid).
 *
 * Estilo flat con subrayado de acento, cohesivo con la nav del Inicio.
 */

import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "popular", label: "Destacados" },
  { id: "newest", label: "Nuevos" },
  { id: "price_asc", label: "Menor precio" },
  { id: "rating", label: "Mejor valorado" },
] as const;

export default function CatalogSortTabs() {
  const sp = useSearchParams();
  const router = useRouter();
  // Sin `?sort=` el catálogo arranca en "popular" → Destacados activo.
  const active = (sp.get("sort")?.toLowerCase() ?? "popular");

  const select = (id: string) => {
    const params = new URLSearchParams(Array.from(sp.entries()));
    params.set("sort", id);
    // scroll:false → el grid se reordena en el lugar (no salta al tope).
    router.push(`/?${params.toString()}#catalogo`, { scroll: false });
  };

  return (
    <nav aria-label="Ordenar productos" className="mb-3 border-b border-[var(--rule-soft)]">
      <div className="flex gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => select(t.id)}
              aria-pressed={isActive}
              className={cn(
                "shrink-0 border-b-2 py-2.5 text-[13px] font-bold whitespace-nowrap transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                isActive
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
