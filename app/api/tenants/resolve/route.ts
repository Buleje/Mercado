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
import { TenantsDB } from "@/lib/db/tenants.db";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug")?.trim();

    if (!slug) {
      return NextResponse.json({ error: "slug requerido" }, { status: 400 });
    }

    // Acepta tanto slug como id (un cliente podría pasar el CUID directamente).
    // `custom--<host>` no se resuelve acá (nunca lo hizo: daba 404).
    // Cacheado 60 s en TenantsDB, compartido con la portada `/t/<negocio>`.
    const encontrado = slug.startsWith("custom--") ? null : await TenantsDB.publicoPorSlugOId(slug);
    // Sólo los campos públicos de siempre (TenantsDB también trae ownerPhone).
    const tenant = encontrado
      ? {
          id: encontrado.id,
          slug: encontrado.slug,
          name: encontrado.name,
          plan: encontrado.plan,
          active: encontrado.active,
          // Branding público (usado por mapas live, headers white-label, etc.)
          logoUrl: encontrado.logoUrl,
          primaryColor: encontrado.primaryColor,
          secondaryColor: encontrado.secondaryColor,
          // Nicho de negocio — usado por AdminSidebar para filtrar módulos por vertical
          industry: encontrado.industry,
        }
      : null;

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
