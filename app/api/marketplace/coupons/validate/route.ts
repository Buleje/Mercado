export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { z } from "zod";

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

    // Find the coupon (must belong to this store's tenant and storeId)
    const coupon = await prisma.coupon.findFirst({
      where: {
        tenantId: store.tenantId,
        code,
        storeId: store.id,
        active: true,
      },
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

    // Check minimum purchase
    if (coupon.minPurchase && cartTotal < coupon.minPurchase) {
      return NextResponse.json({
        valid: false,
        reason: `Compra mínima de S/${coupon.minPurchase.toFixed(2)}`,
      });
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === "percent") {
      discount = Math.round((cartTotal * coupon.discountValue) / 100 * 100) / 100;
    } else {
      discount = Math.min(coupon.discountValue, cartTotal);
    }

    return NextResponse.json({
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discount,
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
