import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { SettingsDB } from "@/lib/jsondb";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "onboarding-complete"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as {
      preferences?: {
        notifications?: boolean;
        pwa?: boolean;
        whatsappResumen?: boolean;
        whatsappNumber?: string;
      };
    };

    // 1. Mark onboarding as completed for this admin user
    await prisma.adminUser.updateMany({
      where: {
        username: auth.username,
        tenantId: auth.tenantId,
      },
      data: {
        onboardingCompletedAt: new Date(),
      },
    });

    // 2. If whatsapp resumen requested, save to settings
    if (body.preferences?.whatsappResumen && body.preferences?.whatsappNumber) {
      try {
        const current = await SettingsDB.get(auth.tenantId);
        await SettingsDB.set({
          ...current,
          businessPhone: body.preferences.whatsappNumber,
        }, auth.tenantId);
      } catch {
        // Settings save is best-effort
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[onboarding/complete] Error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
