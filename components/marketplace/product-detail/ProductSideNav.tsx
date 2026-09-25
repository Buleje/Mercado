"use client";

/**
 * ProductSideNav — barra lateral de navegación del PDP (desktop).
 *
 * Permite NAVEGAR la tienda sin salir del producto: lista las categorías del
 * negocio (al hacer click filtra el catálogo de abajo y scrollea), más accesos
 * directos a cada sección del producto y un "volver a la tienda". Sticky en
 * desktop; en mobile se oculta (quedan las tabs horizontales + chips).
 */

import Link from "next/link";
import {
  FileText,
  ListChecks,
  ShoppingBag,
  Star,
  Sparkles,
  LayoutGrid,
  ArrowLeft,
  Tag,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { CATALOG_ALL } from "./ProductCatalogExplorer";

interface Props {
  storeSlug: string;
  storeName: string;
  hasRelated: boolean;
  categories: string[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  className?: string;
}

const SECTIONS: { href: string; label: string; icon: typeof FileText }[] = [
  { href: "#descripcion", label: "Descripción", icon: FileText },
  { href: "#detalles", label: "Detalles", icon: ListChecks },
  { href: "#combo", label: "Compralos juntos", icon: ShoppingBag },
  { href: "#valoraciones", label: "Opiniones", icon: Star },
];

export function ProductSideNav({
  storeSlug,
  storeName,
  hasRelated,
  categories,
  activeCategory,
  onCategoryChange,
  className,
}: Props) {
  const goCategory = (cat: string) => {
    onCategoryChange(cat);
    if (typeof document !== "undefined") {
      const el = document.getElementById("explorar");
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  };

  const sections = hasRelated
    ? [...SECTIONS, { href: "#recomendados", label: "Te puede interesar", icon: Sparkles }]
    : SECTIONS;

  return (
    <nav aria-label="Navegación del producto y la tienda" className={cn("self-start lg:sticky lg:top-24", className)}>
      {/* Categorías de la tienda — navegar el catálogo */}
      {categories.length > 0 && (
        <div className="mb-4">
          <p className="px-3 pb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Categorías de {storeName}
          </p>
          <ul className="space-y-0.5">
            <li>
              <CatRow active={activeCategory === CATALOG_ALL} label="Todos" onClick={() => goCategory(CATALOG_ALL)} />
            </li>
            {categories.map((c) => (
              <li key={c}>
                <CatRow active={activeCategory === c} label={c.replace(/_/g, " ")} onClick={() => goCategory(c)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Secciones del producto */}
      <div className="border-t border-[var(--rule-soft)] pt-3">
        <p className="px-3 pb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          En esta página
        </p>
        <ul className="space-y-0.5">
          {sections.map((it) => {
            const Icon = it.icon;
            return (
              <li key={it.href}>
                <a
                  href={it.href}
                  className="flex items-center gap-2.5 rounded-md px-3 h-10 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                >
                  <Icon className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden strokeWidth={1.75} />
                  <span className="truncate">{it.label}</span>
                </a>
              </li>
            );
          })}
          <li>
            <a
              href="#explorar"
              className="flex items-center gap-2.5 rounded-md px-3 h-10 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <LayoutGrid className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden strokeWidth={1.75} />
              <span className="truncate">Más del catálogo</span>
            </a>
          </li>
        </ul>
      </div>

      <div className="mt-3 border-t border-[var(--rule-soft)] pt-3">
        <Link
          href={`/marketplace/${storeSlug}`}
          className="flex items-center gap-2.5 rounded-md px-3 h-10 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--surface-sunken)]"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
          <span className="truncate">Volver a {storeName}</span>
        </Link>
      </div>
    </nav>
  );
}

function CatRow({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-3 h-10 text-left text-sm transition-colors",
        active
          ? "bg-[var(--accent)] font-semibold text-white"
          : "font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
      )}
    >
      <Tag className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-[var(--text-tertiary)]")} aria-hidden strokeWidth={1.75} />
      <span className="truncate capitalize">{label}</span>
    </button>
  );
}
