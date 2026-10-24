"use client";

/**
 * Las pantallas vinculadas (Modo TV) desde el panel: la lista, vincular un TV
 * con su código y desconectarlo. Contrato: `TV_RUTAS.pantallasAdmin`
 * (`lib/camaras/pantallas-tv.ts`), sólo admin/owner.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { TV_RUTAS, type PantallaTv, type VincularPantallaInput } from "@/lib/camaras/pantallas-tv";

const mensajeDe = (j: unknown, status: number): string => {
  const o = (j ?? {}) as { error?: unknown; message?: unknown };
  const m = typeof o.message === "string" && o.message ? o.message : typeof o.error === "string" ? o.error : null;
  if (m) return m;
  if (status === 401 || status === 403) return "Sólo el dueño o un administrador puede vincular pantallas.";
  if (status === 404) return "Ese código no existe o ya venció. Mira el que muestra el televisor ahora.";
  return `El servidor respondió ${status}. Prueba de nuevo.`;
};

const leerJson = (r: Response): Promise<unknown> =>
  r.json().catch((err: unknown) => {
    logger.info("[camaras.tv] respuesta sin JSON", { error: String(err) });
    return null;
  });

export function usePantallasTv() {
  const [pantallas, setPantallas] = useState<PantallaTv[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch(TV_RUTAS.pantallasAdmin, { credentials: "include", cache: "no-store" });
      const j = await leerJson(r);
      if (!r.ok) throw new Error(mensajeDe(j, r.status));
      /* Lista pelada o `{ pantallas }`: las dos formas valen. */
      const lista = Array.isArray(j) ? j : (j as { pantallas?: unknown } | null)?.pantallas;
      setPantallas(Array.isArray(lista) ? (lista as PantallaTv[]) : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** `true` = quedó vinculada. */
  const vincular = useCallback(
    async (input: VincularPantallaInput): Promise<boolean> => {
      setGuardando(true);
      setError(null);
      try {
        const r = await fetch(TV_RUTAS.pantallasAdmin, {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(input),
        });
        const j = await leerJson(r);
        if (!r.ok) throw new Error(mensajeDe(j, r.status));
        await cargar();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setGuardando(false);
      }
    },
    [cargar],
  );

  const desconectar = useCallback(
    async (id: string) => {
      setGuardando(true);
      setError(null);
      try {
        const r = await fetch(`${TV_RUTAS.pantallasAdmin}?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "include",
          headers: csrfHeaders(),
        });
        if (!r.ok) throw new Error(mensajeDe(await leerJson(r), r.status));
        setPantallas((p) => p.filter((x) => x.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setGuardando(false);
      }
    },
    [],
  );

  return { pantallas, cargando, guardando, error, vincular, desconectar, recargar: cargar };
}

export type PantallasTv = ReturnType<typeof usePantallasTv>;
