"use client";

/**
 * MarketplaceCategoriesBar — sub-nav de categorías de PRODUCTO para MOBILE.
 *
 * Brandon 2026-05-27: antes mostraba RUBROS de tienda (Restaurantes, Bodegas…).
 * Ahora muestra las categorías de PRODUCTO reales del marketplace (Bebidas,
 * Carnes, Pollo, Snacks…), que es lo que el cliente realmente busca. Los rubros
 * de tienda siguen accesibles desde el drawer del navbar ("Explorar por rubro").
 *
 * Data REAL desde /api/marketplace/product-categories — solo categorías con ≥1
 * producto publicado (cero chips muertos). Cada chip lleva al buscador filtrado
 * (/marketplace/buscar?cat=ID), que muestra el grid de productos de esa
 * categoría cross-store.
 *
 * Solo mobile (`md:hidden`) — en desktop manda el mega-menú existente.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { getProductCategoryIcon } from "@/components/marketplace/_category-icons";
import { normalizeVertical } from "@/lib/marketplace/verticals";
import { cn } from "@/lib/utils";
import { cachedJson } from "@/lib/client-cache-fetch";

interface ProductCategory {
  id: string;
  count: number;
}

/** "pollo-brasa" → "Pollo brasa" · "bebidas" → "Bebidas" */
function prettyLabel(id: string): string {
  const spaced = id.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Barra CURADA (Brandon 2026-07-06): antes mostraba TODAS las subcategorías
 * (scroll largo + ítems nicho tipo "Guarniciones/Acompañamientos" como si
 * fueran nav principal). Ahora = top por cantidad de productos + chip "Ver
 * todo" al final. El catálogo completo sigue a un toque en /explorar.
 */
const TOP_SUBCATEGORIES = 7;

export default function MarketplaceCategoriesBar({ embedded = false }: { embedded?: boolean }) {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Brandon 2026-06-11: las subcategorías DEPENDEN del vertical de arriba.
  // Brandon 2026-07-05 (audit navegación): antes la home (embedded) forzaba
  // `vertical="comida"` cuando el "mundo" activo era "Todo" — mostraba en
  // secreto sub-rubros de Comida (Bebidas, Postres…) aunque arriba dijera
  // "Todo". Ahora sin `?v=` el scope es null = categorías cross-vertical reales
  // (honesto). Con un mundo elegido (?v=comida) se acota a ese mundo.
  const rawV = searchParams.get("v");
  const vertical = rawV ? normalizeVertical(rawV) : null;

  useEffect(() => {
    let cancelled = false;
    // cachedJson dedupea + cachea 5min. Scope por vertical → la URL (y la caché)
    // cambian con el vertical, así la barra refetch-ea al cambiar de mundo.
    const url = vertical
      ? `/api/marketplace/product-categories?v=${encodeURIComponent(vertical)}`
      : "/api/marketplace/product-categories";
    cachedJson<{ categories?: ProductCategory[] }>(url, 300_000)
      .then((d) => {
        if (cancelled || !d) return;
        const list = d.categories ?? [];
        setCategories(list.filter((c) => c.id && c.count > 0));
      })
      .catch(() => {
        /* barra no crítica: si falla, no se muestra */
      });
    return () => {
      cancelled = true;
    };
  }, [vertical]);

  // Brandon 2026-05-27: NO mostrar la barra dentro de una tienda
  // (/marketplace/[slug]). Ahí el storefront tiene su propia barra slim
  // (banner + retroceder + info) y su subnav de categorías del producto.
  // Una página de tienda = /marketplace/{slug} cuyo primer segmento NO es una
  // ruta reservada del marketplace.
  const MARKETPLACE_RESERVED = new Set([
    "apply", "buscar", "calificar-entrega", "carrito", "categoria",
    "como-pagar", "comparar", "en-vivo", "explorar", "favoritos",
    "gift-cards", "mi-cuenta", "negocios", "ofertas", "para-vos",
    "payment-result", "recetas", "registrar", "repartidor",
  ]);
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const isStorePage =
    segments[0] === "marketplace" &&
    segments.length >= 2 &&
    !MARKETPLACE_RESERVED.has(segments[1]);
  if (isStorePage) return null;

  if (categories.length === 0) return null;

  // Brandon 2026-06-12 (Q2 filtrado): en la HOME (embedded) la subcategoría
  // filtra EN EL LUGAR — setea ?cat= que el catálogo de la home ya consume
  // (CatalogUrlSync) y hace scroll a #catalogo. Standalone sigue yendo a /buscar.
  const activeCat = embedded
    ? (pathname === "/" ? searchParams.get("cat") : null)
    : (pathname === "/marketplace/buscar" ? searchParams.get("cat") : null);
  const isHome = embedded ? !activeCat : (pathname === "/marketplace" && !activeCat);

  /** href para la home preservando el vertical (?v=) + opcional ?cat=. */
  const homeHref = (cat?: string) => {
    const params = new URLSearchParams();
    const v = searchParams.get("v");
    if (v) params.set("v", v);
    if (cat) params.set("cat", cat);
    const qs = params.toString();
    return `/${qs ? `?${qs}` : ""}#catalogo`;
  };

  // Curación: top por cantidad de productos. Si el filtro activo cae fuera del
  // top, igual lo incluimos (para que el chip activo siempre se vea en la barra).
  const sortedCats = [...categories].sort((a, b) => b.count - a.count);
  const topCats = sortedCats.slice(0, TOP_SUBCATEGORIES);
  const visibleCategories =
    activeCat && !topCats.some((c) => c.id === activeCat)
      ? [
          ...(sortedCats.find((c) => c.id === activeCat)
            ? [sortedCats.find((c) => c.id === activeCat)!]
            : []),
          ...topCats,
        ]
      : topCats;
  const hasMore = categories.length > visibleCategories.length;

  // Brandon 2026-07-05 (audit navegación): en la HOME (embedded) esta fila de
  // subcategorías usa CÁPSULAS (pills), NO tabs subrayados. Antes ambas filas
  // —verticales ("mundos") y subcategorías— eran tabs idénticos que arrancaban
  // con "Todo": se leían como un duplicado ("Todo / Todo"). La cápsula marca
  // el segundo nivel como distinto del primero. Standalone (/marketplace)
  // conserva los tabs subrayados FLAT (Brandon 2026-06-11).
  const tabBase = embedded
    ? "snap-start shrink-0 inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] font-bold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    : "snap-start shrink-0 inline-flex items-center gap-1 border-b-2 py-2 text-[13px] font-bold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  const tabActive = embedded
    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
    : "border-[var(--accent)] text-[var(--accent)]";
  const tabIdle = embedded
    ? "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
    : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]";

  return (
    <div
      className={cn(
        "md:hidden border-b border-[var(--rule-soft)]",
        // `embedded` = vive DENTRO del bloque sticky de los verticales (home
        // mobile) → sin sticky/fondo propio. Standalone conserva su sticky.
        !embedded &&
          "sticky top-[52px] z-40 bg-[var(--surface-canvas)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface-canvas)]/80",
      )}
    >
      <nav
        aria-label="Categorías de productos"
        className={cn(
          "flex overflow-x-auto no-scrollbar [&::-webkit-scrollbar]:hidden snap-x px-4",
          embedded ? "gap-2 py-1.5" : "gap-5",
        )}
        style={{ scrollbarWidth: "none" }}
      >
        {/* "Todo" → limpia el filtro (home: ?cat= vacío · standalone: /marketplace) */}
        <Link
          href={embedded ? homeHref() : "/marketplace"}
          aria-current={isHome ? "page" : undefined}
          className={cn(tabBase, isHome ? tabActive : tabIdle)}
        >
          Todo
        </Link>

        {visibleCategories.map((cat) => {
          const Icon = getProductCategoryIcon(cat.id.toLowerCase());
          const active = activeCat === cat.id;
          return (
            <Link
              key={cat.id}
              href={embedded ? homeHref(cat.id) : `/marketplace/buscar?cat=${encodeURIComponent(cat.id)}`}
              aria-current={active ? "page" : undefined}
              className={cn(tabBase, active ? tabActive : tabIdle)}
            >
              <Icon
                className={cn("h-4 w-4 shrink-0", active ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]")}
                strokeWidth={2}
                aria-hidden
              />
              {prettyLabel(cat.id)}
            </Link>
          );
        })}

        {/* Escape hatch: el resto de categorías vive en /explorar (curamos la barra) */}
        {hasMore && (
          <Link
            href="/marketplace/explorar"
            className={cn(tabBase, tabIdle)}
            aria-label="Ver todas las categorías"
          >
            Ver todo
          </Link>
        )}
      </nav>
    </div>
  );
}
