/**
 * GET /api/tenants/resolve?slug=foo
 *
 * Resuelve un slug de tenant a su CUID canónico + metadatos básicos.
 * Usado por `contexts/tenant-context.tsx` para conocer el tenantId real
 * (no el slug) a partir de la URL/cookie/sesión.
 *
 * Endpoint público — solo expone campos no sensibles (id, slug, name, plan).
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug")?.trim();

    if (!slug) {
      return NextResponse.json({ error: "slug requerido" }, { status: 400 });
    }

    // Acepta tanto slug como id (un cliente podría pasar el CUID directamente).
    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ slug }, { id: slug }] },
      select: {
        id: true,
        slug: true,
        name: true,
        plan: true,
        active: true,
        // Branding público (usado por mapas live, headers white-label, etc.)
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        // Nicho de negocio — usado por AdminSidebar para filtrar módulos por vertical
        industry: true,
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "tenant no encontrado" }, { status: 404 });
    }

    if (!tenant.active) {
      return NextResponse.json({ error: "tenant inactivo" }, { status: 403 });
    }

    return NextResponse.json(tenant, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    logger.error("[tenants/resolve] GET error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
