"use client";

/**
 * use-rrhh-desde-adelantos — traer personas ya conocidas desde Adelantos
 * (ADR-414, pedido Brandon 2026-09-14 «Estrenar RRHH con tu gente»).
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CandidatoDesdeAdelantosDTO, FechaKey, ResultadoTraerDesdeAdelantosDTO } from "@/lib/rrhh/tipos";
import type { RrhhApiError } from "./use-rrhh-puestos";

export type { CandidatoDesdeAdelantosDTO, ResultadoTraerDesdeAdelantosDTO };

export interface UseRrhhDesdeAdelantosResult {
  candidatos: CandidatoDesdeAdelantosDTO[];
  /** Cuántos de Adelantos ya están vinculados a una persona de RRHH (no salen en `candidatos`). */
  yaVinculados: number;
  loading: boolean;
  error: string | null;
  recargar: () => void;
  /**
   * `incluirEmpresas` — confirmación APARTE (`traerDesdeAdelantosSchema`): un
   * id de una `esEmpresa` que está en `beneficiarioIds` pero NO en
   * `incluirEmpresas` el servidor lo omite con `es_empresa` igual. Marcar la
   * casilla de una empresa a mano no alcanza si no se manda acá también.
   */
  traer: (
    beneficiarioIds: string[],
    fechaIngreso?: FechaKey,
    incluirEmpresas?: string[],
  ) => Promise<({ ok: true } & ResultadoTraerDesdeAdelantosDTO) | { ok: false; error: RrhhApiError }>;
}

export function useRrhhDesdeAdelantos(): UseRrhhDesdeAdelantosResult {
  const [candidatos, setCandidatos] = useState<CandidatoDesdeAdelantosDTO[]>([]);
  const [yaVinculados, setYaVinculados] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let vigente = true;
    setLoading(true);
    setError(null);
    fetch("/api/rrhh/colaboradores/desde-adelantos", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar la lista de Adelantos");
        return r.json() as Promise<{ candidatos: CandidatoDesdeAdelantosDTO[]; yaVinculados: number }>;
      })
      .then((data) => {
        if (!vigente) return;
        setCandidatos(data.candidatos);
        setYaVinculados(data.yaVinculados ?? 0);
      })
      .catch((err) => {
        console.error("[rrhh] desde-adelantos falló", err);
        if (vigente) setError(err instanceof Error ? err.message : "No se pudo cargar la lista de Adelantos");
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);

  const traer = useCallback(async (beneficiarioIds: string[], fechaIngreso?: FechaKey, incluirEmpresas?: string[]) => {
    const res = await fetch("/api/rrhh/colaboradores/desde-adelantos", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        beneficiarioIds,
        fechaIngreso: fechaIngreso || undefined,
        incluirEmpresas: incluirEmpresas?.length ? incluirEmpresas : undefined,
      }),
      credentials: "include",
    });
    if (!res.ok) {
      const error = (await res.json().catch(() => ({ error: "error_desconocido" }))) as RrhhApiError;
      return { ok: false as const, error };
    }
    const data = (await res.json()) as ResultadoTraerDesdeAdelantosDTO;
    return { ok: true as const, ...data };
  }, []);

  return { candidatos, yaVinculados, loading, error, recargar, traer };
}
