/**
 * lib/socio/referral.ts — Referidos de Socio Buleje.
 *
 * El "código de referido" es el userId codificado en base64url (reversible),
 * así no necesitamos una columna nueva en el schema. El link de invitación lleva
 * `?ref=<code>`; al hacerse Socio el invitado, el referrer gana cashback.
 *
 * Isomórfico (server + client) — usa btoa/atob en el browser y Buffer en Node.
 */

/** Recompensa en soles al referrer cuando su invitado se hace Socio. */
export const REFERRAL_REWARD_SOLES = 10;

function toB64Url(s: string): string {
  const b64 =
    typeof btoa !== "undefined"
      ? btoa(s)
      : Buffer.from(s, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(code: string): string | null {
  try {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const s =
      typeof atob !== "undefined"
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("utf8");
    return s || null;
  } catch {
    return null;
  }
}

/** Codifica el userId del referrer como código de referido URL-safe. */
export function encodeReferralCode(userId: string): string {
  return toB64Url(userId);
}

/** Decodifica un código de referido → userId del referrer (o null si inválido). */
export function decodeReferralCode(code: string): string | null {
  if (!code || code.length > 200) return null;
  const s = fromB64Url(code);
  // userIds válidos: alfanuméricos + separadores comunes, longitud sana.
  if (!s || s.length < 1 || s.length > 120 || !/^[\w.:@-]+$/.test(s)) return null;
  return s;
}
