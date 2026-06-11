"use client";

/**
 * MarketplaceVerticalChips — los "mundos" del Inicio (Brandon 2026-06-11).
 *
 * Chips horizontales: Comida · Bodega · Ferretería · Electro · Farmacia.
 * El Inicio arranca food-first (default "comida"); un toque cambia de mundo y
 * filtra el catálogo (vía `?v=` → CatalogUrlSync → CatalogFilterContext) sin
 * recargar. URL-driven = compartible + SSR-friendly, sin lifting de provider.
 *
 * Regla de corte: NO comestible/no — es "elijo la tienda" (comida preparada →
 * Comida) vs "comparo precio del producto" (commodity → catálogo). Ver la
 * conversación de IA con Brandon.
 */

import { useSearchParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  UtensilsCrossed,
  ShoppingBasket,
  Wrench,
  Smartphone,
  Pill,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { MARKETPLACE_VERTICALS, normalizeVertical } from "@/lib/marketplace/verticals";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  comida: UtensilsCrossed,
  bodega: ShoppingBasket,
  ferreteria: Wrench,
  electro: Smartphone,
  farmacia: Pill,
};

export default function MarketplaceVerticalChips() {
  const sp = useSearchParams();
  const router = useRouter();
  const active = normalizeVertical(sp.get("v"));

  const select = (id: string) => {
    // Conserva otros params (sort, cat). Soft-nav sin saltar al tope: el
    // catálogo y las secciones food-only reaccionan al cambio de `?v=`.
    const params = new URLSearchParams(Array.from(sp.entries()));
    params.set("v", id);
    router.push(`/?${params.toString()}`, { scroll: false });
  };

  return (
    <nav
      aria-label="Categorías del marketplace"
      className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8"
    >
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MARKETPLACE_VERTICALS.map((v) => {
          const Icon = ICONS[v.id] ?? UtensilsCrossed;
          const isActive = v.id === active;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => select(v.id)}
              aria-pressed={isActive}
              className={cn(
                "inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl border-2 px-4 text-sm font-bold whitespace-nowrap transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                isActive
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--text-primary)] hover:text-[var(--text-primary)]",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
              {v.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * ShowForVerticals — muestra sus hijos SOLO cuando el vertical activo está en
 * `only`. Sirve para que las secciones food-céntricas (ej. "Lo más pedido hoy")
 * desaparezcan al cambiar a Ferretería/Electro, dejando el catálogo filtrado
 * como protagonista. URL-driven (reacciona a `?v=`).
 */
export function ShowForVerticals({ only, children }: { only: string[]; children: ReactNode }) {
  const sp = useSearchParams();
  const active = normalizeVertical(sp.get("v"));
  if (!only.includes(active)) return null;
  return <>{children}</>;
}
