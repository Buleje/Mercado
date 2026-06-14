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

export default function FrequentlyBoughtTogether({ productId, storeId, storeName, storeSlug }: Props) {
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
      const clean = list.filter((p) => p.productId && p.productId !== productId && p.name).slice(0, 4);
      if (!cancelled) {
        setItems(clean);
        setSelected(new Set(clean.map((p) => p.productId)));
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
      <section aria-label="Cargando combo" className="border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="h-5 w-48 bg-[var(--surface-sunken)] animate-pulse mb-4" />
        <div className="flex gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 w-28 bg-[var(--surface-sunken)] animate-pulse" />
          ))}
        </div>
      </section>
    );
  }
  if (items.length === 0) return null;

  const chosen = items.filter((p) => selected.has(p.productId));
  const total = chosen.reduce((a, p) => a + p.price, 0);

  return (
    <section
      aria-labelledby="fbt-heading"
      className="border border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      <header className="border-b border-[var(--rule-soft)] px-4 py-3">
        <h2 id="fbt-heading" className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
          Comprados juntos
        </h2>
        <p className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
          Marcá lo que querés y agregalo de un toque
        </p>
      </header>

      {/* Fila de items unidos por "+" (estilo bundle) */}
      <div className="flex items-stretch gap-2 overflow-x-auto px-4 pt-4 pb-2">
        {items.map((p, idx) => {
          const isSel = selected.has(p.productId);
          const href = `/marketplace/${p.storeSlug ?? storeSlug}/producto/${p.productId}`;
          return (
            <div key={p.productId} className="flex items-center gap-2 shrink-0">
              {idx > 0 && <Plus className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" strokeWidth={2} aria-hidden />}
              <div
                className={cn(
                  "relative w-32 border bg-[var(--surface-raised)] overflow-hidden transition-colors",
                  isSel ? "border-[var(--accent)]" : "border-[var(--rule-soft)] opacity-70",
                )}
              >
                {/* Checkbox */}
                <button
                  type="button"
                  onClick={() => toggle(p.productId)}
                  aria-pressed={isSel}
                  aria-label={isSel ? `Quitar ${p.name} del combo` : `Agregar ${p.name} al combo`}
                  className={cn(
                    "absolute top-2 left-2 z-10 grid h-5 w-5 place-items-center rounded-sm border transition-colors",
                    isSel ? "bg-[var(--accent)] border-[var(--accent)] text-white" : "bg-[var(--surface-raised)] border-[var(--rule-base)]",
                  )}
                >
                  {isSel && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                </button>
                <Link href={href} className="block">
                  <div className="relative aspect-square w-full bg-[var(--surface-sunken)]">
                    {p.image ? (
                      <Image src={p.image} alt={p.name} fill sizes="128px" className="object-cover" />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-lg font-semibold uppercase text-[var(--text-tertiary)]">
                        {p.name.trim().charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] line-clamp-2 leading-tight min-h-[2rem]">
                      {p.name}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-primary)] tabular-nums">{fmt(p.price)}</p>
                  </div>
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: total + agregar combo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[var(--rule-soft)] px-4 py-3">
        <p className="text-sm text-[var(--text-secondary)]">
          Total{" "}
          <span className="text-[length:var(--ts-xs)]">({chosen.length} {chosen.length === 1 ? "artículo" : "artículos"})</span>
          {": "}
          <span className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{fmt(total)}</span>
        </p>
        <button
          type="button"
          onClick={handleAddAll}
          disabled={chosen.length === 0}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-sm h-11 px-5 text-sm font-semibold transition-all active:scale-[0.99]",
            addedAll
              ? "bg-[var(--data-success-600)] text-white"
              : "bg-[var(--accent)] text-white hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          <ShoppingCart className="h-4 w-4" strokeWidth={2} aria-hidden />
          {addedAll ? "¡Combo agregado!" : "Agregar combo"}
        </button>
      </div>
    </section>
  );
}
