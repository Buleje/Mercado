import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId ?? "main";
  const monthParam = req.nextUrl.searchParams.get("month");

  // Parse month (default: current month)
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-based

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    year = y;
    month = m - 1; // Convert to 0-based
  }

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

  try {
    const payables = await prisma.payable.findMany({
      where: {
        tenantId,
        dueDate: { gte: monthStart, lte: monthEnd },
      },
      include: { supplier: true },
      orderBy: { dueDate: "asc" },
    });

    // Group by date
    const calendar: Record<
      string,
      Array<{
        id: string;
        supplierName: string;
        amount: number;
        paidAmount: number;
        status: string;
        daysOverdue: number;
        description: string;
      }>
    > = {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Week boundaries for summary
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));

    let venceEstaSemana = 0;
    let venceEsteMes = 0;
    let vencido = 0;

    for (const p of payables) {
      const dateKey = p.dueDate.toISOString().slice(0, 10);
      const dueDate = new Date(p.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      const daysOverdue = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      // TD-018: amount y paidAmount son Decimal
      const amountNum = toNumOrZero(p.amount);
      const paidAmountNum = toNumOrZero(p.paidAmount);
      const remaining = amountNum - paidAmountNum;

      if (!calendar[dateKey]) calendar[dateKey] = [];
      calendar[dateKey].push({
        id: p.id,
        supplierName: p.supplier?.name ?? p.supplierName,
        amount: amountNum,
        paidAmount: paidAmountNum,
        status: p.status,
        daysOverdue: Math.max(0, daysOverdue),
        description: p.description,
      });

      // Summary calculations
      if (p.status !== "pagado") {
        if (daysOverdue > 0) {
          vencido += remaining;
        } else if (dueDate <= weekEnd) {
          venceEstaSemana += remaining;
        }
        venceEsteMes += remaining;
      }
    }

    return NextResponse.json({
      calendar,
      resumen: {
        venceEstaSemana: Math.round(venceEstaSemana * 100) / 100,
        venceEsteMes: Math.round(venceEsteMes * 100) / 100,
        vencido: Math.round(vencido * 100) / 100,
      },
    });
  } catch (e) {
    logger.error("[compras/cxp-calendar] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error obteniendo calendario" }, { status: 500 });
  }
}
