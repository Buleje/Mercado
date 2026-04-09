import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CouponsDB } from "@/lib/jsondb";

const SpinSchema = z.object({
  prize: z.string().min(1).max(50),
  type: z.enum(["percent", "fixed", "free_delivery"]),
  value: z.number().min(0).max(100),
});

// Valid spin prizes — prevents abuse by only allowing known prizes
const VALID_PRIZES: Record<string, { type: "percent" | "fixed"; value: number; desc: string }> = {
  "5% OFF":       { type: "percent", value: 5,  desc: "5% de descuento (Ruleta)" },
  "3% OFF":       { type: "percent", value: 3,  desc: "3% de descuento (Ruleta)" },
  "10% OFF":      { type: "percent", value: 10, desc: "10% de descuento (Ruleta)" },
  "S/2 OFF":      { type: "fixed",   value: 2,  desc: "S/2 de descuento (Ruleta)" },
  "S/5 OFF":      { type: "fixed",   value: 5,  desc: "S/5 de descuento (Ruleta)" },
  "Envío gratis":  { type: "fixed",   value: 5,  desc: "Delivery gratis (Ruleta)" },
  "Sorpresa 🎁":  { type: "percent", value: 7,  desc: "Sorpresa 7% desc. (Ruleta)" },
};

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SPIN-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = SpinSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const prizeConfig = VALID_PRIZES[parsed.data.prize];
    if (!prizeConfig) {
      return NextResponse.json({ error: "Premio no reconocido" }, { status: 400 });
    }

    // Generate unique code (retry up to 5 times on collision)
    let code = "";
    for (let i = 0; i < 5; i++) {
      code = generateCode();
      const existing = await CouponsDB.getByCode(code);
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
    });

    return NextResponse.json({ code: coupon.code, expiresAt }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
