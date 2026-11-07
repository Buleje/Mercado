import "server-only";
import { CamarasDB } from "@/lib/db/camaras.db";
import { CamarasHikConnectDB } from "@/lib/db/camaras-hik-connect.db";
import { textoDeFalla, type CamaraPublica } from "@/lib/camaras/camaras";
import type { PantallaTv, TvCamarasRespuesta } from "@/lib/camaras/pantallas-tv";

/**
 * La lista de cámaras que recibe el televisor (ADR-473): la MISMA forma que
 * los elementos de `GET /api/admin/camaras` (`CamaraPublica`), así los visores
 * leen lo mismo, pero vaciando todo lo que no hace falta para MIRAR y podría
 * servir para otra cosa si el TV está en un lugar público:
 *
 *  · `token` → `""` (con él se suben cuadros como si fuera la cámara).
 *  · `avisos` → `null` (el WhatsApp del dueño).
 *  · `conexion.host` / `usuario` → `""` y `serie` → `null` (IP interna,
 *    usuario del aparato y número de serie: nada de eso se usa para ver).
 *  · `ultimaFalla.detalle` → `""` (lo que contestó el aparato puede traer la IP).
 *
 * Se agrega `nubeEnlazada` (boolean): el panel lo saca de
 * `GET /api/admin/camaras/hik-connect`, que el TV no puede llamar. En el TV
 * vale `true` sólo si la cámara está enlazada Y la pantalla puede usar la nube
 * (`nubePermitidaParaTv`): así el visor va directo al HLS o al cuadro.
 */

export type CamaraParaTv = CamaraPublica & { nubeEnlazada: boolean };

export function camaraParaTv(c: CamaraPublica, nubeEnlazada: boolean): CamaraParaTv {
  const conexion = c.conexion
    ? {
        ...c.conexion,
        host: "",
        usuario: "",
        serie: null,
        ultimaFalla: c.conexion.ultimaFalla ? { ...c.conexion.ultimaFalla, detalle: "" } : null,
        ultimaFallaTexto: c.conexion.ultimaFalla ? textoDeFalla(c.conexion.ultimaFalla.motivo, "") : null,
      }
    : null;
  return { ...c, token: "", avisos: null, conexion, nubeEnlazada };
}

/**
 * Las cámaras del negocio enlazadas a Hik-Connect que esta pantalla NO puede
 * ver (vacío = la nube está permitida).
 *
 * El `appToken` de EZVIZ que recibe el reproductor vale para TODA la cuenta,
 * no para una cámara (ADR-471/472). Darlo a una pantalla limitada a algunas
 * cámaras le daría, con las herramientas del navegador, también las demás de
 * la nube. Por eso la nube sólo va a pantallas con «todas» o con TODAS las
 * cámaras enlazadas en su lista (security 07-10, ADR-473). Se cuentan los
 * enlaces de cámaras que existen: uno colgado de una cámara borrada no se
 * podría elegir nunca.
 */
export function nubeFueraDeLaLista(
  camarasDelNegocio: readonly { id: string }[],
  enlaces: Record<string, unknown>,
  permitidas: string[] | null,
): string[] {
  if (permitidas === null) return [];
  return camarasDelNegocio.filter((c) => enlaces[c.id] && !permitidas.includes(c.id)).map((c) => c.id);
}

export const MOTIVO_NUBE_NO_PERMITIDA =
  "Esta pantalla no puede ver el video de Hik-Connect: el permiso de la nube abre todas las cámaras de la cuenta. Para verlo aquí, en el panel elige «todas» o todas las cámaras de Hik-Connect.";

export async function nubePermitidaParaTv(
  tenantId: string,
  pantalla: PantallaTv,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (pantalla.camaras === null) return { ok: true };
  const [camaras, cuenta] = await Promise.all([CamarasDB.list(tenantId), CamarasHikConnectDB.leer(tenantId)]);
  return nubeFueraDeLaLista(camaras, cuenta?.enlaces ?? {}, pantalla.camaras).length === 0
    ? { ok: true }
    : { ok: false, motivo: MOTIVO_NUBE_NO_PERMITIDA };
}

export async function camarasParaTv(tenantId: string, pantalla: PantallaTv): Promise<TvCamarasRespuesta> {
  const [camaras, cuenta] = await Promise.all([
    CamarasDB.listaParaPantalla(tenantId),
    CamarasHikConnectDB.leer(tenantId),
  ]);
  const enlaces = cuenta?.enlaces ?? {};
  const lista = pantalla.camaras;
  const permitidas = lista === null ? camaras : camaras.filter((c) => lista.includes(c.id));
  const nubeOk = nubeFueraDeLaLista(camaras, enlaces, lista).length === 0;
  return {
    pantalla: { nombre: pantalla.nombre, expiraEn: pantalla.expiraEn },
    camaras: permitidas.map((c) => camaraParaTv(c, nubeOk && !!enlaces[c.id])),
  };
}

/**
 * La cámara si es de este negocio Y está en la lista de la pantalla; si no,
 * `null` (la ruta responde 404: para el TV, una cámara no permitida no existe).
 */
export async function camaraVisibleParaTv(
  tenantId: string,
  pantalla: PantallaTv,
  camaraId: string,
): Promise<{ id: string; nombre: string } | null> {
  if (pantalla.camaras !== null && !pantalla.camaras.includes(camaraId)) return null;
  const c = (await CamarasDB.list(tenantId)).find((x) => x.id === camaraId);
  return c ? { id: c.id, nombre: c.nombre } : null;
}
