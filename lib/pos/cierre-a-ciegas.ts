/**
 * Cierre a ciegas (Toast «blind close»): el cajero cuenta la caja SIN ver lo
 * esperado; lo esperado y la diferencia salen recién al confirmar el conteo.
 * El dueño y el admin lo ven siempre.
 *
 * Se guarda en `Settings.featureFlagsJson` (clave `cierreACiegas`), sin schema
 * nuevo. Apagado por defecto: sin la clave, nada cambia.
 *
 * Puro y client-safe.
 */

export const CLAVE_CIERRE_A_CIEGAS = "cierreACiegas";

/** Quienes ven lo esperado aunque el cierre sea a ciegas. */
export const ROLES_VEN_ESPERADO = ["admin", "owner"] as const;

/** ¿Está encendido en los flags del negocio? Sólo `true` literal lo enciende. */
export function cierreACiegasActivo(flags: Record<string, unknown> | null | undefined): boolean {
  return flags?.[CLAVE_CIERRE_A_CIEGAS] === true;
}

/** ¿Este rol cuenta sin ver lo esperado? */
export function cuentaACiegas(activo: boolean, rol: string | null | undefined): boolean {
  if (!activo) return false;
  return !(ROLES_VEN_ESPERADO as readonly string[]).includes(rol ?? "");
}

/**
 * La línea que queda en las notas del cierre cuando el cajero corrigió el
 * conteo DESPUÉS de ver lo esperado: el dueño ve las dos cifras. `null` si no
 * hubo corrección (o no era a ciegas).
 */
export function notaConteoCorregido(primerConteo: number | null, final: number): string | null {
  if (primerConteo == null || Math.abs(primerConteo - final) < 0.005) return null;
  const f = (n: number) => `S/ ${n.toFixed(2)}`;
  return `[A ciegas] contó primero ${f(primerConteo)} y lo corrigió a ${f(final)} tras ver lo esperado`;
}
