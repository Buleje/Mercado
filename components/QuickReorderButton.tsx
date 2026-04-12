"use client";

import { useState, useCallback } from "react";
import { RotateCcw, Loader2 } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { cn } from "@/lib/utils";

interface ReorderItem {
  productId?: number;
  name: string;
  price?: number;
  quantity: number;
  unit: string;
  image: string;
  category?: string;
}

interface QuickReorderButtonProps {
  items: ReorderItem[];
  className?: string;
}

/**
 * #24 Auto-reorder — CTA principal "Repetir ultimo pedido".
 * Agrega al carrito los items del ultimo pedido via addMultiple.
 * No toca cart-context directamente — usa la API pública del hook.
 */
export default function QuickReorderButton({ items, className }: QuickReorderButtonProps) {
  const { addMultiple } = useCart();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleReorder = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);

    const cartItems = items
      .filter((i) => i.productId)
      .map((i) => ({
        product: {
          id: i.productId!,
          name: i.name,
          price: i.price ?? 0,
          image: i.image,
          unit: i.unit,
          category: i.category ?? "",
        },
        quantity: i.quantity,
      }));

    if (cartItems.length === 0) {
      setLoading(false);
      return;
    }

    addMultiple(cartItems);
    showToast(
      `${cartItems.reduce((sum, c) => sum + c.quantity, 0)} productos agregados al carrito`,
      ""
    );
    setDone(true);
    setLoading(false);
    // Reset visual feedback after 3s
    setTimeout(() => setDone(false), 3000);
  }, [items, loading, done, addMultiple, showToast]);

  return (
    <button
      onClick={handleReorder}
      disabled={loading || items.length === 0}
      aria-label="Repetir ultimo pedido"
      className={cn(
        "inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 shadow-sm",
        done
          ? "bg-green-500 text-white"
          : "bg-primary hover:bg-primary/90 text-white active:scale-95",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RotateCcw className={cn("h-4 w-4", done && "animate-spin")} />
      )}
      {done ? "Agregado al carrito" : "Repetir ultimo pedido"}
    </button>
  );
}
