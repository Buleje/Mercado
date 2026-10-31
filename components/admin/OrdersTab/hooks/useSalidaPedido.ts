"use client";

/**
 * Para cuándo pidió el cliente su pedido y si Preparación ya lo dejó listo
 * para salir (`GET /api/admin/pedidos/entrega?id=`, 17-10). Lo lee el detalle
 * del pedido: la franja va en «Contacto y entrega» y el chip en la cabecera.
 *
 * Si falla, el detalle sigue igual (sin franja ni chip) y queda en el log: no
 * es un dato que frene nada. Una respuesta vieja no pisa a la del pedido abierto.
 */
import { useEffect, useRef, useState } from "react";
import type { EntregaPrep, MarcaListo } from "@/lib/pedidos/preparacion";
import { logger } from "@/lib/logger";
import { tenantFetch } from "@/lib/tenant-fetch";

export interface SalidaPedido {
  entrega: EntregaPrep | null;
  listo: MarcaListo | null;
}

const VACIA: SalidaPedido = { entrega: null, listo: null };

export function useSalidaPedido(orderId: string, clave = ""): SalidaPedido {
  const [salida, setSalida] = useState<SalidaPedido & { id: string }>({ ...VACIA, id: "" });
  const ultimo = useRef(0);

  useEffect(() => {
    const pedido = ++ultimo.current;
    const ctrl = new AbortController();
    tenantFetch(`/api/admin/pedidos/entrega?id=${encodeURIComponent(orderId)}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Partial<SalidaPedido>;
        if (pedido !== ultimo.current) return;
        setSalida({ id: orderId, entrega: json.entrega ?? null, listo: json.listo ?? null });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted || pedido !== ultimo.current) return;
        logger.warn("[pedidos] entrega del pedido no cargó", { error: String(err) });
      });
    return () => ctrl.abort();
  }, [orderId, clave]);

  // Al cambiar de pedido no se muestra la franja del anterior mientras llega la nueva.
  return salida.id === orderId ? salida : VACIA;
}
