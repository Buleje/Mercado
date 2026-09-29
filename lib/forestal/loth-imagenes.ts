/**
 * loth-imagenes — imágenes RECIENTES de la zona de trabajo del Libro TH, para
 * mirar el monte como está hoy y no como estaba cuando pasó el avión de Esri.
 *
 * Medido el 29-09-2026: la imagen de Esri sobre el predio de Blas es del
 * 18-jun-2022 (WorldView-2, 0,5 m). Linda, pero de hace cuatro años: una
 * trocha abierta este año no está.
 *
 * Tres fuentes públicas, sin clave:
 *
 *   · **Sentinel-2 L2A** (Copernicus, vía Microsoft Planetary Computer): 10 m,
 *     una pasada cada 2 a 5 días. Se ven caminos, claros y ríos. El catálogo
 *     (STAC) dice qué escenas hay; las nubes se miden SOBRE EL ÁREA con la capa
 *     de clasificación de la escena (SCL), no con el % del cuadro de 110 km.
 *     Medido en Blas el 29-09 (nube + su sombra): el 21-09 el cuadro decía
 *     19,5 % y el área estaba tapada un 13,6 %; el 01-09, 21 % contra 61 %; el
 *     03-09, 22 % contra 0 %. El del cuadro engaña para los dos lados.
 *   · **NASA GIBS, VIIRS color real**: una imagen por día, ≈ 375 m. No se ve un
 *     árbol; se ve si hoy hay nube o humo encima del área.
 *   · **NASA GIBS, focos de calor VIIRS 375 m** (los tres satélites juntos).
 *
 * Y la fecha de la imagen de Esri en el centro del área, de su propio servicio
 * de metadatos (`World_Imagery/MapServer/<capa>/query`, campo `SRC_DATE`).
 *
 * Este módulo es la parte PURA: armar pedidos y URLs, leer respuestas, elegir
 * la escena. Lo que sale a internet vive en `loth-imagenes-fuentes.ts`.
 */

import { z } from "zod";
import type { Bbox } from "./loth-geografia";
import { limaDateKey } from "@/lib/utils";

// ── Sentinel-2 (Planetary Computer) ─────────────────────────────────────────

export const STAC_BUSQUEDA_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
export const PC_DATA_URL = "https://planetarycomputer.microsoft.com/api/data/v1";
export const COLECCION_S2 = "sentinel-2-l2a";
/** Cuántos días hacia atrás se buscan escenas. */
export const DIAS_DE_ESCENAS = 90;
/** Una escena «sirve» con hasta este % de nubes sobre el área. */
export const NUBES_MAX_PCT = 30;
/** Menos que esto del área con imagen = la escena corta el área (borde de la pasada). */
export const COBERTURA_MIN_PCT = 60;
/** 10 m por píxel ≈ zoom 14: más cerca, Leaflet agranda las teselas de 14. */
export const S2_MAX_NATIVE_ZOOM = 14;
export const ATRIBUCION_S2 = "Contiene datos Copernicus Sentinel-2 modificados · Microsoft Planetary Computer";

/** [oeste, sur, este, norte], como lo da el STAC. */
export type BboxLngLat = [number, number, number, number];

/** Una pasada del satélite sobre el área (uno o dos cuadros del mismo día). */
export interface EscenaS2 {
  /** Día de la pasada, "2026-09-23" (pasa a las 10:17 de Lima: mismo día en UTC y en Lima). */
  fecha: string;
  /** Los cuadros (MGRS) de esa pasada que tocan el área, con su recuadro para no pedir teselas fuera. */
  items: { id: string; bbox: BboxLngLat }[];
  /** % de nubes del CUADRO entero (110 km), según el catálogo. */
  nubesCuadroPct: number;
  /** % del ÁREA tapado por nubes o su sombra, medido con la capa SCL; null si no se pudo medir. */
  nubesAreaPct: number | null;
  /** % del área con imagen en esa pasada; null si no se pudo medir. */
  coberturaPct: number | null;
}

/** El cuerpo del POST al STAC: escenas de los últimos `dias` que tocan el recuadro, de la más nueva a la más vieja. */
export function cuerpoBusquedaStac(b: Bbox, hastaIso: string, dias = DIAS_DE_ESCENAS, limite = 100) {
  const hasta = new Date(hastaIso);
  const desde = new Date(hasta.getTime() - dias * 86_400_000);
  return {
    collections: [COLECCION_S2],
    bbox: [b.oeste, b.sur, b.este, b.norte],
    datetime: `${desde.toISOString()}/${hasta.toISOString()}`,
    sortby: [{ field: "datetime", direction: "desc" }],
    limit: limite,
    fields: {
      include: ["id", "bbox", "properties.datetime", "properties.eo:cloud_cover"],
      exclude: ["assets", "links", "geometry"],
    },
  };
}

