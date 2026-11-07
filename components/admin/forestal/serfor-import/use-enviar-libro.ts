"use client";

/**
 * Manda el libro al servidor: sección por sección, y dentro de cada sección
 * archivo por archivo, cada uno con SU permiso (Brandon 19-10, ADR-503).
 *
 * SECUENCIAL y en orden de dependencia: la producción se atribuye contra los
 * ingresos, así que tienen que estar escritos antes. En paralelo la corrida no
 * encontraría su origen y entraría sin consumos.
 *
 * Si un archivo falla, los demás de LA MISMA sección siguen (no dependen entre
 * sí) y el que falló queda marcado. Las secciones siguientes, en cambio, no se
 * mandan: dependen de la que falló y sólo sumarían errores en cascada. Lo que
 * ya entró, queda.
 */

import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { TITULO_FORMATO, type FilaParseada, type FormatoCtp } from "@/lib/forestal/ctp-formatos-serfor";
import {
  CAMPO_BODY,
  ENDPOINT_DE,
  aCuerpoDelLibro,
  normalizarRespuesta,
  type RespuestaImport,
} from "@/lib/forestal/ctp-serfor-a-libro";
import { normalizarLote, origenesDelDespacho, seResuelveAlImportar } from "@/lib/forestal/ctp-cadena-import";
import type { ResultadoDeSeccion } from "@/lib/forestal/ctp-reporte-import";
import { etiquetaDe, type ArchivoCargado } from "./use-archivos-del-libro";

/** El resultado de cada archivo, con su id para marcarlo en su caja. */
export type ResultadoDeArchivo = ResultadoDeSeccion & { id: string };

type CorridasPorLote = Map<string, { id: string; cantidad: number }[]>;

const VACIA: RespuestaImport = { resumen: { creados: 0, porCrear: 0, existen: 0, errores: 0 }, filas: [] };

/**
 * Baja de «error» a «pendiente» lo que el propio libro va a resolver.
 * Sólo aplica al preview: en el commit un error es un error.
 */
function reetiquetar(r: RespuestaImport, mapa: Map<string, string>): RespuestaImport {
  const filas = r.filas.map((f) =>
    f.accion === "error" && seResuelveAlImportar(f.mensaje, f.codigo, mapa)
      ? { ...f, accion: "crear", mensaje: "Se resuelve al importar: el ingreso viene en este mismo libro" }
      : f,
  );
  return {
    ...r,
    filas,
    resumen: {
      ...r.resumen,
      porCrear: filas.filter((f) => f.accion === "crear").length,
      errores: filas.filter((f) => f.accion === "error").length,
    },
  };
}

/**
 * Le pega a cada salida los orígenes de las corridas de su mismo lote. En
 * preview el mapa está vacío y el despacho va sin atribuir, que es lo correcto:
 * todavía no existe ninguna corrida a la cual atribuirlo.
 */
function atribuirSiEsSalida(
  formato: FormatoCtp,
  cuerpo: Record<string, unknown>[],
  parseadas: readonly FilaParseada[],
  corridasPorLote: CorridasPorLote,
): Record<string, unknown>[] {
  if (formato !== "salidas" || corridasPorLote.size === 0) return cuerpo;
  const loteDeFila = new Map(parseadas.map((f) => [f.fila, normalizarLote(f.datos.lote)]));
  return cuerpo.map((fila) => {
    const lote = loteDeFila.get(Number(fila.row));
    const corridas = lote ? corridasPorLote.get(lote) : undefined;
    if (!corridas?.length) return fila;
    return { ...fila, origenes: origenesDelDespacho(Number(fila.quantity) || 0, corridas) };
  });
}

/** Lo que el modal le pasa al enviar: qué archivos, con qué permiso y las filas juntas por sección. */
export interface ContextoDelEnvio {
  /** En orden de la cadena (`useArchivosDelLibro().ordenados`). */
  archivos: readonly ArchivoCargado[];
  /** El permiso que viaja con cada archivo (o `null`). */
  permisoDe: (a: ArchivoCargado) => string | null;
  /** Las filas de una sección juntando todos sus archivos. */
  filasDe: (f: FormatoCtp) => FilaParseada[] | undefined;
  /** Código de troza → GTF del ingreso que viene en el mismo libro (preview). */
  mapaIngresos: Map<string, string>;
  /**
   * «¿Estas trozas ya están en el patio?» marcada: viaja sólo a los ingresos.
   * `fecha` null = la de cada guía en el archivo. Ausente = entran sin recibir.
   */
  recepcion?: { fecha: string | null } | null;
}

