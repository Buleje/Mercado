import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import {
  normalizarDisposicion,
  normalizarHoja,
  type DisposicionHoja,
  type DisposicionTalonario,
  type FormatoTalonario,
} from "@/lib/forestal/gtf-matricial-disposicion";

/**
 * ForestGtfMatricialDB — dónde cae cada valor de la guía en el talonario
 * preimpreso de la matricial, por tenant y por hoja («guía» / «lista»).
 *
 * POR QUÉ KV: es la medida de un papel y una impresora, no un movimiento del
 * libro. Se guarda en un `PlatformSetting` por tenant, como los Anexos 04
 * (`ctp-anexos:<tenantId>`), sin migración. Lo que se lee se completa con la
 * disposición de fábrica (`normalizarDisposicion`): un campo nuevo del
 * catálogo no rompe la guardada.
 *
 * Lectura fresca y escritura con bloqueo por clave (ADR-445): guardar la
 * «lista» desde una PC no pisa la «guía» que otra guardó un segundo antes.
 */

const KEY_PREFIX = "gtf-talonario:";

export const claveTalonario = (tenantId: string): string => `${KEY_PREFIX}${tenantId}`;

export const ForestGtfMatricialDB = {
  async get(tenantId: string): Promise<DisposicionTalonario> {
    if (!tenantId) throw new Error("tenantId is required");
    return normalizarDisposicion(await PlatformSettingsDB.getFresco<unknown>(claveTalonario(tenantId)));
  },

  /** Guarda UNA hoja; la otra queda como estaba. Devuelve la disposición completa. */
  async guardar(tenantId: string, formato: FormatoTalonario, hoja: DisposicionHoja, user = "unknown"): Promise<DisposicionTalonario> {
    if (!tenantId) throw new Error("tenantId is required");
    return PlatformSettingsDB.actualizar<unknown, DisposicionTalonario>(
      claveTalonario(tenantId),
      (actual) => {
        const previa = normalizarDisposicion(actual);
        const nueva: DisposicionTalonario = {
          ...previa,
          [formato]: normalizarHoja(formato, hoja),
          actualizado: { en: new Date().toISOString(), por: user },
        };
        return { valor: nueva, resultado: nueva };
      },
      user,
    );
  },
};
