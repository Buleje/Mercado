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
 * GOTCHA (aprendido a los golpes): el `className` del contenedor va ESTÁTICO —
 * Leaflet agrega sus clases imperativamente y un className dinámico haría que
 * React reescriba el atributo y borre `.leaflet-container`, rompiendo el mapa.
 */

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/forestal/loth-geo";
import { pointInPolygon } from "@/lib/forestal/loth-geo";
import { dominantZone, gridLabel, utmGrid, vertexCode } from "@/lib/forestal/loth-utm";
import {
  arbolPopupHtml,
  operacionPopupHtml,
  CENSO_ESTADO_COLOR,
  PARCELA_COLOR,
  SECTION_COLOR,
  type CensoTree,
  type GeoEntry,
} from "./loth-mapa-shared";

const TILES = {
  topo: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  sat: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  street: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
} as const;
export type BasemapId = keyof typeof TILES;

const ATTR: Record<BasemapId, string> = {
  topo: "Tiles © Esri — Fuentes: Esri, USGS, NOAA",
  sat: "Tiles © Esri, Maxar",
  street: "© OpenStreetMap",
};
const MAX_NATIVE: Record<BasemapId, number> = { topo: 17, sat: 17, street: 19 };
/** Hasta acá los códigos C.00N caben sin pisarse; arriba, van al hover. */
const MAX_PERMANENT_LABELS = 12;

interface Props {
  geo: GeoEntry[];
  censo: CensoTree[];
  parcela: LatLng[];
  declarada: boolean;
  draft: LatLng[];
  drawMode: boolean;
  basemap: BasemapId;
  showGrid: boolean;
  center: LatLng;
  /** Cambia cuando el orquestador quiere re-encuadrar (ej. al terminar de cargar). */
  fitKey: number;
  onAddVertex: (v: LatLng) => void;
  /** Arrastre de un vértice del borrador. */
  onMoveVertex: (index: number, v: LatLng) => void;
  /** Click derecho sobre un vértice. */
  onDeleteVertex: (index: number) => void;
  /** Click en el punto medio de un lado (inserta antes de `index`). */
  onInsertVertex: (index: number, v: LatLng) => void;
  onCursor: (p: LatLng | null) => void;
  /** Escala viva del mapa (para la barra gráfica y el denominador 1:X). */
  onView: (v: { zoom: number; metersPerPixel: number }) => void;
}

