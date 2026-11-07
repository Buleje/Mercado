import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import type { RemanenteRespuesta } from "@/components/admin/notas-credito/nc-compartido";

interface Estado {
  id: string | null;
  datos: RemanenteRespuesta | null;
  error: string | null;
  cargando: boolean;
}

/**
 * Lo que queda por acreditar de una venta (o de un pedido de la tienda), sus líneas y su historial (`GET /api/notas-credito/remanente`).
 * Lo usan el asistente (F09/F12) y el detalle de una nota (F16). Al cambiar de venta, la respuesta vieja
 * se descarta (AbortController) y nunca se muestra la de otra venta.
 */
export function useRemanenteDocumento(docId: string | null | undefined, clave: "saleId" | "orderId" = "saleId") {
  // La consulta entera es la llave: una venta y un pedido con el mismo id no se confunden.
  const id = docId ? `${clave}=${encodeURIComponent(docId)}` : null;
  const [estado, setEstado] = useState<Estado>({ id: null, datos: null, error: null, cargando: false });
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    setEstado((prev) => ({ id, datos: prev.id === id ? prev.datos : null, error: null, cargando: true }));
    fetch(`/api/notas-credito/remanente?${id}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        const j = (await res.json().catch(() => null)) as (RemanenteRespuesta & { error?: unknown }) | null;
        if (!res.ok || !j) throw new Error(typeof j?.error === "string" ? j.error : `El servidor respondió ${res.status}.`);
        if (!ctrl.signal.aborted) setEstado({ id, datos: j, error: null, cargando: false });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        logger.warn("[notas-credito] lo que queda del documento", { error: String(err) });
        setEstado({ id, datos: null, error: err instanceof Error ? err.message : "No se pudo leer lo que queda del documento.", cargando: false });
      });
    return () => ctrl.abort();
  }, [id, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  const vigente = !!id && estado.id === id;
  return {
    datos: vigente ? estado.datos : null,
    cargando: !!id && (!vigente || estado.cargando),
    error: vigente ? estado.error : null,
    recargar,
  };
}
