"use client";

/**
 * useRetencionPersonas — cuántos días se guardan las fotos del detector de
 * personas (`/api/admin/camaras/personas/retencion`). Lo tipeado vive en el
 * componente hasta «Guardar»; acá sólo el valor guardado y el pedido.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { cachedJson, cachedJsonVigente } from "@/lib/client-cache-fetch";

const API = "/api/admin/camaras/personas/retencion";
/** Cambia sólo con «Guardar» (el PUT borra lo cacheado de /api/admin/camaras). */
const FRESCO_MS = 5 * 60_000;

export interface Retencion {
  dias: number;
  porDefecto: number;
  min: number;
  max: number;
  puedeEditar: boolean;
}

type RespuestaRetencion = Retencion & { ok?: boolean };

/**
 * `activo = false` no pide nada (22-10: la línea de fotos escondidas del Archivo
 * lo pedía al abrir aunque no hubiera fotos de personas que mostrar).
 */
export function useRetencionPersonas(activo = true) {
  const [retencion, setRetencion] = useState<Retencion | null>(() => {
    const j = cachedJsonVigente<RespuestaRetencion | null>(API, FRESCO_MS);
    return j?.ok ? j : null;
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    // null = falló o no fue 2xx: sin el dato, la sección simplemente no se muestra.
    void cachedJson<RespuestaRetencion>(API, FRESCO_MS).then((j) => {
      if (vivo && j?.ok) setRetencion(j);
    });
    return () => {
      vivo = false;
    };
  }, [activo]);

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
