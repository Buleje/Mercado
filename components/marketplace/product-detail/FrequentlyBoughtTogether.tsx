"use client";

/**
 * FrequentlyBoughtTogether — "Comprados juntos" (Brandon 2026-06-14, rediseño
 * estilo MercadoLibre: bordes RECTOS, tipografía suave, sin colores neón).
 *
 * UI: tarjeta con items en fila unidos por "+", cada uno con checkbox
 * (todos marcados por defecto), footer con TOTAL y botón "Agregar combo".
 *
 * Datos: GET /api/marketplace/recommendations/[productId] (co-compra). Si viene
 * vacío, FALLBACK a /api/marketplace/catalog para que la sección SIEMPRE muestre
 * algo (antes se auto-ocultaba en catálogos sin co-compra).
 */

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ShoppingCart, Plus } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

type RP = {
  productId: number;
  name: string;
  price: number;
  image: string | null;
  storeSlug?: string;
  storeName?: string;
  storeId?: string;
  storeProductId?: string;
  unit?: string | null;
  category?: string | null;
};

interface Props {
  productId: number;
  storeId: string;
  storeName: string;
  storeSlug: string;
  /** Producto actual del PDP — ancla del combo ("Este producto + …"). */
  anchor?: RP | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

function norm(raw: Record<string, unknown>): RP {
  const store = (raw.store ?? {}) as Record<string, unknown>;
  const images = Array.isArray(raw.images) ? (raw.images as string[]) : [];
  return {
    productId: Number(raw.productId ?? raw.id),
    name: String(raw.name ?? ""),
    price: Number(raw.price ?? 0),
    image: (raw.image as string) ?? images[0] ?? null,
    storeSlug: (raw.storeSlug as string) ?? (store.slug as string) ?? undefined,
    storeName: (raw.storeName as string) ?? (store.name as string) ?? undefined,
    storeId: (raw.storeId as string) ?? (store.id as string) ?? undefined,
    storeProductId: (raw.storeProductId as string) ?? undefined,
    unit: (raw.unit as string) ?? null,
    category: (raw.category as string) ?? null,
  };
}

export default function FrequentlyBoughtTogether({ productId, storeId, storeName, storeSlug, anchor }: Props) {
  const { addItem } = useMarketplaceCart();
  const [items, setItems] = useState<RP[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [addedAll, setAddedAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let list: RP[] = [];
      try {
        const r = await fetch(`/api/marketplace/recommendations/${productId}`);
        if (r.ok) {
          const j = await r.json();
          list = (Array.isArray(j.products) ? j.products : []).map(norm);
        }
      } catch {/* sigue al fallback */}
      if (list.length === 0) {
        try {
          const r = await fetch(`/api/marketplace/catalog?limit=8`);
          if (r.ok) {
            const j = await r.json();
            const raw = Array.isArray(j.data) ? j.data : Array.isArray(j.items) ? j.items : [];
            list = raw.map(norm);
          }
        } catch {/* queda vacío */}
      }
      const clean = list.filter((p) => p.productId && p.productId !== productId && p.name).slice(0, 3);
      // El producto actual abre el combo como ancla ("Este producto + …").
      const withAnchor = anchor ? [anchor, ...clean] : clean;
      if (!cancelled) {
        setItems(withAnchor);
        setSelected(new Set(withAnchor.map((p) => p.productId)));
      }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }, []);

  const handleAddAll = useCallback(() => {
    if (!items) return;
    const chosen = items.filter((p) => selected.has(p.productId));
    for (const p of chosen) {
      addItem({
        storeId: p.storeId ?? storeId,
        storeName: p.storeName ?? storeName,
        storeSlug: p.storeSlug ?? storeSlug,
        storeProductId: p.storeProductId ?? String(p.productId),
        productId: p.productId,
        name: p.name,
        price: p.price,
        basePrice: p.price,
        image: p.image ?? null,
        unit: p.unit ?? null,
        category: p.category ?? null,
        quantity: 1,
      });
    }
    setAddedAll(true);
    setTimeout(() => setAddedAll(false), 2000);
  }, [items, selected, addItem, storeId, storeName, storeSlug]);

  // Loading
  if (items === null) {
    return (
      <section aria-label="Cargando combo" className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
        <div className="h-5 w-48 rounded-md bg-[var(--surface-sunken)] animate-pulse mb-4" />
        <div className="flex gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 w-36 rounded-xl bg-[var(--surface-sunken)] animate-pulse" />
          ))}
        </div>
      </section>
    );
  }
  // Sin complementos (solo el ancla) no tiene sentido mostrar el combo.
  if (items.length <= (anchor ? 1 : 0)) return null;

  const chosen = items.filter((p) => selected.has(p.productId));
  const total = chosen.reduce((a, p) => a + p.price, 0);

  return (
    <section
      aria-labelledby="fbt-heading"
      className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]"
    >
      <header className="flex items-center gap-3 border-b border-[var(--rule-soft)] px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
          <ShoppingCart className="h-5 w-5 text-[var(--accent)]" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="fbt-heading" className="text-base sm:text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
            Cómpralos juntos
          </h2>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
            Este producto + lo que suele acompañarlo · una sola entrega
          </p>
        </div>
      </header>

      {/* Fila de items unidos por "+" (estilo bundle) */}
      <div className="flex items-stretch gap-3 overflow-x-auto px-5 pt-5 pb-3">
        {items.map((p, idx) => {
          const isSel = selected.has(p.productId);
          const isAnchor = anchor != null && p.productId === anchor.productId;
          const href = `/marketplace/${p.storeSlug ?? storeSlug}/producto/${p.productId}`;
          return (
            <div key={p.productId} className="flex items-center gap-3 shrink-0">
              {idx > 0 && (
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                  <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                </span>
              )}
              <div
                className={cn(
                  "relative w-36 overflow-hidden rounded-xl border-2 bg-[var(--surface-raised)] transition-all",
                  isSel
                    ? "border-[var(--accent)] shadow-sm"
                    : "border-[var(--rule-base)] opacity-60 hover:opacity-100",
                )}
              >
                {isAnchor && (
                  <span className="absolute top-2 right-2 z-10 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-white">
                    Este producto
                  </span>
                )}
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={() => toggle(p.productId)}
                  aria-pressed={isSel}
                  aria-label={isSel ? `Quitar ${p.name} del combo` : `Agregar ${p.name} al combo`}
                  className={cn(
                    "absolute top-2 left-2 z-10 grid h-6 w-6 place-items-center rounded-md border-2 transition-colors",
                    isSel
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]",
                  )}
                >
                  {isSel && <Check className="h-4 w-4" strokeWidth={3} aria-hidden />}
                </button>
                <Link href={href} className="block">
                  <div className="relative aspect-square w-full bg-[var(--surface-sunken)]">
                    {p.image ? (
                      <Image src={p.image} alt={p.name} fill sizes="144px" className="object-cover" />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-xl font-bold uppercase text-[var(--text-tertiary)]">
                        {p.name.trim().charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="min-h-[2.1rem] text-[length:var(--ts-xs)] leading-snug text-[var(--text-secondary)] line-clamp-2">
                      {p.name}
                    </p>
                    <p className="mt-1 text-base font-bold tabular-nums text-[var(--text-primary)]">{fmt(p.price)}</p>
                  </div>
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: total + agregar combo */}
      <div className="flex flex-col gap-3 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)]">
            Total del combo · {chosen.length} {chosen.length === 1 ? "artículo" : "artículos"}
          </p>
          <p className="text-2xl font-black tabular-nums text-[var(--text-primary)]">{fmt(total)}</p>
        </div>
        <button
          type="button"
          onClick={handleAddAll}
          disabled={chosen.length === 0}
          className={cn(
            "inline-flex h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-extrabold transition-all active:scale-[0.99]",
            addedAll
              ? "bg-[var(--data-success-600)] text-white"
              : "bg-[var(--accent)] text-white hover:shadow-lg hover:shadow-[var(--accent)]/25 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <ShoppingCart className="h-5 w-5" strokeWidth={2} aria-hidden />
          {addedAll ? "¡Combo agregado!" : "Agregar combo al carrito"}
        </button>
      </div>
    </section>
  );
}
