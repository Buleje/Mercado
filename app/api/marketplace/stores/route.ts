export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId, NotFoundError } from "@/lib/api-error";

const QuerySchema = z.object({
  zone:     z.string().optional(),
  category: z.string().optional(),
  search:   z.string().optional(),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
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

    const { zone, category, search, limit } = parsed.data;

    const stores = await prisma.store.findMany({
      where: {
        isPublished: true,
        ...(zone     && { zone }),
        ...(category && { category }),
        ...(search   && { name: { contains: search, mode: "insensitive" } }),
      },
      select: {
        id:          true,
        slug:        true,
        name:        true,
        logo:        true,
        category:    true,
        zone:        true,
        rating:      true,
        reviewCount: true,
        description: true,
      },
      orderBy: { rating: "desc" },
      take:    limit,
    });

    return NextResponse.json({ data: stores, total: stores.length });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
