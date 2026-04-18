/**
 * order-tracking.db.ts — Tracking post-compra (estilo Amazon "Track your order").
 *
 * MOCK-HEAVY — esta capa devuelve fixtures derivados de `lib/mocks/order-tracking.mock.ts`.
 * NO toca `orders.db.ts` (zona de peligro). Cuando ADR-XXX defina Driver/DeliveryRun,
 * reemplazar los `// MOCK:` inline por queries reales con Prisma + cache + tenantId.
 *
 * Regla CLAUDE.md #3: `tenantId` es 1er param en TODAS las funciones.
 * Regla #11: Raw SQL solo parametrizado ($1 $2 $3) — aquí no hay SQL, solo mocks.
 *
 * Share token:
 *   - Estructura: base64url(payload).base64url(hmac)
 *   - Payload: { orderId, tenantId, exp }
 *   - HMAC: SHA-256(payload, AUTH_SECRET) — mismo patrón que lib/session.ts
 *   - TTL default: 72h
 */
import "server-only";
import {
  makeMockTracking,
  type TrackingSnapshot,
  type TrackingStatus,
  type TrackingDriver,
} from "@/lib/mocks/order-tracking.mock";

const DEFAULT_TTL_MS = 72 * 60 * 60 * 1000; // 72h

// ── HMAC helpers (edge + node compatible, via WebCrypto) ────────────────────
function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET environment variable is required in production");
    }
    return "buleje-dev-fallback-2024-change-in-production";
  }
  return secret;
}

function b64urlEncodeBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecodeBytes(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncodeString(s: string): string {
  return b64urlEncodeBytes(new TextEncoder().encode(s));
}

function b64urlDecodeString(s: string): string {
  return new TextDecoder().decode(b64urlDecodeBytes(s));
}

async function hmacSign(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function hmacVerify(data: string, sig: Uint8Array): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  try {
    // Copy into a fresh ArrayBuffer so the type is ArrayBuffer (not ArrayBufferLike).
    const sigBuf = new ArrayBuffer(sig.byteLength);
    new Uint8Array(sigBuf).set(sig);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBuf,
      new TextEncoder().encode(data),
    );
  } catch {
    return false;
  }
}

// ── Token payload ───────────────────────────────────────────────────────────
interface TrackingTokenPayload {
  orderId: string;
  tenantId: string;
  exp: number; // epoch ms
}

export interface ShareTokenResult {
  token: string;
  url: string;
  expiresAt: string; // ISO
}

export interface VerifiedTrackingToken {
  orderId: string;
  tenantId: string;
}

// ── Public DB class ─────────────────────────────────────────────────────────
export const OrderTrackingDB = {
  /**
   * Obtiene el snapshot completo de tracking del pedido.
   * MOCK: hoy devuelve fixture. TODO(ADR-XXX): leer de `orders.db.ts` +
   * `DeliveryRun` + `Driver` reales.
   */
  async getSnapshot(
    tenantId: string,
    orderId: string,
  ): Promise<TrackingSnapshot | null> {
    // MOCK: reemplazar con real ops tras ADR-XXX
    if (!tenantId || !orderId) return null;
    return makeMockTracking(orderId, "shipping", 0.62);
  },

  /**
   * Devuelve solo estado + timeline — más liviano para polling.
   * MOCK: por ahora delega en snapshot completo.
   */
  async getStatus(
    tenantId: string,
    orderId: string,
  ): Promise<Pick<TrackingSnapshot, "orderId" | "status" | "etaAt" | "timeline" | "driverLocation"> | null> {
    const snap = await this.getSnapshot(tenantId, orderId);
    if (!snap) return null;
    const { orderId: oid, status, etaAt, timeline, driverLocation } = snap;
    return { orderId: oid, status, etaAt, timeline, driverLocation };
  },

  /**
   * Devuelve info del repartidor asignado.
   * MOCK: estático. TODO: join con `Driver` y `DeliveryRun`.
   */
  async getDriver(
    tenantId: string,
    orderId: string,
  ): Promise<TrackingDriver | null> {
    const snap = await this.getSnapshot(tenantId, orderId);
    return snap?.driver ?? null;
  },

  /**
   * Genera un token público HMAC-firmado para compartir el tracking del pedido.
   * No persistimos nada — el token es self-contained (stateless).
   */
  async generateShareToken(
    tenantId: string,
    orderId: string,
    ttlMs: number = DEFAULT_TTL_MS,
    baseUrl?: string,
  ): Promise<ShareTokenResult> {
    const payload: TrackingTokenPayload = {
      orderId,
      tenantId,
      exp: Date.now() + ttlMs,
    };
    const encoded = b64urlEncodeString(JSON.stringify(payload));
    const sig = await hmacSign(encoded);
    const token = `${encoded}.${b64urlEncodeBytes(sig)}`;

    const origin = baseUrl ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://www.buleje.pe";
    const url = `${origin}/t/${encodeURIComponent(tenantId)}/seguimiento/${encodeURIComponent(token)}`;

    return {
      token,
      url,
      expiresAt: new Date(payload.exp).toISOString(),
    };
  },

  /**
   * Verifica token público. Retorna null si inválido o expirado.
   */
  async verifyShareToken(token: string): Promise<VerifiedTrackingToken | null> {
    try {
      const dotIdx = token.lastIndexOf(".");
      if (dotIdx < 16) return null;
      const encoded = token.slice(0, dotIdx);
      const sigB64 = token.slice(dotIdx + 1);
      const sigBytes = b64urlDecodeBytes(sigB64);
      if (!(await hmacVerify(encoded, sigBytes))) return null;
      const raw = b64urlDecodeString(encoded);
      const payload = JSON.parse(raw) as TrackingTokenPayload;
      if (typeof payload.exp !== "number") return null;
      if (payload.exp < Date.now()) return null;
      if (typeof payload.orderId !== "string" || typeof payload.tenantId !== "string") {
        return null;
      }
      return { orderId: payload.orderId, tenantId: payload.tenantId };
    } catch {
      return null;
    }
  },

  /**
   * Simula avance del pedido — útil para dev/preview.
   * MOCK: usado por la UI de tracking cuando polling (client) pide actualizaciones.
   */
  async advanceStatus(
    tenantId: string,
    orderId: string,
    nextStatus: TrackingStatus,
  ): Promise<TrackingSnapshot | null> {
    // MOCK: reemplazar con real ops tras ADR-XXX
    const progressMap: Record<TrackingStatus, number> = {
      confirmed: 0,
      preparing: 0.1,
      shipping: 0.55,
      nearby: 0.9,
      delivered: 1,
      canceled: 0,
    };
    if (!tenantId || !orderId) return null;
    return makeMockTracking(orderId, nextStatus, progressMap[nextStatus]);
  },
};

export type { TrackingSnapshot, TrackingStatus, TrackingDriver };
