import "server-only";
import { randomUUID } from "node:crypto";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import type { PlantillaGuia } from "@/lib/forestal/gtf-plantillas";
import {
  almacenDe,
  aplicarAccion,
  normalizarAlmacen,
  ordenarPlantillas,
  type AccionPlantilla,
  type ResultadoAlmacen,
} from "@/lib/forestal/gtf-plantillas-almacen";

/**
 * ForestGtfPlantillasDB — las plantillas de «Datos de la guía» de un negocio
 * (16-10-2026): bloques guardados con nombre para rellenar otra guía de una
 * vez (`gtf-plantillas.ts`).
 *
 * POR QUÉ KV: son atajos de quien llena la guía, no movimientos del libro. Van
 * en un `PlatformSetting` por tenant (`gtf-plantillas:<tenantId>`), como el
 * talonario de la matricial, sin migración.
 *
 * Lectura fresca (no la del caché de 5 min: recién guardada tiene que salir en
 * la lista) y escritura con bloqueo por clave (ADR-445): dos PCs que guardan a
 * la vez no se pisan. `actualizar` invalida la clave al escribir.
 */

const KEY_PREFIX = "gtf-plantillas:";

export const clavePlantillas = (tenantId: string): string => `${KEY_PREFIX}${tenantId}`;

export const ForestGtfPlantillasDB = {
  /** Todas, las usadas hace menos primero. */
  async listar(tenantId: string): Promise<PlantillaGuia[]> {
    if (!tenantId) throw new Error("tenantId is required");
    return ordenarPlantillas(normalizarAlmacen(await PlatformSettingsDB.getFresco<unknown>(clavePlantillas(tenantId))));
  },

  /** Crear, actualizar, renombrar, duplicar, marcar usada o borrar UNA plantilla. */
  async cambiar(tenantId: string, accion: AccionPlantilla, user = "unknown"): Promise<ResultadoAlmacen> {
    if (!tenantId) throw new Error("tenantId is required");
    return PlatformSettingsDB.actualizar<unknown, ResultadoAlmacen>(
      clavePlantillas(tenantId),
      (actual) => {
        const r = aplicarAccion(normalizarAlmacen(actual), accion, { en: new Date().toISOString(), por: user, nuevoId: randomUUID() });
        if (!r.ok) return { resultado: r };
        return { valor: almacenDe(r.lista), resultado: { ...r, lista: ordenarPlantillas(r.lista) } };
      },
      user,
    );
  },
};
