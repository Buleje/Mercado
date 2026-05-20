/**
 * Audit project-wide 2026-05-19: migrado a DB classes canonicas.
 * - MarketplaceAbandonedCartsDB.findActiveByPhone para el lookup del cart
 * - MarketplaceStoresDB.getIdBySlugAndTenant para el cross-tenant guard
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MarketplaceAbandonedCartsDB } from "@/lib/db/marketplace/abandoned-carts.db";
import { MarketplaceStoresDB } from "@/lib/db/marketplace/stores.db";
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

    // Audit project-wide 2026-05-19: migrado a MarketplaceAbandonedCartsDB.findActiveByPhone.
    // MarketplaceAbandonedCart no tiene FK a Store; validamos post-fetch
    // que el storeSlug pertenece al tenant del request via MarketplaceStoresDB.
    const cart = await MarketplaceAbandonedCartsDB.findActiveByPhone(phone, { maxAgeHours: 24 });

    if (!cart) {
      return NextResponse.json({ items: [] });
    }

    const owningStore = await MarketplaceStoresDB.getIdBySlugAndTenant(tenantId, cart.storeSlug);
    if (!owningStore) {
      // Carrito pertenece a OTRO tenant → no devolver nada.
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
