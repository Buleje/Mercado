import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

type Anomalia = {
  type: "venta_baja" | "stock_muerto" | "fiado_vencido" | "margen_critico";
  severity: "alto" | "medio" | "bajo";
  title: string;
  body: string;
  actionUrl: string;
  actionLabel: string;
};

/**
 * GET /api/analytics/anomalias
 * Detects 4 types of business anomalies:
 * 1. Low sales vs same weekday average (last 4 weeks)
 * 2. Dead stock (products with stock but no sales in 15 days)
 * 3. Overdue fiados > 30 days (try/catch)
 * 4. Critical margin < 10%
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tenantFilter = { tenantId: auth.tenantId };

    const anomalias: Anomalia[] = [];

    // ─── 1. VENTA BAJA vs same weekday (last 4 weeks) ──────
    const sameDayDates: { gte: Date; lt: Date }[] = [];
    for (let i = 1; i <= 4; i++) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - 7 * i);
      const dEnd = new Date(d);
      dEnd.setDate(dEnd.getDate() + 1);
      sameDayDates.push({ gte: d, lt: dEnd });
    }

    const [ventasHoyAgg, ...ventasPasadas] = await Promise.allSettled([
      prisma.sale.aggregate({
        where: { ...tenantFilter, createdAt: { gte: todayStart } },
        _sum: { total: true },
      }),
      ...sameDayDates.map((dateRange) =>
        prisma.sale.aggregate({
          where: { ...tenantFilter, createdAt: dateRange },
          _sum: { total: true },
        })
      ),
    ]);

    const ventasHoy = ventasHoyAgg.status === "fulfilled" ? toNumOrZero(ventasHoyAgg.value._sum.total) : 0;
    const pastTotals = ventasPasadas
      .map((r) => (r.status === "fulfilled" ? toNumOrZero(r.value._sum.total) : 0))
      .filter((t) => t > 0);

    if (pastTotals.length >= 2) {
      const avgPast = pastTotals.reduce((a, b) => a + b, 0) / pastTotals.length;
      if (avgPast > 0) {
        const ratio = ventasHoy / avgPast;
        if (ratio < 0.5) {
          anomalias.push({
            type: "venta_baja",
            severity: "alto",
            title: "Ventas muy por debajo del promedio",
            body: `Hoy S/ ${ventasHoy.toFixed(2)} vs promedio S/ ${avgPast.toFixed(2)} del mismo día (${Math.round(ratio * 100)}%)`,
            actionUrl: "/admin/ventas",
            actionLabel: "Ver ventas del día",
          });
        } else if (ratio < 0.75) {
          anomalias.push({
            type: "venta_baja",
            severity: "medio",
            title: "Ventas por debajo del promedio",
            body: `Hoy S/ ${ventasHoy.toFixed(2)} vs promedio S/ ${avgPast.toFixed(2)} del mismo día (${Math.round(ratio * 100)}%)`,
            actionUrl: "/admin/ventas",
            actionLabel: "Ver ventas del día",
          });
        }
      }
    }

    // ─── 2. STOCK MUERTO (sin ventas en 15 días) ────────────
    const fifteenDaysAgo = new Date(now);
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    const productsWithStock = await prisma.product.findMany({
      where: {
        ...tenantFilter,
        active: true,
        deletedAt: null,
        stock: { gt: 0 },
      },
      select: { id: true, name: true, stock: true, category: true },
    });

    if (productsWithStock.length > 0) {
      const productIds = productsWithStock.map((p) => p.id);

      const recentSaleItems = await prisma.saleItem.findMany({
        where: {
          productId: { in: productIds },
          sale: { ...tenantFilter, createdAt: { gte: fifteenDaysAgo } },
        },
        select: { productId: true },
        distinct: ["productId"],
      });
      const soldProductIds = new Set(recentSaleItems.map((si) => si.productId));

      const deadStock = productsWithStock
        .filter((p) => !soldProductIds.has(p.id))
        .sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))
        .slice(0, 10);

      for (const product of deadStock) {
        anomalias.push({
          type: "stock_muerto",
          severity: "medio",
          title: `Stock muerto: ${product.name}`,
          body: `${product.stock} unidades sin ventas en 15 días (${product.category})`,
          actionUrl: `/admin/productos?search=${encodeURIComponent(product.name)}`,
          actionLabel: "Ver producto",
        });
      }
    }

    // ─── 3. FIADOS VENCIDOS > 30 días (try/catch) ───────────
    try {
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const fiadosVencidos = await prisma.fiado.findMany({
        where: {
          ...tenantFilter,
          status: "ACTIVO",
          fechaVence: { lt: thirtyDaysAgo },
        },
        select: {
          id: true,
          saldo: true,
          fechaVence: true,
          customer: { select: { name: true, phone: true } },
        },
        orderBy: { saldo: "desc" },
        take: 5,
      });

      for (const fiado of fiadosVencidos) {
        const diasVencido = Math.floor(
          (now.getTime() - new Date(fiado.fechaVence!).getTime()) / (1000 * 60 * 60 * 24)
        );
        const saldo = toNumOrZero(fiado.saldo);

        anomalias.push({
          type: "fiado_vencido",
          severity: diasVencido > 60 ? "alto" : "medio",
          title: `Fiado vencido: ${fiado.customer.name}`,
          body: `S/ ${saldo.toFixed(2)} pendiente, ${diasVencido} días de mora`,
          actionUrl: "/admin/fiados",
          actionLabel: "Gestionar cobro",
        });
      }
    } catch {
      // Fiado table might not exist — skip silently
    }

    // ─── 4. MARGEN CRÍTICO < 10% ────────────────────────────
    const productsLowMargin = await prisma.product.findMany({
      where: {
        ...tenantFilter,
        active: true,
        deletedAt: null,
        costPrice: { not: null, gt: 0 },
        price: { gt: 0 },
      },
      select: { id: true, name: true, price: true, costPrice: true, category: true },
    });

    const criticalMarginProducts = productsLowMargin
      .map((p) => ({
        ...p,
        _priceNum: toNumOrZero(p.price),
        _costNum: toNumOrZero(p.costPrice),
      }))
      .filter((p) => {
        if (p._priceNum <= 0) return false;
        const margin = ((p._priceNum - p._costNum) / p._priceNum) * 100;
        return margin < 10;
      })
      .slice(0, 10);

    for (const product of criticalMarginProducts) {
      const priceNum = product._priceNum;
      const costNum = product._costNum;
      const margin = ((priceNum - costNum) / priceNum) * 100;
      anomalias.push({
        type: "margen_critico",
        severity: margin < 5 ? "alto" : "medio",
        title: `Margen crítico: ${product.name}`,
        body: `Margen ${margin.toFixed(1)}% — precio S/ ${priceNum.toFixed(2)}, costo S/ ${costNum.toFixed(2)}`,
        actionUrl: `/admin/productos?search=${encodeURIComponent(product.name)}`,
        actionLabel: "Ajustar precio",
      });
    }

    return NextResponse.json({
      anomalias,
      totalAlertas: anomalias.length,
      timestamp: now.toISOString(),
    });
  } catch (e) {
    console.error("[analytics/anomalias] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
