/**
 * ADR-491: las rutas del registro de firmas en el bucket privado y el hash del
 * token del enlace. Puro (sin base ni red); usa `node:crypto`, así que es del
 * SERVIDOR: la pantalla y la página pública no lo importan.
 *
 * Forma de la ruta: `<tenantId>/adelantos/<adelantoId>/registro/<ms>-<firma|huella>-<azar>.webp`
 * — dentro de la carpeta del adelanto (la misma que la hoja firmada vieja), en
 * su subcarpeta `registro/`. El CHECK `AdelantoFirma_ruta_chk` de la base exige
 * el prefijo `<tenantId>/adelantos/<adelantoId>/`.
 */
import { createHash } from "node:crypto";
import type { TipoFirma } from "./entregar-tipos";

/** Ids de la base (cuid, o `main`): sin `/`, `.` ni `%`, así no arman otra carpeta. */
const ID_SEGURO = /^[A-Za-z0-9_-]{1,64}$/;
export const CARPETA_REGISTRO = "registro";
const ARCHIVO_REGISTRO = /^\d{10,16}-(firma|huella)-[a-f0-9]{8,32}\.webp$/;

/** 32 bytes en base64url = 43 caracteres. Lo que no tiene esta forma no toca la base. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function carpetaRegistro(tenantId: string, adelantoId: string): string {
  if (!ID_SEGURO.test(tenantId) || !ID_SEGURO.test(adelantoId)) throw new Error("id inválido para la carpeta del registro");
  return `${tenantId}/adelantos/${adelantoId}/${CARPETA_REGISTRO}`;
}

export function rutaRegistroPrivada(tenantId: string, adelantoId: string, tipo: TipoFirma, ms: number, azar: string): string {
  const az = azar.toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 32);
  if (az.length < 8) throw new Error("azar corto para la ruta del registro");
  return `${carpetaRegistro(tenantId, adelantoId)}/${Math.trunc(ms)}-${tipo === "HUELLA" ? "huella" : "firma"}-${az}.webp`;
}

/** Sólo un archivo del registro de ESTE adelanto de ESTE negocio, un tramo, sin nada raro. */
export function esRutaRegistroDelAdelanto(ruta: string, tenantId: string, adelantoId: string): boolean {
  if (!ID_SEGURO.test(tenantId) || !ID_SEGURO.test(adelantoId)) return false;
  const base = `${tenantId}/adelantos/${adelantoId}/${CARPETA_REGISTRO}/`;
  return ruta.startsWith(base) && ARCHIVO_REGISTRO.test(ruta.slice(base.length));
}

export function sha256Hex(datos: Uint8Array | string): string {
  return createHash("sha256").update(datos).digest("hex");
}

/** La base guarda SOLO esto: un volcado de la tabla no da enlaces vivos. */
export function hashToken(token: string): string {
  return sha256Hex(token);
}
