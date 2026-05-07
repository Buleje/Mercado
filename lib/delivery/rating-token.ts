/**
 * SECURITY (F3 2026-05-07): HMAC tokens para endpoints de delivery/tip y
 * delivery/rate. Sin token, cualquiera con un orderId enumerable podía dejar
 * propinas arbitrarias o 1-star bombing de competencia.
 *
 * Flujo:
 *   1. Al crear la DeliveryAssignment, generar token con generateRatingToken(orderId).
 *   2. Incluir el token en el link enviado al cliente por WhatsApp/email.
 *   3. El cliente envía ?token=<token> al POST /api/delivery/tip/:orderId y
 *      POST /api/delivery/rate.
 *   4. El endpoint valida con verifyRatingToken(token, orderId).
 *
 * Backwards-compat: si el token no viene, el endpoint permite la acción con
 * un warning "[delivery/...] legacy unauthenticated request" para detectar
 * uso real antes de hacerlo obligatorio.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.DELIVERY_RATING_SECRET ?? process.env.AUTH_SECRET ?? "";

/**
 * Genera un token HMAC-SHA256 de vida limitada para calificar/propinar una entrega.
 * Formato: `${orderId}.${expMs}.${sig16}` (URL-safe, sin punto en base64url excepto separadores).
 */
export function generateRatingToken(
  orderId: string,
  expiresInMs: number = 7 * 24 * 60 * 60 * 1000,
): string {
  const exp = Date.now() + expiresInMs;
  const payload = `${orderId}.${exp}`;
  const sig = createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url")
    .slice(0, 16);
  return `${payload}.${sig}`;
}

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: "malformed" | "order_mismatch" | "expired" | "sig_length" | "sig_mismatch" | "sig_decode" };

/**
 * Verifica un token generado por generateRatingToken.
 * Usa timingSafeEqual para evitar timing attacks en la comparación de firma.
 */
export function verifyRatingToken(token: string, orderId: string): VerifyResult {
  // token tiene la forma: "<orderId>.<expMs>.<sig16>"
  // orderId puede contener guiones; split desde el final es más robusto.
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return { valid: false, reason: "malformed" };
  const sig = token.slice(lastDot + 1);
  const rest = token.slice(0, lastDot); // "<orderId>.<expMs>"

  const midDot = rest.lastIndexOf(".");
  if (midDot < 0) return { valid: false, reason: "malformed" };
  const tokenOrderId = rest.slice(0, midDot);
  const expStr = rest.slice(midDot + 1);

  if (!tokenOrderId || !expStr || !sig) return { valid: false, reason: "malformed" };
  if (tokenOrderId !== orderId) return { valid: false, reason: "order_mismatch" };

  const exp = parseInt(expStr, 10);
  if (Number.isNaN(exp) || exp < Date.now()) return { valid: false, reason: "expired" };

  const payload = `${tokenOrderId}.${expStr}`;
  const expected = createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url")
    .slice(0, 16);

  try {
    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length) return { valid: false, reason: "sig_length" };
    if (!timingSafeEqual(sigBuf, expBuf)) return { valid: false, reason: "sig_mismatch" };
  } catch {
    return { valid: false, reason: "sig_decode" };
  }

  return { valid: true };
}
