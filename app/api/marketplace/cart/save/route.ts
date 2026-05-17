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
  // F3: rate limit por IP (MODERATE) como primera capa
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

    // F3: rate limit adicional por sufijo de phone para bloquear saturación
    // de abandoned carts ajenos desde una misma IP con phones distintos.
    const phoneSuffix = parsed.data.customerPhone.slice(-4);
    const phoneLimited = applyRateLimit(req, "STRICT", `cart-save-${phoneSuffix}`);
    if (phoneLimited) return phoneLimited;

    // Audit 2026-05-17 01-P1-5: recomputar total server-side antes de
    // persistir. Antes, el total venía del cliente y se guardaba tal cual
    // → atacante manipulaba el total mostrado en analytics de abandoned
    // carts (no era fraude de cobro, pero ensuciaba KPIs). Ahora derivamos
    // del array items (price * quantity) y persistimos ese valor. Logueamos
    // mismatch >1% sin rechazar (abandoned cart, no es payment).
    const computedTotal = parsed.data.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const clientTotal = parsed.data.total;
    const mismatchPct = clientTotal > 0
      ? Math.abs(computedTotal - clientTotal) / clientTotal
      : 0;
    if (mismatchPct > 0.01) {
      logger.warn("[marketplace/cart/save] total mismatch client vs server", {
        clientTotal,
        computedTotal,
        mismatchPct: mismatchPct.toFixed(4),
        phoneSuffix,
      });
    }

    await MarketplaceAbandonedCartsDB.save({
      ...parsed.data,
      total: Math.round(computedTotal * 100) / 100,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[marketplace/cart/save] error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
