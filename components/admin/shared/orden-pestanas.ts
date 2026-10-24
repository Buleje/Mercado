/**
 * El orden de las pestañas de `AdminTabBar` (08-10).
 *
 * Una pestaña puede aparecer DESPUÉS de montar —gateada por algo que se lee
 * async: el rol, las especializaciones, el plan—. El orden guardado la tiene
 * que conservar aunque en ese momento no se vea: si se filtra por las
 * pestañas del primer render, el lugar que el usuario le dio se pierde.
 */

/**
 * `base` más los ids de `referencia` que le faltan, cada uno detrás del que
 * lo precede en `referencia` (o al principio si no tiene uno antes). No
 * duplica y no cambia el orden de lo que ya está en `base`.
 *
 *   insertarFaltantes(["a", "c"], ["a", "b", "c"]) → ["a", "b", "c"]
 */
export function insertarFaltantes(base: readonly string[], referencia: readonly string[]): string[] {
  const out = [...new Set(base)];
  referencia.forEach((id, i) => {
    if (out.includes(id)) return;
    const previa = referencia
      .slice(0, i)
      .reverse()
      .find((p) => out.includes(p));
    out.splice(previa ? out.indexOf(previa) + 1 : 0, 0, id);
  });
  return out;
}

/** El orden guardado en `localStorage`, sin filtrar por las pestañas de ahora (`null` si no hay o está roto). */
export function leerOrdenGuardado(crudo: string | null): string[] | null {
  if (!crudo) return null;
  try {
    const v: unknown = JSON.parse(crudo);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}
