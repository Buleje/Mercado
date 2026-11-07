/**
 * loth-coords-io — entrada y salida de GEOMETRÍA del área de aprovechamiento en
 * los formatos con los que realmente trabaja un regente forestal:
 *
 *   ENTRADA  · texto/CSV de coordenadas UTM ("C.001  545060.02  9012340.07")
 *            · GeoJSON (Polygon / Feature / FeatureCollection)
 *            · KML (el `<coordinates>` que exporta Google Earth)
 *   SALIDA   · KML (para abrirlo en Google Earth y superponerlo al expediente)
 *
 * POR QUÉ EXISTE: el polígono casi nunca se dibuja a mano — llega en el cuadro
 * de coordenadas del plan de manejo o en el shapefile/KML que entregó el
 * consultor. Pegar esas coordenadas tiene que dar EXACTAMENTE el mismo polígono
 * que aprobó la ARFFS; un vértice mal leído mueve la parcela cientos de metros.
 *
 * PURO y client-safe (sin DOM, sin `lib/db/*`, sin `Date.now`).
 */

import type { LatLng } from "./loth-geo";
import { fromUtm, parseUtmZone, toUtm, vertexCode } from "./loth-utm";

export interface ParseResult {
  vertices: LatLng[];
  /** Formato detectado, para confirmarle al usuario qué se leyó. */
  formato: "utm" | "geograficas" | "geojson" | "kml" | "vacio";
  /** Zona UTM usada/asumida (solo en formato "utm"). */
  zone?: number;
  /** Líneas que no se pudieron interpretar (se muestran como advertencia). */
  ignoradas: string[];
}

const empty = (): ParseResult => ({ vertices: [], formato: "vacio", ignoradas: [] });

/** Rangos de un par UTM plausible en Perú (falso este 500 km, norte < 10 000 km). */
const looksLikeEasting = (n: number) => n >= 100_000 && n <= 999_999;
const looksLikeNorthing = (n: number) => n >= 1_000_000 && n <= 10_000_000;
const looksLikeLat = (n: number) => n >= -90 && n <= 90;
const looksLikeLng = (n: number) => n >= -180 && n <= 180;

/** Números de una línea: tolera coma decimal, separador de miles y símbolos. */
function numbersIn(line: string): number[] {
  const cleaned = line
    .replace(/[EN]\s*[:=]/gi, " ") // "E: 545060" → " 545060"
    .replace(/(\d)[  ](?=\d{3}\b)/g, "$1") // miles con espacio
    .replace(/(\d),(?=\d{3}\b)/g, "$1") // miles con coma
    .replace(/(\d),(?=\d{1,6}\b)/g, "$1."); // coma decimal
  const out: number[] = [];
  for (const m of cleaned.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const n = Number(m[0]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Texto pegado → vértices. Detecta si son UTM (este/norte) o geográficas
 * (lat/lng decimales) por la magnitud de los números, y descarta el correlativo
 * del vértice ("C.001", "1", "V-12") que suele venir en la 1ª columna.
 */
export function parseCoordText(text: string, zonaHint?: string | null): ParseResult {
  const raw = String(text ?? "").trim();
  if (!raw) return empty();

  const { zone, south } = parseUtmZone(zonaHint);
  const vertices: LatLng[] = [];
  const ignoradas: string[] = [];
  let utmCount = 0;
  let geoCount = 0;

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    // Encabezados ("VÉRTICE  ESTE  NORTE", "Punto | X | Y"): sin dígitos.
    if (!t || !/\d/.test(t)) continue;
    const nums = numbersIn(t);
    if (nums.length < 2) {
      ignoradas.push(t);
      continue;
    }
    // Par UTM: buscamos el (este, norte) o (norte, este) dentro de la línea.
    const e = nums.find(looksLikeEasting);
    const n = nums.find(looksLikeNorthing);
    if (e != null && n != null) {
      vertices.push(fromUtm(e, n, zone, south));
      utmCount++;
      continue;
    }
    // Par geográfico: dos decimales chicos; en Perú la latitud es negativa.
    const decimals = nums.filter((v) => !Number.isInteger(v) || Math.abs(v) <= 180);
    const lat = decimals.find((v) => looksLikeLat(v) && Math.abs(v) <= 90);
    const lng = decimals.find((v) => v !== lat && looksLikeLng(v));
    if (lat != null && lng != null) {
      // Si ambos caben en ±90 asumimos el orden convencional lat, lng.
      vertices.push([lat, lng]);
      geoCount++;
      continue;
    }
    ignoradas.push(t);
  }

  if (vertices.length === 0) return { ...empty(), ignoradas };
  return {
    vertices: dedupeClosingVertex(vertices),
    formato: utmCount >= geoCount ? "utm" : "geograficas",
    zone,
    ignoradas,
  };
}

/** Un anillo cerrado repite el 1er vértice al final: se descarta el duplicado. */
function dedupeClosingVertex(ring: LatLng[]): LatLng[] {
  if (ring.length > 2) {
    const [a, b] = [ring[0], ring[ring.length - 1]];
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) return ring.slice(0, -1);
  }
  return ring;
}

/** GeoJSON (Polygon · Feature · FeatureCollection) → primer anillo exterior. */
export function parseGeoJson(text: string): ParseResult {
  try {
    const g = JSON.parse(text) as Record<string, unknown>;
    const geom = pickGeometry(g);
    const coords = geom?.type === "Polygon" ? geom.coordinates?.[0] : null;
    if (!Array.isArray(coords)) return empty();
    const ring = coords
      .map((c) => [Number((c as number[])[1]), Number((c as number[])[0])] as LatLng)
      .filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln));
    if (ring.length < 3) return empty();
    return { vertices: dedupeClosingVertex(ring), formato: "geojson", ignoradas: [] };
  } catch {
    return empty();
  }
}

