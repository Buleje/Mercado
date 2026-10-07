"use client";

/**
 * De dónde piden los visores (Modo TV, 2026-10-07).
 *
 * Los visores (`VisorEnVivo`, `VisorNube`, `VisorPuentePc`, el mosaico) piden
 * a `/api/admin/camaras/**` con la sesión del panel. El televisor no tiene esa
 * sesión: pide a `/api/tv/camaras/**`, que es espejo exacto (misma forma de
 * respuesta) autenticado por la cookie `buleje-tv` (`lib/camaras/pantallas-tv.ts`).
 *
 * La base llega por contexto (el TV envuelve todo en `ApiCamarasProvider`) o
 * por prop `baseApi` en cada visor; sin ninguno de los dos, el panel de siempre.
 * Con la base del TV, `soloMirar`: sin mover, micrófono, grabar ni renombrar.
 */

import { createContext, useContext, type ReactNode } from "react";
import { TV_API_ADMIN, TV_API_TV } from "@/lib/camaras/pantallas-tv";

export interface ApiCamaras {
  base: string;
  /** Sólo mirar: sin controles que escriben (el Modo TV). */
  soloMirar: boolean;
}

const Ctx = createContext<ApiCamaras>({ base: TV_API_ADMIN, soloMirar: false });

export function ApiCamarasProvider({ base, children }: { base: string; children: ReactNode }) {
  return <Ctx.Provider value={{ base, soloMirar: base === TV_API_TV }}>{children}</Ctx.Provider>;
}

/** La prop `baseApi` del visor manda; si no, la del contexto. */
export function useApiCamaras(baseApi?: string): ApiCamaras {
  const ctx = useContext(Ctx);
  if (!baseApi) return ctx;
  return { base: baseApi, soloMirar: baseApi === TV_API_TV || ctx.soloMirar };
}

/** `${base}/${id}/${tramo}` con el id escapado. */
export function urlCamara(base: string, camaraId: string, tramo: string): string {
  return `${base}/${encodeURIComponent(camaraId)}/${tramo}`;
}
