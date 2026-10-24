"use client";

/**
 * Los pedidos del cliente en esta tienda (`/api/orders?phone=`), UNA vez por
 * página: «Mi cuenta» los comparte entre el saludo (último pedido) y la
 * sección Pedidos. El total de cada pedido viene del servidor; acá no se suma.
 */

import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";

export interface PedidoCliente {
  id: string;
  status: string;
  createdAt: string;
  total?: number;
  items?: Array<{ id?: number | string; name: string; quantity?: number; qty?: number; image?: string | null }>;
}

export interface PedidosCliente {
  pedidos: PedidoCliente[];
  cargando: boolean;
  error: boolean;
  reintentar: () => void;
}

export function usePedidosCliente(celular: string | null | undefined): PedidosCliente {
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
  const [cargando, setCargando] = useState(Boolean(celular));
  const [error, setError] = useState(false);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!celular) {
      setPedidos([]);
      setCargando(false);
      return;
    }
    const ctrl = new AbortController();
    setCargando(true);
    fetch(`/api/orders?phone=${encodeURIComponent(celular)}`, { signal: ctrl.signal, credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ orders?: unknown }>;
      })
      .then((data) => {
        setPedidos(Array.isArray(data?.orders) ? (data.orders as PedidoCliente[]) : []);
        setError(false);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        logger.warn("[cuenta] no se pudieron leer los pedidos", { error: String(err) });
        setError(true);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
  }, [celular, vuelta]);

  const reintentar = useCallback(() => setVuelta((v) => v + 1), []);
  return { pedidos, cargando, error, reintentar };
}

/** Piezas del pedido (la API trae `quantity` o `qty` según la tienda que lo creó). */
export function piezasDe(p: PedidoCliente): number {
  return p.items?.reduce((acc, i) => acc + (i.quantity ?? i.qty ?? 0), 0) ?? 0;
}
