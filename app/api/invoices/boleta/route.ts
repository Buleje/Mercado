import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { toNumOrZero } from "@/lib/decimal-utils";

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
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = BoletaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
    }

    const { orderId, clienteDocTipo, clienteDocNumero, clienteNombre } = parsed.data;

    // Get order with items
    const order = await prisma.order.findUnique({
      where: { id: orderId },
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
      // Hash/QR data para ticket
      qrData: `${process.env.SUNAT_RUC ?? "00000000000"}|03|${serie}|${correlativo}|${igv.toFixed(2)}|${total.toFixed(2)}|${new Date().toISOString().slice(0, 10)}|${clienteDocTipo === "DNI" ? "1" : "6"}|${clienteDocNumero ?? "00000000"}`,
    };

    // In production: send to SUNAT PSE here
    // const sunatResponse = await sendToSunat(boleta);

    logActivity(
      "boleta_generada",
      "facturacion",
      `Boleta ${numero} generada para ${clienteNombre} - S/${total.toFixed(2)}`,
    ).catch(() => {});

    logger.info("[invoices/boleta] Boleta generada", { numero, total });

    return NextResponse.json({
      ok: true,
      boleta,
      mensaje: "Boleta generada. Conectar con PSE (Nubefact/Efact) para envío a SUNAT.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[invoices/boleta] Error", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
