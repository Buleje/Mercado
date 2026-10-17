"use client";

/**
 * La caja abierta del negocio, para el Resumen de Mi Plata.
 *
 * Lee `/api/finanzas/caja-abierta` (sólo lectura). Tres estados que la pantalla
 * tiene que distinguir: cargando, «no se pudo leer» (red o permiso) y la
 * respuesta — que puede ser «no hay caja abierta». Confundir el error con «no
 * hay caja» sería afirmar algo que no se sabe.
 */

import { useCallback, useEffect, useState } from "react";
import type { ArqueoEstado } from "@/lib/caja/arqueo-veredicto";

export type CajaDelResumen =
  | { abierta: false }
  | {
      abierta: true;
      id: string;
      /** ISO de la apertura. */
      desde: string;
      movimientos: number;
      apertura: number;
      ventasEfectivo: number;
      ingresos: number;
      egresos: number;
      esperado: number;
      veredicto: ArqueoEstado;
    };

export interface UsoCajaAbierta {
  caja: CajaDelResumen | null;
  cargando: boolean;
  error: boolean;
  recargar: () => void;
}

export function useCajaAbierta(): UsoCajaAbierta {
  const [caja, setCaja] = useState<CajaDelResumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(false);
    fetch("/api/finanzas/caja-abierta", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as CajaDelResumen;
      })
      .then((d) => { if (vivo) setCaja(d); })
      .catch(() => { if (vivo) { setCaja(null); setError(true); } })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { caja, cargando, error, recargar };
}

/**
 * El efectivo que el tablero puede afirmar: el esperado de la caja abierta si
 * es un monto posible. `null` = no se sabe (sin caja, error o saldo negativo).
 */
export function efectivoConocido(caja: CajaDelResumen | null): number | null {
  if (!caja || !caja.abierta) return null;
  return caja.veredicto === "imposible" ? null : caja.esperado;
}
