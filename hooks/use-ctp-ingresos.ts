"use client";

/**
 * use-ctp-ingresos — datos de la pestaña Ingresos del Libro CTP (ADR-124).
 *
 * Trae la página de la tabla y los agregados del período en paralelo. Los KPIs
 * salen de `?stats=1` (calculados en DB sobre todo el conjunto filtrado) y NO
 * de sumar `entries`: la tabla está paginada, así que sumarla en el cliente
 * daría un "total" que sólo describe la página visible.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import type { WoodEntry, WoodEntryStats } from "@/components/admin/forestal/ctp-shared";

export const CTP_PAGE_SIZE = 50;

export type CtpEntryAction = "validate" | "reject" | "delete";

interface UseCtpIngresosArgs {
  period: CtpPeriod;
  status: string;
  /** Ya debounceado por el caller. */
  search: string;
  page: number;
}

interface UseCtpIngresosResult {
  entries: WoodEntry[];
  stats: WoodEntryStats | null;
  total: number;
  loading: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
  reload: () => Promise<void>;
  runAction: (id: string, action: CtpEntryAction, reason?: string) => Promise<void>;
  /** Valida N ingresos; devuelve cuántos fallaron. Recarga una sola vez al final. */
  validateMany: (ids: string[]) => Promise<number>;
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

export function useCtpIngresos({
  period,
  status,
  search,
  page,
}: UseCtpIngresosArgs): UseCtpIngresosResult {
  const [entries, setEntries] = useState<WoodEntry[]>([]);
  const [stats, setStats] = useState<WoodEntryStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Descarta respuestas de un fetch viejo que llega tarde y pisaría al nuevo.
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      // Una sola request: `stats=1` devuelve tabla + agregados juntos (el bucket
      // de este endpoint es STRICT y dos fetches por carga lo hacían saltar).
      const params = applyCtpPeriodParams(new URLSearchParams(), period);
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      params.set("limit", String(CTP_PAGE_SIZE));
      params.set("offset", String(page * CTP_PAGE_SIZE));
      params.set("stats", "1");

      const res = await fetch(`/api/admin/forestal/wood-entries?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await errorFrom(res));

      const data: { entries: WoodEntry[]; total: number; stats: WoodEntryStats } = await res.json();
      if (seq !== requestSeq.current) return;

      setEntries(data.entries);
      setTotal(data.total);
      setStats(data.stats);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [period, status, search, page]);

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
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        const first = failed[0] as PromiseRejectedResult;
        setError(
          failed.length === ids.length
            ? `No se validó ninguno: ${String(first.reason?.message ?? first.reason)}`
            : `${ids.length - failed.length} de ${ids.length} validados. ${failed.length} fallaron: ${String(first.reason?.message ?? first.reason)}`,
        );
      }
      await load();
      return failed.length;
    },
    [load],
  );

  return {
    entries,
    stats,
    total,
    loading,
    error,
    setError,
    reload: load,
    runAction,
    validateMany,
  };
}
