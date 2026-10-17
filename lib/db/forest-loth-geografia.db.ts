import "server-only";
import { claveGeo } from "@/lib/forestal/loth-alcance-geo";
import { PREFIJO_INTERNO, PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { normalizarGeografia, type GeografiaPredio } from "@/lib/forestal/loth-geografia";

/**
 * ForestLothGeografiaDB — CACHÉ de la geografía real de la zona de trabajo del
 * Libro TH: ríos y caminos de OpenStreetMap + la grilla de altitud.
 *
 * POR QUÉ EXISTE:
 * el terreno no cambia de un día a otro y los servicios públicos (Overpass,
 * Open-Meteo) son lentos o se saturan —el 29-09 Overpass tardó 8 s y un espejo
 * no respondió—. Se pide una vez, se guarda, y `?refrescar=1` la vuelve a pedir.
 * Si un servicio falla después, la pantalla sigue con lo guardado y su fecha.
 *
 * Vive en el KV `PlatformSetting` con prefijo `interno:`
 * (`interno:loth-geografia:{tenantId}`), sin migración: es una clave de
 * TRABAJO, no de configuración — no viaja en `getAll()` (que lee el layout de
 * toda la plataforma) ni invalida `__all__`, y pesa decenas de KB. No se
 * audita: es una copia de datos públicos, no una decisión del negocio. La
 * forma se valida en `lib/forestal/loth-geografia.ts` (puro).
 */

const KEY_PREFIX = `${PREFIJO_INTERNO}loth-geografia:`;

export const ForestLothGeografiaDB = {
  /** La geografía guardada del tenant; null si nunca se pidió o está rota. */
  async get(tenantId: string, planId?: string | null): Promise<GeografiaPredio | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown>(claveGeo(KEY_PREFIX, tenantId, planId));
    return raw ? normalizarGeografia(raw) : null;
  },

  /** Reemplaza la caché. Los avisos no se guardan: son de cada consulta. */
  async set(tenantId: string, geo: GeografiaPredio, user = "sistema", planId?: string | null): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    const guardable: Omit<GeografiaPredio, "avisos"> = {
      bbox: geo.bbox,
      base: geo.base,
      rios: geo.rios,
      caminos: geo.caminos,
      elevacion: geo.elevacion,
      fuentes: geo.fuentes,
      fallos: geo.fallos ?? { osm: null, elevacion: null },
    };
    await PlatformSettingsDB.set(claveGeo(KEY_PREFIX, tenantId, planId), guardable, user);
  },
};