export function useEnviarLibro({
  onImportado,
  alTerminar,
}: {
  onImportado?: () => void;
  /** Al terminar un envío, con todos sus resultados (el modal decide si se cierra y qué avisa). */
  alTerminar?: (mode: "preview" | "commit", resultados: ResultadoDeArchivo[]) => void;
} = {}) {
  const [cargando, setCargando] = useState(false);
  const [modoEnvio, setModoEnvio] = useState<"preview" | "commit" | null>(null);
  const [paso, setPaso] = useState<string | null>(null);
  /** Filas del archivo en curso: con uno solo, «1 de 1» no dice nada. */
  const [pasoFilas, setPasoFilas] = useState<number | null>(null);
  const [avance, setAvance] = useState<{ hechas: number; total: number } | null>(null);
  const [resultados, setResultados] = useState<ResultadoDeArchivo[] | null>(null);
  /** De qué envío son los resultados: una revisión no «entró». */
  const [modoResultados, setModoResultados] = useState<"preview" | "commit" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** Segundos del envío en curso: cuando el % no se mueve, es lo único que dice «sigue». */
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    if (!cargando) {
      setSegundos(0);
      return;
    }
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [cargando]);

  const limpiar = useCallback(() => {
    setResultados(null);
    setErr(null);
  }, []);

  const enviar = useCallback(
    async (mode: "preview" | "commit", ctx: ContextoDelEnvio) => {
      const { archivos, permisoDe, filasDe, mapaIngresos, recepcion } = ctx;
      if (archivos.length === 0) return;
      setCargando(true);
      setModoEnvio(mode);
      setErr(null);
      const acumulado: ResultadoDeArchivo[] = [];
      /* Las corridas que este import va creando, por lote: permiten atribuir
         cada despacho a la producción que lo respalda (I3/I5). Salidas corre
         última justamente para tenerlas. */
      const corridasPorLote: CorridasPorLote = new Map();
      const vecinas = { ingresos: filasDe("ingresos"), consumos: filasDe("consumos") };
      try {
        for (const [i, a] of archivos.entries()) {
          /* La sección anterior tuvo un archivo caído: lo que sigue depende de ella. */
          const anterior = archivos[i - 1];
          if (anterior && anterior.formato !== a.formato && acumulado.some((r) => r.error && r.formato === anterior.formato)) {
            setErr(
              `${TITULO_FORMATO[anterior.formato]} tuvo un archivo que falló: no mandé las secciones que siguen porque dependen de esa. Lo que ya entró, quedó.`,
            );
            break;
          }
          const nombre = etiquetaDe(a);
          setPaso(archivos.length > 1 ? `${TITULO_FORMATO[a.formato]} · ${nombre}` : TITULO_FORMATO[a.formato]);
          setPasoFilas(a.seccion.parseadas.length);
          setAvance({ hechas: i, total: archivos.length });
          const destino = ENDPOINT_DE[a.formato];
          const contratoId = permisoDe(a);
          const base = { id: a.id, formato: a.formato, archivo: nombre };
          try {
            const res = await fetch(destino.url, {
              method: "POST",
              headers: csrfHeaders({ "Content-Type": "application/json" }),
              credentials: "include",
              body: JSON.stringify({
                mode,
                registro: destino.registro,
                fileName: a.nombre,
                origen: "libro-oficial",
                ...(contratoId ? { asignacion: { contratoId } } : {}),
                ...(recepcion && destino.registro === "ingresos" ? { recepcion } : {}),
                [CAMPO_BODY[a.formato]]: atribuirSiEsSalida(
                  a.formato,
                  aCuerpoDelLibro(a.formato, a.seccion.parseadas, vecinas),
                  a.seccion.parseadas,
                  corridasPorLote,
                ),
              }),
            });
            const j = await leerJson<Record<string, unknown> & { detalle?: unknown; error?: string; message?: string }>(res);
            if (!res.ok || !j) {
              acumulado.push({ ...base, respuesta: VACIA, error: j?.message ?? j?.error ?? `No se pudo procesar (HTTP ${res.status})` });
              continue;
            }
            /* Al crear producción, el server devuelve el id de cada corrida: se
               indexa por el lote de su fila para que las Salidas lo encuentren. */
            if (a.formato === "produccion" && mode === "commit") {
              const loteDeFila = new Map(a.seccion.parseadas.map((f) => [f.fila, normalizarLote(f.datos.lote)]));
              for (const d of (Array.isArray(j.detalle) ? j.detalle : []) as { row?: number; id?: string; cantidad?: number }[]) {
                const lote = d.row != null ? loteDeFila.get(d.row) : "";
                if (!lote || !d.id || !d.cantidad) continue;
                corridasPorLote.set(lote, [...(corridasPorLote.get(lote) ?? []), { id: d.id, cantidad: d.cantidad }]);
              }
            }
            const r = normalizarRespuesta(j);
            acumulado.push({
              ...base,
              respuesta: mode === "preview" ? reetiquetar(r, mapaIngresos) : r,
              permiso: r.permiso ?? null,
            });
          } catch (e) {
            logger.error("[ctp-serfor-import] falló el envío de un archivo", { formato: a.formato, error: String(e) });
            acumulado.push({ ...base, respuesta: VACIA, error: "No se pudo enviar. Revisa la conexión." });
          }
        }
        setResultados(acumulado);
        setModoResultados(mode);
        if (mode === "commit" && acumulado.some((r) => !r.error)) onImportado?.();
        alTerminar?.(mode, acumulado);
      } finally {
        setCargando(false);
        setPaso(null);
        setPasoFilas(null);
        setModoEnvio(null);
        setAvance(null);
      }
    },
    [onImportado, alTerminar],
  );

  /** Cómo le fue a un archivo en el último envío: ✓ sólo si se importó de verdad. */
  const estadoDe = useCallback(
    (id: string): "ok" | "error" | null => {
      const r = resultados?.find((x) => x.id === id);
      if (!r) return null;
      if (r.error) return "error";
      if (modoResultados !== "commit") return null;
      /* Nada entró y algo quedó afuera: un ✓ ahí se leía como «listo» (QA 19-10). */
      const { creados, errores } = r.respuesta.resumen;
      return creados === 0 && errores > 0 ? "error" : "ok";
    },
    [resultados, modoResultados],
  );

  return { enviar, cargando, modoEnvio, paso, pasoFilas, avance, segundos, resultados, modoResultados, estadoDe, err, setErr, limpiar };
}
