"use client";

/**
 * useLothTraceVista — el estado y las cuentas de la vista «Por árbol».
 *
 * Todo sale de UNA lista de filas (`construirFilasTrace`) y se recorta en tres
 * pasos, cada uno con su lector:
 *
 *   filas ──facetas (especie, fechas)──▶ porFacetas  → el embudo de arriba
 *         ──+ búsqueda──────────────────▶ candidatas → las cuentas del estado
 *         ──+ estado────────────────────▶ visibles   → la lista y el CSV
 *
 * El estado NO recorta el embudo (ADR-400: los indicadores describen lo
 * registrado; el desglose por estado es otra pregunta), y la cuenta de cada
 * estado se hace sin aplicarse a sí mismo — si no, «Con alertas» mostraría
 * siempre el total de la lista que ya filtró.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { buildTraceOperations } from "@/lib/forestal/loth-trace";
import { construirFichasArbol, type ArbolCensoInput } from "@/lib/forestal/loth-arbol";
import { construirFilasTrace, filasToCsv, resumirFilas, type TraceFila } from "@/lib/forestal/loth-trace-tabla";
import { guardarUmbrales, leerUmbrales, UMBRALES_DEFAULT, type UmbralesMerma } from "@/lib/forestal/loth-trace-umbrales";
import {
  claveDeFila,
  enRango,
  filaMatches,
  FILTROS_ESTADO,
  ORDENADORES,
  pasaFiltro,
  type TraceFiltro,
  type TraceModo,
  type TraceOrden,
} from "../loth-trace-ui";

export const POR_PAGINA = 25;
/** Claves de las preferencias. Exportadas: la prueba en navegador las lee. */
export const CLAVE_RESUMEN_ARBOL = "loth:arbol:resumen-abierto";
export const CLAVE_MODO_ARBOL = "loth:arbol:modo";

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

  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<TraceFiltro>("todas");
  const [orden, setOrden] = useState<TraceOrden>("volumen");
  const [modoGuardado, setModo] = useLocalStorage<TraceModo>(CLAVE_MODO_ARBOL, "tarjetas");
  // Lo guardado puede venir de otra versión: un valor que no existe cae al default.
  const modo: TraceModo = modoGuardado === "tabla" ? "tabla" : "tarjetas";
  const [resumenAbierto, setResumenAbierto] = useLocalStorage<boolean>(CLAVE_RESUMEN_ARBOL, false);
  const [especie, setEspecie] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [detalle, setDetalle] = useState<string | null>(null);
  const [modalUmbrales, setModalUmbrales] = useState(false);

  const filas = useMemo(() => {
    const ops = buildTraceOperations(entries, { hoy, umbrales, gtfEmitidas: gtfEmitidas ?? undefined });
    return construirFilasTrace(ops, construirFichasArbol({ censo, entries, hoy }));
  }, [entries, censo, hoy, umbrales, gtfEmitidas]);

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

  const porFacetas = useMemo(
    () => filas.filter((f) => (!especie || claveDeFila(f) === especie) && enRango(f, desde, hasta)),
    [filas, especie, desde, hasta],
  );
  const candidatas = useMemo(
    () => porFacetas.map((f) => ({ f, m: filaMatches(f, search) })).filter(({ m }) => m.matched),
    [porFacetas, search],
  );
  const visibles = useMemo(
    () => candidatas.filter(({ f }) => pasaFiltro(f, filtro)).sort((a, b) => ORDENADORES[orden](a.f, b.f)),
    [candidatas, filtro, orden],
  );
  const resumen = useMemo(() => resumirFilas(porFacetas), [porFacetas]);
  const conteos = useMemo(() => {
    const out = {} as Record<TraceFiltro, number>;
    for (const e of FILTROS_ESTADO) out[e.key] = candidatas.filter(({ f }) => pasaFiltro(f, e.key)).length;
    return out;
  }, [candidatas]);

  // Cualquier cambio de filtro deja la paginación en la primera página: quedarse
  // en la página 4 de una lista que ahora tiene 3 elementos muestra el vacío.
  useEffect(() => setPagina(0), [search, filtro, especie, desde, hasta, orden, modo]);

  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const pagActual = Math.min(pagina, totalPaginas - 1);
  const enPagina = visibles.slice(pagActual * POR_PAGINA, (pagActual + 1) * POR_PAGINA);

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

  const hayFiltros = !!(search || especie || desde || hasta || filtro !== "todas");
  const limpiarFiltros = () => {
    setSearch("");
    setEspecie("");
    setDesde("");
    setHasta("");
    setFiltro("todas");
  };

  // El detalle navega por lo que se VE: «siguiente» es el árbol de abajo en la lista.
  const conDetalle = visibles.filter(({ f }) => f.op != null).map(({ f }) => f);
  const idxDetalle = detalle ? conDetalle.findIndex((f) => f.tree === detalle) : -1;
  const filaDetalle: TraceFila | null = detalle ? (filas.find((f) => f.tree === detalle) ?? null) : null;

  return {
    filas,
    especies,
    resumen,
    conteos,
    visibles,
    enPagina,
    totalPaginas,
    pagActual,
    setPagina,
    search,
    setSearch,
    filtro,
    setFiltro,
    orden,
    setOrden,
    modo,
    setModo,
    resumenAbierto,
    setResumenAbierto,
    especie,
    setEspecie,
    desde,
    setDesde,
    hasta,
    setHasta,
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
    /** El nombre de la especie elegida, tal como está escrito. */
    especieLabel: especies.find((e) => e.clave === especie)?.label ?? null,
    csvVisibles: () => filasToCsv(visibles.map(({ f }) => f)),
    csvSeleccion: () => filasToCsv(seleccionadas),
  };
}
