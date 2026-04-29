import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId, NotFoundError } from "@/lib/api-error";

/**
 * @cross-tenant intentional — endpoint público del storefront marketplace.
 * @prisma-direct excepción documentada — este endpoint necesita columnas
 * `vacationMode` y `vacationMessage` que la migration 20260411 todavía no
 * aplicó (ver lib/db/marketplace.db.ts:329-330). Al usar prisma directo aquí
 * tolera el schema drift transitorio. Cuando la migration esté en prod,
 * migrar a MarketplaceStoresDB.getDetailBySlug().
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const traceId = newTraceId();
  try {
    const { slug } = await params;

    const store = await prisma.store.findUnique({
      where: { slug },
      select: {
        id:              true,
        slug:            true,
        name:            true,
        description:     true,
        logo:            true,
        banner:          true,
        category:        true,
        zone:            true,
        rating:          true,
        reviewCount:     true,
        isPublished:     true,
        vacationMode:    true,
        vacationMessage: true,
        createdAt:       true,
        tenant: { select: { slug: true } },
        _count: {
          select: {
            // La relación en Store se llama 'products' (StoreProduct[])
            products: { where: { isActive: true } },
          },
        },
      },
    });

    if (!store || !store.isPublished) {
      throw new NotFoundError("Tienda");
    }

    // Explicitly pick only public-safe fields (defense-in-depth against accidental
    // leaks if select or a mock returns extra fields like tenantId or commission)
    const { id, slug: storeSlug, name, description, logo, banner, category, zone,
            rating, reviewCount, vacationMode, vacationMessage, createdAt, tenant, _count } = store;
    return NextResponse.json({ data: { id, slug: storeSlug, name, description, logo, banner,
      category, zone, rating, reviewCount, vacationMode, vacationMessage, createdAt,
      tenantSlug: tenant?.slug ?? null, _count } });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
