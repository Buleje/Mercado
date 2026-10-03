"use client";

/**
 * useLothCanvasPuntos — lo que se PINTA ENCIMA de la base: capas oficiales
 * (SERNANP/SERFOR), operaciones del libro, imagen histórica con su cortina,
 * posición del GPS y referencias del plano. El censo tiene su capa aparte
 * (`use-loth-canvas-arboles`): se re-pinta al elegir o filtrar sin tocar esto.
 *
 * Los efectos están copiados sin cambios desde `LothMapaCanvas` (se partió en
 * 2026-09-18 al pasar de 300 líneas): mismas dependencias, mismo orden.
 */

import { useEffect } from "react";
import type { LatLng } from "@/lib/forestal/loth-geo";
import { pointInPolygon } from "@/lib/forestal/loth-geo";
import { referenciaMeta } from "@/lib/forestal/loth-cartografia";
import { claveDePunto } from "@/lib/forestal/loth-rutas-coordenadas";
import { OVERLAYS, type OverlayId } from "../loth-mapa-overlays";
import { operacionPopupHtml, SECTION_COLOR } from "../loth-mapa-shared";
import { MAX_NATIVE, type LeafletCtx, type LothMapaCanvasProps } from "../loth-mapa-canvas-ctx";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Las refs de Leaflet van en las dependencias aunque no cambian nunca: llegan
   por parámetro y el linter no puede saber que son estables. Agregarlas no
   re-dispara ningún efecto. */
