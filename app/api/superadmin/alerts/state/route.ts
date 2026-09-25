import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * POST /api/superadmin/alerts/state — reconocer/posponer/resolver una alerta (#1).
 *
 * Persiste el estado por `alertId` (el id estable que genera el motor de reglas).
 * Las alertas resueltas o pospuestas (con snooze vigente) se filtran del feed
 * activo en GET /api/superadmin/alerts. El snooze vencido vuelve a activar la
 * alerta sola. Plataforma (no tenant-scoped).
 */

const BodySchema = z.object({
  alertId: z.string().min(1).max(200),
  action: z.enum(["snooze", "resolve", "reopen"]),
  snoozeHours: z.number().int().min(1).max(720).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if ("status" in auth) return auth;

  let raw: unknown;
  try { raw = await req.json(); } catch { raw = {}; }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { alertId, action, snoozeHours } = parsed.data;
  const status = action === "snooze" ? "snoozed" : action === "resolve" ? "resolved" : "open";
  const snoozedUntil =
    action === "snooze" ? new Date(Date.now() + (snoozeHours ?? 24) * 3_600_000) : null;

  try {
    await prisma.alertState.upsert({
      where: { alertId },
      create: { alertId, status, snoozedUntil, updatedBy: auth.username },
      update: { status, snoozedUntil, updatedBy: auth.username },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[superadmin/alerts/state] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
