"use client";

/**
 * useLothMapaFoco — llegar al árbol, no al mapa entero. Salió de
 * `LothMapaView` tal cual (29-09), cuando entró el bloque «Rutas y puntos».
 */

import { useEffect, useRef } from "react";
import type { CensoTree, GeoEntry } from "../loth-mapa-shared";

interface Deps {
  focusTree: string | null | undefined;
  onFocusHandled?: () => void;
  /** Las operaciones del libro (null = todavía no se leyeron). */
  raw: unknown[] | null;
  cargando: boolean;
  geoAll: GeoEntry[];
  censoAll: CensoTree[];
  centrar: (p: [number, number]) => void;
  elegir: (id: string | null) => void;
}

export function useLothMapaFoco({ focusTree, onFocusHandled, raw, cargando, geoAll, censoAll, centrar, elegir }: Deps): void {
  // Llegar al árbol, no al mapa entero: desde «Por árbol» se entra acá con un
  // código y el mapa se posiciona sobre él. Si el árbol no tiene coordenada, el
  // foco se consume igual — si no, quedaría pegado esperando para siempre.
  // El censo llega en cascada DESPUÉS de las operaciones (`raw`): con sólo
  // `raw`, el foco se consumía con el censo vacío y el mapa quedaba en el
  // encuadre general (medido 29-09 con «Ver en el mapa del bosque», ADR-450).
  // Se espera la carga entera, y el centrado va un instante después del
  // encuadre de la parcela, que si no lo pisaba.
  /* El centrado diferido NO se cancela cuando el foco se consume (el padre lo
     pone en null y el efecto se re-ejecuta): sólo al desmontar. */
  const centrarLuego = useRef<number | null>(null);
  useEffect(() => () => {
    if (centrarLuego.current != null) window.clearTimeout(centrarLuego.current);
  }, []);
  useEffect(() => {
    if (!focusTree || raw == null || cargando) return;
    const punto = geoAll.find((g) => g.code === focusTree || g.code.startsWith(`${focusTree}-`));
    const censado = punto ? undefined : censoAll.find((t) => t.code === focusTree);
    const destino: [number, number] | null = punto ? [punto.lat, punto.lng] : censado ? [censado.lat, censado.lng] : null;
    // Y su ficha abierta: se llegó acá preguntando por ESE árbol.
    if (censado) elegir(censado.id);
    onFocusHandled?.();
    if (!destino) return;
    if (centrarLuego.current != null) window.clearTimeout(centrarLuego.current);
    centrarLuego.current = window.setTimeout(() => centrar(destino), 400);
  }, [focusTree, raw, cargando, geoAll, censoAll, centrar, elegir, onFocusHandled]);
}
