import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/cleanup-demos
 *
 * Eliminates expired demo tenants (slug starts with "demo-" and trialEndsAt < now).
 * Cascade delete via Prisma removes AdminUser, Settings, Products, Orders, etc.
 *
 * Authorization: Bearer <CRON_SECRET>
 * Schedule: cada 6 horas  →  "0 *\/6 * * *"
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // Buscar tenants demo expirados
    const expired = await prisma.tenant.findMany({
      where: {
        slug: { startsWith: "demo-" },
        trialEndsAt: { lt: now },
      },
      select: { id: true, slug: true, trialEndsAt: true },
    });

    if (expired.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0, message: "No hay demos expirados" });
    }

    // Borrar en cascada — Prisma propaga a AdminUser, Settings, Products, Orders, etc.
    await prisma.tenant.deleteMany({
      where: { id: { in: expired.map((t) => t.id) } },
    });

    logger.info("[cron/cleanup-demos] Demos eliminados", {
      count: expired.length,
      slugs: expired.map((t) => t.slug),
    });

    return NextResponse.json({
      ok: true,
      deleted: expired.length,
      slugs: expired.map((t) => t.slug),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/cleanup-demos] Error", { message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
