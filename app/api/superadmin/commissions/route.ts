import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// GET /api/superadmin/commissions?limit=20
// Returns recent CommissionLedger entries for the platform analytics view
export async function GET(req: NextRequest) {
  try {
    const rateLimited = applyRateLimit(req, "GENEROUS", "sa-commissions");
    if (rateLimited) return rateLimited;

    const session = await requirePlatform(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20")));

    const rows = await prisma.commissionLedger.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        orderId: true,
        storeId: true,
        partnerId: true,
        type: true,
        amount: true,
        rate: true,
        status: true,
        settledAt: true,
        createdAt: true,
      },
    });

    // Prisma Decimal serializa como string en JSON. Si dejamos los strings,
    // el cliente hace `total + "0.59"` y termina en NaN. Convertimos acá.
    const commissions = rows.map((r) => ({
      ...r,
      amount: toNumOrZero(r.amount),
      rate: toNumOrZero(r.rate),
      settledAt: r.settledAt ? r.settledAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ commissions });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
