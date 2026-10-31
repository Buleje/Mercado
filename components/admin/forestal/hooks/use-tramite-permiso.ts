"use client";

/**
 * El permiso elegido en un oficio, con lo que el oficio necesita de él: el
 * contrato (titular, RUC) y, si tiene ficha del Directorio atada, la ficha (el
 * representante). La lista de permisos se pide sin balances (`SelectorContrato`
 * pide la suya con plata: acá no hace falta); el Directorio, sólo si el
 * permiso elegido tiene ficha.
 */

import { useEffect, useMemo, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import type { Contrato } from "@/lib/forestal/contratos";
import type { Parte } from "@/lib/forestal/directorio";

export interface PermisoTramite {
  contrato: Contrato | null;
  parte: Parte | null;
  /** Ya se sabe todo lo que se iba a saber del permiso elegido (o no hay ninguno). */
  listo: boolean;
  error: string | null;
}

async function pedir<T>(url: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(url, { credentials: "include", cache: "no-store", signal });
  if (!r.ok) throw new Error(`No se pudo leer ${url.includes("contratos") ? "los permisos" : "el Directorio"} (HTTP ${r.status}).`);
  return ((await leerJson<T>(r)) ?? {}) as T;
}

export function useTramitePermiso(contratoId: string | null): PermisoTramite {
  const [contratos, setContratos] = useState<Contrato[] | null>(null);
  const [partes, setPartes] = useState<Parte[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    pedir<{ contratos?: Contrato[] }>("/api/admin/forestal/contratos", ac.signal)
      .then((j) => setContratos(j.contratos ?? []))
      .catch((err: unknown) => {
        if (!ac.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      });
    return () => ac.abort();
  }, []);

  const contrato = useMemo(() => contratos?.find((c) => c.id === contratoId) ?? null, [contratos, contratoId]);
  const conFicha = Boolean(contrato?.titularId);

  useEffect(() => {
    if (!conFicha || partes !== null) return;
    const ac = new AbortController();
    pedir<{ partes?: Parte[] }>("/api/admin/forestal/directorio?inactivos=1&vehiculos=0", ac.signal)
      .then((j) => setPartes(j.partes ?? []))
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setPartes([]);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => ac.abort();
  }, [conFicha, partes]);

  const parte = useMemo(
    () => (contrato?.titularId ? (partes?.find((p) => p.id === contrato.titularId) ?? null) : null),
    [contrato, partes],
  );
  const listo = !contratoId || error !== null || (contratos !== null && (!conFicha || partes !== null));
  return { contrato, parte, listo, error };
}
