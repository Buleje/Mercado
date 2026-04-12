import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { StorePageDB } from "@/lib/db/store-page.db";
import { logger } from "@/lib/logger";

interface Ctx {
  params: Promise<{ productId: string }>;
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { productId } = await params;
  const id = Number.parseInt(productId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "productId inválido" }, { status: 400 });
  }

  try {
    await StorePageDB.deleteOverride(auth.tenantId, id);
    logger.info("[store-page/overrides] deleted", {
      tenantId: auth.tenantId,
      productId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[store-page/overrides] DELETE error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Error al eliminar override" },
      { status: 503 },
    );
  }
}
