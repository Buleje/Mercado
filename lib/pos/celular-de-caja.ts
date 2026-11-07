/**
 * El celular de la clienta en el cobro del POS (20-10).
 *
 * Puro: lo usan el buscador del cobro (para ofrecer «Usar el celular»), la
 * ruta de ventas (alta rápida y búsqueda dentro del negocio) y la vista previa
 * del precio de revendedora. Misma regla que `normalizePhone` y
 * `phoneMatchCandidates` de `CustomersDB` (que no se exporta).
 */

/** Celular peruano de 9 dígitos (empieza con 9) a partir de lo tipeado, o `null`. */
export function celularDeCaja(texto: string): string | null {
  const digitos = texto.replace(/\D/g, "");
  const nueve = digitos.length >= 9 ? digitos.slice(-9) : digitos;
  return /^9\d{8}$/.test(nueve) ? nueve : null;
}

/**
 * Formatos con los que puede estar guardado ese celular (9 dígitos, `51…`,
 * `+51…` o tal cual). La ficha de un login social (`google_…`) va exacta: sus
 * dígitos no son un teléfono.
 */
export function formatosDelCelular(texto: string): string[] {
  const tal = texto.trim();
  if (!tal) return [];
  if (/^(google|facebook)_/.test(tal)) return [tal];
  const digitos = tal.replace(/\D/g, "");
  const nueve = digitos.length >= 9 ? digitos.slice(-9) : digitos;
  return Array.from(new Set([nueve, `51${nueve}`, `+51${nueve}`, tal].filter((x) => x && x !== "51" && x !== "+51")));
}

/** «987 654 321» para mostrar. */
export function celularLegible(celular: string): string {
  return /^\d{9}$/.test(celular) ? `${celular.slice(0, 3)} ${celular.slice(3, 6)} ${celular.slice(6)}` : celular;
}
