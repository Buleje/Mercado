/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 * Migrar a `lib/db/marketplace-*.db.ts` cuando se cree clase específica.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { MarketplaceProductsDB } from "@/lib/db/marketplace-products.db";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const PostSchema = z.object({
  text: z.string().min(1).max(2000),
  rating: z.int().min(1).max(5),
  qualityRating: z.int().min(1).max(5).optional(),
  priceRating: z.int().min(1).max(5).optional(),
  deliveryRating: z.int().min(1).max(5).optional(),
  photosJson: z.string().optional(),
  // HOTFIX-A3 (2026-04-29): customerPhone removido del body — el phone
  // viene del JWT customer-session (HMAC verified). El cliente NO puede
  // spoofear el phone de otro customer.
  customerName: z.string().min(1).max(100),
});

type RouteParams = { params: Promise<{ id: string }> };

// Audit project-wide 2026-05-19: computeSummary migrado a
// MarketplaceProductsDB.getReviewsSummary.
async function computeSummary(productId: number, tenantId: string) {
  return MarketplaceProductsDB.getReviewsSummary(tenantId, productId);
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const traceId = newTraceId();
  try {
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "ID de producto inválido" }, { status: 400 });
    }

    // SECURITY 2026-05-06: derivar tenantId del producto (no del header)
    // para evitar que un cliente con header falsificado lea reseñas de otro
    // tenant. Esto es consistente con el POST de este mismo endpoint.
    // Audit project-wide 2026-05-19: migrado a MarketplaceProductsDB.getTenantById.
    const tenantId = await MarketplaceProductsDB.getTenantById(productId);
    if (!tenantId) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: "Parámetros inválidos", issues: parsed.error.issues }, { status: 400 });
    }

    const { cursor, limit } = parsed.data;
    const summaryKey = `marketplace:product:${productId}:reviews-summary:${tenantId}`;

    const [reviews, summary] = await Promise.all([
      MarketplaceProductsDB.getApprovedReviewsPage(tenantId, productId, { cursor, limit }),
      getOrSet(summaryKey, 120, () => computeSummary(productId, tenantId)),
    ]);

    const hasMore = reviews.length > limit;
    const items = reviews.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

    const data = items.map((r) => ({
      ...r,
      adminReplyDate: r.adminReplyDate?.toISOString() ?? null,
      date: r.date.toISOString(),
    }));

    return NextResponse.json({ data, summary, hasMore, nextCursor });
  } catch (err) {
    logger.error("marketplace/products/reviews-detailed GET: error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const traceId = newTraceId();
  try {
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "ID de producto inválido" }, { status: 400 });
    }

    // SECURITY 2026-05-06: derivar tenantId del producto, NO del header.
    // Un cliente no debe poder dejar review escrita contra un tenant
    // arbitrario forzando el header. El producto define a qué tenant pertenece.
    // Audit project-wide 2026-05-19: migrado a MarketplaceProductsDB.getTenantById.
    const tenantId = await MarketplaceProductsDB.getTenantById(productId);
    if (!tenantId) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    // SECURITY (HOTFIX-A3, 2026-04-29): exige customer-session firmada.
    // Antes: cualquiera dejaba review con phone de otro cliente (vector
    // de impersonation publica). Ahora el phone proviene del JWT customer
    // verificado por HMAC, no del body.
    const { getCustomerPayload, CUSTOMER_SESSION } = await import("@/lib/auth/customer-session");
    const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { error: "Iniciá sesión para dejar una reseña" },
        { status: 401 },
      );
    }
    const sessionPayload = await getCustomerPayload(sessionToken);
    if (!sessionPayload?.customerId) {
      return NextResponse.json(
        { error: "Sesión inválida o expirada" },
        { status: 401 },
      );
    }

    const body = await req.json().catch((err) => { logger.error("[marketplace/products/[id]/reviews-detailed] parse JSON body failed", { error: String(err) }); return null; });
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
    }

    // SECURITY (HOTFIX-A3): el phone NO viene del body — viene del JWT customer.
    // El customerName del body se mantiene como display name, pero el phone
    // (que define identidad) es del session token verificado.
    const customerPhone = sessionPayload.customerId;
    const { customerName, ...reviewFields } = parsed.data;

    // Audit project-wide 2026-05-19: createPendingReview encapsula la
    // verificacion de purchase + create con status="pending" + verified.
    const review = await MarketplaceProductsDB.createPendingReview(tenantId, {
      productId,
      customerPhone,
      customerName,
      text: reviewFields.text,
      rating: reviewFields.rating,
      qualityRating: reviewFields.qualityRating ?? null,
      priceRating: reviewFields.priceRating ?? null,
      deliveryRating: reviewFields.deliveryRating ?? null,
      photosJson: reviewFields.photosJson ?? null,
    });

    invalidateByPrefix(`marketplace:product:${productId}:reviews`);

    return NextResponse.json({ data: { ...review, date: review.date.toISOString() } }, { status: 201 });
  } catch (err) {
    logger.error("marketplace/products/reviews-detailed POST: error", { traceId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
