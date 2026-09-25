"use client";

/**
 * LothMapaCanvas — TODO el Leaflet imperativo de la cabina geoespacial del Libro
 * TH, aislado del orquestador (`LothMapaView`, que solo tiene datos y estado).
 *
 * Capas, de abajo hacia arriba:
 *   1. base cartográfica (topográfica / satelital / calles — Esri, maxNativeZoom 17),
 *   2. cuadrícula UTM rotulada (`loth-utm`) que se recalcula al mover el mapa,
 *   3. polígono del área de aprovechamiento + sus vértices C.001…,
 *   4. censo forestal (árboles proyectados desde UTM) y operaciones del libro,
 *      con halo rojo si caen FUERA del polígono declarado.
 *
 * Las capas viven en tres hooks —trazos (líneas y polígonos), puntos (lo que
 * se pinta encima) y clics (qué hace tocar el mapa)—; acá queda crear el mapa,
 * la base, la escala, el encuadre y el centrado.
 *
 * GOTCHA (aprendido a los golpes): el `className` del contenedor va ESTÁTICO —
 * Leaflet agrega sus clases imperativamente y un className dinámico haría que
 * React reescriba el atributo y borre `.leaflet-container`, rompiendo el mapa.
 */

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/forestal/loth-geo";
import { ATTR, MAX_NATIVE, TILES, type LeafletCtx, type LothMapaCanvasProps } from "./loth-mapa-canvas-ctx";
import { useLothCanvasTrazos } from "./hooks/use-loth-canvas-trazos";
import { useLothCanvasPuntos } from "./hooks/use-loth-canvas-puntos";
import { useLothCanvasClics } from "./hooks/use-loth-canvas-clics";

export type { BasemapId } from "./loth-mapa-canvas-ctx";

export default function LothMapaCanvas(p: LothMapaCanvasProps) {
  const { geo, censo, fullscreen, centrarEn, parcela, basemap, center, fitKey, onView } = p;
  const containerRef = useRef<HTMLDivElement>(null);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const baseRef = useRef<any>(null);
  const gridRef = useRef<any>(null);
  const predioRef = useRef<any>(null);
  const parcelaRef = useRef<any>(null);
  const draftRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const refsRef = useRef<any>(null);
  const viasRef = useRef<any>(null);
  const posRef = useRef<any>(null);
  const waybackRef = useRef<any>(null);
  const medicionRef = useRef<any>(null);
  const fajaRef = useRef<any>(null);
  const overlayRef = useRef<Record<string, any>>({});
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const fittedRef = useRef(0);
  const [ready, setReady] = useState(false);

  // ── Init (una sola vez) ────────────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import("leaflet").then((L: any) => {
      if (destroyed || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, { center, zoom: 12, maxZoom: 22 });
      mapRef.current = map;
      baseRef.current = L.tileLayer(TILES.topo, { maxZoom: 22, maxNativeZoom: MAX_NATIVE.topo, attribution: ATTR.topo }).addTo(map);
      gridRef.current = L.layerGroup().addTo(map);
      predioRef.current = L.layerGroup().addTo(map);
      parcelaRef.current = L.layerGroup().addTo(map);
      markersRef.current = L.layerGroup().addTo(map);
      viasRef.current = L.layerGroup().addTo(map);
      posRef.current = L.layerGroup().addTo(map);
      fajaRef.current = L.layerGroup().addTo(map);
      medicionRef.current = L.layerGroup().addTo(map);
      // Pane propio para la imagen histórica: va encima de la base y debajo de
      // los vectores, y su clip-path es el que hace la "cortina" del comparador.
      map.createPane("wayback");
      map.getPane("wayback").style.zIndex = "250";
      refsRef.current = L.layerGroup().addTo(map);
      draftRef.current = L.layerGroup().addTo(map);
      setReady(true);
    });
    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Base cartográfica ──────────────────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    if (baseRef.current) map.removeLayer(baseRef.current);
    baseRef.current = L.tileLayer(TILES[basemap], {
      maxZoom: 22,
      maxNativeZoom: MAX_NATIVE[basemap],
      attribution: ATTR[basemap],
    }).addTo(map);
    baseRef.current.bringToBack();
  }, [ready, basemap]);

  const ctx: LeafletCtx = {
    ready,
    mapRef,
    LRef,
    gridRef,
    predioRef,
    parcelaRef,
    draftRef,
    markersRef,
    refsRef,
    viasRef,
    posRef,
    waybackRef,
    medicionRef,
    fajaRef,
    overlayRef,
  };
  useLothCanvasTrazos(ctx, p);
  useLothCanvasPuntos(ctx, p);
  useLothCanvasClics(ctx, p);

  // ── Escala viva: metros por píxel en el paralelo del centro ────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const emit = () => {
      const zoom = map.getZoom();
      const lat = map.getCenter().lat;
      const metersPerPixel = (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zoom);
      const b = map.getBounds();
      onView({
        zoom,
        metersPerPixel,
        bounds: { latMin: b.getSouth(), latMax: b.getNorth(), lngMin: b.getWest(), lngMax: b.getEast() },
      });
    };
    emit();
    map.on("moveend zoomend", emit);
    return () => {
      map.off("moveend zoomend", emit);
    };
  }, [ready, onView]);

  // El contenedor cambió de tamaño (pantalla completa): Leaflet no se entera solo.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const t = setTimeout(() => map.invalidateSize(), 220);
    return () => clearTimeout(t);
  }, [ready, fullscreen]);

  // Centrar a pedido (botón "Centrar" del modo campo).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !centrarEn) return;
    map.setView(centrarEn.p, Math.max(map.getZoom(), 16), { animate: true });
  }, [ready, centrarEn]);

  // ── Encuadre (cuando el orquestador lo pide) ───────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || fitKey === 0 || fittedRef.current === fitKey) return;
    const pts: LatLng[] = [...geo.map((g): LatLng => [g.lat, g.lng]), ...censo.map((t): LatLng => [t.lat, t.lng]), ...parcela];
    if (pts.length === 0) return;
    try {
      map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 16 });
      fittedRef.current = fitKey;
    } catch {
      /* bounds inválidos: se queda en el centro por defecto */
    }
  }, [ready, fitKey, geo, censo, parcela]);

  // className ESTÁTICO (Leaflet agrega las suyas): la ALTURA la define el
  // contenedor de `LothMapaView`, que cambia en pantalla completa.
  return <div ref={containerRef} className="h-full w-full bg-[var(--surface-sunken)]" />;
}
