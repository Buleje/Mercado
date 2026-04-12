import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";

// ═══════════════════════════════════════════════════════════════════════════
// Rolling 13-week cashflow projection — Buleje
//
// Item #11 del Master Roadmap. Diferenciador #1 vs Loyverse / Alegra / Vendemás.
// Estas plataformas sólo muestran el saldo actual o una proyección lineal de
// 30 días. Nosotros proyectamos rodando 13 semanas con:
//   · Cobros esperados (ventas contado/QR pendientes)
//   · Fiados a cobrar (credit sales con fechaVence en la semana)
//   · Pagos a proveedores (payables con dueDate en la semana)
//   · Nómina (estimada desde Expense category=personal)
//   · Cuotas de préstamos (PrestamoCuota.fechaVence en la semana)
//   · Otros gastos fijos (renta, luz, agua) desde Expense recurring=true
//
// El backend recompone TODO — el cliente solo pinta la tabla.
// ═══════════════════════════════════════════════════════════════════════════

// ── Types (contract público, consumido por route handler + UI) ─────────────

export interface WeekRow {
  /** 1..13 */
  weekNumber: number;
  /** ISO date string — Monday 00:00:00 */
  weekStart: string;
  /** ISO date string — Sunday 23:59:59.999 */
  weekEnd: string;
  openingBalance: number;
  /** Orders pendientes/confirmados con createdAt en la semana */
  expectedCollections: number;
  /** Fiados ACTIVO con fechaVence en la semana */
  creditCollections: number;
  /** Payables pendientes/parciales con dueDate en la semana */
  supplierPayments: number;
  /** Nómina estimada para esta semana (S/ por semana) */
  payroll: number;
  /** Cuotas de préstamos (PrestamoCuota) con fechaVence en la semana */
  loans: number;
  /** Otros gastos fijos recurrentes distribuidos por semana */
  otherExpenses: number;
  closingBalance: number;
  /** true si el cierre cae en negativo → UI pinta rojo */
  isNegative: boolean;
}

export interface CashflowRollingResult {
  tenantId: string;
  /** ISO timestamp */
  generatedAt: string;
  /** Saldo inicial hoy (tesorería o fallback) */
  startingBalance: number;
  /** length === 13 */
  weeks: WeekRow[];
  /** Primera semana (número) con closingBalance < 0, o null si todas sobreviven */
  criticalWeek: number | null;
}

// ── Date helpers (sin date-fns — no está instalado) ───────────────────────

