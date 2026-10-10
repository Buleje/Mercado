import { NextRequest, NextResponse } from "next/server";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { requireAdmin } from "@/lib/require-admin";
import { CmsPagesDB } from "@/lib/db/cms-pages.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

// ═══════════════════════════════════════════════════════
// POST /api/cms/pages/:id/publish - Publish page
// ═══════════════════════════════════════════════════════
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "cms-pages-X-publish"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  /* Publicar expone la página: con la suscripción vencida no, igual que crear y editar.
     Despublicar sí se permite (reduce lo que queda a la vista). */
  const blocked = await requireActiveSubscription(auth.tenantId);
  if (blocked) return blocked;

  const { id } = await params;
  try {
    const page = await CmsPagesDB.publicar(auth.tenantId, id);
    if (!page) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }
    return NextResponse.json(page);
  } catch (error) {
    logger.error("[cms/pages/publish] error", { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Error al publicar página" },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════════════════════
// DELETE /api/cms/pages/:id/publish - Despublicar (vuelve a borrador)
// ═══════════════════════════════════════════════════════
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "cms-pages-X-publish"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const page = await CmsPagesDB.despublicar(auth.tenantId, id);
    if (!page) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }
    return NextResponse.json(page);
  } catch (error) {
    logger.error("[cms/pages/publish] DELETE error", { err: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Error al despublicar página" },
      { status: 500 }
    );
  }
}
