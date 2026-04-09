import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { ReviewsMarketplaceDB, type ReviewStatus } from "@/lib/db/reviews.db";
import { logger } from "@/lib/logger";
import { reportCriticalError } from "@/lib/sentry-alerts";

/**
 * PATCH /api/admin/reviews/[reviewId]
 * Moderación de reviews por parte del admin del tenant.
 *
 * Actions:
 *   { action: "moderate", status: "approved"|"rejected"|"hidden"|"pending" }
 *   { action: "reply", replyText: "gracias por tu compra..." }
 *   { action: "delete" }  ← soft-delete
 */

const StatusSchema = z.enum(["pending", "approved", "rejected", "hidden"]);

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("moderate"),
    status: StatusSchema,
  }),
  z.object({
    action: z.literal("reply"),
    replyText: z.string().min(1).max(2000),
  }),
  z.object({
    action: z.literal("delete"),
  }),
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const { reviewId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    switch (parsed.data.action) {
      case "moderate":
        await ReviewsMarketplaceDB.moderate(
          auth.tenantId,
          reviewId,
          parsed.data.status as ReviewStatus,
        );
        return NextResponse.json({ ok: true, status: parsed.data.status });

      case "reply":
        await ReviewsMarketplaceDB.reply(auth.tenantId, reviewId, parsed.data.replyText);
        return NextResponse.json({ ok: true });

      case "delete":
        await ReviewsMarketplaceDB.softDelete(auth.tenantId, reviewId);
        return NextResponse.json({ ok: true });
    }
  } catch (err) {
    logger.error("[admin/reviews] patch failed", { err: String(err), reviewId });
    reportCriticalError(err instanceof Error ? err : new Error(String(err)), {
      module: "api/admin/reviews",
      tenantId: auth.tenantId,
      extra: { verb: "PATCH", reviewId, action: parsed.data.action },
    });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
