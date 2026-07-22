/**
 * loth-mapa-shared — single source de la cabina geoespacial del Libro TH:
 * colores/rótulos por sección, tipos de los puntos dibujables y los adaptadores
 * DTO → punto de mapa (operaciones del libro y árboles del censo forestal).
 *
 * Lo comparten `LothMapaView` (orquestador + datos), `LothMapaCanvas` (Leaflet)
 * y `LothVerticesPanel` (tabla UTM). Puro: sin React, sin DOM, sin fetch.
 */

import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { formatUtmFull, parseUtmZone, fromUtm, toUtm } from "@/lib/forestal/loth-utm";
import { CATEGORIA_COLOR, CATEGORIA_LABEL, type PoaCategoria } from "@/lib/forestal/loth-poa";

export const SECTION_COLOR: Record<string, string> = {
  tala: "#16a34a",
  trozado: "#0d9488",
  despacho_troza: "#e11d48",
  consumo_troza: "#6b7280",
  producto_terminado: "#0ea5e9",
  despacho_producto: "#f43f5e",
};

export const SECTION_LABEL: Record<string, string> = {
  tala: "Tala",
  trozado: "Trozado",
  despacho_troza: "Despacho de troza",
  consumo_troza: "Consumo de troza",
  producto_terminado: "Producto terminado",
  despacho_producto: "Despacho de producto",
};

export const CENSO_ESTADO_LABEL: Record<string, string> = {
  en_pie: "En pie",
  talado: "Talado",
  descartado: "Descartado",
};

export const CENSO_ESTADO_COLOR: Record<string, string> = {
  en_pie: "#15803d",
  talado: "#b45309",
  descartado: "#6b7280",
};

/** Teal del DS — polígono del área de aprovechamiento (UMF). */
export const PARCELA_COLOR = "#0d9488";

export interface GeoEntry {
  lat: number;
  lng: number;
  section: string;
  code: string;
  species: string | null;
  cites: boolean;
  volumeM3: number | null;
  quantity: number | null;
  unit: string | null;
  photoUrl: string | null;
  date: string;
}

export interface CensoTree {
  id: string;
  lat: number;
  lng: number;
  code: string;
  species: string;
  cites: boolean;
  estado: string;
  dapM: number | null;
  volumeM3: number | null;
  /** Zona tal como la registró el regente (ej. "18L") — se muestra sin reinterpretar. */
  utmZona: string;
  utmX: number;
  utmY: number;
  /** Categoría del POA (aprovechable/semillero/bajo DMC…) si el plan la calculó. */
  categoria?: PoaCategoria;
}

/** Árbol del censo tal como lo devuelve `/api/admin/forestal/plan/census`. */
export interface CensusTreeDTO {
  id: string;
  treeCode: string;
  speciesCommon: string;
  cites?: boolean;
  dapM?: string | number | null;
  volumenEstimadoM3?: string | number | null;
  utmZona?: string | null;
  utmX?: string | number | null;
  utmY?: string | number | null;
  estado?: string | null;
  deletedAt?: string | null;
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const validCoord = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);

export const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Operaciones del libro con GPS capturado en campo. */
export function toGeo(entries: LothEntryDTO[]): GeoEntry[] {
  const out: GeoEntry[] = [];
  for (const e of entries) {
    if (e.status === "anulado") continue;
    const lat = num(e.gpsLat) ?? NaN;
    const lng = num(e.gpsLng) ?? NaN;
    if (!validCoord(lat, lng)) continue;
    out.push({
      lat,
      lng,
      section: e.section,
      code: e.trozaCode || e.treeCode || e.productType || "—",
      species: e.speciesCommon,
      cites: e.cites,
      volumeM3: num(e.volumeM3),
      quantity: num(e.quantity),
      unit: e.unit,
      photoUrl: e.photoUrl,
      date: e.entryDate,
    });
  }
  return out;
}

/**
 * Censo forestal → puntos del mapa. El regente registra el censo en UTM
 * (`utmX/utmY/utmZona`), no en lat/lng: acá se proyecta a geográficas para poder
 * dibujarlo junto a las operaciones y al polígono.
 */
