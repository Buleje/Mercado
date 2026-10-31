"use client";

import { useMemo, useState } from "react";
import type { EstadoInspeccion } from "@/lib/superadmin/plantas-forestales/tipos";
import { useCargaSuperadmin } from "../use-carga";
import type { FilaDeInspeccion } from "./TablaInspecciones";

/** Lo que devuelve GET /api/superadmin/plantas/inspecciones. */
export interface InspeccionesResponse {
  inspecciones: FilaDeInspeccion[];
}

export interface FiltrosInspecciones {
  estado: EstadoInspeccion | "";
  tenantId: string;
  /** Las plantas de prueba quedan fuera salvo que se pidan (como en la lista de plantas). */
  incluirPrueba: boolean;
}

const INICIAL: FiltrosInspecciones = { estado: "", tenantId: "", incluirPrueba: false };

/** La más nueva primero; el mismo día, la abierta antes (es la que se sigue). */
const PESO: Record<EstadoInspeccion, number> = { abierta: 0, cerrada: 1, anulada: 2 };
export function ordenarInspecciones(filas: FilaDeInspeccion[]): FilaDeInspeccion[] {
  return [...filas].sort((a, b) => b.fecha.localeCompare(a.fecha) || PESO[a.estado] - PESO[b.estado]);
}

/**
 * Todas las inspecciones de todas las plantas. Son pocas (una por visita): se
 * piden enteras y se filtran acá, así cambiar de filtro no vuelve al servidor
 * (sólo «incluir plantas de prueba», que el servidor deja fuera por defecto).
 */
export function useInspecciones() {
  const [filtros, setFiltros] = useState<FiltrosInspecciones>(INICIAL);
  const carga = useCargaSuperadmin<InspeccionesResponse>(
    `/api/superadmin/plantas/inspecciones${filtros.incluirPrueba ? "?incluirPrueba=1" : ""}`,
  );

  // El servidor ya trae el nombre de cada planta (`plantaNombre`).
  const todas = useMemo(() => ordenarInspecciones(carga.data?.inspecciones ?? []), [carga.data]);

  // Sólo las plantas que tienen alguna inspección: elegir otra daría la lista vacía.
  const plantas = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of todas) if (!m.has(f.tenantId)) m.set(f.tenantId, f.plantaNombre ?? "Planta sin nombre");
    return [...m].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [todas]);

  const filas = useMemo(
    () => todas.filter((f) => (!filtros.estado || f.estado === filtros.estado) && (!filtros.tenantId || f.tenantId === filtros.tenantId)),
    [todas, filtros],
  );

  const abiertas = todas.filter((f) => f.estado === "abierta").length;
  const cambiar = (parcial: Partial<FiltrosInspecciones>) => setFiltros((f) => ({ ...f, ...parcial }));
  const limpiar = () => setFiltros((f) => ({ ...INICIAL, incluirPrueba: f.incluirPrueba }));
  const hayFiltros = Boolean(filtros.estado || filtros.tenantId);

  return { ...carga, filas, total: todas.length, abiertas, plantas, filtros, cambiar, limpiar, hayFiltros };
}
