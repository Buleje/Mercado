"use client";

/**
 * use-rrhh-colaboradores — la lista de personal (ADR-414 §1, vista `personal`).
 *
 * `campos=min` es lo que usan las pantallas de nivel `marcar` (la hoja de
 * asistencia no necesita documento ni celular) y `VinculoContraparte` (el
 * tercer lado «Trabajador» del contrato). El resto pide la ficha completa
 * según el nivel que ya filtró el servidor.
 *
 * Los filtros se pasan como primitivos (no un objeto `filtros` inline) para
 * que el efecto sólo re-dispare cuando alguno cambia de verdad — un objeto
 * armado en el render del llamador es una identidad nueva cada vez.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { ColaboradorDTO, ColaboradorMinDTO, EstadoColaborador, FechaKey, Modalidad, NivelRrhh, TipoDocumento } from "@/lib/rrhh/tipos";
import type { RrhhApiError } from "./use-rrhh-puestos";

export interface FiltrosColaboradores {
  estados?: EstadoColaborador[];
  puestoId?: string;
  q?: string;
  incluirCesados?: boolean;
}

function armarQuery(filtros: FiltrosColaboradores, camposMin: boolean): string {
  const p = new URLSearchParams();
  if (filtros.estados?.length) p.set("estado", filtros.estados.join(","));
  if (filtros.puestoId) p.set("puestoId", filtros.puestoId);
  if (filtros.q?.trim()) p.set("q", filtros.q.trim());
  if (filtros.incluirCesados) p.set("incluirCesados", "1");
  if (camposMin) p.set("campos", "min");
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export interface UseRrhhColaboradoresResult<T> {
  colaboradores: T[];
  nivel: NivelRrhh | null;
  loading: boolean;
  error: string | null;
  recargar: () => void;
}

/** `camposMin = true` → `ColaboradorMinDTO[]` (nombre, apodo, puesto, estado — sin PII). */
export function useRrhhColaboradores(
  filtros: FiltrosColaboradores,
  camposMin: false,
): UseRrhhColaboradoresResult<ColaboradorDTO>;
export function useRrhhColaboradores(
  filtros: FiltrosColaboradores,
  camposMin: true,
): UseRrhhColaboradoresResult<ColaboradorMinDTO>;
export function useRrhhColaboradores(
  filtros: FiltrosColaboradores,
  camposMin: boolean,
): UseRrhhColaboradoresResult<ColaboradorDTO | ColaboradorMinDTO> {
  const estadosClave = filtros.estados?.join(",") ?? "";
  const { puestoId, q, incluirCesados } = filtros;

  const [colaboradores, setColaboradores] = useState<(ColaboradorDTO | ColaboradorMinDTO)[]>([]);
  const [nivel, setNivel] = useState<NivelRrhh | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let vigente = true;
    setLoading(true);
    setError(null);
    const query = armarQuery(
      { estados: estadosClave ? (estadosClave.split(",") as EstadoColaborador[]) : undefined, puestoId, q, incluirCesados },
      camposMin,
    );
    fetch(`/api/rrhh/colaboradores${query}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Sin acceso al personal completo" : "No se pudo cargar el personal");
        return r.json() as Promise<{ nivel: NivelRrhh; colaboradores: (ColaboradorDTO | ColaboradorMinDTO)[] }>;
      })
      .then((data) => {
        if (!vigente) return;
        setColaboradores(data.colaboradores);
        setNivel(data.nivel);
      })
      .catch((err) => {
        console.error("[rrhh] colaboradores falló", err);
        if (vigente) setError(err instanceof Error ? err.message : "No se pudo cargar el personal");
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [estadosClave, puestoId, q, incluirCesados, camposMin, tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);

  return { colaboradores, nivel, loading, error, recargar };
}

export interface ColaboradorInput {
  nombre: string;
  apodo?: string | null;
  tipoDocumento?: TipoDocumento | null;
  documento?: string | null;
  celular?: string | null;
  direccion?: string | null;
  contactoEmergenciaNombre?: string | null;
  contactoEmergenciaCelular?: string | null;
  puestoId?: string | null;
  fechaIngreso?: FechaKey | null;
  observaciones?: string | null;
  estado?: "ACTIVO" | "VACACIONES" | "LICENCIA" | "SUSPENDIDO";
  /** Sólo nivel completo. */
  beneficiarioId?: string | null;
  /** Sólo nivel completo. */
  tarifaInicial?: { modalidad: Modalidad; monto: number } | null;
}

/**
 * Alta de una persona. Función suelta (no hook): la usa `ColaboradorFormModal`,
 * que no necesita mantener una lista propia — sólo dispara el POST y avisa.
 */
export async function crearColaborador(
  input: ColaboradorInput,
): Promise<{ ok: true; colaborador: ColaboradorDTO } | { ok: false; error: RrhhApiError }> {
  const res = await fetch("/api/rrhh/colaboradores", {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
    credentials: "include",
  });
  if (!res.ok) {
    const error = (await res.json().catch(() => ({ error: "error_desconocido" }))) as RrhhApiError;
    return { ok: false, error };
  }
  const data = (await res.json()) as { colaborador: ColaboradorDTO };
  return { ok: true, colaborador: data.colaborador };
}
