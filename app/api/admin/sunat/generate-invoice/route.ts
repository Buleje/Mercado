import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { emitirBoleta } from "@/lib/integrations/sunat-nubefact";
import { calculateIGV } from "@/lib/sunat";
import { runWithAuditContext } from "@/lib/audit/audit-context";

// ── POST /api/admin/sunat/generate-invoice — Emitir boleta/factura ─────────

const InvoiceSchema = z.object({
  orderId: z.string().min(1),
  tipo: z.enum(["boleta", "factura"]),
  clienteNombre: z.string().min(2).max(200),
  clienteDocumento: z.string().min(8).max(11),
  clienteTipoDocumento: z.enum(["1", "6"]).optional(), // 1=DNI, 6=RUC
});

export async function POST(req: NextRequest) {
  const rateLimitResponse = applyRateLimit(req, "STRICT", "sunat-generate");
  if (rateLimitResponse) return rateLimitResponse;

  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "cajero"]);
    if (auth instanceof NextResponse) return auth;

    // Round 16 M004: SUNAT invoice creation con admin/cajero actor + IP.
    return await runWithAuditContext(req, auth.username, () => generateInvoice(req, auth, traceId));
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

async function generateInvoice(
  req: NextRequest,
  auth: { tenantId: string; username: string; name?: string; role?: string },
  traceId: string,
): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = InvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // 1. Get SUNAT config for this tenant
    const config = await prisma.tenantSunatConfig.findUnique({
      where: { tenantId: auth.tenantId },
    });
    if (!config) {
      return NextResponse.json(
        { error: "Configuración SUNAT no encontrada. Configura tus datos de facturación primero." },
        { status: 422 },
      );
    }

    // 2. Get order with items
    const order = await prisma.order.findFirst({
      where: { id: parsed.data.orderId, tenantId: auth.tenantId, deletedAt: null },
      include: { items: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    // 3. Check if invoice already exists for this order
    const existing = await prisma.sunatInvoice.findFirst({
      where: {
        tenantId: auth.tenantId,
        orderId: order.id,
        sunatStatus: { in: ["pending", "accepted"] },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Ya existe un comprobante ${existing.series}-${existing.number} para esta orden` },
        { status: 409 },
      );
    }

    // 4. Determine series and get next number
    const isBoleta = parsed.data.tipo === "boleta";
    const series = isBoleta ? config.boletaSeries : config.facturaSeries;
    const nextNum = isBoleta ? config.lastBoletaNum + 1 : config.lastFacturaNum + 1;

    // 5. Build items for NubeFact
    const nubefactItems = order.items.map((item) => {
      const totalItem = Number(item.price) * item.quantity;
      const igvCalc = calculateIGV(totalItem);
      const valorUnitario = +(Number(item.price) / 1.18).toFixed(6);
      return {
        unidad_de_medida: "NIU",
        codigo: String(item.productId),
        descripcion: item.name,
        cantidad: item.quantity,
        valor_unitario: valorUnitario,
        precio_unitario: Number(item.price),
        subtotal: igvCalc.gravado,
        tipo_de_igv: 1,
        igv: igvCalc.igv,
        total: igvCalc.total,
        anticipo_regularizacion: false,
      };
    });

    const totalCalc = calculateIGV(Number(order.total));

    // Detect document type from length
    const tipoDoc = parsed.data.clienteTipoDocumento
      ?? (parsed.data.clienteDocumento.length === 11 ? "6" : "1");

    // 6. Call NubeFact API
    const result = await emitirBoleta({
      tenantId: auth.tenantId,
      serie: series,
      numero: nextNum,
      cliente_tipo_documento: tipoDoc as "1" | "6",
      cliente_numero_documento: parsed.data.clienteDocumento,
      cliente_denominacion: parsed.data.clienteNombre,
      total_gravada: totalCalc.gravado,
      total_igv: totalCalc.igv,
      total: totalCalc.total,
      items: nubefactItems,
    });

    // 7. Save invoice record to DB
    const invoice = await prisma.sunatInvoice.create({
      data: {
        tenantId: auth.tenantId,
        orderId: order.id,
        type: parsed.data.tipo,
        series,
        number: nextNum,
        customerRuc: tipoDoc === "6" ? parsed.data.clienteDocumento : null,
        customerName: parsed.data.clienteNombre,
        subtotal: totalCalc.gravado,
        igv: totalCalc.igv,
        total: totalCalc.total,
        sunatStatus: result.success ? "accepted" : "rejected",
        pdfUrl: result.success ? result.pdf_url ?? null : null,
        nubefactId: result.success && "hash" in result ? result.hash ?? null : null,
        errorMessage: result.success ? null : String(result.error),
        sentAt: new Date(),
        acceptedAt: result.success ? new Date() : null,
      },
    });

    // 8. Update correlativo counter
    if (result.success) {
      await prisma.tenantSunatConfig.update({
        where: { tenantId: auth.tenantId },
        data: isBoleta
          ? { lastBoletaNum: nextNum }
          : { lastFacturaNum: nextNum },
      });
    }

    logActivity(
      result.success ? "sunat_invoice_emitted" : "sunat_invoice_failed",
      "SunatInvoice",
      JSON.stringify({
        orderId: order.id,
        tipo: parsed.data.tipo,
        numero: `${series}-${nextNum}`,
        success: result.success,
      }),
      invoice.id,
      auth.name ?? "admin",
      undefined,
      auth.tenantId,
    ).catch(() => {});

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Error al emitir comprobante en NubeFact",
          detail: result.error,
          invoiceId: invoice.id,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      data: {
        invoiceId: invoice.id,
        tipo: parsed.data.tipo,
        numero: `${series}-${nextNum}`,
        pdfUrl: result.pdf_url,
        total: totalCalc.total,
        sunatAccepted: result.sunat_accepted,
      },
      message: `Comprobante ${series}-${nextNum} emitido exitosamente`,
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
