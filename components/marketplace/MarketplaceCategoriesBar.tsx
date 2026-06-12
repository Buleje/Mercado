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

export default function MarketplaceCategoriesBar({ embedded = false }: { embedded?: boolean }) {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Brandon 2026-06-11: las subcategorías DEPENDEN del vertical de arriba. En la
  // home (embedded) usamos el vertical efectivo (default "comida"); standalone
  // solo acota si `?v=` viene explícito (preserva el "todo el catálogo" previo).
  const rawV = searchParams.get("v");
  const vertical = rawV ? normalizeVertical(rawV) : embedded ? "comida" : null;

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

  // Activo cuando estamos en /marketplace/buscar?cat=ID
  const activeCat =
    pathname === "/marketplace/buscar" ? searchParams.get("cat") : null;
  const isHome = pathname === "/marketplace" && !activeCat;

  // Brandon 2026-06-11 (rework mobile): tabs FLAT con subrayado de acento — sin
  // cápsulas redondeadas, sin fondo, sin sombra. Cohesivo con la fila de
  // verticales de arriba; más limpio y "elaborado".
  const tabBase =
    "snap-start shrink-0 inline-flex items-center gap-1 border-b-2 py-2 text-[13px] font-bold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  const tabActive = "border-[var(--accent)] text-[var(--accent)]";
  const tabIdle =
    "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]";

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
        className="flex gap-5 overflow-x-auto no-scrollbar [&::-webkit-scrollbar]:hidden snap-x px-4"
        style={{ scrollbarWidth: "none" }}
      >
        {/* "Todo" → home del marketplace */}
        <Link
          href="/marketplace"
          aria-current={isHome ? "page" : undefined}
          className={cn(tabBase, isHome ? tabActive : tabIdle)}
        >
          Todo
        </Link>

        {categories.map((cat) => {
          const Icon = getProductCategoryIcon(cat.id.toLowerCase());
          const active = activeCat === cat.id;
          return (
            <Link
              key={cat.id}
              href={`/marketplace/buscar?cat=${encodeURIComponent(cat.id)}`}
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
      </nav>
    </div>
  );
}
