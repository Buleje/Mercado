'use client';

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, ShoppingCart, X, AlertTriangle } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useCustomer } from "@/contexts/customer-context";

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

export default function QuickReorder() {
  const [lastOrder, setLastOrder] = useState<LastOrder | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { addItem } = useCart();
  const { showToast } = useToast();
  const { customer } = useCustomer();

  useEffect(() => {
    try {
      // Try from localStorage first
      const saved = localStorage.getItem("bsm-last-order");
      if (saved) {
        setLastOrder(JSON.parse(saved));
        return;
      }
      // If customer is identified, try to fetch last order
      if (customer?.phone) {
        fetch(`/api/customers/${encodeURIComponent(customer.phone)}/orders?limit=1`)
          .then(r => r.ok ? r.json() : null)
          .then((data) => {
            if (data && Array.isArray(data) && data.length > 0) {
              const order = data[0];
              if (order.items && order.items.length > 0) {
                const lastOrderData: LastOrder = {
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
                setLastOrder(lastOrderData);
                localStorage.setItem("bsm-last-order", JSON.stringify(lastOrderData));
              }
            }
          })
          .catch(() => { /* ignore */ });
      }
    } catch { /* ignore */ }
  }, [customer?.phone]);

  if (!lastOrder || dismissed || lastOrder.items.length === 0) return null;

  const handleReorder = () => {
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
      showToast(`${added} productos agregados. ${skipped.join(", ")} no disponible(s)`, "");
    } else {
      showToast(`${added} productos agregados al carrito`, "");
    }
  };

  const itemNames = lastOrder.items.slice(0, 3).map(i => i.name).join(", ");
  const moreCount = lastOrder.items.length > 3 ? lastOrder.items.length - 3 : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="bg-gradient-to-r from-[#00B4A6]/5 to-[#f97316]/5 dark:from-[#00B4A6]/10 dark:to-[#f97316]/10 rounded-2xl border border-[#00B4A6]/15 dark:border-[#00B4A6]/25 p-4 sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20 flex items-center justify-center flex-shrink-0">
            <RotateCcw className="h-5 w-5 text-[#00B4A6] dark:text-[#2dd4bf]" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">
                Tu ultimo pedido
              </h3>
              <button
                onClick={() => setDismissed(true)}
                className="h-7 w-7 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-3.5 w-3.5 text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 truncate">
              {itemNames}{moreCount > 0 ? ` y ${moreCount} mas` : ""}
            </p>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handleReorder}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#00B4A6] hover:bg-[#009690] text-white text-sm font-bold transition-all shadow-lg shadow-[#00B4A6]/20 active:scale-[0.98]"
              >
                <ShoppingCart className="h-5 w-5" />
                Repetir pedido · S/ {lastOrder.total.toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
