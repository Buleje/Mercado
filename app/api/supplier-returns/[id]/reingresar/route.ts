import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { revalidateTenantTag } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { NadaQueReingresarError, reingresarSupplierReturn } from "@/lib/db/supplier-returns-anular.db";

/**
 * POST /api/supplier-returns/[id]/reingresar — una devolución anulada cuya
 * mercadería seguía en el proveedor: volvió al almacén y regresa al inventario
 * (C55, 17-10). Dos clics no suman dos veces (compara-y-cambia en la DB).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = applyRateLimit(req, "MODERATE", "supplier-returns-reingresar"); if (_rl) return _rl;
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;
    const blocked = await requireActiveSubscription(auth.tenantId);
    if (blocked) return blocked;

    const { id } = await params;
    const r = await reingresarSupplierReturn(auth.tenantId, id, auth.username);
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
    revalidateTenantTag(auth.tenantId, "products");
    return NextResponse.json({ ...r.devolucion, avisos: r.avisos });
  } catch (e) {
    if (e instanceof NadaQueReingresarError) return NextResponse.json({ error: e.message }, { status: 409 });
    logger.error("[supplier-returns] reingresar error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo devolver al inventario." }, { status: 500 });
  }
}
