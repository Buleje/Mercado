"use client";

/**
 * use-rrhh-puestos — catálogo de puestos (ADR-414 §2).
 *
 * `crear`/`actualizar`/`eliminar` devuelven el error del servidor tal cual
 * (409 `nombre_duplicado` / `puesto_en_uso`) para que el modal lo muestre sin
 * inventar un mensaje genérico.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PuestoDTO } from "@/lib/rrhh/tipos";
import { sinDato } from "@/lib/errores/sin-dato";

export interface PuestoInput {
  nombre: string;
  descripcion?: string | null;
  tarifaSugerida?: { modalidad: "HORA" | "DIA" | "SEMANA" | "MES"; monto: number } | null;
  horasJornada?: number;
  orden?: number;
}

export interface RrhhApiError {
  error: string;
  n?: number;
  message?: string;
  /** 409 `documento_duplicado` / `beneficiario_ya_vinculado`: quién ya lo tiene. */
  colaboradorId?: string;
  nombre?: string;
  /** 409 `marcas_despues_del_cese`. */
  primera?: string;
}

async function leerError(res: Response): Promise<RrhhApiError> {
  try {
    return (await res.json()) as RrhhApiError;
  } catch {
    return { error: "error_desconocido" };
  }
}

export interface UseRrhhPuestosResult {
  puestos: PuestoDTO[];
  loading: boolean;
  error: string | null;
  recargar: () => void;
  /** Devuelve el puesto creado: quien lo crea en línea (alta de persona) lo selecciona sin esperar la recarga de la lista. */
  crear: (input: PuestoInput) => Promise<{ ok: true; puesto: PuestoDTO | null } | { ok: false; error: RrhhApiError }>;
  actualizar: (id: string, input: Partial<PuestoInput>) => Promise<{ ok: true } | { ok: false; error: RrhhApiError }>;
  eliminar: (id: string) => Promise<{ ok: true } | { ok: false; error: RrhhApiError }>;
}

export function useRrhhPuestos(): UseRrhhPuestosResult {
  const [puestos, setPuestos] = useState<PuestoDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let vigente = true;
    setLoading(true);
    setError(null);
    fetch("/api/rrhh/puestos", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("No se pudieron cargar los puestos");
        return r.json() as Promise<{ puestos: PuestoDTO[] }>;
      })
      .then((data) => {
        if (vigente) setPuestos(data.puestos);
      })
      .catch((err) => {
        sinDato("RRHH puestos")(err);
        if (vigente) setError(err instanceof Error ? err.message : "No se pudieron cargar los puestos");
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);

  const crear = useCallback(async (input: PuestoInput) => {
    const res = await fetch("/api/rrhh/puestos", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
      credentials: "include",
    });
    if (!res.ok) return { ok: false as const, error: await leerError(res) };
    let puesto: PuestoDTO | null = null;
    try {
      puesto = ((await res.json()) as { puesto?: PuestoDTO }).puesto ?? null;
    } catch (err) {
      // El alta ya se guardó: sin el cuerpo sólo se pierde elegirlo solo en el formulario.
      console.warn("[rrhh/puestos] el alta no devolvió el puesto", err);
    }
    recargar();
    return { ok: true as const, puesto };
  }, [recargar]);

  const actualizar = useCallback(async (id: string, input: Partial<PuestoInput>) => {
    const res = await fetch(`/api/rrhh/puestos/${id}`, {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input),
      credentials: "include",
    });
    if (!res.ok) return { ok: false as const, error: await leerError(res) };
    recargar();
    return { ok: true as const };
  }, [recargar]);

  const eliminar = useCallback(async (id: string) => {
    const res = await fetch(`/api/rrhh/puestos/${id}`, {
      method: "DELETE",
      headers: csrfHeaders(),
      credentials: "include",
    });
    if (!res.ok) return { ok: false as const, error: await leerError(res) };
    recargar();
    return { ok: true as const };
  }, [recargar]);

  return { puestos, loading, error, recargar, crear, actualizar, eliminar };
}
