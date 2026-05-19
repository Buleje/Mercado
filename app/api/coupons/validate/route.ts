import { NextResponse, type NextRequest } from "next/server";
import { CouponsDB } from "@/lib/jsondb";
import { rateLimit, getClientIp , applyRateLimit } from "@/lib/rate-limit";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "coupons-validate"); if (_rl) return _rl;
  // SECURITY 2026-05-06 (audit pagos M007): doble rate limit para frenar
  // brute-force de códigos cortos (PROMO20, BIENV2026...).
  //   - Por IP: 10 intentos / 5 min (limita atacante simple)
  //   - Por código: 5 intentos / 1h (limita atacante distribuido)
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

    // Rate limit por código (anti brute-force distribuido)
    const codeKey = `coupon:code:${String(code).toLowerCase().slice(0, 50)}`;
    const codeRl = rateLimit(codeKey, 5, 3600);
    if (!codeRl.allowed) {
      // Devolver 404 (no 429) para no leak existence ni dar señal de "casi acertaste".
      return NextResponse.json({ error: "Cupón no encontrado" }, { status: 404 });
    }

    const tenantId = getTenantIdFromRequest(req);
    const coupon = await CouponsDB.getByCode(tenantId, code);
    if (!coupon) return NextResponse.json({ error: "Cupón no encontrado" }, { status: 404 });
    if (!coupon.active) return NextResponse.json({ error: "Cupón inactivo" }, { status: 400 });
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return NextResponse.json({ error: "Cupón expirado" }, { status: 400 });
    // SECURITY (F2 2026-05-07): validate SOLO verifica — nunca incrementa usedCount.
    // El incremento atómico ocurre dentro del $transaction en /api/orders POST
    // usando $executeRaw con condición "usedCount < maxUses". Esto evita doble
    // consumo y race conditions entre llamadas paralelas.
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return NextResponse.json({ error: "Cupón agotado" }, { status: 400 });
    if (coupon.minPurchase && cartTotal < coupon.minPurchase) return NextResponse.json({ error: `Mínimo de compra: S/${coupon.minPurchase}` }, { status: 400 });

    let discount: number;
    if (coupon.discountType === "giftcard") {
      const balance = coupon.balance ?? coupon.discountValue;
      if (balance <= 0) return NextResponse.json({ error: "Gift card sin saldo" }, { status: 400 });
      discount = Math.min(balance, cartTotal);
    } else if (coupon.discountType === "percent") {
      // PENTEST 2026-05-18 Sprint A #3: cap percent al 100% incluso si el
      // dato persistido en DB tiene valor > 100 (cupones legacy creados antes
      // de la validación Zod en POST). El cliente NUNCA ve un descuento
      // mayor al cartTotal.
      const capped = Math.min(coupon.discountValue, 100);
      discount = Math.round(cartTotal * capped / 100 * 100) / 100;
      discount = Math.min(discount, cartTotal);
    } else {
      discount = Math.min(coupon.discountValue, cartTotal);
    }

    return NextResponse.json({ coupon, discount });
  } catch (e) {
    logger.error("[coupons/validate] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 503 });
  }
}
