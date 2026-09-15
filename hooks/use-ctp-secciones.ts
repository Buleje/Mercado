"use client";

/**
 * useCtpSeccion — los datos de una sección del Libro CTP (Producción o Despacho).
 *
 * Sale de `CtpEntriesView`, que mezclaba en un mismo archivo el fetch, los
 * filtros, el orden, los KPIs y la mitad de la UI. El corte es por naturaleza:
 * acá vive lo que se SABE de la sección; en el componente, lo que se MUESTRA y
 * los modales, que son estado de pantalla y no de datos.
 *
 * Las facetas y los KPIs se calculan en el cliente a propósito: esta vista trae
 * TODO el período en una carga, así que la base no tiene nada que agregar — y
 * las opciones del filtro no pueden mentir sobre lo que hay.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { applyCtpPeriodParams, ctpPeriodShortLabel, periodoAnterior, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import {
  contarFiltros,
  facetasDeSeccion,
  filtrarSeccion,
  totalesDeSeccion,
  type FiltrosSeccion,
} from "@/lib/forestal/ctp-secciones-filtro";
import { calcularKpisSeccion } from "@/lib/forestal/ctp-kpis-seccion";
import { usePanelFiltros } from "@/components/admin/forestal/ctp-filtros-panel";
import type { CtpEntry, CtpSection } from "@/components/admin/forestal/ctp-section-shared";
import type { SortKey } from "@/components/admin/forestal/CtpEntriesTabla";

export function useCtpSeccion(section: CtpSection, period: CtpPeriod, search: string) {
  const [entries, setEntries] = useState<CtpEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Cuánto hay en TOTAL para esta sección, sin la ventana de fecha del
   *  período activo — `undefined` cuando el período es "todo" (no hay nada
   *  que esconder). Sirve para avisar que el período está tapando corridas
   *  reales, no que se perdieron (memoria: "17 vs 13"). */
  const [totalSinFiltro, setTotalSinFiltro] = useState<number | undefined>(undefined);
  /** Despachos que YA tienen anexo emitido (se marcan en la fila). */
  const [conAnexo, setConAnexo] = useState<Set<string>>(new Set());
  /** Cuántos anexos hay en la bandeja (el badge del botón). */
  const [totalAnexos, setTotalAnexos] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"" | "registrado" | "anulado">("");
  /** Sólo las guías que todavía no tienen su ANEXO N° 04 emitido. */
  const [soloSinAnexo, setSoloSinAnexo] = useState(false);
  const [sort, setSort] = useState<{ by: SortKey | null; dir: "asc" | "desc" }>({ by: null, dir: "desc" });
  // Facetas (especie / producto / destino / CITES). Se calculan en el cliente:
  // esta vista trae TODO el período en una carga, así que la DB no tiene nada
  // que agregar — y las opciones no pueden mentir sobre lo que hay.
  const [facetas, setFacetas] = useState<FiltrosSeccion>({});
  const activos = contarFiltros(facetas);
  const { panelId, abierto, alternar } = usePanelFiltros(activos);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = applyCtpPeriodParams(new URLSearchParams({ section }), period);
      if (search.trim()) p.set("search", search.trim());
      /**
       * `ctpGet` y no `fetch` crudo (medido 2026-09-09): abrir Producción
       * pedía la MISMA url tres veces —hasta siete con re-renders— porque cada
       * identidad nueva de `load` disparaba su propia llamada. `ctpGet`
       * devuelve la misma promesa a quien pida la misma url y la cachea unos
       * segundos; lo que escribe llama `invalidarCtp()`, así que fresco sigue
       * siendo fresco.
       */
      const j = await ctpGet<{ entries?: CtpEntry[]; totalSinFiltro?: number }>(
        `/api/admin/forestal/ctp?${p}`,
      );
      setEntries(j.entries ?? []);
      setTotalSinFiltro(j.totalSinFiltro);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [section, search, period]);
  useEffect(() => { void load(); }, [load]);

  /**
   * Qué despachos ya tienen su ANEXO N° 04 emitido. Con esto la fila muestra el
   * papel como hecho — si no, el operario no tiene forma de saber cuál falta y
   * termina emitiendo dos veces el mismo.
   */
  /**
   * Devuelve el conjunto recién leído además de guardarlo: quien acaba de
   * cerrar el modal del anexo necesita saber, en ESE momento, si el papel
   * quedó emitido y cuál sigue. El `conAnexo` del estado todavía es el viejo
   * (el re-render llega después), así que leerlo ahí contestaría la pregunta
   * anterior.
   */
  const cargarAnexos = useCallback(async (): Promise<Set<string>> => {
    if (section !== "despacho") return new Set<string>();
    try {
      const r = await fetch("/api/admin/forestal/anexos", { credentials: "include", cache: "no-store" });
      const j: { anexos?: { ctpEntryId?: string }[] } = r.ok ? await r.json() : { anexos: [] };
      const lista = j.anexos ?? [];
      const emitidos = new Set(lista.map((a) => a.ctpEntryId).filter(Boolean) as string[]);
      setConAnexo(emitidos);
      setTotalAnexos(lista.length);
      return emitidos;
    } catch {
      // Sin bandeja no se marca nada: es un indicador, no un bloqueo.
      setConAnexo(new Set());
      setTotalAnexos(0);
      return new Set<string>();
    }
  }, [section]);
  useEffect(() => { void cargarAnexos(); }, [cargarAnexos]);

  /**
   * Las líneas que gobiernan los KPIs (ADR-400).
   *
   * Son las FILTRADAS por faceta, no todas: hasta ahora las tarjetas hablaban
   * del período entero mientras la tabla de abajo mostraba una especie, y los
   * dos números convivían en la misma pantalla contradiciéndose. Es la misma
   * regla que ya cumple Ingresos, donde `stats()` comparte el `where` con
   * `list()`.
   *
   * El filtro de ESTADO queda afuera a propósito, igual que allá: los KPIs
   * describen lo registrado del período, y el desglose por estado es otra
   * pregunta (la contestan los chips).
   */
  const entriesDeKpis = useMemo(() => filtrarSeccion(entries, facetas), [entries, facetas]);

  const kpis = useMemo(() => calcularKpisSeccion(entriesDeKpis, section), [entriesDeKpis, section]);

  /**
   * Las MISMAS filas, una ventana atrás: con eso cada cifra puede contestar
   * «¿es mucho?», que es la única pregunta que se hace quien la lee.
   *
   * Se piden aparte y se pasan por `calcularKpisSeccion` —la misma función, no
   * una cuenta del servidor— y por las MISMAS facetas: si la pantalla está
   * filtrando Tornillo, el mes pasado también tiene que ser el de Tornillo, o
   * el delta compara dos universos distintos y miente con cara de dato.
   *
   * Sin período anterior (histórico completo, o un custom sin los dos bordes)
   * `periodoAnterior` devuelve `null` y acá no se inventa nada: la tarjeta se
   * dibuja sin comparación.
   */
  const previo = useMemo(() => periodoAnterior(period), [period]);
  const [entriesPrevias, setEntriesPrevias] = useState<CtpEntry[] | null>(null);
  useEffect(() => {
    if (!previo) { setEntriesPrevias(null); return; }
    let vivo = true;
    const p = applyCtpPeriodParams(new URLSearchParams({ section }), previo);
    if (search.trim()) p.set("search", search.trim());
    ctpGet<{ entries?: CtpEntry[] }>(`/api/admin/forestal/ctp?${p}`)
      .then((j) => { if (vivo) setEntriesPrevias(j.entries ?? []); })
      /* La comparación es un lujo, no el dato: si el período anterior no carga,
         las cifras del período actual siguen siendo correctas y se muestran
         solas. Lo que no se hace es dibujar un delta contra un cero inventado. */
      .catch(() => { if (vivo) setEntriesPrevias(null); });
    return () => { vivo = false; };
  }, [section, previo, search]);

  const kpisPrevios = useMemo(
    () => (entriesPrevias ? calcularKpisSeccion(filtrarSeccion(entriesPrevias, facetas), section) : null),
    [entriesPrevias, facetas, section],
  );

  const statusCounts = useMemo(() => ({
    total: entries.length,
    registrado: entries.filter((e) => e.status === "registrado").length,
    anulado: entries.filter((e) => e.status === "anulado").length,
  }), [entries]);

  // Filtro por estado + orden: esto sólo cambia lo que se LISTA. Las facetas,
  // en cambio, mandan también sobre los KPIs (ADR-400) — la tabla y las cifras
  // que la encabezan describen el mismo conjunto.
  /** Guías vivas que todavía no tienen anexo: lo que le falta emitir al regente. */
  const sinAnexo = useMemo(
    () => (section === "despacho" ? entries.filter((e) => e.status === "registrado" && !conAnexo.has(e.id)).length : 0),
    [entries, conAnexo, section],
  );

  const opciones = useMemo(() => facetasDeSeccion(entries), [entries]);

  const visible = useMemo(() => {
    const porFaceta = filtrarSeccion(entries, facetas);
    const porEstado = statusFilter ? porFaceta.filter((e) => e.status === statusFilter) : porFaceta;
    // "Sin anexo" sólo tiene sentido sobre líneas vivas: una anulada no se ampara.
    const list = soloSinAnexo
      ? porEstado.filter((e) => e.status === "registrado" && !conAnexo.has(e.id))
      : porEstado;
    if (!sort.by) return list;
    const val = (e: CtpEntry) =>
      sort.by === "fecha" ? new Date(e.entryDate).getTime()
      : sort.by === "cantidad" ? Number(e.quantity ?? 0)
      : Number(e.rendimientoPct ?? 0);
    return [...list].sort((a, b) => { const d = val(a) - val(b); return sort.dir === "asc" ? d : -d; });
  }, [entries, facetas, statusFilter, sort, soloSinAnexo, conAnexo]);

  /** Totales de lo que se está viendo (sin anuladas: en el libro no cuentan). */
  const totalesVista = useMemo(() => totalesDeSeccion(visible), [visible]);

  return {
    // datos crudos
    entries, loading, error, setError, recargar: load, totalSinFiltro,
    // anexos emitidos (sólo despacho)
    conAnexo, totalAnexos, recargarAnexos: cargarAnexos, sinAnexo,
    // filtros y orden
    statusFilter, setStatusFilter,
    soloSinAnexo, setSoloSinAnexo,
    sort, setSort,
    facetas, setFacetas, activos, panelId, abierto, alternar, opciones,
    // derivados de lo que se está viendo
    visible, totalesVista, kpis, statusCounts,
    // la misma cuenta, una ventana atrás (y cómo se llama ese lapso)
    /* Etiqueta CORTA («abr–jun 2026»): el label largo del período ocupa dos
       renglones al lado del delta y parte la tarjeta en cuatro líneas. El largo
       sigue siendo el de los informes. */
    kpisPrevios, etiquetaPrevio: previo ? ctpPeriodShortLabel(previo) : null,
  };
}
