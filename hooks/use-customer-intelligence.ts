"use client";

import { useEffect, useState } from "react";

/**
 * useCustomerIntelligence — datos agregados del usuario para personalización.
 *
 * Fetch a /api/customer/intelligence con signals:
 *   - Última compra (para welcome-back)
 *   - Racha de compras consecutivas (streak)
 *   - Productos más pedidos (para próxima compra sugerida)
 *   - Cumpleaños (para birthday moment)
 *   - Ciudad detectada
 *   - Primera visita o recurring
 *
 * Cache: 5 min client-side, 1 min server.
 */

export interface CustomerIntelligence {
  /** Nombre del usuario */
  name: string | null;
  /** Primera visita ever */
  isFirstVisit: boolean;
  /** Cliente recurring (>= 2 pedidos) */
  isRecurring: boolean;
  /** Dias desde ultima compra (null si nunca compró) */
  daysSinceLastOrder: number | null;
  /** Racha de dias con pedido */
  streakDays: number;
  /** Producto mas pedido (para "ya casi se acaba tu X") */
  topProduct: { name: string; daysUntilLikelyOut: number } | null;
  /** Cumpleaños HOY */
  isBirthday: boolean;
  /** Ciudad detectada — "Pucallpa", "Iquitos", etc. */
  city: string | null;
  /** Puntos actuales del programa fidelidad */
  loyaltyPoints: number;
  /** Tier actual */
  loyaltyTier: "bronce" | "plata" | "oro" | "diamante" | null;
}

const FALLBACK: CustomerIntelligence = {
  name: null,
  isFirstVisit: true,
  isRecurring: false,
  daysSinceLastOrder: null,
  streakDays: 0,
  topProduct: null,
  isBirthday: false,
  city: null,
  loyaltyPoints: 0,
  loyaltyTier: null,
};

export function useCustomerIntelligence(): {
  data: CustomerIntelligence;
  loading: boolean;
  error: boolean;
} {
  const [data, setData] = useState<CustomerIntelligence>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch("/api/customer/intelligence");
        if (!res.ok) throw new Error();
        const json = (await res.json()) as CustomerIntelligence;
        if (active) {
          setData({ ...FALLBACK, ...json });
          setError(false);
        }
      } catch {
        if (active) {
          setError(true);
          setData(FALLBACK);
        }
      }
      if (active) setLoading(false);
    };

    load();
    // Refresh cada 5 min (cambios de día, birthday trigger, etc.)
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return { data, loading, error };
}
