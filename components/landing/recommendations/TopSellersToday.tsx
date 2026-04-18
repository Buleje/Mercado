"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SectionHeader, Chip } from "@/components/ui-system";
import { ProductCard } from "@/components/ProductCard";
import { pickTopN, pickByCategory, type MockProduct } from "@/lib/recommendations/mock";
import { cn } from "@/lib/utils";

interface Props {
  initialProducts: MockProduct[];
  className?: string;
}

const CATEGORY_FILTERS = [
  { label: "Todos", value: "todos" },
  { label: "Frescos", value: "fruta" },
  { label: "Abarrotes", value: "abarrote" },
  { label: "Bebidas", value: "bebida" },
  { label: "Carnes", value: "carne" },
];

/**
 * TopSellersToday — "Popular hoy / Los mas pedidos en tu zona"
 *
 * Chips de categoria como filtro rapido.
 * Grid de 6-8 productos en horizontal scroll con snap-x mandatory en mobile,
 * grid estandar en desktop.
 */
export function TopSellersToday({ initialProducts, className }: Props) {
  const [activeFilter, setActiveFilter] = useState("todos");

  const filtered =
    activeFilter === "todos"
      ? pickTopN(initialProducts, 8)
      : pickByCategory(initialProducts, activeFilter, 8);

  // Si no hay productos en la categoria seleccionada, caemos a top global
  const picks = filtered.length > 0 ? filtered : pickTopN(initialProducts, 8);

  return (
    <section
      className={cn(
        "py-12 sm:py-16 border-t border-[var(--rule-soft)] bg-gray-50 dark:bg-gray-900/40",
        className
      )}
      aria-labelledby="top-sellers-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Popular hoy"
          title="Los mas pedidos en tu zona"
          description="Lo que tus vecinos ya estan comprando esta semana."
          size="md"
          ruled
          className="mb-6"
          action={
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:opacity-80 transition-opacity hidden sm:inline-flex"
              aria-label="Ver todas las ofertas"
            >
              Ver todas <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            </Link>
          }
        />

        {/* Chips de filtro rapido */}
        <div
          className="flex items-center gap-2 overflow-x-auto pb-3 scrollbar-hide"
          role="group"
          aria-label="Filtrar por categoria"
        >
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              aria-pressed={activeFilter === f.value}
              className={cn(
                "shrink-0 inline-flex items-center h-8 px-3 rounded-full text-[11px] font-semibold border transition-all duration-150",
                activeFilter === f.value
                  ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                  : "bg-white dark:bg-gray-900 text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Grid con scroll horizontal en mobile, grid en desktop */}
        <div
          className={cn(
            // Mobile: horizontal scroll
            "flex gap-3 overflow-x-auto snap-x snap-mandatory pb-3 scrollbar-hide",
            // Tablet+: grid
            "sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0",
            // Desktop: 4 columnas
            "lg:grid-cols-4"
          )}
          aria-label="Productos mas vendidos"
        >
          {picks.map((p) => (
            <div
              key={p.id}
              className="shrink-0 w-[160px] sm:w-auto snap-start"
            >
              <ProductCard
                product={{
                  ...p,
                  image: p.image ?? "",
                  stock: p.stock,
                  isTopSeller: true,
                }}
              />
            </div>
          ))}
        </div>

        {/* CTA mobile */}
        <div className="mt-5 sm:hidden text-center">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:opacity-80 transition-opacity"
          >
            Ver todos los populares <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </section>
  );
}
