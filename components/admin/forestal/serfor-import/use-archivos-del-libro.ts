"use client";

/**
 * Los archivos que el operador fue soltando en «Importar el libro».
 *
 * Antes era UN archivo por sección: quien tenía la rolliza de dos permisos en
 * dos Excel tenía que importar uno, cerrar, abrir y repetir — y no había dónde
 * decir de qué permiso era cada uno (Brandon 19-10, ADR-503). Ahora cada caja
 * junta los archivos que quiera, y cada archivo lleva su propio permiso.
 *
 * En el modo «Un solo archivo» cada hoja del Excel es una entrada más (todas
 * con el mismo `archivoId`) y el permiso es uno solo para todo el libro.
 *
 * Sólo estado y lectura: el envío vive en `use-enviar-libro.ts`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import {
  TITULO_FORMATO,
  columnasFaltantes,
  detectarColumnas,
  parsearFilas,
  type FilaParseada,
  type FormatoCtp,
} from "@/lib/forestal/ctp-formatos-serfor";
import { leerArchivoSerfor } from "@/lib/forestal/ctp-serfor-archivo";
import { ordenarSecciones, type SeccionDelLibro } from "@/lib/forestal/ctp-serfor-secuencia";
import { llevaPermiso } from "@/lib/forestal/ctp-import-entre-archivos";

export type ModoDelLibro = "libro" | "secciones";

export interface ArchivoCargado {
  /** Único por entrada (archivo + hoja). */
  id: string;
  /** El archivo de donde salió: en el modo libro, todas sus hojas comparten este id. */
  archivoId: string;
  /** El nombre del archivo, tal como lo subió. */
  nombre: string;
  /** La hoja, sólo cuando un mismo archivo trajo dos hojas de la misma sección. */
  hoja: string | null;
  formato: FormatoCtp;
  seccion: SeccionDelLibro;
  /** Las columnas obligatorias que no encontró. */
  faltantes: string[];
  /** El permiso elegido para ESTE archivo (modo secciones). */
  contratoId: string | null;
}

/** «archivo.xlsx» o «archivo.xlsx › Hoja2»: así se nombra en avisos y reporte. */
export const etiquetaDe = (a: Pick<ArchivoCargado, "nombre" | "hoja">): string =>
  a.hoja ? `${a.nombre} › ${a.hoja}` : a.nombre;

/* El mismo archivo dos veces duplicaría los avisos y la mitad entraría como
   «ya estaba»: se reconoce por nombre, tamaño y fecha. */
const firmaDe = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

async function leerHojas(file: File) {
  const hojas = await leerArchivoSerfor(file);
  const leidas: { seccion: SeccionDelLibro; faltantes: string[] }[] = [];
  const noReconocidas: string[] = [];
  for (const h of hojas) {
    if (!h.formato) {
      if (h.filas.length > 0) noReconocidas.push(h.nombre);
      continue;
    }
    const mapeo = detectarColumnas(h.formato, h.cabeceras);
    leidas.push({
      seccion: {
        formato: h.formato,
        nombreHoja: h.nombre,
        filaCabecera: h.filaCabecera,
        parseadas: parsearFilas(h.formato, mapeo, h.filas, h.filaCabecera + 1),
      },
      faltantes: columnasFaltantes(h.formato, mapeo).map((c) => c.label),
    });
  }
  return { leidas, noReconocidas };
}

let secuencia = 0;
const nuevoId = () => `a${++secuencia}`;

