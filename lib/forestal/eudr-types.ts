/**
 * eudr-types — tipos + helpers PUROS (client-safe) del dossier EUDR (ADR-140).
 *
 * La EUDR (Reg. UE 2023/1115) prohíbe colocar madera en el mercado de la UE sin
 * (a) GEOLOCALIZACIÓN de la parcela de cosecha, (b) una Declaración de Diligencia
 * Debida (DDS) y (c) que la madera sea "deforestation-free" (sin deforestación
 * después del 31-dic-2020) y legal. La cadena de custodia (¿de qué GTF salió?) ya
 * existe en el CTP; lo que falta es el DATO GEOGRÁFICO del origen + el generador
 * de DDS. La geolocalización es estable por origen (una concesión no cambia de
 * polígono por ingreso), así que se guarda por `originCode` en un KV maestro —
 * sin duplicarla en cada WoodEntry y sin migración.
 */

/** Geolocalización de un origen (concesión/predio/comunidad), por `originCode`. */
export interface OrigenGeo {
  originCode: string;
  originType?: string | null;
  region?: string | null;
  /** Punto (parcelas ≤ 4 ha). Decimal grados, WGS84. */
  lat?: number | null;
  lng?: number | null;
  /** GeoJSON del polígono (parcelas > 4 ha). Texto crudo. */
  polygonJson?: string | null;
  pais?: string; // ISO-2, default "PE"
  /** Atestado: sin deforestación después del 2020-12-31. */
  deforestationFree?: boolean;
  notas?: string | null;
  updatedAt?: string;
}

/** Una parcela de origen dentro del dossier de un despacho. */
export interface DdsPlot {
  originCode: string;
  originType: string;
  region: string | null;
  lat: number | null;
  lng: number | null;
  hasPolygon: boolean;
  /** GeoJSON del polígono declarado (para dibujarlo en el mapa del DDS). */
  polygonJson?: string | null;
  pais: string;
  deforestationFree: boolean;
  /** GTF de ingreso que entraron por este origen. */
  gtfs: string[];
  especies: string[];
  cites: boolean;
  /** Le falta lat/lng (no se puede geolocalizar). */
  sinGeo: boolean;
}

export interface DdsData {
  despachoId: string;
  producto: string;
  especie: string;
  cantidad: number;
  unidad: string;
  destino: string | null;
  gtfSalida: string | null;
  pais: string;
  plots: DdsPlot[];
  trazabilidadCompleta: boolean;
  geoCompleta: boolean;
  deforestationFreeTotal: boolean;
  cites: boolean;
  /** Riesgo EUDR: negligible solo si traza + geo + deforestation-free. */
  riesgo: "negligible" | "no_negligible";
  /** Qué falta para poder declarar riesgo negligible. */
  gaps: string[];
  generadoAt: string;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Normaliza un OrigenGeo del KV (tolerante a data vieja/parcial). */
export function normalizeOrigenGeo(raw: unknown): OrigenGeo {
  const o = (raw ?? {}) as Record<string, unknown>;
  const lat = num(o.lat);
  const lng = num(o.lng);
  const inRange = lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  return {
    originCode: String(o.originCode ?? "").trim(),
    originType: (o.originType as string) ?? null,
    region: (o.region as string) ?? null,
    lat: inRange ? lat : null,
    lng: inRange ? lng : null,
    polygonJson: typeof o.polygonJson === "string" && o.polygonJson.trim() ? o.polygonJson : null,
    pais: (o.pais as string)?.trim() || "PE",
    deforestationFree: o.deforestationFree === true,
    notas: (o.notas as string) ?? null,
    updatedAt: (o.updatedAt as string) ?? undefined,
  };
}

/** ¿Este origen está geolocalizado (punto o polígono)? */
export function origenGeolocalizado(g: OrigenGeo | null | undefined): boolean {
  if (!g) return false;
  return (g.lat != null && g.lng != null) || !!g.polygonJson;
}

// ─── Readiness a nivel PLANTA (cockpit del CtpEudrPanel) ─────────────────────

/** Origen tal como lo lista el editor (código + cuántos ingresos ampara). */
export interface OrigenRow {
  originCode: string;
  originType?: string | null;
  region?: string | null;
  ingresos: number;
}

export interface CtpEudrCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  weight: number;
}

