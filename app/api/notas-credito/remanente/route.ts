import { NextRequest, NextResponse } from "next/server";
import { NotasCreditoDB } from "@/lib/db";
import { SalesDB } from "@/lib/db/sales.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { SettingsDB } from "@/lib/db/settings.db";
import { DevolucionesPosDB } from "@/lib/db/devoluciones-pos.db";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { igvRateFromSettings } from "@/lib/tax";
import { sinDato } from "@/lib/errores/sin-dato";
import { lineasAjustables, remanenteDocumento } from "@/lib/notas-credito/remanente";

/**
 * GET /api/notas-credito/remanente?saleId=… | ?orderId=…
 *
 * Lo que queda por acreditar de un documento, línea por línea con lo cobrado de verdad, y su
 * historial: notas (también anuladas) y devoluciones de Caja. Auditoría de comprobantes F09/F12/F16
 * y M55 (17-10): antes el asistente mostraba el total de la venta como si nada se hubiera acreditado
 * y el tope recién aparecía como un 400 al guardar. La cuenta es la misma del POST (`topeNotaCredito`).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner", "manager"]);
  if (auth instanceof NextResponse) return auth;
  if (!auth.tenantId) return NextResponse.json({ error: "Sesión sin tenant válido" }, { status: 401 });
  const tenantId = auth.tenantId;

  const sp = req.nextUrl.searchParams;
  const saleId = sp.get("saleId")?.trim() || undefined;
  const orderId = sp.get("orderId")?.trim() || undefined;
  if (!saleId && !orderId) return NextResponse.json({ error: "Falta saleId u orderId" }, { status: 400 });

  try {
    const ajustes = await SettingsDB.get(tenantId).catch(sinDato("notas-credito remanente: IGV del negocio"));
    const tasa = igvRateFromSettings(ajustes?.taxRate);

    if (saleId) {
      const [sale, notas, devoluciones, estadoCaja] = await Promise.all([
        SalesDB.getById(tenantId, saleId),
        NotasCreditoDB.porDocumento(tenantId, { saleId }),
        NotasCreditoDB.devolucionesDeVenta(tenantId, saleId),
        DevolucionesPosDB.estado(tenantId, saleId),
      ]);
      if (!sale) return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
      const total = Number(sale.total);
      return NextResponse.json({
        documento: {
          tipo: "venta",
          id: sale.id,
          total,
          fecha: sale.createdAt,
          comprobanteTipo: sale.comprobanteTipo ?? "ticket",
        },
        tasa,
        remanente: remanenteDocumento(total, notas, tasa),
        lineas: lineasAjustables(
          total,
          sale.items.map((i) => ({ productId: i.productId, nombre: i.name, cantidad: i.quantity, precio: Number(i.price) })),
          estadoCaja?.yaDevuelto ?? {},
        ),
        reembolsadoEnCaja: estadoCaja?.yaReembolsado ?? 0,
        notas,
        devoluciones,
      });
    }

    const [pedido, notas] = await Promise.all([
      OrdersDB.getById(tenantId, orderId as string),
      NotasCreditoDB.porDocumento(tenantId, { orderId: orderId as string }),
    ]);
    if (!pedido) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    const total = Number(pedido.total);
    return NextResponse.json({
      documento: { tipo: "pedido", id: pedido.id, total, fecha: pedido.createdAt },
      tasa,
      remanente: remanenteDocumento(total, notas, tasa),
      lineas: lineasAjustables(
        total,
        pedido.items.map((i) => ({ productId: i.id, nombre: i.name, cantidad: i.quantity, precio: Number(i.price) })),
      ),
      reembolsadoEnCaja: 0,
      notas,
      devoluciones: [],
    });
  } catch (e) {
    logger.error("[notas-credito/remanente] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo leer lo que queda del documento" }, { status: 503 });
  }
}
