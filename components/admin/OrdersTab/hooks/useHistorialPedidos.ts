"use client";

/**
 * Qué le pasó a cada pedido (cambios de estado con quién y su nota, y las
 * notas internas) desde `GET /api/orders/historial?ids=` — 17-10, P05/P10/O09.
 *
 * Lo leen el detalle (línea de tiempo y notas: antes eran una ESTIMACIÓN y las
 * notas nunca se guardaron) y Archivados (columna «Cierre»: quién lo cerró,
 * cuándo y por qué). `clave` cambia cuando hay que releer (el pedido cambió
 * de estado, se guardó una nota); `recargar` relee a mano.
 *
 * Una respuesta vieja no pisa a la nueva: sólo se guarda la del último pedido.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { EventoPedido } from "@/lib/db/pedido-historial.db";
import { logger } from "@/lib/logger";
import { tenantFetch } from "@/lib/tenant-fetch";

export type { EventoPedido };

/** Lo que pide el endpoint por vez (`MAX_PEDIDOS_HISTORIAL`). */
const TOPE = 200;

export interface HistorialPedidos {
  historial: Readonly<Record<string, EventoPedido[]>>;
  cargando: boolean;
  error: boolean;
  recargar: () => void;
}

export function useHistorialPedidos(ids: readonly string[], clave = ""): HistorialPedidos {
  const lista = ids.slice(0, TOPE).join(",");
  const [historial, setHistorial] = useState<Record<string, EventoPedido[]>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const ultimo = useRef(0);

  useEffect(() => {
    if (!lista) {
      setHistorial({});
      setCargando(false);
      setError(false);
      return;
    }
    const pedido = ++ultimo.current;
    const ctrl = new AbortController();
    setCargando(true);
    setError(false);
    tenantFetch(`/api/orders/historial?ids=${encodeURIComponent(lista)}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { historial?: Record<string, EventoPedido[]> };
        if (pedido !== ultimo.current) return;
        setHistorial(json.historial ?? {});
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted || pedido !== ultimo.current) return;
        logger.warn("[pedidos] historial no cargó", { error: String(err) });
        setError(true);
      })
      .finally(() => {
        if (pedido === ultimo.current) setCargando(false);
      });
    return () => ctrl.abort();
  }, [lista, clave, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { historial, cargando, error, recargar };
}

/** El último cambio de estado (el que cerró un archivado), o null si no quedó registro. */
export function ultimoCambio(eventos: readonly EventoPedido[] | undefined) {
  if (!eventos) return null;
  for (let i = eventos.length - 1; i >= 0; i--) {
    const e = eventos[i];
    if (e.tipo === "estado") return e;
  }
  return null;
}
