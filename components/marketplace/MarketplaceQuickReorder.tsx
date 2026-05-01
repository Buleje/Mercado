"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, RotateCcw, ShoppingCart, Store } from "@buleje/design-system/icons";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useToast } from "@/contexts/toast-context";
import { cn } from "@/lib/utils";
import {
  MARKETPLACE_LAST_ORDER_EVENT,
  MARKETPLACE_LAST_ORDER_KEY,
  readMarketplaceLastOrder,
  type MarketplaceLastOrder,
} from "@/lib/marketplace/last-order";

const DISMISS_KEY = "marketplace-last-order-dismissed";

function fmtMoney(amount: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(amount);
}

function formatRelativeDate(date: string): string {
  const orderDate = new Date(date);
  const diffMs = Date.now() - orderDate.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / 86_400_000));

  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return orderDate.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

function readDismissedState(order: MarketplaceLastOrder | null): boolean {
  if (!order || typeof window === "undefined") return false;

  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === order.date;
  } catch {
    return false;
  }
}

export default function MarketplaceQuickReorder() {
  const [lastOrder, setLastOrder] = useState<MarketplaceLastOrder | null>(() => readMarketplaceLastOrder());
  const [dismissed, setDismissed] = useState(() => readDismissedState(readMarketplaceLastOrder()));
  const { addItem, itemCount } = useMarketplaceCart();
  const { showToast } = useToast();

  const syncLastOrder = useCallback(() => {
    const nextOrder = readMarketplaceLastOrder();
    setLastOrder(nextOrder);

    if (!nextOrder) {
      setDismissed(false);
      return;
    }

    try {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === nextOrder.date);
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    const handleUpdate = () => {
      syncLastOrder();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === MARKETPLACE_LAST_ORDER_KEY) {
        syncLastOrder();
      }
    };

    window.addEventListener(MARKETPLACE_LAST_ORDER_EVENT, handleUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(MARKETPLACE_LAST_ORDER_EVENT, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, [syncLastOrder]);

  const totalUnits = useMemo(
    () => lastOrder?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    [lastOrder],
  );

  const previewLabel = useMemo(() => {
    if (!lastOrder) return "";
    const names = lastOrder.items.slice(0, 3).map((item) => item.name);
    const extra = lastOrder.items.length - names.length;
    return `${names.join(", ")}${extra > 0 ? ` y ${extra} más` : ""}`;
  }, [lastOrder]);

  const handleDismiss = useCallback(() => {
    if (!lastOrder) return;

    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, lastOrder.date);
    } catch {
      // ignore storage errors
    }
  }, [lastOrder]);

  const handleReorder = useCallback(() => {
    if (!lastOrder) return;

    for (const item of lastOrder.items) {
      addItem(item);
    }

    showToast(
      `${totalUnits} ${totalUnits === 1 ? "producto" : "productos"} agregados al carrito`,
      lastOrder.items[0]?.image ?? "",
    );
  }, [addItem, lastOrder, showToast, totalUnits]);

  if (!lastOrder || lastOrder.items.length === 0 || dismissed) {
    return null;
  }

  return (
    <section className="mt-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-card-border dark:bg-card sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-primary">
            <RotateCcw className="h-3.5 w-3.5" />
            Recompra en 1 toque
          </div>

          <h2 className="mt-3 text-lg font-black text-gray-900 dark:text-foreground sm:text-xl">
            Vuelve a llenar tu canasta sin buscar todo de nuevo
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-muted">
            Tu última compra fue {formatRelativeDate(lastOrder.date).toLowerCase()}. Si era tu compra típica, la puedes volver a poner en el carrito con un solo clic.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[length:var(--ts-2xs)] font-semibold text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">
              <ShoppingCart className="h-3.5 w-3.5 text-primary" />
              {totalUnits} unidade{totalUnits === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">
              <Store className="h-3.5 w-3.5 text-primary" />
              {lastOrder.stores.length} tienda{lastOrder.stores.length === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">
              <Clock3 className="h-3.5 w-3.5 text-primary" />
              {formatRelativeDate(lastOrder.date)}
            </span>
          </div>

          <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-foreground line-clamp-2">
            {previewLabel}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-muted">
            Total anterior: <span className="font-bold text-gray-900 dark:text-foreground">{fmtMoney(lastOrder.total)}</span>
            {itemCount > 0 ? " · Se sumará a tu carrito actual" : " · Se volverá a cargar tu última compra"}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
          <button
            onClick={handleReorder}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <ShoppingCart className="h-4 w-4" />
            Agregar mi última compra
          </button>
          <button
            onClick={handleDismiss}
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-700 dark:border-card-border dark:text-gray-400 dark:hover:text-gray-200",
            )}
          >
            Ahora no
          </button>
        </div>
      </div>
    </section>
  );
}