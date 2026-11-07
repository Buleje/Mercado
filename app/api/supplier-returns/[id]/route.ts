import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { revalidateTenantTag } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { ESTADOS, getSupplierReturnById, updateSupplierReturnEstado } from "@/lib/db/supplier-returns-by-id.db";
import { DevolucionAnuladaError, valorarItemsSupplierReturn } from "@/lib/db/supplier-returns-anular.db";

// Round 21 P0 (Security): const TENANT="main" hardcoded reemplazado por
// auth.tenantId. PATCH respeta multi-tenant correctamente.
//
// 17-10 (auditoría Compras C53): marcar ENVIADA ya NO le manda un WhatsApp al
// proveedor por su cuenta. Salía sin que nadie revisara el texto ni el número
// (y con el id técnico de la devolución). Ahora la pantalla prepara el mensaje,
// muestra el destinatario y lo manda la persona.

const PatchSchema = z.union([
  z.object({ estado: z.enum(ESTADOS) }),
  // C51: ponerle costo a lo que quedó «pendiente de valoración».
  z.object({
    valorar: z.array(z.object({ itemId: z.number().int().positive(), precioUnitario: z.number().min(0).max(1_000_000) })).min(1).max(100),
  }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "supplier-returns-X"); if (_rl) return _rl;
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero"]);
    if (auth instanceof NextResponse) return auth;
    const blocked = await requireActiveSubscription(auth.tenantId);
    if (blocked) return blocked;

    const { id } = await params;
    const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Estado inválido o datos incompletos." }, { status: 400 });

    if ("valorar" in parsed.data) {
      const r = await valorarItemsSupplierReturn(auth.tenantId, id, parsed.data.valorar);
      if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ...r.devolucion, valorados: r.valorados });
    }

    const record = await getSupplierReturnById(auth.tenantId, id);
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const resultado = await updateSupplierReturnEstado(auth.tenantId, id, parsed.data.estado);
    if (!resultado) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { devolucion, avisos } = resultado;

    // ADR-379: al marcar ENVIADA la mercadería salió del stock, y ese write va
    // por `tx.product.update` fuera de ProductsDB — la invalidación corre por
    // cuenta del endpoint o el Inventario sigue mostrando lo que ya no está.
    if (devolucion.stockAplicadoAt) {
      revalidateTenantTag(auth.tenantId, "products");
    }

    // `avisos` viaja al cliente para que la pantalla pueda decir qué NO se
    // descontó (ítems a mano, productos sin control de stock, saldos negativos).
    return NextResponse.json({ ...devolucion, avisos });
  } catch (e) {
    if (e instanceof DevolucionAnuladaError) return NextResponse.json({ error: e.message }, { status: 409 });
    logger.error("[supplier-returns] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

/**
 * C55 (17-10): las devoluciones ya no se borran. El borrado se llevaba el
 * registro y devolvía al inventario lo que quizá seguía en el proveedor; ahora
 * se anula (`POST /api/supplier-returns/[id]/anular`) y el original queda.
 */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(
    { error: "Las devoluciones ya no se borran: anúlala y queda el registro con el motivo." },
    { status: 409 },
  );
}
