"use client";

/**
 * WelcomeStrip — saludo personalizado al customer logged in.
 *
 * Si hay `useCustomer().customer`, muestra:
 *   - "Hola, {nombre}" + última compra/zona
 *   - CTA rápido: "Continuar comprando"
 *
 * Si NO hay customer, no renderea (vacio en SSR — sin layout shift).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, UserCircle, MapPin, Repeat } from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";
import { useMarketplaceCart, type CartItem } from "@/hooks/use-marketplace-cart";
import { cn } from "@/lib/utils";

type LastOrder = {
  id: string | number;
  total: number;
  itemsCount: number;
  items: Array<{
    productId: number;
    storeProductId?: string;
    storeId?: string;
    storeName?: string;
    storeSlug?: string;
    name: string;
    price: number;
    quantity: number;
    image?: string | null;
    unit?: string | null;
    category?: string | null;
  }>;
  createdAt: string;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export default function WelcomeStrip() {
  const { customer } = useCustomer();
  const { addItem } = useMarketplaceCart();
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const [reordering, setReordering] = useState(false);
  const [reorderDone, setReorderDone] = useState(false);

  // Fetch último pedido del customer
  useEffect(() => {
    if (!customer?.phone) return;
    const phone = customer.phone.replace(/\D/g, "").slice(-9);
    if (phone.length < 6) return;

    let cancelled = false;
    fetch(`/api/orders?phone=${encodeURIComponent(phone)}&limit=1`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const orders = (data.orders ?? data.data ?? data) as LastOrder[];
        if (Array.isArray(orders) && orders[0]) setLastOrder(orders[0]);
      })
      .catch(() => {
        /* silent */
      });
    return () => {
      cancelled = true;
    };
  }, [customer?.phone]);

  if (!customer || !customer.name) return null;

  const firstName = customer.name.split(" ")[0];
  const zona = customer.location || customer.reference;

  const handleReorder = () => {
    if (!lastOrder || reordering) return;
    setReordering(true);
    let added = 0;
    for (const item of lastOrder.items) {
      if (!item.productId) continue;
      const cartItem: Omit<CartItem, "quantity"> & { quantity?: number } = {
        storeId: item.storeId ?? item.storeSlug ?? "",
        storeName: item.storeName ?? "Tienda",
        storeSlug: item.storeSlug ?? "",
        storeProductId: item.storeProductId ?? `${item.storeSlug ?? "store"}-${item.productId}`,
        productId: item.productId,
        name: item.name,
        price: item.price,
        image: item.image ?? null,
        unit: item.unit ?? null,
        category: item.category ?? null,
        quantity: item.quantity || 1,
      };
      addItem(cartItem);
      added++;
    }
    setReordering(false);
    setReorderDone(true);
    setTimeout(() => setReorderDone(false), 4000);
    void added;
  };

  return (
    <section
      aria-label="Bienvenida personalizada"
      className="w-full pt-6 sm:pt-8"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            "flex items-center justify-between gap-4 flex-wrap",
            "rounded-xl border border-[var(--accent)]/20 bg-primary/10",
            "px-5 sm:px-6 py-4",
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-600,var(--accent))] text-white">
              <UserCircle className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                Hola, {firstName}
              </p>
              {lastOrder ? (
                <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] truncate">
                  Tu último pedido: <strong>{lastOrder.itemsCount} items · {fmt(lastOrder.total)}</strong>
                </p>
              ) : zona ? (
                <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] inline-flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="truncate">{zona}</span>
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {lastOrder && lastOrder.items.length > 0 && (
              <button
                type="button"
                onClick={handleReorder}
                disabled={reordering || reorderDone}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[length:var(--ts-xs)] font-semibold transition-colors",
                  reorderDone
                    ? "bg-[var(--accent-600,var(--accent))] text-white"
                    : "bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--rule-base)] hover:border-[var(--accent)]",
                )}
              >
                <Repeat className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                {reorderDone ? "Agregado al carrito" : "Repetir última compra"}
              </button>
            )}
            <Link
              href="/cuenta/pedidos"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-[length:var(--ts-xs)] font-semibold text-[var(--surface-canvas)] hover:bg-[var(--text-primary)]/90 transition-colors"
            >
              Mis pedidos
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
