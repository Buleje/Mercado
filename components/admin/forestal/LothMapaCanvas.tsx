"use client";

/**
 * LothMapaCanvas — TODO el Leaflet imperativo de la cabina geoespacial del Libro
 * TH, aislado del orquestador (`LothMapaView`, que solo tiene datos y estado).
 *
 * Capas, de abajo hacia arriba:
 *   1. base cartográfica (topográfica / satelital Esri / Sentinel-2 reciente /
 *      calles), con las capas de hoy (nubes y humo, focos de calor) encima,
 *   2. cuadrícula UTM rotulada (`loth-utm`) que se recalcula al mover el mapa,
 *   3. polígono del área de aprovechamiento + sus vértices C.001…,
 *   4. censo forestal (árboles proyectados desde UTM) y operaciones del libro,
 *      con halo rojo si caen FUERA del polígono declarado.
 *
 * Las capas viven en seis hooks —trazos (líneas y polígonos), vías (trochas,
 * caminos y ríos del plano, con su ficha), puntos (lo que se pinta encima),
 * clics (qué hace tocar el mapa), árboles (el censo, su ficha y la línea hasta
 * el más cercano) y plan (ríos y caminos de OSM y la propuesta del
 * planificador)—; acá queda crear el mapa, la base, la escala, el encuadre y
 * el centrado.
 *
 * GOTCHA (aprendido a los golpes): el `className` del contenedor va ESTÁTICO —
 * Leaflet agrega sus clases imperativamente y un className dinámico haría que
 * React reescriba el atributo y borre `.leaflet-container`, rompiendo el mapa.
 */

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/forestal/loth-geo";
import { ATTR, MAX_NATIVE, TILES, type BaseFija, type LeafletCtx, type LothMapaCanvasProps } from "./loth-mapa-canvas-ctx";
import { useLothCanvasTrazos } from "./hooks/use-loth-canvas-trazos";
import { useLothCanvasVias } from "./hooks/use-loth-canvas-vias";
import { useLothCanvasPuntos } from "./hooks/use-loth-canvas-puntos";
import { useLothCanvasClics } from "./hooks/use-loth-canvas-clics";
import { useLothCanvasArboles } from "./hooks/use-loth-canvas-arboles";
import { useLothCanvasPlan } from "./hooks/use-loth-canvas-plan";
import { useLothCanvasImagenes } from "./hooks/use-loth-canvas-imagenes";

export type { BasemapId } from "./loth-mapa-canvas-ctx";

export default function LothMapaCanvas(p: LothMapaCanvasProps) {
  const { geo, censo, fullscreen, centrarEn, encuadrarEn, parcela, basemap, center, fitKey, onView, vias, referencias } = p;
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
  const arbolesRef = useRef<any>(null);
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
      arbolesRef.current = L.layerGroup().addTo(map);
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
  // Sentinel-2 la pinta `use-loth-canvas-imagenes` (una capa por cuadro de la
  // escena); mientras la escena no llega, queda la foto de Esri: nunca un fondo vacío.
  const fija: BaseFija | null = basemap === "s2" ? (p.s2 ? null : "sat") : basemap;
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    if (baseRef.current) map.removeLayer(baseRef.current);
    baseRef.current = null;
    if (!fija) return;
    baseRef.current = L.tileLayer(TILES[fija], {
      maxZoom: 22,
      maxNativeZoom: MAX_NATIVE[fija],
      attribution: ATTR[fija],
    }).addTo(map);
    baseRef.current.bringToBack();
  }, [ready, fija]);

  const ctx: LeafletCtx = {
    ready,
    mapRef,
    LRef,
    gridRef,
    predioRef,
    parcelaRef,
    draftRef,
    markersRef,
    arbolesRef,
    refsRef,
    viasRef,
    posRef,
    waybackRef,
    medicionRef,
    fajaRef,
    overlayRef,
  };
  useLothCanvasTrazos(ctx, p);
  useLothCanvasVias(ctx, p);
  useLothCanvasPuntos(ctx, p);
  useLothCanvasClics(ctx, p);
  useLothCanvasArboles(ctx, p);
  useLothCanvasPlan(ctx, p);
  useLothCanvasImagenes(ctx, p);

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

  // El contenedor cambió de tamaño por otra cosa (girar el celular en el
  // monte, plegar el menú lateral): Leaflet sólo escucha la ventana, y con
  // el tamaño viejo encuadra mal y las etiquetas de los árboles se calculan
  // para un mapa que ya no es.
  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!ready || !map || !el || typeof ResizeObserver === "undefined") return;
    let cuadro = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(() => map.invalidateSize({ debounceMoveend: true }));
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(cuadro);
      ro.disconnect();
    };
  }, [ready]);

  // Centrar a pedido (botón "Centrar" del modo campo).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !centrarEn) return;
    map.setView(centrarEn.p, Math.max(map.getZoom(), 16), { animate: true });
  }, [ready, centrarEn]);

  // Encuadrar varios puntos a pedido: tu posición y el árbol más cercano, los
  // dos a la vista (con un solo punto sería un centrado, y ya existe).
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || !encuadrarEn || encuadrarEn.pts.length === 0) return;
    try {
      // Con el planificador abierto, su panel tapa el borde derecho: lo propuesto se encuadra en lo que queda a la vista.
      map.fitBounds(L.latLngBounds(encuadrarEn.pts), { paddingTopLeft: [56, 56], paddingBottomRight: [56 + (encuadrarEn.derecha ?? 0), 56], maxZoom: 18, animate: true });
    } catch {
      /* puntos inválidos: el mapa se queda donde estaba */
    }
  }, [ready, encuadrarEn]);

  // ── Encuadre (cuando el orquestador lo pide) ───────────────────────────────
  // Las rutas y los puntos del plano entran en el encuadre: un camino de salida
  // que llega a la carretera quedaba afuera, y el patio también (29-09).
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || fitKey === 0 || fittedRef.current === fitKey) return;
    const pts: LatLng[] = [
      ...geo.map((g): LatLng => [g.lat, g.lng]),
      ...censo.map((t): LatLng => [t.lat, t.lng]),
      ...parcela,
      ...vias.flatMap((v) => v.puntos),
      ...referencias.map((r): LatLng => [r.lat, r.lng]),
    ];
    if (pts.length === 0) return;
    try {
      map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 16 });
      fittedRef.current = fitKey;
    } catch {
      /* bounds inválidos: se queda en el centro por defecto */
    }
  }, [ready, fitKey, geo, censo, parcela, vias, referencias]);

  // className ESTÁTICO (Leaflet agrega las suyas): la ALTURA la define el
  // contenedor de `LothMapaView`, que cambia en pantalla completa.
  return <div ref={containerRef} className="h-full w-full bg-[var(--surface-sunken)]" />;
}
