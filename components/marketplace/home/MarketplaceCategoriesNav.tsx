"use client";

/**
 * MarketplaceCategoriesNav — Navegación horizontal de categorías.
 *
 * Banner secundario que va apenas debajo del PromoBannerCarousel.
 * Permite saltar rápido a una categoría desde el home, sin scroll.
 * Visual: chips redondas con icon + label, scroll horizontal en mobile.
 */

import Link from "next/link";
import {
  ChefHat,
  Flame,
  Leaf,
  ShoppingBag,
  Beaker,
  Package,
  Sun,
  UtensilsCrossed,
  Droplets,
  Sparkles,
  Snowflake,
  ChevronRight,
  type LucideIcon,
} from "@buleje/design-system/icons";

interface Category {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: string;
}

const CATEGORIES: Category[] = [
  { href: "/marketplace?categoria=pollerias", icon: ChefHat, label: "Pollerías", badge: "HOT" },
  { href: "/marketplace?categoria=carnes", icon: Flame, label: "Carnes" },
  { href: "/marketplace?categoria=fruteria", icon: Leaf, label: "Frutería" },
  { href: "/marketplace?categoria=minimarket", icon: ShoppingBag, label: "Minimarket" },
  { href: "/marketplace?categoria=licorerias", icon: Beaker, label: "Licorerías" },
  { href: "/marketplace?categoria=panaderias", icon: Package, label: "Panaderías" },
  { href: "/marketplace?categoria=desayunos", icon: Sun, label: "Desayunos" },
  { href: "/marketplace?categoria=almuerzos", icon: UtensilsCrossed, label: "Almuerzos" },
  { href: "/marketplace?categoria=bebidas", icon: Droplets, label: "Bebidas" },
  { href: "/marketplace?categoria=heladeria", icon: Snowflake, label: "Heladería" },
  { href: "/marketplace?categoria=limpieza", icon: Sparkles, label: "Limpieza" },
];

export default function MarketplaceCategoriesNav() {
  return (
    <section className="border-y border-[var(--rule-soft)] bg-[var(--surface-raised)]">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs font-black uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Categorías rápidas
          </p>
          <Link
            href="/tiendas"
            className="group inline-flex items-center gap-1 text-xs font-black uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
          >
            Ver todas
            <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.75} />
          </Link>
        </div>

        {/* Horizontal scroll */}
        <div className="-mx-3 sm:-mx-4 lg:-mx-6 overflow-x-auto scrollbar-hide">
          <div className="inline-flex gap-2 px-3 sm:px-4 lg:px-6 pb-1">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <Link
                  key={cat.href}
                  href={cat.href}
                  className="group relative flex flex-col items-center justify-center gap-1.5 shrink-0 w-[78px] sm:w-[90px] rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-2 sm:p-2.5 transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] hover:shadow-md"
                >
                  {cat.badge && (
                    <span className="absolute -top-1.5 -right-1.5 inline-flex items-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider text-white shadow-md shadow-rose-500/40">
                      {cat.badge}
                    </span>
                  )}
                  <span className="inline-flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-primary)] transition-all group-hover:bg-[var(--accent)] group-hover:text-white group-hover:scale-110">
                    <Icon className="h-5 w-5 sm:h-5 sm:w-5" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="text-xs sm:text-xs font-black text-[var(--text-primary)] text-center leading-tight">
                    {cat.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
