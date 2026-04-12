import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";

// GET /api/superadmin/marketplace/coupons
// Returns all marketplace-related coupons (those with storeId set)
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const coupons = await prisma.coupon.findMany({
    where: { storeId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      code: true,
      tenantId: true,
      storeId: true,
      discountType: true,
      discountValue: true,
      maxUses: true,
      usedCount: true,
      active: true,
      expiresAt: true,
    },
  });

  const mapped = coupons.map((c) => ({
    id: c.id,
    code: c.code,
    storeId: c.storeId,
    storeName: c.tenantId,
    discountType: c.discountType,
    discountValue: c.discountValue,
    maxUses: c.maxUses,
    usedCount: c.usedCount,
    active: c.active,
    expiresAt: c.expiresAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ coupons: mapped });
}
