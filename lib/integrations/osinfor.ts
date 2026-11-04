import "server-only";
import { logger } from "@/lib/logger";
import { cacheStore } from "@/lib/cache";
import {
  codigoConsultable,
  resumirSupervisiones,
  type FilaSisfor,
  type ResumenOsinfor,
} from "@/lib/forestal/osinfor-supervisiones";

/**
 * Consulta pública al mapa de OSINFOR (SISFOR, ArcGIS REST, sin clave): los
 * planes de manejo supervisados de un permiso, con su lista (roja/verde) y el
 * estado del proceso sancionador. Solo lectura; no se envía nada del negocio
 * más que el código del permiso.
 *
 * Medido 04-11-2026: responde en ~1,7 s; 15.477 filas en todo el país.
 * Caché 12 h por código (OSINFOR actualiza por supervisión, no por minuto).
 */

const URL_CAPA =
  "https://sisfor.osinfor.gob.pe/osinfor/rest/services/GEOPERU/peru_osinfor_007_supervision/FeatureServer/0/query";
const CAMPOS = "NUM_THABILITANTE,NOMBRE_POA,TITULAR,ESTADO_PAU,OBSERVATORIO,FECHA_SUPERVISION_INICIO,TIPOSUP";
const TIMEOUT_MS = 10_000;
const CACHE_SEG = 12 * 60 * 60;
/** Un permiso con más planes que esto es raro; el tope protege la respuesta. */
const MAX_FILAS = 200;

interface RespuestaArcgis {
  features?: { attributes?: FilaSisfor }[];
  error?: { message?: string };
}

/** `where` del servicio. El código ya pasó por `codigoConsultable` (sin comillas). */
export function whereDeCodigo(codigo: string): string {
  return `NUM_THABILITANTE='${codigo.replace(/'/g, "''")}'`;
}

/**
 * Resumen de OSINFOR para `codigo`, o null si el código no es válido o el
 * servicio no respondió (la pantalla dice «OSINFOR no respondió»).
 */
export async function consultarOsinfor(crudo: string): Promise<ResumenOsinfor | null> {
  const codigo = codigoConsultable(crudo);
  if (!codigo) return null;

  const clave = `osinfor:th:${codigo}`;
  const guardado = cacheStore.get<ResumenOsinfor>(clave);
  if (guardado) return guardado;

  const url = new URL(URL_CAPA);
  url.searchParams.set("where", whereDeCodigo(codigo));
  url.searchParams.set("outFields", CAMPOS);
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("resultRecordCount", String(MAX_FILAS));
  url.searchParams.set("f", "json");

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) {
      logger.warn("[osinfor] respuesta no OK", { status: res.status, codigo });
      return null;
    }
    const json = (await res.json()) as RespuestaArcgis;
    if (json.error) {
      logger.warn("[osinfor] el servicio devolvió error", { codigo, error: json.error.message });
      return null;
    }
    const filas = (json.features ?? [])
      .map((f) => f.attributes)
      .filter((a): a is FilaSisfor => Boolean(a));
    const resumen = resumirSupervisiones(codigo, filas);
    cacheStore.set(clave, resumen, CACHE_SEG);
    return resumen;
  } catch (err) {
    logger.warn("[osinfor] no respondió", { codigo, err: String(err) });
    return null;
  }
}
