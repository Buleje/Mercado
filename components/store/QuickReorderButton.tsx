"use client";

import { useState, useEffect, useCallback } from "react";
import { RotateCcw, ShoppingCart, X, Loader2 } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useCustomer } from "@/contexts/customer-context";
import { cn } from "@/lib/utils";

type LastOrderItem = {
  id: number;
  name: string;
  price: number;
  image: string;
  unit: string;
  category: string;
  quantity: number;
};

type LastOrder = {
  items: LastOrderItem[];
  total: number;
  date: string;
};

/**
 * #24 — Floating "Repetir ultimo pedido" button.
 * Reads from localStorage (buleje-last-order) or fetches from API.
 * Shows as a compact floating button that expands on tap.
 */
export default function QuickReorderButton() {
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const { addItem } = useCart();
  const { showToast } = useToast();
  const { customer } = useCustomer();

  useEffect(() => {
    try {
      // Check if user dismissed this session
      const sessionDismissed = sessionStorage.getItem("buleje-reorder-dismissed");
      if (sessionDismissed === "1") {
        setDismissed(true);
        return;
      }

      // Try localStorage first
      const saved = localStorage.getItem("buleje-last-order");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.items && parsed.items.length > 0) {
          setLastOrder(parsed);
          return;
        }
      }

      // If customer identified, fetch last order from API
      if (customer?.phone) {
        setLoading(true);
        fetch(`/api/customers/${encodeURIComponent(customer.phone)}/orders?limit=1`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data && Array.isArray(data) && data.length > 0) {
              const order = data[0];
              if (order.items && order.items.length > 0) {
                const orderData: LastOrder = {
                  items: order.items.map((i: Record<string, unknown>) => ({
                    id: (i.productId as number) || 0,
                    name: (i.name as string) || "",
                    price: (i.price as number) || 0,
                    image: (i.image as string) || "",
                    unit: (i.unit as string) || "unidad",
                    category: "",
                    quantity: (i.quantity as number) || 1,
                  })),
                  total: order.total || 0,
                  date: order.createdAt || "",
                };
                setLastOrder(orderData);
              }
            }
          })
          .catch(() => {
            /* ignore */
          })
          .finally(() => setLoading(false));
      }
    } catch {
      /* ignore */
    }
  }, [customer?.phone]);

  const handleReorder = useCallback(() => {
    if (!lastOrder) return;
    let added = 0;
    const skipped: string[] = [];

    for (const item of lastOrder.items) {
      if (item.id) {
        addItem({
          id: item.id,
          name: item.name,
          price: item.price,
          image: item.image,
          unit: item.unit,
          category: item.category,
        });
        added++;
      } else {
        skipped.push(item.name);
      }
    }

    if (skipped.length > 0) {
      showToast(
        `${added} agregados. ${skipped.join(", ")} no disponible(s)`,
        ""
      );
    } else {
      showToast(`${added} productos agregados al carrito`, "");
    }
    setExpanded(false);
  }, [lastOrder, addItem, showToast]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem("buleje-reorder-dismissed", "1");
    } catch {
      /* ignore */
    }
  }, []);

  if (dismissed || loading || !lastOrder || lastOrder.items.length === 0) {
    return null;
  }

  const itemCount = lastOrder.items.length;
  const preview = lastOrder.items
    .slice(0, 2)
    .map((i) => i.name)
    .join(", ");
  const moreCount = itemCount > 2 ? itemCount - 2 : 0;

  return (
    <div className="fixed bottom-24 right-4 z-40 sm:bottom-6 sm:right-6">
      {/* Expanded card */}
      {expanded && (
        <div className="mb-3 w-72 rounded-2xl border border-[var(--rule-base)] bg-white shadow-[var(--shadow-xl)] dark:border-card-border dark:bg-card animate-[fadeUp_0.2s_ease-out]">
          <div className="flex items-center justify-between border-b border-[var(--rule-soft)] px-4 py-3 dark:border-card-border">
            <h4 className="text-sm font-bold text-foreground">
              Repetir pedido
            </h4>
            <button
              onClick={() => setExpanded(false)}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-accent"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-muted">
              {preview}
              {moreCount > 0 ? ` y ${moreCount} mas` : ""}
            </p>
            <p className="mt-1 text-sm font-extrabold text-primary">
              S/ {lastOrder.total.toFixed(2)}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleReorder}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98]"
              >
                <ShoppingCart className="h-4 w-4" />
                Agregar todo
              </button>
              <button
                onClick={handleDismiss}
                className="rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-400 transition-colors hover:text-gray-600"
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 rounded-full px-4 py-3 font-bold shadow-xl transition-all active:scale-95",
          expanded
            ? "bg-gray-100 text-gray-600 dark:bg-card dark:text-gray-300"
            : "bg-primary text-white hover:bg-primary/90 shadow-primary/30"
        )}
        aria-label="Repetir ultimo pedido"
      >
        <RotateCcw className="h-5 w-5" />
        <span className="hidden text-sm sm:inline">Repetir pedido</span>
      </button>
    </div>
  );
}
