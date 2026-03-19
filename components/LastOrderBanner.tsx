"use client";

import { useState, useEffect, startTransition, useMemo } from "react";
import dynamic from "next/dynamic";
import { RotateCcw, ChevronRight, Package } from "lucide-react";
import { useCustomer } from "@/contexts/customer-context";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { cn } from "@/lib/utils";

const QuickReorderModal = dynamic(() => import("@/components/QuickReorderModal"));

interface OrderItem {
  productId?: number;
  name: string;
  quantity: number;
  price: number;
  unit: string;
  image: string;
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
  const { addMultiple } = useCart();
  const { showToast } = useToast();
  const [order, setOrder] = useState<LastOrder | null>(null);
  const [avgFrequency, setAvgFrequency] = useState<number | null>(null);
  const [now] = useState(() => Date.now());
  const [showReorderModal, setShowReorderModal] = useState(false);

  useEffect(() => {
    if (!customer?.phone) return;
    let cancelled = false;
    const phone = customer.phone;

    (async () => {
      try {
        const res = await fetch(`/api/orders?phone=${encodeURIComponent(phone)}&limit=5`);
        if (!res.ok) return;
        const data = await res.json();
        const orders: LastOrder[] = Array.isArray(data) ? data : data.orders;
        if (orders?.length > 0 && !cancelled) {
          startTransition(() => setOrder(orders[0]));

          // Calculate average frequency between orders
          if (orders.length >= 2) {
            const dates = orders.map(o => new Date(o.createdAt).getTime()).sort((a, b) => b - a);
            const gaps: number[] = [];
            for (let i = 0; i < dates.length - 1; i++) {
              gaps.push(Math.round((dates[i] - dates[i + 1]) / 86_400_000));
            }
            const avg = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
            if (avg > 0 && !cancelled) startTransition(() => setAvgFrequency(avg));
          }
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
    setShowReorderModal(true);
  };

  const handleReorderConfirm = (selected: { product: { id: number; name: string; price: number; image: string; unit: string; category: string }; quantity: number }[]) => {
    if (selected.length) {
      addMultiple(selected);
      showToast(`${selected.reduce((sum, s) => sum + s.quantity, 0)} productos agregados`, "");
    }
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
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-xs font-bold text-primary">S/{order.total.toFixed(2)}</span>
                <a
                  href={`/pedido/${order.id}`}
                  className="text-xs text-muted hover:text-primary transition-colors flex items-center gap-0.5"
                >
                  Ver detalle <ChevronRight className="h-3 w-3" />
                </a>
                {avgFrequency && avgFrequency > 0 && (
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full",
                    daysSince >= avgFrequency
                      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                      : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                  )}>
                    {daysSince >= avgFrequency
                      ? `⏰ Sueles pedir cada ~${avgFrequency}d — ¡Toca reordenar!`
                      : `📊 Pides cada ~${avgFrequency} días`}
                  </span>
                )}
              </div>
            </div>

            {/* Reorder button */}
            <button
              onClick={handleReorder}
              className={cn(
                "shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm",
                "bg-primary text-white hover:bg-primary-dark active:scale-95",
              )}
            >
              <RotateCcw className="h-4 w-4" />
              Reordenar
            </button>
          </div>
        </div>
      </div>

      {/* Quick Reorder Modal */}
      {showReorderModal && order && (
        <QuickReorderModal
          items={order.items.map((i) => ({
            ...i,
            unit: i.unit || "und",
            image: i.image || "",
          }))}
          orderId={order.id}
          orderDate={new Date(order.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
          onClose={() => setShowReorderModal(false)}
          onConfirm={handleReorderConfirm}
        />
      )}
    </section>
  );
}
