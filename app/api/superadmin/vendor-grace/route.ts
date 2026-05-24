/**
 * DELETE /api/superadmin/vendor-grace?tenantId=...
 *
 * Superadmin override: limpia el grace activo de un tenant específico.
 * Útil cuando el operador detecta que el vendor abusa del grace (lo extiende
 * sin regularizar realmente) y quiere forzar re-alertas inmediatas.
 *
 * Auth: requirePlatformAPI (PLATFORM_SESSION cookie).
 * Rate-limit STRICT (acción administrativa).
 *
 * Audit ref: TD-058 capa 8 follow-up — control superadmin sobre self-service.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { VendorGraceDB } from "@/lib/db/vendor-grace.db";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";

export async function DELETE(req: NextRequest) {
  const rl = applyRateLimit(req, "STRICT", "superadmin-vendor-grace-clear");
  if (rl) return rl;
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId || tenantId.length < 3) {
    return NextResponse.json(
      { error: "tenantId requerido" },
      { status: 400 },
    );
  }

  const existing = VendorGraceDB.get(tenantId);
  if (!existing) {
    return NextResponse.json(
      { ok: true, cleared: false, message: "Ya no había grace activo" },
    );
  }

  VendorGraceDB.clear(tenantId);
  logger.warn("[superadmin/vendor-grace] cleared by superadmin override", {
    tenantId,
    vendorId: existing.vendorId,
    kind: existing.kind,
    originalAcknowledgedBy: existing.acknowledgedBy,
    by: auth.username,
  });

  return NextResponse.json({
    ok: true,
    cleared: true,
    previousGrace: {
      vendorId: existing.vendorId,
      kind: existing.kind,
      acknowledgedBy: existing.acknowledgedBy,
    },
  });
}
