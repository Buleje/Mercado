/**
 * lib/auth/driver-session.ts
 *
 * HMAC-SHA256 signed tokens that gate driver-facing delivery endpoints:
 *   GET/PATCH /api/delivery/driver/[partnerId]
 *   GET       /api/delivery/driver/[partnerId]/earnings
 *   POST      /api/delivery/tracking/update
 *
 * Issuance flow:
 *   1. Admin creates a DeliveryPartner and generates a token via
 *      `signDriverToken(tenantId, partnerId)` — delivered by WhatsApp deeplink
 *      or QR code on the driver app.
 *   2. Driver app presents the token as `Authorization: Bearer <token>` on every
 *      request, or as `?driverToken=<token>` for link-based access.
 *   3. Server verifies with `verifyDriverToken(tenantId, partnerId, token)`.
 *
 * Scope: "driver:<tenantId>:<partnerId>" — tokens are scoped per driver AND
 * tenant, so a token issued for Driver A cannot be used for Driver B, and a
 * token issued by Tenant A cannot be replayed against Tenant B.
 *
 * Fails closed: missing or short AUTH_SECRET → every verify returns false.
 *
 * TODO(P1): Replace with a short-lived signed JWT with expiry and revocation
 * (e.g., 8h TTL, stored in DeliveryPartner.tokenHash) once driver app ships
 * proper token refresh. This static token is a safe interim guard.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const DOMAIN_PREFIX = "driver";
const MIN_SECRET_LENGTH = 16;

// SECURITY 2026-05-06 (audit delivery #1): TTL por defecto de 8h para nuevos
// tokens. Antes los tokens eran HMAC estáticos sin expiración → si se filtraba
// uno (logs/QR/WhatsApp/screenshot) el atacante tenía acceso permanente.
// Aceptamos también tokens legacy (sin timestamp) durante un período de
// migración para no romper drivers ya emitidos.
const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

function getSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) {
    return null;
  }
  return secret;
}

/** Digest legacy — solo tenantId + partnerId (sin TTL). */
function computeDigest(
  secret: string,
  tenantId: string,
  partnerId: string,
): string {
  return createHmac("sha256", secret)
    .update(`${DOMAIN_PREFIX}:${tenantId}:${partnerId}`)
    .digest("hex");
}

/** Digest nuevo — incluye expiresAtMs en el HMAC para TTL. */
function computeTtlDigest(
  secret: string,
  tenantId: string,
  partnerId: string,
  expiresAtMs: number,
): string {
  return createHmac("sha256", secret)
    .update(`${DOMAIN_PREFIX}:${tenantId}:${partnerId}:${expiresAtMs}`)
    .digest("hex");
}

/**
 * Produce a signed token for the given tenant + partnerId con TTL embedido.
 * Formato: `<expiresAtMs>.<digest>` (e.g. "1234567890.abc123...").
 *
 * Throws si AUTH_SECRET no está configurado.
 */
export function signDriverToken(
  tenantId: string,
  partnerId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const secret = getSecret();
  if (!secret) {
    throw new Error("AUTH_SECRET is required to sign driver tokens");
  }
  const expiresAtMs = Date.now() + ttlMs;
  const digest = computeTtlDigest(secret, tenantId, partnerId, expiresAtMs);
  return `${expiresAtMs}.${digest}`;
}

/**
 * Constant-time verification de un token. Acepta ambos formatos:
 *   - nuevo: `<expiresAtMs>.<digest>` con verificación de TTL
 *   - legacy: `<digest>` sin TTL (transición — deprecar en próximas releases)
 *
 * Devuelve false on any failure mode — never throws.
 */
