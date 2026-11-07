"use client";

/**
 * Los datos de Cuentas: un fetch por periodo a `/api/admin/finanzas/cuentas`,
 * con cancelación (cambiar de periodo o desmontar aborta el pedido anterior).
 * La respuesta es `CuentasDelPeriodo` (lib/finance/cuentas-tipos.ts), con o sin
 * el envoltorio `{ data }`.
 */
import { useCallback, useEffect, useState } from "react";
import type { CuentasDelPeriodo, PeriodoCuentas } from "@/lib/finance/cuentas-tipos";

interface Respuesta {
  clave: string;
  datos: CuentasDelPeriodo | null;
}

const esCuentas = (x: unknown): x is CuentasDelPeriodo =>
  typeof x === "object" && x !== null && Array.isArray((x as CuentasDelPeriodo).movimientos);

export function useCuentasDelPeriodo(periodo: PeriodoCuentas) {
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<Respuesta | null>(null);
  const clave = `${periodo}:${tick}`;

  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/admin/finanzas/cuentas?periodo=${periodo}`, { cache: "no-store", signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) return null;
        const json: unknown = await r.json();
        const crudo = typeof json === "object" && json !== null && "data" in json ? (json as { data: unknown }).data : json;
        return esCuentas(crudo) ? crudo : null;
      })
      .then((datos) => { if (!ac.signal.aborted) setRes({ clave, datos }); })
      .catch((err: unknown) => {
        if (ac.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setRes({ clave, datos: null });
      });
    return () => ac.abort();
  }, [periodo, clave]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);
  const cargando = res?.clave !== clave;
  const datos = cargando ? null : (res?.datos ?? null);
  return { datos, cargando, error: !cargando && datos === null, recargar };
}
