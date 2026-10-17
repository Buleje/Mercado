"use client";

/**
 * useLothCanvasVias — las VÍAS del plano (trochas, caminos, ríos) y la traza
 * en curso. Salió de `use-loth-canvas-trazos` el 29-09, cuando las rutas
 * pasaron a mostrarse solas y a abrir su ficha.
 *
 * Por qué un pane propio (medido 29-09 con la cartografía de Blas): las 15
 * trochas se dibujaban, pero en el encuadre inicial (zoom 15, 1:17 800) los 65
 * árboles las tapaban casi enteras —una trocha va justamente de árbol en
 * árbol— y sólo se veían al acercarse dos niveles. La línea de color va ENCIMA
 * de los árboles mientras el mapa está lejos (sin etiquetas), y DEBAJO desde
 * el zoom de las etiquetas: ahí los árboles ya se separan y la línea cruzaría
 * los rótulos.
 *
 * El toque lo recibe una línea ancha y transparente DEBAJO de los árboles:
 * tocar un árbol sigue abriendo el árbol; tocar la ruta, su ficha. La elegida
 * lleva un halo turquesa, sus vértices numerados y dónde empieza y termina.
 */

import { useEffect } from "react";
import { viaMeta } from "@/lib/forestal/loth-cartografia";
import { lineLengthM } from "@/lib/forestal/loth-utm";
import { textoDistancia } from "@/lib/forestal/loth-mapa-arboles";
import { claveDeRuta } from "@/lib/forestal/loth-rutas-coordenadas";
import { ZOOM_ETIQUETAS } from "../loth-mapa-etiquetas";
import type { LeafletCtx, LothMapaCanvasProps } from "../loth-mapa-canvas-ctx";

/** Pane de las líneas de color de las vías. */
export const PANE_VIAS = "loth-vias";
/** markerPane = 600: encima de los árboles. */
const Z_ENCIMA = "610";
/** overlayPane = 400: encima de los polígonos, debajo de los árboles. */
const Z_DEBAJO = "450";
/** Hasta acá los vértices de la ruta elegida llevan su número fijo; más, al pasar el mouse. */
const MAX_NUMEROS_FIJOS = 30;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Las refs de Leaflet van en las dependencias aunque no cambian nunca. */
export function useLothCanvasVias(ctx: LeafletCtx, p: LothMapaCanvasProps): void {
  const { ready, mapRef, LRef, viasRef } = ctx;
  const { vias, viaDraft, rutaElegida, onRutaElegida, etiquetas, drawMode, markMode, medicion } = p;
  /** Una herramienta usa el clic del mapa: la ruta no lo toma. */
  const capturando = drawMode || markMode || viaDraft !== null || medicion !== null;

  // El pane: encima de los árboles de lejos, debajo de cerca (o siempre encima si no hay etiquetas).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const pane: HTMLElement = map.getPane(PANE_VIAS) ?? map.createPane(PANE_VIAS);
    const ubicar = () => {
      pane.style.zIndex = etiquetas === "ninguna" || map.getZoom() < ZOOM_ETIQUETAS ? Z_ENCIMA : Z_DEBAJO;
    };
    ubicar();
    map.on("zoomend", ubicar);
    return () => {
      map.off("zoomend", ubicar);
    };
  }, [ready, etiquetas, mapRef]);

  // ── Vías del plano + traza en curso ────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const group = viasRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    const elegidaId = rutaElegida?.startsWith("via:") ? rutaElegida.slice(4) : null;
    for (const v of vias) {
      const meta = viaMeta(v.tipo);
      const elegida = v.id === elegidaId;
      // Casing blanco debajo: una línea fina sobre el satélite no se lee.
      L.polyline(v.puntos, { color: "#fff", weight: elegida ? 9 : 6, opacity: 0.55, interactive: false }).addTo(group);
      if (!capturando) {
        L.polyline(v.puntos, { color: "#000", weight: 18, opacity: 0, bubblingMouseEvents: false })
          .bindTooltip(`${esc(v.nombre)} · ${meta.label} · ${textoDistancia(lineLengthM(v.puntos))}`, { sticky: true })
          .on("click", () => onRutaElegida(claveDeRuta(v.id)))
          .addTo(group);
      }
      if (elegida) {
        L.polyline(v.puntos, { pane: PANE_VIAS, className: "stroke-[var(--accent)]", weight: 14, opacity: 0.4, lineCap: "round", interactive: false }).addTo(group);
      }
      L.polyline(v.puntos, {
        pane: PANE_VIAS,
        color: meta.color,
        weight: elegida ? 5 : 3.5,
        opacity: 0.95,
        dashArray: meta.dash || undefined,
        interactive: false,
      }).addTo(group);
    }

    // La elegida: sus vértices numerados, y dónde empieza y dónde termina.
    const v = elegidaId ? vias.find((x) => x.id === elegidaId) : undefined;
    if (v) {
      const fijos = v.puntos.length <= MAX_NUMEROS_FIJOS;
      v.puntos.forEach((pt, i) => {
        const extremo = i === 0 ? "Inicio" : i === v.puntos.length - 1 ? "Fin" : null;
        L.circleMarker(pt, { pane: PANE_VIAS, radius: extremo ? 6 : 3.5, color: "#0f172a", weight: 2, fillColor: "#fff", fillOpacity: 1, interactive: false })
          .bindTooltip(extremo ? `${extremo} · ${i + 1}` : String(i + 1), {
            permanent: fijos || extremo !== null,
            direction: "top",
            className: "loth-vertex-label",
            offset: [0, -6],
          })
          .addTo(group);
      });
    }

    if (viaDraft && viaDraft.length > 0) {
      if (viaDraft.length >= 2) {
        L.polyline(viaDraft, { color: "#0f172a", weight: 3, dashArray: "6 5" }).addTo(group);
      }
      viaDraft.forEach((pt, i) =>
        L.circleMarker(pt, {
          radius: 4,
          color: "#fff",
          weight: 2,
          fillColor: "#0f172a",
          fillOpacity: 1,
          bubblingMouseEvents: false,
        })
          .bindTooltip(String(i + 1), { permanent: true, direction: "top", className: "loth-vertex-label", offset: [0, -6] })
          .addTo(group),
      );
    }
  }, [ready, vias, viaDraft, rutaElegida, capturando, onRutaElegida, LRef, viasRef]);

  // Tocar el mapa vacío suelta la ruta o el punto (la línea y el pin no burbujean su clic).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || capturando || !rutaElegida) return;
    const soltar = () => onRutaElegida(null);
    map.on("click", soltar);
    return () => {
      map.off("click", soltar);
    };
  }, [ready, capturando, rutaElegida, onRutaElegida, mapRef]);
}
