/**
 * loth-geo — cerebro geoespacial del Libro de Operaciones TH: cumplimiento del
 * Reglamento UE 2023/1115 (EUDR · Antideforestación) sobre las operaciones
 * geolocalizadas del libro.
 *
 * PURO y client-safe (NO importar `lib/db/*`). Lo consumen el mapa
 * (`LothMapaView` + `LothEudrRail`), el endpoint `/loth/parcela` (normalización)
 * y el export GeoJSON de la Declaración de Diligencia Debida (DDS).
 *
 * POR QUÉ EXISTE:
 * a partir del 30-dic-2025 la UE exige que la madera importada acredite (1) la
 * GEOLOCALIZACIÓN de la parcela de aprovechamiento y (2) que esté libre de
 * deforestación posterior al 31-dic-2020, en una DDS con las coordenadas en
 * formato GeoJSON. El Libro TH ya captura el GPS de cada tala (`gpsLat/gpsLng`):
 * esto lo convierte en el polígono de la parcela + los chequeos EUDR + el export.
 *
 * Toda la matemática es geodésica pura (sin dependencias: no hay turf en el
 * repo) — ray-casting para punto-en-polígono y la fórmula esférica de área
 * (la misma de `@turf/area`, radio WGS84).
 */

/** Corte EUDR: la producción no puede provenir de tierra deforestada después. */
export const EUDR_CUTOFF_DATE = "2020-12-31";

/** Radio mayor del elipsoide WGS84 (m) — para el área esférica. */
const WGS84_RADIUS = 6_378_137;

/** [lat, lng] — mismo orden que Leaflet (OJO: GeoJSON usa [lng, lat]). */
export type LatLng = [number, number];

export interface LothParcela {
  /** Vértices del polígono del área de aprovechamiento ([lat, lng]). */
  vertices: LatLng[];
  /** Nota libre (ej. "PCA 2026", nombre de la parcela de corta anual). */
  nota: string;
  /**
   * Declaración del titular: la parcela está libre de deforestación posterior al
   * corte EUDR (31-dic-2020). Es una atestación legal, no un cálculo satelital.
   */
  deforestacionCero: boolean;
  /** ISO de la última edición (sello best-effort; lo setea la capa DB). */
  updatedAt: string | null;
}

export function emptyParcela(): LothParcela {
  return { vertices: [], nota: "", deforestacionCero: false, updatedAt: null };
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

const isFiniteCoord = (lat: unknown, lng: unknown): boolean =>
  typeof lat === "number" &&
  typeof lng === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180 &&
  !(lat === 0 && lng === 0); // 0,0 = GPS no capturado (Golfo de Guinea)

/**
 * Normaliza la entrada del editor/API a una parcela canónica. Descarta vértices
 * inválidos; si quedan <3 la parcela se considera "no declarada" (vertices=[]).
 */
export function normalizeParcela(raw: unknown): LothParcela {
  const o = (raw ?? {}) as Record<string, unknown>;
  const rawVerts = Array.isArray(o.vertices) ? o.vertices : [];
  const vertices: LatLng[] = [];
  for (const v of rawVerts.slice(0, 500)) {
    const pair = v as unknown[];
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const lat = Number(pair[0]);
    const lng = Number(pair[1]);
    if (isFiniteCoord(lat, lng)) vertices.push([lat, lng]);
  }
  const nota = typeof o.nota === "string" ? o.nota.trim().slice(0, 160) : "";
  const deforestacionCero = o.deforestacionCero === true;
  const updatedAt = typeof o.updatedAt === "string" ? o.updatedAt : null;
  return { vertices: vertices.length >= 3 ? vertices : [], nota, deforestacionCero, updatedAt };
}

/** ¿Hay un polígono válido declarado? */
export function hasParcela(p: LothParcela | null | undefined): boolean {
  return !!p && p.vertices.length >= 3;
}

/**
 * Punto dentro de polígono — ray casting (even-odd). El polígono es un anillo
 * [lat,lng] (no hace falta cerrarlo: el módulo cicla). O(n).
 */
export function pointInPolygon(point: LatLng, ring: LatLng[]): boolean {
  const n = ring.length;
  if (n < 3) return false;
  const [py, px] = point; // y=lat, x=lng
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Área geodésica del polígono en m² (fórmula esférica de excedente, [lat,lng]).
 * Espeja `ringArea` de @turf/area adaptada al orden lat/lng.
 */
function polygonAreaM2(ring: LatLng[]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n];
    const next = ring[(i + 1) % n];
    total += (toRad(next[1]) - toRad(prev[1])) * Math.sin(toRad(ring[i][0]));
  }
  return Math.abs((total * WGS84_RADIUS * WGS84_RADIUS) / 2);
}

