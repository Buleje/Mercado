import "server-only";
import { randomUUID } from "node:crypto";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
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
  borrarForma,
  crearForma,
  disposicionDe,
  formaDe,
  guardarHoja,
  renombrarForma,
  resolverForma,
  resumen,
  resumenFormas,
  type ErrorForma,
  type FormaResuelta,
  type ResultadoForma,
  type ResumenForma,
} from "@/lib/forestal/gtf-matricial-formas";
import { normalizarAlmacen, type AlmacenTalonario, type DuenoTalonario } from "@/lib/forestal/gtf-matricial-titulares";

/**
 * ForestGtfMatricialDB — dónde cae cada valor de la guía en el talonario
 * preimpreso de la matricial, por tenant, en «formas» con nombre (16-10: una
 * por permiso y titular, elegida sola con la guía) y por hoja («guía» /
 * «lista»). El modelo y lo guardado antes: `gtf-matricial-titulares.ts`; elegir
 * y cambiar formas: `gtf-matricial-formas.ts`.
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

/** Id corto de una forma nueva («f-» + 10 hex): entra en `ID_FORMA_RE`. */
const idNuevo = (): string => `f-${randomUUID().replace(/-/g, "").slice(0, 10)}`;

const firma = (user: string) => ({ en: new Date().toISOString(), por: user });

export type ResultadoFormaDB =
  | { ok: true; disposicion: DisposicionTalonario; forma: ResumenForma; creada: boolean }
  | { ok: false; error: ErrorForma };

/** Corre el cambio con el bloqueo de la clave y devuelve la forma vista desde el dueño de la guía. */
async function cambiarFormas(
  tenantId: string,
  dueno: DuenoTalonario,
  cambio: (alm: AlmacenTalonario) => ResultadoForma,
  user: string,
): Promise<ResultadoFormaDB> {
  if (!tenantId) throw new Error("tenantId is required");
  return PlatformSettingsDB.actualizar<unknown, ResultadoFormaDB>(
    claveTalonario(tenantId),
    (actual) => {
      const r = cambio(normalizarAlmacen(actual));
      if (!r.ok) return { resultado: r };
      const f = r.forma;
      return { valor: r.almacen, resultado: { ok: true, disposicion: { guia: f.guia, lista: f.lista, actualizado: f.actualizado }, forma: resumen(f, dueno), creada: r.creada } };
    },
    user,
    /* Varias PC guardando a la vez: esperar la clave 3 s y, si sigue tomada,
       `ClaveOcupadaError` (la ruta responde 409), no el 500 del timeout de
       Prisma (revisión de seguridad 16-10: 5 de 8 escrituras simultáneas). */
    { esperaMaxMs: 3000, timeout: 8000 },
  );
}