const itemStacSchema = z.object({
  id: z.string().min(1),
  bbox: z.array(z.number()).min(4),
  properties: z.object({
    datetime: z.string().min(10),
    "eo:cloud_cover": z.number().optional(),
  }),
});
const respuestaStacSchema = z.object({ features: z.array(z.unknown()) });

export interface ItemS2 {
  id: string;
  datetime: string;
  nubesPct: number;
  bbox: BboxLngLat;
}

/**
 * Respuesta cruda del STAC → cuadros válidos. Un cuadro roto (sin fecha, sin
 * recuadro) se descarta sin tirar abajo a los demás; una respuesta que no es un
 * catálogo da `null` (quien llama lo dice como aviso, nunca un 500).
 */
export function parseRespuestaStac(raw: unknown): ItemS2[] | null {
  const r = respuestaStacSchema.safeParse(raw);
  if (!r.success) return null;
  const out: ItemS2[] = [];
  for (const f of r.data.features) {
    const it = itemStacSchema.safeParse(f);
    if (!it.success) continue;
    const [o, s, e, n] = it.data.bbox;
    const nubes = it.data.properties["eo:cloud_cover"];
    out.push({ id: it.data.id, datetime: it.data.properties.datetime, nubesPct: typeof nubes === "number" && Number.isFinite(nubes) ? nubes : 100, bbox: [o, s, e, n] });
  }
  return out;
}

