"use client";

/**
 * loth-plano-print — imprime el **PLANO DE UBICACIÓN** del área de
 * aprovechamiento del Libro TH, con el lenguaje cartográfico que espera la
 * ARFFS/SERFOR y el verificador EUDR:
 *
 *   · marco con cuadrícula UTM rotulada en los 4 bordes (Datum WGS 84),
 *   · base cartográfica (topográfica o satelital) del área,
 *   · polígono de la UMF + vértices numerados C.001…, censo forestal y
 *     operaciones geolocalizadas del libro,
 *   · recuadro de LEYENDA, mapa de UBICACIÓN DISTRITAL, norte y escala gráfica,
 *   · CUADRO DE COORDENADAS UTM de los vértices,
 *   · CAJETÍN (membrete) con ubicación política, área, datum, proyección y escala.
 *
 * Todo se compone como HTML/SVG en una ventana nueva: la imagen base viene del
 * export estático de Esri (`imageSR=4326` → proyección lineal exacta sobre el
 * bbox pedido), así que los vectores se proyectan encima con una regla de tres.
 *
 * Documento de referencia: NO reemplaza el plano visado por el regente.
 */

import { BRAND_GEO } from "@/lib/geo";
import type { LatLng } from "./loth-geo";
import { centroid, polygonAreaHa } from "./loth-geo";
import {
  dominantZone,
  formatMeters,
  formatDistance,
  gridLabel,
  niceBarLength,
  niceScaleDenominator,
  perimeterM,
  toUtm,
  utmGrid,
  vertexCode,
  zoneLabel,
} from "./loth-utm";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const BASEMAPS = {
  topo: `${ESRI}/World_Topo_Map/MapServer/export`,
  satelite: `${ESRI}/World_Imagery/MapServer/export`,
  calles: `${ESRI}/World_Street_Map/MapServer/export`,
} as const;
export type PlanoBasemap = keyof typeof BASEMAPS;

/** Ancho útil del mapa en el papel (A3 apaisado, márgenes 10 mm) — para la escala. */
const PRINT_MAP_WIDTH_CM = 25.5;
const MIN_RANGE_DEG = 0.012; // ~1.3 km: bbox mínimo dentro del cache de Esri
const FRAME_W = 1180;
const FRAME_H = 780;
const UMF_COLOR = "#dc2626";
const CENSO_COLOR = "#15803d";

export interface PlanoPunto {
  lat: number;
  lng: number;
  label: string;
  seccionLabel: string;
  color: string;
}
export interface PlanoArbol {
  lat: number;
  lng: number;
  code: string;
  species: string;
  estado: string;
}
export interface PlanoMeta {
  titulo: string;
  mapaNumero: string;
  sector: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
  titular: string | null;
  tituloHabilitante: string | null;
  planNumber: string | null;
  resolucion: string | null;
  arffs: string | null;
  parcelaCorta: string | null;
  areaAutorizadaHa: number | null;
  elaboradoPor: string | null;
  fuente: string;
}

/** Referencia del territorio a dibujar (centro poblado, campamento, ingreso…). */
export interface PlanoReferencia {
  lat: number;
  lng: number;
  nombre: string;
  tipoLabel: string;
  color: string;
}
/** Fila del cuadro "ACCESO A LA UMF". */
export interface PlanoAcceso {
  lugar: string;
  tiempo: string;
  movilidad: string;
}

/**
 * `ubicacion` (Mapa 1) = dónde queda la UMF: cuadro de coordenadas de los
 * vértices. `dispersion` (Mapa 2) = qué hay dentro y cómo se llega: cada árbol
 * censado rotulado, las referencias del territorio y el cuadro de acceso.
 */
export type PlanoVariante = "ubicacion" | "dispersion";

export interface PlanoOptions {
  parcela: LatLng[];
  puntos: PlanoPunto[];
  censo: PlanoArbol[];
  meta: PlanoMeta;
  basemap?: PlanoBasemap;
  variante?: PlanoVariante;
  referencias?: PlanoReferencia[];
  accesos?: PlanoAcceso[];
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const dash = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return s ? esc(s) : "—";
};

