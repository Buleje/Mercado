/**
 * @prisma-direct ok — operación con scope explícito por `auth.tenantId` o
 * por `tenantId` resuelto desde slug del URL antes de la query. Aislamiento
 * cross-tenant verificado manualmente. Migrar a clase `lib/db/*.db.ts`
 * dedicada cuando se centralice el patrón.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

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

    // SECURITY 2026-05-06 (audit privacy): si hay customer-session, exigir
    // que el phone matchee el del JWT. Sin session, devolver respuesta
    // mínima (items vacíos) — antes cualquier visitante podía leer hábitos
    // de compra de otros con solo conocer el phone.
    try {
      const { CUSTOMER_SESSION, getCustomerPayload } = await import("@/lib/auth/customer-session");
      const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
      if (sessionToken) {
        const payload = await getCustomerPayload(sessionToken);
        const sessionPhone = (payload?.customerId ?? "").replace(/\D/g, "");
        const queryPhone = phone.replace(/\D/g, "");
        if (sessionPhone && sessionPhone !== queryPhone) {
          return NextResponse.json({ items: [] });
        }
      } else {
        // Anónimo: no exponer carrito. Antes cualquiera con phone target
        // veía storeSlug + customerName + itemsJson + total.
        return NextResponse.json({ items: [] });
      }
    } catch { /* noop */ }

    // SECURITY (2026-04-29): scope por tenantId del request — antes era
    // cross-tenant. Si no hay tenant resuelto, no devolvemos nada.
    const tenantId = req.headers.get("x-tenant-id");
    if (!tenantId) {
      return NextResponse.json({ items: [] });
    }

    // Find the most recent non-recovered cart for this phone (max 24h old).
    // MarketplaceAbandonedCart no tiene FK a Store; validamos post-fetch
    // que el storeSlug pertenece al tenant del request.
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

    if (cart) {
      const owningStore = await prisma.store.findFirst({
        where: { slug: cart.storeSlug, tenantId },
        select: { id: true },
      });
      if (!owningStore) {
        // Carrito pertenece a OTRO tenant → no devolver nada.
        return NextResponse.json({ items: [] });
      }
    }

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
