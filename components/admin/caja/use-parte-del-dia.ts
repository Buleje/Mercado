"use client";

/**
 * El parte del día de una caja (`GET /api/cash-registers/[id]/parte`): las
 * cuentas por origen y la conciliación con las ventas las hace el servidor.
 * `firma` cambia cuando la caja cambia (un movimiento nuevo, el cierre) y
 * dispara la relectura; una respuesta vieja no pisa a la nueva.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { ParteDelDia } from "@/lib/caja/parte-del-dia";

export function useParteDelDia(cajaId: string | null, firma: string) {
  const [parte, setParte] = useState<ParteDelDia | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pedido = useRef(0);

  const leer = useCallback(async () => {
    if (!cajaId) return;
    const mio = ++pedido.current;
    setCargando(true);
    try {
      const res = await fetch(`/api/cash-registers/${encodeURIComponent(cajaId)}/parte`, { credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (mio !== pedido.current) return;
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : `No pudimos armar el parte (error ${res.status}).`);
        return;
      }
      setParte(body as ParteDelDia);
      setError(null);
    } catch (err) {
      if (mio !== pedido.current) return;
      logger.warn("[caja] parte del día falló", { error: String(err) });
      setError("Sin conexión: no pudimos cruzar la caja con las ventas.");
    } finally {
      if (mio === pedido.current) setCargando(false);
    }
  }, [cajaId]);

  useEffect(() => {
    if (!cajaId) {
      setParte(null);
      return;
    }
    void leer();
  }, [cajaId, firma, leer]);

  return { parte, cargando, error, releer: leer };
}
