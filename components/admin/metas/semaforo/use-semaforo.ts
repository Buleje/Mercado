"use client";

/**
 * use-semaforo — GET/PUT de `/api/admin/semaforo` (ADR-508).
 *
 * Mientras recarga se queda con el dato que tenía (no parpadea a vacío) y una
 * respuesta vieja nunca pisa a una nueva. Un 403 (cajero, almacenero, analista)
 * queda en `sinPermiso` y deja de pedir (reintentar nunca lo arregla).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { SemaforoDTO } from "@/lib/db/semaforo.db";
import type { ConfigSemaforoGuardada } from "@/lib/semaforo/config";
import type { PeriodoId } from "@/lib/semaforo/evaluar";

export type RespuestaSemaforo = SemaforoDTO & { periodo: PeriodoId; config: ConfigSemaforoGuardada };

async function mensajeDeError(res: Response): Promise<string> {
  try {
    const cuerpo = (await res.json()) as { error?: unknown };
    if (typeof cuerpo.error === "string" && cuerpo.error) return cuerpo.error;
  } catch {
    // Sin cuerpo JSON: vale el genérico.
  }
  return res.status === 401 ? "Tu sesión venció. Vuelve a entrar." : "No se pudo medir. Reintenta en un rato.";
}

export function useSemaforo(periodo: PeriodoId) {
  const [datos, setDatos] = useState<RespuestaSemaforo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const vetado = useRef(false);
  const ctrlRef = useRef<AbortController | null>(null);

  const pedir = useCallback(
    async (fresco = false) => {
      if (vetado.current) return;
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setCargando(true);
      try {
        const res = await fetch(`/api/admin/semaforo?periodo=${periodo}${fresco ? "&fresco=1" : ""}`, {
          credentials: "include",
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (res.status === 403) {
          vetado.current = true;
          setSinPermiso(true);
          setError(null);
          return;
        }
        if (!res.ok) throw new Error(await mensajeDeError(res));
        const json = (await res.json()) as RespuestaSemaforo;
        if (ctrl.signal.aborted) return;
        setDatos(json);
        setError(null);
      } catch (e) {
        if (ctrl.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "No se pudo medir.");
      } finally {
        if (ctrlRef.current === ctrl) setCargando(false);
      }
    },
    [periodo],
  );

  useEffect(() => {
    void pedir();
    return () => ctrlRef.current?.abort();
  }, [pedir]);

  /** Guarda un cambio de config y vuelve a medir. Devuelve el error (o null). */
  const guardar = useCallback(
    async (cambio: ConfigSemaforoGuardada): Promise<string | null> => {
      try {
        const res = await fetch("/api/admin/semaforo", {
          method: "PUT",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(cambio),
        });
        if (!res.ok) return await mensajeDeError(res);
        await pedir(true);
        return null;
      } catch {
        return "No se pudo guardar. Revisa tu conexión.";
      }
    },
    [pedir],
  );

  return { datos, cargando, error, sinPermiso, recargar: pedir, guardar };
}
