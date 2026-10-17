/**
 * Token HMAC-SHA256 para el estado de cuenta de fiados PÚBLICO (link compartible).
 *
 * Brandon 2026-06-17: el dueño comparte por WhatsApp un link donde el cliente ve
 * su deuda consolidada — sin login, pero NO enumerable (el customerId solo no
 * sirve; hace falta la firma). Stateless: no requiere campo en DB ni migración.
 *
 * Patrón mirroreado de lib/delivery/rating-token.ts. Token = base64url(payload).sig
 * con payload = `${tenantId}.${customerId}.${exp}`. Vida 30 días por default.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.FIADO_STATEMENT_SECRET ?? process.env.AUTH_SECRET ?? "";

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url").slice(0, 16);
}

export function generateStatementToken(
  tenantId: string,
  customerId: string,
  expiresInMs: number = 30 * 24 * 60 * 60 * 1000,
): string {
  const exp = Date.now() + expiresInMs;
  const payload = `${tenantId}.${customerId}.${exp}`;
  const body = Buffer.from(payload).toString("base64url");
  return `${body}.${sign(payload)}`;
}

export type StatementVerify =
  | { valid: true; tenantId: string; customerId: string }
  | { valid: false; reason: "malformed" | "expired" | "sig_mismatch" };

export function verifyStatementToken(token: string): StatementVerify {
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return { valid: false, reason: "malformed" };
  const body = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);

  let payload: string;
  try {
    payload = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return { valid: false, reason: "malformed" };
  }

  const parts = payload.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed" };
  const [tenantId, customerId, expStr] = parts;
  if (!tenantId || !customerId || !expStr) return { valid: false, reason: "malformed" };

  const exp = parseInt(expStr, 10);
  if (Number.isNaN(exp) || exp < Date.now()) return { valid: false, reason: "expired" };

  try {
    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(sign(payload), "base64url");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: "sig_mismatch" };
    }
  } catch {
    return { valid: false, reason: "sig_mismatch" };
  }

  return { valid: true, tenantId, customerId };
}
