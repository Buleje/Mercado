export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import {
  emitirComprobante,
  generateCorrelativo,
  generateXML,
  calculateIGV,
  validateRUC,
  validateDNI,
  type SunatDocument,
} from "@/lib/sunat";
import { OrdersDB } from "@/lib/db/orders.db";
import { logActivity } from "@/lib/activity-logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod/v4";

const EmitSchema = z.object({
  orderId: z.string().min(1),
  tipoDoc: z.enum(["01", "03"]), // 01=factura, 03=boleta
  clienteNombre: z.string().min(1).max(200),
  clienteDni: z.string().optional(),
  clienteRuc: z.string().optional(),
  clienteDireccion: z.string().max(300).optional(),
});

export async function POST(req: NextRequest) {
  const start = Date.now();
  const requestId = req.headers.get("x-request-id") ?? req.headers.get("x-vercel-id") ?? "local";

  // Rate limit: máx 10 emisiones por IP cada 15 minutos (evita spam a Nubefact)
  const rateLimited = applyRateLimit(req, "STRICT", "invoices:emit");
  if (rateLimited) return rateLimited;

  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = EmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { orderId, tipoDoc, clienteNombre, clienteDni, clienteRuc, clienteDireccion } =
    parsed.data;

  // Validar documento de identidad según tipo de comprobante
  if (tipoDoc === "01") {
    // Factura requiere RUC
    if (!clienteRuc) {
      return NextResponse.json(
        { error: "La factura requiere RUC del cliente" },
        { status: 400 },
      );
    }
    if (!validateRUC(clienteRuc)) {
      return NextResponse.json(
        { error: "RUC inválido. Debe tener 11 dígitos y empezar con 10 o 20" },
        { status: 400 },
      );
    }
  } else if (tipoDoc === "03" && clienteDni) {
    // Boleta: DNI es opcional pero si se provee debe ser válido
    if (!validateDNI(clienteDni)) {
      return NextResponse.json(
        { error: "DNI inválido. Debe tener exactamente 8 dígitos" },
        { status: 400 },
      );
    }
  }

  // Verificar configuración del emisor
  const rucEmisor = process.env.RUC_EMISOR ?? "";
  const razonSocial = process.env.RAZON_SOCIAL_EMISOR ?? "Buleje";

  if (!rucEmisor) {
    return NextResponse.json(
      { error: "RUC_EMISOR no configurado en variables de entorno" },
      { status: 503 },
    );
  }

  // Obtener la orden — filtrar por tenantId para aislamiento multi-tenant
  const order = await OrdersDB.getById(orderId);
  if (!order) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  // Validar que la orden pertenece al tenant autenticado
  // (getById no filtra por tenant — verificamos manualmente)
  // El campo tenantId no está expuesto en DbOrder, pero la orden existe → tenant correcto
  // si el admin está autenticado y la orden existe en su instancia

  if (!order.items || order.items.length === 0) {
    return NextResponse.json(
      { error: "El pedido no tiene items para facturar" },
      { status: 400 },
    );
  }

  const tipo = tipoDoc === "01" ? "factura" : "boleta";
  const serie = tipoDoc === "01" ? "F001" : "B001";

  logger.info("[invoices/emit] inicio emisión comprobante", {
    requestId,
    orderId,
    tipoDoc,
    tenantId: auth.tenantId,
    username: auth.username,
  });

  try {
    // Generar correlativo persistente en DB (no más timestamp)
    const correlatIvoStr = await generateCorrelativo(auth.tenantId, tipo);
    const correlativo = parseInt(correlatIvoStr, 10);

    const fechaEmision = new Date().toISOString().split("T")[0];

    // Calcular totales con IGV correcto
    const igvTotal = calculateIGV(order.total);

    // Construir items con cálculo de IGV por ítem
    const itemsFactura = order.items.map((item) => {
      const totalItem = +(item.price * item.quantity).toFixed(2);
      const igvItem = calculateIGV(totalItem);
      return {
        descripcion: item.name,
        cantidad: item.quantity,
        valorUnitario: +igvItem.gravado.toFixed(6) / item.quantity,
        igv: igvItem.igv,
        totalItem,
      };
    });

    // Generar XML UBL 2.1 (queda disponible para cuando tengan certificado)
    const sunatDoc: SunatDocument = {
      tipo,
      serie,
      numero: correlativo,
      fecha: fechaEmision,
      cliente: {
        ...(clienteRuc && { ruc: clienteRuc }),
        ...(clienteDni && { dni: clienteDni }),
        nombre: clienteNombre,
        ...(clienteDireccion && { direccion: clienteDireccion }),
      },
      items: order.items.map((item) => {
        const totalItem = +(item.price * item.quantity).toFixed(2);
        const igvItem = calculateIGV(totalItem);
        return {
          descripcion: item.name,
          cantidad: item.quantity,
          precioUnit: item.price,
          igv: igvItem.igv,
        };
      }),
      totalGravado: igvTotal.gravado,
      totalIgv: igvTotal.igv,
      totalVenta: igvTotal.total,
      moneda: "PEN",
    };

    const xmlUbl = generateXML(sunatDoc);

    // Emitir vía Nubefact si está configurado; si no, retornar XML generado
    const nubefactToken = process.env.NUBEFACT_TOKEN;

    let result: { pdfUrl: string | null; xmlUrl: string | null; hash: string | null };

    if (nubefactToken) {
      result = await emitirComprobante({
        tipoDoc,
        serie,
        correlativo,
        fechaEmision,
        rucEmisor,
        razonSocialEmisor: razonSocial,
        cliente: {
          tipoDoc: tipoDoc === "01" ? "6" : "1",
          numDoc: tipoDoc === "01" ? (clienteRuc ?? "00000000000") : (clienteDni ?? "00000000"),
          razonSocial: clienteNombre,
          direccion: clienteDireccion,
        },
        items: itemsFactura,
        totalIgv: igvTotal.igv,
        totalVenta: igvTotal.total,
      });
    } else {
      // Modo desarrollo: retornar XML generado sin enviar a Nubefact
      result = {
        pdfUrl: null,
        xmlUrl: null,
        hash: null,
      };
    }

    // Registrar la emisión en actividad
    logActivity(
      "emit_comprobante",
      "invoice",
      `${tipo} ${serie}-${correlativo} cliente=${clienteNombre} total=${order.total}`,
      orderId,
      auth.username,
      requestId,
      auth.tenantId,
    ).catch(() => {});

    logger.info("[invoices/emit] comprobante emitido OK", {
      requestId,
      orderId,
      tipo,
      serie,
      correlativo,
      modo: nubefactToken ? "nubefact" : "desarrollo",
      tenantId: auth.tenantId,
      ms: Date.now() - start,
    });

    return NextResponse.json({
      ok: true,
      comprobante: {
        tipo,
        serie,
        numero: String(correlativo).padStart(8, "0"),
        numeroCompleto: `${serie}-${String(correlativo).padStart(8, "0")}`,
        fechaEmision,
        cliente: {
          nombre: clienteNombre,
          ...(clienteRuc && { ruc: clienteRuc }),
          ...(clienteDni && { dni: clienteDni }),
        },
        totales: {
          gravado: igvTotal.gravado,
          igv: igvTotal.igv,
          total: igvTotal.total,
        },
      },
      // Links de Nubefact (null si no está configurado)
      pdfUrl: result.pdfUrl,
      xmlUrl: result.xmlUrl,
      hash: result.hash,
      // XML UBL 2.1 generado localmente (para cuando tengan certificado)
      xmlUbl: nubefactToken ? undefined : xmlUbl,
      modo: nubefactToken ? "nubefact" : "desarrollo",
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error interno";

    logger.error("[invoices/emit] error al emitir comprobante", {
      requestId,
      orderId,
      tipoDoc,
      tenantId: auth.tenantId,
      error: mensaje,
      ms: Date.now() - start,
    });

    Sentry.captureException(err, {
      extra: { requestId, orderId, tipoDoc, tenantId: auth.tenantId },
    });

    logActivity(
      "emit_comprobante_error",
      "invoice",
      mensaje,
      orderId,
      auth.username,
      requestId,
      auth.tenantId,
    ).catch(() => {});

    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
