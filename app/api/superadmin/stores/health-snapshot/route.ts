import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/stores/health-snapshot?tenantId=X
 *
 * Devuelve el estado actual TODOS los campos de salud de un tenant en
 * un solo objeto plano para que el modal "Rellenar datos" los pueda
 * editar en bloque.
 */

export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "missing_tenantId" }, { status: 400 });
  }

  try {
    const [tenant, store, settings] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          slug: true,
          name: true,
          logoUrl: true,
          ownerPhone: true,
          ownerEmail: true,
          emailVerified: true,
        },
      }),
      prisma.store.findFirst({
        where: { tenantId },
        select: {
          id: true,
          slug: true,
          logo: true,
          banner: true,
          description: true,
          isPublished: true,
          zone: true,
          lat: true,
          lng: true,
        },
      }),
      prisma.settings.findUnique({
        where: { tenantId },
        select: {
          businessName: true,
          businessPhone: true,
          businessAddress: true,
          businessEmail: true,
          businessLat: true,
          businessLon: true,
          razonSocial: true,
          ruc: true,
          hours: true,
          deliveryZone: true,
          description: true,
          yapeEnabled: true,
          yapePhone: true,
          yapeName: true,
          cashEnabled: true,
        },
      }),
    ]);

    if (!tenant) {
      return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        logoUrl: tenant.logoUrl,
        ownerPhone: tenant.ownerPhone,
        ownerEmail: tenant.ownerEmail,
        emailVerified: tenant.emailVerified,
      },
      store: store
        ? {
            id: store.id,
            slug: store.slug,
            logo: store.logo,
            banner: store.banner,
            description: store.description,
            isPublished: store.isPublished,
            zone: store.zone,
            lat: store.lat,
            lng: store.lng,
          }
        : null,
      settings: settings ?? null,
    });
  } catch (err) {
    logger.error("[health-snapshot]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