export function useArchivosDelLibro({ alCambiar }: { alCambiar?: () => void } = {}) {
  const [modo, setModo] = useState<ModoDelLibro>("libro");
  const [archivos, setArchivos] = useState<ArchivoCargado[]>([]);
  const [ignoradas, setIgnoradas] = useState<string[]>([]);
  /** Modo libro: un solo permiso para todas las hojas que lo llevan. */
  const [permisoLibro, setPermisoLibro] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const firmas = useRef(new Map<string, string>());
  const avisar = useRef(alCambiar);
  useEffect(() => {
    avisar.current = alCambiar;
  });
  /** Todo cambio de lo cargado invalida el reporte anterior. */
  const tocar = useCallback(() => avisar.current?.(), []);

  const cambiarModo = useCallback((m: ModoDelLibro) => {
    /* Cambiar de modo limpia lo cargado: mezclar un libro completo con archivos
       sueltos deja al operador sin saber qué se va a escribir. */
    setModo(m);
    setArchivos([]);
    setIgnoradas([]);
    setPermisoLibro(null);
    firmas.current.clear();
    tocar();
  }, [tocar]);

  /** Modo libro: el Excel entero reemplaza lo que hubiera. */
  const tomarLibro = useCallback(async (file: File): Promise<string | null> => {
    setLeyendo(true);
    tocar();
    try {
      /* TODAS las hojas reconocibles, no la primera: el libro del SNIFFS trae
         una sección por hoja y quedarse con una perdía las otras cuatro. */
      const { leidas, noReconocidas } = await leerHojas(file);
      if (leidas.length === 0) {
        setArchivos([]);
        return "No reconozco ninguna sección del libro en este archivo. ¿Es el Excel que baja del SNIFFS?";
      }
      const archivoId = nuevoId();
      setArchivos(
        leidas.map(({ seccion, faltantes }) => ({
          id: nuevoId(), archivoId, nombre: file.name, hoja: null, formato: seccion.formato, seccion, faltantes, contratoId: null,
        })),
      );
      setIgnoradas(noReconocidas);
      return null;
    } catch (e) {
      logger.error("[ctp-serfor-import] no se pudo leer el archivo", { error: String(e) });
      return "No se pudo leer el archivo. ¿Está corrupto o protegido?";
    } finally {
      setLeyendo(false);
    }
  }, [tocar]);

  /**
   * Una caja recibió uno o varios archivos. Cada uno tiene que SER de esa
   * sección: aceptarlo «porque se reconoce solo» dejaría al operador creyendo
   * que cargó Consumos cuando en realidad cargó Ingresos.
   */
  const agregarASeccion = useCallback(async (formato: FormatoCtp, files: readonly File[]): Promise<string | null> => {
    tocar();
    const errores: string[] = [];
    const nuevos: ArchivoCargado[] = [];
    for (const file of files) {
      const firma = firmaDe(file);
      if ([...firmas.current.values()].includes(firma)) {
        errores.push(`«${file.name}» ya está cargado.`);
        continue;
      }
      try {
        const { leidas } = await leerHojas(file);
        const propias = leidas.filter((x) => x.seccion.formato === formato);
        if (propias.length === 0) {
          const otras = [...new Set(leidas.map((x) => TITULO_FORMATO[x.seccion.formato]))].join(", ");
          errores.push(
            otras
              ? `«${file.name}» es de ${otras}, no de acá. Suéltalo en su caja.`
              : `«${file.name}»: no reconozco ninguna sección del libro.`,
          );
          continue;
        }
        const archivoId = nuevoId();
        firmas.current.set(archivoId, firma);
        for (const { seccion, faltantes } of propias) {
          nuevos.push({
            id: nuevoId(), archivoId, nombre: file.name, hoja: propias.length > 1 ? seccion.nombreHoja : null,
            formato, seccion, faltantes, contratoId: null,
          });
        }
      } catch (e) {
        logger.error("[ctp-serfor-import] no se pudo leer la sección", { formato, error: String(e) });
        errores.push(`«${file.name}»: no se pudo leer. ¿Está corrupto o protegido?`);
      }
    }
    if (nuevos.length > 0) setArchivos((prev) => [...prev, ...nuevos]);
    return errores.length > 0 ? errores.join(" ") : null;
  }, [tocar]);

  const quitar = useCallback((id: string) => {
    tocar();
    setArchivos((prev) => {
      const sale = prev.find((a) => a.id === id);
      const quedan = prev.filter((a) => a.id !== id);
      /* La firma se libera cuando ya no queda ninguna hoja de ese archivo: así
         se puede volver a subir corregido. */
      if (sale && !quedan.some((a) => a.archivoId === sale.archivoId)) firmas.current.delete(sale.archivoId);
      return quedan;
    });
  }, [tocar]);

  const asignar = useCallback((id: string, contratoId: string | null) => {
    tocar();
    setArchivos((prev) => prev.map((a) => (a.id === id ? { ...a, contratoId } : a)));
  }, [tocar]);

  /** «Usar este permiso en todos los archivos de esta sección». */
  const asignarASeccion = useCallback((formato: FormatoCtp, contratoId: string | null) => {
    tocar();
    setArchivos((prev) => prev.map((a) => (a.formato === formato ? { ...a, contratoId } : a)));
  }, [tocar]);

  const elegirPermisoLibro = useCallback((contratoId: string | null) => {
    tocar();
    setPermisoLibro(contratoId);
  }, [tocar]);

  /** El permiso que viaja con cada archivo, según el modo. */
  const permisoDe = useCallback(
    (a: ArchivoCargado): string | null =>
      !llevaPermiso(a.formato) ? null : modo === "libro" ? permisoLibro : a.contratoId,
    [modo, permisoLibro],
  );

  /** En el orden de la cadena de custodia; dentro de una sección, en el orden en que se subieron. */
  const ordenados = useMemo(() => {
    const porSeccion = new Map(archivos.map((a) => [a.seccion, a]));
    return ordenarSecciones(archivos.map((a) => a.seccion)).flatMap((s) => porSeccion.get(s) ?? []);
  }, [archivos]);

  /** Las filas de una sección, juntando todos sus archivos. */
  const filasDe = useCallback(
    (f: FormatoCtp): FilaParseada[] | undefined => {
      const de = ordenados.filter((a) => a.formato === f);
      return de.length > 0 ? de.flatMap((a) => a.seccion.parseadas) : undefined;
    },
    [ordenados],
  );

  return {
    modo, cambiarModo, archivos, ordenados, ignoradas, leyendo,
    tomarLibro, agregarASeccion, quitar, asignar, asignarASeccion,
    permisoLibro, elegirPermisoLibro, permisoDe, filasDe,
  };
}

/** Lo que devuelve el hook, para quien lo recibe por prop. */
export type ArchivosDelLibro = ReturnType<typeof useArchivosDelLibro>;
