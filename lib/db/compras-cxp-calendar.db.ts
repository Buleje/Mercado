import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * Audit project-wide 2026-05-19 — DB class para calendario de cuentas por pagar (CxP).
 * Encapsula la query de payables del mes agrupados por fecha de vencimiento.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbCxpCalendarEntry = {
  id: string;
  supplierName: string;
  amount: number;
  paidAmount: number;
  status: string;
  daysOverdue: number;
  description: string;
};

export type DbCxpCalendarResult = {
  calendar: Record<string, DbCxpCalendarEntry[]>;
  resumen: {
    venceEstaSemana: number;
    venceEsteMes: number;
    vencido: number;
  };
};

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Obtiene el calendario de cuentas por pagar del tenant para el mes indicado.
 * Retorna un mapa fecha→pagos + resumen de vencidos/pendientes.
 */
export async function getCxpCalendar(
  tenantId: string,
  monthStart: Date,
  monthEnd: Date,
): Promise<DbCxpCalendarResult> {
  const payables = await prisma.payable.findMany({
    where: {
      tenantId,
      dueDate: { gte: monthStart, lte: monthEnd },
    },
    include: { supplier: true },
    orderBy: { dueDate: "asc" },
  });

  const calendar: Record<string, DbCxpCalendarEntry[]> = {};

  const today = new Date();
  today.setHours(0, 0, 0, 0);

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

    if (p.status !== "pagado") {
      if (daysOverdue > 0) {
        vencido += remaining;
      } else if (dueDate <= weekEnd) {
        venceEstaSemana += remaining;
      }
      venceEsteMes += remaining;
    }
  }

  return {
    calendar,
    resumen: {
      venceEstaSemana: Math.round(venceEstaSemana * 100) / 100,
      venceEsteMes: Math.round(venceEsteMes * 100) / 100,
      vencido: Math.round(vencido * 100) / 100,
    },
  };
}
