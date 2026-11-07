"use client";

/**
 * useLothTraceVista — el estado y las cuentas de la vista «Por árbol».
 *
 * Todo sale de UNA lista de filas (`construirFilasTrace`) y se recorta con el
 * autofiltro de cada columna (`loth-trace-filtros`, Brandon 07-10), en tres
 * pasos, cada uno con su lector:
 *
 *   filas ──Especie + Última───────────────▶ porFacetas  → el avance y «Qué falta hacer»
 *         ──+ las demás columnas + paso────▶ candidatas → las cuentas del estado
 *         ──+ Estado (Observaciones)───────▶ visibles   → los grupos y el CSV
 *
 * Los visibles se parten en grupos (`loth-trace-grupos`): en movimiento y
 * terminados se paginan juntos, en ese orden; los en pie no se paginan, se
 * resumen por especie en un bloque plegado.
 *
 * El estado NO recorta el embudo (ADR-400: los indicadores describen lo
 * registrado; el desglose por estado es otra pregunta), y la cuenta de cada
 * estado se hace sin aplicarse a sí mismo — si no, «Con alertas» mostraría
 * siempre el total de la lista que ya filtró.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { aplicarFacetas } from "@/lib/admin/filtros-columna";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { buildTraceOperations } from "@/lib/forestal/loth-trace";
import { construirFichasArbol, type ArbolCensoInput } from "@/lib/forestal/loth-arbol";
import { construirFilasTrace, filasToCsv, resumirFilas, type TraceFila } from "@/lib/forestal/loth-trace-tabla";
import { agruparPorEtapa, enPiePorEspecie, esCensado, pasaPaso, pendientesDe, RANGO_GRUPO, grupoDe, trozasQueSalieron, type PasoAvance } from "@/lib/forestal/loth-trace-grupos";
import { guardarUmbrales, leerUmbrales, UMBRALES_DEFAULT, type UmbralesMerma } from "@/lib/forestal/loth-trace-umbrales";
import {
  claveDeFila,
  filaMatches,
  FILTROS_ESTADO,
  ORDENADORES,
  pasaFiltro,
  type TraceFiltro,
  type TraceModo,
  type TraceOrden,
} from "../loth-trace-ui";
import { destinoDelArbol, trozadoIdsDe } from "@/lib/forestal/loth-trace-aserradero";
import { useFiltrosTabla } from "../filtros-tabla-forestal";
import { useLothTraceAserradero } from "./use-loth-trace-aserradero";
import {
  coincideArbol,
  estadosElegidos,
  facetasSin,
  FILTROS_ALCANCE,
  FILTROS_TRACE,
  ID_ARBOL,
  ID_ESPECIE,
  ID_ESTADO,
  labelDeEstado,
  rangoUltima,
} from "../loth-trace-filtros";

export const POR_PAGINA = 25;
/** Claves de las preferencias. Exportadas: la prueba en navegador las lee. */
export const CLAVE_RESUMEN_ARBOL = "loth:arbol:resumen-abierto";
export const CLAVE_MODO_ARBOL = "loth:arbol:modo";
export const CLAVE_EN_PIE_ARBOL = "loth:arbol:en-pie-abierto";

export interface OpcionEspecie {
  clave: string;
  /** El nombre tal como está escrito en el libro (el más frecuente). */
  label: string;
  count: number;
}

