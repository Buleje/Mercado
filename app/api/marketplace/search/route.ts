export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

const QuerySchema = z.object({
  q:        z.string().min(1).max(100),
  zone:     z.string().optional(),
  category: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { q, zone, category } = parsed.data;

    const results = await prisma.storeProduct.findMany({
      where: {
        isActive: true,
        store: {
          isPublished: true,
          ...(zone && { zone }),
        },
        product: {
          name: { contains: q, mode: "insensitive" },
          ...(category && { category }),
        },
      },
      select: {
        id:          true,
        retailPrice: true,
        minOrderQty: true,
        product: {
          select: {
            id:       true,
            name:     true,
            image:    true,
            category: true,
            unit:     true,
          },
        },
        store: {
          select: {
            id:   true,
            name: true,
            slug: true,
            logo: true,
            zone: true,
          },
        },
      },
      orderBy: { retailPrice: "asc" },
      take:    50,
    });

    return NextResponse.json({ data: results, total: results.length, query: q });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
