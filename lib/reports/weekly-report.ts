import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TopProduct = {
  productId: number;
  name: string;
  quantity: number;
  revenue: number;
};

export type WeeklyReportData = {
  tenantId: string;
  storeName: string;
  weekStart: Date;
  weekEnd: Date;
  totalVentasSemana: number;
  totalVentasAnterior: number;
  deltaPct: number; // positive = growth, negative = drop
  top3Productos: TopProduct[];
  stockCriticoCount: number;
  fiadosVencidosCount: number;
  fiadosVencidosMonto: number;
};

// ── Generator ─────────────────────────────────────────────────────────────────

/**
 * Generates weekly report data for a tenant.
 * Uses direct prisma queries (READ-only) because the DB layer classes
 * lack date-range aggregation methods.
 * TODO: add SalesDB.aggregateByDateRange(tenantId, from, to) to sales.db.ts
 */
export async function generateWeeklyReport(tenantId: string): Promise<WeeklyReportData> {
  const now = new Date();

  // Week boundaries: Mon-Sun ending yesterday midnight
  const weekEnd = new Date(now);
  weekEnd.setHours(0, 0, 0, 0);

  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 7);

  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  // Fetch tenant name
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  // ── Current week sales ────────────────────────────────────────────────────

  const thisWeekSales = await prisma.sale.findMany({
    where: {
      tenantId,
      createdAt: { gte: weekStart, lt: weekEnd },
    },
    include: { items: true },
  });

  const prevWeekSales = await prisma.sale.findMany({
    where: {
      tenantId,
      createdAt: { gte: prevWeekStart, lt: weekStart },
    },
    select: { total: true },
  });

  const totalVentasSemana = thisWeekSales.reduce(
    (sum, s) => sum + toNumOrZero(s.total),
    0
  );

  const totalVentasAnterior = prevWeekSales.reduce(
    (sum, s) => sum + toNumOrZero(s.total),
    0
  );

  const deltaPct =
    totalVentasAnterior === 0
      ? totalVentasSemana > 0
        ? 100
        : 0
      : ((totalVentasSemana - totalVentasAnterior) / totalVentasAnterior) * 100;

  // ── Top 3 products ────────────────────────────────────────────────────────

  const productMap = new Map<
    number,
    { name: string; quantity: number; revenue: number }
  >();

  for (const sale of thisWeekSales) {
    for (const item of sale.items) {
      const existing = productMap.get(item.productId) ?? {
        name: item.name,
        quantity: 0,
        revenue: 0,
      };
      existing.quantity += item.quantity;
      existing.revenue += toNumOrZero(item.price) * item.quantity;
      productMap.set(item.productId, existing);
    }
  }

  const top3Productos: TopProduct[] = Array.from(productMap.entries())
    .map(([productId, data]) => ({ productId, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  // ── Stock crítico (stock < stockMin) ──────────────────────────────────────

  const stockCriticoCount = await prisma.product.count({
    where: {
      tenantId,
      active: true,
      deletedAt: null,
      stockMin: { not: null },
      // stock < stockMin expressed as: stock less than stockMin
      // Prisma doesn't support column-to-column comparison natively;
      // use raw for accuracy
    },
  });

  // Refine with raw for column-to-column comparison
  // TODO: expose this via ProductsDB.countCriticalStock(tenantId) when ProductsDB adds that method
  const criticalRaw = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint as count
    FROM "Product"
    WHERE "tenantId" = ${tenantId}
      AND "active" = true
      AND "deletedAt" IS NULL
      AND "stockMin" IS NOT NULL
      AND "stock" IS NOT NULL
      AND "stock" < "stockMin"
  `;
  const stockCriticoCountReal = Number(criticalRaw[0]?.count ?? 0);

  // ── Fiados vencidos ───────────────────────────────────────────────────────

  const fiadosVencidos = await prisma.fiado.findMany({
    where: {
      tenantId,
      status: "VENCIDO",
    },
    select: { saldo: true },
  });

  const fiadosVencidosCount = fiadosVencidos.length;
  const fiadosVencidosMonto = fiadosVencidos.reduce(
    (sum, f) => sum + toNumOrZero(f.saldo),
    0
  );

  return {
    tenantId,
    storeName: tenant?.name ?? tenantId,
    weekStart,
    weekEnd,
    totalVentasSemana,
    totalVentasAnterior,
    deltaPct: Math.round(deltaPct * 10) / 10,
    top3Productos,
    stockCriticoCount: stockCriticoCountReal,
    fiadosVencidosCount,
    fiadosVencidosMonto,
  };
}

// ── Renderer ──────────────────────────────────────────────────────────────────

function fmtPen(amount: number): string {
  return `S/${amount.toFixed(2)}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Lima",
  });
}

function deltaBadge(pct: number): string {
  if (pct > 0) return `📈 +${pct}%`;
  if (pct < 0) return `📉 ${pct}%`;
  return `➡️ 0% (igual)`;
}

/**
 * Renders a WhatsApp-formatted weekly report message.
 * Uses *asterisks* for bold as per WhatsApp markup spec.
 */
export function renderWhatsAppMessage(
  data: WeeklyReportData,
  storeName: string
): string {
  const lines: string[] = [];

  lines.push(`🏪 *${storeName}*`);
  lines.push(`━━━━━━━━━━━━━━━━━━━`);
  lines.push(`📊 *REPORTE SEMANAL*`);
  lines.push(
    `${fmtDate(data.weekStart)} → ${fmtDate(new Date(data.weekEnd.getTime() - 86400000))}`
  );
  lines.push(`━━━━━━━━━━━━━━━━━━━`);
  lines.push(``);

  // Ventas
  lines.push(`💰 *Ventas esta semana:* ${fmtPen(data.totalVentasSemana)}`);
  lines.push(
    `📅 Semana anterior: ${fmtPen(data.totalVentasAnterior)} ${deltaBadge(data.deltaPct)}`
  );
  lines.push(``);

  // Top 3 productos
  lines.push(`🏆 *Top 3 productos:*`);
  if (data.top3Productos.length === 0) {
    lines.push(`  _Sin ventas registradas_`);
  } else {
    const medals = ["🥇", "🥈", "🥉"];
    data.top3Productos.forEach((p, i) => {
      lines.push(
        `  ${medals[i] ?? "•"} *${p.name}* — ${p.quantity} uds · ${fmtPen(p.revenue)}`
      );
    });
  }
  lines.push(``);

  // Alertas
  lines.push(`⚠️ *Alertas:*`);
  if (data.stockCriticoCount > 0) {
    lines.push(
      `  🔴 *${data.stockCriticoCount}* producto${data.stockCriticoCount !== 1 ? "s" : ""} con stock crítico`
    );
  } else {
    lines.push(`  ✅ Stock: sin alertas`);
  }

  if (data.fiadosVencidosCount > 0) {
    lines.push(
      `  💸 *${data.fiadosVencidosCount}* fiado${data.fiadosVencidosCount !== 1 ? "s" : ""} vencido${data.fiadosVencidosCount !== 1 ? "s" : ""} — total ${fmtPen(data.fiadosVencidosMonto)}`
    );
  } else {
    lines.push(`  ✅ Fiados: sin vencidos`);
  }

  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━`);
  lines.push(`_Reporte automático — Buleje_`);

  return lines.join("\n");
}
