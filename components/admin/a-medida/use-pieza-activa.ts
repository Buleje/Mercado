"use client";

/**
 * La pieza abierta dentro de «A medida», direccionable por `?pieza=<id>`.
 *
 * No usa `useVistaModulo` porque ése exige una lista fija de vistas y acá la
 * lista depende de qué piezas tenga prendidas el negocio. Mismo trato que
 * aquél: la URL manda, el cambio va al historial y `navigateTab` limpia el
 * parámetro al salir (está en `PARAMS_DE_VISTA`).
 */
import { useCallback, useEffect, useState } from "react";

const PARAM = "pieza";

function leerDeLaUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(PARAM);
}

export function usePiezaActiva(ids: readonly string[]): { activa: string | null; irA: (id: string) => void } {
  const [pedida, setPedida] = useState<string | null>(leerDeLaUrl);

  useEffect(() => {
    const alVolver = () => setPedida(leerDeLaUrl());
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, []);

  const irA = useCallback((id: string) => {
    setPedida(id);
    const url = new URL(window.location.href);
    url.searchParams.set(PARAM, id);
    window.history.pushState(window.history.state, "", url);
  }, []);

  // Una pieza que ya no está (la apagaron, el link es viejo) cae en la primera.
  const activa = pedida && ids.includes(pedida) ? pedida : (ids[0] ?? null);
  return { activa, irA };
}
