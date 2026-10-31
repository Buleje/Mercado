"use client";

/**
 * El reparto por bloque o zona de las especies de un plan (Brandon 24-10):
 * lo lee la pestaña «Registro y saldo» y lo guarda su editor. Es un detalle del
 * registro —el saldo sigue en las especies del plan—: si la lectura falla, la
 * pestaña sigue andando y sólo dice que no pudo leerlo.
 * Ruta: `app/api/admin/forestal/plan/bloques/route.ts`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { BloqueDelPlan } from "@/lib/forestal/loth-plan-bloques";

const API = "/api/admin/forestal/plan/bloques";

interface Leido {
  planId: string;
  bloques: BloqueDelPlan[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export type ResultadoReparto = { ok: true; cambio: boolean } | { ok: false; error: string };

export function usePlanBloques(planId: string | null) {
  const [leido, setLeido] = useState<Leido | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* La lectura de un plan anterior que llega tarde no pisa la del actual. */
  const turno = useRef(0);

  const recargar = useCallback(async () => {
    if (!planId) return;
    const mio = ++turno.current;
    setCargando(true);
    try {
      const r = await fetch(`${API}?planId=${encodeURIComponent(planId)}`, { credentials: "include" });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as Partial<Leido>;
      if (mio !== turno.current) return;
      setLeido({ planId, bloques: j.bloques ?? [], updatedAt: j.updatedAt ?? null, updatedBy: j.updatedBy ?? null });
      setError(null);
    } catch {
      if (mio === turno.current) setError("No se pudo leer el reparto por bloques.");
    } finally {
      if (mio === turno.current) setCargando(false);
    }
  }, [planId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** Guarda el reparto entero (`[]` lo quita) y relee. */
  const guardar = useCallback(
    async (bloques: BloqueDelPlan[]): Promise<ResultadoReparto> => {
      if (!planId) return { ok: false, error: "Elige un plan primero." };
      try {
        const r = await fetch(API, {
          method: "PUT",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ planId, bloques }),
        });
        const j = (await r.json().catch(() => ({}))) as { message?: unknown; cambio?: unknown };
        if (!r.ok) {
          if (r.status === 403) return { ok: false, error: "Sólo el administrador o el dueño pueden cambiar el reparto por bloques." };
          return { ok: false, error: typeof j.message === "string" ? j.message : "No se pudo guardar el reparto por bloques." };
        }
        await recargar();
        return { ok: true, cambio: j.cambio === true };
      } catch {
        return { ok: false, error: "No se pudo guardar el reparto por bloques: revisa tu conexión." };
      }
    },
    [planId, recargar],
  );

  const delPlan = leido?.planId === planId ? leido : null;
  return { bloques: delPlan?.bloques ?? [], updatedAt: delPlan?.updatedAt ?? null, leido: delPlan != null, cargando, error, recargar, guardar };
}
