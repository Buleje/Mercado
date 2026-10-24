import "server-only";

/**
 * Cotizaciones compartidas por el equipo, sin tabla (F28 y F31, 17-10).
 *
 * Dos claves `interno:` del KV por negocio (no viajan en `getAll()` ni
 * invalidan la foto global de configuración; el aislamiento es la clave):
 *   - `interno:cotizacion-modelos:<t>` → lista de modelos con dueño y versiones.
 *   - `interno:cotizacion-seguimiento:<t>` → `{ "<cotizacionId>": Recordatorio[] }`.
 *
 * Toda escritura pasa por `PlatformSettingsDB.actualizar` (lee-modifica-escribe
 * bajo candado): dos personas que guardan a la vez no se pisan.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PlatformSettingsDB } from "./platform-settings.db";
import { logger } from "@/lib/logger";
import {
  MAX_MODELOS_EQUIPO,
  MAX_VERSIONES_ANTERIORES,
  nombreClave,
  puedeCambiarModelo,
  recordatorioReciente,
  type ModeloCotizacion,
  type Recordatorio,
  type ResultadoGuardarModelo,
  type ResultadoRecordar,
  type VersionModelo,
} from "@/lib/cotizaciones/modelos";

const CLAVE_MODELOS = (tenantId: string) => `interno:cotizacion-modelos:${tenantId}`;
const CLAVE_SEGUIMIENTO = (tenantId: string) => `interno:cotizacion-seguimiento:${tenantId}`;
const TX = { maxWait: 10_000, timeout: 10_000 } as const;
/** Recordatorios que se guardan por cotización (los más nuevos). */
const MAX_RECORDATORIOS = 20;
const MAX_COTIZACIONES_SEGUIDAS = 300;

export const ItemModeloSchema = z.object({
  descripcion: z.string().trim().min(1).max(300),
  cantidad: z.number().positive().max(1_000_000),
  precioUnit: z.number().min(0).max(1_000_000_000),
  descuento: z.number().min(0).max(100).optional(),
  productoId: z.string().regex(/^\d{1,12}$/).optional(),
});

export const GuardarModeloSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  items: z.array(ItemModeloSchema).min(1).max(100),
  notas: z.string().max(2000).optional(),
  /** El modelo del que esto es una versión nueva. */
  reemplazarId: z.string().min(1).max(40).optional(),
});
export type GuardarModelo = z.infer<typeof GuardarModeloSchema>;

const VersionSchema = z.object({
  version: z.number().int().positive(),
  items: z.array(ItemModeloSchema).min(1).max(100),
  notas: z.string().max(2000).optional(),
  actualizadoAt: z.string(),
  actualizadoPor: z.string(),
});

const ModeloSchema = VersionSchema.extend({
  id: z.string().min(1).max(40),
  nombre: z.string().min(1).max(80),
  propietario: z.string(),
  creadoAt: z.string(),
  anteriores: z.array(VersionSchema).max(MAX_VERSIONES_ANTERIORES).default([]),
});

const RecordatorioSchema = z.object({ at: z.string(), por: z.string(), canal: z.literal("whatsapp") });

function exigirTenant(tenantId: string): void {
  if (!tenantId) throw new Error("tenantId is required");
}

/** Los modelos válidos; uno roto se salta (y se avisa) sin tirar la lista entera. */
function modelosDe(valor: unknown, tenantId: string): ModeloCotizacion[] {
  if (!Array.isArray(valor)) return [];
  const out: ModeloCotizacion[] = [];
  for (const v of valor) {
    const r = ModeloSchema.safeParse(v);
    if (r.success) out.push(r.data);
    else logger.warn("[cotizaciones-equipo] modelo inválido en el KV, se salta", { tenantId });
  }
  return out;
}

function seguimientoDe(valor: unknown): Record<string, Recordatorio[]> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  const out: Record<string, Recordatorio[]> = {};
  for (const [id, lista] of Object.entries(valor as Record<string, unknown>)) {
    if (!Array.isArray(lista)) continue;
    const buenos = lista.flatMap((x) => {
      const r = RecordatorioSchema.safeParse(x);
      return r.success ? [r.data] : [];
    });
    if (buenos.length > 0) out[id] = buenos;
  }
  return out;
}

const versionDe = (m: ModeloCotizacion): VersionModelo => ({
  version: m.version,
  items: m.items,
  ...(m.notas !== undefined && { notas: m.notas }),
  actualizadoAt: m.actualizadoAt,
  actualizadoPor: m.actualizadoPor,
});

const resumen = (m: ModeloCotizacion) => ({ id: m.id, nombre: m.nombre, version: m.version, propietario: m.propietario });

