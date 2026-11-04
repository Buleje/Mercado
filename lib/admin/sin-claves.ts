/**
 * sin-claves — el texto libre del panel no guarda contraseñas (ADR-524 §4.3).
 *
 * Las notas de trámites, alquileres y fichas son el lugar natural para
 * escribir «clave SOL: ABCD1234» de apuro. Eso NO se guarda: rechazamos lo que
 * tiene forma de clave con un 422 `parece_clave`. Es una red, no un cofre: una
 * clave suelta sin rótulo pasa (falso negativo aceptado). Lo que sí debe pasar
 * siempre es la frase sin la clave: «la clave SOL la tiene Brandon».
 *
 * Puro y sin `server-only`: el cliente puede avisar antes de mandar.
 */
import { z } from "zod";

/** Rótulo de clave + `:`/`=` + algo de 4 o más caracteres. */
const CLAVE_ROTULADA = /\b(clave(\s*sol)?|contrase[ñn]a|password|pass|pin|usuario\s*sol)\s*[:=]\s*\S{4,}/i;

/**
 * «SOL» seguido (a ≤15 caracteres) de una palabra de 8 letras o dígitos: el
 * usuario SOL de SUNAT tiene 8. Sobre la regla del contrato se pide que la
 * palabra tenga un dígito o esté toda en mayúsculas («hace sol, mañana
 * llevamos» no es una clave) y que entre medio no haya «DNI»/«RUC» (un DNI son
 * 8 dígitos: «trámite SOL para el DNI 80186494» tampoco lo es).
 */
const SOL_Y_TOKEN = /\bsol\b(.{0,15}?)\b([a-z0-9]{8})\b/gi;
const TOKEN_CON_FORMA = /\d|^[A-Z0-9]{8}$/;
const DOCUMENTO_EN_MEDIO = /\b(dni|ruc|doc)\b/i;

/** `true` si el texto parece llevar una clave o un usuario SOL. */
export function pareceClave(texto: string | null | undefined): boolean {
  if (!texto) return false;
  if (CLAVE_ROTULADA.test(texto)) return true;
  for (const m of texto.matchAll(SOL_Y_TOKEN)) {
    const medio = m[1] ?? "";
    const token = m[2] ?? "";
    if (TOKEN_CON_FORMA.test(token) && !DOCUMENTO_EN_MEDIO.test(medio)) return true;
  }
  return false;
}

/** El `message` del issue de Zod que la ruta convierte en 422. */
export const MENSAJE_PARECE_CLAVE = "parece_clave";

/** Texto libre recortado, con tope y sin claves. */
export function textoSinClave(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .refine((t) => !pareceClave(t), { message: MENSAJE_PARECE_CLAVE });
}

export type RespuestaInvalida =
  | { status: 422; body: { error: "parece_clave"; campo: string; message: string } }
  | { status: 400; body: { error: "invalid_body"; issues: { path: string; message: string }[] } };

/**
 * Traduce el error de un `safeParse` al contrato de ADR-524: si algún campo
 * parece clave → 422 `parece_clave` con el campo; si no → 400 `invalid_body`.
 */
export function respuestaInvalida(error: z.ZodError): RespuestaInvalida {
  const clave = error.issues.find((i) => i.message === MENSAJE_PARECE_CLAVE);
  if (clave) {
    return {
      status: 422,
      body: {
        error: "parece_clave",
        campo: clave.path.map(String).join("."),
        message: "Eso parece una clave o un usuario SOL. Las claves no se guardan en el panel: anota solo quién la tiene.",
      },
    };
  }
  return {
    status: 400,
    body: {
      error: "invalid_body",
      issues: error.issues.slice(0, 10).map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    },
  };
}
