/**
 * @cross-tenant intentional — endpoint público del storefront marketplace.
 * Delegado a MarketplaceAdminDB.getStoreDetailBySlug (ADR-082).
 */
import { NextRequest, NextResponse } from "next/server";
import { MarketplaceAdminDB } from "@/lib/db/marketplace-public.db";
import { toErrorPayload, newTraceId, NotFoundError } from "@/lib/api-error";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const traceId = newTraceId();
  try {
    const { slug } = await params;

    const store = await MarketplaceAdminDB.getStoreDetailBySlug(slug);

    if (!store || !store.isPublished) {
      throw new NotFoundError("Tienda");
    }

    // Explicitly pick only public-safe fields (defense-in-depth)
    const { id, slug: storeSlug, name, description, logo, banner, category, zone,
            rating, reviewCount, vacationMode, vacationMessage, createdAt, tenant, _count } = store;
    return NextResponse.json({
      data: {
        id, slug: storeSlug, name, description, logo, banner,
        category, zone, rating, reviewCount, vacationMode, vacationMessage, createdAt,
        tenantSlug: tenant?.slug ?? null, _count,
      },
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
