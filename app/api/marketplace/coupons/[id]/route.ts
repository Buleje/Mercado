import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { CouponsDB } from "@/lib/db/coupons.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { z } from "zod";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

const PatchSchema = z.object({
  active: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/marketplace/coupons/[id]
 * Toggle active status of a coupon.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;
    const body = await req.json().catch((err) => { logger.error("[marketplace/coupons/[id]] parse JSON body failed", { error: String(err) }); return null; });
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }

    // CouponsDB.getById + setActive aplican tenantId en cada paso.
    const coupon = await CouponsDB.getById(auth.tenantId, id);
    if (!coupon) {
      return NextResponse.json({ error: "Cupón no encontrado" }, { status: 404 });
    }

    const newActive = parsed.data.active ?? !coupon.active;
    const updated = await CouponsDB.setActive(auth.tenantId, id, newActive);
    if (updated === null) {
      return NextResponse.json({ error: "Cupón no encontrado" }, { status: 404 });
    }

    logActivity(
      newActive ? "coupon_activated" : "coupon_deactivated",
      "Coupon",
      `Cupón ${coupon.code} ${newActive ? "activado" : "desactivado"}`,
      id,
      auth.username,
    ).catch((err) => logger.error("[marketplace/coupons/[id]] operation failed", { error: String(err), tenantId: auth.tenantId }));

    return NextResponse.json({ data: { id, active: newActive } });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

/**
 * DELETE /api/marketplace/coupons/[id]
 * Delete a coupon.
 */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await ctx.params;

    // CouponsDB.getById + delete scoped al tenant.
    const coupon = await CouponsDB.getById(auth.tenantId, id);
    if (!coupon) {
      return NextResponse.json({ error: "Cupón no encontrado" }, { status: 404 });
    }

    const deleted = await CouponsDB.delete(auth.tenantId, id);
    if (!deleted) {
      return NextResponse.json({ error: "Cupón no encontrado" }, { status: 404 });
    }

    logActivity(
      "coupon_deleted",
      "Coupon",
      `Cupón ${coupon.code} eliminado`,
      id,
      auth.username,
    ).catch((err) => logger.error("[marketplace/coupons/[id]] operation failed", { error: String(err), tenantId: auth.tenantId }));

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
