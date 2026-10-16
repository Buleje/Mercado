import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import type { DisposicionTalonario, FormatoTalonario } from "@/lib/forestal/gtf-matricial-disposicion";
import {
  disposicionDe,
  guardarHojaEnAlmacen,
  normalizarAlmacen,
  resolverDisposicion,
  resumenTitulares,
  type AlmacenTalonario,
  type DisposicionResuelta,
  type DuenoTalonario,
  type ResumenTitular,
} from "@/lib/forestal/gtf-matricial-titulares";

/**
 * ForestGtfMatricialDB — dónde cae cada valor de la guía en el talonario
 * preimpreso de la matricial, por tenant, POR TITULAR (15-10) y por hoja
 * («guía» / «lista»). La identidad del titular y la compatibilidad con lo
 * guardado antes viven en `gtf-matricial-titulares.ts`.
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

async function leer(tenantId: string): Promise<AlmacenTalonario> {
  if (!tenantId) throw new Error("tenantId is required");
  return normalizarAlmacen(await PlatformSettingsDB.getFresco<unknown>(claveTalonario(tenantId)));
}

export const ForestGtfMatricialDB = {
  /** La que abre el modal para la guía de este dueño, y los titulares que ya tienen la suya. */
  async paraDueno(tenantId: string, dueno: DuenoTalonario): Promise<DisposicionResuelta & { titulares: ResumenTitular[]; hayEmpresa: boolean }> {
    const alm = await leer(tenantId);
    return { ...resolverDisposicion(alm, dueno), titulares: resumenTitulares(alm), hayEmpresa: !!alm.empresa };
  },

  /** La de otro titular (`clave`) o la de la empresa («empresa»), para copiarla. */
  async de(tenantId: string, de: string): Promise<DisposicionTalonario | null> {
    return disposicionDe(await leer(tenantId), de);
  },

  /** Guarda UNA hoja del talonario del dueño; la otra queda como estaba. null = tope de titulares. */
  async guardar(
    tenantId: string,
    dueno: DuenoTalonario,
    formato: FormatoTalonario,
    hoja: unknown,
    user = "unknown",
  ): Promise<DisposicionTalonario | null> {
    if (!tenantId) throw new Error("tenantId is required");
    return PlatformSettingsDB.actualizar<unknown, DisposicionTalonario | null>(
      claveTalonario(tenantId),
      (actual) => {
        const alm = normalizarAlmacen(actual);
        const r = guardarHojaEnAlmacen(alm, dueno, formato, hoja, { en: new Date().toISOString(), por: user });
        return r ? { valor: r.almacen, resultado: r.disposicion } : { resultado: null };
      },
      user,
    );
  },
};
