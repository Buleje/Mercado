import { NextRequest, NextResponse } from "next/server";
import { CotizacionesDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/generated/prisma/client";
import { logAudit } from "@/lib/audit-logger";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  try {
    const cotizacion = await CotizacionesDB.getById(id, auth.tenantId);
    if (!cotizacion) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
    }
    if (cotizacion.status !== "ACEPTADA") {
      return NextResponse.json(
        { error: "Solo se pueden convertir cotizaciones con status ACEPTADA" },
        { status: 400 }
      );
    }
    // SECURITY 2026-05-06 (audit warehouse H7): rechazar cotizaciones vencidas.
    if (cotizacion.validoHasta && new Date(cotizacion.validoHasta) < new Date()) {
      return NextResponse.json(
        { error: "Cotización vencida — no se puede convertir" },
        { status: 400 },
      );
    }

    // SECURITY 2026-05-06 (audit warehouse H6): conversión atómica con guard
    // de status. Antes 2 POST paralelos pasaban el check ACEPTADA y creaban
    // 2 órdenes desde la misma cotización. Ahora updateMany con
    // `status:"ACEPTADA"` solo gana 1 transición; el otro recibe count=0.
    // eslint-disable-next-line no-restricted-properties -- $transaction tenant-scoped por auth.tenantId guard arriba.
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.cotizacion.updateMany({
        where: { id, tenantId: auth.tenantId, status: "ACEPTADA" },
        data: { status: "CONVERTIDA" },
      });
      if (claimed.count === 0) {
        throw new Error("COTIZACION_ALREADY_CONVERTED");
      }
      const orderId = `ord-cot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const order = await tx.order.create({
        data: {
          id: orderId,
          tenantId: auth.tenantId,
          customerName: cotizacion.clienteNombre,
          customerPhone: "",
          customerLocation: "",
          customerReference: "",
          total: cotizacion.total,
          status: OrderStatus.pendiente,
          notes: `Convertido desde cotización ${cotizacion.numero}`,
          items: {
            create: cotizacion.items.map((item) => ({
              name: item.descripcion,
              price: item.precioUnit,
              quantity: item.cantidad,
              unit: "NIU",
              image: "",
            })),
          },
        },
        include: { items: true },
      });

      return order;
    });

    logAudit({
      req,
      action: "CREATE",
      entity: "Order",
      entityId: result.id,
      detail: `Orden creada desde cotización ${cotizacion.numero}`,
      user: auth.username,
      tenantId: auth.tenantId,
    });

    return NextResponse.json({ orderId: result.id, numero: cotizacion.numero }, { status: 201 });
  } catch (e) {
    logger.error("[cotizaciones] convertir error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
