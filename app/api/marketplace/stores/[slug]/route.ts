export const dynamic = "force-dynamic";

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
        id:          true,
        slug:        true,
        name:        true,
        description: true,
        logo:        true,
        banner:      true,
        category:    true,
        zone:        true,
        rating:      true,
        reviewCount: true,
        isPublished: true,
        createdAt:   true,
        _count: {
          select: {
            products: { where: { isActive: true } },
          },
        },
      },
    });

    if (!store || !store.isPublished) {
      throw new NotFoundError("Tienda");
    }

    return NextResponse.json({ data: store });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
