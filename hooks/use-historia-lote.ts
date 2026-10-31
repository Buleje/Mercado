"use client";

/**
 * use-historia-lote — el expediente de UN lote, pedido a demanda.
 *
 * Va aparte del listado (`useLotesAserrio`) a propósito: el tramo de salida
 * hace dos saltos más contra la base —las guías del lote, y después TODOS los
 * orígenes de esas guías para saber con quién viajó— y no tiene sentido pagar
 * eso para pintar las tarjetas de la vista de lotes.
 */
import { useCallback, useEffect, useState } from "react";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import type { HistoriaLote } from "@/lib/forestal/historia-lote";

export interface EstadoHistoriaLote {
  historia: HistoriaLote | null;
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
}

export function useHistoriaLote(loteId: string | null): EstadoHistoriaLote {
  const [historia, setHistoria] = useState<HistoriaLote | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!loteId) {
      setHistoria(null);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const r = await ctpGet<{ historia: HistoriaLote }>(
        `/api/admin/forestal/lotes-aserrio?historia=${encodeURIComponent(loteId)}`,
      );
      setHistoria(r.historia);
    } catch (e) {
      /* El expediente se limpia al fallar: dejar el del lote ANTERIOR en
         pantalla con el nombre del nuevo arriba es la peor de las mentiras. */
      setHistoria(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [loteId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { historia, cargando, error, recargar };
}
