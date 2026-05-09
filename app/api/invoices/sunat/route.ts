/**
 * POST /api/invoices/sunat  — Generar comprobante electrónico SUNAT para una orden
 * GET  /api/invoices/sunat  — Listar comprobantes emitidos del tenant (?page=&limit=)
 *
 * El XML UBL 2.1 y el correlativo se generan con lib/sunat-invoice.ts,
 * que a su vez reutiliza lib/sunat.ts (generateXML, calculateIGV, generateCorrelativo).
 * El registro de cada emisión queda en ActivityLog (action = "sunat_invoice_emitido").
 */

import { NextRequest, NextResponse } from "next/server";
import { toNumOrZero } from "@/lib/decimal-utils";
import { requireAdmin } from "@/lib/require-admin";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId, NotFoundError } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { generateInvoice, type InvoiceOrder } from "@/lib/sunat-invoice";
import { applyRateLimit } from "@/lib/rate-limit";

// ── Schemas ──────────────────────────────────────────────────────────────────

const postSchema = z.object({
  orderId: z.string().min(1),
  tipoDocumento: z.enum(["01", "03"]), // 01=Factura, 03=Boleta
});

const getSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// ── POST — Generar comprobante ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "invoices-sunat"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const traceId = newTraceId();

  try {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { orderId, tipoDocumento } = parsed.data;

    // Buscar la orden con sus ítems — siempre con tenantId para aislamiento
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId: auth.tenantId, deletedAt: null },
      include: { items: true },
    });

    if (!order) throw new NotFoundError("Orden");

    // Leer configuración del emisor desde Settings (puede estar vacía en dev)
    const settings = await prisma.settings.findUnique({
      where: { id: 1 },
      select: {
        businessName: true,
        // sunatRuc y sunatDenominacion son campos string en Settings
        sunatRuc: true,
        sunatDenominacion: true,
      } as Record<string, unknown> as { businessName: true; sunatRuc: true; sunatDenominacion: true },
    }) as { businessName: string | null; sunatRuc: string | null; sunatDenominacion: string | null } | null;

    const businessName =
      (settings as { sunatDenominacion?: string | null } | null)?.sunatDenominacion ??
      settings?.businessName ??
      process.env.RAZON_SOCIAL_EMISOR ??
      "Mi Tienda";

    const ruc =
      (settings as { sunatRuc?: string | null } | null)?.sunatRuc ??
      process.env.RUC_EMISOR ??
      "00000000000";

    // TD-018: order.total y i.price son Decimal → convertir a number
    const invoiceOrder: InvoiceOrder = {
      id: order.id,
      customerName: order.customerName,
      total: toNumOrZero(order.total),
      items: order.items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: toNumOrZero(i.price),
        unit: i.unit,
      })),
    };

    logger.info("[SUNAT/invoice] Generando comprobante", {
      orderId,
      tipoDocumento,
      tenantId: auth.tenantId,
      traceId,
    });

    const { xml, pdfBase64, serie, correlativo, numeroCompleto } =
      await generateInvoice(invoiceOrder, tipoDocumento, auth.tenantId, businessName, ruc);

    // Registrar emisión en ActivityLog para historial y correlativo de búsqueda
    await prisma.activityLog.create({
      data: {
        tenantId: auth.tenantId,
        action: "sunat_invoice_emitido",
        entity: "invoice",
        entityId: numeroCompleto,
        detail: `Orden ${orderId} | ${tipoDocumento === "01" ? "Factura" : "Boleta"} ${numeroCompleto}`,
        user: auth.username ?? "admin",
      },
    });

    // Fire-and-forget — audit trail
    logActivity(
      "sunat_invoice_emitido",
      "invoice",
      `Comprobante ${numeroCompleto} generado para orden ${orderId}`,
      orderId,
      auth.username ?? "admin",
    ).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json(
      { xml, pdfBase64, serie, correlativo, numeroCompleto },
      { status: 201 },
    );
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}

// ── GET — Listar comprobantes emitidos ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const traceId = newTraceId();

  try {
    const url = new URL(req.url);
    const parsed = getSchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    const where = {
      tenantId: auth.tenantId,
      action: "sunat_invoice_emitido",
    };

    const [records, total] = await prisma.$transaction([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          entityId: true,   // numeroCompleto ej: "B001-00000042"
          detail: true,
          user: true,
          createdAt: true,
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    return NextResponse.json({
      data: records.map((r) => ({
        id: r.id,
        numeroCompleto: r.entityId,
        detalle: r.detail,
        emitidoPor: r.user,
        emitidoEn: r.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