/** Returns the Monday 00:00:00 of the ISO week that contains `date`. */
function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // Sun=0, Mon=1, ..., Sat=6
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function endOfWeekSunday(weekStart: Date): Date {
  const end = addDays(weekStart, 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Starting balance (tesorería + fallback) ────────────────────────────────

/**
 * Current cash position across all treasury accounts for the tenant.
 * Falls back to (last-30-day sales − last-30-day expenses) when the tenant
 * hasn't set up Tesorería yet.
 */
async function getStartingBalance(tenantId: string): Promise<number> {
  const treasury = await prisma.treasuryCuenta.findMany({
    where: { tenantId, activa: true },
    select: { saldo: true },
  });

  if (treasury.length > 0) {
    return round2(treasury.reduce((sum, a) => sum + toNumOrZero(a.saldo), 0));
  }

  // Fallback grueso: neto de los últimos 30 días
  const thirtyDaysAgo = addDays(new Date(), -30);
  const [salesAgg, expensesAgg] = await Promise.all([
    prisma.sale.aggregate({
      where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
      _sum: { total: true },
    }),
    prisma.expense.aggregate({
      where: { tenantId, date: { gte: thirtyDaysAgo } },
      _sum: { amount: true },
    }),
  ]);

  const sales = toNumOrZero(salesAgg._sum.total);
  const expenses = toNumOrZero(expensesAgg._sum.amount);
  return round2(sales - expenses);
}

// ── Main computation ───────────────────────────────────────────────────────

/**
 * Compute a 13-week rolling cashflow projection for a tenant.
 *
 * All operations run in parallel to avoid DB waterfall. Bucketing into
 * weeks happens in memory once the data is in.
 */
export async function computeCashflowRolling(
  tenantId: string,
): Promise<CashflowRollingResult> {
  if (!tenantId) {
    throw new Error("tenantId is required for cashflow projection");
  }

  const now = new Date();
  const firstWeekStart = startOfWeekMonday(now);
  const windowEnd = addDays(firstWeekStart, 13 * 7);

  // ── Parallel fetch ───────────────────────────────────────────────────
  const [
    startingBalance,
    pendingOrders,
    activeFiados,
    pendingPayables,
    loanInstallments,
    personalExpenses,
    recurringExpenses,
    weeklyFixedSetting,
  ] = await Promise.all([
    getStartingBalance(tenantId),

    // 1. Cobros esperados: orders pendientes en la ventana
    prisma.order.findMany({
      where: {
        tenantId,
        status: { in: ["pendiente", "confirmado"] },
        createdAt: { gte: firstWeekStart, lt: windowEnd },
      },
      select: { total: true, createdAt: true },
    }),

    // 2. Fiados vigentes con fechaVence en la ventana
    prisma.fiado.findMany({
      where: {
        tenantId,
        status: "ACTIVO",
        fechaVence: { gte: firstWeekStart, lt: windowEnd },
      },
      select: { saldo: true, fechaVence: true },
    }),

    // 3. Payables con dueDate en la ventana
    prisma.payable.findMany({
      where: {
        tenantId,
        status: { in: ["pendiente", "parcial"] },
        dueDate: { gte: firstWeekStart, lt: windowEnd },
      },
      select: { amount: true, paidAmount: true, dueDate: true },
    }),

    // 4. Cuotas de préstamos pendientes — join manual por prestamo.tenantId
    prisma.prestamoCuota.findMany({
      where: {
        pagadoEn: null,
        fechaVence: { gte: firstWeekStart, lt: windowEnd },
        prestamo: { tenantId, status: "ACTIVO" },
      },
      select: { monto: true, fechaVence: true },
    }),

    // 5. Nómina aproximada — category=personal últimos 30 días (promedio)
    prisma.expense.aggregate({
      where: {
        tenantId,
        category: "personal",
        date: { gte: addDays(now, -30) },
      },
      _sum: { amount: true },
    }),

    // 6. Gastos fijos recurrentes (alquiler, servicios) últimos 30 días
    prisma.expense.aggregate({
      where: {
        tenantId,
        recurring: true,
        category: { notIn: ["personal"] },
        date: { gte: addDays(now, -30) },
      },
      _sum: { amount: true },
    }),

    // 7. Override manual desde platform settings (opcional)
    PlatformSettingsDB.get<number>("estimated_weekly_fixed_expenses"),
  ]);

  // Nómina estimada por semana = promedio_30d / 4 (≈ semanal)
  const estimatedPayrollWeekly = toNumOrZero(personalExpenses._sum.amount) / 4;
  // Otros gastos fijos (renta, luz, agua) por semana
  const settingWeekly =
    typeof weeklyFixedSetting === "number" && weeklyFixedSetting > 0
      ? weeklyFixedSetting
      : null;
  const recurringWeekly =
    settingWeekly ?? toNumOrZero(recurringExpenses._sum.amount) / 4;

  // ── Bucket por semana ────────────────────────────────────────────────
  const weeks: WeekRow[] = [];
  let runningBalance = startingBalance;
  let criticalWeek: number | null = null;

  for (let w = 0; w < 13; w++) {
    const wStart = addDays(firstWeekStart, w * 7);
    const wEnd = endOfWeekSunday(wStart);

    const inWindow = (d: Date | null | undefined): boolean => {
      if (!d) return false;
      return d >= wStart && d <= wEnd;
    };

    const expectedCollections = pendingOrders
      .filter((o) => inWindow(o.createdAt))
      .reduce((s, o) => s + toNumOrZero(o.total), 0);

    const creditCollections = activeFiados
      .filter((f) => inWindow(f.fechaVence))
      .reduce((s, f) => s + toNumOrZero(f.saldo), 0);

    const supplierPayments = pendingPayables
      .filter((p) => inWindow(p.dueDate))
      .reduce(
        (s, p) => s + (toNumOrZero(p.amount) - toNumOrZero(p.paidAmount)),
        0,
      );

    const loans = loanInstallments
      .filter((c) => inWindow(c.fechaVence))
      .reduce((s, c) => s + toNumOrZero(c.monto), 0);

    const payroll = estimatedPayrollWeekly;
    const otherExpenses = recurringWeekly;

    const openingBalance = runningBalance;
    const closingBalance = round2(
      openingBalance +
        expectedCollections +
        creditCollections -
        supplierPayments -
        payroll -
        loans -
        otherExpenses,
    );

    const isNegative = closingBalance < 0;
    if (isNegative && criticalWeek === null) {
      criticalWeek = w + 1;
    }

    weeks.push({
      weekNumber: w + 1,
      weekStart: wStart.toISOString(),
      weekEnd: wEnd.toISOString(),
      openingBalance: round2(openingBalance),
      expectedCollections: round2(expectedCollections),
      creditCollections: round2(creditCollections),
      supplierPayments: round2(supplierPayments),
      payroll: round2(payroll),
      loans: round2(loans),
      otherExpenses: round2(otherExpenses),
      closingBalance,
      isNegative,
    });

    runningBalance = closingBalance;
  }

  return {
    tenantId,
    generatedAt: now.toISOString(),
    startingBalance: round2(startingBalance),
    weeks,
    criticalWeek,
  };
}

// ── Backwards-compat shim ──────────────────────────────────────────────────
// El componente antiguo (CashFlowRolling.tsx) y los tests preexistentes
// importaban `calculateRollingCashflow` con un shape más simple. Mantenemos
// el nombre exportado como alias, traduciendo al nuevo contract.
//
// @deprecated — usa `computeCashflowRolling` directamente.

export type CashflowWeek = WeekRow;
export type CashflowResult = CashflowRollingResult;

export async function calculateRollingCashflow(
  tenantId: string,
  _weeks: number = 13,
): Promise<CashflowRollingResult> {
  // `_weeks` se ignora — la proyección rodante siempre es 13 (estándar FP&A).
  return computeCashflowRolling(tenantId);
}