/** Área del polígono en hectáreas. */
export function polygonAreaHa(ring: LatLng[]): number {
  return polygonAreaM2(ring) / 10_000;
}

/**
 * Anillo [lat,lng] → string GeoJSON `Polygon` (cierra el anillo; GeoJSON usa
 * [lng,lat]). Lo consume el editor de polígono de orígenes del CTP.
 */
export function ringToGeoJsonPolygon(ring: LatLng[]): string {
  const coords = ring.map(([lat, lng]) => [lng, lat]);
  if (coords.length) coords.push(coords[0]);
  return JSON.stringify({ type: "Polygon", coordinates: [coords] });
}

/**
 * string GeoJSON `Polygon` → anillo [lat,lng] (descarta el vértice de cierre
 * duplicado). Tolerante a JSON corrupto/forma inválida (devuelve []).
 */
export function geoJsonPolygonToRing(polygonJson: string | null | undefined): LatLng[] {
  if (!polygonJson) return [];
  try {
    const g = JSON.parse(polygonJson) as { coordinates?: number[][][] };
    const coords = g?.coordinates?.[0];
    if (!Array.isArray(coords)) return [];
    const ring = coords
      .map((c) => [Number(c[1]), Number(c[0])] as LatLng)
      .filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln));
    if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
    return ring;
  } catch {
    return [];
  }
}

/** Centroide simple (promedio de vértices) — para centrar el mapa / etiqueta. */
export function centroid(ring: LatLng[]): LatLng | null {
  if (ring.length === 0) return null;
  let lat = 0;
  let lng = 0;
  for (const [la, ln] of ring) {
    lat += la;
    lng += ln;
  }
  return [lat / ring.length, lng / ring.length];
}

// ─── EUDR readiness ──────────────────────────────────────────────────────────

/** Operación mínima del libro para evaluar EUDR (subset del DTO). */
export interface OpForEudr {
  section: string;
  lat: number | null;
  lng: number | null;
  cites: boolean;
  status?: string | null;
}

export interface EudrCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  /** Peso del check en el score 0-100. */
  weight: number;
}

