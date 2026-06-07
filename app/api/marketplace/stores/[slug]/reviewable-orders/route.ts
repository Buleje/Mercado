import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { MarketplaceReviewsDB } from "@/lib/db/marketplace/reviews.db";
import {
  getCustomerPayload,
  CUSTOMER_SESSION,
} from "@/lib/auth/customer-session";
import { toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/marketplace/stores/[slug]/reviewable-orders
 *
 * Devuelve las compras del cliente AUTENTICADO en esta tienda que son
 * elegibles para reseñar (entregadas/confirmadas y sin review previa).
 *
 * El modal "Dar opinión" usa esto para auto-vincular la compra: el cliente
 * no escribe nombre, teléfono ni nº de pedido — todo sale de su sesión.
 *
 * Seguridad: lee el phone desde la cookie de sesión firmada (HMAC), nunca
 * del cliente, para no permitir enumerar pedidos de terceros por teléfono.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const rl = applyRateLimit(req, "GENEROUS", "marketplace-reviewable-orders");
  if (rl) return rl;

  try {
    const { slug } = await params;

    const store = await MarketplaceStoresDB.getBySlug(slug);
    if (!store) {
      return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    const token = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
    const payload = token ? await getCustomerPayload(token) : null;

    if (!payload) {
      return NextResponse.json({ loggedIn: false, phone: null, orders: [] });
    }

    // customerId del token = Customer.phone. Si la sesión no tiene phone
    // vinculado (ej. login social sin teléfono), no hay forma de verificar
    // compras — el cliente debe completar su teléfono al comprar.
    const phone = payload.customerId ?? null;
    if (!phone) {
      return NextResponse.json({
        loggedIn: true,
        phone: null,
        name: payload.name ?? null,
        orders: [],
      });
    }

    const orders = await MarketplaceReviewsDB.getReviewableOrders(
      store.tenantId,
      phone,
    );

    return NextResponse.json({
      loggedIn: true,
      phone,
      name: payload.name ?? null,
      orders: orders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt.toISOString(),
        total: o.total,
        itemsCount: o.itemsCount,
      })),
    });
  } catch (err) {
    logger.error("[REVIEWABLE-ORDERS] GET error", { error: err });
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}
