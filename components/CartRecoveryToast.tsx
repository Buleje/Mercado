"use client";

import { useState, useEffect, useCallback } from "react";
import { ShoppingCart, X } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { cn } from "@/lib/utils";

const ABANDON_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutos
const DISMISS_KEY = "buleje-cart-recovery-dismissed";

interface AbandonedItem {
  name: string;
  quantity: number;
  price: number;
  image?: string;
  productId?: number;
  unit?: string;
}

interface AbandonedCartData {
  id: string;
  items: AbandonedItem[];
  total: number;
  savedAt: string;
}

/**
 * #31 Abandoned cart recovery — UX front.
 * Detecta carrito abandonado via /api/abandoned-cart/mine.
 * Si hay carrito > 30min: muestra toast con CTA "Retomar".
 * No toca cart-context directamente — usa addMultiple.
 */
export default function CartRecoveryToast() {
  const { addMultiple, items: cartItems } = useCart();
  const [abandoned, setAbandoned] = useState<AbandonedCartData | null>(null);
  const [visible, setVisible] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    // No mostrar si ya hay items en el carrito activo
    if (cartItems.length > 0) return;

    // No mostrar si ya fue descartado en esta sesion
    const dismissed = sessionStorage.getItem(DISMISS_KEY);
    if (dismissed) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/abandoned-cart/mine");
        if (!res.ok) return;
        const data = (await res.json()) as AbandonedCartData;
        if (!data?.items?.length) return;

        const savedAt = new Date(data.savedAt).getTime();
        const elapsed = Date.now() - savedAt;
        if (elapsed < ABANDON_THRESHOLD_MS) return;

        if (!cancelled) {
          setAbandoned(data);
          // Delay para no chocar con otros toasts al montar
          setTimeout(() => setVisible(true), 1500);
        }
      } catch {
        // fire-and-forget: error silencioso, no bloquea nada
      }
    })();

    return () => { cancelled = true; };
  }, [cartItems.length]);

  const handleRecover = useCallback(async () => {
    if (!abandoned || recovering) return;
    setRecovering(true);

    const cartItems = abandoned.items
      .filter((i) => i.productId)
      .map((i) => ({
        product: {
          id: i.productId!,
          name: i.name,
          price: i.price,
          image: i.image ?? "",
          unit: i.unit ?? "und",
          category: "",
        },
        quantity: i.quantity,
      }));

    if (cartItems.length > 0) {
      addMultiple(cartItems);
    }

    setVisible(false);
    setRecovering(false);
  }, [abandoned, recovering, addMultiple]);

  const handleDismiss = useCallback(() => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }, []);

  if (!visible || !abandoned) return null;

  const itemCount = abandoned.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "fixed bottom-24 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-50",
        "bg-white dark:bg-card rounded-2xl shadow-xl border border-gray-100 dark:border-card-border",
        "p-4 flex items-start gap-3",
        "animate-in slide-in-from-bottom-4 duration-300"
      )}
    >
      {/* Icono */}
      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <ShoppingCart className="h-5 w-5 text-primary" />
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground">
          Tienes {itemCount} producto{itemCount !== 1 ? "s" : ""} esperando
        </p>
        <p className="text-xs text-muted mt-0.5 line-clamp-1">
          {abandoned.items.slice(0, 2).map((i) => i.name).join(", ")}
          {abandoned.items.length > 2 && ` y ${abandoned.items.length - 2} mas`}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleRecover}
            disabled={recovering}
            className="flex-1 min-h-[36px] px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60"
          >
            {recovering ? "Retomando..." : "Retomar carrito"}
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Cerrar"
            className="h-9 w-9 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
