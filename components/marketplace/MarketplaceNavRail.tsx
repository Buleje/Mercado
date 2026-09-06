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
  ChefHat,
  Tag,
  Rocket,
  MessageCircle,
  Crown,
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
// Brandon 2026-07-05 (audit navegación): rail en DOS grupos separados por un
// divisor — arriba lo del COMPRADOR (comprar/pedir), abajo lo de VENDER /
// membresía. Antes iban todos juntos y el comprador veía "Abre tu Tienda" y
// "Socio" mezclados con "Inicio/Tiendas" sin señal de que son otro mundo.
const RAIL_GROUPS: readonly (readonly RailLink[])[] = [
  // ── Comprar / pedir ──
  [
    { href: "/", label: "Inicio", Icon: HomeIcon },
    { href: "/tiendas", label: "Tiendas", Icon: Store, matchPrefix: "/tiendas" },
    // Chat estilo Messenger — página propia (Brandon 2026-06-14). El icono del
    // nav abre el panel flotante; este lleva a la página completa /chat.
    { href: "/chat", label: "Chat", Icon: MessageCircle, matchPrefix: "/chat" },
    { href: "/marketplace/ofertas", label: "Ofertas", Icon: Tag, matchPrefix: "/marketplace/ofertas" },
    { href: "/recetas", label: "Recetas", Icon: ChefHat, matchPrefix: "/recetas" },
    // "Descubre" (/marketplace/para-vos) removido del rail — Brandon 2026-06-14.
  ],
  // ── Vender / membresía ──
  [
    { href: "/abrir-tienda", label: "Abre tu Tienda", Icon: Rocket, matchPrefix: "/abrir-tienda" },
    // Membresía Socio Buleje (Brandon 2026-07-04).
    { href: "/socio-buleje", label: "Socio", Icon: Crown, matchPrefix: "/socio-buleje" },
  ],
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
      {RAIL_GROUPS.map((group, gi) => (
        <div key={gi}>
          {/* Divisor entre grupos (comprar ↑ / vender ↓). No antes del 1º. */}
          {gi > 0 && (
            <div className="mx-1 my-1.5 h-px bg-[var(--rule-soft)]" aria-hidden="true" />
          )}
          <ul className="space-y-0.5">
            {group.map((l) => {
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
        </div>
      ))}
    </nav>
  );
}
