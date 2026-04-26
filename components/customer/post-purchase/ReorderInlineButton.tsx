"use client";

/**
 * ReorderInlineButton — CK-4: "Comprar de nuevo" en página de confirmación.
 *
 * Lee los items del order desde localStorage (buleje-last-order) — ya
 * escrito por checkout-submit-helpers.ts#saveLastOrder — y los agrega
 * al carrito via useCart().addItem. Redirige a /checkout con openCheckout().
 *
 * NO duplica lógica de precios: usa los precios guardados solo para
 * poblar el carrito; el backend recomputa el total en el POST final.
 *
 * ADR-068: tokens CSS, 0 emojis, 0 gradientes decorativos.
 */

import { useCallback, useState } from "react";
import { RotateCcw, Loader2 } from "@buleje/design-system/icons";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";

interface StoredOrderItem {
  name: string;
  quantity: number;
  price: number;
  unit: string;
  image: string;
}

interface StoredOrder {
  id: string;
  items: StoredOrderItem[];
  total: number;
}

interface ReorderInlineButtonProps {
  /** orderId del pedido a repetir — se usa para leer el localStorage key. */
  orderId: string;
}

export default function ReorderInlineButton({ orderId }: ReorderInlineButtonProps) {
  const { addItem, openCheckout } = useCart();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleReorder = useCallback(() => {
    setLoading(true);
    try {
      // Lee el pedido del localStorage escrito por saveLastOrder()
      const raw = localStorage.getItem("buleje-last-order");
      if (!raw) {
        showToast("No se encontró el pedido para repetir.", "");
        return;
      }

      const stored = JSON.parse(raw) as StoredOrder;

      // Verificar que corresponde al pedido actual (o al último guardado)
      const isCurrentOrder = stored.id === orderId || !orderId;
      if (!isCurrentOrder) {
        // Si hay un pedido más reciente guardado, igualmente permitir repetirlo
        // (el usuario confirmó explícitamente al hacer click)
      }

      if (!stored.items || stored.items.length === 0) {
        showToast("El pedido no tiene productos para agregar.", "");
        return;
      }

      let added = 0;
      const skipped: string[] = [];

      for (const item of stored.items) {
        // Los items de localStorage pueden no tener id numérico — skip si falta
        const itemAny = item as StoredOrderItem & { id?: number };
        if (!itemAny.id || itemAny.id <= 0) {
          skipped.push(item.name);
          continue;
        }
        addItem({
          id: itemAny.id,
          name: item.name,
          price: item.price,
          image: item.image ?? "",
          unit: item.unit ?? "und",
          category: "",
        });
        added++;
      }

      if (added === 0) {
        showToast(
          skipped.length > 0
            ? `No se pudieron agregar los productos (${skipped.join(", ")}).`
            : "No se encontraron productos válidos.",
          "",
        );
        return;
      }

      if (skipped.length > 0) {
        showToast(
          `${added} ${added === 1 ? "producto agregado" : "productos agregados"}. ${skipped.join(", ")} no disponible(s).`,
          "",
        );
      } else {
        showToast(
          `${added} ${added === 1 ? "producto agregado" : "productos agregados"} al carrito.`,
          "",
        );
      }

      // Abrir checkout directamente
      openCheckout();
    } catch {
      showToast("No se pudo procesar el pedido. Intenta de nuevo.", "");
    } finally {
      setLoading(false);
    }
  }, [orderId, addItem, openCheckout, showToast]);

  return (
    <button
      type="button"
      onClick={handleReorder}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" aria-hidden />
      ) : (
        <RotateCcw className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
      )}
      Comprar de nuevo
    </button>
  );
}
