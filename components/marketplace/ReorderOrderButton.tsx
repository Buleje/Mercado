"use client";

/**
 * ReorderOrderButton — re-pedir UN pedido especifico (no el ultimo).
 *
 * MK-28 — clona los items de un pedido al carrito marketplace en un click.
 * Diferencia con `ReorderButton`:
 *   - ReorderButton: solo el ultimo pedido global, fetch al montar
 *   - ReorderOrderButton: pedido puntual ya cargado en la pagina, sin fetch
 *
 * Sprint 3 marketplace blueprint.
 */

import { useCallback, useState } from "react";
import { RotateCcw, Check } from "@buleje/design-system/icons";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useToast } from "@/contexts/toast-context";
import { cn } from "@/lib/utils";

interface OrderItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  image?: string | null;
}

interface Props {
  orderId: string;
  storeSlug: string;
  items: OrderItem[];
  className?: string;
}

function slugToName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ReorderOrderButton({ orderId, storeSlug, items, className }: Props) {
  const { addItem } = useMarketplaceCart();
  const { showToast } = useToast();
  const [done, setDone] = useState(false);

  const handleClick = useCallback(() => {
    if (items.length === 0) return;
    const totalUnits = items.reduce((s, i) => s + i.quantity, 0);

    for (const item of items) {
      addItem({
        storeId: storeSlug,
        storeName: slugToName(storeSlug),
        storeSlug,
        storeProductId: `reorder-${orderId}-${item.productId}`,
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image ?? null,
        unit: item.unit,
      });
    }

    showToast(
      `${totalUnits} ${totalUnits === 1 ? "producto agregado" : "productos agregados"} al carrito`,
      "",
    );
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }, [addItem, items, orderId, showToast, storeSlug]);

  if (items.length === 0) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Re-pedir ${items.length} productos del pedido ${orderId}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
        done
          ? "border-[var(--data-success)]/30 bg-[var(--data-success)]/10 text-[var(--data-success)]"
          : "border-[var(--accent)]/30 bg-[var(--accent)]/5 text-[var(--accent)] hover:bg-[var(--accent)]/10",
        className,
      )}
    >
      {done ? (
        <>
          <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Agregado
        </>
      ) : (
        <>
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Re-pedir
        </>
      )}
    </button>
  );
}
