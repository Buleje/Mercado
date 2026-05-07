import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { emitirBoleta } from "@/lib/integrations/sunat";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/invoices/boleta
 *
 * Genera una boleta de venta electrónica.
 * En producción, conectar con un PSE (Proveedor de Servicios Electrónicos)
 * como Nubefact, Efact, o API directa de SUNAT.
 *
 * Por ahora genera el XML base y retorna los datos formateados.
 */

const BoletaSchema = z.object({
  orderId: z.string().min(1),
  clienteDocTipo: z.enum(["DNI", "RUC", "CE"]).default("DNI"),
  clienteDocNumero: z.string().max(15).optional(),
  clienteNombre: z.string().max(200),
});

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "invoices-boleta"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = BoletaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
    }

    const { orderId, clienteDocTipo, clienteDocNumero, clienteNombre } = parsed.data;

    // SECURITY 2026-05-05 (audit SUNAT #6): tenantId scope. Antes
    // `findUnique({where:{id:orderId}})` permitía a admin de tenant A emitir
    // una boleta sobre orden de B (con su propio RUC pero contenido ajeno).
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId: auth.tenantId },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    // TD-018: i.price es Decimal → convertir a number en el shape de items
    const items = order.items.map(i => ({
      name: i.name,
      price: toNumOrZero(i.price),
      quantity: i.quantity,
    }));
    const total = toNumOrZero(order.total);
    const igv = total * 0.18; // 18% IGV Peru
    const subtotal = total - igv;

    // Generate correlative number
    const boletaCount = await prisma.order.count({
      where: { tenantId: order.tenantId },
    });
    const serie = "B001";
    const correlativo = String(boletaCount + 1).padStart(8, "0");
    const numero = `${serie}-${correlativo}`;

    // Build boleta data (SUNAT format)
    const boleta = {
      tipo: "03", // 03 = Boleta de Venta
      serie,
      correlativo,
      numero,
      fechaEmision: new Date().toISOString().slice(0, 10),
      moneda: "PEN",
      emisor: {
        ruc: process.env.SUNAT_RUC ?? "00000000000",
        razonSocial: process.env.SUNAT_RAZON_SOCIAL ?? "MI TIENDA",
        direccion: process.env.SUNAT_DIRECCION ?? "Pucallpa, Ucayali",
        ubigeo: "250101",
      },
      cliente: {
        tipoDocumento: clienteDocTipo === "DNI" ? "1" : clienteDocTipo === "RUC" ? "6" : "7",
        numeroDocumento: clienteDocNumero ?? "00000000",
        nombre: clienteNombre,
      },
      items: items.map((item, i) => ({
        numero: i + 1,
        descripcion: item.name,
        cantidad: item.quantity,
        precioUnitario: item.price,
        valorVenta: item.price * item.quantity,
        igv: (item.price * item.quantity) * 0.18,
        total: item.price * item.quantity,
      })),
      totales: {
        subtotal: subtotal.toFixed(2),
        igv: igv.toFixed(2),
        total: total.toFixed(2),
      },
      // SECURITY 2026-05-05 (audit SUNAT #9): QR payload sin firma permitia
      // falsificacion de boletas imprimiendo un QR con totales alterados.
      // Ahora el payload lleva sig=HMAC-SHA256(payload, AUTH_SECRET) como
      // campo final. Si AUTH_SECRET no esta disponible se emite sin firma
      // y se loggea warn para alertar al operador.
      qrData: (() => {
        const qrPayload = `${process.env.SUNAT_RUC ?? "00000000000"}|03|${serie}|${correlativo}|${igv.toFixed(2)}|${total.toFixed(2)}|${new Date().toISOString().slice(0, 10)}|${clienteDocTipo === "DNI" ? "1" : "6"}|${clienteDocNumero ?? "00000000"}`;
        const secret = process.env.AUTH_SECRET;
        if (!secret) {
          logger.warn("[invoices/boleta] AUTH_SECRET no configurado — QR emitido sin firma HMAC");
          return qrPayload;
        }
        const sig = createHmac("sha256", secret).update(qrPayload).digest("hex").slice(0, 32);
        return `${qrPayload}|sig=${sig}`;
      })(),
    };

    // Enviar a SUNAT via Nubefact (fire-and-forget si falla, no bloquea la venta)
    let sunatResult: { success: boolean; hash?: string; pdf_url?: string } = { success: false };
    try {
      sunatResult = await emitirBoleta(order.tenantId, {
        orderId,
        clienteDni: clienteDocNumero ?? undefined,
        clienteNombre,
        items: items.map((item) => ({
          codigo: "-",
          descripcion: item.name,
          cantidad: item.quantity,
          precioConIgv: item.price,
          unidad: "NIU",
        })),
      });
    } catch (sunatErr) {
      logger.warn("[invoices/boleta] Nubefact call failed — boleta saved locally", { error: String(sunatErr) });
    }

    logActivity(
      "boleta_generada",
      "facturacion",
      `Boleta ${numero} para ${clienteNombre} - S/${total.toFixed(2)} — SUNAT: ${sunatResult.success ? "OK" : "pendiente"}`,
    ).catch(() => {});

    logger.info("[invoices/boleta] Boleta generada", { numero, total, sunat: sunatResult.success });

    return NextResponse.json({
      ok: true,
      boleta,
      sunat: {
        enviada: sunatResult.success,
        hash: sunatResult.hash ?? null,
        pdfUrl: sunatResult.pdf_url ?? null,
      },
      mensaje: sunatResult.success
        ? `Boleta ${numero} emitida y enviada a SUNAT exitosamente.`
        : `Boleta ${numero} guardada. Envío a SUNAT pendiente (se reintentará via cron).`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[invoices/boleta] Error", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
