import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ProductsDB, CustomersDB, OrdersDB, FiadosDB, SettingsDB } from "@/lib/db";
import { logActivity } from "@/lib/activity-logger";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

export async function GET(req: NextRequest) {
  // 1. Auth — solo admin puede exportar todos los datos
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const traceId = newTraceId();

  try {
    // 2. Corte: últimos 6 meses
    const since6m = new Date();
    since6m.setMonth(since6m.getMonth() - 6);
    const sinceISO = since6m.toISOString();

    // 3. Obtener datos en paralelo desde DB classes (nunca Prisma directo)
    const [products, customers, orders, fiados, settings] = await Promise.all([
      ProductsDB.getAll(auth.tenantId),
      CustomersDB.getAll(auth.tenantId),
      OrdersDB.getAllFiltered({ since: sinceISO, tenantId: auth.tenantId }),
      FiadosDB.list(auth.tenantId),
      SettingsDB.get(auth.tenantId),
    ]);

    // 4. Construir payload de exportación
    const payload = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      tenant: auth.tenantId,
      metadata: {
        totalProducts: products.length,
        totalCustomers: customers.length,
        totalOrders: orders.length,
        totalFiados: fiados.length,
        ordersRange: "últimos 6 meses",
      },
      products: products.map((p) => ({
        nombre: p.name,
        categoria: p.category,
        precio: p.price,
        precioCompra: p.costPrice ?? null,
        unidad: p.unit,
        stock: p.stock ?? null,
        stockMin: p.stockMin ?? null,
        activo: p.active,
        codigo: p.barcode ?? null,
        descripcion: p.description ?? null,
      })),
      customers: customers.map((c) => ({
        nombre: c.name,
        telefono: c.phone,
        ubicacion: c.location,
        puntosLealtad: c.loyaltyPoints,
        nivelLealtad: c.loyaltyTier,
        totalGastado: c.totalSpent,
      })),
      orders: orders.map((o) => ({
        cliente: o.customer.name,
        telefono: o.customer.phone,
        total: o.total,
        estado: o.status,
        metodoPago: o.paymentMethod,
        items: o.items.map((i) => ({
          nombre: i.name,
          cantidad: i.quantity,
          precio: i.price,
          unidad: i.unit,
        })),
        fecha: o.createdAt,
      })),
      fiados: fiados.map((f) => ({
        cliente: f.customerName,
        total: f.total,
        saldo: f.saldo,
        descripcion: f.descripcion,
        estado: f.status,
        vencimiento: f.fechaVence,
        cuotas: f.cuotas.length,
        fecha: f.createdAt,
      })),
      settings: {
        negocio: settings.businessName,
        telefono: settings.businessPhone,
        direccion: settings.businessAddress,
        modo: settings.mode,
        moneda: settings.currency ?? "PEN",
      },
    };

    // 5. Fire-and-forget
    logActivity(
      "export",
      "datos",
      `Exportación completa del tenant ${auth.tenantId}`,
      auth.tenantId,
      auth.username,
    ).catch(() => {});

    const fecha = new Date().toISOString().slice(0, 10);
    const filename = `buleje-export-${auth.tenantId}-${fecha}.json`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
