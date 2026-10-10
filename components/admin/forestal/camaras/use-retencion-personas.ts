"use client";

/**
 * useRetencionPersonas — cuántos días se guardan las fotos del detector de
 * personas (`/api/admin/camaras/personas/retencion`). Lo tipeado vive en el
 * componente hasta «Guardar»; acá sólo el valor guardado y el pedido.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

const API = "/api/admin/camaras/personas/retencion";

export interface Retencion {
  dias: number;
  porDefecto: number;
  min: number;
  max: number;
  puedeEditar: boolean;
}

export function useRetencionPersonas() {
  const [retencion, setRetencion] = useState<Retencion | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch(API, { credentials: "include" });
        const j = (await r.json().catch(() => null)) as (Retencion & { ok?: boolean }) | null;
        if (vivo && r.ok && j?.ok) setRetencion(j);
      } catch {
        /* sin el dato, la sección simplemente no se muestra */
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  /** `true` si quedó guardado. */
  const guardar = useCallback(async (dias: number): Promise<boolean> => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(API, {
        method: "PUT",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ dias }),
      });
      const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!r.ok) throw new Error(j.message ?? `El servidor respondió ${r.status}`);
      setRetencion((prev) => (prev ? { ...prev, dias } : prev));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setGuardando(false);
    }
  }, []);

  return { retencion, guardando, error, guardar };
}
