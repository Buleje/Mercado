export const dynamic = 'force-dynamic';

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
import { z } from "zod";

// ═══════════════════════════════════════════════════════
// GET /api/cms/pages/:id/blocks - Get all blocks
// ═══════════════════════════════════════════════════════
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const blocks = await getPageBlocks(id);
    return NextResponse.json(blocks);
  } catch (error) {
    console.error("[cms/blocks] GET error:", error);
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
      const block = await duplicateBlock(body.blockId);
      return NextResponse.json(block);
    }

    // Create new block
    const validated = BlockSchema.parse(body);
    const block = await createBlock(id, validated);

    return NextResponse.json(block, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.issues },
        { status: 400 }
      );
    }

    console.error("[cms/blocks] POST error:", error);
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
  req: NextRequest
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

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
    const validated = BlockSchema.partial().parse(body);
    const block = await updateBlock(blockId, validated);

    return NextResponse.json(block);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.issues },
        { status: 400 }
      );
    }

    console.error("[cms/blocks] PUT error:", error);
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
  req: NextRequest
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const blockId = searchParams.get("blockId");

    if (!blockId) {
      return NextResponse.json(
        { error: "blockId requerido" },
        { status: 400 }
      );
    }

    await deleteBlock(blockId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[cms/blocks] DELETE error:", error);
    return NextResponse.json(
      { error: "Error al eliminar bloque" },
      { status: 500 }
    );
  }
}
