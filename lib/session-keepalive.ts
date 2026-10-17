"use client";

/**
 * lib/session-keepalive.ts
 *
 * Estado del "modo mantener sesión activa" — un switch por-dispositivo
 * (localStorage) que, cuando está ON, hace que el panel refresque la sesión
 * mientras la pestaña esté abierta y en uso, para no volver al login mientras
 * el usuario trabaja.
 *
 * SEGURIDAD: NO cambia la duración base de los tokens ni debilita el modelo.
 * Solo usa el refresh/rotación que YA existe, de forma proactiva. Si se cierra
 * el navegador, la pestaña queda idle mucho tiempo, o se llega al tope de
 * refresh (admin 7d) / rotación (superadmin), la sesión expira igual.
 */

const KEY = "bsm-session-keepalive";
/** Se emite cuando cambia el switch ON/OFF. */
export const KEEPALIVE_EVENT = "bsm-keepalive-changed";
/** Se emite en cada renovación exitosa de la sesión (para mostrar "activo · hace Xs"). */
export const KEEPALIVE_PING_EVENT = "bsm-keepalive-ping";

export function getKeepAlive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setKeepAlive(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* storage lleno / bloqueado — igual emitimos el evento */
  }
  window.dispatchEvent(new CustomEvent(KEEPALIVE_EVENT, { detail: on }));
}

/**
 * El último cierre de sesión INVOLUNTARIO (Brandon 2026-10-09: «por alguna razón
 * se cierra sesión»): lo anota la puerta única de renovación al recibir un 401 y
 * lo muestra el login, para que el motivo deje de ser un misterio.
 */
const CLAVE_CIERRE = "bsm-ultimo-cierre";

export interface UltimoCierre {
  /** El `error` que devolvió /api/auth/refresh. */
  motivo: string;
  at: number;
}

export function anotarCierreInvoluntario(motivo: string): void {
  try {
    localStorage.setItem(CLAVE_CIERRE, JSON.stringify({ motivo, at: Date.now() } satisfies UltimoCierre));
  } catch {
    /* sin almacenamiento: el login muestra el aviso genérico */
  }
}

/** Lo lee UNA vez (y lo borra) si pasó hace menos de un día. */
export function tomarUltimoCierre(): UltimoCierre | null {
  try {
    const crudo = localStorage.getItem(CLAVE_CIERRE);
    localStorage.removeItem(CLAVE_CIERRE);
    if (!crudo) return null;
    const c = JSON.parse(crudo) as Partial<UltimoCierre>;
    if (typeof c.motivo !== "string" || typeof c.at !== "number" || Date.now() - c.at > 24 * 60 * 60 * 1000) return null;
    return { motivo: c.motivo, at: c.at };
  } catch {
    return null;
  }
}

/** El motivo en palabras del dueño. */
export function motivoDeCierre(motivo: string): string {
  if (/already used/i.test(motivo)) return "La sesión se usó desde otra copia del mismo acceso (otro navegador o equipo). Por seguridad se cerró aquí.";
  if (/revoked/i.test(motivo)) return "Alguien cerró todas las sesiones de tu usuario.";
  if (/expired|invalid/i.test(motivo)) return "La sesión guardada ya no era válida: más de 7 días sin usarla en este equipo, o se cambió la clave del sistema.";
  if (/no activo|inactive/i.test(motivo)) return "Tu usuario está desactivado. Pídele al dueño que lo reactive.";
  if (/no refresh token/i.test(motivo)) return "El navegador borró la sesión guardada (cookies limpiadas o modo incógnito).";
  return "La sesión se cerró en el servidor.";
}
