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
 * #24 — Floating "Repetir último pedido" button.
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
    // Esquina opuesta al chat — bottom-left para no apilarse con WhatsApp/Chat
    // que viven en bottom-right.
    <div className="fixed left-4 sm:left-6 z-40 bottom-6">
      {/* Expanded card */}
      {expanded && (
        <div
          className="mb-3 w-80 sm:w-96 rounded-3xl overflow-hidden animate-[fadeUp_0.2s_ease-out]"
          style={{
            background: "var(--color-card)",
            border:
              "1px solid color-mix(in oklch, var(--color-primary, #00A0A0) 22%, transparent)",
            boxShadow:
              "0 24px 48px -12px color-mix(in oklch, var(--color-primary, #00A0A0) 30%, transparent), 0 4px 12px rgba(0,0,0,0.08)",
          }}
        >
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{
              background:
                "color-mix(in oklch, var(--color-primary, #00A0A0) 6%, transparent)",
              borderBottom:
                "1px solid color-mix(in oklch, var(--color-primary, #00A0A0) 18%, transparent)",
            }}
          >
            <div className="inline-flex items-center gap-2">
              <RotateCcw
                className="h-4 w-4"
                strokeWidth={2.25}
                style={{ color: "var(--color-primary-dark, #009690)" }}
              />
              <h4
                className="text-sm font-extrabold uppercase tracking-wider"
                style={{ color: "var(--color-primary-dark, #009690)" }}
              >
                Repetir pedido
              </h4>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="rounded-lg p-1.5 text-muted hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-[var(--text-primary)] leading-snug">
              <strong className="font-extrabold">{preview}</strong>
              {moreCount > 0 ? ` y ${moreCount} más` : ""}
            </p>
            <p
              className="mt-2 text-2xl font-extrabold tabular-nums"
              style={{ color: "var(--color-primary-dark, #009690)" }}
            >
              S/ {Number(lastOrder.total).toFixed(2)}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleReorder}
                className="flex flex-1 items-center justify-center gap-2 h-12 rounded-2xl text-sm font-extrabold text-white transition-all active:scale-[0.98]"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                  boxShadow:
                    "0 8px 20px -4px color-mix(in oklch, var(--color-primary, #00A0A0) 40%, transparent)",
                }}
              >
                <ShoppingCart className="h-4 w-4" strokeWidth={2.25} />
                Agregar todo
              </button>
              <button
                onClick={handleDismiss}
                className="h-12 px-4 rounded-2xl text-sm font-bold text-muted hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating button — brand gradient */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 rounded-full h-14 px-5 font-extrabold transition-all active:scale-95",
        )}
        style={
          expanded
            ? {
                background: "var(--color-card)",
                color: "var(--color-foreground)",
                border:
                  "1px solid color-mix(in oklch, var(--color-primary, #00A0A0) 22%, transparent)",
                boxShadow:
                  "0 8px 20px -4px color-mix(in oklch, var(--color-primary, #00A0A0) 20%, transparent)",
              }
            : {
                background:
                  "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                color: "white",
                boxShadow:
                  "0 12px 28px -6px color-mix(in oklch, var(--color-primary, #00A0A0) 50%, transparent)",
              }
        }
        aria-label="Repetir último pedido"
      >
        <RotateCcw className="h-5 w-5" strokeWidth={2.25} />
        <span className="hidden text-sm sm:inline">Repetir pedido</span>
      </button>
    </div>
  );
}
