"use client";

/**
 * ProductSideNav — barra lateral de navegación del PDP (desktop).
 *
 * Rail sticky a la izquierda del contenido inferior: salta a cada sección del
 * producto (descripción, detalles, combo, opiniones, recomendados, catálogo) y
 * vuelve a la tienda. En mobile se oculta (queda la barra de tabs horizontal).
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
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  storeSlug: string;
  storeName: string;
  hasRelated: boolean;
  className?: string;
}

export function ProductSideNav({ storeSlug, storeName, hasRelated, className }: Props) {
  const items: { href: string; label: string; icon: typeof FileText }[] = [
    { href: "#descripcion", label: "Descripción", icon: FileText },
    { href: "#detalles", label: "Detalles", icon: ListChecks },
    { href: "#combo", label: "Compralos juntos", icon: ShoppingBag },
    { href: "#valoraciones", label: "Opiniones", icon: Star },
    ...(hasRelated ? [{ href: "#recomendados", label: "Te puede interesar", icon: Sparkles }] : []),
    { href: "#explorar", label: "Más del catálogo", icon: LayoutGrid },
  ];

  return (
    <nav aria-label="Navegación del producto" className={cn("self-start lg:sticky lg:top-24", className)}>
      <p className="px-3 pb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        En esta página
      </p>
      <ul className="space-y-0.5">
        {items.map((it) => {
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
      </ul>

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
