import "server-only";
import { claveGeo } from "@/lib/forestal/loth-alcance-geo";
import { PREFIJO_INTERNO, PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { normalizarImagenes, type ImagenesDelArea } from "@/lib/forestal/loth-imagenes";

/**
 * ForestLothImagenesDB — CACHÉ de las imágenes recientes de la zona de trabajo
 * del Libro TH: las escenas de Sentinel-2 con sus nubes sobre el área, la
 * fecha de la foto de Esri y qué día de NASA GIBS tiene imagen.
 *
 * POR QUÉ EXISTE: medir las nubes sobre el área pide una consulta por escena
 * (~1 s cada una) y el satélite pasa cada 2 a 5 días; se pide una vez, se
 * guarda 6 h, y «Buscar imágenes nuevas» lo vuelve a pedir.
 *
 * Mismo patrón que `ForestLothGeografiaDB`: KV `PlatformSetting` con prefijo
 * `interno:` (`interno:loth-imagenes:{tenantId}`), sin migración; no viaja en
 * `getAll()` ni se audita (es copia de catálogos públicos, no una decisión del
 * negocio). La forma se valida en `lib/forestal/loth-imagenes.ts` (puro).
 */

const KEY_PREFIX = `${PREFIJO_INTERNO}loth-imagenes:`;

export const ForestLothImagenesDB = {
  /** Lo guardado del tenant; null si nunca se pidió o está roto. */
  async get(tenantId: string, planId?: string | null): Promise<ImagenesDelArea | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const raw = await PlatformSettingsDB.get<unknown>(claveGeo(KEY_PREFIX, tenantId, planId));
    return raw ? normalizarImagenes(raw) : null;
  },

  /** Reemplaza la caché. */
  async set(tenantId: string, img: ImagenesDelArea, user = "sistema", planId?: string | null): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    await PlatformSettingsDB.set(claveGeo(KEY_PREFIX, tenantId, planId), img, user);
  },
};