export const ForestGtfMatricialDB = {
  /**
   * El dueño del talonario sale de la guía GUARDADA de este tenant (los mismos
   * datos con que se numera), nunca del cliente. Sin guía = sin dueño (la de la
   * empresa). null = la guía no existe en este tenant.
   */
  async duenoDeLaGuia(tenantId: string, gtfId: string | null | undefined): Promise<DuenoTalonario | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!gtfId) return { titular: null, permiso: null, planId: null };
    const g = await ForestGtfDB.getById(tenantId, gtfId);
    return g ? { titular: g.titularName ?? null, permiso: g.tituloHabilitante ?? null, planId: g.planId ?? null } : null;
  },

  /**
   * La que abre el modal para la guía de este dueño (o la elegida a mano,
   * `formaId`), todas las formas (las del dueño arriba) y las impresoras.
   * null = `formaId` no existe en este tenant.
   */
  async paraDueno(
    tenantId: string,
    dueno: DuenoTalonario,
    formaId?: string | null,
  ): Promise<(FormaResuelta & { formas: ResumenForma[]; perfiles: PerfilImpresora[] }) | null> {
    const alm = await leer(tenantId);
    const r = resolverForma(alm, dueno, formaId);
    return r ? { ...r, formas: resumenFormas(alm, dueno), perfiles: listaPerfiles(alm.perfiles) } : null;
  },

  /**
   * Lo que necesita la salida (PDF / ESC/P) en UNA lectura: la forma pedida
   * (`formaId`) o la del dueño de la guía, y la impresora. `disposicion` null =
   * la forma pedida ya no existe (nunca se cae a otra: gastaría una hoja numerada).
   */
  async paraSalida(
    tenantId: string,
    dueno: DuenoTalonario,
    perfilId: string,
    formaId?: string | null,
  ): Promise<{ disposicion: DisposicionTalonario | null; perfil: PerfilImpresora | null }> {
    const alm = await leer(tenantId);
    return { disposicion: resolverForma(alm, dueno, formaId)?.disposicion ?? null, perfil: buscarPerfil(alm.perfiles, perfilId) };
  },

  /** ¿Existe esa forma en este tenant? (la cola del monte la guarda con el envío). */
  async existeForma(tenantId: string, formaId: string): Promise<boolean> {
    return !!formaDe(await leer(tenantId), formaId);
  },

  /**
   * La primera guía por imprimir en el monte que saldría con esa forma: la
   * mandada con ella o la que la elige sola (su dueño). Borrarla cambiaría en
   * silencio el encaje de una hoja ya numerada. null = ninguna.
   */
  async guiaQueUsaLaForma(
    tenantId: string,
    formaId: string,
    pendientes: readonly { gtfId: string; numeroGuia: string; formaId?: string }[],
  ): Promise<string | null> {
    const directa = pendientes.find((t) => t.formaId === formaId);
    if (directa) return directa.numeroGuia;
    const sueltas = pendientes.filter((t) => !t.formaId);
    if (!sueltas.length) return null;
    const alm = await leer(tenantId);
    for (const t of sueltas) {
      const dueno = await this.duenoDeLaGuia(tenantId, t.gtfId);
      if (dueno && resolverForma(alm, dueno)?.forma?.id === formaId) return t.numeroGuia;
    }
    return null;
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
        const cuando = firma(user);
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

  /** Las dos hojas de otra forma (id, «empresa» o la clave de un titular de antes), para copiarlas. */
  async de(tenantId: string, de: string): Promise<DisposicionTalonario | null> {
    return disposicionDe(await leer(tenantId), de);
  },

  /** Guarda UNA hoja en la forma elegida (o en la del dueño; si no tiene, la crea con su nombre automático). */
  async guardar(
    tenantId: string,
    dueno: DuenoTalonario,
    formaId: string | null,
    formato: FormatoTalonario,
    hoja: unknown,
    user = "unknown",
  ): Promise<ResultadoFormaDB> {
    const id = idNuevo();
    return cambiarFormas(tenantId, dueno, (alm) => guardarHoja(alm, dueno, formaId, formato, hoja, firma(user), id), user);
  },

  /** «Nueva forma (copia de esta)»: las dos hojas que se ven, con la referencia de la guía. */
  async crearForma(
    tenantId: string,
    dueno: DuenoTalonario,
    datos: { nombre?: string | null; guia: unknown; lista: unknown },
    user = "unknown",
  ): Promise<ResultadoFormaDB> {
    const id = idNuevo();
    return cambiarFormas(tenantId, dueno, (alm) => crearForma(alm, dueno, datos, firma(user), id), user);
  },

  async renombrarForma(tenantId: string, dueno: DuenoTalonario, formaId: string, nombre: string, user = "unknown"): Promise<ResultadoFormaDB> {
    return cambiarFormas(tenantId, dueno, (alm) => renombrarForma(alm, formaId, nombre), user);
  },

  async borrarForma(tenantId: string, dueno: DuenoTalonario, formaId: string, user = "unknown"): Promise<ResultadoFormaDB> {
    return cambiarFormas(tenantId, dueno, (alm) => borrarForma(alm, formaId), user);
  },
};
