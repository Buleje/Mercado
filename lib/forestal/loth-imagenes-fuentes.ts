import "server-only";
import { logger } from "@/lib/logger";
import type { Bbox } from "./loth-geografia";
import { USER_AGENT } from "./loth-geografia-fuentes";
import {
  CAPAS_COLOR_REAL,
  cuerpoBusquedaStac,
  GIBS_WMTS,
  nubesDesdeScl,
  parseMetadatosEsri,
  parseRespuestaStac,
  poligonoDeBbox,
  STAC_BUSQUEDA_URL,
  TESELA_VACIA_MAX_BYTES,
  teselaDe,
  urlEstadisticasScl,
  urlMetadatosEsri,
  type FechaEsri,
  type ItemS2,
} from "./loth-imagenes";

/**
 * loth-imagenes-fuentes — lo que SALE A INTERNET para las imágenes del mapa:
 * el catálogo de Sentinel-2, las nubes sobre el área, la fecha de Esri y la
 * sonda de «¿ya llegó la imagen de hoy?» de NASA GIBS.
 *
 * Cada pedido tiene su tope de tiempo (la ruta entera se queda bajo los
 * ~10 s) y NUNCA tira: devuelve `null` y deja el rastro en el log; quien llama
 * lo dice como aviso. Tiempos medidos el 29-09 desde Pucallpa-WSL: STAC 1,1 s,
 * estadísticas SCL 1,2 s, metadatos Esri 0,3-0,5 s, tesela GIBS 0,5 s.
 */

export const PRESUPUESTO_STAC_MS = 8_000;
export const PRESUPUESTO_NUBES_MS = 6_000;
export const PRESUPUESTO_ESRI_MS = 5_000;
export const PRESUPUESTO_GIBS_MS = 5_000;

const HEADERS = { "User-Agent": USER_AGENT, Accept: "application/json" };

/** Las escenas de Sentinel-2 que tocan el recuadro (más nueva primero); null si el catálogo no respondió. */
export async function pedirEscenasStac(b: Bbox, hastaIso: string): Promise<ItemS2[] | null> {
  try {
    const res = await fetch(STAC_BUSQUEDA_URL, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpoBusquedaStac(b, hastaIso)),
      signal: AbortSignal.timeout(PRESUPUESTO_STAC_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      logger.warn("[loth.imagenes] el catálogo de Sentinel-2 respondió mal", { status: res.status });
      return null;
    }
    const items = parseRespuestaStac(await res.json());
    if (!items) logger.warn("[loth.imagenes] respuesta del catálogo sin forma de catálogo");
    return items;
  } catch (err) {
    logger.warn("[loth.imagenes] el catálogo de Sentinel-2 no respondió", { error: String(err) });
    return null;
  }
}

/** Nubes sobre el recuadro en UNA escena (capa SCL); null si no respondió. */
export async function pedirNubesDelArea(itemId: string, b: Bbox): Promise<ReturnType<typeof nubesDesdeScl>> {
  try {
    const res = await fetch(urlEstadisticasScl(itemId), {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(poligonoDeBbox(b)),
      signal: AbortSignal.timeout(PRESUPUESTO_NUBES_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      logger.warn("[loth.imagenes] estadísticas SCL respondieron mal", { status: res.status, itemId });
      return null;
    }
    return nubesDesdeScl(await res.json());
  } catch (err) {
    logger.warn("[loth.imagenes] estadísticas SCL no respondieron", { error: String(err), itemId });
    return null;
  }
}

/** De cuándo es la foto de Esri en el punto; null si no respondió o no hay dato. */
export async function pedirFechaEsri(lat: number, lng: number): Promise<FechaEsri | null> {
  try {
    const res = await fetch(urlMetadatosEsri(lat, lng), { headers: HEADERS, signal: AbortSignal.timeout(PRESUPUESTO_ESRI_MS), cache: "no-store" });
    if (!res.ok) {
      logger.warn("[loth.imagenes] metadatos de Esri respondieron mal", { status: res.status });
      return null;
    }
    return parseMetadatosEsri(await res.json());
  } catch (err) {
    logger.warn("[loth.imagenes] metadatos de Esri no respondieron", { error: String(err) });
    return null;
  }
}

/** Zoom de la sonda: una tesela de ~300 km, la que contiene al área. */
const ZOOM_SONDA = 7;

/**
 * ¿Hay imagen de color real de ese satélite y ese día sobre el punto? Mira el
 * peso de la tesela: la vacía es negra y pesa 1 665 bytes (medido). null = no
 * se pudo saber (servicio caído), distinto de «no hay».
 */
export async function sondearColorReal(capa: string, fecha: string, lat: number, lng: number): Promise<boolean | null> {
  const { x, y } = teselaDe(lat, lng, ZOOM_SONDA);
  const url = `${GIBS_WMTS}/${capa}/default/${fecha}/GoogleMapsCompatible_Level9/${ZOOM_SONDA}/${y}/${x}.jpg`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(PRESUPUESTO_GIBS_MS), cache: "no-store" });
    if (!res.ok) return res.status === 404 || res.status === 400 ? false : null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > TESELA_VACIA_MAX_BYTES;
  } catch (err) {
    logger.warn("[loth.imagenes] GIBS no respondió", { error: String(err), capa, fecha });
    return null;
  }
}

/** Todas las sondas de color real (hoy y ayer × tres satélites) a la vez. */
export async function sondearDias(dias: { hoy: string; ayer: string }, lat: number, lng: number): Promise<{ hay: Record<string, Record<string, boolean>>; algunaRespondio: boolean }> {
  const pedidos = [dias.hoy, dias.ayer].flatMap((fecha) => CAPAS_COLOR_REAL.map((c) => ({ fecha, capa: c.capa })));
  const res = await Promise.all(pedidos.map((p) => sondearColorReal(p.capa, p.fecha, lat, lng)));
  const hay: Record<string, Record<string, boolean>> = {};
  let algunaRespondio = false;
  pedidos.forEach((p, i) => {
    const r = res[i];
    if (r !== null) algunaRespondio = true;
    (hay[p.fecha] ??= {})[p.capa] = r === true;
  });
  return { hay, algunaRespondio };
}
