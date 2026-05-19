import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { VariantCatalogDb } from "@/lib/db/variant-catalog.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/variant-catalog?category=...
 * Lista los templates publicados del catálogo global del superadmin.
 * Read-only — los tenants no editan el catálogo.
 *
 * @global-catalog ok — Brandon 2026-05-16 (audit Info): este endpoint
 * intencionalmente NO scopea por tenantId. El VariantCatalog es un
 * recurso compartido cross-tenant (templates de variantes que el
 * superadmin curador mantiene). Todos los tenants leen el mismo
 * catálogo. Mutación solo desde /api/superadmin/* (no aquí).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const url = req.nextUrl;
  const category = url.searchParams.get("category") ?? undefined;

  try {
    const [templates, categories] = await Promise.all([
      VariantCatalogDb.listTemplates({ category, publishedOnly: true }),
      VariantCatalogDb.listCategories(),
    ]);
    return NextResponse.json({ templates, categories });
  } catch (error) {
    logger.error("admin.variant-catalog.list.failed", { error: String(error) });
    return NextResponse.json({ error: "No se pudo cargar el catálogo" }, { status: 500 });
  }
}
