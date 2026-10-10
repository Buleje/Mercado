import { NextRequest, NextResponse } from "next/server";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { requireAdmin } from "@/lib/require-admin";
import { CmsPagesDB } from "@/lib/db/cms-pages.db";
import { BlockSchema } from "@/lib/cms/types";
import { z } from "zod";

// Sin el default de `visible`: guardar sólo las props no debe volver a mostrar un bloque oculto.
const OrdenSchema = z.array(z.object({ id: z.string().min(1), order: z.number().int().min(0) })).max(200);

const BlockUpdateSchema = BlockSchema.extend({ visible: z.boolean() }).partial();
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
    const blocks = await CmsPagesDB.listarBloques(auth.tenantId, id);
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
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  const { id } = await params;
  try {
    const body = await req.json();
    
    // Handle special actions
    if (body.action === "reorder") {
      const orden = OrdenSchema.safeParse(body.blockOrders);
      if (!orden.success) return NextResponse.json({ error: "Orden inválido" }, { status: 400 });
      const blocks = await CmsPagesDB.reordenarBloques(auth.tenantId, id, orden.data);
      if (!blocks) return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
      return NextResponse.json(blocks);
    }

    if (body.action === "duplicate") {
      if (typeof body.blockId !== "string") return NextResponse.json({ error: "blockId requerido" }, { status: 400 });
      const block = await CmsPagesDB.duplicarBloque(auth.tenantId, id, body.blockId);
      if (!block) return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
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
    const block = await CmsPagesDB.crearBloque(auth.tenantId, id, validated);
    if (!block) return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });

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
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

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
    const parsed = BlockUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }
    const validated = parsed.data;
    const block = await CmsPagesDB.actualizarBloque(auth.tenantId, pageId, blockId, validated);
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

    const result = await CmsPagesDB.eliminarBloque(auth.tenantId, pageId, blockId);
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
