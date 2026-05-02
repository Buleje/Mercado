import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { VariantCatalogDb } from "@/lib/db/variant-catalog.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/variant-catalog?category=...
 * Lista los templates publicados del catálogo global del superadmin.
 * Read-only — los tenants no editan el catálogo.
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
