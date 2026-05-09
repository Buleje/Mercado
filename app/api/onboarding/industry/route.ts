import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { updateTenantIndustry } from "@/lib/db/tenant-onboarding.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { Industry } from "@/lib/generated/prisma/client";

export const dynamic = "force-dynamic";

const IndustrySchema = z.object({
  industry: z.nativeEnum(Industry),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "onboarding-industry");
  if (_rl) return _rl;

  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body invalido" }, { status: 400 });
  }

  const result = IndustrySchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "industry invalido", details: result.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  try {
    await updateTenantIndustry(auth.tenantId, result.data.industry);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[onboarding/industry] Error al actualizar industry", {
      err: e instanceof Error ? e.message : String(e),
      tenantId: auth.tenantId,
    });
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
