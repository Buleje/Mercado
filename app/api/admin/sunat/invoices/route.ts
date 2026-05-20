import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { SunatDB } from "@/lib/db/sunat.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";

// Brandon 2026-05-16 (audit Info): force-dynamic obligatorio — query
// params + cookies (requireAdmin) + queries en tiempo real.

/**
 * GET /api/admin/sunat/invoices — listar comprobantes emitidos.
 *
 * @cajero ok — Brandon 2026-05-16 (audit Info): el cajero necesita ver
 * los comprobantes que él mismo emite durante su turno para reimprimirlos
 * o verificar el estado SUNAT (pendiente/aceptado/rechazado). Es legítimo
 * para su flujo de caja, no expone PII de clientes (solo nombres y RUC
 * para boletas/facturas).
 */
export async function GET(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "MODERATE", "sunat-invoices");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
    const tipo = url.searchParams.get("tipo"); // boleta | factura
    const status = url.searchParams.get("status"); // pending | accepted | rejected | voided

    const { invoices, total } = await SunatDB.listInvoices(auth.tenantId, {
      ...(tipo && { type: tipo }),
      ...(status && { status: status as import("@/lib/db/sunat.db").SunatInvoiceStatus }),
      limit,
      offset: (page - 1) * limit,
    });

    const res = NextResponse.json({
      data: invoices.map((inv) => ({
        id: inv.id,
        orderId: inv.orderId,
        type: inv.type,
        series: inv.series,
        number: inv.number,
        customerName: inv.customerName,
        customerRuc: inv.customerRuc,
        subtotal: inv.subtotal,
        igv: inv.igv,
        total: inv.total,
        sunatStatus: inv.sunatStatus,
        pdfUrl: inv.pdfUrl,
        errorMessage: inv.errorMessage,
        sentAt: inv.sentAt,
        acceptedAt: inv.acceptedAt,
        createdAt: inv.createdAt,
        numero: `${inv.series}-${String(inv.number).padStart(8, "0")}`,
      })),
    });

    res.headers.set("X-Total-Count", String(total));
    res.headers.set("X-Page", String(page));
    return res;
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