/** bbox que encuadra la geometría, ajustado al aspecto del marco (sin distorsión). */
function frameBounds(points: LatLng[]) {
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  let latMin = Math.min(...lats);
  let latMax = Math.max(...lats);
  let lngMin = Math.min(...lngs);
  let lngMax = Math.max(...lngs);

  const padLat = Math.max((latMax - latMin) * 0.18, 0.0015);
  const padLng = Math.max((lngMax - lngMin) * 0.18, 0.0015);
  latMin -= padLat; latMax += padLat; lngMin -= padLng; lngMax += padLng;

  const grow = (min: number, max: number, target: number): [number, number] => {
    const d = target - (max - min);
    return d > 0 ? [min - d / 2, max + d / 2] : [min, max];
  };
  [latMin, latMax] = grow(latMin, latMax, MIN_RANGE_DEG);
  [lngMin, lngMax] = grow(lngMin, lngMax, MIN_RANGE_DEG);

  // Corrección de aspecto: metros/píxel iguales en X e Y (si no, el plano miente).
  const cosLat = Math.cos(((latMin + latMax) / 2) * (Math.PI / 180));
  const wantLngRange = ((latMax - latMin) * (FRAME_W / FRAME_H)) / cosLat;
  if (wantLngRange > lngMax - lngMin) {
    [lngMin, lngMax] = grow(lngMin, lngMax, wantLngRange);
  } else {
    const wantLatRange = ((lngMax - lngMin) * cosLat * FRAME_H) / FRAME_W;
    [latMin, latMax] = grow(latMin, latMax, wantLatRange);
  }
  return { latMin, latMax, lngMin, lngMax, cosLat };
}

const exportUrl = (base: string, bbox: string, w: number, h: number) =>
  `${base}?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${w},${h}&format=png&f=image`;

/** Rosa de los vientos (norte cartográfico). */
const northArrowSvg = `<svg viewBox="0 0 60 76" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <polygon points="30,4 42,52 30,44 18,52" fill="#111827" />
  <polygon points="30,4 30,44 18,52" fill="#6b7280" />
  <circle cx="30" cy="52" r="15" fill="none" stroke="#111827" stroke-width="1.5" />
  <text x="30" y="74" font-size="15" font-weight="800" text-anchor="middle" fill="#111827">N</text>
</svg>`;