export interface EudrReadiness {
  parcelaDeclarada: boolean;
  areaHa: number;
  talaTotal: number;
  talaGeo: number;
  /** % de talas con GPS (métrica EUDR: cada árbol tumbado, geolocalizado). */
  coberturaPct: number;
  geoTotal: number;
  dentro: number;
  fuera: number;
  deforestacionCero: boolean;
  checks: EudrCheck[];
  /** 0-100 ponderado. */
  score: number;
  /** Veredicto: la madera resiste una verificación EUDR. */
  listo: boolean;
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Evalúa el estado EUDR del libro a partir de todas las operaciones + la parcela.
 * Puro y determinístico (sin `Date.now`) — testeable.
 */
export function computeEudrReadiness(ops: OpForEudr[], parcela: LothParcela): EudrReadiness {
  const vivos = ops.filter((o) => o.status !== "anulado");
  const talas = vivos.filter((o) => o.section === "tala");
  const geoTala = talas.filter((o) => isFiniteCoord(o.lat, o.lng));
  const geoAll = vivos.filter((o) => isFiniteCoord(o.lat, o.lng));

  const declarada = hasParcela(parcela);
  const areaHa = declarada ? polygonAreaHa(parcela.vertices) : 0;

  let dentro = 0;
  let fuera = 0;
  if (declarada) {
    for (const o of geoAll) {
      if (pointInPolygon([o.lat as number, o.lng as number], parcela.vertices)) dentro++;
      else fuera++;
    }
  }

  const talaTotal = talas.length;
  const talaGeo = geoTala.length;
  const coberturaPct = talaTotal > 0 ? clampPct((talaGeo / talaTotal) * 100) : 0;

  const checks: EudrCheck[] = [
    {
      key: "parcela",
      label: "Parcela de aprovechamiento declarada",
      ok: declarada,
      detail: declarada
        ? `Polígono de ${parcela.vertices.length} vértices · ${areaHa.toFixed(2)} ha`
        : "Dibujá el polígono del área de aprovechamiento en el mapa",
      weight: 30,
    },
    {
      key: "cobertura",
      label: "Talas geolocalizadas",
      ok: talaTotal > 0 && talaGeo === talaTotal,
      detail:
        talaTotal === 0
          ? "Aún no hay talas registradas"
          : `${talaGeo} de ${talaTotal} talas con GPS (${coberturaPct}%)`,
      weight: 30,
    },
    {
      key: "dentro",
      label: "Operaciones dentro de la parcela",
      ok: declarada && fuera === 0 && dentro > 0,
      detail: !declarada
        ? "Requiere la parcela declarada"
        : geoAll.length === 0
          ? "Sin operaciones geolocalizadas para verificar"
          : fuera === 0
            ? `Las ${dentro} operaciones geolocalizadas caen dentro`
            : `${fuera} operación(es) fuera del polígono — bandera roja de fiscalización`,
      weight: 25,
    },
    {
      key: "deforestacion",
      label: `Libre de deforestación (post ${EUDR_CUTOFF_DATE})`,
      ok: parcela.deforestacionCero,
      detail: parcela.deforestacionCero
        ? "Declarado por el titular"
        : "Falta la declaración de deforestación cero",
      weight: 15,
    },
  ];

  const totalWeight = checks.reduce((a, c) => a + c.weight, 0);
  const score = clampPct((checks.filter((c) => c.ok).reduce((a, c) => a + c.weight, 0) / totalWeight) * 100);
  const listo = checks.every((c) => c.ok);

  return {
    parcelaDeclarada: declarada,
    areaHa,
    talaTotal,
    talaGeo,
    coberturaPct,
    geoTotal: geoAll.length,
    dentro,
    fuera,
    deforestacionCero: parcela.deforestacionCero,
    checks,
    score,
    listo,
  };
}

// ─── GeoJSON (DDS export) ────────────────────────────────────────────────────

export interface EudrPoint {
  lat: number;
  lng: number;
  section: string;
  code: string;
  species: string | null;
  cites: boolean;
  volumeM3: number | null;
  date: string;
}

type GeoJsonFeature = {
  type: "Feature";
  geometry: { type: "Polygon"; coordinates: number[][][] } | { type: "Point"; coordinates: number[] };
  properties: Record<string, unknown>;
};

export interface EudrGeoJson {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

/**
 * Construye la FeatureCollection GeoJSON de la DDS: el polígono de la parcela
 * (la "plot of land" que exige EUDR) + un Point por operación geolocalizada.
 * GeoJSON usa [lng, lat] y el anillo del polígono debe cerrarse (repite el 1º).
 */
export function buildEudrGeoJson(opts: {
  parcela: LothParcela;
  points: EudrPoint[];
  titular?: string | null;
  titulo?: string | null;
}): EudrGeoJson {
  const features: GeoJsonFeature[] = [];

  if (hasParcela(opts.parcela)) {
    const ring = opts.parcela.vertices.map(([lat, lng]) => [lng, lat]);
    ring.push(ring[0]); // cerrar el anillo
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: {
        tipo: "area_aprovechamiento",
        productorNombre: opts.titular ?? null,
        tituloHabilitante: opts.titulo ?? null,
        areaHa: Number(polygonAreaHa(opts.parcela.vertices).toFixed(4)),
        deforestacionCero: opts.parcela.deforestacionCero,
        corteEudr: EUDR_CUTOFF_DATE,
        nota: opts.parcela.nota || null,
      },
    });
  }

  for (const p of opts.points) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        tipo: "operacion",
        seccion: p.section,
        codigo: p.code,
        especie: p.species,
        cites: p.cites,
        volumenM3: p.volumeM3,
        fecha: p.date,
      },
    });
  }

  return { type: "FeatureCollection", features };
}
