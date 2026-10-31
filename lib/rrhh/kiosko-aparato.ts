/**
 * kiosko-aparato.ts — el enlace del kiosko de asistencia queda ATADO a un
 * solo aparato (security 10-10, H1): la primera tablet que lo abre recibe una
 * cookie httpOnly con un secreto propio y la configuración guarda su hash.
 * Desde ahí, el enlace solo no alcanza para marcar: hace falta esa tablet.
 * Un enlace que se filtró (foto del QR, analítica, captura) ya no sirve en un
 * celular, y probar DNIs exige estar frente a la tablet del local.
 *
 * Para cambiar de tablet se genera un enlace nuevo (borra el aparato).
 *
 * PURO: sin Prisma, React ni fetch.
 */

import type { ConfigKiosko } from "./kiosko";

/** Cookie del aparato: sólo viaja a `/api/kiosko/*` (la página no la lee). */
export const COOKIE_APARATO_KIOSKO = "kiosko-aparato";
export const RUTA_COOKIE_APARATO = "/api/kiosko";

export const MENSAJE_OTRO_APARATO =
  "Este enlace ya está abierto en otra tablet. Para usar ésta, pídele al encargado un enlace nuevo.";

export type EstadoAparato = "libre" | "propio" | "otro";

/**
 * ¿Esta tablet es la del kiosko? `coincide` = el hash de su cookie es el
 * guardado (lo calcula el servidor con `secretoCoincide`).
 *  · libre  → el enlace todavía no se abrió en ningún aparato: se ata a éste;
 *  · propio → es la tablet atada;
 *  · otro   → el enlace ya está atado a otro aparato.
 */
export function estadoAparato(c: Pick<ConfigKiosko, "aparatoHash">, coincide: boolean): EstadoAparato {
  if (!c.aparatoHash) return "libre";
  return coincide ? "propio" : "otro";
}

/** Segundos de vida de la cookie: hasta que vence el enlace (mínimo 1 min, máximo 400 días). */
export function vidaCookieAparato(venceEn: string | null, ahora: Date): number {
  const vence = venceEn ? Date.parse(venceEn) : NaN;
  const seg = Number.isFinite(vence) ? Math.floor((vence - ahora.getTime()) / 1000) : 0;
  return Math.min(Math.max(seg, 60), 400 * 86_400);
}

/** ¿Falta la foto? Sin foto sólo se marca si el dueño lo permitió (apagado por defecto). */
export function faltaFoto(c: Pick<ConfigKiosko, "permitirSinFoto">, hayFoto: boolean): boolean {
  return !hayFoto && !c.permitirSinFoto;
}

/**
 * «Android · Chrome», «iPad · Safari»: para que el dueño reconozca la tablet
 * atada en el panel. Nunca el user-agent entero.
 */
export function resumirAparato(ua: string | null | undefined): string {
  const t = (ua ?? "").slice(0, 400);
  if (!t) return "Aparato sin nombre";
  const sistema = /iPad/.test(t)
    ? "iPad"
    : /iPhone/.test(t)
      ? "iPhone"
      : /Android/.test(t)
        ? "Android"
        : /Windows/.test(t)
          ? "Windows"
          : /CrOS/.test(t)
            ? "ChromeOS"
            : /Mac OS X|Macintosh/.test(t)
              ? "Mac"
              : /Linux/.test(t)
                ? "Linux"
                : null;
  const navegador = /Edg\//.test(t)
    ? "Edge"
    : /SamsungBrowser\//.test(t)
      ? "Samsung Internet"
      : /OPR\/|Opera/.test(t)
        ? "Opera"
        : /Firefox\/|FxiOS\//.test(t)
          ? "Firefox"
          : /Chrome\/|CriOS\//.test(t)
            ? "Chrome"
            : /Safari\//.test(t)
              ? "Safari"
              : null;
  const partes = [sistema, navegador].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Aparato sin nombre";
}
