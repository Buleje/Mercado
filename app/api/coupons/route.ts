export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CouponsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

const CouponPostSchema = z.object({
  code: z.string().min(1).max(50),
  description: z.string().max(300).optional(),
  discountType: z.enum(["percent", "fixed"]).optional(),
  discountValue: z.number().positive(),
  minPurchase: z.number().min(0).optional(),
  maxUses: z.number().min(1).optional(),
  active: z.boolean().optional(),
  expiresAt: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const coupons = await CouponsDB.getAll();
  return NextResponse.json(coupons);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const raw = await req.json();
  const parsed = CouponPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invÃ¡lidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }
  const { code, description, discountType, discountValue, minPurchase, maxUses, active, expiresAt } = parsed.data;

  const existing = await CouponsDB.getByCode(code);
  if (existing) return NextResponse.json({ error: "Ya existe un cupÃ³n con ese cÃ³digo" }, { status: 409 });

  const coupon = await CouponsDB.add({
    code, description: description ?? "",
    discountType: discountType ?? "percent", discountValue,
    minPurchase, maxUses, active: active ?? true, expiresAt,
  });
  return NextResponse.json(coupon, { status: 201 });
}