export default function LothMapaCanvas({
  geo,
  censo,
  parcela,
  declarada,
  draft,
  drawMode,
  basemap,
  showGrid,
  center,
  fitKey,
  onAddVertex,
  onMoveVertex,
  onDeleteVertex,
  onInsertVertex,
  onCursor,
  onView,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const baseRef = useRef<any>(null);
  const gridRef = useRef<any>(null);
  const parcelaRef = useRef<any>(null);
  const draftRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
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
      parcelaRef.current = L.layerGroup().addTo(map);
      markersRef.current = L.layerGroup().addTo(map);
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

  // ── Cuadrícula UTM (se recalcula al mover/zoomear) ─────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = gridRef.current;
    if (!ready || !L || !map || !group) return;

    const draw = () => {
      group.clearLayers();
      if (!showGrid) return;
      const b = map.getBounds();
      const bounds = {
        latMin: b.getSouth(),
        latMax: b.getNorth(),
        lngMin: b.getWest(),
        lngMax: b.getEast(),
      };
      const zone = dominantZone([[(bounds.latMin + bounds.latMax) / 2, (bounds.lngMin + bounds.lngMax) / 2]]);
      const { step, lines } = utmGrid(bounds, zone);
      if (lines.length > 60) return; // zoom demasiado lejano: la grilla sería ruido
      for (const line of lines) {
        // Casing blanco + guion oscuro: legible sobre satélite y sobre topográfico.
        L.polyline(line.path, { color: "#ffffff", weight: 2.5, opacity: 0.45, interactive: false }).addTo(group);
        L.polyline(line.path, { color: "#0f172a", weight: 1, opacity: 0.45, dashArray: "5 5", interactive: false }).addTo(group);
        // Las "E" se rotulan arriba (último punto = norte del bbox) y las "N" a la
        // izquierda: igual que las reglas de un plano, y sin taparse entre ellas.
        const anchor = line.axis === "E" ? line.path[line.path.length - 1] : line.path[0];
        L.marker(anchor, {
          interactive: false,
          keyboard: false, // sin tabindex: son rótulos, no controles
          icon: L.divIcon({
            className: "loth-grid-label",
            html: gridLabel(line.value, step),
            iconSize: [0, 0],
            // El ancla cae sobre el borde: se corre hacia adentro del marco
            // (iconAnchor resta, así que un valor negativo empuja hacia adentro).
            // Las "N" esquivan además el control de zoom del ángulo superior.
            iconAnchor: line.axis === "E" ? [18, -6] : [-52, 5],
          }),
        }).addTo(group);
      }
    };

    draw();
    map.on("moveend zoomend", draw);
    return () => {
      map.off("moveend zoomend", draw);
    };
  }, [ready, showGrid]);

  // ── Escala viva: metros por píxel en el paralelo del centro ────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const emit = () => {
      const zoom = map.getZoom();
      const lat = map.getCenter().lat;
      const metersPerPixel = (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zoom);
      onView({ zoom, metersPerPixel });
    };
    emit();
    map.on("moveend zoomend", emit);
    return () => {
      map.off("moveend zoomend", emit);
    };
  }, [ready, onView]);

  // ── Dibujo: click = vértice · cursor = lectura de coordenadas ──────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onMove = (e: any) => onCursor([e.latlng.lat, e.latlng.lng]);
    const onOut = () => onCursor(null);
    map.on("mousemove", onMove);
    map.on("mouseout", onOut);
    return () => {
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
    };
  }, [ready, onCursor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !drawMode) return;
    map.doubleClickZoom.disable();
    // Cursor imperativo (NO por className: React borraría las clases de Leaflet).
    (map.getContainer() as HTMLElement).style.cursor = "crosshair";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onClick = (e: any) => onAddVertex([e.latlng.lat, e.latlng.lng]);
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      if (mapRef.current) {
        mapRef.current.doubleClickZoom.enable();
        (mapRef.current.getContainer() as HTMLElement).style.cursor = "";
      }
    };
  }, [ready, drawMode, onAddVertex]);

  // ── Polígono guardado + vértices rotulados ─────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const group = parcelaRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    if (drawMode || !declarada) return;
    L.polygon(parcela, { color: PARCELA_COLOR, weight: 2.5, fillColor: PARCELA_COLOR, fillOpacity: 0.12 }).addTo(group);
    // Con muchos vértices los rótulos se pisan y tapan el polígono: a partir de
    // ~12 se muestran al pasar el mouse (el cuadro de coordenadas los lista todos).
    const permanent = parcela.length <= MAX_PERMANENT_LABELS;
    parcela.forEach((v, i) =>
      L.circleMarker(v, { radius: 4, color: "#fff", weight: 1.5, fillColor: "#0f172a", fillOpacity: 1 })
        .bindTooltip(vertexCode(i), { permanent, direction: "right", className: "loth-vertex-label", offset: [6, 0] })
        .addTo(group),
    );
  }, [ready, parcela, declarada, drawMode]);

  // ── Borrador en vivo: vértices arrastrables + puntos medios para insertar ──
  useEffect(() => {
    const L = LRef.current;
    const group = draftRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    if (!drawMode || draft.length === 0) return;

    if (draft.length >= 3) {
      L.polygon(draft, { color: PARCELA_COLOR, weight: 2, dashArray: "6 4", fillColor: PARCELA_COLOR, fillOpacity: 0.1 }).addTo(group);
    } else if (draft.length === 2) {
      L.polyline(draft, { color: PARCELA_COLOR, weight: 2, dashArray: "6 4" }).addTo(group);
    }

    // Puntos medios de cada lado: un click parte el lado en dos (vértice nuevo).
    if (draft.length >= 2) {
      draft.forEach((v, i) => {
        const next = draft[(i + 1) % draft.length];
        if (draft.length === 2 && i === 1) return; // con 2 puntos hay un solo lado
        const mid: LatLng = [(v[0] + next[0]) / 2, (v[1] + next[1]) / 2];
        L.circleMarker(mid, {
          radius: 4,
          color: PARCELA_COLOR,
          weight: 1.5,
          fillColor: "#fff",
          fillOpacity: 0.85,
          className: "loth-midpoint",
          // Sin esto el click también llega al mapa y agrega un 2º vértice al
          // final: los Path de Leaflet burbujean sus eventos de mouse por default.
          bubblingMouseEvents: false,
        })
          .bindTooltip("Insertar vértice acá", { direction: "top", className: "loth-vertex-label", offset: [0, -6] })
          .on("click", () => onInsertVertex(i + 1, mid))
          .addTo(group);
      });
    }

    // Vértices: arrastrar mueve, click derecho borra.
    const rotula = draft.length <= MAX_PERMANENT_LABELS;
    draft.forEach((v, i) => {
      const marker = L.marker(v, {
        draggable: true,
        keyboard: false,
        icon: L.divIcon({ className: "loth-vertex-handle", html: "", iconSize: [14, 14], iconAnchor: [7, 7] }),
        title: `${vertexCode(i)} — arrastrá para mover · click derecho para borrar`,
      });
      if (rotula) {
        marker.bindTooltip(vertexCode(i), { permanent: true, direction: "top", className: "loth-vertex-label", offset: [0, -8] });
      }
      marker
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on("dragend", (e: any) => {
          const p = e.target.getLatLng();
          onMoveVertex(i, [p.lat, p.lng]);
        })
        .on("contextmenu", () => onDeleteVertex(i))
        .addTo(group);
    });
  }, [ready, draft, drawMode, onInsertVertex, onMoveVertex, onDeleteVertex]);

  // ── Censo + operaciones ────────────────────────────────────────────────────
  useEffect(() => {
    const L = LRef.current;
    const group = markersRef.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    const inside = (p: LatLng) => (declarada ? pointInPolygon(p, parcela) : true);

    for (const t of censo) {
      const dentro = inside([t.lat, t.lng]);
      const color = CENSO_ESTADO_COLOR[t.estado] ?? "#15803d";
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
  }, [ready, geo, censo, parcela, declarada]);

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

  return <div ref={containerRef} className="h-[560px] w-full bg-[var(--surface-sunken)]" />;
}
