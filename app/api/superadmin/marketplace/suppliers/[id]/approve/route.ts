import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { validateSuperadminCsrf, csrfForbiddenResponse } from "@/lib/csrf";
import { SupplierSignupDB } from "@/lib/db/supplier-signup.db";
import { logActivity } from "@/lib/activity-logger";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { newTraceId, toErrorPayload } from "@/lib/api-error";

/**
 * POST /api/superadmin/marketplace/suppliers/[id]/approve
 *
 * Superadmin-only. Approves a pending supplier:
 *   - Flips status → "approved"
 *   - Generates a fresh API key on the SupplierPortal
 *   - Stamps approvedAt + approvedBy
 *
 * Returns the supplier row including the API key **ONE TIME**. Subsequent
 * reads never expose the key — superadmin must reset/regenerate if lost.
 *
 * Fires-and-forgets a WhatsApp notification to the supplier contact phone.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = newTraceId();

  const limited = applyRateLimit(req, "MODERATE", "sa-supplier-approve");
  if (limited) return limited;

  // P0 fix 2026-05-24: CSRF estricto — emite apiKey + crea tenant supplier
  if (!validateSuperadminCsrf(req)) return csrfForbiddenResponse();

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    const supplier = await SupplierSignupDB.approve(id, auth.username);

    // ── Fire-and-forget: activity log + supplier notification ──────────
    logActivity(
      "supplier_approved",
      "Supplier",
      `Proveedor aprobado: ${supplier.razonSocial ?? supplier.name} (RUC ${supplier.ruc ?? "n/a"})`,
      supplier.id,
      auth.username,
      undefined,
      "__platform__",
    ).catch((err) => logger.error("[superadmin/marketplace/suppliers/[id]/approve] operation failed", { error: String(err) }));

    if (supplier.contactPhone) {
      // SECURITY 2026-05-24 (Ola 1.4): la API key NUNCA viaja por WhatsApp —
      // el mensaje queda persistido en el historial del chat del proveedor y
      // de cualquiera con acceso a ese teléfono = fuga de credencial. La key
      // se entrega solo en el panel superadmin (one-time, response inline).
      // El equipo Buleje se la pasa al proveedor por un canal seguro.
      const message =
        `✅ *¡Tu solicitud fue aprobada!*\n\n` +
        `Hola ${supplier.contactName ?? supplier.name},\n\n` +
        `Ya eres parte de la red de proveedores de Buleje.\n\n` +
        `Nuestro equipo se contactará para entregarte tus credenciales de ` +
        `acceso de forma segura. Por tu seguridad, no enviamos claves por WhatsApp.\n\n` +
        `Documentación: https://buleje.pe/supplier/docs\n` +
        `Panel: https://buleje.pe/supplier/dashboard`;
      sendWhatsAppQueued(supplier.contactPhone, message, { tenantId: "__platform__", context: "supplier-approve-notify" }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });
    }

    return NextResponse.json({
      ok: true,
      supplier,
      apiKey: supplier.apiKey, // shown ONLY in this response
      notice:
        "Copia el apiKey AHORA — no volverá a mostrarse en claro. Si se pierde, genera uno nuevo.",
    });
  } catch (err) {
    if (err instanceof Error && err.message === "SUPPLIER_NOT_FOUND") {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 },
      );
    }
    logger.error("[supplier-approve] failed", {
      error: err instanceof Error ? err.message : String(err),
      traceId,
    });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
