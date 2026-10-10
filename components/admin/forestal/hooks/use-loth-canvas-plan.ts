"use client";

/**
 * useLothCanvasPlan — las capas del PLANIFICADOR de extracción sobre el mapa:
 *
 *   · Ríos y caminos de OpenStreetMap (capa «Ríos y caminos» de Capas, o
 *     mientras el panel está abierto): lo que YA existe, en trazo continuo.
 *   · La propuesta, en vista previa PUNTEADA: celdas muy empinadas
 *     (semitransparentes), trochas (la principal más gruesa que los ramales),
 *     camino de salida, campamento y el patio de acopio — que se ARRASTRA: al
 *     soltarlo se recalcula todo alrededor de él.
 *
 * Todo lleva un borde blanco debajo: una línea fina de color no se lee sobre
 * la imagen satelital. Grupos propios, creados acá, para no tocar el orden de
 * las capas del canvas.
 */

import { useEffect, useRef } from "react";
import { etiquetaLinea } from "@/lib/forestal/loth-geografia";
import { textoDistancia } from "@/lib/forestal/loth-mapa-arboles";
import { COLOR_PLAN } from "../loth-mapa-plan";
import type { LeafletCtx, LothMapaCanvasProps } from "../loth-mapa-canvas-ctx";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** El pin del plan: un cuadrado (patio) o un círculo (campamento) con su letra. */
function pinHtml(letra: string, color: string, forma: "cuadrado" | "circulo", arrastrable: boolean): string {
  const radio = forma === "cuadrado" ? "5px" : "50%";
  return `<span style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:${radio};background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(15,23,42,.6),0 2px 6px rgba(15,23,42,.35);color:#fff;font:800 13px/1 system-ui,sans-serif;${
    arrastrable ? "cursor:grab;" : ""
  }">${letra}</span>`;
}

