import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ReviewsMarketplaceDB } from "@/lib/db/reviews.db";
import { MarketplaceStoresDB } from "@/lib/db/marketplace.db";
import { getCustomerPayload, CUSTOMER_SESSION } from "@/lib/auth/customer-session";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Comentarios públicos de producto (estilo Instagram) — Brandon 2026-06-06.
 *
 * Reemplaza al cross-sell "Combiná con tu pedido" del modal de agregar al
 * carrito del marketplace. Solo clientes LOGUEADOS comentan (el nombre sale
 * de la sesión, nunca del body); todos pueden LEER. Se publica al instante.
 *
 * POST /api/marketplace/comments  (requiere customer-session → 401 si no)
 *   → { storeSlug, productId, text }
 *
 * GET /api/marketplace/comments?storeSlug=xxx&productId=123  (público)
 *   → lista los comentarios del producto, más recientes primero
 *
 * Anti-spam: sesión obligatoria + rate limit MODERATE por IP + strip HTML
 * en DB class + límite 300 chars. El admin puede ocultarlos vía moderación.
 */

const CreateBody = z.object({
  storeSlug: z.string().min(1).max(200),
  productId: z.number().int().positive(),
  text:      z.string().min(1).max(300),
});

export async function POST(req: NextRequest) {
  // Anti-spam: 20 comentarios / 5min / IP
  const rl = applyRateLimit(req, "MODERATE", "marketplace-comments-create");
  if (rl) return rl;

  // Solo logueados comentan — el nombre viene de la sesión firmada (JWT),
  // jamás del body (anti-suplantación).
  const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  const session = sessionToken ? await getCustomerPayload(sessionToken) : null;
  if (!session?.name) {
    return NextResponse.json(
      { error: "Iniciá sesión para comentar", requiresAuth: true },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    // Resolver tienda — getBySlug filtra isPublished:true y cachea.
    const store = await MarketplaceStoresDB.getBySlug(parsed.data.storeSlug);
    if (!store) {
      return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
    }

    const comment = await ReviewsMarketplaceDB.createComment({
      tenantId:  store.tenantId,
      storeId:   store.id,
      productId: parsed.data.productId,
      name:      session.name,
      text:      parsed.data.text,
    });

    return NextResponse.json({ data: comment }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("obligatorios")) {
      return NextResponse.json({ error: msg }, { status: 422 });
    }
    logger.error("[marketplace/comments] create failed", { err: msg });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const storeSlug = req.nextUrl.searchParams.get("storeSlug") ?? "";
  const productId = Number(req.nextUrl.searchParams.get("productId"));

  if (!storeSlug || !Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json(
      { error: "storeSlug y productId requeridos" },
      { status: 400 },
    );
  }

  try {
    const store = await MarketplaceStoresDB.getBySlug(storeSlug);
    if (!store) {
      return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
    }

    const comments = await ReviewsMarketplaceDB.listComments(store.tenantId, productId, {
      limit: 30,
    });

    return NextResponse.json(
      { data: comments },
      {
        headers: {
          "Cache-Control": "public, max-age=15, s-maxage=30",
          "X-Robots-Tag":  "noindex, nofollow",
        },
      },
    );
  } catch (err) {
    logger.error("[marketplace/comments] list failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