export interface CtpEudrReadiness {
  total: number;
  geolocalizados: number;
  deforestationFree: number;
  /** % de orígenes geolocalizados (métrica EUDR de la planta). */
  coberturaPct: number;
  /** Ingresos amparados por orígenes ya geolocalizados / total de ingresos. */
  ingresosCubiertos: number;
  ingresosTotal: number;
  checks: CtpEudrCheck[];
  score: number;
  listo: boolean;
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Estado EUDR de la PLANTA a partir de sus orígenes: cuántos están
 * geolocalizados y atestados "sin deforestación". Puro y determinístico.
 */
export function computeCtpEudrReadiness(origins: OrigenRow[], geoByCode: Record<string, OrigenGeo>): CtpEudrReadiness {
  const total = origins.length;
  const geoOrigins = origins.filter((o) => origenGeolocalizado(geoByCode[o.originCode]));
  const dfOrigins = origins.filter((o) => geoByCode[o.originCode]?.deforestationFree === true);
  const geolocalizados = geoOrigins.length;
  const deforestationFree = dfOrigins.length;
  const ingresosTotal = origins.reduce((a, o) => a + (o.ingresos || 0), 0);
  const ingresosCubiertos = geoOrigins.reduce((a, o) => a + (o.ingresos || 0), 0);
  const coberturaPct = total > 0 ? clampPct((geolocalizados / total) * 100) : 0;

  const checks: CtpEudrCheck[] = [
    {
      key: "geo",
      label: "Orígenes geolocalizados",
      ok: total > 0 && geolocalizados === total,
      detail: total === 0 ? "Aún no hay orígenes con código en los ingresos" : `${geolocalizados} de ${total} orígenes con coordenadas (${coberturaPct}%)`,
      weight: 60,
    },
    {
      key: "df",
      label: "Sin deforestación declarada (post 2020-12-31)",
      ok: total > 0 && deforestationFree === total,
      detail: total === 0 ? "Requiere orígenes cargados" : `${deforestationFree} de ${total} orígenes atestados`,
      weight: 40,
    },
  ];

  const totalWeight = checks.reduce((a, c) => a + c.weight, 0);
  const score = total === 0 ? 0 : clampPct((checks.filter((c) => c.ok).reduce((a, c) => a + c.weight, 0) / totalWeight) * 100);
  const listo = total > 0 && checks.every((c) => c.ok);

  return { total, geolocalizados, deforestationFree, coberturaPct, ingresosCubiertos, ingresosTotal, checks, score, listo };
}

// ─── GeoJSON del dossier de la planta (todos los orígenes) ───────────────────

type GjFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: number[] } | { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
};

/**
 * FeatureCollection con TODOS los orígenes geolocalizados de la planta — el
 * dossier geoespacial que adjunta el operador a la UE. Punto por origen (o su
 * polígono si `polygonJson` es un GeoJSON válido). GeoJSON usa [lng, lat].
 */
export function buildOriginsGeoJson(
  origins: OrigenRow[],
  geoByCode: Record<string, OrigenGeo>,
  emisor?: { razonSocial?: string | null; ruc?: string | null; codigoCtp?: string | null },
): { type: "FeatureCollection"; metadata: Record<string, unknown>; features: GjFeature[] } {
  const features: GjFeature[] = [];
  for (const o of origins) {
    const g = geoByCode[o.originCode];
    if (!origenGeolocalizado(g)) continue;
    const props = {
      originCode: o.originCode,
      originType: o.originType ?? g?.originType ?? null,
      region: o.region ?? g?.region ?? null,
      ingresos: o.ingresos,
      pais: g?.pais ?? "PE",
      deforestationFree: g?.deforestationFree === true,
      corteEudr: "2020-12-31",
    };
    // Polígono declarado (parcelas > 4 ha) tiene prioridad sobre el punto.
    if (g?.polygonJson) {
      try {
        const geom = JSON.parse(g.polygonJson) as { type?: string; coordinates?: unknown };
        if (geom && typeof geom.type === "string" && geom.coordinates != null) {
          features.push({ type: "Feature", geometry: { type: geom.type, coordinates: geom.coordinates }, properties: props });
          continue;
        }
      } catch {
        /* polygonJson corrupto → cae al punto */
      }
    }
    if (g?.lat != null && g?.lng != null) {
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: [g.lng, g.lat] }, properties: props });
    }
  }
  return {
    type: "FeatureCollection",
    metadata: {
      operador: emisor?.razonSocial ?? null,
      ruc: emisor?.ruc ?? null,
      codigoCtp: emisor?.codigoCtp ?? null,
      reglamento: "UE 2023/1115 (EUDR)",
    },
    features,
  };
}

/** Evalúa el riesgo EUDR y arma los gaps a partir de los plots + la traza. */
export function evaluarRiesgoEudr(plots: DdsPlot[], trazaCompleta: boolean): { riesgo: "negligible" | "no_negligible"; geoCompleta: boolean; deforestationFreeTotal: boolean; gaps: string[] } {
  const gaps: string[] = [];
  if (!trazaCompleta) gaps.push("La cadena de custodia del despacho está incompleta (falta atribuir origen).");
  const sinGeo = plots.filter((p) => p.sinGeo).map((p) => p.originCode || "(sin código)");
  const geoCompleta = plots.length > 0 && sinGeo.length === 0;
  if (sinGeo.length) gaps.push(`Falta geolocalización de: ${[...new Set(sinGeo)].join(", ")}.`);
  if (plots.length === 0) gaps.push("El despacho no tiene orígenes trazados.");
  const sinDf = plots.filter((p) => !p.deforestationFree).map((p) => p.originCode || "(sin código)");
  const deforestationFreeTotal = plots.length > 0 && sinDf.length === 0;
  if (sinDf.length) gaps.push(`Falta atestar "sin deforestación (post-2020)" en: ${[...new Set(sinDf)].join(", ")}.`);
  const riesgo = trazaCompleta && geoCompleta && deforestationFreeTotal ? "negligible" : "no_negligible";
  return { riesgo, geoCompleta, deforestationFreeTotal, gaps };
}
