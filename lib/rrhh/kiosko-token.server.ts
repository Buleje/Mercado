import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * El secreto del enlace del kiosko (`lib/rrhh/kiosko.ts`): 32 bytes al azar
 * en base64url. Se guarda sólo su SHA-256: con 256 bits de azar no hace falta
 * sal ni un hash lento, y quien lea la base no puede armar el enlace.
 */

export function hashSecretoKiosko(secreto: string): string {
  return createHash("sha256").update(secreto, "utf8").digest("hex");
}

/** Token nuevo para el negocio: `<tenantId>.<secreto>` + lo que se guarda. */
export function nuevoTokenKiosko(tenantId: string): { token: string; hash: string; fin: string } {
  const secreto = randomBytes(32).toString("base64url");
  return { token: `${tenantId}.${secreto}`, hash: hashSecretoKiosko(secreto), fin: secreto.slice(-4) };
}

/** ¿El secreto es el del hash guardado? Comparación en tiempo constante. */
export function secretoCoincide(secreto: string, hashGuardado: string | null): boolean {
  if (!hashGuardado || !/^[0-9a-f]{64}$/.test(hashGuardado)) return false;
  const a = Buffer.from(hashSecretoKiosko(secreto), "hex");
  const b = Buffer.from(hashGuardado, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Secreto de la cookie de la tablet atada (`kiosko-aparato.ts`): mismo azar, mismo hash. */
export function nuevoSecretoAparato(): { secreto: string; hash: string } {
  const secreto = randomBytes(32).toString("base64url");
  return { secreto, hash: hashSecretoKiosko(secreto) };
}
