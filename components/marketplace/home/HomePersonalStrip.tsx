"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Package,
  RotateCcw,
  Check,
  ShoppingBag,
  ArrowRight,
} from "@buleje/design-system/icons";
import SectionHeading from "@/components/marketplace/home/SectionHeading";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import { useCustomer } from "@/contexts/customer-context";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useToast } from "@/contexts/toast-context";
import {
  readMarketplaceLastOrder,
  MARKETPLACE_LAST_ORDER_KEY,
  MARKETPLACE_LAST_ORDER_EVENT,
  type MarketplaceLastOrder,
} from "@/lib/marketplace/last-order";

/**
 * HomePersonalStrip — banda personalizada del cliente que vuelve (Brandon
 * 2026-06-08). Reemplaza al viejo MarketplaceQuickReorder (banner descartable,
 * estilo neón). Progresivo: si no hay carrito ni último pedido devuelve null.
 *
 * Usa el carrito REAL del marketplace (`useMarketplaceCart`, no el del store) y
 * el último pedido de localStorage (sin cookie de sesión) para que funcione en
 * el flujo real. 3 piezas:
 *   1. Saludo "Hola, {nombre}" (si está logueado).
 *   2. "Sigue donde quedaste" — retoma el carrito si tiene productos.
 *   3. "Vuelve a pedir" — productos del último pedido con "Agregar todo".
 */

const pen = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

export default function HomePersonalStrip() {
  const { customer, hydrated: customerHydrated } = useCustomer();
  const {
    itemCount,
    grandTotal,
    addItem,
    hydrated: cartHydrated,
  } = useMarketplaceCart();
  const { showToast } = useToast();

  const [lastOrder, setLastOrder] = useState<MarketplaceLastOrder | null>(null);
  const [added, setAdded] = useState(false);

  // Sincroniza el último pedido (localStorage) + reacciona a checkout / otra pestaña.
  useEffect(() => {
    const sync = () => setLastOrder(readMarketplaceLastOrder());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === MARKETPLACE_LAST_ORDER_KEY) sync();
    };
    window.addEventListener(MARKETPLACE_LAST_ORDER_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MARKETPLACE_LAST_ORDER_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const reorderItems = lastOrder?.items ?? [];

  const addAll = useCallback(() => {
    if (reorderItems.length === 0) return;
    for (const it of reorderItems) addItem(it);
    const units = reorderItems.reduce((s, i) => s + i.quantity, 0);
    showToast(
      `${units} ${units === 1 ? "producto" : "productos"} agregados al carrito`,
      reorderItems[0]?.image ?? "",
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  }, [reorderItems, addItem, showToast]);

  const openCart = useCallback(() => {
    window.dispatchEvent(new CustomEvent("buleje:open-cart"));
  }, []);

  // Evita flicker hasta hidratar carrito + customer.
  if (!cartHydrated || !customerHydrated) return null;

  const hasCart = itemCount > 0;
  const hasReorder = reorderItems.length > 0;
  // Sin carrito ni último pedido → nada útil que mostrar (no molesta a nuevos).
  if (!hasCart && !hasReorder) return null;

  const firstName = customer?.name?.trim().split(/\s+/)[0] ?? "";

  return (
    <section
      aria-label="Tu actividad en Buleje"
      className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-7"
    >
      {/* Saludo + retomar carrito */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 sm:mb-6">
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Tu Buleje
          </p>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] leading-tight">
            {customer ? `Hola${firstName ? `, ${firstName}` : ""}` : "Tu actividad"}
          </h2>
        </div>

        {hasCart && (
          <button
            type="button"
            onClick={openCart}
            className="group shrink-0 inline-flex items-center justify-between gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 h-12 transition-colors hover:border-[var(--accent)]"
          >
            <span className="inline-flex items-center gap-2.5 text-left">
              <ShoppingBag className="h-4 w-4 text-[var(--accent)]" aria-hidden />
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  Sigue donde quedaste
                </span>
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">
                  {itemCount} {itemCount === 1 ? "producto" : "productos"} ·{" "}
                  {pen.format(grandTotal)}
                </span>
              </span>
            </span>
            <ArrowRight
              className="h-4 w-4 text-[var(--text-tertiary)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
              aria-hidden
            />
          </button>
        )}
      </div>

      {/* Vuelve a pedir */}
      {hasReorder && (
        <>
          <SectionHeading
            eyebrow="Para ti"
            title="Vuelve a pedir"
            action={
              <div className="shrink-0 inline-flex items-center gap-2">
                <Link
                  href="/marketplace/mi-cuenta/pedidos"
                  className="hidden sm:inline-flex items-center h-9 px-3 text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]"
                >
                  Mis pedidos
                </Link>
                <button
                  type="button"
                  onClick={addAll}
                  aria-label="Agregar todo el último pedido al carrito"
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 h-9 text-[length:var(--ts-xs)] font-bold text-white transition-colors ${
                    added
                      ? "bg-[var(--data-success-600,#16a34a)]"
                      : "bg-[var(--accent)] hover:opacity-90"
                  }`}
                >
                  {added ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                  )}
                  {added ? "Agregado" : "Agregar todo"}
                </button>
              </div>
            }
          />

          <HorizontalCarousel ariaLabel="Vuelve a pedir">
            {reorderItems.map((item) => (
              <Link
                key={item.storeProductId}
                href={`/marketplace/${item.storeSlug}/producto/${item.productId}`}
                className="group/card block relative overflow-hidden rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] transition-colors hover:border-[var(--accent)]/50"
              >
                <span className="absolute top-2.5 right-2.5 z-10 inline-flex items-center rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)] px-2.5 py-1 text-xs font-bold leading-none">
                  Pediste {item.quantity}×
                </span>

                <div className="relative aspect-square bg-[var(--surface-canvas)] overflow-hidden">
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      sizes="240px"
                      className="object-cover transition-transform duration-500 group-hover/card:scale-105 motion-reduce:group-hover/card:scale-100"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Package
                        className="h-10 w-10 text-[var(--text-tertiary)]"
                        aria-hidden
                      />
                    </span>
                  )}
                </div>

                <div className="p-4 flex flex-col gap-2">
                  <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem] leading-snug">
                    {item.name}
                  </p>
                  <p className="text-2xl font-black tabular-nums tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-none">
                    {pen.format(item.price)}
                  </p>
                </div>
              </Link>
            ))}
          </HorizontalCarousel>
        </>
      )}
    </section>
  );
}
