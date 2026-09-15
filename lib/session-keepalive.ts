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
