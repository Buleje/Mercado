import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET/PUT /api/marketplace/loyalty/rules
 *
 * SECURITY 2026-05-06 (audit team H022 fix): persistir reglas de loyalty +
 * rewards en DB (Settings.loyaltyRulesJson / loyaltyRewardsJson).
 * Antes vivían en localStorage del admin → se perdían al limpiar caché +
 * no se sincronizaban entre dispositivos/admins/multi-tab.
 */

const RulesSchema = z.object({
  rules: z.unknown().optional(),
  rewards: z.unknown().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const settings = await prisma.settings.findUnique({
      where: { tenantId: auth.tenantId },
      select: { loyaltyRulesJson: true, loyaltyRewardsJson: true },
    });

    return NextResponse.json({
      rules: settings?.loyaltyRulesJson ? safeParse(settings.loyaltyRulesJson) : null,
      rewards: settings?.loyaltyRewardsJson ? safeParse(settings.loyaltyRewardsJson) : null,
    });
  } catch (err) {
    logger.error("[loyalty/rules] GET failed", {
      error: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = await req.json();
    const parsed = RulesSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }

    const { rules, rewards } = parsed.data;
    const data: Record<string, string> = {};
    if (rules !== undefined)   data.loyaltyRulesJson   = JSON.stringify(rules);
    if (rewards !== undefined) data.loyaltyRewardsJson = JSON.stringify(rewards);

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true });
    }

    // upsert para tenants sin Settings row
    await prisma.settings.upsert({
      where: { tenantId: auth.tenantId },
      update: data,
      create: { tenantId: auth.tenantId, ...data },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[loyalty/rules] PUT failed", {
      error: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

function safeParse(json: string): unknown {
  try { return JSON.parse(json); } catch { return null; }
}
