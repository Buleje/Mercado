"use client";

/** Las vistas guardadas de «Mis clientes» (M07): qué se guarda y cómo se pone. */

import { useCallback, useMemo } from "react";
import { useVistasGuardadas, type VistasGuardadas } from "@/hooks/use-vistas-guardadas";
import type { Crm } from "./use-crm";
import { VISTAS_DEL_SISTEMA_CRM, esEstadoCrm, firmaCrm, type EstadoCrm } from "./vistas-crm";

export function useVistasCrm(crm: Crm): VistasGuardadas<EstadoCrm> {
  const {
    search, frecuencia, creditoRango, filterSegment, filterTags, orden,
    setSearch, setFrecuencia, setCreditoRango, setFilterSegment, setFilterTags, setPage,
  } = crm;
  const { poner, cambiado, orden: columnas } = orden;

  const estado = useMemo<EstadoCrm>(
    () => ({
      busqueda: search,
      frecuencia,
      credito: creditoRango,
      segmentos: filterSegment,
      etiquetas: filterTags,
      columnas: cambiado ? columnas : null,
    }),
    [search, frecuencia, creditoRango, filterSegment, filterTags, cambiado, columnas],
  );

  const aplicar = useCallback(
    (e: EstadoCrm) => {
      setSearch(e.busqueda);
      setFrecuencia(e.frecuencia);
      setCreditoRango(e.credito);
      setFilterSegment(e.segmentos);
      setFilterTags(e.etiquetas);
      setPage(1);
      poner(e.columnas);
    },
    [setSearch, setFrecuencia, setCreditoRango, setFilterSegment, setFilterTags, setPage, poner],
  );

  return useVistasGuardadas({
    modulo: "crm-clientes",
    estado,
    aplicar,
    sistema: VISTAS_DEL_SISTEMA_CRM,
    valida: esEstadoCrm,
    firma: firmaCrm,
  });
}
