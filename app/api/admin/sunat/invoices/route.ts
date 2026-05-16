import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";

// Brandon 2026-05-16 (audit Info): force-dynamic obligatorio — query
// params + cookies (requireAdmin) + queries en tiempo real.
export const dynamic = "force-dynamic";

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

    const where = {
      tenantId: auth.tenantId,
      ...(tipo && { type: tipo }),
      ...(status && { sunatStatus: status }),
    };

    const [invoices, total] = await Promise.all([
      prisma.sunatInvoice.findMany({
        where,
        select: {
          id: true,
          orderId: true,
          type: true,
          series: true,
          number: true,
          customerName: true,
          customerRuc: true,
          subtotal: true,
          igv: true,
          total: true,
          sunatStatus: true,
          pdfUrl: true,
          errorMessage: true,
          sentAt: true,
          acceptedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.sunatInvoice.count({ where }),
    ]);

    const res = NextResponse.json({
      data: invoices.map((inv) => ({
        ...inv,
        subtotal: Number(inv.subtotal),
        igv: Number(inv.igv),
        total: Number(inv.total),
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
