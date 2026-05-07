import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  getPageBlocks,
  createBlock,
  updateBlock,
  deleteBlock,
  reorderBlocks,
  duplicateBlock,
} from "@/lib/cms-db/pages";
import { BlockSchema } from "@/lib/cms/types";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// ═══════════════════════════════════════════════════════
// GET /api/cms/pages/:id/blocks - Get all blocks
// ═══════════════════════════════════════════════════════
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // SECURITY 2026-05-06 (audit CMS #4): exigir rol explícito. Antes
  // requireAdmin sin allowlist permitía a cualquier rol (almacenero, cajero)
  // listar/editar páginas CMS.
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const blocks = await getPageBlocks(id);
    return NextResponse.json(blocks);
  } catch (error) {
    logger.error("[cms/blocks] GET error", { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Error al obtener bloques" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════
// POST /api/cms/pages/:id/blocks - Create block
// ═══════════════════════════════════════════════════════
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "cms-pages-X-blocks"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const body = await req.json();
    
    // Handle special actions
    if (body.action === "reorder") {
      const blocks = await reorderBlocks(id, body.blockOrders);
      return NextResponse.json(blocks);
    }

    if (body.action === "duplicate") {
      const block = await duplicateBlock(body.blockId, id);
      return NextResponse.json(block);
    }

    // Create new block
    const parsed = BlockSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }
    const validated = parsed.data;
    const block = await createBlock(id, validated);

    return NextResponse.json(block, { status: 201 });
  } catch (error) {
    logger.error("[cms/blocks] POST error", { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Error al crear bloque" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════
// PUT /api/cms/pages/:id/blocks/:blockId - Update block
// ═══════════════════════════════════════════════════════
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "cms-pages-X-blocks"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id: pageId } = await params;

  try {
    const { searchParams } = new URL(req.url);
    const blockId = searchParams.get("blockId");

    if (!blockId) {
      return NextResponse.json(
        { error: "blockId requerido" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const parsed = BlockSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }
    const validated = parsed.data;
    // F2: pasar pageId + tenantId para prevenir IDOR cross-tenant
    const block = await updateBlock(pageId, blockId, validated, auth.tenantId);
    if (!block) {
      return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
    }

    return NextResponse.json(block);
  } catch (error) {
    logger.error("[cms/blocks] PUT error", { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Error al actualizar bloque" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════
// DELETE /api/cms/pages/:id/blocks/:blockId - Delete block
// ═══════════════════════════════════════════════════════
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "cms-pages-X-blocks"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id: pageId } = await params;

  try {
    const { searchParams } = new URL(req.url);
    const blockId = searchParams.get("blockId");

    if (!blockId) {
      return NextResponse.json(
        { error: "blockId requerido" },
        { status: 400 }
      );
    }

    // F2: pasar pageId + tenantId para prevenir IDOR cross-tenant
    const result = await deleteBlock(pageId, blockId, auth.tenantId);
    if (!result) {
      return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[cms/blocks] DELETE error", { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Error al eliminar bloque" },
      { status: 500 }
    );
  }
}
