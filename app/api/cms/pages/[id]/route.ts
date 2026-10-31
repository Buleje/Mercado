import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { CmsPagesDB } from "@/lib/db/cms-pages.db";
import { PageSchema } from "@/lib/cms/types";
import { z } from "zod";

// `.partial()` de Zod 4 aplica los `.default()`: un PUT con sólo el título
// devolvía la página a borrador. Sin defaults, lo que no viene no se toca.
const PageUpdateSchema = PageSchema.extend({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  layout: z.string(),
}).partial();
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";

// ═══════════════════════════════════════════════════════
// GET /api/cms/pages/:id - Get single page
// ═══════════════════════════════════════════════════════
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // SECURITY 2026-05-06 (audit CMS #4): rol explícito.
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const page = await CmsPagesDB.porId(auth.tenantId, id);

    if (!page) {
      return NextResponse.json(
        { error: "Página no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(page);
  } catch (error) {
    logger.error("[cms/pages/id] GET error", { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Error al obtener página" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════
// PUT /api/cms/pages/:id - Update page
// ═══════════════════════════════════════════════════════
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "cms-pages-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  const { id } = await params;
  try {
    const body = await req.json();
    const parsed = PageUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }
    const validated = parsed.data;

    const page = await CmsPagesDB.actualizar(auth.tenantId, id, validated);
    if (!page) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }

    return NextResponse.json(page);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Ya tienes una página con ese enlace" }, { status: 409 });
    }
    logger.error("[cms/pages/id] PUT error", { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Error al actualizar página" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════
// DELETE /api/cms/pages/:id - Delete page
// ═══════════════════════════════════════════════════════
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "cms-pages-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const deleted = await CmsPagesDB.eliminar(auth.tenantId, id);
    if (!deleted) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[cms/pages/id] DELETE error", { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Error al eliminar página" },
      { status: 500 }
    );
  }
}
