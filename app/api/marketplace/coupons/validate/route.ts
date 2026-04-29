import { NextRequest, NextResponse } from "next/server";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { toNumOrZero } from "@/lib/decimal-utils";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { CouponsDB } from "@/lib/db/coupons.db";

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
  // Rate limit: anti-enum attack para descubrir codigos validos (20 / 15min / IP)
  const rl = applyRateLimit(req, "MODERATE", "marketplace-coupons-validate");
  if (rl) return rl;

  const traceId = newTraceId();
  try {
    const body = await req.json();
    const parsed = ValidateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }

    const { code, storeSlug, cartTotal } = parsed.data;

    // Resolver tienda — MarketplaceStoresDB.getBySlug ya filtra `isPublished`.
    const store = await MarketplaceStoresDB.getBySlug(storeSlug);
    if (!store) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    // Buscar cupón scoped al tenant del store (CouponsDB.findByCode aplica
    // tenantId obligatorio + prefiere store-specific sobre tenant-wide).
    const coupon = await CouponsDB.findByCode(store.tenantId, code, store.id);

    if (!coupon || !coupon.active) {
      return NextResponse.json({ valid: false, reason: "Cupón no encontrado o inactivo" });
    }

    // Check expiration
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
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
