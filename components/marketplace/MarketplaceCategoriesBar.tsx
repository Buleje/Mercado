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

export default function MarketplaceCategoriesBar() {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;
    // Brandon 2026-05-31 (audit home #2 dedup): cachedJson dedupea + cachea 5min.
    // Mismo URL que TiendasMainCategoriesGrid → comparten caché (coalescing), en
    // vez de cada consumidor pidiendo product-categories por separado.
    cachedJson<{ categories?: ProductCategory[] }>("/api/marketplace/product-categories", 300_000)
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
  }, []);

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

  // Minimalista (Brandon 2026-06-07): chips sólidos sin borde. Activo = fill
  // accent; idle = fill sunken; hover = accent-soft. Sin border-2 ni ring
  // decorativo (se mantiene focus-visible para a11y de teclado).
  const chipBase =
    "snap-start shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  const chipActive = "bg-[var(--accent)] text-white";
  const chipIdle =
    "bg-[var(--surface-sunken)] text-[var(--text-primary)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]";

  return (
    <div className="md:hidden sticky top-[52px] z-40 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface-canvas)]/80">
      <nav
        aria-label="Categorías de productos"
        className="flex gap-2 overflow-x-auto no-scrollbar [&::-webkit-scrollbar]:hidden snap-x px-4 py-2.5"
        style={{ scrollbarWidth: "none" }}
      >
        {/* Chip "Todo" → home del marketplace */}
        <Link
          href="/marketplace"
          aria-current={isHome ? "page" : undefined}
          className={cn(chipBase, isHome ? chipActive : chipIdle)}
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
              className={cn(chipBase, active ? chipActive : chipIdle)}
            >
              <Icon
                className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-[var(--accent)]")}
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
