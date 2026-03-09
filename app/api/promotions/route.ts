import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PromotionsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

const PromotionSchema = z.object({
  name: z.string().min(1, "name required").max(200),
  description: z.string().max(1000).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  minPurchase: z.number().nonnegative().optional(),
  imageUrl: z.string().max(500).optional(),
  message: z.string().max(500).optional(),
  targetType: z.enum(["all", "specific"]).optional(),
  targetPhones: z.string().max(500).optional(),
  active: z.boolean().optional(),
  expiresAt: z.string().max(50).optional(),
});

export async function GET(req: NextRequest) {
  const all = await PromotionsDB.getAll();

  // Admin sees full data including targetPhones
  const auth = await requireAdmin(req);
  if (!(auth instanceof NextResponse)) {
    return NextResponse.json(all);
  }

  // Public clients get active promotions with targetPhones stripped (privacy)
  const now = new Date();
  const publicPromos = all
    .filter(p => p.active && (!p.expiresAt || new Date(p.expiresAt) > now))
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ targetPhones, ...rest }) => rest);

  return NextResponse.json(publicPromos);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const raw = await req.json();
  const parsed = PromotionSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  const data = parsed.data;
  const id = `promo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const promo = await PromotionsDB.add({
    id,
    name: data.name,
    description: data.description || "",
    discountPercent: data.discountPercent ?? 0,
    minPurchase: data.minPurchase,
    imageUrl: data.imageUrl || undefined,
    message: data.message || undefined,
    targetType: data.targetType || "all",
    targetPhones: data.targetPhones || undefined,
    active: data.active ?? true,
    createdAt: new Date().toISOString(),
    expiresAt: data.expiresAt || undefined,
  });
  return NextResponse.json(promo, { status: 201 });
}