export function useLothCanvasPuntos(ctx: LeafletCtx, p: LothMapaCanvasProps): void {
  const { ready, mapRef, LRef, overlayRef, markersRef, waybackRef, posRef, refsRef } = ctx;
  const { overlays, geo, parcela, declarada, wayback, waybackSplit, s2Comparar, posicion, referencias, rutaElegida, onRutaElegida } = p;

  // ── Capas oficiales del Estado (SERNANP / SERFOR) ──────────────────────────
  // Son MapServer de Esri, no teselas: se pide un PNG transparente del bbox
  // visible y se re-pide al mover. Sin dependencias (no hace falta esri-leaflet).
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;

    // Defensivo: si la prop llega sin definir (hot-reload, consumidor nuevo) la
    // capa simplemente no pinta — nunca revienta el mapa en runtime.
    const active = Array.isArray(overlays) ? overlays : [];
    const sync = () => {
      const b = map.getBounds();
      const size = map.getSize();
      const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
      const w = Math.max(64, Math.min(2048, Math.round(size.x)));
      const h = Math.max(64, Math.min(2048, Math.round(size.y)));
      // Quitar las capas apagadas.
      for (const [id, layer] of Object.entries(overlayRef.current)) {
        if (!active.includes(id as OverlayId)) {
          map.removeLayer(layer);
          delete overlayRef.current[id];
        }
      }
      for (const id of active) {
        const def = OVERLAYS.find((o) => o.id === id);
        if (!def) continue;
        const url = `${def.url}/export?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${w},${h}&format=png32&transparent=true&f=image`;
        const bounds = L.latLngBounds(b.getSouthWest(), b.getNorthEast());
        const existing = overlayRef.current[id];
        if (existing) {
          existing.setBounds(bounds);
          existing.setUrl(url);
        } else {
          overlayRef.current[id] = L.imageOverlay(url, bounds, { opacity: def.opacity, interactive: false, zIndex: 250 }).addTo(map);
        }
      }
    };

    sync();
    map.on("moveend zoomend", sync);
    return () => {
      map.off("moveend zoomend", sync);
    };
  }, [ready, overlays, mapRef, LRef, overlayRef]);

  // ── Operaciones del libro ──────────────────────────────────────────────────
  // (Los árboles del censo tienen su propia capa: `use-loth-canvas-arboles`.)
  useEffect(() => {
    const L = LRef.current;
    const group = markersRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    const inside = (p: LatLng) => (declarada ? pointInPolygon(p, parcela) : true);

    for (const g of geo) {
      /* Con «Todos» el punto ya viene medido contra el área de SU permiso (`dentro`); `null` = sin área con que medirlo. */
      const medido = g.dentro !== undefined;
      const hayArea = medido ? g.dentro !== null : declarada;
      const dentro = medido ? g.dentro !== false : inside([g.lat, g.lng]);
      if (hayArea && !dentro) {
        L.circleMarker([g.lat, g.lng], { radius: 12, color: "#e11d48", weight: 2, opacity: 0.9, fill: false }).addTo(group);
      }
      L.circleMarker([g.lat, g.lng], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: SECTION_COLOR[g.section] ?? "#334155",
        fillOpacity: 0.9,
      })
        .bindPopup(operacionPopupHtml(g, dentro, hayArea))
        .addTo(group);
    }
  }, [ready, geo, parcela, declarada, LRef, markersRef]);

  // ── Imagen histórica (Wayback) + cortina ───────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    if (waybackRef.current) {
      map.removeLayer(waybackRef.current);
      waybackRef.current = null;
    }
    if (!wayback) return;
    waybackRef.current = L.tileLayer(wayback.urlTemplate, {
      maxZoom: 22,
      maxNativeZoom: MAX_NATIVE.sat,
      pane: "wayback",
      attribution: `Imagery ${wayback.label} © Esri Wayback`,
    }).addTo(map);
  }, [ready, wayback, mapRef, LRef, waybackRef]);

  // La cortina se aplica al PANE (no a cada tesela): un solo clip-path. En
  // ese pane va la imagen histórica o la otra fecha de Sentinel-2.
  const comparando = !!wayback || !!s2Comparar;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const pane = map.getPane("wayback") as HTMLElement | undefined;
    if (!pane) return;
    pane.style.clipPath = comparando ? `inset(0 ${100 - waybackSplit}% 0 0)` : "";
  }, [ready, comparando, waybackSplit, mapRef]);

  // ── Mi posición en campo (GPS del dispositivo) ─────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const group = posRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    if (!posicion) return;
    const p: LatLng = [posicion.lat, posicion.lng];
    // Círculo de precisión REAL (en metros): si el GPS dice ±30 m, se ve ±30 m.
    if (posicion.accuracy > 0) {
      L.circle(p, { radius: posicion.accuracy, color: "#2563eb", weight: 1, fillColor: "#2563eb", fillOpacity: 0.12, interactive: false }).addTo(group);
    }
    L.circleMarker(p, { radius: 7, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 })
      .bindTooltip("Estás acá", { direction: "top", offset: [0, -8] })
      .addTo(group);
  }, [ready, posicion, LRef, posRef]);

  // ── Referencias del plano ──────────────────────────────────────────────────
  // Tocar el pin abre su ficha (la misma que la de una ruta: nombre, tipo, UTM
  // y lat/lng); la elegida lleva un aro turquesa. Antes era un popup sin coordenadas.
  useEffect(() => {
    const L = LRef.current;
    const group = refsRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    for (const r of referencias) {
      const meta = referenciaMeta(r.tipo);
      const clave = claveDePunto(r.id);
      const elegida = rutaElegida === clave;
      if (elegida) {
        L.circleMarker([r.lat, r.lng], { radius: 15, className: "stroke-[var(--accent)]", weight: 3, fill: false, interactive: false }).addTo(group);
      }
      L.marker([r.lat, r.lng], {
        keyboard: false,
        // Encima de los árboles y sus rótulos: el patio cae justo donde se juntan (medido en Blas: lo tapaba el rótulo de un árbol).
        zIndexOffset: elegida ? 3_000 : 2_000,
        icon: L.divIcon({
          className: "loth-ref-pin",
          html: `<span style="background:${meta.color}"></span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      })
        .bindTooltip(esc(r.nombre), { permanent: true, direction: "right", className: "loth-ref-label", offset: [8, 0] })
        .on("click", () => onRutaElegida(clave))
        .addTo(group);
    }
  }, [ready, referencias, rutaElegida, onRutaElegida, LRef, refsRef]);
}
