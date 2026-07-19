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
