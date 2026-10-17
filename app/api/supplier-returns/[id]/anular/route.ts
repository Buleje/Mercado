import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { revalidateTenantTag } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { anularSupplierReturn, DevolucionAnuladaError } from "@/lib/db/supplier-returns-anular.db";

const Body = z.object({
  motivo: z.string().trim().min(3).max(300),
  // Sólo pesa si la mercadería ya había salido (ENVIADA o RESUELTA): ¿volvió?
  volvioAlAlmacen: z.boolean(),
});

/**
 * POST /api/supplier-returns/[id]/anular — reemplaza al borrado (C55, 17-10).
 * La devolución queda con estado ANULADA, el motivo, quién y cuándo. Sólo el
 * dueño o el administrador: deshace una salida de stock.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = applyRateLimit(req, "MODERATE", "supplier-returns-anular"); if (_rl) return _rl;
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;
    const blocked = await requireActiveSubscription(auth.tenantId);
    if (blocked) return blocked;

    const { id } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Escribe por qué la anulas (mínimo 3 letras)." }, { status: 400 });

    const r = await anularSupplierReturn(auth.tenantId, id, { ...parsed.data, usuario: auth.username });
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // La mercadería volvió: el inventario cambió por fuera de ProductsDB.
    if (parsed.data.volvioAlAlmacen) revalidateTenantTag(auth.tenantId, "products");
    return NextResponse.json({ ...r.devolucion, avisos: r.avisos });
  } catch (e) {
    if (e instanceof DevolucionAnuladaError) return NextResponse.json({ error: e.message }, { status: 409 });
    logger.error("[supplier-returns] anular error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo anular la devolución." }, { status: 500 });
  }
}
