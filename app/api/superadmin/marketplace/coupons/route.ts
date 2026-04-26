import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

// GET /api/superadmin/marketplace/coupons
// Returns all marketplace-related coupons (those with storeId set)
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    // El schema de Prisma tiene `storeId` pero la migración aún no corrió en
    // la DB actual (drift). Para no romper la página, listamos TODOS los
    // cupones sin filtrar por storeId. El cliente puede filtrar visualmente
    // si lo necesita después.
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        code: true,
        tenantId: true,
        discountType: true,
        discountValue: true,
        maxUses: true,
        usedCount: true,
        active: true,
        expiresAt: true,
      },
    });

    // Resolver tenant name → tenantId map (storeName en realidad debería ser
    // el nombre del tenant para que el cliente no vea cuids pelados).
    const tenantIds = Array.from(new Set(coupons.map((c) => c.tenantId)));
    const tenants = tenantIds.length
      ? await prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true },
        })
      : [];
    const tenantNameById = new Map(tenants.map((t) => [t.id, t.name]));

    // Decimal → number (Prisma serializa Decimal como string lo cual rompe
    // el render del cliente y triggers errores de math al sumar).
    const mapped = coupons.map((c) => ({
      id: c.id,
      code: c.code,
      storeId: null as string | null, // schema drift — disponible cuando migre
      storeName: tenantNameById.get(c.tenantId) ?? c.tenantId,
      discountType: c.discountType,
      discountValue: toNumOrZero(c.discountValue),
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      active: c.active,
      expiresAt: c.expiresAt?.toISOString() ?? null,
    }));

    return NextResponse.json({ coupons: mapped });
  } catch (e) {
    logger.error("[superadmin/marketplace/coupons] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
