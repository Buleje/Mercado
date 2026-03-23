export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timingSafeCompare } from "@/lib/timing-safe";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/fiados-reminder
 *
 * Cron diario (9am). Busca pedidos con deuda=true pendientes de cobro
 * y genera lista de clientes a notificar con sus montos.
 * Se puede conectar a WhatsApp/SMS para envío automático.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";

  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find orders with deuda=true that are delivered but not paid
    const fiadoOrders = await prisma.order.findMany({
      where: {
        deuda: true,
        status: "entregado",
      },
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        total: true,
        createdAt: true,
        tenantId: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Group by customer phone
    const byCustomer = new Map<string, {
      name: string;
      phone: string;
      totalDeuda: number;
      orders: number;
      oldestDate: string;
      tenantId: string | null;
    }>();

    for (const order of fiadoOrders) {
      const key = order.customerPhone ?? order.customerName ?? order.id;
      const existing = byCustomer.get(key);
      if (existing) {
        existing.totalDeuda += order.total ?? 0;
        existing.orders++;
      } else {
        byCustomer.set(key, {
          name: order.customerName ?? "Cliente",
          phone: order.customerPhone ?? "",
          totalDeuda: order.total ?? 0,
          orders: 1,
          oldestDate: order.createdAt.toISOString(),
          tenantId: order.tenantId,
        });
      }
    }

    const deudores = Array.from(byCustomer.values())
      .sort((a, b) => b.totalDeuda - a.totalDeuda);

    const totalPendiente = deudores.reduce((s, d) => s + d.totalDeuda, 0);

    logger.info("[cron/fiados-reminder]", {
      deudores: deudores.length,
      totalPendiente,
    });

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      totalDeudores: deudores.length,
      totalPendiente,
      deudores: deudores.map(d => ({
        nombre: d.name,
        telefono: d.phone,
        deuda: d.totalDeuda,
        pedidos: d.orders,
        desde: d.oldestDate,
        mensaje: d.phone
          ? `Hola ${d.name}, tienes S/${d.totalDeuda.toFixed(2)} pendiente de pago en Bodega San Martin. Gracias por tu preferencia.`
          : null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/fiados-reminder] Error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
