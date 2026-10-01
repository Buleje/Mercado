import "server-only";
import { toNumOrZero } from "@/lib/decimal-utils";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { ResultadoNegocioDB } from "@/lib/db/resultado-negocio.db";
import { limaDateKey } from "@/lib/utils";

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
//
// ADR-451 (2026-09-29): las lecturas viven en `ResultadoNegocioDB.proyeccion`
// (antes eran `prisma.*` sueltos acá) y el resultado SUMA campos sin tocar los
// que ya existían: adelantos que vencen en cada semana, de dónde sale la nómina,
// de dónde sale el saldo inicial y lo que no cae en ninguna semana. Ninguno de
// los campos nuevos entra en `closingBalance`: la tabla vieja da lo mismo.
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
  /**
   * Nómina estimada para esta semana (S/ por semana). ADR-451: AUSENTE (no 0)
   * para quien no ve lo ganado de RRHH (`payrollFuente: "sin_permiso"`); el
   * cierre de la semana la sigue restando.
   */
  payroll?: number;
  /** Cuotas de préstamos (PrestamoCuota) con fechaVence en la semana */
  loans: number;
  /** Otros gastos fijos recurrentes distribuidos por semana */
  otherExpenses: number;
  /**
   * ADR-451: saldo de adelantos DADOS abiertos que vencen en la semana. Se
   * informa aparte y NO entra en `closingBalance` (el cierre no cambia).
   */
  advanceCollections: number;
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
  /** ADR-451: el mismo `startingBalance`, diciendo de dónde sale. */
  saldoInicial: {
    monto: number;
    /** `tesoreria` = saldo de las cuentas; `neto_30_dias` = ventas − gastos de 30 días (≈). */
    fuente: "tesoreria" | "neto_30_dias";
    estimado: boolean;
  };
  /** ADR-451: de dónde sale `payroll` — los gastos de «personal» de 30 días, o nada. */
  payrollFuente: "gastos_personal" | "sin_dato" | "sin_permiso";
  /**
   * ADR-451: ≈ lo ganado por semana según la asistencia de RRHH (últimos 28
   * días ÷ 4). Referencia al lado de `payroll`; `null` = sin personal cargado.
   */
  payrollRrhhSemanal?: number | null;
  /** ADR-451: adelantos DADOS abiertos que vencen dentro de las 13 semanas. */
  adelantosConVencimiento: { monto: number; cuantos: number };
  /**
   * ADR-451: lo que no cae en ninguna semana — sin fecha pactada o ya vencido
   * antes de la ventana. No se reparte por semanas.
   */
  sinFecha: { porCobrar: number; cuantosPorCobrar: number; porPagar: number; cuantosPorPagar: number };
  /**
   * ADR-451: `true` = quien pide no ve lo ganado de RRHH, así que el cierre de
   * cada semana (y `criticalWeek`) se calcula SIN nómina: no hay sueldo que
   * deducir restando filas. `false` = el cierre de siempre.
   */
  cierreSinNomina: boolean;
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
async function getStartingBalance(
  tenantId: string,
): Promise<{ monto: number; fuente: "tesoreria" | "neto_30_dias" }> {
  const treasury = await ResultadoNegocioDB.proyeccion.saldosTesoreria(tenantId);

  if (treasury.length > 0) {
    return { monto: round2(treasury.reduce((sum, a) => sum + toNumOrZero(a.saldo), 0)), fuente: "tesoreria" };
  }

  // Fallback grueso: neto de los últimos 30 días
  const thirtyDaysAgo = addDays(new Date(), -30);
  const { ventas, gastos } = await ResultadoNegocioDB.proyeccion.netoDesde(tenantId, thirtyDaysAgo);
  return { monto: round2(ventas - gastos), fuente: "neto_30_dias" };
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
  /** ADR-451: `verPlanilla` = quien pide ve lo ganado de RRHH. Por defecto NO. */
  opciones: { verPlanilla?: boolean } = {},
): Promise<CashflowRollingResult> {
  const verPlanilla = opciones.verPlanilla === true;
  if (!tenantId) {
    throw new Error("tenantId is required for cashflow projection");
  }

  const now = new Date();
  const firstWeekStart = startOfWeekMonday(now);
  const windowEnd = addDays(firstWeekStart, 13 * 7);

  // ── Parallel fetch ───────────────────────────────────────────────────
  const hoyLima = limaDateKey(now);
  const [
    saldo,
    pendingOrders,
    activeFiados,
    pendingPayables,
    loanInstallments,
    personalExpenses,
    recurringExpenses,
    weeklyFixedSetting,
    adelantosAbiertos,
    fiadosSinFecha,
    payablesVencidos,
    ganado28d,
  ] = await Promise.all([
    getStartingBalance(tenantId),

    // 1. Cobros esperados: orders pendientes en la ventana
    ResultadoNegocioDB.proyeccion.pedidosPendientes(tenantId, firstWeekStart, windowEnd),

    // 2. Fiados vigentes con fechaVence en la ventana
    ResultadoNegocioDB.proyeccion.fiadosQueVencen(tenantId, firstWeekStart, windowEnd),

    // 3. Payables con dueDate en la ventana
    ResultadoNegocioDB.proyeccion.payablesQueVencen(tenantId, firstWeekStart, windowEnd),

    // 4. Cuotas de préstamos pendientes — join manual por prestamo.tenantId
    ResultadoNegocioDB.proyeccion.cuotasQueVencen(tenantId, firstWeekStart, windowEnd),

    // 5. Nómina aproximada — category=personal últimos 30 días (promedio)
    // Sin permiso de RRHH ni se consulta: la nómina no entra en ningún número.
    verPlanilla ? ResultadoNegocioDB.proyeccion.gastoPersonalDesde(tenantId, addDays(now, -30)) : Promise.resolve(0),

    // 6. Gastos fijos recurrentes (alquiler, servicios) últimos 30 días
    ResultadoNegocioDB.proyeccion.gastoRecurrenteDesde(tenantId, addDays(now, -30)),

    // 7. Override manual desde platform settings (opcional)
    PlatformSettingsDB.get<number>("estimated_weekly_fixed_expenses"),

    // ── ADR-451: campos nuevos, fuera del cierre de cada semana ─────────
    ResultadoNegocioDB.proyeccion.adelantosAbiertos(tenantId),
    ResultadoNegocioDB.proyeccion.fiadosFueraDeLaVentana(tenantId, firstWeekStart),
    ResultadoNegocioDB.proyeccion.payablesVencidosAntes(tenantId, firstWeekStart),
    verPlanilla ? ResultadoNegocioDB.proyeccion.ganadoRrhh(tenantId, limaDateKey(addDays(now, -27)), hoyLima) : Promise.resolve(null),
  ]);
  const startingBalance = saldo.monto;

  // Nómina estimada por semana = promedio_30d / 4 (≈ semanal)
  const estimatedPayrollWeekly = personalExpenses / 4;
  // Otros gastos fijos (renta, luz, agua) por semana
  const settingWeekly =
    typeof weeklyFixedSetting === "number" && weeklyFixedSetting > 0
      ? weeklyFixedSetting
      : null;
  const recurringWeekly =
    settingWeekly ?? recurringExpenses / 4;

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

    // ADR-451: sin permiso de RRHH el cierre va sin nómina (rotulado `cierreSinNomina`).
    const payroll = verPlanilla ? estimatedPayrollWeekly : 0;
    const otherExpenses = recurringWeekly;

    // ADR-451: informativo, no entra en el cierre.
    const advanceCollections = adelantosAbiertos
      .filter((a) => inWindow(a.fechaVencimiento))
      .reduce((s, a) => s + toNumOrZero(a.saldoPendiente), 0);

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
      ...(verPlanilla ? { payroll: round2(payroll) } : {}),
      loans: round2(loans),
      otherExpenses: round2(otherExpenses),
      advanceCollections: round2(advanceCollections),
      closingBalance,
      isNegative,
    });

    runningBalance = closingBalance;
  }

  const payrollFuente: CashflowRollingResult["payrollFuente"] = !verPlanilla
    ? "sin_permiso"
    : personalExpenses > 0
      ? "gastos_personal"
      : "sin_dato";

  // ADR-451: lo que ninguna semana muestra.
  const enVentana = adelantosAbiertos.filter(
    (a) => a.fechaVencimiento != null && a.fechaVencimiento >= firstWeekStart && a.fechaVencimiento < windowEnd,
  );
  const adelantosFuera = adelantosAbiertos.filter((a) => a.fechaVencimiento == null || a.fechaVencimiento < firstWeekStart);

  return {
    tenantId,
    generatedAt: now.toISOString(),
    startingBalance: round2(startingBalance),
    weeks,
    criticalWeek,
    saldoInicial: { monto: round2(startingBalance), fuente: saldo.fuente, estimado: saldo.fuente !== "tesoreria" },
    payrollFuente,
    cierreSinNomina: !verPlanilla,
    ...(verPlanilla ? { payrollRrhhSemanal: ganado28d == null ? null : round2(ganado28d / 4) } : {}),
    adelantosConVencimiento: {
      monto: round2(enVentana.reduce((s, a) => s + toNumOrZero(a.saldoPendiente), 0)),
      cuantos: enVentana.length,
    },
    sinFecha: {
      porCobrar: round2(fiadosSinFecha.monto + adelantosFuera.reduce((s, a) => s + toNumOrZero(a.saldoPendiente), 0)),
      cuantosPorCobrar: fiadosSinFecha.cuantos + adelantosFuera.length,
      porPagar: payablesVencidos.monto,
      cuantosPorPagar: payablesVencidos.cuantos,
    },
  };
}
