"use client";

/**
 * use-trozas-patio — una sola lectura del patio para toda la pestaña.
 *
 * El resumen de arriba y la lista de abajo tienen que contar lo MISMO. Si cada
 * uno pide sus datos por su lado, en un patio que se mueve terminan discrepando
 * por unos segundos y el operador ve un total que no cierra con las filas que
 * está mirando —el peor bug posible en una pantalla de inventario—.
 *
 * `truncado` se propaga a propósito: el endpoint trae hasta 5.000 piezas y quien
 * muestre totales tiene que poder decir «hay N y estás viendo M».
 */

import { useCallback, useEffect, useState } from "react";
import type { TrozaPatio } from "@/lib/forestal/trozas-patio";

/** La pieza tal como la devuelve `/api/admin/forestal/trozas/patio`. */
export interface TrozaPatioAPI extends TrozaPatio {
  woodEntryId: string;
  codificacion: string | null;
  codigoPlanta: string | null;
  parcela: string | null;
  especieCientifica: string | null;
  d1Cm: number | null;
  d2Cm: number | null;
  largoM: number | null;
  proveedor: string | null;
  resolucion: string | null;
  guiaRecepcionada: boolean;
  loteAserrioId: string | null;
}

export interface PatioMeta {
  total: number;
  devueltas: number;
  truncado: boolean;
}

export function useTrozasPatio() {
  const [trozas, setTrozas] = useState<TrozaPatioAPI[]>([]);
  const [meta, setMeta] = useState<PatioMeta>({ total: 0, devueltas: 0, truncado: false });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/trozas/patio", { credentials: "include" });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const j = (await r.json()) as { trozas?: TrozaPatioAPI[]; total?: number; devueltas?: number; truncado?: boolean };
      setTrozas(j.trozas ?? []);
      setMeta({ total: j.total ?? 0, devueltas: j.devueltas ?? 0, truncado: Boolean(j.truncado) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { trozas, meta, cargando, error, recargar };
}
