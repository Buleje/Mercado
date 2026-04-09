import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  category: z.string().optional(),
  supplier: z.string().optional(), // tenantId del proveedor (store.tenantId)
  search:   z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

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

    const { category, supplier, search } = parsed.data;

    const items = await prisma.storeProduct.findMany({
      where: {
        isActive:       true,
        wholesalePrice: { not: null },
        store: {
          isPublished: true,
          // Excluir la propia tienda del tenant logueado
          NOT: { tenantId: auth.tenantId },
          ...(supplier && { tenantId: supplier }),
        },
        ...(category && { product: { category } }),
        ...(search   && { product: { name: { contains: search, mode: "insensitive" } } }),
      },
      select: {
        id:             true,
        wholesalePrice: true,
        retailPrice:    true,
        minOrderQty:    true,
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
            id:       true,
            slug:     true,
            name:     true,
            zone:     true,
            tenantId: true,
            tenant: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { wholesalePrice: "asc" },
      take:    200,
    });

    logger.info("[wholesale/catalog] GET", {
      tenantId: auth.tenantId,
      count:    items.length,
      traceId,
    });

    return NextResponse.json({ data: items, total: items.length });
  } catch (err) {
    logger.error("[wholesale/catalog] GET error", {
      err: err instanceof Error ? err.message : String(err),
      tenantId: auth.tenantId,
      traceId,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
