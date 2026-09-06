// Alfabeto sin caracteres ambiguos (O/0/I/1/L) para códigos legibles al dictar.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Código corto y legible para compartir una junta del barrio (ej. "BARRIO-7F3X").
 * `rng` es inyectable para tests deterministas; por defecto usa Math.random.
 */
export function makeJuntaCode(rng: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  }
  return `BARRIO-${out}`;
}
