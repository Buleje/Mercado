export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ProductsDB, CustomersDB, OrdersDB, SettingsDB, FiadosDB } from "@/lib/db";
import { logActivity } from "@/lib/activity-logger";

export async function GET(req: Request) {
  // 1. Auth — solo admin puede descargar backup completo
  const auth = await requireAdmin(req, ["admin"]);
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    // Calcular fecha de corte: últimos 90 días
    const since90 = new Date();
    since90.setDate(since90.getDate() - 90);
    const sinceISO = since90.toISOString();

    // 2. Obtener datos en paralelo desde DB classes (nunca Prisma directo)
    const [products, customers, orders, fiados, settings] = await Promise.all([
      ProductsDB.getAll(),
      CustomersDB.getAll(),
      OrdersDB.getAllFiltered({ since: sinceISO }),
      FiadosDB.list(auth.tenantId),
      SettingsDB.get(),
    ]);

    // 3. Construir payload de backup — solo campos relevantes, sin IDs internos
    const backup = {
      exportedAt: new Date().toISOString(),
      version: "2.0",
      tenant: auth.tenantId,
      metadata: {
        totalProducts: products.length,
        totalCustomers: customers.length,
        totalOrders: orders.length,
        totalFiados: fiados.length,
        ordersRange: "últimos 90 días",
      },
      data: {
        products: products.map((p) => ({
          nombre: p.name,
          categoria: p.category,
          precio: p.price,
          precioCompra: p.costPrice,
          unidad: p.unit,
          stock: p.stock,
          stockMin: p.stockMin,
          activo: p.active,
          codigo: p.barcode,
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
      },
    };

    // 4. Fire-and-forget
    logActivity(
      auth.userId,
      "export",
      "backup",
      `backup-${auth.tenantId}-${new Date().toISOString().slice(0, 10)}`
    ).catch(() => {});

    const fecha = new Date().toISOString().slice(0, 10);
    const filename = `backup-${auth.tenantId}-${fecha}.json`;

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[backup/export] error:", error);
    return NextResponse.json(
      { error: "Error al generar backup", detail: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
