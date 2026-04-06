import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/trial-expiry
 *
 * Called nightly by Vercel Cron (see vercel.json).
 * Finds free-plan tenants whose trial has expired and suspends them.
 *
 * Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("trial-expiry", async () => {
      const now = new Date();

      const expired = await prisma.tenant.findMany({
        where: {
          active: true,
          plan: "free",
          stripeSubscriptionId: null,
          trialEndsAt: { lt: now },
        },
        select: { id: true, slug: true, trialEndsAt: true },
      });

      if (expired.length === 0) {
        return { ok: true, suspended: 0, message: "No expired trials found" };
      }

      await prisma.tenant.updateMany({
        where: { id: { in: expired.map((t) => t.id) } },
        data: { active: false },
      });

      logger.info("[cron/trial-expiry] Tenants suspended", {
        count: expired.length,
        slugs: expired.map((t) => t.slug),
      });

      return {
        ok: true,
        suspended: expired.length,
        slugs: expired.map((t) => t.slug),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
