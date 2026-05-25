/**
 * GET /api/superadmin/vendor-applications/[id]
 *
 * Detalle de una aplicacion con su historial de reviews.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getPlatformSession,
  PLATFORM_SESSION,
} from "@/lib/superadmin-session";
import { VendorApplicationsDB } from "@/lib/db/vendor-applications.db";
import { toSuperadminView } from "@/lib/vendor/registration-mapper";
import { logger } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const platformToken = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
    if (!platformToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const session = await getPlatformSession(platformToken);
    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { id } = await params;
    const row = await VendorApplicationsDB.getById(id);
    if (!row) {
      return NextResponse.json(
        { error: "Aplicación no encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      application: toSuperadminView(row),
      reviews: row.reviews.map((r: (typeof row.reviews)[number]) => ({
        id: r.id,
        action: r.action,
        note: r.note,
        previousStatus: r.previousStatus,
        newStatus: r.newStatus,
        reviewerUserId: r.reviewerUserId,
        createdAt: r.createdAt.toISOString(),
      })),
      raw: {
        tenantId: row.tenantId,
        tenantSlug: row.tenantSlug,
        status: row.status,
        plan: row.plan,
        schedule: row.schedule,
        deliveryZones: row.deliveryZones,
        deliveryFeeSoles: row.deliveryFeeSoles.toString(),
      },
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
