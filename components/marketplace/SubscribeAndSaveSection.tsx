"use client";

/**
 * SubscribeAndSaveSection — Carrusel de productos suscribibles (homepage marketplace).
 *
 * Muestra 6-8 productos que admiten "Bodega al Mes" con el descuento del 5%.
 * Consume MOCK_SUBSCRIBABLE_PRODUCTS; cuando exista backend se reemplaza con
 * fetch a /api/marketplace/subscribable.
 *
 * Layout: horizontal scroll en mobile, grid 4 columns desktop.
 */

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  BadgePercent,
  Users,
  ShoppingCart,
  Check,
} from "@buleje/design-system/icons";
import {
  MOCK_SUBSCRIBABLE_PRODUCTS,
  type SubscribableProductMock,
} from "@/lib/mocks/subscriptions.mock";
import { cn } from "@/lib/utils";
import { useCartWithUndo } from "@/hooks/use-cart-with-undo";
import MarketplaceSection, { MARKETPLACE_CAROUSEL, CAROUSEL_ITEM_W } from "@/components/marketplace/MarketplaceSection";

const fmtMoney = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function SubscribableCard({ product }: { product: SubscribableProductMock }) {
  const discounted = product.price * 0.95;
  const { addItemWithUndo } = useCartWithUndo();
  const [justAdded, setJustAdded] = useState(false);
  const href = `/marketplace/${product.storeSlug}/producto/${product.productId}`;

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItemWithUndo({
      storeId: product.storeSlug,
      storeName: product.storeName,
      storeSlug: product.storeSlug,
      storeProductId: `${product.storeSlug}-${product.productId}`,
      productId: Number(product.productId),
      name: product.name,
      price: discounted,
      image: product.image ?? null,
      unit: product.unit ?? null,
      description:
        "Suscripcion Bodega al Mes · 5% off automatico. Pausa o cancela cuando quieras.",
      variations: [
        { label: "Frecuencia", value: "Mensual" },
        { label: "Descuento", value: "5% fijo" },
      ],
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  };

  return (
    <article
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-xl",
        "bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800",
        "transition-colors duration-200",
        "hover:border-gray-300 dark:hover:border-gray-600",
      )}
    >
      <Link href={href} className="block">
        <div className="relative aspect-square bg-gray-50 dark:bg-gray-800 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0";
            }}
          />
          <span
            className={cn(
              "absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5",
              "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider",
              "bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm shadow-sm",
            )}
            style={{ color: "var(--data-success)" }}
          >
            <BadgePercent className="h-3 w-3" aria-hidden />
            -5%
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <Link href={href}>
          <h3 className="text-[length:var(--ts-sm)] font-semibold leading-snug text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem] group-hover:text-[var(--accent)] transition-colors">
            {product.name}
          </h3>
        </Link>

        <p className="mt-1.5 text-[length:var(--ts-xs)] font-medium leading-relaxed text-[var(--text-secondary)] line-clamp-2">
          Entrega automatica cada mes. Pausa o cancela cuando quieras.
        </p>

        <div className="mt-1.5 flex items-center gap-1 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
          <Users className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">
            {product.subscribers} vecin{product.subscribers === 1 ? "o" : "os"} lo recibe{product.subscribers === 1 ? "" : "n"}
          </span>
        </div>

        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <span className="block text-[length:var(--ts-xs)] text-[var(--text-tertiary)] line-through tabular-nums">
              {fmtMoney(product.price)}
            </span>
            <div className="flex items-baseline gap-1 flex-wrap">
              <span className="text-lg font-extrabold text-[var(--text-primary)] leading-none tabular-nums">
                {fmtMoney(discounted)}
              </span>
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">
                /{product.unit}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            aria-label={`Agregar ${product.name} al carrito`}
            className={cn(
              "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all duration-200 ring-1",
              justAdded
                ? "bg-emerald-500 text-white scale-90 ring-emerald-600/30"
                : "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 hover:scale-105 active:scale-95 shadow-md ring-[var(--accent)]/30",
            )}
          >
            {justAdded ? (
              <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
            ) : (
              <ShoppingCart className="h-5 w-5" strokeWidth={2} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function SubscribeAndSaveSection() {
  const products = MOCK_SUBSCRIBABLE_PRODUCTS.slice(0, 8);
  if (products.length === 0) return null;

  return (
    <MarketplaceSection
      id="subscribe-save"
      kicker="Bodega al Mes"
      title="Productos que podes suscribir y ahorrar 5%"
      subtitle="Entrega automatica, pausa o cancela cuando quieras. Tu bodega recuerda por ti."
      actions={
        <Link
          href="/cuenta/suscripciones"
          className={cn(
            "inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold",
            "text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors",
          )}
        >
          Ver mis suscripciones
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      }
    >
      {/* Carrusel horizontal 1 fila (mobile + desktop) */}
      <div className={MARKETPLACE_CAROUSEL}>
        {products.slice(0, 10).map((p) => (
          <div key={p.productId} className={CAROUSEL_ITEM_W}>
            <SubscribableCard product={p} />
          </div>
        ))}
      </div>
    </MarketplaceSection>
  );
}
