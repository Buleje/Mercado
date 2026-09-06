"use client";

/**
 * use-ctp-ingresos — datos de la pestaña Ingresos del Libro CTP (ADR-124).
 *
 * Trae la página de la tabla y los agregados del período en paralelo. Los KPIs
 * salen de `?stats=1` (calculados en DB sobre todo el conjunto filtrado) y NO
 * de sumar `entries`: la tabla está paginada, así que sumarla en el cliente
 * daría un "total" que sólo describe la página visible.
 *
 * 2026-07-29 — filtros de faceta (especie/proveedor/producto/CITES/fuera de
 * plazo), orden por columna y descarga de TODO lo filtrado (no de la página).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import type { WoodEntry, WoodEntryStats } from "@/components/admin/forestal/ctp-shared";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";

export const CTP_PAGE_SIZE = 50;
/** Tope de la descarga: un CSV de 5000 filas ya son ~1.5 MB y varias páginas de
 *  fetch. Si el filtro devuelve más, se avisa que quedó recortado. */
export const CTP_EXPORT_MAX = 5000;

export type CtpEntryAction = "validate" | "reject" | "annul" | "delete";

export type CtpSortField =
  | "entryDate"
  /** Cuándo se recibió — el orden del archivo de GTF ingresadas (ADR-351). */
  | "fechaRecepcion"
  | "volumeM3"
  | "pieces"
  | "providerName"
  | "speciesCommonName"
  | "createdAt";

export interface CtpSort {
  by: CtpSortField;
  dir: "asc" | "desc";
}

/** Filtros de la vista. `status`/`search` son los históricos; el resto son las
 *  facetas nuevas. Todo opcional salvo los dos primeros (siempre string). */
export interface CtpIngresosFiltros {
  status: string;
  /** Ya debounceado por el caller. */
  search: string;
  species?: string;
  provider?: string;
  product?: string;
  /** true = solo CITES · false = solo NO-CITES · undefined = ambos. */
  cites?: boolean;
  /** true = solo los registrados fuera del plazo SERFOR. */
  late?: boolean;
  /** true = solo los que no tienen código de origen (bloquean el EUDR). */
  sinOrigen?: boolean;
  /**
   * Estado de recepción (ADR-339): `pendiente` es la bandeja del patio,
   * `cerrada` el archivo de GTF ingresadas. Vacío = las dos.
   */
  recepcion?: "pendiente" | "cerrada" | "";
}

interface UseCtpIngresosArgs {
  period: CtpPeriod;
  filtros: CtpIngresosFiltros;
  sort: CtpSort;
  page: number;
}

interface UseCtpIngresosResult {
  entries: WoodEntry[];
  /**
   * Las mismas líneas agrupadas por documento (ADR-346). La paginación va por
   * GUÍA: `total` cuenta guías y `lineas` los asientos que hay detrás.
   */
  guias: GuiaIngreso<WoodEntry>[];
  lineas: number;
  stats: WoodEntryStats | null;
  total: number;
  loading: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
  reload: () => Promise<void>;
  runAction: (id: string, action: CtpEntryAction, reason?: string) => Promise<void>;
  /** Valida N ingresos; devuelve cuántos fallaron. Recarga una sola vez al final. */
  validateMany: (ids: string[]) => Promise<number>;
  /** Recepciona N guías con la misma fecha (ADR-339); devuelve cuántas fallaron. */
  recepcionarMany: (ids: string[], fecha?: string) => Promise<number>;
  /** Rechaza N ingresos con un motivo común; devuelve cuántos fallaron. */
  rejectMany: (ids: string[], reason: string) => Promise<number>;
  /** Todas las filas del filtro actual (hasta CTP_EXPORT_MAX) — para descargar. */
  fetchAllFiltered: () => Promise<{ entries: WoodEntry[]; truncated: boolean }>;
}

const errorFrom = async (res: Response): Promise<string> => {
  const data = await res.json().catch(() => ({}));
  return data.message ?? data.error ?? `HTTP ${res.status}`;
};

async function patchEntry(id: string, action: CtpEntryAction, reason?: string): Promise<void> {
  const res = await fetch(`/api/admin/forestal/wood-entries/${id}`, {
    method: "PATCH",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ action, ...(reason ? { reason } : {}) }),
  });
  if (!res.ok) throw new Error(await errorFrom(res));
}

/** Resumen del error de una tanda: cuántos entraron, cuántos no y por qué. */
function resumenLote(
  verbo: string,
  ids: string[],
  results: PromiseSettledResult<void>[],
): string | null {
  const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  if (failed.length === 0) return null;
  const motivo = String(failed[0].reason?.message ?? failed[0].reason);
  return failed.length === ids.length
    ? `No se ${verbo} ninguno: ${motivo}`
    : `${ids.length - failed.length} de ${ids.length} ${verbo}. ${failed.length} fallaron: ${motivo}`;
}

