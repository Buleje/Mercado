import { NextResponse, type NextRequest } from "next/server";
import { CouponsDB } from "@/lib/jsondb";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  // Rate limit: 10 attempts per IP per 5 minutes
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`coupon:${ip}`, 10, 300);
  if (!allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos antes de intentarlo de nuevo." },
      { status: 429 }
    );
  }

  try {
    const { code, cartTotal } = await req.json();
    if (!code) return NextResponse.json({ error: "Código requerido" }, { status: 400 });

    const coupon = await CouponsDB.getByCode(code);
    if (!coupon) return NextResponse.json({ error: "Cupón no encontrado" }, { status: 404 });
    if (!coupon.active) return NextResponse.json({ error: "Cupón inactivo" }, { status: 400 });
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return NextResponse.json({ error: "Cupón expirado" }, { status: 400 });
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return NextResponse.json({ error: "Cupón agotado" }, { status: 400 });
    if (coupon.minPurchase && cartTotal < coupon.minPurchase) return NextResponse.json({ error: `Mínimo de compra: S/${coupon.minPurchase}` }, { status: 400 });

    let discount: number;
    if (coupon.discountType === "giftcard") {
      const balance = coupon.balance ?? coupon.discountValue;
      if (balance <= 0) return NextResponse.json({ error: "Gift card sin saldo" }, { status: 400 });
      discount = Math.min(balance, cartTotal);
    } else if (coupon.discountType === "percent") {
      discount = Math.round(cartTotal * coupon.discountValue / 100 * 100) / 100;
    } else {
      discount = Math.min(coupon.discountValue, cartTotal);
    }

    return NextResponse.json({ coupon, discount });
  } catch (e) {
    logger.error("[coupons/validate] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 503 });
  }
}
