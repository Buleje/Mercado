import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/coupons/active?tenant={tenantSlug}
 *
 * Endpoint público — sin autenticación.
 * Devuelve el cupón activo más reciente para un tenant, o `data: null` si no hay.
 * Usado por StickyCouponBanner en las páginas de tienda individual.
 *
 * Reglas de selección:
 *   - active = true
 *   - expiresAt > now  (o null = sin vencimiento)
 *   - maxUses = null  OR  usedCount < maxUses
 * Ordenado por createdAt desc — el más reciente prevalece.
 */
export async function GET(req: NextRequest) {
  try {
    const tenantSlug = req.nextUrl.searchParams.get("tenant");
    if (!tenantSlug) {
      return NextResponse.json({ data: null }, { status: 200 });
    }

    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ id: tenantSlug }, { slug: tenantSlug }] },
      select: { id: true },
    });

    if (!tenant) {
      return NextResponse.json({ data: null }, { status: 200 });
    }

    const now = new Date();

    const coupon = await prisma.coupon.findFirst({
      where: {
        tenantId: tenant.id,
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: "desc" },
      select: {
        code: true,
        description: true,
        discountType: true,
        discountValue: true,
        minPurchase: true,
        maxUses: true,
        usedCount: true,
      },
    });

    if (!coupon) {
      return NextResponse.json({ data: null });
    }

    // Excluir si agotado
    if (
      coupon.maxUses !== null &&
      coupon.usedCount >= coupon.maxUses
    ) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({
      data: {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType as "percent" | "fixed",
        discountValue: Number(coupon.discountValue),
        minPurchase: coupon.minPurchase ? Number(coupon.minPurchase) : null,
      },
    });
  } catch {
    // Fail silently — el banner simplemente no aparece
    return NextResponse.json({ data: null });
  }
}
