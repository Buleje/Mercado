import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { CouponsDB } from "@/lib/jsondb";
import { getTenantIdFromRequest } from "@/lib/tenant";
import { applyRateLimit } from "@/lib/rate-limit";

// SECURITY (F1 2026-05-07): el cliente ya NO envía el prize.
// El schema solo acepta datos opcionales de contexto (e.g. phone para
// limitar 1 giro/día en el futuro — TODO P2 SpinAttempt).
const SpinSchema = z.object({
  phone: z.string().max(20).optional(),
});

// Server-authoritative prize table with weighted probabilities.
// NUNCA confiar en el prize enviado por el cliente — se selecciona aquí.
const PRIZES: Array<{ name: string; type: "percent" | "fixed"; value: number; desc: string; weight: number }> = [
  { name: "3% OFF",      type: "percent", value: 3,  desc: "3% de descuento (Ruleta)",  weight: 50 },
  { name: "5% OFF",      type: "percent", value: 5,  desc: "5% de descuento (Ruleta)",  weight: 30 },
  { name: "10% OFF",     type: "percent", value: 10, desc: "10% de descuento (Ruleta)", weight: 15 },
  { name: "20% OFF",     type: "percent", value: 20, desc: "20% de descuento (Ruleta)", weight: 5  },
];

function rollPrize(): typeof PRIZES[number] {
  const total = PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of PRIZES) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return PRIZES[0];
}

function generateCode(): string {
  // crypto.randomBytes: CSPRNG — seguro para tokens de cupón
  return "SPIN-" + randomBytes(6).toString("base64url").slice(0, 8).toUpperCase();
}

export async function POST(req: NextRequest) {
  // Rate-limit: STRICT = 10 req / 15 min por IP+tenant (prod) — previene farm de cupones
  const limited = applyRateLimit(req, "STRICT", "coupons-spin");
  if (limited) return limited;

  // TODO(P2): tabla SpinAttempt para 1 giro/día por IP+phone

  try {
    // Body opcional — si no viene JSON válido, se trata como objeto vacío.
    let raw: unknown = {};
    try { raw = await req.json(); } catch { /* sin body — ok */ }
    const parsed = SpinSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    // SECURITY (F1 2026-05-07): selección de premio server-side con pesos.
    // El cliente NO puede elegir su propio premio.
    const prizeConfig = rollPrize();

    const tenantId = getTenantIdFromRequest(req);

    // Generate unique code (retry up to 5 times on collision)
    let code = "";
    for (let i = 0; i < 5; i++) {
      code = generateCode();
      const existing = await CouponsDB.getByCode(tenantId, code);
      if (!existing) break;
    }

    // Create coupon: single-use, expires in 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const coupon = await CouponsDB.add({
      code,
      description: prizeConfig.desc,
      discountType: prizeConfig.type,
      discountValue: prizeConfig.value,
      minPurchase: 0,
      maxUses: 1,
      active: true,
      expiresAt,
    }, tenantId);

    // Devolver el premio seleccionado para que el frontend lo muestre en la animación.
    return NextResponse.json({ code: coupon.code, prize: prizeConfig.name, expiresAt }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