/** Cuadros → pasadas: los del mismo día van juntos (un área en el borde de dos cuadros). Más nueva primero. */
export function agruparPorFecha(items: readonly ItemS2[]): EscenaS2[] {
  const porDia = new Map<string, EscenaS2>();
  for (const it of items) {
    const fecha = it.datetime.slice(0, 10);
    const e = porDia.get(fecha);
    if (e) {
      if (!e.items.some((x) => x.id === it.id)) e.items.push({ id: it.id, bbox: it.bbox });
      e.nubesCuadroPct = Math.max(e.nubesCuadroPct, it.nubesPct);
    } else {
      porDia.set(fecha, { fecha, items: [{ id: it.id, bbox: it.bbox }], nubesCuadroPct: it.nubesPct, nubesAreaPct: null, coberturaPct: null });
    }
  }
  return [...porDia.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * Clases de la capa SCL de Sentinel-2 L2A (ESA, «Scene Classification»):
 * 0 sin dato · 1 saturado · 2 zona oscura · 3 sombra de nube · 4 vegetación ·
 * 5 suelo · 6 agua · 7 sin clasificar · 8 nube media · 9 nube alta ·
 * 10 cirro fino · 11 nieve.
 *
 * Lo que TAPA el monte = nube (8, 9, 10) y su sombra (3). Medido el 29-09 en
 * Blas, 21-09: sólo nube daba 4,4 %, pero la sombra al lado era otro 9,3 % y
 * en la pantalla se veía una mancha negra junto a la nube: 13,7 % es lo que
 * de verdad no se ve.
 */
export const SCL_TAPA = [3, 8, 9, 10] as const;

const statsSchema = z.object({
  properties: z.object({
    statistics: z.record(
      z.string(),
      z.object({
        histogram: z.tuple([z.array(z.number()), z.array(z.number())]),
        valid_percent: z.number().optional(),
      }),
    ),
  }),
});

/**
 * Respuesta de `/item/statistics?assets=SCL&categorical=true` → nubes (con su
 * sombra) sobre el área y cuánto del área cubre la escena. `null` si la
 * respuesta no se entiende.
 */
export function nubesDesdeScl(raw: unknown): { nubesPct: number; coberturaPct: number; pixeles: number } | null {
  const r = statsSchema.safeParse(raw);
  if (!r.success) return null;
  const banda = Object.values(r.data.properties.statistics)[0];
  if (!banda) return null;
  const [cuentas, clases] = banda.histogram;
  let total = 0;
  let nube = 0;
  let sinDato = 0;
  clases.forEach((clase, i) => {
    const n = cuentas[i] ?? 0;
    // Sin dato (fuera de la pasada): no es parte de lo que se ve, pero achica la cobertura.
    if (clase === 0) {
      sinDato += n;
      return;
    }
    total += n;
    if ((SCL_TAPA as readonly number[]).includes(clase)) nube += n;
  });
  if (total <= 0) return { nubesPct: 100, coberturaPct: 0, pixeles: 0 };
  const cobertura = (banda.valid_percent ?? 100) * (total / (total + sinDato));
  return { nubesPct: (nube / total) * 100, coberturaPct: Math.max(0, Math.min(100, cobertura)), pixeles: total };
}

/** Lo que vale para decidir: las nubes sobre el área si se midieron; si no, las del cuadro. */
export const nubesDeEscena = (e: EscenaS2): number => e.nubesAreaPct ?? e.nubesCuadroPct;

/**
 * La escena que se muestra de entrada: la MÁS NUEVA con hasta
 * {@link NUBES_MAX_PCT} % de nubes (y que cubra el área, si se midió). Si
 * ninguna llega, la de menos nubes. Sin escenas, null.
 */
export function elegirEscena(escenas: readonly EscenaS2[], maxNubes = NUBES_MAX_PCT): EscenaS2 | null {
  if (escenas.length === 0) return null;
  const cubre = (e: EscenaS2) => e.coberturaPct == null || e.coberturaPct >= COBERTURA_MIN_PCT;
  const ordenadas = [...escenas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const buena = ordenadas.find((e) => cubre(e) && nubesDeEscena(e) <= maxNubes);
  if (buena) return buena;
  const candidatas = ordenadas.filter(cubre);
  const pool = candidatas.length > 0 ? candidatas : ordenadas;
  return pool.reduce((mejor, e) => (nubesDeEscena(e) < nubesDeEscena(mejor) ? e : mejor), pool[0]);
}

const q = (v: string) => encodeURIComponent(v);

/** Teselas de UNA escena (Leaflet: {z}/{x}/{y}). `nodata=0` deja transparente el borde de la pasada. */
export function urlTeselasS2(itemId: string): string {
  return `${PC_DATA_URL}/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=${COLECCION_S2}&item=${q(itemId)}&assets=visual&asset_bidx=visual%7C1%2C2%2C3&nodata=0`;
}

/** De los cuadros de una pasada, el que más cubre la vista (el recorte PNG pide UN cuadro: con dos, el primero puede ser el que apenas roza el área). */
export function itemQueMasCubre<T extends { bbox: BboxLngLat }>(items: readonly T[], b: { latMin: number; latMax: number; lngMin: number; lngMax: number }): T {
  const solape = (it: T) => Math.max(0, Math.min(it.bbox[2], b.lngMax) - Math.max(it.bbox[0], b.lngMin)) * Math.max(0, Math.min(it.bbox[3], b.latMax) - Math.max(it.bbox[1], b.latMin));
  return items.reduce((mejor, it) => (solape(it) > solape(mejor) ? it : mejor), items[0]);
}

/** Un recorte PNG del recuadro (para descargar la vista): la misma imagen que las teselas. */
export function urlRecorteS2(itemId: string, b: { latMin: number; latMax: number; lngMin: number; lngMax: number }, ancho: number, alto: number): string {
  const w = Math.max(64, Math.min(2048, Math.round(ancho)));
  const h = Math.max(64, Math.min(2048, Math.round(alto)));
  return `${PC_DATA_URL}/item/bbox/${b.lngMin},${b.latMin},${b.lngMax},${b.latMax}/${w}x${h}.png?collection=${COLECCION_S2}&item=${q(itemId)}&assets=visual&asset_bidx=visual%7C1%2C2%2C3&nodata=0&coord_crs=epsg:4326`;
}

/** El POST de estadísticas de la capa SCL sobre el recuadro (512 px de lado alcanzan para un %). */
export function urlEstadisticasScl(itemId: string): string {
  return `${PC_DATA_URL}/item/statistics?collection=${COLECCION_S2}&item=${q(itemId)}&assets=SCL&categorical=true&max_size=512`;
}

export function poligonoDeBbox(b: Bbox) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [b.oeste, b.sur],
          [b.este, b.sur],
          [b.este, b.norte],
          [b.oeste, b.norte],
          [b.oeste, b.sur],
        ],
      ],
    },
  };
}

// ── NASA GIBS: lo de hoy ─────────────────────────────────────────────────────

export const GIBS_WMTS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
export const GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi";
export const ATRIBUCION_GIBS = "NASA EOSDIS GIBS · VIIRS";
/**
 * Color real VIIRS, de la GetCapabilities del 29-09-2026: `image/jpeg`,
 * TileMatrixSet `GoogleMapsCompatible_Level9` (zoom 0-9; el 10 da 400).
 * Tres satélites que pasan con ~50 min de diferencia: si uno no tiene la zona,
 * otro sí.
 */