export const CotizacionesEquipoDB = {
  /** Sin caché: lo que guardó un compañero recién tiene que aparecer. */
  async listarModelos(tenantId: string): Promise<ModeloCotizacion[]> {
    exigirTenant(tenantId);
    return modelosDe(await PlatformSettingsDB.getFresco<unknown>(CLAVE_MODELOS(tenantId)), tenantId);
  },

  /**
   * Crea un modelo o, con `reemplazarId`, guarda una versión nueva (la de
   * antes queda en `anteriores`). Un nombre que ya existe NO se pisa: vuelve
   * `duplicado` y la pantalla ofrece «Guardar como versión nueva».
   */
  async guardarModelo(
    tenantId: string,
    entrada: GuardarModelo,
    quien: { usuario: string; rol: string },
    ahora: Date = new Date(),
  ): Promise<ResultadoGuardarModelo> {
    exigirTenant(tenantId);
    return PlatformSettingsDB.actualizar<unknown, ResultadoGuardarModelo>(
      CLAVE_MODELOS(tenantId),
      (actual) => {
        const lista = modelosDe(actual, tenantId);
        const at = ahora.toISOString();
        const clave = nombreClave(entrada.nombre);
        const contenido = {
          nombre: entrada.nombre,
          items: entrada.items,
          ...(entrada.notas?.trim() ? { notas: entrada.notas.trim() } : {}),
        };
        if (entrada.reemplazarId) {
          const i = lista.findIndex((m) => m.id === entrada.reemplazarId);
          if (i < 0) return { resultado: { ok: false, motivo: "no-encontrado" } };
          const previo = lista[i];
          if (!puedeCambiarModelo(previo, quien)) return { resultado: { ok: false, motivo: "sin-permiso" } };
          const choca = lista.find((m) => m.id !== previo.id && nombreClave(m.nombre) === clave);
          if (choca) return { resultado: { ok: false, motivo: "duplicado", existente: resumen(choca) } };
          const modelo: ModeloCotizacion = {
            id: previo.id,
            propietario: previo.propietario,
            creadoAt: previo.creadoAt,
            ...contenido,
            version: previo.version + 1,
            actualizadoAt: at,
            actualizadoPor: quien.usuario,
            anteriores: [versionDe(previo), ...previo.anteriores].slice(0, MAX_VERSIONES_ANTERIORES),
          };
          const nueva = lista.slice();
          nueva[i] = modelo;
          return { valor: nueva, resultado: { ok: true, modelo, nuevaVersion: true } };
        }
        const choca = lista.find((m) => nombreClave(m.nombre) === clave);
        if (choca) return { resultado: { ok: false, motivo: "duplicado", existente: resumen(choca) } };
        if (lista.length >= MAX_MODELOS_EQUIPO) return { resultado: { ok: false, motivo: "lleno" } };
        const modelo: ModeloCotizacion = {
          id: randomUUID().replace(/-/g, "").slice(0, 16),
          ...contenido,
          propietario: quien.usuario,
          version: 1,
          creadoAt: at,
          actualizadoAt: at,
          actualizadoPor: quien.usuario,
          anteriores: [],
        };
        return { valor: [modelo, ...lista], resultado: { ok: true, modelo, nuevaVersion: false } };
      },
      quien.usuario,
      TX,
    );
  },

  async borrarModelo(
    tenantId: string,
    id: string,
    quien: { usuario: string; rol: string },
  ): Promise<"ok" | "no-encontrado" | "sin-permiso"> {
    exigirTenant(tenantId);
    return PlatformSettingsDB.actualizar<unknown, "ok" | "no-encontrado" | "sin-permiso">(
      CLAVE_MODELOS(tenantId),
      (actual) => {
        const lista = modelosDe(actual, tenantId);
        const m = lista.find((x) => x.id === id);
        if (!m) return { resultado: "no-encontrado" };
        if (!puedeCambiarModelo(m, quien)) return { resultado: "sin-permiso" };
        return { valor: lista.filter((x) => x.id !== id), resultado: "ok" };
      },
      quien.usuario,
      TX,
    );
  },

  async recordatorios(tenantId: string): Promise<Record<string, Recordatorio[]>> {
    exigirTenant(tenantId);
    return seguimientoDe(await PlatformSettingsDB.getFresco<unknown>(CLAVE_SEGUIMIENTO(tenantId)));
  },

  /**
   * Anota que se le recordó al cliente. Si ya se hizo hace menos de 24 h
   * vuelve `reciente` (sin anotar): la pantalla pregunta antes de mandar otro.
   * Guarda las {@link MAX_COTIZACIONES_SEGUIDAS} cotizaciones con el último
   * recordatorio más nuevo: las viejas se cerraron hace rato.
   */
  async registrarRecordatorio(
    tenantId: string,
    cotizacionId: string,
    usuario: string,
    opciones: { forzar?: boolean } = {},
    ahora: Date = new Date(),
  ): Promise<ResultadoRecordar> {
    exigirTenant(tenantId);
    return PlatformSettingsDB.actualizar<unknown, ResultadoRecordar>(
      CLAVE_SEGUIMIENTO(tenantId),
      (actual) => {
        const mapa = seguimientoDe(actual);
        const previos = mapa[cotizacionId] ?? [];
        const reciente = recordatorioReciente(previos, ahora);
        if (reciente && !opciones.forzar) return { resultado: { ok: false, motivo: "reciente", ultimo: reciente } };
        const recordatorios = [...previos, { at: ahora.toISOString(), por: usuario, canal: "whatsapp" as const }].slice(
          -MAX_RECORDATORIOS,
        );
        mapa[cotizacionId] = recordatorios;
        const ultimoAt = (l: Recordatorio[]) => l.at(-1)?.at ?? "";
        const nuevo = Object.fromEntries(
          Object.entries(mapa)
            .sort(([, a], [, b]) => ultimoAt(b).localeCompare(ultimoAt(a)))
            .slice(0, MAX_COTIZACIONES_SEGUIDAS),
        );
        return { valor: nuevo, resultado: { ok: true, recordatorios } };
      },
      usuario,
      TX,
    );
  },
};
