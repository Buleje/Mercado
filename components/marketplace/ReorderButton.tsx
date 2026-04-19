"use client";

import { useEffect, useState, useCallback } from "react";
import { RotateCcw } from "@buleje/design-system/icons";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useToast } from "@/contexts/toast-context";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReorderItem {
  productId: number;
  name: string;
  quantity: number;
  price: number;
  unit: string;
  storeSlug: string;
}

interface ReorderButtonProps {
  customerPhone?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convierte un slug a nombre legible ("bodega-san-martin" → "Buleje") */
function slugToName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * ReorderButton — botón de "Repetir último pedido" para el marketplace.
 *
 * Obtiene el último pedido del cliente desde el servidor (no localStorage)
 * para que funcione incluso si el cliente cambió de dispositivo o limpió datos.
 *
 * - Si no hay customerPhone: no renderiza nada.
 * - Si el servidor devuelve items vacíos: no renderiza nada.
 * - Al hacer clic: pre-llena el carrito con los items del último pedido.
 *
 * Se integra en MarketplaceContent (hero area) como CTA secundario,
 * sin tocar el navbar para evitar regresiones en MarketplaceNavbar.test.tsx.
 */
export default function ReorderButton({ customerPhone }: ReorderButtonProps) {
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { addItem } = useMarketplaceCart();
  const { showToast } = useToast();

  // Fetch último pedido al montar (solo si hay teléfono)
  useEffect(() => {
    if (!customerPhone) return;

    let cancelled = false;
    setLoading(true);

    fetch("/api/marketplace/reorder/last", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: customerPhone }),
    })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items?: ReorderItem[] }) => {
        if (!cancelled) {
          setItems(Array.isArray(data.items) ? data.items : []);
        }
      })
      .catch(() => {
        // Red caída o error — no mostrar el botón
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerPhone]);

  const handleReorder = useCallback(() => {
    if (items.length === 0) return;

    const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);

    for (const item of items) {
      addItem({
        storeId:        item.storeSlug, // fallback: storeSlug como ID para pre-fill
        storeName:      slugToName(item.storeSlug),
        storeSlug:      item.storeSlug,
        storeProductId: `reorder-${item.productId}`, // placeholder — checkout revalida
        productId:      item.productId,
        name:           item.name,
        price:          item.price,
        quantity:       item.quantity,
        image:          null,
        unit:           item.unit,
      });
    }

    showToast(
      `${totalUnits} ${totalUnits === 1 ? "producto agregado" : "productos agregados"} al carrito`,
      "",
    );
  }, [addItem, items, showToast]);

  // No renderizar mientras carga, sin teléfono o sin items
  if (!customerPhone || loading || items.length === 0) return null;

  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <button
      onClick={handleReorder}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 dark:border-primary/20 dark:bg-primary/10 dark:hover:bg-primary/20"
      aria-label={`Repetir último pedido — ${totalUnits} productos`}
    >
      <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
      Repetir último pedido ({totalUnits} {totalUnits === 1 ? "item" : "items"})
    </button>
  );
}
