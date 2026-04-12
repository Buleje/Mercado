import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { z } from "zod";
import { toNumOrZero } from "@/lib/decimal-utils";

const ValidateSchema = z.object({
  code: z.string().min(1).transform((v) => v.toUpperCase().trim()),
  storeSlug: z.string().min(1),
  cartTotal: z.number().positive(),
});

/**
 * POST /api/marketplace/coupons/validate
 * Público: valida un cupón para el marketplace checkout.
 */
export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const body = await req.json();
    const parsed = ValidateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }

    const { code, storeSlug, cartTotal } = parsed.data;

    // Find the store
    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true, tenantId: true },
    });
    if (!store) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    // Find the coupon: store-specific first, then tenant-wide (storeId=null)
    const coupon = await prisma.coupon.findFirst({
      where: {
        tenantId: store.tenantId,
        code,
        active: true,
        OR: [{ storeId: store.id }, { storeId: null }],
      },
      orderBy: { storeId: "desc" }, // prefer store-specific over tenant-wide
    });

    if (!coupon) {
      return NextResponse.json({ valid: false, reason: "Cupón no encontrado o inactivo" });
    }

    // Check expiration
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return NextResponse.json({ valid: false, reason: "Cupón expirado" });
    }

    // Check max uses
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
      return NextResponse.json({ valid: false, reason: "Cupón agotado" });
    }

    // TD-018: minPurchase y discountValue son Decimal
    const minPurchaseNum = toNumOrZero(coupon.minPurchase);
    const discountValueNum = toNumOrZero(coupon.discountValue);

    // Check minimum purchase
    if (minPurchaseNum > 0 && cartTotal < minPurchaseNum) {
      return NextResponse.json({
        valid: false,
        reason: `Compra mínima de S/${minPurchaseNum.toFixed(2)}`,
      });
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === "percent") {
      discount = Math.round((cartTotal * discountValueNum) / 100 * 100) / 100;
    } else {
      discount = Math.min(discountValueNum, cartTotal);
    }

    return NextResponse.json({
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: discountValueNum,
      discount,
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