export const CAPAS_COLOR_REAL = [
  { capa: "VIIRS_NOAA21_CorrectedReflectance_TrueColor", satelite: "NOAA-21" },
  { capa: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", satelite: "NOAA-20" },
  { capa: "VIIRS_SNPP_CorrectedReflectance_TrueColor", satelite: "Suomi NPP" },
] as const;
export const GIBS_COLOR_REAL_MAX_ZOOM = 9;
/**
 * Más cerca que esto, un píxel de VIIRS (≈ 375 m) tapa el área entera y el
 * mapa se vuelve una mancha pareja: la capa se deja de dibujar y la pantalla
 * ofrece «Ver la zona» (aleja a ~15 km alrededor).
 */
export const GIBS_COLOR_REAL_VISIBLE_HASTA = 13;
/** Cuánto se agranda el recuadro de trabajo para «Ver la zona» (≈ 13 km a cada lado). */
export const ZONA_AMPLIA_GRADOS = 0.12;
/**
 * Focos de calor 375 m. En el WMTS vienen como teselas vectoriales (MVT), que
 * Leaflet no dibuja sin otra librería; el WMS de GIBS los pinta en PNG
 * transparente (probado el 29-09: 200 image/png, los tres juntos en un pedido).
 */
export const CAPAS_FOCOS = [
  "VIIRS_SNPP_Thermal_Anomalies_375m_All",
  "VIIRS_NOAA20_Thermal_Anomalies_375m_All",
  "VIIRS_NOAA21_Thermal_Anomalies_375m_All",
] as const;
/**
 * Una tesela JPEG sin imagen (la pasada del día todavía no llegó) es negra y
 * pesa 1 665 bytes; con imagen, 12 000 a 23 000 (medido el 29-09 a zoom 7
 * sobre Blas). Por debajo de esto, «hoy todavía no está».
 */
export const TESELA_VACIA_MAX_BYTES = 3_000;

export function urlColorReal(capa: string, fecha: string): string {
  return `${GIBS_WMTS}/${capa}/default/${fecha}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
}

/** La tesela (x, y) que contiene al punto, en Web Mercator. */
export function teselaDe(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const la = Math.max(-85.05, Math.min(85.05, lat));
  const r = (la * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

/** Hoy y ayer en Lima ("2026-09-29", "2026-09-28"): a las 20:00 de Pucallpa el UTC ya es mañana. */
export function diasLima(ahora: Date | string | number = new Date()): { hoy: string; ayer: string } {
  const ms = new Date(ahora).getTime();
  return { hoy: limaDateKey(ms), ayer: limaDateKey(ms - 86_400_000) };
}

/** Lo de hoy que se puede prender encima del mapa. */
export interface CapasVivas {
  /** Día y satélite con imagen sobre el área (hoy, o ayer si hoy todavía no pasó); null si ninguno. */
  colorReal: { capa: string; satelite: string; fecha: string } | null;
  /** Días de focos que se pintan juntos (ayer y hoy = últimas 24-48 h). */
  focos: { fechas: string[] };
  /** Cuándo se miró (se vuelve a mirar si hoy no estaba y pasó media hora). */
  miradoAt: string;
}

/**
 * Qué color real usar, con las sondas ya hechas (`hay[fecha][capa]`): hoy con
 * el primer satélite que tenga imagen; si ninguno, ayer; si tampoco, null.
 */
export function elegirColorReal(dias: { hoy: string; ayer: string }, hay: Record<string, Record<string, boolean>>): CapasVivas["colorReal"] {
  for (const fecha of [dias.hoy, dias.ayer]) {
    for (const c of CAPAS_COLOR_REAL) {
      if (hay[fecha]?.[c.capa]) return { capa: c.capa, satelite: c.satelite, fecha };
    }
  }
  return null;
}

// ── Esri: de cuándo es la foto ───────────────────────────────────────────────

/**
 * Capa de metadatos de `World_Imagery/MapServer` que corresponde al zoom 16
 * (la «2.4m Resolution Metadata», escala 1:13 500 a 1:6 800): el zoom al que se
 * miran los árboles. Sus campos: SRC_DATE (AAAAMMDD), SRC_RES (m), SRC_DESC
 * (sensor), NICE_DESC (proveedor), MinMapLevel/MaxMapLevel.
 */
export const ESRI_METADATOS_URL = "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/12/query";

export function urlMetadatosEsri(lat: number, lng: number): string {
  const punto = JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } });
  return `${ESRI_METADATOS_URL}?f=json&geometry=${q(punto)}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=SRC_DATE,SRC_RES,SRC_DESC,NICE_DESC&returnGeometry=false`;
}

export interface FechaEsri {
  fecha: string;
  resolucionM: number | null;
  sensor: string | null;
  proveedor: string | null;
}

const esriSchema = z.object({
  features: z.array(z.object({ attributes: z.record(z.string(), z.unknown()) })),
});

/** Respuesta del query → la foto más nueva que cae en el punto; null si no hay o no se entiende. */
export function parseMetadatosEsri(raw: unknown): FechaEsri | null {
  const r = esriSchema.safeParse(raw);
  if (!r.success) return null;
  let mejor: FechaEsri | null = null;
  for (const f of r.data.features) {
    const a = f.attributes;
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(a.SRC_DATE ?? ""));
    if (!m) continue;
    const fecha = `${m[1]}-${m[2]}-${m[3]}`;
    if (mejor && mejor.fecha >= fecha) continue;
    const res = Number(a.SRC_RES);
    mejor = {
      fecha,
      resolucionM: Number.isFinite(res) && res > 0 ? res : null,
      sensor: typeof a.SRC_DESC === "string" && a.SRC_DESC ? a.SRC_DESC : null,
      proveedor: typeof a.NICE_DESC === "string" && a.NICE_DESC ? a.NICE_DESC : null,
    };
  }
  return mejor;
}

// ── Lo que devuelve la ruta y se guarda ──────────────────────────────────────

/**
 * Versión de lo guardado: sube cuando cambia CÓMO se mide (29-09: la sombra de
 * la nube pasó a contar como tapado). Una caché de otra versión se descarta
 * entera; si no, las nubes ya medidas se reusarían con la fórmula vieja.
 */
export const VERSION_IMAGENES = 2;

export interface ImagenesDelArea {
  version?: number;
  /** El recuadro donde se buscó (lo arma el servidor). */
  bbox: Bbox;
  /** Cuándo se preguntó al catálogo de Sentinel-2. */
  consultadoAt: string;
  escenas: EscenaS2[];
  /** La fecha que se muestra de entrada ({@link elegirEscena}). */
  sugerida: string | null;
  /** De cuándo es la foto de Esri en el centro del área. */
  esri: FechaEsri | null;
  vivas: CapasVivas;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** "2026-09-23" → "23 set 2026" (sin año: "23 set"). Meses a mano: `Intl` cambia con la versión de ICU. */
export function fechaCorta(iso: string, conAnio = true): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const txt = `${Number(m[3])} ${MESES[Number(m[2]) - 1] ?? m[2]}`;
  return conAnio ? `${txt} ${m[1]}` : txt;
}

/** "23 set · 21 % nubes" — con «en el cuadro» si no se pudo medir sobre el área. */
export function etiquetaEscena(e: EscenaS2): string {
  const n = Math.round(nubesDeEscena(e));
  const cobertura = e.coberturaPct != null && e.coberturaPct < COBERTURA_MIN_PCT ? ` · cubre ${Math.round(e.coberturaPct)} %` : "";
  return `${fechaCorta(e.fecha, false)} · ${n} % nubes${e.nubesAreaPct == null ? " (cuadro)" : ""}${cobertura}`;
}

/** Días entre dos fechas ISO (date-only). */
export function diasEntre(desdeIso: string, hastaIso: string): number {
  return Math.round((Date.parse(hastaIso.slice(0, 10)) - Date.parse(desdeIso.slice(0, 10))) / 86_400_000);
}

const escenaGuardadaSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(z.object({ id: z.string().min(1), bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]) })).min(1),
  nubesCuadroPct: z.number(),
  nubesAreaPct: z.number().nullable(),
  coberturaPct: z.number().nullable(),
});
const guardadoSchema = z.object({
  version: z.literal(VERSION_IMAGENES),
  bbox: z.object({ sur: z.number(), oeste: z.number(), norte: z.number(), este: z.number() }),
  consultadoAt: z.string(),
  escenas: z.array(escenaGuardadaSchema),
  sugerida: z.string().nullable(),
  esri: z.object({ fecha: z.string(), resolucionM: z.number().nullable(), sensor: z.string().nullable(), proveedor: z.string().nullable() }).nullable(),
  vivas: z.object({
    colorReal: z.object({ capa: z.string(), satelite: z.string(), fecha: z.string() }).nullable(),
    focos: z.object({ fechas: z.array(z.string()) }),
    miradoAt: z.string(),
  }),
});

/** Lo guardado en la caché → la forma de hoy; null si está roto (se vuelve a pedir). */
export function normalizarImagenes(raw: unknown): ImagenesDelArea | null {
  const r = guardadoSchema.safeParse(raw);
  return r.success ? r.data : null;
}