export function verifyDriverToken(
  tenantId: string,
  partnerId: string,
  token: unknown,
): boolean {
  if (typeof token !== "string" || token.length === 0) return false;
  const secret = getSecret();
  if (!secret) return false;

  try {
    // Detectar formato nuevo: "expiresAtMs.digest"
    const dotIdx = token.indexOf(".");
    if (dotIdx > 0) {
      const expPart = token.slice(0, dotIdx);
      const digestPart = token.slice(dotIdx + 1);
      const expiresAtMs = Number(expPart);
      if (Number.isFinite(expiresAtMs) && /^[a-f0-9]+$/.test(digestPart)) {
        if (expiresAtMs <= Date.now()) {
          logger.warn("[DRIVER_AUTH] Token expirado", { partnerId, expiresAtMs });
          return false;
        }
        const expected = computeTtlDigest(secret, tenantId, partnerId, expiresAtMs);
        const a = Buffer.from(expected, "utf8");
        const b = Buffer.from(digestPart, "utf8");
        if (a.length !== b.length) return false;
        return timingSafeEqual(a, b);
      }
    }
    // Formato legacy (sin TTL) — aceptar pero loggear como deprecated.
    const expected = computeDigest(secret, tenantId, partnerId);
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(token, "utf8");
    if (a.length !== b.length) return false;
    const ok = timingSafeEqual(a, b);
    if (ok) {
      logger.info("[DRIVER_AUTH] legacy token (sin TTL) — rotar", { partnerId });
    }
    return ok;
  } catch {
    return false;
  }
}

/**
 * Extract the driver token from a request.
 * Checks, in order:
 *   1. Authorization: Bearer <token>
 *   2. ?driverToken=<token>  (link-based access for QR / WhatsApp deeplinks)
 */
export function extractDriverToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const tok = authHeader.slice(7).trim();
    if (tok.length > 0) return tok;
  }
  const qp = req.nextUrl.searchParams.get("driverToken");
  if (qp && qp.length > 0) return qp;
  return null;
}

export interface DriverTokenPayload {
  tenantId: string;
  partnerId: string;
}

/**
 * Guard for driver-facing routes.
 *
 * Resolves tenantId from the verified DeliveryPartner record (DB source of truth).
 * Returns DriverTokenPayload on success, NextResponse (401/403) on failure.
 *
 * Usage:
 *   const guard = await requireDriver(req, partnerId, prisma);
 *   if (guard instanceof NextResponse) return guard;
 *   // guard.tenantId is safe to use in DB queries
 */
export async function requireDriver(
  req: NextRequest,
  partnerId: string,
  prismaClient: {
    deliveryPartner: {
      findUnique: (args: {
        where: { id: string };
        select: { id: true; tenantId: true; isActive: true };
      }) => Promise<{ id: string; tenantId: string; isActive: boolean } | null>;
    };
  },
): Promise<DriverTokenPayload | NextResponse> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const path = req.nextUrl.pathname;
  const method = req.method;

  const token = extractDriverToken(req);
  if (!token) {
    logger.warn("[DRIVER_AUTH] No token presented", { method, path, ip, partnerId });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Fetch partner to get the canonical tenantId (DB source of truth, not URL param)
  const partner = await prismaClient.deliveryPartner.findUnique({
    where: { id: partnerId },
    select: { id: true, tenantId: true, isActive: true },
  });

  if (!partner) {
    // Return 401 not 404 — avoids existence oracle for attacker iterating UUIDs
    logger.warn("[DRIVER_AUTH] Partner not found", { method, path, ip, partnerId });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!partner.isActive) {
    logger.warn("[DRIVER_AUTH] Partner inactive", { method, path, ip, partnerId });
    return NextResponse.json({ error: "forbidden", message: "Repartidor inactivo" }, { status: 403 });
  }

  if (!verifyDriverToken(partner.tenantId, partnerId, token)) {
    logger.warn("[DRIVER_AUTH] Invalid token", { method, path, ip, partnerId });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  logger.debug("[DRIVER_AUTH] OK", { partnerId, tenantId: partner.tenantId, method, path });
  return { tenantId: partner.tenantId, partnerId: partner.id };
}
