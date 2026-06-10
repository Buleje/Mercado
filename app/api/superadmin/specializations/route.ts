import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  setSpecialization,
  listSpecializations,
  isValidSpecializationKey,
  type SpecializationKey,
} from "@/lib/specializations";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * /api/superadmin/specializations
 *
 * Solo superadmin. Permite listar y togglear especializaciones por tenant.
 *
 * GET   ?tenantId=X    — lista catálogo + estado por tenant
 * PATCH                — { tenantId, specKey, enabled } toggle
 */

const patchSchema = z.object({
  tenantId: z.string().min(1).max(50),
  specKey: z.string().min(1).max(100),
  enabled: z.boolean(),
});

// ─── GET — catálogo + estado del tenant ──────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["superadmin"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "STRICT");
  if (rl) return rl;

  const tenantId = new URL(req.url).searchParams.get("tenantId");

  const catalog = listSpecializations();

  if (!tenantId) {
    return NextResponse.json({ catalog, tenant: null, flags: [] });
  }

  try {
    const [tenant, flags] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, slug: true, name: true, industry: true, plan: true },
      }),
      prisma.tenantFeatureFlag.findMany({
        where: {
          tenantId,
          flagKey: { startsWith: "spec:" },
        },
        select: { flagKey: true, enabled: true, createdAt: true },
      }),
    ]);

    if (!tenant) {
      return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
    }

    return NextResponse.json({ catalog, tenant, flags });
  } catch (err) {
    logger.error("[superadmin/specializations.GET] failed", { error: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── PATCH — toggle ──────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["superadmin"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "STRICT");
  if (rl) return rl;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { tenantId, specKey, enabled } = parsed.data;

  if (!isValidSpecializationKey(specKey)) {
    return NextResponse.json(
      {
        error: "invalid_specialization",
        message: `Specialization key '${specKey}' no está en el catálogo.`,
      },
      { status: 400 },
    );
  }

  try {
    // Verify tenant exists before toggling
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
    }

    await setSpecialization(
      tenantId,
      specKey as SpecializationKey,
      enabled,
      auth.username,
    );

    logger.info("[superadmin/specializations.PATCH] toggle", {
      actor: auth.username,
      tenantId,
      specKey,
      enabled,
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      specKey,
      enabled,
    });
  } catch (err) {
    logger.error("[superadmin/specializations.PATCH] failed", { error: String(err) });
    return NextResponse.json(
      { error: "internal_error", message: String(err) },
      { status: 500 },
    );
  }
}
