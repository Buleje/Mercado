import { NextRequest, NextResponse } from "next/server";
import { CotizacionesDB } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/lib/generated/prisma/client";
import { logAudit } from "@/lib/audit-logger";
import { invalidarVentasOverview } from "@/lib/caja/invalidar-ventas-overview";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { vigenciaVencida } from "@/lib/cotizaciones/vigencia";
import { disponibilidadDe, faltantesDe, idDeProducto } from "@/lib/cotizaciones/disponibilidad";
import { minimoGlobalDelNegocio } from "@/lib/inventario/stock-minimo.server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const _rl = await applyRateLimit(req, "MODERATE", "cotizaciones-X-convertir"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  // Cuerpo opcional: `{ aceptarFaltantes: true }` = convertir aunque falte stock.
  const cuerpo: unknown = await req.json().catch(() => null);
  const aceptarFaltantes =
    !!cuerpo && typeof cuerpo === "object" && (cuerpo as { aceptarFaltantes?: unknown }).aceptarFaltantes === true;

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
    // Vence al terminar su día en Lima (17-10), no a las 19:00 del anterior.
    if (cotizacion.validoHasta && vigenciaVencida(cotizacion.validoHasta)) {
      return NextResponse.json(
        { error: "Cotización vencida — no se puede convertir" },
        { status: 400 },
      );
    }

    // F26: cotizar no apartó stock; al convertir se revisa de nuevo. Lo que no
    // alcanza vuelve 409 con el detalle y la pantalla pide confirmar.
    if (!aceptarFaltantes) {
      const ids = cotizacion.items.map((i) => idDeProducto(i.productoId)).filter((n): n is number => n != null);
      if (ids.length > 0) {
        const [filas, minimoGlobal] = await Promise.all([
          CotizacionesDB.productosParaCotizar(auth.tenantId, ids),
          minimoGlobalDelNegocio(auth.tenantId),
        ]);
        const catalogo = new Map(filas.map((p) => [p.id, disponibilidadDe(p, minimoGlobal)] as const));
        const faltantes = faltantesDe(cotizacion.items, catalogo);
        if (faltantes.length > 0) {
          return NextResponse.json(
            { error: "No alcanza el stock para todo lo cotizado.", motivo: "faltantes", faltantes },
            { status: 409 },
          );
        }
      }
    }

    // SECURITY 2026-05-06 (audit warehouse H6): conversión atómica con guard
    // de status. Antes 2 POST paralelos pasaban el check ACEPTADA y creaban
    // 2 órdenes desde la misma cotización. Ahora updateMany con
    // `status:"ACEPTADA"` solo gana 1 transición; el otro recibe count=0.
     
    // Seguridad 17-10 (punto 1): `customerPhone: ""` violaba el FK a
    // Customer.phone (sólo admite null) y TODA conversión caía en 503. El
    // cliente va si es de este negocio (el FK es por `phone`, único en toda la
    // plataforma: una cotización vieja no puede colgar el pedido de otro).
    const cliente = cotizacion.customerId
      ? await CotizacionesDB.clienteDelNegocio(auth.tenantId, cotizacion.customerId)
      : null;

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
          customerPhone: cliente?.phone ?? null,
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

    // El pedido nuevo cuenta en el Tablero de Ventas (canal «Tienda online»).
    invalidarVentasOverview(auth.tenantId);

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
    if (e instanceof Error && e.message === "COTIZACION_ALREADY_CONVERTED") {
      return NextResponse.json({ error: "Esta cotización ya se convirtió en pedido." }, { status: 409 });
    }
    logger.error("[cotizaciones] convertir error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
