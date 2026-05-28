"use client";

/**
 * ComboSugerido — "Completá tu combo"
 *
 * Aparece si el carrito tiene items de comida pero NO bebida.
 * Heurística:
 *   - Es bebida si name/category incluye: bebida, gaseosa, agua, jugo,
 *     refresco, cerveza, chicha, limonada, soda, néctar, néctares, coca,
 *     inka, sprite, fanta, powerade, gatorade, kola.
 *   - Si hay ≥1 bebida en el carrito → NO muestra.
 *   - Si todos son bebida → NO muestra (no hay "comida" que combinar).
 *
 * Datos: GET /api/marketplace/catalog?storeSlug=SLUG&sort=popular&limit=12
 * Respuesta: { data: [{ productId, storeProductId, name, price (string), image,
 *              unit, category, stock, storeId, storeName, storeSlug }] }
 *
 * Solo muestra la primera tienda con comida (el carrito puede tener varias).
 */

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { PlusCircle, Layers, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart, type CartItem } from "@/hooks/use-marketplace-cart";

// ── Heurística bebida ────────────────────────────────────────────────────────

const DRINK_KEYWORDS = [
  "bebida", "gaseosa", "agua", "jugo", "refresco", "cerveza",
  "chicha", "limonada", "soda", "néctar", "néctares", "nectar",
  "coca", "inka", "sprite", "fanta", "powerade", "gatorade", "kola",
];

function looksLikeDrink(name: string, category?: string | null): boolean {
  const haystack = `${name} ${category ?? ""}`.toLowerCase();
  return DRINK_KEYWORDS.some((kw) => haystack.includes(kw));
}

// ── Tipos de la API ──────────────────────────────────────────────────────────

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

interface CatalogResponse {
  data: CatalogProduct[];
}

// ── Formato moneda ───────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

// ── Componente ───────────────────────────────────────────────────────────────

export default function ComboSugerido() {
  const { items, addItem } = useMarketplaceCart();

  // ¿Hay items de comida? ¿Ya hay bebida?
  const hasFood = items.some((i) => !looksLikeDrink(i.name, i.category));
  const hasDrink = items.some((i) => looksLikeDrink(i.name, i.category));

  // La primera tienda que tenga comida es la que buscamos bebidas para sugerir
  const foodStoreSlug = items.find(
    (i) => !looksLikeDrink(i.name, i.category),
  )?.storeSlug ?? null;

  const [drink, setDrink] = useState<CatalogProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const shouldShow = hasFood && !hasDrink && !dismissed && !!foodStoreSlug;

  useEffect(() => {
    if (!shouldShow) {
      setDrink(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDrink(null);
    fetch(
      `/api/marketplace/catalog?storeSlug=${encodeURIComponent(foodStoreSlug!)}&sort=popular&limit=12`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((json: CatalogResponse | null) => {
        if (cancelled || !json?.data) return;
        const found = json.data.find((p) =>
          looksLikeDrink(p.name, p.category),
        );
        if (!cancelled) setDrink(found ?? null);
      })
      .catch(() => {
        /* silently ignore — sección simplemente no aparece */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shouldShow, foodStoreSlug]);

  const handleAdd = useCallback(() => {
    if (!drink) return;
    const price = Number(drink.price);
    if (isNaN(price)) return;
    // Tomamos los datos de tienda del primer item de comida para mantener
    // coherencia (storeId puede no venir en CatalogProduct).
    const storeItem = items.find(
      (i) => i.storeSlug === drink.storeSlug && !looksLikeDrink(i.name, i.category),
    );
    if (!storeItem) return;
    addItem({
      storeId: storeItem.storeId,
      storeName: drink.storeName,
      storeSlug: drink.storeSlug,
      storeProductId: drink.storeProductId,
      productId: drink.productId,
      name: drink.name,
      price,
      image: drink.image,
      unit: drink.unit,
      category: drink.category,
      quantity: 1,
    } as CartItem);
    setAdded(true);
  }, [drink, items, addItem]);

  // Resetear el estado "añadido" si el carrito cambia (bebida añadida = ocultar)
  useEffect(() => {
    if (added) setAdded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  // Si no debe mostrarse, o si cargó y no encontró bebida → no renderizar
  if (!shouldShow) return null;
  if (!loading && drink === null) return null;

  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
        "overflow-hidden",
      )}
      aria-label="Sugerencia para completar tu combo"
    >
      {/* Cabecera */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Layers
            className="h-4 w-4 shrink-0 text-[var(--accent)]"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="text-[length:var(--ts-sm)] font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)]">
            Completá tu combo
          </span>
        </div>
        <button
          type="button"
          aria-label="Cerrar sugerencia de combo"
          onClick={() => setDismissed(true)}
          className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors min-h-[40px] px-2 -mr-2"
        >
          No, gracias
        </button>
      </div>

      <div className="px-5 py-4">
        {loading ? (
          <div className="flex items-center gap-3 text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span className="text-[length:var(--ts-sm)]">Buscando bebida...</span>
          </div>
        ) : drink ? (
          <div className="flex items-center gap-4">
            {/* Imagen */}
            <div className="relative h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-sunken)] border border-[var(--rule-soft)]">
              {drink.image ? (
                <Image
                  src={drink.image}
                  alt={drink.name}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <div className="h-full w-full" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-[length:var(--ts-sm)] font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)] line-clamp-1">
                {drink.name}
              </p>
              <p className="mt-0.5 text-[length:var(--ts-sm)] font-black tabular-nums text-[var(--text-primary)]">
                {fmt(Number(drink.price))}
              </p>
              {drink.storeName && (
                <p className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
                  {drink.storeName}
                </p>
              )}
            </div>

            {/* Botón agregar */}
            <button
              type="button"
              aria-label={`Agregar ${drink.name} al carrito`}
              onClick={handleAdd}
              disabled={added}
              className={cn(
                "shrink-0 inline-flex items-center gap-2 rounded-xl px-4 h-11 text-[length:var(--ts-sm)] font-bold",
                "border transition-all duration-200 min-w-[120px] justify-center",
                added
                  ? "border-[var(--data-success-500,#22c55e)] bg-[var(--data-success-50,#f0fdf4)] text-[var(--data-success-700,#15803d)] cursor-default"
                  : "border-[var(--accent)] bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90",
              )}
            >
              {added ? (
                "Agregado"
              ) : (
                <>
                  <PlusCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Agregar
                </>
              )}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
