import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import {
  ESTADOS,
  getSupplierReturnById,
  updateSupplierReturnEstado,
  deleteSupplierReturn,
  getSupplierPhone,
} from "@/lib/db/supplier-returns-by-id.db";

// Round 21 P0 (Security): const TENANT="main" hardcoded reemplazado por
// auth.tenantId. PATCH/DELETE ahora respetan multi-tenant correctamente.

/** Fire-and-forget WhatsApp al proveedor cuando se marca ENVIADA */
function notifySupplierWhatsApp(
  proveedorId: string | null,
  proveedorNombre: string,
  returnId: string,
  itemCount: number,
): void {
  if (!proveedorId) return;
  const apiUrl = process.env.WHATSAPP_API_URL;
  const apiToken = process.env.WHATSAPP_API_TOKEN;
  if (!apiUrl || !apiToken) return;

  getSupplierPhone(proveedorId)
    .then((phone) => {
      if (!phone) return;
      const digits = phone.replace(/\D/g, "");
      const formattedPhone = digits.length === 9 ? `51${digits}` : digits;
      const message =
        `🔄 *Buleje — Devolución enviada*\n\n` +
        `Estimado proveedor *${proveedorNombre}*,\n` +
        `le informamos que hemos enviado una devolución (ID: ...${returnId.slice(-6)}) ` +
        `con *${itemCount} producto(s)*.\n\n` +
        `Por favor confirmar recepción.\n_— Buleje_`;
      fetch(apiUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formattedPhone, message }),
      }).catch((e) => logger.error("[supplier-returns] WhatsApp send error", { err: String(e) }));
    })
    .catch((err: unknown) => logger.warn("[supplier-returns] notifySupplierWhatsApp lookup failed", { err: String(err) }));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "supplier-returns-X"); if (_rl) return _rl;
  try {
    const auth = await requireAdmin(req, ["admin", "almacenero"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const body = await req.json();

    const record = await getSupplierReturnById(auth.tenantId, id);
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.estado && !ESTADOS.includes(body.estado)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }

    if (!body.estado) {
      return NextResponse.json({ error: "Estado requerido" }, { status: 400 });
    }

    const updated = await updateSupplierReturnEstado(auth.tenantId, id, body.estado);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Notificar al proveedor por WhatsApp cuando se marca como ENVIADA
    if (body.estado === "ENVIADA" && record.estado !== "ENVIADA") {
      notifySupplierWhatsApp(
        record.proveedorId,
        record.proveedorNombre,
        id,
        record.items.length,
      );
    }

    return NextResponse.json(updated);
  } catch (e) {
    logger.error("[supplier-returns] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = await applyRateLimit(req, "MODERATE", "supplier-returns-X"); if (_rl) return _rl;
  try {
    const auth = await requireAdmin(req, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const deleted = await deleteSupplierReturn(auth.tenantId, id);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[supplier-returns] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
