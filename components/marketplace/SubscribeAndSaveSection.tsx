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
import {
  ArrowRight,
  BadgePercent,
  Repeat,
  Users,
} from "@buleje/design-system/icons";
import { CardTitle, Caption } from "@buleje/design-system";
import {
  MOCK_SUBSCRIBABLE_PRODUCTS,
  type SubscribableProductMock,
} from "@/lib/mocks/subscriptions.mock";
import { cn } from "@/lib/utils";
import MarketplaceSection, { MARKETPLACE_GRID } from "@/components/marketplace/MarketplaceSection";

const fmtMoney = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function SubscribableCard({ product }: { product: SubscribableProductMock }) {
  const discounted = product.price * 0.95;
  return (
    <Link
      href={`/marketplace/${product.storeSlug}/producto/${product.productId}`}
      className={cn(
        "block rounded-xl overflow-hidden bg-white dark:bg-gray-900",
        "border border-gray-100 dark:border-gray-800",
        "hover:border-gray-300 dark:hover:border-gray-600 transition-colors",
      )}
    >
      <div className="relative aspect-square bg-gray-50 dark:bg-gray-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.opacity = "0";
          }}
        />
        {/* Subscribe badge */}
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
      <div className="p-3">
        <h3 className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] leading-tight line-clamp-2 h-10">
          {product.name}
        </h3>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-[length:var(--ts-base)] font-extrabold text-[var(--text-primary)] tabular-nums">
            {fmtMoney(discounted)}
          </span>
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] line-through tabular-nums">
            {fmtMoney(product.price)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          <Users className="h-3 w-3" aria-hidden />
          <span>
            {product.subscribers} vecin{product.subscribers === 1 ? "o" : "os"} lo
            recibe{product.subscribers === 1 ? "" : "n"}
          </span>
        </div>
      </div>
    </Link>
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
      subtitle="Entrega automatica, pausa o cancela cuando quieras. Tu bodega recuerda por vos."
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
      {/* Desktop grid */}
      <div className={cn("hidden sm:grid", MARKETPLACE_GRID)}>
        {products.slice(0, 8).map((p) => (
          <SubscribableCard key={p.productId} product={p} />
        ))}
      </div>

      {/* Mobile horizontal scroll */}
      <div className="sm:hidden -mx-4 px-4 flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory">
        {products.slice(0, 8).map((p) => (
          <div
            key={p.productId}
            className="shrink-0 w-[160px] snap-start"
          >
            <SubscribableCard product={p} />
          </div>
        ))}
      </div>
    </MarketplaceSection>
  );
}
