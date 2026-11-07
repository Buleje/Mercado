"use client";

/**
 * Referidas «Trae a una amiga» en Crecimiento › Puntos (`/api/admin/referidas`):
 * las reglas del negocio y quién trajo a quién. Los premios los emite el
 * servidor (`ReferralsDB`); acá sólo se muestran.
 */
import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { ConfigReferidas, ResumenReferidas } from "@/lib/referidas/reglas";

const URL = "/api/admin/referidas";
const JSON_CSRF = () => csrfHeaders({ "Content-Type": "application/json" });

async function errorDe(r: Response | null, porDefecto: string): Promise<string> {
  const d = (await r?.json().catch(() => null)) as { error?: string; issues?: string[] } | null;
  return d?.issues?.[0] ?? d?.error ?? porDefecto;
}

export function useReferidas() {
  const [resumen, setResumen] = useState<ResumenReferidas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const r = await fetch(URL).catch(() => null);
    if (r?.ok) {
      setResumen((await r.json()) as ResumenReferidas);
      setError(null);
    } else setError(await errorDe(r, "No se pudo cargar"));
    setCargando(false);
  }, []);

  const guardar = async (config: ConfigReferidas): Promise<string | null> => {
    const r = await fetch(URL, { method: "PUT", headers: JSON_CSRF(), body: JSON.stringify(config) }).catch(() => null);
    if (!r?.ok) return errorDe(r, "No se pudo guardar");
    await cargar();
    return null;
  };

  /** «A esta clienta la trajo…»: `de` es el celular o el código de quien la recomendó. */
  const anotar = async (amiga: string, de: string): Promise<{ error: string | null; mensaje?: string }> => {
    const esCodigo = /[a-z]/i.test(de);
    const cuerpo = esCodigo ? { amiga, codigo: de.trim().toUpperCase() } : { amiga, quienRefiere: de };
    const r = await fetch(URL, { method: "POST", headers: JSON_CSRF(), body: JSON.stringify(cuerpo) }).catch(() => null);
    if (!r?.ok) return { error: await errorDe(r, "No se pudo anotar") };
    const d = (await r.json().catch(() => null)) as { mensaje?: string } | null;
    await cargar();
    return { error: null, mensaje: d?.mensaje };
  };

  const quitar = async (amiga: string): Promise<string | null> => {
    const r = await fetch(`${URL}?amiga=${encodeURIComponent(amiga)}`, { method: "DELETE", headers: csrfHeaders() }).catch(() => null);
    if (!r?.ok) return errorDe(r, "No se pudo quitar");
    await cargar();
    return null;
  };

  return { resumen, cargando, error, cargar, guardar, anotar, quitar };
}

export type Referidas = ReturnType<typeof useReferidas>;
