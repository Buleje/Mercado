import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { prisma } from "@/lib/prisma";
import { updateCreditProfile } from "@/lib/credit/scoring-engine";
import { applyRateLimit } from "@/lib/rate-limit";

// ── Schemas ───────────────────────────────────────────────────────────────────

const PutSchema = z.object({
  isActive: z.boolean(),
  creditLimitOverride: z.number().min(0).optional(),
});

// ── GET /api/credit/profile/[customerId] ─────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
) {
  try {
    const auth = await requireAdmin(req, ["admin", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const { customerId } = await params;

    logger.info("[credit/profile] GET", { customerId, tenantId: auth.tenantId });

    // Recalcular score fresco si el perfil no existe o tiene más de 24h
    const existing = await prisma.creditProfile.findUnique({
      where: { tenantId_customerId: { tenantId: auth.tenantId, customerId } },
    });

    const needsUpdate =
      !existing ||
      Date.now() - existing.lastScoreUpdate.getTime() > 24 * 60 * 60 * 1000;

    if (needsUpdate) {
      await updateCreditProfile(auth.tenantId, customerId);
    }

    const profile = await prisma.creditProfile.findUnique({
      where: { tenantId_customerId: { tenantId: auth.tenantId, customerId } },
      include: {
        installments: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!profile) {
      return NextResponse.json({ error: "Perfil crediticio no encontrado" }, { status: 404 });
    }

    return NextResponse.json(profile);

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── PUT /api/credit/profile/[customerId] ─────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
) {
  try {
    const _rl = await applyRateLimit(req, "MODERATE", "credit-profile-X"); if (_rl) return _rl;
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const { customerId } = await params;

    logger.info("[credit/profile] PUT", { customerId, tenantId: auth.tenantId, user: auth.username });

    const body = await req.json().catch(() => ({}));
    const parsed = PutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { isActive, creditLimitOverride } = parsed.data;

    const profile = await prisma.creditProfile.findUnique({
      where: { tenantId_customerId: { tenantId: auth.tenantId, customerId } },
    });

    if (!profile) {
      return NextResponse.json({ error: "Perfil crediticio no encontrado" }, { status: 404 });
    }

    const updateData: {
      isActive: boolean;
      creditLimit?: number;
      availableCredit?: number;
    } = { isActive };

    if (creditLimitOverride !== undefined) {
      // TD-018: profile.usedCredit es Decimal
      const newAvailable = Math.max(0, creditLimitOverride - toNumOrZero(profile.usedCredit));
      updateData.creditLimit = creditLimitOverride;
      updateData.availableCredit = newAvailable;
    }

    const updated = await prisma.creditProfile.update({
      where: { id: profile.id },
      data: updateData,
    });

    logActivity(
      isActive ? "credit_activated" : "credit_deactivated",
      "CreditProfile",
      `Crédito ${isActive ? "activado" : "desactivado"} para cliente ${customerId}${creditLimitOverride !== undefined ? ` — límite manual: S/${creditLimitOverride}` : ""}`,
      profile.id,
      auth.username,
    ).catch(() => {
        /* fire-and-forget per CLAUDE.md rule #7 */
      });

    return NextResponse.json(updated);

  } catch (e) {
    logger.error("[put] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
