"use client";

import { useEffect } from "react";

/**
 * Lee `?filter=` UNA vez al montar, se lo pasa a `aplicar` y lo saca de la URL.
 *
 * Los avisos de Inicio llevan a `/admin?tab=x&filter=y` («3 productos en su
 * mínimo» → Inventario con «Bajo stock» puesto). Antes ningún destino leía el
 * parámetro y el clic caía en la vista genérica.
 *
 * Se saca de la URL después de aplicarlo: si el usuario quita el filtro y
 * recarga, no vuelve un filtro que ya sacó. En dev (StrictMode) el efecto corre
 * dos veces: la segunda ya no encuentra el parámetro y no hace nada.
 */
export function useFiltroDeUrl(aplicar: (valor: string) => void): void {
  useEffect(() => {
    const url = new URL(window.location.href);
    const valor = url.searchParams.get("filter");
    if (!valor) return;
    aplicar(valor);
    url.searchParams.delete("filter");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    // Sólo al montar: es la entrada desde un enlace, no un filtro vivo.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
