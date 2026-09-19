/**
 * loth-mapa-canvas-ctx — lo que comparten `LothMapaCanvas` y sus tres hooks de
 * capas (`use-loth-canvas-trazos`, `use-loth-canvas-puntos`,
 * `use-loth-canvas-clics`): las bases cartográficas, las props del canvas y
 * las referencias a Leaflet y a cada grupo de capas.
 *
 * El canvas era un solo archivo de 746 líneas con dieciocho efectos. Se partió
 * moviendo cada efecto TAL CUAL a un hook por tema; este módulo es el pegamento
 * para que ninguno tenga que importar del componente (import circular).
 */

import type { RefObject } from "react";
import type { LatLng } from "@/lib/forestal/loth-geo";
import type { LothReferencia, LothVia } from "@/lib/forestal/loth-cartografia";
import type { WaybackRelease } from "@/lib/forestal/loth-wayback";
import type { OverlayId } from "./loth-mapa-overlays";
import type { CensoTree, GeoEntry } from "./loth-mapa-shared";

export const TILES = {
  topo: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  sat: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  street: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
} as const;
export type BasemapId = keyof typeof TILES;

export const ATTR: Record<BasemapId, string> = {
  topo: "Tiles © Esri — Fuentes: Esri, USGS, NOAA",
  sat: "Tiles © Esri, Maxar",
  street: "© OpenStreetMap",
};
export const MAX_NATIVE: Record<BasemapId, number> = { topo: 17, sat: 17, street: 19 };
/** Hasta acá los códigos C.00N caben sin pisarse; arriba, van al hover. */
export const MAX_PERMANENT_LABELS = 12;
/** El predio es el marco: gris pizarra, para que el área siga siendo lo que resalta. */
export const PREDIO_COLOR = "#475569";

export interface LothMapaCanvasProps {
  geo: GeoEntry[];
  censo: CensoTree[];
  /** Contorno del predio que contiene al área (vacío = todavía no se levantó). */
  predio: LatLng[];
  /** Referencias del plano (centros poblados, campamentos, ingreso a la UMF…). */
  referencias: LothReferencia[];
  /** Modo "marcar referencia": el próximo click en el mapa crea una. */
  markMode: boolean;
  onMarkReferencia: (v: LatLng) => void;
  /** Vías del plano (acceso, marginal, trocha, río). */
  vias: LothVia[];
  /** Traza en curso del modo "dibujar vía" (vacío = inactivo). */
  viaDraft: LatLng[] | null;
  onViaPoint: (v: LatLng) => void;
  /** Capas oficiales encendidas (SERNANP / SERFOR). */
  overlays: OverlayId[];
  /** Posición del dispositivo en campo (null = seguimiento apagado). */
  posicion: { lat: number; lng: number; accuracy: number } | null;
  /** Imagen histórica bajo la cortina (null = apagada). */
  wayback: WaybackRelease | null;
  /** Posición de la cortina 0–100 (% del ancho que muestra el histórico). */
  waybackSplit: number;
  /** Traza de la cinta métrica (vacío = herramienta apagada). */
  medicion: LatLng[] | null;
  medicionModo: "distancia" | "area";
  onMedicionPunto: (v: LatLng) => void;
  /** Cambia al entrar/salir de pantalla completa: Leaflet debe re-medirse. */
  fullscreen: boolean;
  /** Ancho (m a cada lado) de la faja de protección sobre los cauces; 0 = apagada. */
  fajaAnchoM: number;
  /** Pedido de centrado (cambia `n` en cada pedido). */
  centrarEn: { p: LatLng; n: number } | null;
  parcela: LatLng[];
  declarada: boolean;
  draft: LatLng[];
  drawMode: boolean;
  /** Cuál de los dos polígonos está en el borrador. */
  drawTarget: "area" | "predio";
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
  /** Escala + encuadre vivos (barra gráfica, denominador 1:X y descarga en PNG). */
  onView: (v: { zoom: number; metersPerPixel: number; bounds: { latMin: number; latMax: number; lngMin: number; lngMax: number } }) => void;
}

/* Leaflet se importa dinámico y sin tipos en este módulo: los grupos de capas
   viajan como `any`, igual que cuando vivían en el componente. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface LeafletCtx {
  ready: boolean;
  mapRef: RefObject<any>;
  LRef: RefObject<any>;
  gridRef: RefObject<any>;
  predioRef: RefObject<any>;
  parcelaRef: RefObject<any>;
  draftRef: RefObject<any>;
  markersRef: RefObject<any>;
  refsRef: RefObject<any>;
  viasRef: RefObject<any>;
  posRef: RefObject<any>;
  waybackRef: RefObject<any>;
  medicionRef: RefObject<any>;
  fajaRef: RefObject<any>;
  overlayRef: RefObject<Record<string, any>>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
