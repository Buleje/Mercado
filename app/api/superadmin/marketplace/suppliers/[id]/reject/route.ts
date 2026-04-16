import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { SupplierSignupDB } from "@/lib/db/supplier-signup.db";
import { logActivity } from "@/lib/activity-logger";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { newTraceId, toErrorPayload } from "@/lib/api-error";

const RejectSchema = z.object({
  reason: z.string().min(5, "La razón debe tener al menos 5 caracteres").max(500),
});

/**
 * POST /api/superadmin/marketplace/suppliers/[id]/reject
 *
 * Superadmin-only. Rejects a pending supplier with a documented reason.
 * Fires-and-forgets a WhatsApp notification so the proveedor sabe por qué.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = newTraceId();

  const limited = applyRateLimit(req, "MODERATE", "sa-supplier-reject");
  if (limited) return limited;

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    const body = await req.json().catch((err) => { logger.error("[superadmin/marketplace/suppliers/[id]/reject] parse JSON body failed", { error: String(err) }); return null; });
    if (!body) {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const parsed = RejectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const supplier = await SupplierSignupDB.reject(
      id,
      auth.username,
      parsed.data.reason,
    );

    // ── Fire-and-forget: audit log + supplier notification ─────────────
    logActivity(
      "supplier_rejected",
      "Supplier",
      `Proveedor rechazado: ${supplier.razonSocial ?? supplier.name} — ${parsed.data.reason}`,
      supplier.id,
      auth.username,
      undefined,
      "__platform__",
    ).catch((err) => logger.error("[superadmin/marketplace/suppliers/[id]/reject] operation failed", { error: String(err) }));

    if (supplier.contactPhone) {
      const message =
        `❌ *Solicitud de proveedor rechazada*\n\n` +
        `Hola ${supplier.contactName ?? supplier.name},\n\n` +
        `Lamentablemente tu solicitud no fue aprobada en este momento.\n\n` +
        `Motivo: ${parsed.data.reason}\n\n` +
        `Si quieres volver a postular, contáctanos directamente.`;
      sendWhatsAppQueued(supplier.contactPhone, message, { tenantId: "__platform__", context: "supplier-reject-notify" }).catch(() => {});
    }

    return NextResponse.json({ ok: true, supplier });
  } catch (err) {
    if (err instanceof Error && err.message === "SUPPLIER_NOT_FOUND") {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 },
      );
    }
    logger.error("[supplier-reject] failed", {
      error: err instanceof Error ? err.message : String(err),
      traceId,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
