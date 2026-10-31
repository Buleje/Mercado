/**
 * Modelos de cotización de la empresa (F28) y recordatorios de seguimiento
 * (F31): tipos y reglas puras, sin Zod (lo importa el panel) ni base.
 *
 * Un modelo guarda SÓLO los ítems y las condiciones: nunca el cliente, la
 * fecha, la serie ni el total de la cotización de la que salió. Los modelos
 * «de este navegador» siguen en localStorage; los de la empresa viven en el
 * KV del negocio (`lib/db/cotizaciones-equipo.db.ts`) con dueño y versiones.
 */

import { diasParaVencer } from "./vigencia";

export const MAX_MODELOS_EQUIPO = 30;
export const MAX_VERSIONES_ANTERIORES = 5;
/** Un recordatorio por cotización cada 24 h: el segundo pide confirmar. */
export const HORAS_ENTRE_RECORDATORIOS = 24;

export type ItemModelo = {
  descripcion: string;
  cantidad: number;
  precioUnit: number;
  descuento?: number;
  productoId?: string;
};

export type VersionModelo = {
  version: number;
  items: ItemModelo[];
  notas?: string;
  actualizadoAt: string;
  actualizadoPor: string;
};

export type ModeloCotizacion = VersionModelo & {
  id: string;
  nombre: string;
  /** Usuario que lo creó: él (o el dueño/administrador) lo cambia o lo borra. */
  propietario: string;
  creadoAt: string;
  /** Las versiones previas, la más nueva primero. */
  anteriores: VersionModelo[];
};

export type ResultadoGuardarModelo =
  | { ok: true; modelo: ModeloCotizacion; nuevaVersion: boolean }
  | { ok: false; motivo: "duplicado"; existente: { id: string; nombre: string; version: number; propietario: string } }
  | { ok: false; motivo: "lleno" | "no-encontrado" | "sin-permiso" };

export type Recordatorio = { at: string; por: string; canal: "whatsapp" };

export type ResultadoRecordar =
  | { ok: true; recordatorios: Recordatorio[] }
  | { ok: false; motivo: "reciente"; ultimo: Recordatorio };

/** Roles que pueden cambiar o borrar el modelo de otro. */
const ROLES_QUE_ADMINISTRAN = new Set(["admin", "owner"]);

export function puedeCambiarModelo(m: Pick<ModeloCotizacion, "propietario">, quien: { usuario: string; rol: string }): boolean {
  return m.propietario === quien.usuario || ROLES_QUE_ADMINISTRAN.has(quien.rol);
}

/** «Instalación básica» = «instalacion  basica»: el mismo nombre para no duplicar. */
export const nombreClave = (s: string): string =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase().replace(/\s+/g, " ");

/** El último recordatorio si fue hace menos de 24 h. */
export function recordatorioReciente(lista: readonly Recordatorio[], ahora: Date | number = Date.now()): Recordatorio | null {
  const t = typeof ahora === "number" ? ahora : ahora.getTime();
  const ultimo = lista.at(-1);
  if (!ultimo) return null;
  const at = Date.parse(ultimo.at);
  return Number.isFinite(at) && t - at < HORAS_ENTRE_RECORDATORIOS * 3_600_000 ? ultimo : null;
}

// ── Bandeja de seguimiento (F31) ────────────────────────────────────────────

/** Días que se espera la respuesta a una enviada antes de pedir recordarla. */
export const DIAS_SIN_RESPUESTA = 3;
/** Desde cuántos días antes del vencimiento entra en «Vencen pronto». */
export const DIAS_VENCE_PRONTO = 3;

type ParaSeguir = { status: string; validoHasta: string; updatedAt: string };
export type PorSeguir<T> = { vencenPronto: { c: T; dias: number }[]; sinRespuesta: { c: T; dias: number }[] };

/**
 * Las abiertas que piden un empujón: «Vencen pronto» (enviadas o aceptadas a
 * 0-3 días de vencer, la más urgente primero) y «Sin respuesta» (enviadas hace
 * más de 3 días que todavía no vencen). Una no aparece en las dos; las ya
 * vencidas las lleva el aviso de vencidas.
 */
export function porSeguir<T extends ParaSeguir>(lista: readonly T[], ahora: Date | number = Date.now()): PorSeguir<T> {
  const t = typeof ahora === "number" ? ahora : ahora.getTime();
  const vencenPronto: { c: T; dias: number }[] = [];
  const sinRespuesta: { c: T; dias: number }[] = [];
  for (const c of lista) {
    if (c.status !== "ENVIADA" && c.status !== "ACEPTADA") continue;
    const quedan = diasParaVencer(c.validoHasta, t);
    if (quedan === null || quedan < 0) continue;
    if (quedan <= DIAS_VENCE_PRONTO) {
      vencenPronto.push({ c, dias: quedan });
      continue;
    }
    const enviada = Date.parse(c.updatedAt);
    const dias = Number.isFinite(enviada) ? Math.floor((t - enviada) / 86_400_000) : 0;
    if (c.status === "ENVIADA" && dias > DIAS_SIN_RESPUESTA) sinRespuesta.push({ c, dias });
  }
  vencenPronto.sort((a, b) => a.dias - b.dias);
  sinRespuesta.sort((a, b) => b.dias - a.dias);
  return { vencenPronto, sinRespuesta };
}
