export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/recommendations/for-me
 *
 * Endpoint de marketplace que devuelve recomendaciones personalizadas
 * basadas en el historial de compras del cliente autenticado.
 *
 * Requiere sesión de customer (cookie bsm-customer-sess).
 * Si no hay sesión activa devuelve 401.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireCustomer } from "@/lib/auth/require-customer";
import { getRecommendedForCustomer } from "@/lib/recommendations/product-similarity";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 5))
    .pipe(z.number().int().min(1).max(20)),
});

export async function GET(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? undefined;

  // Auth — requiere sesión de customer
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  // Validar query params
  const { searchParams } = req.nextUrl;
  const parsed = QuerySchema.safeParse({ limit: searchParams.get("limit") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  logger.debug("[recommendations/for-me] request", {
    tenantId: customer.tenantId,
    customerPhone: customer.customerId,
    limit: parsed.data.limit,
    requestId,
  });

  const products = await getRecommendedForCustomer(
    customer.tenantId,
    customer.customerId ?? "",
    parsed.data.limit,
  );

  return NextResponse.json({ products });
}