type Geometry = { type?: string; coordinates?: number[][][] };
function pickGeometry(g: Record<string, unknown>): Geometry | null {
  const t = g?.type;
  if (t === "Polygon") return g as Geometry;
  if (t === "Feature") return (g.geometry ?? null) as Geometry | null;
  if (t === "FeatureCollection") {
    const feats = (g.features ?? []) as { geometry?: Geometry }[];
    // El polígono manda: si el archivo trae también los puntos del censo, se ignoran.
    const poly = feats.find((f) => f?.geometry?.type === "Polygon");
    return poly?.geometry ?? null;
  }
  return null;
}

/**
 * KML → primer anillo. Lee el bloque `<coordinates>` (lng,lat[,alt] separados
 * por espacios) sin parser XML: los KML de Earth/QGIS son planos y regulares.
 */
export function parseKml(text: string): ParseResult {
  const m = text.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
  if (!m) return empty();
  const ring: LatLng[] = [];
  for (const tuple of m[1].trim().split(/\s+/)) {
    const [lng, lat] = tuple.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng) && looksLikeLat(lat) && looksLikeLng(lng)) ring.push([lat, lng]);
  }
  if (ring.length < 3) return empty();
  return { vertices: dedupeClosingVertex(ring), formato: "kml", ignoradas: [] };
}

/** Enruta por extensión/contenido: el usuario sube "el archivo" y listo. */
export function parseGeometryFile(name: string, content: string, zonaHint?: string | null): ParseResult {
  const lower = name.toLowerCase();
  if (lower.endsWith(".kml") || /<kml[\s>]/i.test(content)) return parseKml(content);
  if (lower.endsWith(".json") || lower.endsWith(".geojson") || content.trimStart().startsWith("{")) return parseGeoJson(content);
  return parseCoordText(content, zonaHint);
}

// ── Salida ───────────────────────────────────────────────────────────────────

const xmlEsc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] as string));

export interface KmlPoint {
  lat: number;
  lng: number;
  name: string;
  description?: string;
}

/**
 * KML del área + los puntos (censo/operaciones) para abrir en Google Earth. El
 * polígono va `clampToGround` con relleno translúcido, como espera un revisor.
 */
export function buildKml(opts: { ring: LatLng[]; name: string; description?: string; points?: KmlPoint[] }): string {
  const ring = opts.ring.length >= 3 ? [...opts.ring, opts.ring[0]] : [];
  const coords = ring.map(([la, ln]) => `${ln.toFixed(8)},${la.toFixed(8)},0`).join(" ");
  const placemarks = (opts.points ?? [])
    .map(
      (p) =>
        `<Placemark><name>${xmlEsc(p.name)}</name>` +
        (p.description ? `<description>${xmlEsc(p.description)}</description>` : "") +
        `<styleUrl>#pt</styleUrl><Point><coordinates>${p.lng.toFixed(8)},${p.lat.toFixed(8)},0</coordinates></Point></Placemark>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <name>${xmlEsc(opts.name)}</name>
  ${opts.description ? `<description>${xmlEsc(opts.description)}</description>` : ""}
  <Style id="umf"><LineStyle><color>ff2626dc</color><width>3</width></LineStyle><PolyStyle><color>332626dc</color></PolyStyle></Style>
  <Style id="pt"><IconStyle><color>ff3d8015</color><scale>0.9</scale></IconStyle></Style>
  ${
    coords
      ? `<Placemark><name>${xmlEsc(opts.name)}</name><styleUrl>#umf</styleUrl><Polygon><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`
      : ""
  }
  ${placemarks}
</Document></kml>`;
}

/** Cuadro de coordenadas en texto plano — para pegar en el informe del regente. */
export function verticesToUtmText(ring: LatLng[], zone: number): string {
  return ring
    .map((v, i) => {
      const u = toUtm(v[0], v[1], zone);
      return `${vertexCode(i)}\t${u.easting.toFixed(2)}\t${u.northing.toFixed(2)}`;
    })
    .join("\n");
}
