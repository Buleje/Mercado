export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MarketplaceAbandonedCartsDB } from "@/lib/db/marketplace.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const SaveCartSchema = z.object({
  storeSlug: z.string().min(1),
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().min(6).max(20),
  items: z.array(z.object({
    storeProductId: z.string(),
    productId: z.number(),
    name: z.string(),
    quantity: z.number().min(1),
    price: z.number().min(0),
    unit: z.string(),
  })).min(1),
  total: z.number().min(0),
});

/**
 * POST /api/marketplace/cart/save
 *
 * Public endpoint — saves cart for abandoned cart recovery.
 * Called when user fills checkout form with name + phone.
 */
export async function POST(req: NextRequest) {
  const limited = applyRateLimit(req, "MODERATE", "marketplace-cart-save");
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = SaveCartSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    await MarketplaceAbandonedCartsDB.save(parsed.data);

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[marketplace/cart/save] error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
