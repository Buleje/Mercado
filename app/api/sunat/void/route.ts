/**
 * POST /api/sunat/void
 *
 * Comunica la baja (anulación) de un comprobante electrónico a SUNAT vía Nubefact.
 * Solo se puede anular un comprobante en estado "accepted".
 *
 * Body: { invoiceId, motivo }
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { voidInvoice } from "@/lib/sunat/nubefact-client";
import { buildBaja } from "@/lib/sunat/invoice-builder";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { runWithAuditContext } from "@/lib/audit/audit-context";

// ── Validación ────────────────────────────────────────────────────────────────

const VoidSchema = z.object({
  invoiceId: z.string().min(1),
  motivo: z.string().min(5).max(500),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "sunat-void"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;
  const blocked = await requireActiveSubscription(tenantId);
  if (blocked) return blocked;

  // Round 17 M004: SUNAT void → afecta SunatInvoice (PII fiscal). Audit con
  // admin actor + IP. Operación crítica reversible solo cancelando sustituto.
  return runWithAuditContext(req, auth.username, () => voidHandler(req, auth));
}

async function voidHandler(
  req: NextRequest,
  auth: { tenantId: string; username: string },
): Promise<NextResponse> {
  const { tenantId } = auth;
  const rawBody = await req.json().catch((err) => { logger.warn("[security] op failed", { err: String(err) }); return null; });
  const parsed = VoidSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { invoiceId, motivo } = parsed.data;

  try {
    const invoice = await prisma.sunatInvoice.findFirst({
      where: { id: invoiceId, tenantId },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Comprobante no encontrado." },
        { status: 404 }
      );
    }

    if (invoice.sunatStatus !== "accepted") {
      return NextResponse.json(
        {
          error: `Solo se puede anular un comprobante aceptado. Estado actual: "${invoice.sunatStatus}".`,
        },
        { status: 409 }
      );
    }

    if (invoice.type === "baja") {
      return NextResponse.json(
        { error: "Este comprobante ya es una comunicación de baja." },
        { status: 409 }
      );
    }

    // Determinar tipo para Nubefact: 1=factura, 2=boleta
    const tipoNubefact: 1 | 2 = invoice.type === "factura" ? 1 : 2;

    const bajaPayload = buildBaja(
      tipoNubefact,
      invoice.series,
      invoice.number,
      motivo,
    );

    // Enviar comunicación de baja a Nubefact
    let nubefactResponse;
    try {
      nubefactResponse = await voidInvoice(tenantId, bajaPayload);
    } catch (sendErr) {
      const errorMessage =
        sendErr instanceof Error ? sendErr.message : String(sendErr);

      logger.error("[SUNAT void] Error al enviar baja a Nubefact", {
        invoiceId,
        error: errorMessage,
      });

      return NextResponse.json(
        { error: `Error al comunicar la baja: ${errorMessage}` },
        { status: 502 }
      );
    }

    // Marcar como anulado
    const updated = await prisma.sunatInvoice.update({
      where: { id: invoice.id },
      data: {
        sunatStatus: "voided",
        errorMessage: motivo,
        cdrResponse: nubefactResponse.cdr_base_64_encoded ?? null,
      },
    });

    // Audit trail fire-and-forget
    logActivity(
      "sunat_void",
      "SunatInvoice",
      `baja ${invoice.series}-${String(invoice.number).padStart(8, "0")} motivo="${motivo}"`,
      invoice.id,
      auth.username,
    ).catch((err) => logger.warn("[security] op failed", { err: String(err) }));

    return NextResponse.json({
      invoiceId: updated.id,
      series: updated.series,
      number: updated.number,
      status: updated.sunatStatus,
      sunatAccepted: nubefactResponse.sunat_accepted,
      sunatDescription: nubefactResponse.sunat_description ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[SUNAT void] Error inesperado", {
      invoiceId,
      tenantId,
      error: message,
    });
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
