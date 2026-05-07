/**
 * GET /api/marketplace/recommendations/[productId]
 *
 * Endpoint público del marketplace — no requiere autenticación.
 * Devuelve los top 5 productos relacionados por co-ocurrencia en órdenes históricas.
 *
 * El tenantId se resuelve del header x-tenant-id inyectado por el middleware.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getRelatedProducts } from "@/lib/recommendations/product-similarity";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 5))
    .pipe(z.number().int().min(1).max(20)),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const requestId = req.headers.get("x-request-id") ?? undefined;
  const { productId: productIdParam } = await params;

  // Validar productId
  const pid = parseInt(productIdParam, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    return NextResponse.json(
      { error: "productId inválido — debe ser un entero positivo" },
      { status: 400 },
    );
  }

  // Validar query params
  const { searchParams } = req.nextUrl;
  const parsed = QuerySchema.safeParse({ limit: searchParams.get("limit") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // SECURITY 2026-05-06 (audit AI): derivar tenantId del producto pedido,
  // no del header. El productId es global, así que la fuente de verdad es
  // su tenantId real. Antes el header podía cruzar y contaminar el cache.
  const { prisma } = await import("@/lib/prisma");
  const productOwner = await prisma.product.findFirst({
    where: { id: pid, deletedAt: null },
    select: { tenantId: true },
  });
  if (!productOwner) {
    return NextResponse.json({ products: [] });
  }
  const tenantId = productOwner.tenantId;

  logger.debug("[recommendations/productId] request", {
    tenantId,
    productId: pid,
    limit: parsed.data.limit,
    requestId,
  });

  const products = await getRelatedProducts(tenantId, pid, parsed.data.limit);

  return NextResponse.json({ products });
}
