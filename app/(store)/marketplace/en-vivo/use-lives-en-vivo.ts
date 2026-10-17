"use client";

/**
 * Lives REALES de /api/lives/active (en vivo + próximas + pasadas), con
 * refresco cada 30 s. Sin transmisiones = listas vacías: nunca se rellena con
 * el mock (09-10: live_sessions tenía 0 filas y la página mostraba lives falsos).
 *
 * La API responde `{ data: { active, upcoming, past } }`; `fetchActiveLives`
 * de lib/lives/client.ts leía `active` en la raíz y por eso SIEMPRE caía al mock.
 */

import { useEffect, useState } from "react";
import { toUiLive } from "@/lib/lives/client";
import type { LiveSession } from "@/lib/mocks/lives.mock";

type Crudo = Record<string, unknown>;
interface Respuesta {
  data?: { active?: Crudo[]; upcoming?: Crudo[]; past?: Crudo[] };
  active?: Crudo[];
  upcoming?: Crudo[];
  past?: Crudo[];
}

export interface LivesEnVivo {
  cargando: boolean;
  error: boolean;
  enVivo: LiveSession[];
  proximas: LiveSession[];
  pasadas: LiveSession[];
  /** Horas hasta la próxima programada (calculado al cargar, no en el render). */
  proximaEnHoras?: number;
}

const VACIO: LivesEnVivo = { cargando: true, error: false, enVivo: [], proximas: [], pasadas: [] };

export function useLivesEnVivo(): LivesEnVivo {
  const [estado, setEstado] = useState<LivesEnVivo>(VACIO);

  useEffect(() => {
    let cancelado = false;
    const cargar = async () => {
      try {
        const res = await fetch("/api/lives/active?includeUpcoming=true&includePast=true", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Respuesta;
        const fuente = json.data ?? json;
        if (cancelado) return;
        const proximas = (fuente.upcoming ?? []).map((x) => toUiLive(x));
        const msProxima = proximas[0] ? new Date(proximas[0].startsAt).getTime() - Date.now() : NaN;
        setEstado({
          cargando: false,
          error: false,
          enVivo: (fuente.active ?? []).map((x) => toUiLive(x)),
          proximas,
          pasadas: (fuente.past ?? []).map((x) => toUiLive(x)),
          proximaEnHoras: Number.isFinite(msProxima)
            ? Math.max(1, Math.round(msProxima / 3_600_000))
            : undefined,
        });
      } catch {
        // Se conserva lo último que llegó; solo se marca el error para avisarlo.
        if (!cancelado) setEstado((prev) => ({ ...prev, cargando: false, error: true }));
      }
    };
    void cargar();
    const id = setInterval(() => void cargar(), 30_000);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, []);

  return estado;
}
