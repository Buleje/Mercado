"use client";

/**
 * useCorridaCompra — la propuesta de «Ligar con su compra» de UNA corrida y su
 * confirmación (ADR-485). El servidor calcula la propuesta y, al confirmar, la
 * vuelve a calcular: el cliente sólo manda la firma de la que vio.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { PropuestaCompra } from "@/lib/forestal/corrida-compra";

const URL = "/api/admin/forestal/ctp/corrida-compra";

async function mensajeDe(r: Response): Promise<string> {
  const j = (await r.json().catch(() => ({}))) as { message?: string };
  return j.message ?? `El servidor respondió ${r.status}`;
}

export interface EstadoCorridaCompra {
  propuesta: PropuestaCompra | null;
  cargando: boolean;
  error: string | null;
  ligando: boolean;
  /** m³ ligados en la última confirmación (para el aviso de «listo»). */
  ligadoM3: number | null;
  ligar: () => Promise<boolean>;
  recargar: () => void;
}

/** `activo: false` = no pide la propuesta (la corrida ya no tiene qué ligar), pero conserva el «listo». */
export function useCorridaCompra(corridaId: string, activo = true): EstadoCorridaCompra {
  const [propuesta, setPropuesta] = useState<PropuestaCompra | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ligando, setLigando] = useState(false);
  const [ligadoM3, setLigadoM3] = useState<number | null>(null);
  const pedido = useRef(0);

  /** `limpiarError: false` tras un POST rechazado: el motivo queda a la vista con la propuesta nueva. */
  const releer = useCallback((limpiarError: boolean) => {
    const n = ++pedido.current;
    setCargando(true);
    if (limpiarError) setError(null);
    fetch(`${URL}?ctpEntryId=${encodeURIComponent(corridaId)}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await mensajeDe(r));
        return (await r.json()) as { propuesta: PropuestaCompra };
      })
      .then((j) => {
        if (n === pedido.current) setPropuesta(j.propuesta);
      })
      .catch((e: unknown) => {
        if (n === pedido.current) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (n === pedido.current) setCargando(false);
      });
  }, [corridaId]);
  const recargar = useCallback(() => releer(true), [releer]);

  useEffect(() => {
    if (!activo) return;
    recargar();
    return () => {
      pedido.current += 1;
    };
  }, [activo, recargar]);

  const ligar = useCallback(async () => {
    if (!propuesta) return false;
    setLigando(true);
    setError(null);
    try {
      const r = await fetch(URL, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ ctpEntryId: corridaId, firma: propuesta.firma }),
      });
      if (!r.ok) {
        setError(await mensajeDe(r));
        /* Desactualizada u ocupada: se muestra la de ahora en vez de reintentar a ciegas. */
        releer(false);
        return false;
      }
      setLigadoM3(propuesta.cubreM3);
      /* La madera de esas guías ya no está libre: Saldos, el patio y el rendimiento leen de nuevo. */
      invalidarCtp();
      recargar();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setLigando(false);
    }
  }, [corridaId, propuesta, recargar, releer]);

  return { propuesta, cargando, error, ligando, ligadoM3, ligar, recargar };
}
