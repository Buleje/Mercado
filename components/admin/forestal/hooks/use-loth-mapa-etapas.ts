"use client";

/**
 * useLothMapaEtapas — lo que el libro hizo con cada árbol del censo del plan
 * activo (tala, trozas, despachos, CTP), calculado en el servidor con TODAS
 * las líneas (`/api/admin/forestal/loth/estado-arboles`).
 *
 * Se pide cuando el mapa terminó de cargar y cada vez que recarga (`recarga`
 * cambia; 0 = todavía no terminó) o que el libro escribió algo (`escrituras`:
 * la señal del libro tras cada tala, trozado o anulación — la tala en tanda
 * se guarda con el mapa abierto y la etiqueta tiene que pasar a «Talado» sin
 * recargar la página, ni volver a encuadrar el mapa). Si
 * falla, el mapa sigue con lo que dice el censo y la barra ofrece reintentar:
 * nunca se queda sin árboles por esto.
 */

import { useCallback, useEffect, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import type { EstadoArbol, EstadoDeArbolesPlan } from "@/lib/forestal/loth-etapa-arbol";

export interface EtapasDelMapa {
  /** Por id del árbol del censo. null = todavía no se leyó (o falló). */
  porId: ReadonlyMap<string, EstadoArbol> | null;
  sinCenso: string[];
  cargando: boolean;
  error: string | null;
  reintentar: () => void;
}

export function useLothMapaEtapas(planId: string | null, recarga: number, escrituras = 0): EtapasDelMapa {
  const [porId, setPorId] = useState<ReadonlyMap<string, EstadoArbol> | null>(null);
  const [sinCenso, setSinCenso] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    // `recarga` 0 = el mapa todavía no terminó su primera carga: el plan llega
    // ANTES que el encuadre, y pedir con los dos pedía las etapas dos veces.
    if (!planId || recarga === 0) return;
    const ac = new AbortController();
    setCargando(true);
    setError(null);
    fetch(`/api/admin/forestal/loth/estado-arboles?planId=${encodeURIComponent(planId)}`, { credentials: "include", signal: ac.signal })
      .then(async (r) => {
        const cuerpo = await leerJson<Partial<EstadoDeArbolesPlan> & { message?: string }>(r);
        if (!r.ok || !cuerpo || !Array.isArray(cuerpo.arboles)) {
          throw new Error(r.status === 429 ? "Demasiadas lecturas seguidas: espera un minuto." : (cuerpo?.message ?? `HTTP ${r.status}`));
        }
        setPorId(new Map(cuerpo.arboles.map((a) => [a.treeId, a])));
        setSinCenso(Array.isArray(cuerpo.sinCenso) ? cuerpo.sinCenso : []);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!ac.signal.aborted) setCargando(false);
      });
    return () => ac.abort();
  }, [planId, recarga, intento, escrituras]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { porId, sinCenso, cargando, error, reintentar };
}
