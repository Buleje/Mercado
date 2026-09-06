import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { TrustedDevicesDB } from "@/lib/db/trusted-devices.db";
import { logger } from "@/lib/logger";

/**
 * /api/admin/security/trusted-devices (ADR-304)
 *
 * GET  → lista los dispositivos de confianza vigentes de la propia cuenta.
 * POST → revoca uno ({ id }) o todos ({ all: true }).
 *
 * Solo la propia cuenta (requireAdmin: tenantId + username del token). Nunca
 * expone el secreto — solo id/label/fechas.
 */

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "trusted-devices-list");
  if (rl) return rl;

  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const devices = await TrustedDevicesDB.list(auth.tenantId, auth.username, new Date());
    // No exponer el secretHash.
    const safe = devices.map(({ id, label, createdAt, expiresAt, lastUsedAt }) => ({
      id,
      label,
      createdAt,
      expiresAt,
      lastUsedAt,
    }));
    return NextResponse.json({ devices: safe });
  } catch (err) {
    logger.error("[trusted-devices] list error", { error: String(err) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

const RevokeSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  all: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "AUTH", "trusted-devices-revoke");
  if (rl) return rl;

  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const parsed = RevokeSchema.safeParse(body);
  if (!parsed.success || (!parsed.data.id && !parsed.data.all)) {
    return NextResponse.json({ error: "id o all requerido" }, { status: 400 });
  }

  try {
    if (parsed.data.all) {
      await TrustedDevicesDB.revokeAll(auth.tenantId, auth.username);
    } else if (parsed.data.id) {
      await TrustedDevicesDB.revoke(auth.tenantId, auth.username, parsed.data.id, new Date());
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[trusted-devices] revoke error", { error: String(err) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
