import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StorePageDB } from "@/lib/db/store-page.db";
import { logger } from "@/lib/logger";

interface Ctx {
  params: Promise<{ slug: string }>;
}

/**
 * Public endpoint — devuelve todo lo necesario para renderizar la página
 * individual de un tenant por su slug. No requiere auth. Sirve para SSR
 * desde /t/[slug]/page.tsx y también es consumible por clientes externos.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { slug } = await params;

  try {
    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ id: slug }, { slug }] },
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        active: true,
        ownerPhone: true,
        logoUrl: true,
        primaryColor: true,
      },
    });

    if (!tenant || !tenant.active) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const [customization, featured, promotions, exclusiveCount] =
      await Promise.all([
        StorePageDB.getCustomization(tenant.id),
        StorePageDB.listPublicFeatured(tenant.id, 24),
        StorePageDB.listPromotions(tenant.id, true),
        StorePageDB.countActiveExclusivePrices(tenant.id),
      ]);

    if (!customization.published) {
      return NextResponse.json({ error: "unpublished" }, { status: 404 });
    }

    return NextResponse.json(
      {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          plan: tenant.plan,
          logoUrl: tenant.logoUrl,
          primaryColor: tenant.primaryColor,
          ownerPhone: tenant.ownerPhone,
        },
        customization,
        featured,
        promotions,
        exclusiveCount,
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (e) {
    logger.error("[store-page/public] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "server_error" }, { status: 503 });
  }
}
