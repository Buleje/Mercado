"use client";

import { useState, useEffect, startTransition, useMemo } from "react";
import { RotateCcw, ChevronRight, Package } from "lucide-react";
import { useCustomer } from "@/contexts/customer-context";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { cn } from "@/lib/utils";

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  image?: string;
}

interface LastOrder {
  id: string;
  createdAt: string;
  total: number;
  items: OrderItem[];
  status: string;
}

export default function LastOrderBanner() {
  const { customer } = useCustomer();
  const { addItem } = useCart();
  const { showToast } = useToast();
  const [order, setOrder] = useState<LastOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!customer?.phone) return;
    let cancelled = false;
    const phone = customer.phone;

    (async () => {
      try {
        const res = await fetch(`/api/orders?phone=${encodeURIComponent(phone)}&limit=1`);
        if (!res.ok) return;
        const data = await res.json();
        const orders = Array.isArray(data) ? data : data.orders;
        if (orders?.length > 0 && !cancelled) {
          startTransition(() => setOrder(orders[0]));
        }
      } catch {
        // Silent fail
      }
    })();

    return () => { cancelled = true; };
  }, [customer?.phone]);

  const daysSince = useMemo(() => {
    if (!order) return 0;
    return Math.floor(
      (now - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );
  }, [order, now]);

  if (!order || !customer?.phone) return null;

  const handleReorder = () => {
    setLoading(true);
    let added = 0;
    for (const item of order.items) {
      addItem({
        id: Number(item.name.replace(/\D/g, "").slice(0, 4)) || Math.random(),
        name: item.name,
        price: item.price,
        image: item.image || "",
        category: "",
        unit: "und",
      });
      added++;
    }
    showToast(`${added} productos agregados del pedido anterior`, "");
    setTimeout(() => setLoading(false), 500);
  };

  return (
    <section className="py-4 sm:py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Icon */}
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="h-6 w-6 text-primary" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">
                Tu último pedido
                <span className="text-muted font-normal ml-1">
                  · hace {daysSince === 0 ? "hoy" : daysSince === 1 ? "1 día" : `${daysSince} días`}
                </span>
              </p>
              <p className="text-xs text-muted mt-0.5 line-clamp-1">
                {order.items.slice(0, 3).map((i) => i.name).join(", ")}
                {order.items.length > 3 && ` y ${order.items.length - 3} más`}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs font-bold text-primary">S/{order.total.toFixed(2)}</span>
                <a
                  href={`/pedido/${order.id}`}
                  className="text-xs text-muted hover:text-primary transition-colors flex items-center gap-0.5"
                >
                  Ver detalle <ChevronRight className="h-3 w-3" />
                </a>
              </div>
            </div>

            {/* Reorder button */}
            <button
              onClick={handleReorder}
              disabled={loading}
              className={cn(
                "shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm",
                "bg-primary text-white hover:bg-primary-dark active:scale-95",
                loading && "opacity-60 pointer-events-none"
              )}
            >
              <RotateCcw className={cn("h-4 w-4", loading && "animate-spin")} />
              Reordenar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
