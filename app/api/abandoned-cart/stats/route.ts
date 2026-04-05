export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

/**
 * GET /api/abandoned-cart/stats
 *
 * Retorna conteo y valor estimado de carritos abandonados (>2h, <24h)
 * para mostrar en el dashboard admin.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const now = Date.now();
    const cutoff = new Date(now - 2 * 60 * 60 * 1000);
    const maxAge = new Date(now - 24 * 60 * 60 * 1000);

    const carts = await prisma.savedCart.findMany({
      where: {
        updatedAt: { lt: cutoff, gt: maxAge },
        NOT: { itemsJson: "[]" },
      },
      select: { itemsJson: true },
    });

    let count = 0;
    let estimatedValue = 0;

    for (const cart of carts) {
      try {
        const items = JSON.parse(cart.itemsJson);
        if (!Array.isArray(items) || items.length === 0) continue;
        count++;
        for (const item of items) {
          const qty = item.qty ?? item.quantity ?? 1;
          const price = typeof item.price === "number" ? item.price : 0;
          estimatedValue += price * qty;
        }
      } catch {
        // skip invalid JSON
      }
    }

    return NextResponse.json({
      count,
      estimatedValue: Math.round(estimatedValue * 100) / 100,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
