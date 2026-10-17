import { z } from "zod";

/**
 * Motivo obligatorio al anular o ajustar (decisión b-9 de Brandon, 17-10:
 * «Motivo siempre»). Una sola regla para el servidor y la pantalla: al menos
 * 3 letras o números. «...» o «   » no explican nada y no pasan.
 *
 * Sin `server-only`: la pantalla usa `motivoSuficiente` para no dejar
 * confirmar, y el servidor el esquema de Zod para no guardar sin motivo.
 */
export const MOTIVO_MIN_UTILES = 3;

export const MENSAJE_MOTIVO = "Escribe el motivo (al menos 3 letras o números).";

/** Una sola línea, sin espacios de sobra: la bitácora lo lee de vuelta. */
export function limpiarMotivo(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/** Cuántas letras o números trae el texto (lo que de verdad explica algo). */
export function caracteresUtiles(texto: string): number {
  return (texto.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

export function motivoSuficiente(texto: string | null | undefined): boolean {
  return caracteresUtiles(texto ?? "") >= MOTIVO_MIN_UTILES;
}

/**
 * Campo de Zod para un motivo exigido: string, tope `max`, ≥3 útiles y
 * devuelto en una línea. Falta o vacío = el mismo mensaje en español.
 */
export function motivoObligatorio(max: number) {
  return z
    .string({ error: MENSAJE_MOTIVO })
    .max(max, `El motivo es muy largo (máximo ${max} letras).`)
    .refine(motivoSuficiente, MENSAJE_MOTIVO)
    .transform(limpiarMotivo);
}

/** ¿El error de Zod es por el motivo? Para responder su mensaje y no el genérico. */
export function errorDeMotivo(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>, campo: string): string | null {
  const issue = issues.find((i) => i.path.includes(campo));
  return issue ? issue.message : null;
}
