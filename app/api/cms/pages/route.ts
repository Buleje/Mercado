import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getAllPages, createPage } from "@/lib/cms-db/pages";
import { PageSchema } from "@/lib/cms/types";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";

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
  const _rl = await applyRateLimit(req, "MODERATE", "cms-pages"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

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

    // F1: pasar auth.tenantId para aislamiento multi-tenant
    const page = await createPage(validated, auth.tenantId);

    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    logger.error("[cms/pages] POST error", { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Error al crear página" },
      { status: 500 }
    );
  }
}
