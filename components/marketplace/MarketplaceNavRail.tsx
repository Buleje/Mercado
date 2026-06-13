"use client";

/**
 * MarketplaceNavRail — rail de navegación lateral estilo YouTube (Brandon
 * 2026-06-07 · v2 2026-06-13). Vive AL LADO del contenido (columna izquierda
 * del grid, NO es overlay). Brandon 2026-06-13: SIN hamburguesa — el rail SIEMPRE
 * muestra TODOS los enlaces (Inicio·Tiendas·Descubre·Recetas·Ofertas·Abre tu
 * Tienda) en formato compacto (icono + label chico, vertical). Minimalista pero
 * completo: ya no hace falta expandir para ver el resto.
 *
 * Estilo: sólido, sin bordes, contraste por fill (surface-raised). Sticky bajo
 * el nav + sub-nav fijos.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home as HomeIcon,
  Store,
  Sparkles,
  ChefHat,
  Tag,
  Rocket,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type RailLink = {
  href: string;
  label: string;
  Icon: LucideIcon;
  matchPrefix?: string;
};

// Orden = orden de aparición. TODOS visibles (sin estado colapsado).
// "En Vivo" y "Negocios" siguen ocultos del rail (Brandon 2026-06-10).
const RAIL_LINKS: readonly RailLink[] = [
  { href: "/", label: "Inicio", Icon: HomeIcon },
  { href: "/tiendas", label: "Tiendas", Icon: Store, matchPrefix: "/tiendas" },
  { href: "/marketplace/ofertas", label: "Ofertas", Icon: Tag, matchPrefix: "/marketplace/ofertas" },
  { href: "/recetas", label: "Recetas", Icon: ChefHat, matchPrefix: "/recetas" },
  { href: "/marketplace/para-vos", label: "Descubre", Icon: Sparkles, matchPrefix: "/marketplace/para-vos" },
  { href: "/abrir-tienda", label: "Abre tu Tienda", Icon: Rocket, matchPrefix: "/abrir-tienda" },
];

export default function MarketplaceNavRail() {
  const pathname = usePathname() ?? "";

  const isActive = (l: RailLink) =>
    l.matchPrefix ? pathname.startsWith(l.matchPrefix) : pathname === l.href;

  return (
    <nav
      aria-label="Navegación lateral del marketplace"
      className="bg-[var(--surface-raised)] p-2"
    >
      <ul className="space-y-0.5">
        {RAIL_LINKS.map((l) => {
          const active = isActive(l);
          const Icon = l.Icon;
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                /* Compacto vertical: icono + label chico centrado (wrap para
                   labels largos como "Abre tu Tienda"). Activo = raya + texto
                   fuerte; inactivo = raya gris al hover. Brandon 2026-06-13. */
                className={cn(
                  "flex flex-col items-center gap-1 border-b-2 py-2.5 px-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                  active
                    ? "border-[var(--accent)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:border-[var(--rule-base)] hover:text-[var(--text-primary)]",
                )}
              >
                <Icon className="h-[1.35rem] w-[1.35rem] shrink-0" strokeWidth={1.9} aria-hidden="true" />
                <span className="w-full text-center text-[10px] font-semibold leading-tight">
                  {l.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
