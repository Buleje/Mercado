import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

/**
 * GET /api/superadmin/tenants/[slug]/products
 * Returns products list for a specific tenant (superadmin only).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const session = await requirePlatform(req);
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { slug } = await params;

    // Find tenant by slug or id
    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ slug }, { id: slug }] },
      select: { id: true, slug: true, name: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const products = await prisma.product.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      select: {
        id: true,
        name: true,
        barcode: true,
        price: true,
        costPrice: true,
        stock: true,
        category: true,
        unit: true,
        image: true,
        active: true,
      },
      orderBy: { name: "asc" },
      take: 500,
    });

    return NextResponse.json({
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      products: products.map((p) => ({
        ...p,
        price: p.price ? Number(p.price) : 0,
        barcode: p.barcode ?? null,
      })),
      total: products.length,
    });
  } catch (error) {
    logger.error("[superadmin/tenants/products] Error cargando productos", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Error server loading products" },
      { status: 500 }
    );
  }
}
