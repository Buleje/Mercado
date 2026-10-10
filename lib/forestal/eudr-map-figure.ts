/**
 * eudr-map-figure — figura de mapa reutilizable para los reportes DDS EUDR (Libro
 * TH y CTP). Devuelve un fragmento HTML con la imagen satelital Esri (export
 * estático `imageSR=4326` → proyección lineal exacta) + un overlay SVG con los
 * polígonos/puntos de las parcelas proyectados encima, y un bloque de firma.
 *
 * Puro y client-safe (string HTML, sin DOM/DB). Reusa la técnica de
 * `planta-plano-print`: bbox con rango mínimo ~1.3km para no salir del cache del
 * World_Imagery (bbox chico → HTTP 500) y `format=png` (no png32 → 400).
 */

export type LatLng = [number, number];

export interface FigurePolygon {
  code?: string;
  ring: LatLng[];
  color?: string;
}
export interface FigurePoint {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
}
export interface FigureAnchor {
  lat: number;
  lng: number;
  label: string;
}

const MIN_RANGE = 0.012; // ~1.3 km — dentro del cache de World_Imagery
const DEFAULT_POLY = "#0d9488";
const DEFAULT_PT = "#e11d48";
const ANCHOR_COLOR = "#0d9488";

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** CSS de la figura — inyectar en el <style> del reporte. */
export function eudrMapFigureCss(): string {
  return `
    .eudr-map { position: relative; width: 100%; max-width: 640px; margin: 0 auto 8px; border: 2px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
    .eudr-map img { display: block; width: 100%; height: auto; background: #0f172a; }
    .eudr-map svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .eudr-map-cap { text-align: center; font-size: 10.5px; color: #94a3b8; margin: 0 0 14px; }
    .eudr-firma { display: flex; justify-content: space-between; gap: 24px; margin-top: 36px; font-size: 12px; }
    .eudr-firma div { border-top: 1px solid #94a3b8; padding-top: 6px; width: 46%; text-align: center; color: #475569; }
  `;
}

/** Bloque de firma (dos columnas: responsable + sello/recepción). */
export function eudrSignatureBlock(left: string, right: string): string {
  return `<div class="eudr-firma"><div>${esc(left)}</div><div>${esc(right)}</div></div>`;
}

/**
 * Construye la figura de mapa (imagen satelital + overlay SVG). Devuelve "" si no
 * hay geometría con la que dibujar (el reporte omite la figura sin romperse).
 */
export function buildEudrMapFigure(opts: {
  polygons?: FigurePolygon[];
  points?: FigurePoint[];
  anchor?: FigureAnchor | null;
  caption?: string;
  height?: number;
}): string {
  const polygons = (opts.polygons ?? []).filter((p) => p.ring.length >= 3);
  const points = (opts.points ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0));
  const anchor = opts.anchor ?? null;

  const pts: LatLng[] = [];
  for (const poly of polygons) pts.push(...poly.ring);
  for (const p of points) pts.push([p.lat, p.lng]);
  if (anchor) pts.push([anchor.lat, anchor.lng]);
  if (pts.length === 0) return "";

  let latMin = Math.min(...pts.map((p) => p[0]));
  let latMax = Math.max(...pts.map((p) => p[0]));
  let lngMin = Math.min(...pts.map((p) => p[1]));
  let lngMax = Math.max(...pts.map((p) => p[1]));
  const latPad = Math.max((latMax - latMin) * 0.15, 0.0008);
  const lngPad = Math.max((lngMax - lngMin) * 0.15, 0.0008);
  latMin -= latPad; latMax += latPad; lngMin -= lngPad; lngMax += lngPad;
  const expand = (min: number, max: number): [number, number] => {
    const d = MIN_RANGE - (max - min);
    return d > 0 ? [min - d / 2, max + d / 2] : [min, max];
  };
  [latMin, latMax] = expand(latMin, latMax);
  [lngMin, lngMax] = expand(lngMin, lngMax);
  const latRange = latMax - latMin || MIN_RANGE;
  const lngRange = lngMax - lngMin || MIN_RANGE;

  const H = opts.height ?? 460;
  const W = Math.max(320, Math.min(1000, Math.round((H * lngRange) / latRange)));
  const bbox = `${lngMin},${latMin},${lngMax},${latMax}`;
  const imgUrl =
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export` +
    `?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=png&f=image`;

  const px = (lng: number) => ((lng - lngMin) / lngRange) * W;
  const py = (lat: number) => ((latMax - lat) / latRange) * H;

  const svgPolys = polygons
    .map((poly) => {
      const color = poly.color ?? DEFAULT_POLY;
      const pointsAttr = poly.ring.map(([la, ln]) => `${px(ln).toFixed(1)},${py(la).toFixed(1)}`).join(" ");
      const cLat = poly.ring.reduce((a, c) => a + c[0], 0) / poly.ring.length;
      const cLng = poly.ring.reduce((a, c) => a + c[1], 0) / poly.ring.length;
      const label = poly.code
        ? `<text x="${px(cLng).toFixed(1)}" y="${py(cLat).toFixed(1)}" font-size="13" font-weight="700" fill="#fff" stroke="#000" stroke-width="0.5" text-anchor="middle" paint-order="stroke">${esc(poly.code)}</text>`
        : "";
      return `<polygon points="${pointsAttr}" fill="${color}44" stroke="${color}" stroke-width="2.5" />${label}`;
    })
    .join("");

  const svgPoints = points
    .map((p) => {
      const color = p.color ?? DEFAULT_PT;
      const x = px(p.lng).toFixed(1);
      const y = py(p.lat).toFixed(1);
      const label = p.label
        ? `<text x="${x}" y="${(py(p.lat) - 10).toFixed(1)}" font-size="11" font-weight="700" fill="#fff" stroke="#000" stroke-width="0.5" text-anchor="middle" paint-order="stroke">${esc(p.label)}</text>`
        : "";
      return `<circle cx="${x}" cy="${y}" r="6" fill="${color}" stroke="#fff" stroke-width="2" />${label}`;
    })
    .join("");

  const svgAnchor = anchor
    ? `<circle cx="${px(anchor.lng).toFixed(1)}" cy="${py(anchor.lat).toFixed(1)}" r="7" fill="${ANCHOR_COLOR}" stroke="#fff" stroke-width="3" />` +
      `<text x="${px(anchor.lng).toFixed(1)}" y="${(py(anchor.lat) - 12).toFixed(1)}" font-size="11" font-weight="700" fill="#fff" stroke="#000" stroke-width="0.5" text-anchor="middle" paint-order="stroke">${esc(anchor.label)}</text>`
    : "";

  const caption = opts.caption
    ? `<p class="eudr-map-cap">${esc(opts.caption)}</p>`
    : `<p class="eudr-map-cap">Imagen satelital Esri World Imagery · geometría declarada por el titular</p>`;

  return (
    `<div class="eudr-map"><img src="${imgUrl}" alt="Ubicación de la parcela (satélite)" />` +
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${svgPolys}${svgPoints}${svgAnchor}</svg></div>` +
    caption
  );
}