/* Las refs de Leaflet van en las dependencias aunque no cambian nunca. */
export function useLothCanvasPlan(ctx: LeafletCtx, p: LothMapaCanvasProps): void {
  const { ready, mapRef, LRef } = ctx;
  const { geoOsm, propuesta, onPatioMovido } = p;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const osmRef = useRef<any>(null);
  const planRef = useRef<any>(null);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Los dos grupos, una vez: el de OSM debajo del de la propuesta.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    osmRef.current = L.layerGroup().addTo(map);
    planRef.current = L.layerGroup().addTo(map);
    return () => {
      // Al desmontar, el canvas puede haber destruido el mapa antes: quitar capas de un mapa muerto tira.
      try {
        map.removeLayer(osmRef.current);
        map.removeLayer(planRef.current);
      } catch {
        /* el mapa ya no existe: sus capas se fueron con él */
      }
      osmRef.current = null;
      planRef.current = null;
    };
  }, [ready, LRef, mapRef]);

  // ── Ríos y caminos de OpenStreetMap ────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const group = osmRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    if (!geoOsm) return;
    for (const r of geoOsm.rios) {
      L.polyline(r.puntos, { color: "#fff", weight: 6, opacity: 0.5, interactive: false }).addTo(group);
      L.polyline(r.puntos, { color: COLOR_PLAN.rio, weight: 3, opacity: 0.9 })
        .bindTooltip(`${esc(etiquetaLinea(r))} · OpenStreetMap`, { sticky: true })
        .addTo(group);
    }
    for (const c of geoOsm.caminos) {
      const ancho = c.vehicular === false ? 2 : 3;
      L.polyline(c.puntos, { color: "#fff", weight: ancho + 3, opacity: 0.5, interactive: false }).addTo(group);
      L.polyline(c.puntos, { color: COLOR_PLAN.caminoOsm, weight: ancho, opacity: 0.9, dashArray: c.vehicular === false ? "2 4" : undefined })
        .bindTooltip(`${esc(etiquetaLinea(c))} · OpenStreetMap${c.vehicular === false ? " · sin paso de camión" : ""}`, { sticky: true })
        .addTo(group);
    }
  }, [ready, geoOsm, LRef]);

  // ── La propuesta, en vista previa ──────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const group = planRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    if (!propuesta || propuesta.vacia) return;

    for (const z of propuesta.zonasNoAptas) {
      L.rectangle(
        [
          [z.sur, z.oeste],
          [z.norte, z.este],
        ],
        { stroke: false, fillColor: COLOR_PLAN.noApta, fillOpacity: 0.16, interactive: false },
      ).addTo(group);
    }

    for (const l of propuesta.trochas.lineas) {
      const principal = l.clase === "principal";
      L.polyline(l.puntos, { color: "#fff", weight: principal ? 8 : 5, opacity: 0.6, interactive: false }).addTo(group);
      L.polyline(l.puntos, { color: COLOR_PLAN.trocha, weight: principal ? 4.5 : 2.5, opacity: 0.95, dashArray: principal ? "8 6" : "4 5" })
        .bindTooltip(`${esc(l.nombre)} (propuesta) · ${textoDistancia(l.largoM)} · ${l.arboles.length} ${l.arboles.length === 1 ? "árbol" : "árboles"}`, { sticky: true })
        .addTo(group);
    }
    // Los tramos que pasan la pendiente máxima: encima, en rojo.
    for (const t of propuesta.trochas.tramos.filter((x) => x.empinado)) {
      L.polyline(t.puntos, { color: COLOR_PLAN.noApta, weight: 3, opacity: 0.95, dashArray: "2 4" })
        .bindTooltip(`Tramo con ${Math.round(t.pendienteMaxPct ?? 0)} % de pendiente`, { sticky: true })
        .addTo(group);
    }

    const c = propuesta.caminoSalida;
    if (c && c.puntos.length >= 2) {
      L.polyline(c.puntos, { color: "#fff", weight: 8, opacity: 0.6, interactive: false }).addTo(group);
      L.polyline(c.puntos, { color: COLOR_PLAN.camino, weight: 4, opacity: 0.95, dashArray: "10 6" })
        .bindTooltip(`Camino de salida (propuesta) · ${textoDistancia(c.largoM)}`, { sticky: true })
        .addTo(group);
    }

    // Las otras opciones de patio: un aro, para compararlas sin tapar nada.
    propuesta.patios.slice(1).forEach((x, i) =>
      L.circleMarker([x.lat, x.lng], { radius: 8, color: COLOR_PLAN.acopio, weight: 2.5, fillColor: "#fff", fillOpacity: 0.85, dashArray: "3 3" })
        .bindTooltip(`Patio, opción ${i + 2}`, { direction: "top", offset: [0, -8] })
        .addTo(group),
    );

    const camp = propuesta.campamento;
    if (camp) {
      L.marker([camp.lat, camp.lng], {
        keyboard: false,
        icon: L.divIcon({ className: "", html: pinHtml("C", COLOR_PLAN.campamento, "circulo", false), iconSize: [26, 26], iconAnchor: [13, 13] }),
        zIndexOffset: 1_500,
      })
        // Al pasar el mouse: a 50 m del patio, dos rótulos fijos se pisaban.
        .bindTooltip("Campamento (propuesta)", { direction: "right", className: "loth-ref-label", offset: [14, 0] })
        .addTo(group);
    }

    const patio = propuesta.patios[0];
    if (patio) {
      L.marker([patio.lat, patio.lng], {
        draggable: true,
        keyboard: true,
        title: "Patio de acopio: arrástralo y la propuesta se recalcula",
        alt: "Patio de acopio propuesto",
        icon: L.divIcon({ className: "", html: pinHtml("P", COLOR_PLAN.acopio, "cuadrado", true), iconSize: [26, 26], iconAnchor: [13, 13] }),
        zIndexOffset: 2_000,
      })
        .bindTooltip(patio.fijadoPorUsuario ? "Patio (lo moviste)" : "Patio de acopio (propuesta)", {
          permanent: true,
          direction: "right",
          className: "loth-ref-label",
          offset: [14, 0],
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on("dragend", (e: any) => {
          const q = e.target.getLatLng();
          onPatioMovido([q.lat, q.lng]);
        })
        .addTo(group);
    }
  }, [ready, propuesta, onPatioMovido, LRef]);
}
