"use client";

/**
 * usePorCobrar — todo lo que te deben, tal como lo arma
 * `GET /api/admin/por-cobrar?detalle=1`: las filas, los totales por moneda
 * (derivados de esas filas) y el cruce de quien está también en «Lo que debo».
 *
 * Las cifras salen del servidor (regla de totales en backend); la pantalla
 * sólo las pinta. Sólo manda la ÚLTIMA carga pedida: dos toques a
 * «Actualizar» y la respuesta lenta de la primera pisaba a la segunda.
 *
 * Vivía dentro de `PorCobrarDashboard.tsx`; salió al sumar el cruce, para que
 * el tablero quede en dibujar (el mismo reparto que `use-por-pagar`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";
import type { PorCobrarConCruces } from "@/lib/db/por-cobrar.db";

const CERO = { total: 0, count: 0 };

export const POR_COBRAR_VACIO: PorCobrarConCruces = {
  fiados: CERO,
  prestamos: CERO,
  adelantos: CERO,
  madera: CERO,
  totalGeneral: 0,
  totales: [],
  porTipo: [],
  items: [],
  cruces: [],
  cruzable: [],
  crucesDisponibles: true,
};

export interface UsoPorCobrar {
  data: PorCobrarConCruces;
  loading: boolean;
  /** `null` = sin error. Con error, `data` conserva lo último que llegó bien. */
  error: string | null;
  recargar: () => void;
}

/** ¿La respuesta tiene la forma que la pantalla sabe pintar? */
function esDetalle(v: unknown): v is PorCobrarConCruces {
  const d = v as Partial<PorCobrarConCruces> | null;
  return !!d && Array.isArray(d.items) && Array.isArray(d.totales) && Array.isArray(d.porTipo);
}

export function usePorCobrar(): UsoPorCobrar {
  const [data, setData] = useState<PorCobrarConCruces>(POR_COBRAR_VACIO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ultima = useRef(0);

  const recargar = useCallback(() => {
    const mia = ++ultima.current;
    setLoading(true);
    setError(null);
    tenantFetch("/api/admin/por-cobrar?detalle=1")
      .then(async (r) => {
        if (!r.ok) {
          /* El 403 trae el motivo en español («Solo el administrador o el
             dueño…»): es lo que se muestra, no «HTTP 403». */
          let motivo = `HTTP ${r.status}`;
          try {
            const cuerpo = (await r.json()) as { message?: string; error?: string } | null;
            motivo = cuerpo?.message || cuerpo?.error || motivo;
          } catch {
            /* El cuerpo no era JSON (un 502 del proxy): queda el código HTTP. */
          }
          throw new Error(motivo);
        }
        return r.json() as Promise<unknown>;
      })
      .then((d) => {
        if (mia !== ultima.current) return;
        if (!esDetalle(d)) throw new Error("Respuesta inesperada");
        setData({ ...POR_COBRAR_VACIO, ...d });
      })
      .catch((err: unknown) => {
        if (mia !== ultima.current) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar");
      })
      .finally(() => {
        if (mia === ultima.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { data, loading, error, recargar };
}
