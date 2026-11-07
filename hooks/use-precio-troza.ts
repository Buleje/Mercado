"use client";

/**
 * usePrecioTroza — lee `GET /api/admin/forestal/precio-troza` para la vista
 * «¿Cuánto pagar por la troza?» (noche 04-11, carril B2).
 *
 * Las casillas cambian en cada tecla; la consulta sale con una espera corta
 * (`ESPERA_MS`) para no pedirle al servidor una cuenta por cada dígito. Mientras
 * llega la nueva se queda la anterior a la vista (`recalculando`), y una
 * respuesta vieja nunca pisa a la nueva (AbortController).
 */
import { useCallback, useEffect, useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import type { AgruparOrigenPor, PrecioTrozaDTO } from "@/lib/forestal/precio-troza-tipos";
import { consultaPrecioTroza, type CasillasPrecioTroza } from "@/components/admin/forestal/precio-troza/precio-troza-formato";

const URL_PRECIO_TROZA = "/api/admin/forestal/precio-troza";
export const ESPERA_MS = 600;

export interface EstadoPrecioTroza {
  datos: PrecioTrozaDTO | null;
  /** La primera lectura (no hay nada que mostrar todavía). */
  cargando: boolean;
  /** Hay datos a la vista y llega otra cuenta (casillas o agrupado cambiaron). */
  recalculando: boolean;
  error: string | null;
  recargar: () => void;
}

export function usePrecioTroza(casillas: CasillasPrecioTroza, agrupar: AgruparOrigenPor): EstadoPrecioTroza {
  const consulta = useDebounce(consultaPrecioTroza(casillas, agrupar), ESPERA_MS);
  const [datos, setDatos] = useState<PrecioTrozaDTO | null>(null);
  const [leyendo, setLeyendo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLeyendo(true);
    setError(null);
    fetch(`${URL_PRECIO_TROZA}?${consulta}`, { credentials: "include", signal: ctrl.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as Partial<PrecioTrozaDTO> & { message?: string };
        if (!r.ok) throw new Error(j.message ?? `No se pudo calcular el precio de la troza (HTTP ${r.status}).`);
        setDatos(j as PrecioTrozaDTO);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLeyendo(false);
      });
    return () => ctrl.abort();
  }, [consulta, vuelta]);

  return { datos, cargando: leyendo && !datos, recalculando: leyendo && !!datos, error, recargar };
}
