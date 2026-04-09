import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId, NotFoundError } from "@/lib/api-error";

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
            rating, reviewCount, vacationMode, vacationMessage, createdAt, _count } = store;
    return NextResponse.json({ data: { id, slug: storeSlug, name, description, logo, banner,
      category, zone, rating, reviewCount, vacationMode, vacationMessage, createdAt, _count } });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
