"use client";

/**
 * MarketplaceCategoriesBar — sub-nav de categorías para MOBILE del marketplace.
 *
 * Por qué existe: el `MarketplaceSecondaryNav` (mega-menú) es `hidden md:block`,
 * así que en celular el home NO tenía barra de categorías — a diferencia del
 * storefront `/marketplace/[slug]`, que sí muestra chips horizontales. Esto
 * trae ESE mismo patrón (chips scrollables con icono, sticky bajo el navbar)
 * al home/listados, para que se vea igual que dentro de una tienda.
 *
 * Data REAL desde /api/marketplace/categories (tipos de tienda gestionados
 * desde superadmin). Cada chip navega a /marketplace/categoria/[id].
 *
 * Solo mobile (`md:hidden`) — en desktop manda el mega-menú existente.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getStoreCategoryIcon } from "@/components/marketplace/_category-icons";
import { cn } from "@/lib/utils";

interface MarketplaceCategory {
  id: string;
  label: string;
  imageUrl: string | null;
}

export default function MarketplaceCategoriesBar() {
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/categories")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const list = (d?.categories ?? []) as MarketplaceCategory[];
        // El store JSON incluye una entrada `_meta` sin label — descartarla
        // (y cualquier id interno con prefijo "_" o sin label).
        setCategories(list.filter((c) => c.label && !c.id.startsWith("_")));
      })
      .catch(() => {
        /* barra no crítica: si falla, no se muestra */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (categories.length === 0) return null;

  const activeId = pathname?.startsWith("/marketplace/categoria/")
    ? decodeURIComponent(pathname.split("/marketplace/categoria/")[1] ?? "").split("/")[0]
    : null;
  const isHome = pathname === "/marketplace";

  return (
    <div className="md:hidden sticky top-14 z-40 border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface-canvas)]/80">
      <nav
        aria-label="Categorías del marketplace"
        className="flex gap-2 overflow-x-auto no-scrollbar [&::-webkit-scrollbar]:hidden snap-x px-4 py-2.5"
        style={{ scrollbarWidth: "none" }}
      >
        {/* Chip "Todos" → vuelve al home del marketplace */}
        <Link
          href="/marketplace"
          aria-current={isHome ? "page" : undefined}
          className={cn(
            "snap-start shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-2 text-sm font-bold whitespace-nowrap transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
            isHome
              ? "bg-[var(--accent-600,var(--accent))] text-white border-[var(--accent)]"
              : "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--accent)]/60",
          )}
        >
          Todos
        </Link>

        {categories.map((cat) => {
          const Icon = getStoreCategoryIcon(cat.id);
          const active = activeId === cat.id;
          return (
            <Link
              key={cat.id}
              href={`/marketplace/categoria/${cat.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "snap-start shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-2 text-sm font-bold whitespace-nowrap transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                active
                  ? "bg-[var(--accent-600,var(--accent))] text-white border-[var(--accent)]"
                  : "bg-[var(--surface-raised)] border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--accent)]/60",
              )}
            >
              <Icon
                className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-[var(--accent)]")}
                strokeWidth={2}
                aria-hidden
              />
              {cat.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
