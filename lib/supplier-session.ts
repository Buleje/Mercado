/**
 * Sesión stateless para el portal de proveedores.
 * Usa HMAC-SHA256 (misma estrategia que lib/session.ts) — sin dependencias externas.
 * Compatible con Node.js runtime y Edge runtime.
 */

const COOKIE_NAME = "supplier-token";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET environment variable is required in production");
    }
    return "bsm-dev-fallback-2024-change-in-production";
  }
  return secret;
}

async function signHmac(secret: string, data: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const raw = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return new Uint8Array(raw);
}

async function verifyHmac(secret: string, data: string, sigB64: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  try {
    const rawSig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify("HMAC", key, rawSig, enc.encode(data));
  } catch {
    return false;
  }
}

function b64Encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function b64Decode(str: string): string {
  return decodeURIComponent(escape(atob(str)));
}

export interface SupplierSessionPayload {
  supplierId: string;
  supplierName: string;
  tenantId: string;
}

export async function createSupplierToken(payload: SupplierSessionPayload): Promise<string> {
  const data = JSON.stringify({
    ...payload,
    exp: Date.now() + SESSION_DURATION_MS,
  });
  const encoded = b64Encode(data);
  const rawSig = await signHmac(getSecret(), encoded);
  const sig = btoa(String.fromCharCode(...rawSig));
  return `${encoded}.${sig}`;
}

export async function getSupplierPayload(token: string): Promise<SupplierSessionPayload | null> {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const encoded = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    if (!(await verifyHmac(getSecret(), encoded, sig))) return null;
    const data = JSON.parse(b64Decode(encoded)) as SupplierSessionPayload & { exp: number };
    if (data.exp < Date.now()) return null;
    if (!data.supplierId || !data.tenantId) return null;
    return {
      supplierId: data.supplierId,
      supplierName: data.supplierName ?? "",
      tenantId: data.tenantId,
    };
  } catch {
    return null;
  }
}

export const SUPPLIER_SESSION = {
  COOKIE_NAME,
  MAX_AGE: Math.floor(SESSION_DURATION_MS / 1000),
} as const;
