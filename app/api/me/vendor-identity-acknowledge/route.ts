/**
 * POST /api/me/vendor-identity-acknowledge
 *
 * El admin del tenant reconoce una alerta de identidad vendor (RUC NO HABIDO,
 * RUC not-found, DNI not-found) y elige un plazo (3/7/14 días) para
 * regularizar. Durante ese período el cron no creará nuevas notifications
 * ni enviará WA/email recurrentes — el operador trabaja sin spam.
 *
 * DELETE /api/me/vendor-identity-acknowledge — limpia el grace (admin marca
 * "ya regularicé" antes de que expire).
 *
 * Auth: requireAdmin con roles ["admin", "owner", "manager"] — los demás
 * roles del tenant no pueden silenciar alertas críticas.
 *
 * Audit ref: TD-058 capa 8 (vendor self-service).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { VendorGraceDB, VALID_GRACE_DAYS, type AlertKind } from "@/lib/db/vendor-grace.db";

const AcknowledgeSchema = z.object({
  vendorId: z.string().min(3).max(80),
  kind: z.enum(["ruc-changed", "ruc-not-found", "dni-not-found"]),
  graceDays: z
    .number()
    .int()
    .refine(
      (n) => (VALID_GRACE_DAYS as readonly number[]).includes(n),
      `Plazo debe ser uno de: ${VALID_GRACE_DAYS.join(", ")} días`,
    ),
  reason: z.string().max(280).optional(),
});

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "vendor-grace-ack");
  if (rl) return rl;

  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = AcknowledgeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const record = await VendorGraceDB.set(auth.tenantId, {
      vendorId: parsed.data.vendorId,
      kind: parsed.data.kind as AlertKind,
      graceDays: parsed.data.graceDays,
      ...(parsed.data.reason != null && { reason: parsed.data.reason }),
      acknowledgedBy: auth.username,
    });
    logger.info("[vendor-grace] acknowledged", {
      tenantId: auth.tenantId,
      vendorId: record.vendorId,
      kind: record.kind,
      graceDays: record.graceDays,
      by: auth.username,
    });
    return NextResponse.json({ ok: true, grace: record });
  } catch (err) {
    logger.error("[vendor-grace] acknowledge failed", {
      tenantId: auth.tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "vendor-grace-clear");
  if (rl) return rl;

  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  VendorGraceDB.clear(auth.tenantId);
  logger.info("[vendor-grace] cleared by user", {
    tenantId: auth.tenantId,
    by: auth.username,
  });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const grace = VendorGraceDB.get(auth.tenantId);
  return NextResponse.json({ grace: grace ?? null });
}
