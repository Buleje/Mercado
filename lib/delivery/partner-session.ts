/**
 * lib/delivery/partner-session.ts
 *
 * Sesión específica para DeliveryPartners (motorizados).
 * Reusa el firmante HMAC de lib/session.ts pero con cookie aparte y
 * payload restringido (solo partnerId + tenantId — sin role admin).
 *
 * Cookie: `buleje-partner-sess` (HttpOnly, SameSite=strict, 7d).
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";

const ENC = new TextEncoder();
const ACCESS_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  return process.env.AUTH_SECRET ?? "dev-fallback-secret-min-32-chars-1234";
}

async function signHmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    ENC.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, ENC.encode(data));
  return new Uint8Array(sig);
}

function b64Encode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

function b64Decode(s: string): string {
  try {
    return decodeURIComponent(escape(atob(s)));
  } catch {
    return "";
  }
}

export interface PartnerSession {
  partnerId: string;
  tenantId: string;
  name: string;
  exp: number;
}

export const PARTNER_COOKIE = "buleje-partner-sess";

export async function createPartnerToken(
  partnerId: string,
  tenantId: string,
  name = "",
): Promise<string> {
  const payload: PartnerSession = {
    partnerId,
    tenantId,
    name,
    exp: Date.now() + ACCESS_MS,
  };
  const encoded = b64Encode(JSON.stringify(payload));
  const sigBytes = await signHmac(getSecret(), encoded);
  const sig = Buffer.from(sigBytes).toString("base64");
  return `${encoded}.${sig}`;
}

export async function verifyPartnerToken(
  token: string,
): Promise<PartnerSession | null> {
  if (!token || !token.includes(".")) return null;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  try {
    const expected = await signHmac(getSecret(), encoded);
    const expectedB64 = Buffer.from(expected).toString("base64");
    if (expectedB64 !== sig) return null;
    const payload = JSON.parse(b64Decode(encoded)) as PartnerSession;
    if (!payload?.partnerId || !payload?.tenantId) return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Lee la cookie partner y devuelve el session payload o null.
 * Wrapper que el endpoint usa en lugar de requireAdmin.
 */
export async function getPartnerSession(
  req: NextRequest,
): Promise<PartnerSession | null> {
  const cookie = req.cookies.get(PARTNER_COOKIE)?.value;
  if (!cookie) return null;
  return verifyPartnerToken(cookie);
}

/**
 * Helper para endpoints protegidos. Devuelve session o NextResponse 401.
 */
export async function requirePartner(
  req: NextRequest,
): Promise<PartnerSession | NextResponse> {
  const session = await getPartnerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized — partner session required" }, { status: 401 });
  }
  return session;
}

/**
 * Sets the partner cookie on a NextResponse.
 */
export function setPartnerCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(PARTNER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ACCESS_MS / 1000,
  });
  return res;
}

export function clearPartnerCookie(res: NextResponse): NextResponse {
  res.cookies.set(PARTNER_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}
