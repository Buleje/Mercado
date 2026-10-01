"use client";

/**
 * CategoriasQuickAccess — 8 categorías top con iconos grandes en single row.
 *
 * Ubicacion: justo después del PromoBannerCarousel en /marketplace.
 * Da acceso instantaneo a las categorias mas usadas sin scroll.
 *
 * Cada chip:
 *   - Aspect-square con icono grande arriba + label abajo.
 *   - Click → /marketplace/categoria/{slug}.
 *   - Hover lift sutil + accent border.
 */

import Link from "next/link";
import {
  ShoppingBasket,
  Leaf,
  ChefHat,
  Droplets,
  Gift,
  Package,
  Sparkles,
  HeartPulse,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type QuickCat = {
  slug: string;
  label: string;
  Icon: LucideIcon;
};

const CATS: QuickCat[] = [
  { slug: "abarrotes", label: "Abarrotes", Icon: ShoppingBasket },
  { slug: "frutas-verduras", label: "Frutas", Icon: Leaf },
  { slug: "carnes", label: "Carnes", Icon: ChefHat },
  { slug: "lacteos", label: "Lácteos", Icon: Droplets },
  { slug: "bebidas", label: "Bebidas", Icon: Gift },
  { slug: "panaderia", label: "Panadería", Icon: Package },
  { slug: "limpieza-hogar", label: "Limpieza", Icon: Sparkles },
  { slug: "farmacia", label: "Farmacia", Icon: HeartPulse },
];

export default function CategoriasQuickAccess() {
  return (
    <section
      aria-label="Categorias rapidas"
      className="w-full pt-6 sm:pt-8"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Mobile: scroll horizontal · Desktop: grid 8 cols */}
        <div className="flex sm:grid sm:grid-cols-8 gap-3 sm:gap-4 overflow-x-auto sm:overflow-visible scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          {CATS.map((cat) => {
            const Icon = cat.Icon;
            return (
              <Link
                key={cat.slug}
                href={`/marketplace/categoria/${cat.slug}`}
                className={cn(
                  "group flex flex-col items-center gap-2 rounded-xl py-4 sm:py-5 px-3",
                  "border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
                  "hover:border-[var(--accent)]/40 hover:-translate-y-1 hover:shadow-[0_8px_20px_-12px_color-mix(in oklab, var(--accent) 25%, transparent)]",
                  "transition-all duration-200",
                  "min-w-[88px] sm:min-w-0 shrink-0 sm:shrink",
                )}
              >
                <span
                  className={cn(
                    "flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full",
                    "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                    "transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/10 group-hover:text-[var(--accent)]",
                  )}
                >
                  <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.5} aria-hidden />
                </span>
                <span className="text-[length:var(--ts-xs)] sm:text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] text-center group-hover:text-[var(--accent)] transition-colors">
                  {cat.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
