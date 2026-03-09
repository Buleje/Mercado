export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { CouponsDB } from "@/lib/jsondb";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

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

  const { code, cartTotal } = await req.json();
  if (!code) return NextResponse.json({ error: "CÃ³digo requerido" }, { status: 400 });

  const coupon = await CouponsDB.getByCode(code);
  if (!coupon) return NextResponse.json({ error: "CupÃ³n no encontrado" }, { status: 404 });
  if (!coupon.active) return NextResponse.json({ error: "CupÃ³n inactivo" }, { status: 400 });
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return NextResponse.json({ error: "CupÃ³n expirado" }, { status: 400 });
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return NextResponse.json({ error: "CupÃ³n agotado" }, { status: 400 });
  if (coupon.minPurchase && cartTotal < coupon.minPurchase) return NextResponse.json({ error: `MÃ­nimo de compra: S/${coupon.minPurchase}` }, { status: 400 });

  const discount = coupon.discountType === "percent"
    ? Math.round(cartTotal * coupon.discountValue / 100 * 100) / 100
    : Math.min(coupon.discountValue, cartTotal);

  return NextResponse.json({ coupon, discount });
}
