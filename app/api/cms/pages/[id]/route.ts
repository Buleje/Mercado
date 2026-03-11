export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { 
  getPageById, 
  updatePage, 
  deletePage
} from "@/lib/cms-db/pages";
import { PageSchema } from "@/lib/cms/types";
import { z } from "zod";

// ═══════════════════════════════════════════════════════
// GET /api/cms/pages/:id - Get single page
// ═══════════════════════════════════════════════════════
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const page = await getPageById(params.id);

    if (!page) {
      return NextResponse.json(
        { error: "Página no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(page);
  } catch (error) {
    console.error("[cms/pages/id] GET error:", error);
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
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const validated = PageSchema.partial().parse(body);

    const page = await updatePage(params.id, validated);

    return NextResponse.json(page);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.issues },
        { status: 400 }
      );
    }

    console.error("[cms/pages/id] PUT error:", error);
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
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    await deletePage(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[cms/pages/id] DELETE error:", error);
    return NextResponse.json(
      { error: "Error al eliminar página" },
      { status: 500 }
    );
  }
}
