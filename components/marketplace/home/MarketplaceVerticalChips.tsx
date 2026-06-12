"use client";

/**
 * MarketplaceVerticalChips — los "mundos" del Inicio (Brandon 2026-06-11 v2).
 *
 * Tabs horizontales (Comida · Bodega · Ferretería · Electro · Farmacia) que
 * filtran el catálogo vía `?v=` sin recargar. URL-driven = compartible + SSR.
 *
 * Brandon 2026-06-11 (rework mobile):
 *   - Solo se muestran los verticales QUE TIENEN tiendas. Si hay ≤1 → la fila
 *     entera se oculta (no hay nada que elegir). El componente es dueño de su
 *     propio contenedor/borde, así que al ocultarse no deja una barra vacía.
 *   - Estilo flat: tabs con subrayado de acento, SIN cajas redondeadas ni
 *     bordes/sombras. Más limpio y directo en celular.
 */

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  UtensilsCrossed,
  ShoppingBasket,
  Wrench,
  Smartphone,
  Pill,
  LayoutGrid,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { MARKETPLACE_VERTICALS, isValidVertical } from "@/lib/marketplace/verticals";
import { cachedJson } from "@/lib/client-cache-fetch";
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
  // Brandon 2026-06-12: "Todo" es el DEFAULT. Sólo hay vertical específico si el
  // `?v=` es uno válido; sino estamos en "Todo" (muestra todo, sin filtrar).
  const vParam = sp.get("v");
  const activeVertical = isValidVertical(vParam) ? vParam!.toLowerCase() : null;

  // Verticales que realmente tienen tiendas. null = aún cargando.
  const [activeIds, setActiveIds] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    cachedJson<{ verticals?: string[] }>("/api/marketplace/active-verticals", 300_000)
      .then((d) => { if (!cancelled) setActiveIds(d?.verticals ?? []); })
      .catch(() => { if (!cancelled) setActiveIds([]); });
    return () => { cancelled = true; };
  }, []);

  const select = (id: string) => {
    const params = new URLSearchParams(Array.from(sp.entries()));
    params.set("v", id);
    router.push(`/?${params.toString()}`, { scroll: false });
  };
  // "Todo" → quita el filtro de vertical (muestra todas las secciones).
  const selectAll = () => {
    const params = new URLSearchParams(Array.from(sp.entries()));
    params.delete("v");
    const qs = params.toString();
    router.push(`/${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  // Mientras carga, no pintamos nada (evita el flash de tabs que luego se ocultan).
  if (activeIds === null) return null;

  const shown = MARKETPLACE_VERTICALS.filter((v) => activeIds.includes(v.id));
  // Con ≤1 vertical real no hay nada que elegir (Todo + 1 sería redundante).
  if (shown.length <= 1) return null;

  const tabBase =
    "group inline-flex shrink-0 items-center gap-1.5 border-b-2 py-2.5 text-[13px] font-bold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";
  const tabActive = "border-[var(--accent)] text-[var(--accent)]";
  const tabIdle = "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]";

  return (
    <nav
      aria-label="Categorías del marketplace"
      className="border-b border-[var(--rule-soft)]"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* "Todo" — primero, activo por defecto (sin vertical específico) */}
          <button
            type="button"
            onClick={selectAll}
            aria-pressed={activeVertical === null}
            className={cn(tabBase, activeVertical === null ? tabActive : tabIdle)}
          >
            <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
            Todo
          </button>
          {shown.map((v) => {
            const Icon = ICONS[v.id] ?? UtensilsCrossed;
            const isActive = v.id === activeVertical;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => select(v.id)}
                aria-pressed={isActive}
                className={cn(tabBase, isActive ? tabActive : tabIdle)}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                {v.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/**
 * ShowForVerticals — muestra sus hijos SOLO cuando el vertical activo está en
 * `only`. URL-driven (reacciona a `?v=`).
 */
export function ShowForVerticals({ only, children }: { only: string[]; children: ReactNode }) {
  const sp = useSearchParams();
  const v = sp.get("v");
  const active = isValidVertical(v) ? v!.toLowerCase() : "todo";
  if (!only.includes(active)) return null;
  return <>{children}</>;
}

/**
 * ShowWhenAllVerticals — Brandon 2026-06-12: muestra sus hijos SOLO cuando NO
 * hay vertical específico (estado "Todo"). Al elegir una categoría puntual
 * (Comida/Ferretería) estas secciones (recién llegados, tiendas destacadas, lo
 * más pedido) se ocultan → queda solo el catálogo general filtrado.
 */
export function ShowWhenAllVerticals({ children }: { children: ReactNode }) {
  const sp = useSearchParams();
  if (isValidVertical(sp.get("v"))) return null; // vertical específico → oculto
  return <>{children}</>;
}
