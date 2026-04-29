/**
 * GET /api/marketplace/compare?ids=1,2,3,4
 *
 * Resuelve hasta 4 productos para comparación side-by-side.
 * Endpoint público — no requiere auth (marketplace browsing).
 */

/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 * Migrar a `lib/db/marketplace-*.db.ts` cuando se cree clase específica.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { MarketplaceCompareDB } from "@/lib/db/marketplace-compare.db";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  ids: z.string().min(1).max(200),
});

export async function GET(req: NextRequest) {
  const parsed = QuerySchema.safeParse({
    ids: req.nextUrl.searchParams.get("ids") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "ids requerido" }, { status: 400 });
  }

  const ids = parsed.data.ids
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 4); // Hard-cap 4 para evitar abuso

  if (ids.length === 0) {
    return NextResponse.json({ data: [] });
  }

  try {
    // El marketplace es "global" para consumers — pero seguimos usando el tenant
    // main como scope por convención. Si un producto es de otro tenant, aún así
    // se muestra porque la marketplace lista es unificada.
    const mainTenant = await prisma.tenant.findFirst({
      where: { slug: "main" },
      select: { id: true },
    });
    const tenantId = mainTenant?.id ?? "global";

    const data = await MarketplaceCompareDB.getProductsForCompare(tenantId, ids);

    return NextResponse.json(
      { data },
      {
        headers: {
          "Cache-Control": "public, max-age=30, s-maxage=60",
          "X-Total-Count": String(data.length),
        },
      },
    );
  } catch (err) {
    logger.error("[marketplace/compare] failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
