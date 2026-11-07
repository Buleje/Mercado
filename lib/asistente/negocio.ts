import "server-only";

/**
 * lib/asistente/negocio.ts — de qué negocio habla el bot.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────────
 * Brandon, 2026-09-05: dictó un gasto por Telegram, el bot contestó «se anota en
 * Mi Plata › Reportes › Activos», fue a buscarlo y no estaba. El gasto SÍ se
 * había guardado —se verificó en la base— pero en OTRO negocio: su chat estaba
 * vinculado a la bodega y él estaba mirando el panel del forestal. Pasó veinte
 * minutos creyendo que el bot no anotaba.
 *
 * En el chat del panel esto no puede pasar: ya estás parado adentro de un
 * negocio y se ve en la pantalla. Por Telegram y por WhatsApp no hay nada que lo
 * diga, y el mismo teléfono puede anotar en un negocio distinto del que se está
 * mirando. Decir el nombre es la diferencia entre «lo anoté» y «lo anoté ACÁ».
 *
 * ── Por qué se cachea ────────────────────────────────────────────────────────
 * El nombre entra en cada tarjeta y en cada confirmación; sin caché sería una
 * consulta por mensaje para un dato que cambia una vez por año.
 */

import { TenantsDB } from "@/lib/db/tenants.db";
import { logger } from "@/lib/logger";

const cache = new Map<string, { nombre: string; expira: number }>();
const TTL_MS = 10 * 60 * 1000;

/**
 * El nombre del negocio, para mostrarlo en un mensaje.
 *
 * Nunca lanza: si no se puede resolver devuelve `null` y quien llama omite la
 * mención. Un bot que se cae porque no pudo adornar un texto sería peor que un
 * texto sin adorno.
 */
export async function nombreDelNegocio(tenantId: string): Promise<string | null> {
  const enCache = cache.get(tenantId);
  if (enCache && enCache.expira > Date.now()) return enCache.nombre;

  try {
    const t = await TenantsDB.getBasicById(tenantId);
    const nombre = t?.name?.trim() || t?.slug?.trim();
    if (!nombre) return null;
    cache.set(tenantId, { nombre, expira: Date.now() + TTL_MS });
    return nombre;
  } catch (err) {
    logger.warn("[asistente] no se pudo leer el nombre del negocio", {
      tenantId,
      error: String(err),
    });
    return null;
  }
}
