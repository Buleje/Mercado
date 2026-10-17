import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { InventoryConteoItemsDB } from "@/lib/db/inventory-conteo-items.db";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { clearConteoLock } from "@/app/api/inventory/conteo/route";

// POST — Cerrar conteo y aplicar ajustes
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _rl = await applyRateLimit(req, "MODERATE", "inventory-conteo-X-close"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    // Stock, kardex, cierre e invalidación del Inventario: todo en la DB class.
    const cierre = await InventoryConteoItemsDB.cerrar(auth.tenantId, id, auth.username);

    if (!cierre.ok) {
      return cierre.motivo === "no_encontrado"
        ? NextResponse.json({ error: "Conteo no encontrado" }, { status: 404 })
        : NextResponse.json({ error: "El conteo ya está cerrado" }, { status: 400 });
    }

    // F6: Liberar lock de conteo activo
    await clearConteoLock(auth.tenantId);

    logAudit({
      req,
      action: "UPDATE",
      entity: "Inventory",
      entityId: id,
      detail: `Conteo físico cerrado: ${cierre.resumen.ajustados} ajustes de stock de ${cierre.resumen.contados} productos contados`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json({
      message: "Conteo cerrado exitosamente",
      resumen: cierre.resumen,
    });
  } catch (e) {
    logger.error("[conteo/close/POST]", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al cerrar conteo" }, { status: 500 });
  }
}