export function useCtpIngresos({
  period,
  filtros,
  sort,
  page,
}: UseCtpIngresosArgs): UseCtpIngresosResult {
  const [entries, setEntries] = useState<WoodEntry[]>([]);
  const [guias, setGuias] = useState<GuiaIngreso<WoodEntry>[]>([]);
  const [lineas, setLineas] = useState(0);
  const [stats, setStats] = useState<WoodEntryStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Descarta respuestas de un fetch viejo que llega tarde y pisaría al nuevo.
  const requestSeq = useRef(0);

  const { status, search, species, provider, product, cites, late, sinOrigen, recepcion } = filtros;

  /** Los parámetros del conjunto (sin paginación): los comparten la tabla y la
   *  descarga, así que "exportar" baja EXACTAMENTE lo que se está viendo. */
  const baseParams = useMemo(() => {
    const params = applyCtpPeriodParams(new URLSearchParams(), period);
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    if (species) params.set("species", species);
    if (provider) params.set("provider", provider);
    if (product) params.set("product", product);
    if (cites !== undefined) params.set("cites", cites ? "1" : "0");
    if (late) params.set("late", "1");
    if (sinOrigen) params.set("sin_origen", "1");
    if (recepcion) params.set("recepcion", recepcion);
    params.set("sort", sort.by);
    params.set("dir", sort.dir);
    return params;
  }, [period, status, search, species, provider, product, cites, late, sinOrigen, recepcion, sort.by, sort.dir]);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      // Una sola request: `stats=1` devuelve tabla + agregados juntos (el bucket
      // de este endpoint es STRICT y dos fetches por carga lo hacían saltar).
      const params = new URLSearchParams(baseParams);
      params.set("limit", String(CTP_PAGE_SIZE));
      params.set("offset", String(page * CTP_PAGE_SIZE));
      params.set("stats", "1");
      /* La bandeja se lee por documento: una GTF de dos especies es UNA fila
         (ADR-346). El agrupado lo hace el servidor porque también pagina. */
      params.set("agrupar", "guia");

      const res = await fetch(`/api/admin/forestal/wood-entries?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await errorFrom(res));

      const data: {
        guias: GuiaIngreso<WoodEntry>[];
        total: number;
        lineas: number;
        stats: WoodEntryStats;
      } = await res.json();
      if (seq !== requestSeq.current) return;

      setGuias(data.guias ?? []);
      /* `entries` sigue siendo la lista plana de la página: las acciones en
         lote, el legajo y el "seleccionar todo" trabajan sobre asientos. */
      setEntries((data.guias ?? []).flatMap((g) => g.lineas));
      setTotal(data.total);
      setLineas(data.lineas ?? 0);
      setStats(data.stats);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [baseParams, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (id: string, action: CtpEntryAction, reason?: string) => {
      setError(null);
      try {
        await patchEntry(id, action, reason);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [load],
  );

  const validateMany = useCallback(
    async (ids: string[]) => {
      setError(null);
      const results = await Promise.allSettled(ids.map((id) => patchEntry(id, "validate")));
      const msg = resumenLote("validaron", ids, results);
      if (msg) setError(msg);
      await load();
      return results.filter((r) => r.status === "rejected").length;
    },
    [load],
  );

  /**
   * Recepcionar N guías con la MISMA fecha (ADR-339): el camión bajó hoy y son
   * cinco guías. Cada una fecha sus piezas, se fecha y se valida; la bandeja se
   * vacía en un paso.
   */
  /**
   * Recepciona una tanda de asientos en UN pedido (ADR-351).
   *
   * Antes iban N PATCH en paralelo y un fallo dejaba la guía **partida** entre
   * la bandeja y el archivo. El servidor los recorre en serie y contesta qué
   * entró y qué falló; acá sólo se traduce el resultado.
   */
  const recepcionarMany = useCallback(
    async (ids: string[], fecha?: string) => {
      setError(null);
      try {
        const res = await fetch("/api/admin/forestal/wood-entries", {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify({ action: "recepcionar_guia", ids, ...(fecha ? { fecha } : {}) }),
        });
        const datos = (await res.json().catch(() => ({}))) as {
          recepcionados?: number;
          message?: string;
          error?: string;
        };
        if (!res.ok) {
          const faltan = ids.length - (datos.recepcionados ?? 0);
          setError(
            datos.recepcionados
              ? `Entraron ${datos.recepcionados} de ${ids.length}; ${faltan} no: ${datos.message ?? datos.error ?? `HTTP ${res.status}`}`
              : `No se recepcionó: ${datos.message ?? datos.error ?? `HTTP ${res.status}`}`,
          );
          return faltan;
        }
        return 0;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return ids.length;
      } finally {
        await load();
      }
    },
    [load],
  );

  const rejectMany = useCallback(
    async (ids: string[], reason: string) => {
      setError(null);
      const results = await Promise.allSettled(
        ids.map((id) => patchEntry(id, "reject", reason)),
      );
      const msg = resumenLote("rechazaron", ids, results);
      if (msg) setError(msg);
      await load();
      return results.filter((r) => r.status === "rejected").length;
    },
    [load],
  );

  const fetchAllFiltered = useCallback(async () => {
    // El backend topea `limit` en 500: se pagina hasta cubrir el filtro. Sin
    // `stats=1` — acá sólo interesan las filas.
    const PAGE = 500;
    const acc: WoodEntry[] = [];
    let offset = 0;
    let total = Infinity;
    while (acc.length < Math.min(total, CTP_EXPORT_MAX)) {
      const params = new URLSearchParams(baseParams);
      params.set("limit", String(PAGE));
      params.set("offset", String(offset));
      const res = await fetch(`/api/admin/forestal/wood-entries?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await errorFrom(res));
      const data: { entries: WoodEntry[]; total: number } = await res.json();
      total = data.total;
      acc.push(...data.entries);
      if (data.entries.length < PAGE) break;
      offset += PAGE;
    }
    return { entries: acc.slice(0, CTP_EXPORT_MAX), truncated: total > CTP_EXPORT_MAX };
  }, [baseParams]);

  return {
    entries,
    guias,
    lineas,
    stats,
    total,
    loading,
    error,
    setError,
    reload: load,
    runAction,
    validateMany,
    recepcionarMany,
    rejectMany,
    fetchAllFiltered,
  };
}
