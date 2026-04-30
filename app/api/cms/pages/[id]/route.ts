import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { 
  getPageById, 
  updatePage, 
  deletePage
} from "@/lib/cms-db/pages";
import { PageSchema } from "@/lib/cms/types";
import { logger } from "@/lib/logger";

// ═══════════════════════════════════════════════════════
// GET /api/cms/pages/:id - Get single page
// ═══════════════════════════════════════════════════════
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const page = await getPageById(id);

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
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const body = await req.json();
    const parsed = PageSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }
    const validated = parsed.data;

    const page = await updatePage(id, validated);

    return NextResponse.json(page);
  } catch (error) {
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
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    await deletePage(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[cms/pages/id] DELETE error", { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Error al eliminar página" },
      { status: 500 }
    );
  }
}
