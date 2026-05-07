/**
 * GET  /api/sunat/invoices/[id]  — Detalle de un comprobante
 * POST /api/sunat/invoices/[id]  — Reintento manual de un comprobante rejected
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { SunatDB } from "@/lib/db/sunat.db";
import { retryInvoice } from "@/lib/sunat/invoice-worker";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { applyRateLimit } from "@/lib/rate-limit";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  const { id } = await params;

  try {
    const invoice = await SunatDB.getInvoiceById(tenantId, id);
    if (!invoice) {
      return NextResponse.json(
        { error: "Comprobante no encontrado." },
        { status: 404 }
      );
    }
    return NextResponse.json({ invoice });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[SUNAT invoice GET] Error", { tenantId, invoiceId: id, error: message });
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const _rl = await applyRateLimit(req, "MODERATE", "sunat-invoices-X"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  const { id } = await params;

  try {
    const invoice = await SunatDB.getInvoiceById(tenantId, id);
    if (!invoice) {
      return NextResponse.json(
        { error: "Comprobante no encontrado." },
        { status: 404 }
      );
    }

    if (invoice.sunatStatus === "accepted") {
      return NextResponse.json(
        { error: "El comprobante ya fue aceptado por SUNAT. No requiere reintento." },
        { status: 409 }
      );
    }

    if (invoice.sunatStatus === "voided") {
      return NextResponse.json(
        { error: "El comprobante está anulado y no puede reintentarse." },
        { status: 409 }
      );
    }

    await retryInvoice(tenantId, id);

    // Releer estado actualizado
    const updated = await SunatDB.getInvoiceById(tenantId, id);

    logActivity(
      "sunat_retry_manual",
      "SunatInvoice",
      `reintento manual status=${updated?.sunatStatus ?? "unknown"}`,
      id,
      auth.username,
    ).catch(() => {});

    return NextResponse.json({
      message: "Reintento ejecutado.",
      invoice: updated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[SUNAT invoice retry] Error", { tenantId, invoiceId: id, error: message });
    return NextResponse.json(
      { error: `Error al reintentar: ${message}` },
      { status: 502 }
    );
  }
}
