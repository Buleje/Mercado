import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/create-notification";
import { ProductsDB } from "@/lib/db/products.db";
import { timingSafeCompare } from "@/lib/timing-safe";

/**
 * GET /api/cron/market-alerts
 *
 * Automated market intelligence alerts:
 * - Low stock on popular products
 * - Low-margin products that sell well
 * - Inactive customers
 *
 * Autorización: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      select: { id: true, slug: true },
    }).catch(() => [{ id: "main", slug: "main" }]);

    let totalAlerts = 0;

    for (const tenant of tenants) {
      const products = await ProductsDB.getAll(tenant.id);
      const activeProducts = products.filter(p => p.active !== false);

      // ── 1. Low stock on popular products ─────────────────────────────
      const lowStockCritical = activeProducts.filter(
        p => p.stock != null && p.stockMin != null && p.stock <= p.stockMin && p.stock > 0
      );
      for (const p of lowStockCritical.slice(0, 5)) {
        await createNotification({
          tenantId: tenant.id,
          type: "STOCK_CRITICO",
          severity: "HIGH",
          title: `${p.name} se está agotando`,
          body: `Solo quedan ${p.stock} unidades (mínimo: ${p.stockMin}). Reabastece pronto para no perder ventas.`,
          entityId: `product-${p.id}`,
          actionUrl: `/admin?tab=inventario`,
          actionLabel: "Ver inventario",
        });
        totalAlerts++;
      }

      // ── 2. Out of stock ──────────────────────────────────────────────
      const outOfStock = activeProducts.filter(p => p.stock != null && p.stock <= 0);
      if (outOfStock.length > 0) {
        await createNotification({
          tenantId: tenant.id,
          type: "STOCK_CRITICO",
          severity: "HIGH",
          title: `${outOfStock.length} productos agotados`,
          body: `Productos sin stock: ${outOfStock.slice(0, 5).map(p => p.name).join(", ")}${outOfStock.length > 5 ? ` y ${outOfStock.length - 5} más` : ""}`,
          entityId: `out-of-stock-${new Date().toISOString().slice(0, 10)}`,
          actionUrl: `/admin?tab=inventario`,
          actionLabel: "Reabastecer",
        });
        totalAlerts++;
      }

      // ── 3. Low margin products ───────────────────────────────────────
      const lowMargin = activeProducts.filter(p => {
        if (!p.price || !p.costPrice || p.costPrice <= 0) return false;
        const margin = ((p.price - p.costPrice) / p.price) * 100;
        return margin < 10;
      });
      if (lowMargin.length > 0) {
        await createNotification({
          tenantId: tenant.id,
          type: "VENTA_ALTA",
          severity: "MEDIUM",
          title: `${lowMargin.length} productos con margen muy bajo`,
          body: `Estos productos ganan menos del 10%: ${lowMargin.slice(0, 3).map(p => `${p.name} (${(((p.price! - p.costPrice!) / p.price!) * 100).toFixed(0)}%)`).join(", ")}. Considera subir precios.`,
          entityId: `low-margin-${new Date().toISOString().slice(0, 10)}`,
          actionUrl: `/admin?tab=productos`,
          actionLabel: "Revisar precios",
        });
        totalAlerts++;
      }

      // ── 4. Inactive customer alert (calculated from orders, not Customer field) ──
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const tenantIds = tenant.id === tenant.slug ? [tenant.id] : [tenant.id, tenant.slug];
      const totalCustomers = await prisma.customer.count({
        where: { tenantId: { in: tenantIds } },
      }).catch(() => 0);
      const activeCustomers = await prisma.customer.count({
        where: {
          tenantId: { in: tenantIds },
          orders: { some: { createdAt: { gte: thirtyDaysAgo } } },
        },
      }).catch(() => 0);
      const inactiveCount = totalCustomers - activeCustomers;

      if (inactiveCount > 5) {
        await createNotification({
          tenantId: tenant.id,
          type: "CLIENTE_INACTIVO",
          severity: "MEDIUM",
          title: `${inactiveCount} clientes no compran hace +30 días`,
          body: `Envíales un mensaje por WhatsApp o un cupón para que vuelvan. Cada cliente recuperado puede generar S/15+ en ventas.`,
          entityId: `inactive-customers-${new Date().toISOString().slice(0, 10)}`,
          actionUrl: `/admin?tab=clientes`,
          actionLabel: "Ver clientes inactivos",
        });
        totalAlerts++;
      }
    }

    return NextResponse.json({
      ok: true,
      alertsGenerated: totalAlerts,
      tenantsProcessed: tenants.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