export function printLothPlano(opts: PlanoOptions): void {
  const { parcela, puntos, censo, meta } = opts;
  const basemap: PlanoBasemap = opts.basemap ?? "topo";
  const variante: PlanoVariante = opts.variante ?? "ubicacion";
  const referencias = opts.referencias ?? [];
  const accesos = opts.accesos ?? [];
  const esDispersion = variante === "dispersion";

  // ── 1. Encuadre ────────────────────────────────────────────────────────────
  const all: LatLng[] = [
    ...parcela,
    ...puntos.map((p): LatLng => [p.lat, p.lng]),
    ...censo.map((t): LatLng => [t.lat, t.lng]),
    ...referencias.map((r): LatLng => [r.lat, r.lng]),
  ];
  if (all.length === 0) all.push([BRAND_GEO.lat, BRAND_GEO.lng]);
  const { latMin, latMax, lngMin, lngMax, cosLat } = frameBounds(all);
  const latRange = latMax - latMin;
  const lngRange = lngMax - lngMin;
  const px = (lng: number) => ((lng - lngMin) / lngRange) * FRAME_W;
  const py = (lat: number) => ((latMax - lat) / latRange) * FRAME_H;

  const zone = dominantZone(all);
  const south = latMax < 0 || (latMin + latMax) / 2 < 0;
  const bbox = `${lngMin},${latMin},${lngMax},${latMax}`;
  const imgUrl = exportUrl(BASEMAPS[basemap], bbox, FRAME_W, FRAME_H);
  const fallbackUrl = exportUrl(BASEMAPS.satelite, bbox, FRAME_W, FRAME_H);

  // ── 2. Escala + cuadrícula ─────────────────────────────────────────────────
  const groundWidthM = lngRange * cosLat * 111_320;
  const denominator = niceScaleDenominator(groundWidthM, PRINT_MAP_WIDTH_CM);
  const barM = niceBarLength(groundWidthM / 3);
  // La barra gráfica va DENTRO del SVG (unidades del viewBox): así escala exacto
  // con el mapa impreso, sin depender de cuántos píxeles mida el papel.
  const barW = (barM / groundWidthM) * FRAME_W;
  const barX = (FRAME_W - barW) / 2;
  const barY = FRAME_H - 34;
  const seg = barW / 4;
  const svgScaleBar =
    `<g font-family="system-ui, sans-serif">` +
    `<rect x="${(barX - 26).toFixed(1)}" y="${(barY - 15).toFixed(1)}" width="${(barW + 52).toFixed(1)}" height="34" rx="4" fill="#ffffff" fill-opacity=".88" stroke="#111827" stroke-width="1" />` +
    Array.from({ length: 4 }, (_, i) =>
      `<rect x="${(barX + i * seg).toFixed(1)}" y="${barY.toFixed(1)}" width="${seg.toFixed(1)}" height="8" fill="${i % 2 ? "#ffffff" : "#111827"}" stroke="#111827" stroke-width="1" />`,
    ).join("") +
    `<text x="${barX.toFixed(1)}" y="${(barY - 4).toFixed(1)}" font-size="10" font-weight="700" text-anchor="middle" fill="#111827">0</text>` +
    `<text x="${(barX + barW / 2).toFixed(1)}" y="${(barY - 4).toFixed(1)}" font-size="10" font-weight="700" text-anchor="middle" fill="#111827">${esc(formatDistance(barM / 2))}</text>` +
    `<text x="${(barX + barW).toFixed(1)}" y="${(barY - 4).toFixed(1)}" font-size="10" font-weight="700" text-anchor="middle" fill="#111827">${esc(formatDistance(barM))}</text>` +
    `</g>`;

  const { step, lines } = utmGrid({ latMin, latMax, lngMin, lngMax }, zone);
  // Doble trazo (casing blanco + guion oscuro): la cuadrícula se lee igual sobre
  // el satélite oscuro que sobre la carta topográfica clara.
  const gridPaths = lines
    .map((l) => {
      const d = l.path.map(([la, ln], i) => `${i === 0 ? "M" : "L"}${px(ln).toFixed(1)},${py(la).toFixed(1)}`).join(" ");
      return (
        `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-opacity="0.55" />` +
        `<path d="${d}" fill="none" stroke="#1f2937" stroke-width="0.9" stroke-opacity="0.75" stroke-dasharray="7 6" />`
      );
    })
    .join("");
  // Rótulos de la cuadrícula en las reglas del marco (posición %).
  const tickE = lines
    .filter((l) => l.axis === "E")
    .map((l) => ({ pct: (px(l.path[Math.floor(l.path.length / 2)][1]) / FRAME_W) * 100, label: gridLabel(l.value, step) }))
    .filter((t) => t.pct > 3 && t.pct < 97);
  const tickN = lines
    .filter((l) => l.axis === "N")
    .map((l) => ({ pct: (py(l.path[Math.floor(l.path.length / 2)][0]) / FRAME_H) * 100, label: gridLabel(l.value, step) }))
    .filter((t) => t.pct > 3 && t.pct < 97);

  const rulerX = (pos: "top" | "bottom") =>
    tickE.map((t) => `<span class="tk" style="left:${t.pct.toFixed(2)}%">${esc(t.label)}</span>`).join("") +
    (pos === "top" ? "" : "");
  const rulerY = () => tickN.map((t) => `<span class="tk" style="top:${t.pct.toFixed(2)}%">${esc(t.label)}</span>`).join("");

  // ── 3. Vectores ────────────────────────────────────────────────────────────
  const hasParcela = parcela.length >= 3;
  const areaHa = hasParcela ? polygonAreaHa(parcela) : 0;
  const perimKm = hasParcela ? perimeterM(parcela) / 1000 : 0;

  const svgParcela = hasParcela
    ? `<polygon points="${parcela.map(([la, ln]) => `${px(ln).toFixed(1)},${py(la).toFixed(1)}`).join(" ")}" fill="${UMF_COLOR}18" stroke="${UMF_COLOR}" stroke-width="3" stroke-linejoin="round" />`
    : "";
  // Los vértices se dibujan TODOS; el rótulo se omite si se pisaría con el
  // anterior (en un polígono denso el cuadro de coordenadas ya los lista).
  const LABEL_MIN_PX = 26;
  const labeled: { x: number; y: number }[] = [];
  const svgVertices = parcela
    .map((v, i) => {
      const x = px(v[1]);
      const y = py(v[0]);
      const dot = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="#111827" stroke="#fff" stroke-width="1.4" />`;
      if (labeled.some((p) => Math.hypot(p.x - x, p.y - y) < LABEL_MIN_PX)) return dot;
      labeled.push({ x, y });
      return (
        dot +
        `<text x="${(x + 6).toFixed(1)}" y="${(y - 5).toFixed(1)}" font-size="10.5" font-weight="700" fill="#111827" stroke="#fff" stroke-width="2.6" paint-order="stroke">${esc(vertexCode(i))}</text>`
      );
    })
    .join("");

  const svgCenso = censo
    .map((t) => {
      const x = px(t.lng);
      const y = py(t.lat);
      const fill = t.estado === "talado" ? "#b45309" : t.estado === "descartado" ? "#6b7280" : CENSO_COLOR;
      const tri = `<polygon points="${x.toFixed(1)},${(y - 5).toFixed(1)} ${(x + 4.5).toFixed(1)},${(y + 3.5).toFixed(1)} ${(x - 4.5).toFixed(1)},${(y + 3.5).toFixed(1)}" fill="${fill}" stroke="#fff" stroke-width="1.1" />`;
      if (!esDispersion) return tri;
      // Mapa 2: el árbol censado se identifica en el plano (dispersión).
      return (
        tri +
        `<text x="${(x + 6).toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="9.5" font-weight="700" fill="#111827" stroke="#fff" stroke-width="2.4" paint-order="stroke">${esc(t.code)}</text>`
      );
    })
    .join("");

  const svgPuntos = puntos
    .map((p) => {
      const x = px(p.lng).toFixed(1);
      const y = py(p.lat).toFixed(1);
      return `<circle cx="${x}" cy="${y}" r="5.5" fill="${p.color}" stroke="#fff" stroke-width="1.8" />` +
        `<text x="${x}" y="${(py(p.lat) - 9).toFixed(1)}" font-size="10" font-weight="700" text-anchor="middle" fill="#111827" stroke="#fff" stroke-width="2.4" paint-order="stroke">${esc(p.label)}</text>`;
    })
    .join("");

  const svgRefs = referencias
    .map((r) => {
      const x = px(r.lng);
      const y = py(r.lat);
      return (
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${r.color}" stroke="#fff" stroke-width="2" />` +
        `<text x="${(x + 9).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="11" font-weight="700" fill="#111827" stroke="#fff" stroke-width="2.6" paint-order="stroke">${esc(r.nombre)}</text>`
      );
    })
    .join("");

  // ── 4. Inset de ubicación distrital ────────────────────────────────────────
  const cLat = (latMin + latMax) / 2;
  const cLng = (lngMin + lngMax) / 2;
  const INSET_DEG = 1.6;
  const insetUrl = exportUrl(
    BASEMAPS.topo,
    `${cLng - INSET_DEG},${cLat - INSET_DEG * 0.75},${cLng + INSET_DEG},${cLat + INSET_DEG * 0.75}`,
    420,
    315,
  );

  // ── 5. Cuadro de coordenadas ───────────────────────────────────────────────
  const verticesUtm = parcela.map((v, i) => {
    const u = toUtm(v[0], v[1], zone);
    return { code: vertexCode(i), este: formatMeters(u.easting, 2), norte: formatMeters(u.northing, 2) };
  });
  const OVERLAY_MAX = 22; // sobre el mapa solo si entra; si no, va debajo
  const coordRows = verticesUtm
    .map((v) => `<tr><td>${esc(v.code)}</td><td class="num">${esc(v.este)}</td><td class="num">${esc(v.norte)}</td></tr>`)
    .join("");
  const coordTable = verticesUtm.length
    ? `<table class="coord"><thead><tr><th>VÉRTICE</th><th>ESTE (m)</th><th>NORTE (m)</th></tr></thead><tbody>${coordRows}</tbody></table>`
    : "";
  const accesoTable = accesos.length
    ? `<table class="coord"><thead><tr><th>TRAMO</th><th>TIEMPO</th><th>MOVILIDAD</th></tr></thead><tbody>${accesos
        .map((a) => `<tr><td>${esc(a.lugar)}</td><td>${dash(a.tiempo)}</td><td>${dash(a.movilidad)}</td></tr>`)
        .join("")}</tbody></table>`
    : "";
  const coordOverlay = esDispersion
    ? accesoTable
      ? `<div class="box coordbox" style="width:250px"><div class="box-h">ACCESO A LA UMF</div>${accesoTable}</div>`
      : ""
    : verticesUtm.length > 0 && verticesUtm.length <= OVERLAY_MAX
      ? `<div class="box coordbox"><div class="box-h">COORDENADAS UTM · ${esc(zoneLabel(zone, south))}</div>${coordTable}</div>`
      : "";
  const coordBelow =
    !esDispersion && verticesUtm.length > OVERLAY_MAX
      ? `<section class="below"><h2>COORDENADAS UTM DE LOS VÉRTICES · WGS 84 ZONA ${esc(zoneLabel(zone, south))}</h2><div class="coordcols">${coordTable}</div></section>`
      : "";

  // ── 6. Leyenda ─────────────────────────────────────────────────────────────
  const seccionesLeyenda = [...new Map(puntos.map((p) => [p.seccionLabel, p.color])).entries()];
  const censoEstados = [...new Set(censo.map((t) => t.estado))];
  const ESTADO_LABEL: Record<string, string> = { en_pie: "Árbol censado en pie", talado: "Árbol talado", descartado: "Árbol descartado" };
  const ESTADO_COLOR: Record<string, string> = { en_pie: CENSO_COLOR, talado: "#b45309", descartado: "#6b7280" };
  const legendItems = [
    hasParcela ? `<li><span class="sw poly"></span>Área de aprovechamiento (UMF)</li>` : "",
    hasParcela ? `<li><span class="sw dot" style="background:#111827"></span>Vértice del polígono (C.001…)</li>` : "",
    ...censoEstados.map(
      (e) => `<li><span class="sw tri" style="border-bottom-color:${ESTADO_COLOR[e] ?? CENSO_COLOR}"></span>${esc(ESTADO_LABEL[e] ?? e)}</li>`,
    ),
    ...seccionesLeyenda.map(([label, color]) => `<li><span class="sw dot" style="background:${color}"></span>${esc(label)}</li>`),
    ...[...new Map(referencias.map((r) => [r.tipoLabel, r.color])).entries()].map(
      ([label, color]) => `<li><span class="sw dot" style="background:${color}"></span>${esc(label)}</li>`,
    ),
    `<li><span class="sw grid"></span>Cuadrícula UTM cada ${esc(formatDistance(step))}</li>`,
  ]
    .filter(Boolean)
    .join("");

  // ── 7. Cajetín ─────────────────────────────────────────────────────────────
  const fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
  const ubicacion: [string, string][] = [
    ["SECTOR", dash(meta.sector ?? meta.parcelaCorta)],
    ["DISTRITO", dash(meta.distrito)],
    ["PROVINCIA", dash(meta.provincia)],
    ["DEPARTAMENTO", dash(meta.departamento)],
  ];
  const centro = hasParcela ? centroid(parcela) : null;
  const centroUtm = centro ? toUtm(centro[0], centro[1], zone) : null;
  const tecnicos: [string, string][] = [
    ["ÁREA UMF", hasParcela ? `${areaHa.toFixed(2)} ha` : "—"],
    ["PERÍMETRO", hasParcela ? `${perimKm.toFixed(2)} km` : "—"],
    ["VÉRTICES", hasParcela ? String(parcela.length) : "—"],
    [
      "CENTROIDE",
      centroUtm ? `E ${formatMeters(centroUtm.easting, 0)} · N ${formatMeters(centroUtm.northing, 0)}` : "—",
    ],
    ["ÁREA AUTORIZADA", meta.areaAutorizadaHa != null ? `${meta.areaAutorizadaHa.toFixed(2)} ha` : "—"],
    ["DATUM", `WGS 84 · ZONA ${zoneLabel(zone, south)}`],
    ["PROYECCIÓN", "UTM"],
    ["ESCALA", `1:${denominator.toLocaleString("es-PE")}`],
  ];
  const legales: [string, string][] = [
    ["TITULAR", dash(meta.titular)],
    ["TÍTULO HABILITANTE", dash(meta.tituloHabilitante)],
    ["DOC. DE GESTIÓN", dash(meta.planNumber)],
    ["RESOLUCIÓN", dash(meta.resolucion)],
    ["ARFFS", dash(meta.arffs)],
    ["PARCELA DE CORTA", dash(meta.parcelaCorta)],
  ];
  const kv = (rows: [string, string][]) =>
    rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join("");

  // ── 8. Documento ───────────────────────────────────────────────────────────
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(meta.titulo)} — Mapa ${esc(meta.mapaNumero)}</title>
<style>
  @page { size: A3 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; color: #111827; margin: 0; padding: 14px; background: #fff; font-size: 12px; }
  .sheet { border: 2px solid #111827; padding: 10px; }
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111827; padding-bottom: 7px; margin-bottom: 10px; }
  .head h1 { font-size: 17px; margin: 0; letter-spacing: .4px; text-transform: uppercase; }
  .head .sub { font-size: 11px; color: #4b5563; margin-top: 2px; }
  .head .mapno { text-align: center; border: 2px solid #111827; padding: 3px 14px; }
  .head .mapno b { display: block; font-size: 22px; line-height: 1; }
  .head .mapno span { font-size: 9px; letter-spacing: 1px; }

  /* Marco cartográfico: reglas de coordenadas alrededor del mapa */
  .mapwrap { position: relative; padding: 17px 46px; border: 1px solid #111827; background: #fff; }
  .frame { position: relative; width: 100%; aspect-ratio: ${FRAME_W} / ${FRAME_H}; border: 1.5px solid #111827; overflow: hidden; background: #e5e7eb; }
  .frame > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
  .frame > svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .ruler { position: absolute; font-size: 8px; font-weight: 700; color: #374151; letter-spacing: .2px; }
  .ruler.top, .ruler.bot { left: 46px; right: 46px; height: 17px; }
  .ruler.top { top: 0; } .ruler.bot { bottom: 0; }
  .ruler.top .tk, .ruler.bot .tk { position: absolute; transform: translateX(-50%); white-space: nowrap; }
  .ruler.left, .ruler.right { top: 17px; bottom: 17px; width: 46px; }
  .ruler.left { left: 0; } .ruler.right { right: 0; }
  .ruler.left .tk, .ruler.right .tk { position: absolute; transform: translateY(-50%); white-space: nowrap; display: block; width: 100%; text-align: center; }

  /* Recuadros sobre el mapa */
  .box { position: absolute; background: rgba(255,255,255,.94); border: 1.5px solid #111827; box-shadow: 0 1px 4px rgba(0,0,0,.18); }
  .box-h { background: #111827; color: #fff; font-size: 9px; font-weight: 800; letter-spacing: .7px; padding: 3px 8px; text-align: center; }
  .legend { right: 8px; bottom: 8px; width: 232px; }
  .legend ul { list-style: none; margin: 0; padding: 6px 8px; font-size: 9.5px; line-height: 1.75; }
  .legend li { display: flex; align-items: center; gap: 7px; }
  .sw { flex: none; width: 15px; height: 11px; display: inline-block; }
  .sw.dot { width: 10px; height: 10px; border-radius: 50%; border: 1.4px solid #fff; outline: 1px solid #111827; }
  .sw.poly { background: ${UMF_COLOR}22; border: 2px solid ${UMF_COLOR}; }
  .sw.tri { width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 10px solid ${CENSO_COLOR}; }
  .sw.grid { border-top: 1.5px dashed #6b7280; height: 1px; }
  .inset { right: 8px; top: 8px; width: 234px; }
  .inset img { display: block; width: 100%; height: auto; }
  .inset .pin { position: absolute; left: 50%; top: calc(50% + 8px); width: 15px; height: 15px; margin: -7px 0 0 -7px; border: 2.5px solid ${UMF_COLOR}; border-radius: 50%; box-shadow: 0 0 0 2px rgba(255,255,255,.85); }
  .coordbox { left: 8px; top: 8px; width: 196px; max-height: calc(100% - 16px); overflow: hidden; }
  table.coord { border-collapse: collapse; width: 100%; font-size: 8.5px; }
  table.coord th, table.coord td { border: .5px solid #9ca3af; padding: 1.5px 4px; text-align: left; }
  table.coord thead th { background: #f3f4f6; font-size: 7.5px; letter-spacing: .3px; }
  table.coord td.num { font-variant-numeric: tabular-nums; text-align: right; }
  .navbox { left: 8px; bottom: 8px; display: flex; align-items: center; gap: 10px; padding: 7px 10px; }
  .navbox svg { width: 26px; height: 34px; }
  .scale .lbl { font-size: 8.5px; font-weight: 700; margin-top: 2px; color: #4b5563; line-height: 1.3; }
  .scale .den { font-size: 10px; font-weight: 800; }

  /* Pie: cajetín + cuadros */
  .foot { display: grid; grid-template-columns: 1.05fr 1fr 1.15fr; gap: 8px; margin-top: 9px; }
  .panel { border: 1.5px solid #111827; }
  .panel h3 { margin: 0; background: #111827; color: #fff; font-size: 9px; font-weight: 800; letter-spacing: .7px; padding: 3px 8px; text-align: center; }
  table.kv { border-collapse: collapse; width: 100%; font-size: 9.5px; }
  table.kv th, table.kv td { border: .5px solid #d1d5db; padding: 3px 7px; text-align: left; vertical-align: top; }
  table.kv th { background: #f9fafb; width: 44%; font-size: 8.5px; letter-spacing: .3px; color: #374151; }
  .sign { display: flex; gap: 18px; margin-top: 10px; font-size: 10px; }
  .sign div { flex: 1; border-top: 1px solid #6b7280; padding-top: 5px; text-align: center; color: #4b5563; }
  .note { margin-top: 8px; font-size: 8.5px; color: #6b7280; line-height: 1.5; border-top: .5px solid #e5e7eb; padding-top: 6px; }
  .below { margin-top: 10px; }
  .below h2 { font-size: 11px; margin: 0 0 5px; letter-spacing: .5px; }
  .coordcols { column-count: 4; column-gap: 10px; }
  @media print { body { padding: 0; } .box { box-shadow: none; } }
</style></head><body>
<div class="sheet">
  <div class="head">
    <div>
      <h1>${esc(meta.titulo)}</h1>
      <div class="sub">${dash(meta.titular)}${meta.tituloHabilitante ? ` · Título habilitante ${esc(meta.tituloHabilitante)}` : ""} · Generado ${esc(fecha)}</div>
    </div>
    <div class="mapno"><span>MAPA</span><b>${esc(meta.mapaNumero)}</b></div>
  </div>

  <div class="mapwrap">
    <div class="ruler top">${rulerX("top")}</div>
    <div class="ruler bot">${rulerX("bottom")}</div>
    <div class="ruler left">${rulerY()}</div>
    <div class="ruler right">${rulerY()}</div>

    <div class="frame">
      <img src="${imgUrl}" alt="Base cartográfica del área de aprovechamiento" onerror="this.onerror=null;this.src='${fallbackUrl}'" />
      <svg viewBox="0 0 ${FRAME_W} ${FRAME_H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        ${gridPaths}${svgParcela}${svgCenso}${svgPuntos}${svgVertices}${svgRefs}${svgScaleBar}
      </svg>

      ${coordOverlay}

      <div class="box inset">
        <div class="box-h">UBICACIÓN DISTRITAL</div>
        <div style="position:relative"><img src="${insetUrl}" alt="Ubicación distrital" /><span class="pin"></span></div>
      </div>

      <div class="box legend">
        <div class="box-h">LEYENDA</div>
        <ul>${legendItems}</ul>
      </div>

      <div class="box navbox">
        ${northArrowSvg}
        <div class="scale">
          <div class="den">1:${denominator.toLocaleString("es-PE")}</div>
          <div class="lbl">Escala gráfica<br />0 — ${esc(formatDistance(barM))}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="foot">
    <div class="panel"><h3>UBICACIÓN POLÍTICA</h3><table class="kv">${kv(ubicacion)}</table></div>
    <div class="panel"><h3>DATOS CARTOGRÁFICOS</h3><table class="kv">${kv(tecnicos)}</table></div>
    <div class="panel"><h3>TÍTULO HABILITANTE</h3><table class="kv">${kv(legales)}</table></div>
  </div>

  ${coordBelow}

  <div class="sign">
    <div>Titular del título habilitante</div>
    <div>Regente forestal (firma y sello)</div>
    <div>Recepción ARFFS / OSINFOR</div>
  </div>

  <p class="note">
    Fuente: ${esc(meta.fuente)}. Elaborado por ${dash(meta.elaboradoPor)} desde el Libro de Operaciones del Titular (LO-TH) —
    geometría declarada por el titular y censo forestal registrado en el plan de manejo. Coordenadas proyectadas UTM sobre
    Datum WGS 84, zona ${esc(zoneLabel(zone, south))}; la conversión es analítica (serie de Snyder, error &lt; 1 m) y no sustituye un
    levantamiento geodésico. Documento de referencia para fiscalización y para la Declaración de Diligencia Debida (EUDR ·
    Reglamento UE 2023/1115); no reemplaza el plano visado ni el registro oficial en el MC-SNIFFS de SERFOR.
  </p>
</div>
<script>
  (function () {
    var done = false;
    function go() { if (done) return; done = true; setTimeout(function () { window.print(); }, 250); }
    var imgs = Array.prototype.slice.call(document.images);
    var pending = imgs.filter(function (i) { return !i.complete; }).length;
    if (pending === 0) return go();
    imgs.forEach(function (i) {
      i.addEventListener('load', function () { if (--pending <= 0) go(); });
      i.addEventListener('error', function () { if (--pending <= 0) go(); });
    });
    setTimeout(go, 9000);
  })();
</script>
</body></html>`;

  const w = window.open("", "_blank", "width=1280,height=900");
  if (!w) throw new Error("El navegador bloqueó la ventana. Permití pop-ups para imprimir el plano.");
  w.document.write(html);
  w.document.close();
  w.focus();
}
