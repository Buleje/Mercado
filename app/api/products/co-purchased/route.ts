import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/products/co-purchased?ids=1,2,3&limit=6
 * Returns products frequently bought together with the given product IDs.
 * Uses real order history to compute co-purchase frequency.
 */
export async function GET(req: NextRequest) {
  // Public endpoint — co-purchased data is read-only and safe for storefront
  const tenantId = req.headers.get("x-tenant-id") ?? "main";

  // F9: Validar tenantId antes de usar en raw SQL — prevenir SQL injection via header
  if (!/^[a-z0-9_-]+$/i.test(tenantId)) {
    return NextResponse.json({ error: "tenantId inválido" }, { status: 400 });
  }

  const idsParam = req.nextUrl.searchParams.get("ids");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 6, 20);

  if (!idsParam) {
    return NextResponse.json([]);
  }

  const ids = idsParam
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 50);

  if (ids.length === 0) {
    return NextResponse.json([]);
  }

  try {
    // Find orders containing any of these products, then count how often
    // other products appear in those same orders.
    const coProducts = await prisma.$queryRaw<
      { productId: number; name: string; image: string; price: number; unit: string; freq: bigint }[]
    >`
      SELECT oi2."productId", oi2."name", oi2."image", oi2."price", oi2."unit",
             COUNT(DISTINCT oi2."orderId") AS freq
      FROM "OrderItem" oi1
      JOIN "OrderItem" oi2 ON oi1."orderId" = oi2."orderId"
      JOIN "Order" o ON o."id" = oi1."orderId"
      WHERE oi1."productId" = ANY(${ids}::int[])
        AND oi2."productId" IS NOT NULL
        AND oi2."productId" != ALL(${ids}::int[])
        AND o."tenantId" = ${tenantId}
      GROUP BY oi2."productId", oi2."name", oi2."image", oi2."price", oi2."unit"
      ORDER BY freq DESC
      LIMIT ${limit}
    `;

    const results = coProducts.map((p) => ({
      id: p.productId,
      name: p.name,
      image: p.image,
      price: Number(p.price),
      unit: p.unit,
      frequency: Number(p.freq),
    }));

    return NextResponse.json(results);
  } catch (e) {
    logger.error("[co-purchased] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json([]);
  }
}
