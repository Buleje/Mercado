import "server-only";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import type { DisposicionTalonario, FormatoTalonario } from "@/lib/forestal/gtf-matricial-disposicion";
import {
  agregarPerfil,
  borrarPerfil,
  buscarPerfil,
  cambiarPerfil,
  listaPerfiles,
  type PerfilAlta,
  type PerfilCambio,
  type ResultadoPerfil,
} from "@/lib/forestal/gtf-matricial-perfiles";
import type { PerfilImpresora } from "@/lib/forestal/gtf-salida-tipos";
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
  async paraDueno(
    tenantId: string,
    dueno: DuenoTalonario,
  ): Promise<DisposicionResuelta & { titulares: ResumenTitular[]; hayEmpresa: boolean; perfiles: PerfilImpresora[] }> {
    const alm = await leer(tenantId);
    return { ...resolverDisposicion(alm, dueno), titulares: resumenTitulares(alm), hayEmpresa: !!alm.empresa, perfiles: listaPerfiles(alm.perfiles) };
  },

  /** Lo que necesita la salida (PDF / ESC/P) en UNA lectura: la disposición del dueño y la impresora. */
  async paraSalida(
    tenantId: string,
    dueno: DuenoTalonario,
    perfilId: string,
  ): Promise<{ disposicion: DisposicionTalonario; perfil: PerfilImpresora | null }> {
    const alm = await leer(tenantId);
    return { disposicion: resolverDisposicion(alm, dueno).disposicion, perfil: buscarPerfil(alm.perfiles, perfilId) };
  },

  /** Las impresoras calibradas: Oficina primero. */
  async perfiles(tenantId: string): Promise<PerfilImpresora[]> {
    return listaPerfiles((await leer(tenantId)).perfiles);
  },

  /** Alta, cambio o baja de una impresora, con el bloqueo de la clave (no pisa una hoja que otro guarda). */
  async cambiarPerfiles(
    tenantId: string,
    op: { tipo: "alta"; datos: PerfilAlta } | { tipo: "cambio"; datos: PerfilCambio } | { tipo: "baja"; id: string },
    user = "unknown",
  ): Promise<ResultadoPerfil> {
    if (!tenantId) throw new Error("tenantId is required");
    return PlatformSettingsDB.actualizar<unknown, ResultadoPerfil>(
      claveTalonario(tenantId),
      (actual) => {
        const alm = normalizarAlmacen(actual);
        const cuando = { en: new Date().toISOString(), por: user };
        const r =
          op.tipo === "alta"
            ? agregarPerfil(alm.perfiles, op.datos, cuando)
            : op.tipo === "cambio"
              ? cambiarPerfil(alm.perfiles, op.datos, cuando)
              : borrarPerfil(alm.perfiles, op.id);
        return r.ok ? { valor: { ...alm, perfiles: r.perfiles }, resultado: r } : { resultado: r };
      },
      user,
    );
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
