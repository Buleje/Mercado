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
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import {
  contarFiltros,
  facetasDeSeccion,
  filtrarSeccion,
  totalesDeSeccion,
  type FiltrosSeccion,
} from "@/lib/forestal/ctp-secciones-filtro";
import { usePanelFiltros } from "@/components/admin/forestal/ctp-filtros-panel";
import type { CtpEntry, CtpSection } from "@/components/admin/forestal/ctp-section-shared";
import type { SortKey } from "@/components/admin/forestal/CtpEntriesTabla";

export function useCtpSeccion(section: CtpSection, period: CtpPeriod, search: string) {
  const [entries, setEntries] = useState<CtpEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      const r = await fetch(`/api/admin/forestal/ctp?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setEntries((await r.json()).entries ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [section, search, period]);
  useEffect(() => { void load(); }, [load]);

  /**
   * Qué despachos ya tienen su ANEXO N° 04 emitido. Con esto la fila muestra el
   * papel como hecho — si no, el operario no tiene forma de saber cuál falta y
   * termina emitiendo dos veces el mismo.
   */
  const cargarAnexos = useCallback(() => {
    if (section !== "despacho") return;
    fetch("/api/admin/forestal/anexos", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { anexos: [] }))
      .then((j: { anexos?: { ctpEntryId?: string }[] }) => {
        const lista = j.anexos ?? [];
        setConAnexo(new Set(lista.map((a) => a.ctpEntryId).filter(Boolean) as string[]));
        setTotalAnexos(lista.length);
      })
      // Sin bandeja no se marca nada: es un indicador, no un bloqueo.
      .catch(() => { setConAnexo(new Set()); setTotalAnexos(0); });
  }, [section]);
  useEffect(cargarAnexos, [cargarAnexos]);

  const kpis = useMemo(() => {
    const reg = entries.filter((e) => e.status === "registrado");
    const totalQty = reg.reduce((a, e) => a + Number(e.quantity ?? 0), 0);
    const consumido = reg.reduce((a, e) => a + Number(e.volumeInputM3 ?? 0), 0);
    // Rendimiento PONDERADO por volumen consumido: la media simple hacía pesar
    // igual una línea de 0.5 m³ que una de 50 m³, y el promedio de planta no es eso.
    let pesoTotal = 0;
    let sumaPonderada = 0;
    for (const e of reg) {
      const rend = Number(e.rendimientoPct ?? 0);
      const vol = Number(e.volumeInputM3 ?? 0);
      if (rend > 0 && vol > 0) {
        sumaPonderada += rend * vol;
        pesoTotal += vol;
      }
    }
    const avgRend = pesoTotal > 0 ? sumaPonderada / pesoTotal : 0;
    return { count: reg.length, totalQty, consumido, avgRend };
  }, [entries]);

  const statusCounts = useMemo(() => ({
    total: entries.length,
    registrado: entries.filter((e) => e.status === "registrado").length,
    anulado: entries.filter((e) => e.status === "anulado").length,
  }), [entries]);

  // Filtro por estado + orden. La media/KPIs no cambian (siguen sobre todo el set);
  // esto solo cambia lo que se LISTA en la tabla/cards.
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
    entries, loading, error, setError, recargar: load,
    // anexos emitidos (sólo despacho)
    conAnexo, totalAnexos, recargarAnexos: cargarAnexos, sinAnexo,
    // filtros y orden
    statusFilter, setStatusFilter,
    soloSinAnexo, setSoloSinAnexo,
    sort, setSort,
    facetas, setFacetas, activos, panelId, abierto, alternar, opciones,
    // derivados de lo que se está viendo
    visible, totalesVista, kpis, statusCounts,
  };
}
