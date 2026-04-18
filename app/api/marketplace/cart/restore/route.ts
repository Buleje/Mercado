import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const RestoreSchema = z.object({
  phone: z.string().min(6).max(20),
});

/**
 * POST /api/marketplace/cart/restore
 *
 * Public endpoint — restores a marketplace cart from abandoned carts table.
 * Called when a returning customer enters their phone in checkout.
 * Returns the most recent unconverted cart items if any exist.
 */
export async function POST(req: NextRequest) {
  const limited = applyRateLimit(req, "MODERATE", "marketplace-cart-restore");
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = RestoreSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ items: [] });
    }

    const { phone } = parsed.data;

    // Find the most recent non-recovered cart for this phone (max 24h old)
    const cart = await prisma.marketplaceAbandonedCart.findFirst({
      where: {
        customerPhone: phone,
        recovered: false,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        storeSlug: true,
        customerName: true,
        itemsJson: true,
        total: true,
      },
    });

    if (!cart) {
      return NextResponse.json({ items: [] });
    }

    let items: unknown[] = [];
    try {
      items = JSON.parse(cart.itemsJson);
    } catch {
      return NextResponse.json({ items: [] });
    }

    return NextResponse.json({
      storeSlug: cart.storeSlug,
      customerName: cart.customerName,
      items,
      total: cart.total,
    });
  } catch (err) {
    logger.error("[marketplace/cart/restore] error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ items: [] });
  }
}
