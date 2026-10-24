import { useCallback, useEffect, useRef, useState } from "react";
import { cachedJson, invalidateCachedJson } from "@/lib/client-cache-fetch";

export interface FiadoResumen {
  montoPendiente: number;
  cantidadFiados: number;
  diasVencido: number;
  hasFiadosVencidos: boolean;
}

const url = (phone: string) => `/api/customers/${encodeURIComponent(phone)}/fiado-resumen`;

/**
 * Lo que el cliente ya debe de fiado (GET /api/customers/[phone]/fiado-resumen, cifra del backend).
 * El carrito y el cobro lo piden a la vez al elegir cliente: cachedJson de 8 s junta las dos
 * consultas en una. `refrescar` salta la caché (después de un abono o de cobrar el fiado).
 */
export function useFiadoResumen(phone: string) {
  const [data, setData] = useState<FiadoResumen | null>(null);
  const [loading, setLoading] = useState(false);
  // Si cambian de cliente rápido, la respuesta del anterior no pisa la del actual.
  const pedido = useRef(0);

  const cargar = useCallback(async (fresco: boolean) => {
    const id = ++pedido.current;
    if (!phone || phone.length < 6) {
      setData(null);
      setLoading(false);
      return;
    }
    if (fresco) invalidateCachedJson(url(phone));
    setLoading(true);
    const r = await cachedJson<FiadoResumen>(url(phone), 8_000, { cache: "no-store" });
    if (id !== pedido.current) return;
    setData(r && typeof r.montoPendiente === "number" ? r : null);
    setLoading(false);
  }, [phone]);

  useEffect(() => {
    void cargar(false);
  }, [cargar]);

  const refrescar = useCallback(() => cargar(true), [cargar]);
  return { data, loading, refrescar };
}
