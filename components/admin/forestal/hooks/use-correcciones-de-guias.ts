"use client";

/**
 * useCorreccionesDeGuias — el estado de «Pedir corrección» (ADR-512) de TODAS
 * las guías de una lista, en UNA llamada (`GET RUTA_SOLICITUDES_PANEL?entityType=`).
 * La fila pregunta por su id con `de(id)`; tras mandar un pedido, `agregar`
 * lo pone en el mapa sin volver a pedir la lista.
 *
 * Tolerante: si la ruta todavía no existe (404) o falla, el mapa queda vacío y
 * la lista sigue igual — el chip es un extra, no la vista.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import {
  RUTA_SOLICITUDES_PANEL,
  type EntityTypeCorreccion,
  type ListarDelNegocioRespuesta,
  type SolicitudCorreccionDTO,
} from "@/lib/soporte/correccion-guia";

export interface CorreccionesDeGuias {
  /** La solicitud más reciente de esa guía (null = nunca se pidió). */
  de: (entityId: string) => SolicitudCorreccionDTO | null;
  cargando: boolean;
  agregar: (s: SolicitudCorreccionDTO) => void;
  recargar: () => void;
}

/** La más reciente por guía (sólo puede haber una abierta: si la hay, es ésa). */
export function masRecientePorGuia(lista: readonly SolicitudCorreccionDTO[]): Map<string, SolicitudCorreccionDTO> {
  const m = new Map<string, SolicitudCorreccionDTO>();
  for (const s of lista) {
    const ya = m.get(s.entityId);
    if (!ya || s.createdAt > ya.createdAt) m.set(s.entityId, s);
  }
  return m;
}

export function useCorreccionesDeGuias(entityType: EntityTypeCorreccion, activo = true): CorreccionesDeGuias {
  const [lista, setLista] = useState<SolicitudCorreccionDTO[]>([]);
  const [cargando, setCargando] = useState(false);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!activo) return;
    const ctl = new AbortController();
    setCargando(true);
    const q = new URLSearchParams({ entityType, limite: "200" });
    fetch(`${RUTA_SOLICITUDES_PANEL}?${q}`, { credentials: "include", signal: ctl.signal })
      .then(async (r) => {
        if (!r.ok) return [];
        const j = await leerJson<ListarDelNegocioRespuesta | SolicitudCorreccionDTO[]>(r);
        return Array.isArray(j) ? j : Array.isArray(j?.solicitudes) ? j.solicitudes : [];
      })
      .then((s) => {
        if (!ctl.signal.aborted) setLista(s);
      })
      .catch((err) => {
        if (!ctl.signal.aborted) console.warn("[correcciones-guias] no se pudo leer el estado", err);
      })
      .finally(() => {
        if (!ctl.signal.aborted) setCargando(false);
      });
    return () => ctl.abort();
  }, [entityType, activo, vuelta]);

  const mapa = useMemo(() => masRecientePorGuia(lista), [lista]);
  const de = useCallback((id: string) => mapa.get(id) ?? null, [mapa]);
  const agregar = useCallback((s: SolicitudCorreccionDTO) => setLista((l) => [s, ...l.filter((x) => x.id !== s.id)]), []);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  return useMemo(() => ({ de, cargando, agregar, recargar }), [de, cargando, agregar, recargar]);
}
