"use client";

/**
 * Los planes de manejo y permisos de un titular del Directorio (ADR-518), para
 * la lista de SÓLO LECTURA de su ficha.
 *
 * Junta las dos fuentes: los permisos (`usePermisosForestal`, el lado que sabe
 * de qué ficha es cada papel) y los planes del Libro TH (`leerPlanesDelLibro`,
 * compartida con el chip del libro: una sola consulta en vuelo). La cuenta de
 * qué fila es de quién vive en `lib/forestal/directorio-planes`.
 *
 * Sin la spec del Libro TH (403) la lista sigue con los permisos: el que no ve
 * el libro igual sabe qué papeles tiene su proveedor.
 */

import { useEffect, useMemo, useState } from "react";
import { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import { logger } from "@/lib/logger";
import {
  anotadoEnLaFicha,
  planesDelTitular,
  type DatosViejosDeLaFicha,
  type PlanParaDirectorio,
  type TitularParaPlanes,
} from "@/lib/forestal/directorio-planes";
import { PlanesHttpError, leerPlanesDelLibro } from "./planes-del-libro";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Una fila del GET del libro, en lo que la lista mira. Basura → `null`. */
function planDelLibro(raw: unknown): PlanParaDirectorio | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = texto(r.id);
  if (!id) return null;
  return {
    id,
    planType: texto(r.planType) ?? "",
    planNumber: texto(r.planNumber),
    tituloHabilitante: texto(r.tituloHabilitante),
    titularName: texto(r.titularName) ?? "",
    // Decimal de Prisma: llega como texto («4.5»); un número también vale.
    areaHa: typeof r.areaHa === "number" ? String(r.areaHa) : texto(r.areaHa),
    vigenciaHasta: texto(r.vigenciaHasta),
    estado: texto(r.estado) ?? "",
    contratoId: texto(r.contratoId),
  };
}

export function usePlanesDelTitular(titular: TitularParaPlanes, ficha: DatosViejosDeLaFicha) {
  const permisos = usePermisosForestal();
  const [planes, setPlanes] = useState<PlanParaDirectorio[] | null>(null);
  /** `false` = sin la spec del Libro TH: no hay planes que listar ni libro al que ir. */
  const [libroDisponible, setLibroDisponible] = useState(true);
  const [errorPlanes, setErrorPlanes] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    leerPlanesDelLibro()
      .then((j) => {
        if (!vivo) return;
        const lista = ((j as { plans?: unknown[] } | null)?.plans ?? [])
          .map(planDelLibro)
          .filter((p): p is PlanParaDirectorio => p != null);
        setPlanes(lista);
        setErrorPlanes(false);
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        if (err instanceof PlanesHttpError && err.status === 403) {
          setLibroDisponible(false);
          setPlanes([]);
          return;
        }
        logger.warn("[directorio] no se pudo leer los planes del libro", { error: String(err) });
        setErrorPlanes(true);
      });
    return () => {
      vivo = false;
    };
  }, [intento]);

  const { contratos, cargando: cargandoPermisos, error: errorPermisos, disponible: permisosDisponibles } = permisos;
  const { id, nombre } = titular;
  const filas = useMemo(
    () => planesDelTitular({ id, nombre }, contratos, planes ?? []),
    [id, nombre, contratos, planes],
  );
  const { tituloHabilitante, resolucion, planManejo, arffs, tituloVigenciaHasta } = ficha;
  const anotado = useMemo(
    () => anotadoEnLaFicha({ tituloHabilitante, resolucion, planManejo, arffs, tituloVigenciaHasta }, filas),
    [tituloHabilitante, resolucion, planManejo, arffs, tituloVigenciaHasta, filas],
  );

  return {
    filas,
    anotado,
    contratos,
    /** Todavía no se sabe qué tiene: no decir «no tiene planes». */
    cargando: cargandoPermisos || (planes == null && !errorPlanes),
    error: errorPlanes || Boolean(errorPermisos),
    libroDisponible,
    permisosDisponibles,
    reintentar: () => {
      setErrorPlanes(false);
      setIntento((n) => n + 1);
      void permisos.recargar();
    },
  };
}
