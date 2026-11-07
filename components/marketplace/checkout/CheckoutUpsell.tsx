"use client";

/**
 * CheckoutUpsell — sección "¿Le sumás algo?" en el paso confirmar.
 *
 * Lógica:
 *  1. Toma el primer storeSlug del carrito.
 *  2. GET /api/marketplace/catalog?storeSlug=SLUG&sort=popular&limit=12
 *  3. Filtra precio <= MAX_PRICE y excluye lo que ya está en el carrito.
 *  4. Muestra máx 3 chips. Si no hay sugerencias, no renderiza nada.
 *
 * REGLA CRÍTICA: NO altera totales ni lógica de pago. Solo llama addItem
 * (igual que cualquier página de catálogo). El backend re-valida en el POST.
 */

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Plus, Zap } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

const MAX_PRICE = 10; // S/10 — snacks/bebidas baratos
const MAX_ITEMS = 3;

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

/** Shape que devuelve /api/marketplace/catalog */
interface CatalogProduct {
  productId: number;
  storeProductId: string;
  name: string;
  price: string | number;
  image: string | null;
  unit: string | null;
  category: string | null;
  stock: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
}

export default function CheckoutUpsell() {
  const { items, addItem } = useMarketplaceCart();
  const [suggestions, setSuggestions] = useState<CatalogProduct[]>([]);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  // storeSlug del primer item en el carrito
  const firstStoreSlug = items[0]?.storeSlug ?? null;
  // Set de productIds ya en el carrito (para exclusión)
  const cartProductIds = new Set(items.map((i) => i.productId));

  const fetchSuggestions = useCallback(async (slug: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/marketplace/catalog?storeSlug=${encodeURIComponent(slug)}&sort=popular&limit=12`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { data?: CatalogProduct[] };
      const candidates = (json.data ?? [])
        .filter((p) => {
          const price = typeof p.price === "string" ? parseFloat(p.price) : p.price;
          return price <= MAX_PRICE && !cartProductIds.has(p.productId) && p.stock > 0;
        })
        .slice(0, MAX_ITEMS);
      setSuggestions(candidates);
    } catch {
      // silently ignore — upsell es non-critical
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // cartProductIds se usa en render-time filter, no necesita dep aquí

  useEffect(() => {
    if (!firstStoreSlug) return;
    fetchSuggestions(firstStoreSlug);
  }, [firstStoreSlug, fetchSuggestions]);

  // Re-filtrar en cliente si cambia el carrito después del fetch
  const visible = suggestions.filter((p) => !cartProductIds.has(p.productId));

  if (loading || visible.length === 0) return null;

  const handleAdd = (p: CatalogProduct) => {
    const price = typeof p.price === "string" ? parseFloat(p.price) : p.price;
    addItem({
      storeId: p.storeId,
      storeName: p.storeName,
      storeSlug: p.storeSlug,
      storeProductId: p.storeProductId,
      productId: p.productId,
      name: p.name,
      price,
      image: p.image,
      unit: p.unit,
      category: p.category,
      quantity: 1,
    });
    setAdded((prev) => new Set(prev).add(p.productId));
  };

  return (
    <section
      aria-label="Sugerencias para agregar al pedido"
      className={cn(
        "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6",
        "space-y-4",
      )}
    >
      {/* Header compacto */}
      <header className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <Zap className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </span>
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
            Para tu pedido
          </p>
          <p className="text-sm font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none">
            ¿Le sumás algo?
          </p>
        </div>
      </header>

      {/* Chips de producto */}
      <ul className="flex flex-col gap-2">
        {visible.map((p) => {
          const price = typeof p.price === "string" ? parseFloat(p.price) : p.price;
          const isAdded = added.has(p.productId);

          return (
            <li key={p.productId}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                  isAdded
                    ? "border-[var(--accent)]/40 bg-primary/10"
                    : "border-[var(--rule-soft)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/30",
                )}
              >
                {/* Imagen */}
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-sunken)]">
                  {p.image ? (
                    <Image
                      src={p.image}
                      alt={p.name}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[length:var(--ts-lg)] text-[var(--text-tertiary)]">
                      —
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[length:var(--ts-xs)] font-bold text-[var(--text-primary)] truncate">
                    {p.name}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] tabular-nums font-black text-[var(--accent)]">
                    {fmt(price)}
                  </p>
                </div>

                {/* Botón + */}
                <button
                  type="button"
                  aria-label={isAdded ? `${p.name} ya agregado` : `Agregar ${p.name}`}
                  disabled={isAdded}
                  onClick={() => handleAdd(p)}
                  className={cn(
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                    isAdded
                      ? "bg-[var(--accent)] text-white cursor-default"
                      : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white hover:scale-110 active:scale-95",
                  )}
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
