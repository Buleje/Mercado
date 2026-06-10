"use client";

/**
 * MarketplaceNavRail — rail de navegación lateral estilo YouTube (Brandon
 * 2026-06-07). Vive AL LADO del contenido (en la columna izquierda del grid,
 * NO es un overlay). Dos estados:
 *   · Colapsado (~72px): solo las opciones rápidas (icono + label chico).
 *   · Expandido (~220px): TODAS las opciones (icono + label).
 * El toggle lo controla la hamburguesa del navbar (evento
 * `buleje:toggle-navrail`) o el botón ☰ propio del rail. El contenido del
 * marketplace se expande sobre el espacio que el rail libera al colapsar.
 *
 * Estilo: sólido, sin bordes, contraste por fill (surface-raised). Sticky bajo
 * el nav + sub-nav fijos.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  Home as HomeIcon,
  Store,
  Sparkles,
  Radio,
  ChefHat,
  Tag,
  Building2,
  Rocket,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type RailLink = {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** Visible en estado colapsado (acceso rápido). */
  quick?: boolean;
  matchPrefix?: string;
};

// Orden = orden de aparición. `quick` define qué se ve colapsado.
// Brandon 2026-06-08 (oleada nav): "Explorar" REMOVIDO (su /marketplace/explorar
// redirige a /marketplace) y "Bodegas" → "Mercado" (una sola palabra para
// /marketplace). Orden: los 3 primarios (Inicio·Tiendas·Mercado) arriba, luego
// secundarios. "Descubrí" → "Descubre" (tuteo).
const RAIL_LINKS: readonly RailLink[] = [
  { href: "/", label: "Inicio", Icon: HomeIcon, quick: true },
  { href: "/tiendas", label: "Tiendas", Icon: Store, quick: true, matchPrefix: "/tiendas" },
  { href: "/marketplace/para-vos", label: "Descubre", Icon: Sparkles, matchPrefix: "/marketplace/para-vos" },
  { href: "/marketplace/en-vivo", label: "En Vivo", Icon: Radio, quick: true, matchPrefix: "/marketplace/en-vivo" },
  { href: "/recetas", label: "Recetas", Icon: ChefHat, matchPrefix: "/recetas" },
  { href: "/marketplace/ofertas", label: "Ofertas", Icon: Tag, matchPrefix: "/marketplace/ofertas" },
  { href: "/negocios", label: "Negocios", Icon: Building2, quick: true, matchPrefix: "/negocios" },
  { href: "/abrir-tienda", label: "Abre tu Tienda", Icon: Rocket, quick: true, matchPrefix: "/abrir-tienda" },
];

export default function MarketplaceNavRail({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname() ?? "";
  const links = expanded ? RAIL_LINKS : RAIL_LINKS.filter((l) => l.quick);

  const isActive = (l: RailLink) =>
    l.matchPrefix ? pathname.startsWith(l.matchPrefix) : pathname === l.href;

  return (
    <nav
      aria-label="Navegación lateral del marketplace"
      className="bg-[var(--surface-raised)] p-2"
    >
      {/* Toggle ☰ — colapsa/expande (también lo dispara la hamburguesa del nav) */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={expanded ? "Colapsar menú lateral" : "Expandir menú lateral"}
        aria-expanded={expanded}
        className={cn(
          "flex items-center h-11 w-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
          expanded ? "gap-3 px-3" : "justify-center",
        )}
      >
        <Menu className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden="true" />
        {expanded && <span className="text-sm font-bold">Menú</span>}
      </button>

      <ul className="mt-1 space-y-0.5">
        {links.map((l) => {
          const active = isActive(l);
          const Icon = l.Icon;
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                title={!expanded ? l.label : undefined}
                /* Active state minimalista (Brandon 2026-06-10): solo una raya
                   debajo + texto fuerte. Sin fondo difuminado. Inactivo muestra
                   una raya gris sutil al hover. */
                className={cn(
                  "flex items-center border-b-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                  expanded ? "gap-3 px-3 h-11" : "flex-col gap-1 py-2.5 px-1",
                  active
                    ? "border-[var(--accent)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-secondary)] hover:border-[var(--rule-base)] hover:text-[var(--text-primary)]",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
                <span
                  className={cn(
                    "font-semibold truncate",
                    expanded ? "text-sm" : "text-[10px] leading-tight text-center w-full",
                  )}
                >
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
