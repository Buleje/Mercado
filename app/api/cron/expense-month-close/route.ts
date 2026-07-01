import { NextRequest, NextResponse } from "next/server";
import { withCronHealth } from "@/lib/cron/with-cron-health";
import { withCronRetry } from "@/lib/cron-retry";
import { PlatformExpensesDB } from "@/lib/db/platform-expenses.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/expense-month-close
 *
 * Vercel Cron mensual (día 1). Congela el gasto del MES ANTERIOR en el historial
 * de gastos de plataforma, para que meses ya cerrados dejen de proyectarse desde
 * el recurrente de hoy — aun si ese mes no tuvo altas/bajas (las mutaciones ya
 * congelan el mes en curso; esto cierra el gap de meses 100% pasivos).
 *
 * Autorización: Bearer <CRON_SECRET> (vía withCronHealth).
 */
export const GET = withCronHealth("expense-month-close", async (_req: NextRequest) => {
  try {
    const month = await withCronRetry("expense-month-close", () =>
      PlatformExpensesDB.closePreviousMonth(),
    );
    logger.info("[cron/expense-month-close] mes cerrado", { month });
    return NextResponse.json({ ok: true, month });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
});
