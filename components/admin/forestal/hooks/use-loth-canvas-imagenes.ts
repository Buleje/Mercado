"use client";

/**
 * useLothCanvasImagenes — las imágenes RECIENTES sobre el mapa del Libro TH:
 *
 *   · **Sentinel-2** como base (una capa por cuadro de la escena, cada una
 *     limitada a su recuadro: fuera de él Planetary Computer responde 404 y
 *     ensuciaría la consola). Al cambiar de fecha, la escena nueva se pinta
 *     ENCIMA de la vieja y la vieja se quita cuando la nueva terminó de
 *     cargar: no hay un instante de fondo gris ni se toca el resto del mapa.
 *   · **Otra escena bajo la cortina** (comparar dos fechas): va al pane
 *     `wayback`, el mismo que recorta la cortina del comparador EUDR.
 *   · **Nubes y humo de hoy** (VIIRS color real) y **focos de calor**
 *     (WMS de GIBS, los tres satélites en un pedido), encima de la base y
 *     debajo de los árboles, las rutas y los polígonos.
 */

import { useEffect, useRef } from "react";
import { ATRIBUCION_GIBS, ATRIBUCION_S2, CAPAS_FOCOS, GIBS_COLOR_REAL_MAX_ZOOM, GIBS_COLOR_REAL_VISIBLE_HASTA, GIBS_WMS, S2_MAX_NATIVE_ZOOM, urlTeselasS2 } from "@/lib/forestal/loth-imagenes";
import type { EscenaEnMapa, LeafletCtx, LothMapaCanvasProps } from "../loth-mapa-canvas-ctx";

/* Leaflet llega dinámico y sin tipos (igual que en el resto del canvas). */
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Orden dentro del pane de teselas: la base abajo, lo de hoy encima. */
const Z_COLOR_REAL = 20;
const Z_FOCOS = 30;
/** Si la escena nueva no terminó de cargar en esto, la vieja se quita igual. */
const ESPERA_CAMBIO_MS = 6_000;

function capasDeEscena(L: any, e: EscenaEnMapa, extra: Record<string, unknown>): any[] {
  return e.items.map((it) =>
    L.tileLayer(urlTeselasS2(it.id), {
      bounds: L.latLngBounds([it.bbox[1], it.bbox[0]], [it.bbox[3], it.bbox[2]]),
      maxZoom: 22,
      maxNativeZoom: S2_MAX_NATIVE_ZOOM,
      attribution: ATRIBUCION_S2,
      ...extra,
    }),
  );
}

function quitar(map: any, capas: any[]): void {
  for (const c of capas) {
    try {
      map.removeLayer(c);
    } catch {
      /* el mapa ya no existe: sus capas se fueron con él */
    }
  }
}

export function useLothCanvasImagenes(ctx: LeafletCtx, p: LothMapaCanvasProps): void {
  const { ready, mapRef, LRef } = ctx;
  const { basemap, s2, s2Comparar, vivas } = p;
  const baseRef = useRef<any[]>([]);
  const compRef = useRef<any[]>([]);
  const colorRef = useRef<any>(null);
  const focosRef = useRef<any[]>([]);

  // ── Sentinel-2 como base ───────────────────────────────────────────────────
  const escenaBase = basemap === "s2" ? s2 : null;
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const viejas = baseRef.current;
    if (!escenaBase) {
      quitar(map, viejas);
      baseRef.current = [];
      return;
    }
    const nuevas = capasDeEscena(L, escenaBase, {});
    baseRef.current = nuevas;
    let pendientes = nuevas.length;
    let hecho = false;
    const soltarViejas = () => {
      if (hecho) return;
      hecho = true;
      quitar(map, viejas);
    };
    for (const c of nuevas) {
      c.once("load", () => {
        pendientes -= 1;
        if (pendientes <= 0) soltarViejas();
      });
      c.addTo(map);
      c.bringToBack();
    }
    // La vieja queda DEBAJO mientras carga la nueva.
    for (const v of viejas) v.bringToBack?.();
    const t = window.setTimeout(soltarViejas, ESPERA_CAMBIO_MS);
    // Otro cambio antes de que termine éste: la vieja se va ya (si no, quedaría
    // colgada debajo si la nueva se quita antes de disparar «load»).
    return () => {
      window.clearTimeout(t);
      soltarViejas();
    };
  }, [ready, escenaBase, LRef, mapRef]);

  // (Al desmontar no hace falta quitar nada: `LothMapaCanvas` hace `map.remove()` y las capas se van con el mapa.)

  // ── Otra fecha bajo la cortina ─────────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    quitar(map, compRef.current);
    compRef.current = [];
    if (!s2Comparar) return;
    compRef.current = capasDeEscena(L, s2Comparar, { pane: "wayback" });
    for (const c of compRef.current) c.addTo(map);
  }, [ready, s2Comparar, LRef, mapRef]);

  // ── Nubes y humo de hoy ────────────────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    if (colorRef.current) quitar(map, [colorRef.current]);
    colorRef.current = null;
    if (!vivas.colorReal) return;
    colorRef.current = L.tileLayer(vivas.colorReal, {
      // Más cerca, un píxel de 375 m tapa todo el área: no se dibuja (ver GIBS_COLOR_REAL_VISIBLE_HASTA).
      maxZoom: GIBS_COLOR_REAL_VISIBLE_HASTA,
      maxNativeZoom: GIBS_COLOR_REAL_MAX_ZOOM,
      opacity: 0.85,
      zIndex: Z_COLOR_REAL,
      attribution: ATRIBUCION_GIBS,
    }).addTo(map);
  }, [ready, vivas.colorReal, LRef, mapRef]);

  // ── Focos de calor (ayer + hoy) ────────────────────────────────────────────
  const focosClave = vivas.focos.join(",");
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    quitar(map, focosRef.current);
    focosRef.current = [];
    if (!focosClave) return;
    focosRef.current = focosClave.split(",").map((fecha) =>
      L.tileLayer
        .wms(GIBS_WMS, {
          layers: CAPAS_FOCOS.join(","),
          format: "image/png",
          transparent: true,
          version: "1.3.0",
          time: fecha,
          maxZoom: 22,
          zIndex: Z_FOCOS,
          attribution: ATRIBUCION_GIBS,
        })
        .addTo(map),
    );
  }, [ready, focosClave, LRef, mapRef]);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
