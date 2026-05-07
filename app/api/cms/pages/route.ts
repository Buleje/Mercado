import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getAllPages, createPage } from "@/lib/cms-db/pages";
import { PageSchema } from "@/lib/cms/types";
import { logger } from "@/lib/logger";

// ═══════════════════════════════════════════════════════
// GET /api/cms/pages - List all pages
// ═══════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  // SECURITY 2026-05-06 (audit CMS #4): rol explícito.
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const pages = await getAllPages(auth.tenantId);
    return NextResponse.json(pages);
  } catch (error) {
    logger.error("[cms/pages] GET error", { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Error al obtener páginas" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════
// POST /api/cms/pages - Create new page
// ═══════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = PageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }
    const validated = parsed.data;

    const page = await createPage(validated);

    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    logger.error("[cms/pages] POST error", { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Error al crear página" },
      { status: 500 }
    );
  }
}
