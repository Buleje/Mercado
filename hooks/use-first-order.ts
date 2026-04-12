"use client";

import { useState, useEffect, startTransition } from "react";
import { useCustomer } from "@/contexts/customer-context";

/**
 * Hook para detectar si el usuario ha completado su primera compra.
 * Esto se usa para mostrar features como notificaciones, social proof, etc.
 * solo después de que el usuario haya realizado al menos un pedido.
 */
export function useHasCompletedFirstOrder(): boolean | null {
  const { customer } = useCustomer();
  const [hasOrder, setHasOrder] = useState<boolean | null>(null);

  useEffect(() => {
    // Check localStorage first (fast path)
    const local = localStorage.getItem("buleje-first-order-completed");
    if (local === "true") {
      startTransition(() => setHasOrder(true));
      return;
    }

    // If no customer, definitely no order
    if (!customer?.phone) {
      startTransition(() => setHasOrder(false));
      return;
    }

    // Check API for orders
    fetch(`/api/orders?phone=${encodeURIComponent(customer.phone)}&limit=1`)
      .then((r) => r.json())
      .then((data) => {
        const completed = Array.isArray(data) && data.length > 0;
        startTransition(() => setHasOrder(completed));
        if (completed) {
          localStorage.setItem("buleje-first-order-completed", "true");
        }
      })
      .catch(() => startTransition(() => setHasOrder(false)));
  }, [customer?.phone]);

  return hasOrder;
}
