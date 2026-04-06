export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

const QuerySchema = z.object({
  q:        z.string().min(1).max(100),
  zone:     z.string().optional(),
  category: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort:     z.enum(["price_asc", "price_desc", "name"]).optional(),
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

    const { q, zone, category, minPrice, maxPrice, sort } = parsed.data;

    const results = await prisma.storeProduct.findMany({
      where: {
        isActive: true,
        ...(minPrice !== undefined || maxPrice !== undefined
          ? {
              retailPrice: {
                ...(minPrice !== undefined && { gte: minPrice }),
                ...(maxPrice !== undefined && { lte: maxPrice }),
              },
            }
          : {}),
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
      orderBy: sort === "price_desc"
        ? { retailPrice: "desc" }
        : sort === "name"
          ? { product: { name: "asc" } }
          : { retailPrice: "asc" },
      take:    50,
    });

    return NextResponse.json({ data: results, total: results.length, query: q });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
