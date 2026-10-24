/**
 * El conteo de trozas de la inspección vive también en el equipo: si se cae la
 * señal en medio del patio, lo escaneado no se pierde. Sin `localStorage`
 * (modo privado lleno, permisos) se sigue contando sólo en memoria.
 */
import { logger } from "@/lib/logger";

export function leerLocal(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}

export function escribirLocal(clave: string, valor: string): void {
  try {
    window.localStorage.setItem(clave, valor);
  } catch (err) {
    logger.warn("[inspeccion] no se pudo guardar el conteo en el equipo", { error: String(err) });
  }
}