export function useLothTraceVista({
  entries,
  censo,
  gtfEmitidas,
}: {
  entries: LothEntryDTO[];
  censo: ArbolCensoInput[];
  gtfEmitidas?: Set<string> | null;
}) {
  // Una sola fecha de referencia por montaje: si cada render creara la suya, el
  // «hace N días» cambiaría de valor entre renders.
  const [hoy] = useState(() => new Date());
  const [umbrales, setUmbrales] = useState<UmbralesMerma>(UMBRALES_DEFAULT);
  // localStorage no existe en el servidor: leerlo en un efecto evita que el
  // primer render del cliente discrepe del HTML que llegó.
  useEffect(() => setUmbrales(leerUmbrales()), []);

  const [orden, setOrden] = useState<TraceOrden>("volumen");
  const [modoGuardado, setModo] = useLocalStorage<TraceModo>(CLAVE_MODO_ARBOL, "tarjetas");
  // Lo guardado puede venir de otra versión: un valor que no existe cae al default.
  const modo: TraceModo = modoGuardado === "tabla" ? "tabla" : "tarjetas";
  const [resumenAbierto, setResumenAbierto] = useLocalStorage<boolean>(CLAVE_RESUMEN_ARBOL, false);
  const [enPieAbierto, setEnPieAbierto] = useLocalStorage<boolean>(CLAVE_EN_PIE_ARBOL, false);
  /** Paso del avance elegido (Censo, Talados…): filtra la lista a esa etapa. */
  const [paso, setPaso] = useState<PasoAvance | null>(null);
  const [pagina, setPagina] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [detalle, setDetalle] = useState<string | null>(null);
  const [modalUmbrales, setModalUmbrales] = useState(false);

  const filasDelLibro = useMemo(() => {
    const ops = buildTraceOperations(entries, { hoy, umbrales, gtfEmitidas: gtfEmitidas ?? undefined });
    return construirFilasTrace(ops, construirFichasArbol({ censo, entries, hoy }));
  }, [entries, censo, hoy, umbrales, gtfEmitidas]);
  /* L13: lo que el Libro CTP sabe de cada troza (enlace de ADR-450). Mientras
     no se sabe, la fila queda sin `aserradero` —no es «sin enlace»—. */
  const idsTrozado = useMemo(() => filasDelLibro.flatMap((f) => trozadoIdsDe(f.op)), [filasDelLibro]);
  const aserradero = useLothTraceAserradero(idsTrozado);
  const filas = useMemo(() => {
    const porTrozado = aserradero.porTrozado;
    if (!porTrozado) return filasDelLibro;
    return filasDelLibro.map((f) => (f.op && trozadoIdsDe(f.op).length > 0 ? { ...f, aserradero: destinoDelArbol(f.op, porTrozado) } : f));
  }, [filasDelLibro, aserradero.porTrozado]);

  const especies = useMemo<OpcionEspecie[]>(() => {
    const grupos = new Map<string, Map<string, number>>();
    for (const f of filas) {
      const k = claveDeFila(f);
      if (!k || !f.especie) continue;
      const g = grupos.get(k) ?? new Map<string, number>();
      g.set(f.especie, (g.get(f.especie) ?? 0) + 1);
      grupos.set(k, g);
    }
    return Array.from(grupos, ([clave, g]) => {
      const escritas = Array.from(g).sort((a, b) => b[1] - a[1]);
      return { clave, label: escritas[0][0], count: escritas.reduce((a, [, n]) => a + n, 0) };
    }).sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [filas]);

  /* El autofiltro de cada columna: un solo estado para la cabecera de la
     tabla, el plegable «Filtros por columna» (tarjetas y celular) y las
     pastillas de lo pendiente. */
  const filtros = useFiltrosTabla(filas, FILTROS_TRACE);
  const { facetas, textos, setFaceta, setTexto, limpiar: limpiarColumnas } = filtros;
  const search = textos[ID_ARBOL] ?? "";
  const estadosActivos = useMemo(() => estadosElegidos(facetas), [facetas]);

  const porFacetas = useMemo(() => aplicarFacetas(filas, FILTROS_ALCANCE, facetas), [filas, facetas]);
  const candidatas = useMemo(
    () =>
      aplicarFacetas(
        filas.filter((f) => coincideArbol(f, search) && pasaPaso(f, paso)),
        FILTROS_TRACE,
        facetasSin(facetas, ID_ESTADO),
      ),
    [filas, search, paso, facetas],
  );
  // Primero el grupo (lo que pide trabajo arriba), después el orden elegido:
  // así el «siguiente» del detalle recorre los árboles en el orden en que se ven.
  const visibles = useMemo(
    () =>
      candidatas
        .filter((f) => estadosActivos.length === 0 || estadosActivos.some((e) => pasaFiltro(f, e)))
        .map((f) => ({ f, m: filaMatches(f, search) }))
        .sort((a, b) => RANGO_GRUPO[grupoDe(a.f)] - RANGO_GRUPO[grupoDe(b.f)] || ORDENADORES[orden](a.f, b.f)),
    [candidatas, estadosActivos, search, orden],
  );
  const grupos = useMemo(() => agruparPorEtapa(visibles.map(({ f }) => f)), [visibles]);
  const enPie = useMemo(() => enPiePorEspecie(grupos.en_pie), [grupos]);
  // «Hay censo» se decide sobre la lista entera: filtrando por una especie sin
  // censar no puede aparecer todo como «fuera del censo».
  const hayCenso = useMemo(() => filas.some(esCensado), [filas]);
  const pendientes = useMemo(() => pendientesDe(porFacetas, hoy, hayCenso), [porFacetas, hoy, hayCenso]);
  const salieron = useMemo(() => trozasQueSalieron(porFacetas), [porFacetas]);
  const resumen = useMemo(() => resumirFilas(porFacetas), [porFacetas]);
  const conteos = useMemo(() => {
    const out = {} as Record<TraceFiltro, number>;
    for (const e of FILTROS_ESTADO) out[e.key] = candidatas.filter((f) => pasaFiltro(f, e.key)).length;
    return out;
  }, [candidatas]);

  // Cualquier cambio de filtro deja la paginación en la primera página: quedarse
  // en la página 4 de una lista que ahora tiene 3 elementos muestra el vacío.
  useEffect(() => setPagina(0), [facetas, textos, orden, modo, paso]);

  // Se paginan los talados (en movimiento + terminados); los en pie van resumidos.
  const talados = visibles.filter(({ f }) => f.op != null);
  const totalPaginas = Math.max(1, Math.ceil(talados.length / POR_PAGINA));
  const pagActual = Math.min(pagina, totalPaginas - 1);
  const enPagina = talados.slice(pagActual * POR_PAGINA, (pagActual + 1) * POR_PAGINA);

  const toggleSeleccion = (tree: string) =>
    setSeleccion((s) => {
      const next = new Set(s);
      if (next.has(tree)) next.delete(tree);
      else next.add(tree);
      return next;
    });
  /* La selección es de ÁRBOLES, no de lo que se ve: antes la barra decía «3
     seleccionados» y el pasaporte imprimía sólo los que el filtro dejaba a la
     vista — el mismo botón, dos números distintos. */
  const seleccionadas = useMemo(() => filas.filter((f) => seleccion.has(f.tree)), [filas, seleccion]);

  const hayFiltros = filtros.activos > 0 || paso != null;
  const limpiarFiltros = () => {
    setPaso(null);
    limpiarColumnas();
  };
  /** Una pastilla de lo pendiente: suma o quita su estado del filtro de la columna Observaciones. */
  const alternarEstado = useCallback(
    (k: TraceFiltro) => {
      const sig = estadosActivos.includes(k) ? estadosActivos.filter((x) => x !== k) : [...estadosActivos, k];
      setFaceta(ID_ESTADO, sig.length > 0 ? sig.map(labelDeEstado) : undefined);
    },
    [estadosActivos, setFaceta],
  );
  const { desde, hasta } = rangoUltima(facetas);
  const especiesElegidas = facetas[ID_ESPECIE];

  // El detalle navega por lo que se VE: «siguiente» es el árbol de abajo en la lista.
  const conDetalle = visibles.filter(({ f }) => f.op != null).map(({ f }) => f);
  const idxDetalle = detalle ? conDetalle.findIndex((f) => f.tree === detalle) : -1;
  const filaDetalle: TraceFila | null = detalle ? (filas.find((f) => f.tree === detalle) ?? null) : null;

  return {
    filas,
    /** Si se pudo preguntar al Libro CTP (cargando, listo, error, sin libro). */
    estadoAserradero: aserradero.estado,
    /** El Libro CTP devolvió el tope de piezas en alguna tanda: puede faltar alguna. */
    aserraderoTruncado: aserradero.truncado,
    especies,
    resumen,
    grupos,
    enPie,
    pendientes,
    salieron,
    paso,
    /** Tocar el paso activo lo quita (como las pastillas de estado). */
    elegirPaso: (p: PasoAvance) => setPaso((actual) => (actual === p ? null : p)),
    enPieAbierto,
    setEnPieAbierto,
    /** Los en pie se abren solos cuando lo pedido son justamente ellos. */
    enPieForzado: paso === "censo" || estadosActivos.includes("en_pie") || search.trim() !== "",
    conteos,
    visibles,
    enPagina,
    totalPaginas,
    pagActual,
    setPagina,
    /** El autofiltro de cada columna (cabecera, plegable y chips). */
    filtros,
    search,
    /** La búsqueda de la columna Árbol (la usa «Ver en la lista» desde otras vistas). */
    setSearch: (v: string) => setTexto(ID_ARBOL, v),
    estadosActivos,
    alternarEstado,
    orden,
    setOrden,
    modo,
    setModo,
    resumenAbierto,
    setResumenAbierto,
    desde,
    hasta,
    hayFiltros,
    limpiarFiltros,
    seleccion,
    setSeleccion,
    seleccionadas,
    toggleSeleccion,
    detalle: filaDetalle,
    abrirDetalle: setDetalle,
    cerrarDetalle: () => setDetalle(null),
    detalleNav: {
      posicion: idxDetalle >= 0 ? idxDetalle + 1 : null,
      total: conDetalle.length,
      anterior: idxDetalle > 0 ? () => setDetalle(conDetalle[idxDetalle - 1].tree) : undefined,
      siguiente: idxDetalle >= 0 && idxDetalle < conDetalle.length - 1 ? () => setDetalle(conDetalle[idxDetalle + 1].tree) : undefined,
    },
    umbrales,
    guardarUmbrales: (u: UmbralesMerma) => {
      setUmbrales(u);
      guardarUmbrales(u);
    },
    modalUmbrales,
    setModalUmbrales,
    /** Las especies elegidas en su columna, tal como están escritas. */
    especieLabel: Array.isArray(especiesElegidas) && especiesElegidas.length > 0 ? especiesElegidas.join(", ") : null,
    csvVisibles: () => filasToCsv(visibles.map(({ f }) => f)),
    csvSeleccion: () => filasToCsv(seleccionadas),
  };
}
