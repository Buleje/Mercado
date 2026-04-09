import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

/**
 * GET /api/campaigns/audience-count?segment=todos
 * Returns estimated recipient count for a campaign segment.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const segment = req.nextUrl.searchParams.get("segment") ?? "todos";
  const tenantId = auth.tenantId;

  try {
    const thirty = new Date();
    thirty.setDate(thirty.getDate() - 30);
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    let count = 0;

    if (segment === "todos") {
      count = await prisma.customer.count({ where: { tenantId } });
    } else if (segment === "vip") {
      count = await prisma.customer.count({
        where: { tenantId, loyaltyTier: { in: ["oro", "diamante"] } },
      });
    } else if (segment === "inactivos") {
      count = await prisma.customer.count({
        where: { tenantId, sales: { none: { createdAt: { gte: thirty } } } },
      });
    } else if (segment === "cumpleanos") {
      count = await prisma.customer.count({
        where: { tenantId, birthday: { gte: firstOfMonth, lte: lastOfMonth } },
      });
    } else if (segment === "deudores") {
      count = await prisma.customer.count({
        where: { tenantId, creditBalance: { lt: 0 } },
      });
    }

    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
