"use client";

/**
 * useLothSeccionTabla — lo que ve la tabla de una sección del Libro TH: el
 * autofiltro de cada columna, el orden por cabecera y la página.
 *
 * Filtrar en el cliente es honesto porque recibe la sección ENTERA (el libro se
 * lee completo para los indicadores): orden, filtro y página se aplican sobre
 * todas sus líneas, no sobre los 50 renglones que trajo una página del servidor.
 *
 *   lineas ──autofiltro──▶ filtradas ──orden──▶ ordenadas ──página──▶ enPagina
 */

import { useEffect, useMemo, useState } from "react";
import type { LothEntryDTO, LothSection } from "@/lib/forestal/loth-constants";
import { ordenarLineas, type OrdenCampo, type OrdenDir } from "@/lib/forestal/loth-seccion";
import { useFiltrosTabla } from "../filtros-tabla-forestal";
import { filtrosDeSeccion, type PermisoDeLinea } from "../loth-seccion-filtros";

export const LINEAS_POR_PAGINA = 50;

export function useLothSeccionTabla({
  section,
  cols,
  lineas,
  corregidaPor,
  orden,
  dir,
  planes,
}: {
  section: LothSection;
  /** Las columnas de la sección (constante de módulo: estable entre renders). */
  cols: readonly { key: string }[];
  lineas: readonly LothEntryDTO[];
  corregidaPor: ReadonlyMap<number, number>;
  orden: OrdenCampo;
  dir: OrdenDir;
  /** El permiso y titular de cada plan (estable): los filtros de la columna «permiso». */
  planes?: ReadonlyMap<string, PermisoDeLinea>;
}) {
  const columnas = useMemo(
    () => filtrosDeSeccion(cols, corregidaPor, planes),
    [cols, corregidaPor, planes],
  );
  const f = useFiltrosTabla(lineas, columnas);
  const [pagina, setPagina] = useState(0);

  /* Otra sección arranca sin filtros y en su primera página: la especie o el
     rango de la anterior dejarían la nueva vacía sin razón aparente. */
  const { limpiar } = f;
  useEffect(() => {
    limpiar();
    setPagina(0);
  }, [section, limpiar]);
  // Cambiar un filtro vuelve a la primera página: quedarse en la 4 de una lista de 3 muestra el vacío.
  useEffect(() => setPagina(0), [f.facetas, f.textos]);

  const ordenadas = useMemo(() => ordenarLineas([...f.filtradas], orden, dir), [f.filtradas, orden, dir]);
  const paginas = Math.max(1, Math.ceil(ordenadas.length / LINEAS_POR_PAGINA));
  const pagActual = Math.min(pagina, paginas - 1);
  const enPagina = useMemo(
    () => ordenadas.slice(pagActual * LINEAS_POR_PAGINA, (pagActual + 1) * LINEAS_POR_PAGINA),
    [ordenadas, pagActual],
  );

  return { f, ordenadas, enPagina, pagina: pagActual, paginas, setPagina };
}
