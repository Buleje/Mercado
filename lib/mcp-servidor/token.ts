import "server-only";

/**
 * lib/mcp-servidor/token.ts — Buleje IA (ADR-528), carril 4.
 *
 * La clave de una conexión MCP: `bul_mcp_` + 32 bytes aleatorios en base64url
 * (43 letras, 256 bits). La base guarda SOLO su SHA-256 y los primeros 12
 * caracteres para reconocerla en la pantalla; el token entero se muestra una
 * vez, al crearla, y no se puede volver a leer.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const PREFIJO_TOKEN_MCP = "bul_mcp_";

/** Caracteres que se guardan para reconocer la clave («bul_mcp_AbCd»). */
export const LARGO_PREFIJO_VISIBLE = 12;

/** `bul_mcp_` + 43 letras base64url sin relleno. */
const FORMATO = /^bul_mcp_[A-Za-z0-9_-]{43}$/;

export function generarTokenMcp(): string {
  return PREFIJO_TOKEN_MCP + randomBytes(32).toString("base64url");
}

/** ¿Tiene la forma de una clave nuestra? Barato: evita ir a la base con basura. */
export function formatoTokenValido(token: string): boolean {
  return FORMATO.test(token);
}

/** SHA-256 en hex (64). Una clave de 256 bits aleatorios no necesita sal ni bcrypt. */
export function hashTokenMcp(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function prefijoVisible(token: string): string {
  return token.slice(0, LARGO_PREFIJO_VISIBLE);
}

/**
 * Compara dos hashes hex en tiempo constante. Largos distintos = false sin
 * llamar a `timingSafeEqual` (que tira); ambos son hex de 64, así que el largo
 * no filtra nada del token.
 */
export function hashesIguales(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
