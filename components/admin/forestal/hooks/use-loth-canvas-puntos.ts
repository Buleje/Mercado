"use client";

/**
 * useLothCanvasPuntos — lo que se PINTA ENCIMA de la base: capas oficiales
 * (SERNANP/SERFOR), censo y operaciones del libro, imagen histórica con su
 * cortina, posición del GPS y referencias del plano.
 *
 * Los efectos están copiados sin cambios desde `LothMapaCanvas` (se partió en
 * 2026-09-18 al pasar de 300 líneas): mismas dependencias, mismo orden.
 */

import { useEffect } from "react";
import type { LatLng } from "@/lib/forestal/loth-geo";
import { pointInPolygon } from "@/lib/forestal/loth-geo";
import { referenciaMeta } from "@/lib/forestal/loth-cartografia";
import { OVERLAYS, type OverlayId } from "../loth-mapa-overlays";
import { arbolPopupHtml, censoColor, operacionPopupHtml, SECTION_COLOR } from "../loth-mapa-shared";
import { MAX_NATIVE, type LeafletCtx, type LothMapaCanvasProps } from "../loth-mapa-canvas-ctx";

/* Las refs de Leaflet van en las dependencias aunque no cambian nunca: llegan
   por parámetro y el linter no puede saber que son estables. Agregarlas no
   re-dispara ningún efecto. */
export function useLothCanvasPuntos(ctx: LeafletCtx, p: LothMapaCanvasProps): void {
  const { ready, mapRef, LRef, overlayRef, markersRef, waybackRef, posRef, refsRef } = ctx;
  const { overlays, geo, censo, parcela, declarada, wayback, waybackSplit, posicion, referencias } = p;

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

  // ── Censo + operaciones ────────────────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const group = markersRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    const inside = (p: LatLng) => (declarada ? pointInPolygon(p, parcela) : true);

    for (const t of censo) {
      const dentro = inside([t.lat, t.lng]);
      const color = censoColor(t);
      if (declarada && !dentro) {
        L.circleMarker([t.lat, t.lng], { radius: 10, color: "#e11d48", weight: 1.5, opacity: 0.8, fill: false }).addTo(group);
      }
      L.circleMarker([t.lat, t.lng], { radius: 4.5, color: "#fff", weight: 1.5, fillColor: color, fillOpacity: 0.95 })
        .bindPopup(arbolPopupHtml(t, dentro, declarada))
        .addTo(group);
    }

    for (const g of geo) {
      const dentro = inside([g.lat, g.lng]);
      if (declarada && !dentro) {
        L.circleMarker([g.lat, g.lng], { radius: 12, color: "#e11d48", weight: 2, opacity: 0.9, fill: false }).addTo(group);
      }
      L.circleMarker([g.lat, g.lng], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: SECTION_COLOR[g.section] ?? "#334155",
        fillOpacity: 0.9,
      })
        .bindPopup(operacionPopupHtml(g, dentro, declarada))
        .addTo(group);
    }
  }, [ready, geo, censo, parcela, declarada, LRef, markersRef]);

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

  // La cortina se aplica al PANE (no a cada tesela): un solo clip-path.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const pane = map.getPane("wayback") as HTMLElement | undefined;
    if (!pane) return;
    pane.style.clipPath = wayback ? `inset(0 ${100 - waybackSplit}% 0 0)` : "";
  }, [ready, wayback, waybackSplit, mapRef]);

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
  useEffect(() => {
    const L = LRef.current;
    const group = refsRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    for (const r of referencias) {
      const meta = referenciaMeta(r.tipo);
      L.marker([r.lat, r.lng], {
        keyboard: false,
        icon: L.divIcon({
          className: "loth-ref-pin",
          html: `<span style="background:${meta.color}"></span>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      })
        .bindTooltip(r.nombre, { permanent: true, direction: "right", className: "loth-ref-label", offset: [8, 0] })
        .bindPopup(
          `<div style="font:600 12px/1.5 system-ui"><b>${r.nombre.replace(/</g, "&lt;")}</b><br/>${meta.label}${
            r.nota ? `<br/><span style="opacity:.75">${r.nota.replace(/</g, "&lt;")}</span>` : ""
          }</div>`,
        )
        .addTo(group);
    }
  }, [ready, referencias, LRef, refsRef]);
}
