import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CouponsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

const CouponPatchSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  description: z.string().max(300).optional(),
  discountType: z.enum(["percent", "fixed"]).optional(),
  discountValue: z.number().positive().optional(),
  minPurchase: z.number().min(0).optional(),
  maxUses: z.number().min(1).optional(),
  active: z.boolean().optional(),
  expiresAt: z.string().max(50).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const raw = await req.json();
  const parsed = CouponPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const coupon = await CouponsDB.update(id, parsed.data);
  if (!coupon) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(coupon);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  await CouponsDB.delete(id);
  return NextResponse.json({ ok: true });
}