export function toCenso(trees: CensusTreeDTO[]): CensoTree[] {
  const out: CensoTree[] = [];
  for (const t of trees) {
    if (t.deletedAt) continue;
    const x = num(t.utmX);
    const y = num(t.utmY);
    if (x == null || y == null || x <= 0 || y <= 0) continue;
    const { zone, south } = parseUtmZone(t.utmZona);
    const [lat, lng] = fromUtm(x, y, zone, south);
    if (!validCoord(lat, lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    out.push({
      id: t.id,
      lat,
      lng,
      code: t.treeCode,
      species: t.speciesCommon,
      cites: t.cites === true,
      estado: t.estado ?? "en_pie",
      dapM: num(t.dapM),
      volumeM3: num(t.volumenEstimadoM3),
      utmZona: (t.utmZona ?? "").trim() || `${zone}${south ? "S" : "N"}`,
      utmX: x,
      utmY: y,
    });
  }
  return out;
}

const fmtDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  } catch {
    return "";
  }
};

/** Popup de una operación del libro (incluye su coordenada UTM y la bandera EUDR). */
export function operacionPopupHtml(g: GeoEntry, dentro: boolean, declarada: boolean): string {
  const medida =
    g.volumeM3 != null ? `${g.volumeM3.toFixed(4)} m³` : g.quantity != null ? `${g.quantity.toFixed(2)} ${g.unit ?? ""}` : "";
  const foto = g.photoUrl
    ? `<img src="${esc(g.photoUrl)}" alt="" style="margin-top:6px;width:100%;max-height:120px;object-fit:cover;border-radius:6px" />`
    : "";
  const flag = declarada
    ? dentro
      ? '<div style="color:#15803d;font-weight:700">✓ dentro de la parcela</div>'
      : '<div style="color:#b91c1c;font-weight:700">✗ FUERA de la parcela</div>'
    : "";
  const utm = formatUtmFull(toUtm(g.lat, g.lng), 1);
  return `<div style="font:600 12px/1.5 system-ui;min-width:170px">
    <div style="font-weight:800;font-size:13px">${esc(g.code)}${g.cites ? ' <span style="color:#e11d48">CITES</span>' : ""}</div>
    <div style="color:${SECTION_COLOR[g.section] ?? "#334155"};font-weight:700">${esc(SECTION_LABEL[g.section] ?? g.section)}</div>
    ${g.species ? `<div>${esc(g.species)}</div>` : ""}
    ${medida ? `<div style="font-weight:700">${esc(medida)}</div>` : ""}
    <div style="font-family:ui-monospace,monospace;font-size:10.5px;opacity:.75">${esc(utm)}</div>
    ${g.date ? `<div style="opacity:.7">${esc(fmtDate(g.date))}</div>` : ""}
    ${flag}
    ${foto}
  </div>`;
}

/** Color del árbol en el mapa: manda la categoría POA; si no hay, el estado. */
export function censoColor(t: CensoTree): string {
  return t.categoria ? CATEGORIA_COLOR[t.categoria] : (CENSO_ESTADO_COLOR[t.estado] ?? "#15803d");
}

/** Popup de un árbol censado — muestra el UTM ORIGINAL registrado por el regente. */
export function arbolPopupHtml(t: CensoTree, dentro: boolean, declarada: boolean): string {
  const flag = declarada
    ? dentro
      ? '<div style="color:#15803d;font-weight:700">✓ dentro de la parcela</div>'
      : '<div style="color:#b91c1c;font-weight:700">✗ fuera del polígono declarado</div>'
    : "";
  return `<div style="font:600 12px/1.5 system-ui;min-width:170px">
    <div style="font-weight:800;font-size:13px">${esc(t.code)}${t.cites ? ' <span style="color:#e11d48">CITES</span>' : ""}</div>
    <div style="color:${censoColor(t)};font-weight:700">Censo · ${esc(CENSO_ESTADO_LABEL[t.estado] ?? t.estado)}${
      t.categoria ? ` · ${esc(CATEGORIA_LABEL[t.categoria])}` : ""
    }</div>
    <div>${esc(t.species)}</div>
    ${t.dapM != null ? `<div>DAP ${t.dapM.toFixed(2)} m</div>` : ""}
    ${t.volumeM3 != null ? `<div style="font-weight:700">${t.volumeM3.toFixed(4)} m³ estimados</div>` : ""}
    <div style="font-family:ui-monospace,monospace;font-size:10.5px;opacity:.75">${esc(t.utmZona)} · E ${Math.round(t.utmX)} · N ${Math.round(t.utmY)}</div>
    ${flag}
  </div>`;
}
