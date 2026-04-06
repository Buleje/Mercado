export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// GET — Paginated history of daily summaries
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 30)));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.dailySummary.findMany({
        where: { tenantId: auth.tenantId },
        orderBy: { fecha: "desc" },
        skip,
        take: limit,
      }),
      prisma.dailySummary.count({
        where: { tenantId: auth.tenantId },
      }),
    ]);

    return NextResponse.json({ items, total, page, limit });
  } catch (e) {
    logger.error("[cierre-diario/history] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al obtener historial" }, { status: 503 });
  }
}
