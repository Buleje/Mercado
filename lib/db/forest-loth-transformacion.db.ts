import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { auditLoth } from "@/lib/forestal/loth-audit";

/**
 * ForestLothTransformacionDB — ¿el titular asierra la madera DENTRO del título
 * habilitante, o la lleva a una planta?
 *
 * POR QUÉ EXISTE:
 * las secciones 4-6 del LO-TH (consumo, producto terminado y su despacho) son
 * del formato oficial (RDE 264-2019), pero sólo se llenan si el titular
 * transforma en el bosque. Quien lleva la troza a su CTP las registra en el
 * Libro CTP. Mostrarlas a todos se leía como un libro duplicado: Brandon lo
 * preguntó tres veces (08-23, 09-18, 09-28), y el 09-28 las únicas líneas que
 * había en esas secciones, en todos los negocios, eran de prueba o de demo.
 * Con la respuesta, la pantalla las esconde a quien no las usa. El formato
 * impreso las sigue sacando (en blanco), porque así lo pide SERFOR.
 *
 * DÓNDE VIVE (sin migración, igual que `ForestLothCitesDB`/`ForestLothCierreDB`):
 * KV `PlatformSetting`, key `loth-transformacion:{tenantId}` → `{ [caratulaId]: boolean }`.
 * Una respuesta por carátula: cada tomo es de un titular y un permiso, y dos
 * permisos del mismo negocio pueden trabajar distinto. Sin respuesta = `null`
 * («no se sabe»), que NO es «no asierra».
 *
 * Se lee con `getFresco` y se escribe con `actualizar` (ADR-445): guardar es
 * leer-modificar-escribir el mapa entero, y con el caché por instancia o sin
 * candado dos carátulas guardadas a la vez pisarían una la respuesta de la otra.
 */

const KEY_PREFIX = "loth-transformacion:";

type Mapa = Record<string, boolean>;

function normalizar(raw: unknown): Mapa {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Mapa = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

export const ForestLothTransformacionDB = {
  /** La respuesta de una carátula: true asierra en el TH, false va a planta, null sin responder. */
  async get(tenantId: string, caratulaId: string | null | undefined): Promise<boolean | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!caratulaId) return null;
    const mapa = normalizar(await PlatformSettingsDB.getFresco<unknown>(`${KEY_PREFIX}${tenantId}`));
    return mapa[caratulaId] ?? null;
  },

  /** Guarda (o borra, con null) la respuesta de una carátula. Audita sólo si cambió. */
  async set(tenantId: string, caratulaId: string, enElTh: boolean | null, user = "unknown"): Promise<boolean | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!caratulaId) throw new Error("caratulaId is required");
    const antes = await PlatformSettingsDB.actualizar<unknown, boolean | null>(
      `${KEY_PREFIX}${tenantId}`,
      (actual) => {
        const mapa = normalizar(actual);
        const previo = mapa[caratulaId] ?? null;
        if (previo === enElTh) return { resultado: previo };
        if (enElTh === null) delete mapa[caratulaId];
        else mapa[caratulaId] = enElTh;
        return { valor: mapa, resultado: previo };
      },
      user,
    );
    if (antes === enElTh) return enElTh;
    auditLoth({
      tenantId,
      action: "loth_transformacion_update",
      entity: "ForestLothCaratula",
      entityId: caratulaId,
      detail:
        enElTh === null
          ? "Dejó sin responder si asierra dentro del título habilitante"
          : enElTh
            ? "Marcó que asierra la madera dentro del título habilitante (secciones 4-6 en uso)"
            : "Marcó que la madera va a una planta: consumo, producto y despacho van al Libro CTP",
      user,
    });
    return enElTh;
  },
};
