/**
 * GET /api/sunat/status/[id]
 *
 * Consulta el estado de un comprobante electrónico.
 * Si está en estado "pending" y tiene nubefactId, refresca desde Nubefact.
 *
 * Params: id = SunatInvoice.id (cuid)
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getInvoiceStatus } from "@/lib/sunat/nubefact-client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  const { id } = await params;

  try {
    const invoice = await prisma.sunatInvoice.findFirst({
      where: { id, tenantId },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Comprobante no encontrado." },
        { status: 404 }
      );
    }

    // Si está pending y tiene ID en Nubefact, refrescar estado
    if (invoice.sunatStatus === "pending" && invoice.nubefactId) {
      try {
        const nubefactResponse = await getInvoiceStatus(tenantId, invoice.nubefactId);
        const sunatStatus = nubefactResponse.sunat_accepted ? "accepted" : "rejected";

        const updated = await prisma.sunatInvoice.update({
          where: { id: invoice.id },
          data: {
            sunatStatus,
            pdfUrl: nubefactResponse.enlace_del_pdf ?? invoice.pdfUrl,
            cdrResponse: nubefactResponse.cdr_base_64_encoded ?? invoice.cdrResponse,
            errorMessage:
              sunatStatus === "rejected"
                ? (nubefactResponse.sunat_description ?? "Rechazado por SUNAT")
                : null,
            acceptedAt:
              sunatStatus === "accepted" && !invoice.acceptedAt ? new Date() : invoice.acceptedAt,
          },
        });

        return NextResponse.json({ invoice: updated });
      } catch (refreshErr) {
        // Si falla el refresh, devolvemos el estado guardado sin error
        logger.warn("[SUNAT status] No se pudo refrescar desde Nubefact", {
          invoiceId: id,
          error:
            refreshErr instanceof Error ? refreshErr.message : String(refreshErr),
        });
      }
    }

    return NextResponse.json({ invoice });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[SUNAT status] Error", { id, tenantId, error: message });
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
