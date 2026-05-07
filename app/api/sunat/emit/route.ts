/**
 * POST /api/sunat/emit
 *
 * Emite un comprobante electrónico (boleta o factura) para una orden dada.
 * Construye el payload, lo envía a Nubefact y persiste el resultado en SunatInvoice.
 *
 * Body: { orderId, type: "boleta"|"factura", customerRuc?, customerDni?, customerEmail? }
 * Response: { invoiceId, series, number, pdfUrl, status }
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { sendInvoice } from "@/lib/sunat/nubefact-client";
import { buildBoleta, buildFactura } from "@/lib/sunat/invoice-builder";
import { calculateIGV } from "@/lib/sunat";
import { toNumOrZero } from "@/lib/decimal-utils";
import { DomainEvents } from "@/lib/domain-events";
import { emitMeteringEvent } from "@/lib/billing/wire-up/metering-bus";

// ── Validación de entrada ─────────────────────────────────────────────────────

const EmitSchema = z.object({
  orderId: z.string().min(1),
  type: z.enum(["boleta", "factura"]),
  customerRuc: z.string().regex(/^\d{11}$/).optional(),
  customerDni: z.string().regex(/^\d{8}$/).optional(),
  customerEmail: z.string().email().optional(),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { tenantId } = auth;

  // Parsear body
  const rawBody = await req.json().catch((err: unknown) => {
    logger.warn("[SUNAT emit] JSON parse failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  });
  const parsed = EmitSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { orderId, type, customerRuc, customerDni, customerEmail } = parsed.data;

  // Validar que la factura requiere RUC
  if (type === "factura" && !customerRuc) {
    return NextResponse.json(
      { error: "La factura electrónica requiere el RUC del cliente." },
      { status: 400 }
    );
  }

  try {
    // Obtener orden con items
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada." }, { status: 404 });
    }

    // Verificar que no existe ya un comprobante aceptado para esta orden
    const existing = await prisma.sunatInvoice.findFirst({
      where: {
        tenantId,
        orderId,
        sunatStatus: { in: ["accepted", "pending"] },
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          error: "Ya existe un comprobante emitido para esta orden.",
          invoiceId: existing.id,
          series: existing.series,
          number: existing.number,
          status: existing.sunatStatus,
          pdfUrl: existing.pdfUrl,
        },
        { status: 409 }
      );
    }

    // Obtener configuración SUNAT del tenant
    const sunatConfig = await prisma.tenantSunatConfig.findUnique({
      where: { tenantId },
    });

    if (!sunatConfig) {
      return NextResponse.json(
        {
          error:
            "Configuración SUNAT no encontrada. Configura RUC y token en Ajustes > Facturación.",
        },
        { status: 422 }
      );
    }

    // SECURITY 2026-05-05 (audit SUNAT #1): correlativo atómico.
    // Antes leíamos `lastBoletaNum + 1` de un snapshot; dos requests
    // concurrentes generaban el MISMO número y SUNAT rechazaba el segundo
    // con error de duplicado, dejando ambos invoices en DB con
    // serie+número idéntico. Ahora `{ increment: 1 }` es atómico en Postgres.
    // Trade-off aceptado: si SUNAT rechaza, el número queda quemado (gap),
    // pero SUNAT permite gaps por rechazos.
    const isBoleta = type === "boleta";
    const series = isBoleta ? sunatConfig.boletaSeries : sunatConfig.facturaSeries;
    const incremented = await prisma.tenantSunatConfig.update({
      where: { tenantId },
      data: isBoleta
        ? { lastBoletaNum: { increment: 1 } }
        : { lastFacturaNum: { increment: 1 } },
      select: { lastBoletaNum: true, lastFacturaNum: true },
    });
    const nextNumber = isBoleta ? incremented.lastBoletaNum : incremented.lastFacturaNum;

    // Construir datos para el builder
    // TD-018: order.total y item.price son Decimal → convertir a number
    const orderTotalNum = toNumOrZero(order.total);
    const builderOrder = {
      id: order.id,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      total: orderTotalNum,
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        price: toNumOrZero(item.price),
        unit: item.unit,
      })),
    };

    const builderTenant = {
      ruc: sunatConfig.ruc,
      razonSocial: sunatConfig.razonSocial,
      direccionFiscal: sunatConfig.direccionFiscal,
    };

    const builderSettings = {
      boletaSeries: sunatConfig.boletaSeries,
      facturaSeries: sunatConfig.facturaSeries,
      nextBoletaNum: nextNumber,
      nextFacturaNum: nextNumber,
    };

    // Construir payload Nubefact
    const payload =
      isBoleta
        ? buildBoleta(builderOrder, builderTenant, builderSettings, customerDni, customerEmail)
        : buildFactura(builderOrder, builderTenant, builderSettings, {
            ruc: customerRuc!,
            razonSocial: order.customerName,
            email: customerEmail,
          });

    // Calcular montos para el registro
    const igvCalc = calculateIGV(orderTotalNum);

    // Crear registro en estado pending antes de enviar
    const invoice = await prisma.sunatInvoice.create({
      data: {
        tenantId,
        orderId,
        type,
        series,
        number: nextNumber,
        customerRuc: type === "factura" ? customerRuc : undefined,
        customerName: order.customerName,
        subtotal: +igvCalc.gravado.toFixed(2),
        igv: +igvCalc.igv.toFixed(2),
        total: +igvCalc.total.toFixed(2),
        sunatStatus: "pending",
        sentAt: new Date(),
      },
    });

    // Enviar a Nubefact
    let nubefactResponse;
    try {
      nubefactResponse = await sendInvoice(tenantId, payload);
    } catch (sendErr) {
      const errorMessage =
        sendErr instanceof Error ? sendErr.message : String(sendErr);

      // Marcar como rechazado
      await prisma.sunatInvoice.update({
        where: { id: invoice.id },
        data: { sunatStatus: "rejected", errorMessage },
      });

      logger.error("[SUNAT emit] Error al enviar a Nubefact", {
        invoiceId: invoice.id,
        error: errorMessage,
      });

      return NextResponse.json(
        { error: `Error al enviar comprobante: ${errorMessage}` },
        { status: 502 }
      );
    }

    // Actualizar registro con respuesta de Nubefact
    const sunatStatus = nubefactResponse.sunat_accepted ? "accepted" : "rejected";

    // NOTA: el correlativo ya fue incrementado atómicamente arriba (audit
    // SUNAT #1). Si SUNAT rechaza, el número queda quemado; SUNAT permite
    // gaps por rechazos.
    await prisma.sunatInvoice.update({
      where: { id: invoice.id },
      data: {
        sunatStatus,
        nubefactId: nubefactResponse.nubefact_id ?? null,
        pdfUrl: nubefactResponse.enlace_del_pdf ?? null,
        cdrResponse: nubefactResponse.cdr_base_64_encoded ?? null,
        errorMessage: sunatStatus === "rejected"
          ? (nubefactResponse.sunat_description ?? "Rechazado por SUNAT")
          : null,
        acceptedAt: sunatStatus === "accepted" ? new Date() : null,
      },
    });

    // Audit trail fire-and-forget
    logActivity(
      "sunat_emit",
      "SunatInvoice",
      `${type} ${series}-${String(nextNumber).padStart(8, "0")} orden=${orderId} status=${sunatStatus}`,
      invoice.id,
      auth.username,
    ).catch((err: unknown) => {
      logger.warn("[SUNAT emit] logActivity failed", {
        invoiceId: invoice.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // Emit domain event — solo cuando SUNAT aceptó (ADR 007)
    if (sunatStatus === "accepted") {
      DomainEvents.facturaEmitida(tenantId, {
        facturaId:        invoice.id,
        orderId,
        customerDocument: type === "factura" ? (customerRuc ?? "") : (customerDni ?? ""),
        customerName:     order.customerName,
        documentType:     type,
        total:            +igvCalc.total.toFixed(2),
        sunatHash:        nubefactResponse.nubefact_id ?? undefined,
        cdrUrl:           nubefactResponse.enlace_del_pdf ?? undefined,
      }).catch((err: unknown) => {
        logger.warn("[SUNAT emit] DomainEvents.facturaEmitida failed", {
          invoiceId: invoice.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      // ADR-047 billing wire-up: meter SUNAT acceptance for billing
      try {
        emitMeteringEvent({
          source: "sunat.invoice.emitted",
          tenantId,
          amount: 1,
          idempotencyKey: invoice.id,
          metadata: {
            documentType: type,
            series,
            number: nextNumber,
            total: +igvCalc.total.toFixed(2),
          },
        });
      } catch {
        // Metering fire-and-forget — nunca bloquea respuesta al cliente
      }
    }

    return NextResponse.json(
      {
        invoiceId: invoice.id,
        series,
        number: nextNumber,
        numeroCompleto: `${series}-${String(nextNumber).padStart(8, "0")}`,
        pdfUrl: nubefactResponse.enlace_del_pdf ?? null,
        status: sunatStatus,
        sunatDescription: nubefactResponse.sunat_description ?? null,
      },
      { status: sunatStatus === "accepted" ? 201 : 422 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[SUNAT emit] Error inesperado", { tenantId, error: message });
    return NextResponse.json(
      { error: "Error interno del servidor." },
      { status: 500 }
    );
  }
}
