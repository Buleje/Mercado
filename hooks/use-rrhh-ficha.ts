"use client";

/**
 * use-rrhh-ficha — la ficha de UNA persona (ADR-414 §6/§7, `FichaColaboradorModal`).
 *
 * Todas las acciones (`PATCH .../colaboradores/[id]`) devuelven el error del
 * servidor tal cual — el modal decide cómo mostrarlo (409 con el nombre de la
 * persona duplicada, 403 `requiere_admin`, etc.) en vez de un mensaje genérico
 * acá. Toda acción exitosa recarga la ficha: la cabecera sale de la lectura
 * fresca, nunca de un prop viejo (lección liquidar, ADR-413).
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { FichaColaboradorDTO, FechaKey, Modalidad, TarifaDTO } from "@/lib/rrhh/tipos";
import type { RrhhApiError } from "./use-rrhh-puestos";
import { sinDato } from "@/lib/errores/sin-dato";

export type AccionColaborador =
  | { action: "editar"; [campo: string]: unknown }
  | { action: "cambiar_estado"; estado: "ACTIVO" | "VACACIONES" | "LICENCIA" | "SUSPENDIDO"; sinPagoDesde?: FechaKey }
  | { action: "cesar"; fechaCese: FechaKey; motivo: string; confirmar?: boolean }
  | { action: "reingresar"; fecha: FechaKey; tarifa?: { modalidad: Modalidad; monto: number } | null }
  | { action: "vincular_beneficiario"; beneficiarioId: string | null }
  | { action: "vincular_usuario"; adminUserId: string | null }
  | { action: "restaurar" };

type Resultado = { ok: true } | { ok: false; error: RrhhApiError };

async function leerError(res: Response): Promise<RrhhApiError> {
  try {
    return (await res.json()) as RrhhApiError;
  } catch {
    return { error: "error_desconocido" };
  }
}

export interface UseRrhhFichaResult {
  ficha: FichaColaboradorDTO | null;
  loading: boolean;
  error: string | null;
  guardando: boolean;
  recargar: () => void;
  accion: (a: AccionColaborador) => Promise<Resultado>;
  eliminar: () => Promise<Resultado>;
  guardarTarifa: (input: { modalidad: Modalidad; monto: number; horasJornada?: number; vigenteDesde: FechaKey; motivo?: string }) => Promise<{ ok: true; tarifas: TarifaDTO[] } | { ok: false; error: RrhhApiError }>;
  quitarTarifa: (tarifaId: string) => Promise<{ ok: true; tarifas: TarifaDTO[] } | { ok: false; error: RrhhApiError }>;
}

export function useRrhhFicha(colaboradorId: string | null): UseRrhhFichaResult {
  const [ficha, setFicha] = useState<FichaColaboradorDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!colaboradorId) {
      setFicha(null);
      setLoading(false);
      return;
    }
    let vigente = true;
    setLoading(true);
    setError(null);
    fetch(`/api/rrhh/colaboradores/${colaboradorId}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "No se encontró a la persona" : "No se pudo cargar la ficha");
        return r.json() as Promise<FichaColaboradorDTO>;
      })
      .then((data) => {
        if (vigente) setFicha(data);
      })
      .catch((err) => {
        sinDato("RRHH ficha")(err);
        if (vigente) setError(err instanceof Error ? err.message : "No se pudo cargar la ficha");
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [colaboradorId, tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);

  const accion = useCallback(async (a: AccionColaborador): Promise<Resultado> => {
    if (!colaboradorId) return { ok: false, error: { error: "sin_colaborador" } };
    setGuardando(true);
    try {
      const res = await fetch(`/api/rrhh/colaboradores/${colaboradorId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(a),
        credentials: "include",
      });
      if (!res.ok) return { ok: false, error: await leerError(res) };
      recargar();
      return { ok: true };
    } finally {
      setGuardando(false);
    }
  }, [colaboradorId, recargar]);

  const eliminar = useCallback(async (): Promise<Resultado> => {
    if (!colaboradorId) return { ok: false, error: { error: "sin_colaborador" } };
    setGuardando(true);
    try {
      const res = await fetch(`/api/rrhh/colaboradores/${colaboradorId}`, {
        method: "DELETE",
        headers: csrfHeaders(),
        credentials: "include",
      });
      if (!res.ok) return { ok: false, error: await leerError(res) };
      return { ok: true };
    } finally {
      setGuardando(false);
    }
  }, [colaboradorId]);

  const guardarTarifa = useCallback(async (input: { modalidad: Modalidad; monto: number; horasJornada?: number; vigenteDesde: FechaKey; motivo?: string }) => {
    if (!colaboradorId) return { ok: false as const, error: { error: "sin_colaborador" } };
    setGuardando(true);
    try {
      const res = await fetch(`/api/rrhh/colaboradores/${colaboradorId}/tarifas`, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) return { ok: false as const, error: await leerError(res) };
      const data = (await res.json()) as { tarifas: TarifaDTO[] };
      recargar();
      return { ok: true as const, tarifas: data.tarifas };
    } finally {
      setGuardando(false);
    }
  }, [colaboradorId, recargar]);

  const quitarTarifa = useCallback(async (tarifaId: string) => {
    if (!colaboradorId) return { ok: false as const, error: { error: "sin_colaborador" } };
    setGuardando(true);
    try {
      const res = await fetch(`/api/rrhh/colaboradores/${colaboradorId}/tarifas?tarifaId=${tarifaId}`, {
        method: "DELETE",
        headers: csrfHeaders(),
        credentials: "include",
      });
      if (!res.ok) return { ok: false as const, error: await leerError(res) };
      const data = (await res.json()) as { tarifas: TarifaDTO[] };
      recargar();
      return { ok: true as const, tarifas: data.tarifas };
    } finally {
      setGuardando(false);
    }
  }, [colaboradorId, recargar]);

  return { ficha, loading, error, guardando, recargar, accion, eliminar, guardarTarifa, quitarTarifa };
}
