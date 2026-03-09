import { NextResponse } from "next/server";
import { LoyaltyDB, normalizePhone } from "@/lib/jsondb";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ phone: string }> }
) {
  const { phone } = await ctx.params;
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 6) {
    return NextResponse.json({ error: "invalid phone" }, { status: 400 });
  }
  const loyalty = await LoyaltyDB.getByPhone(normalized);
  if (!loyalty) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    ...loyalty,
    tiers: LoyaltyDB.TIERS,
  });
}
